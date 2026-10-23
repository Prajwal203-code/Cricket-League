/**
 * Seven-day login streak.
 *
 * Changes from the previous version:
 *  - identity comes from the session, not `req.query.userId || 1`
 *  - `/status` no longer writes: it resolved *and persisted* the next streak day
 *    on a GET, so a page refresh could advance state the player never claimed.
 *    Streak progression is now computed from `last_login_date` and only written
 *    by `/claim`.
 *  - `/claim` locks the streak row, closing the window where two concurrent
 *    requests both passed the "already claimed today" check and paid out twice
 *  - the reward table moved to config/gameRules
 */
const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { applyWalletDelta } = require('../services/userService');
const { STREAK } = require('../config/gameRules');
const { getRules } = require('../config/liveRules');
const { levelMultiplier } = require('../services/progression');

router.use(requireAuth);

function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateToStr(val) {
    if (!val) return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
        return val.substring(0, 10);
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return getLocalDateString(d);
}

/** Whole days between two YYYY-MM-DD strings, calendar-wise. */
function computeDayDifference(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return 0;
    const [y1, m1, d1] = dateStr1.split('-').map(Number);
    const [y2, m2, d2] = dateStr2.split('-').map(Number);
    return Math.round((new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2)) / 86400000);
}

function safeParseDays(raw) {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed.filter(Number.isInteger) : [];
    } catch {
        return [];
    }
}

/**
 * Resolves what the streak looks like today, without writing anything.
 *
 * Pure so `/status` and `/claim` cannot disagree about which day is claimable:
 * `/claim` persists exactly what this returns.
 */
function resolveStreak(row, todayStr) {
    const stored = {
        currentDay: row ? (row.current_day || 1) : 1,
        claimedDays: row ? safeParseDays(row.claimed_days) : [],
        lastLoginDateStr: row ? parseDateToStr(row.last_login_date) : null
    };

    // Never claimed: day 1 is open.
    if (!stored.lastLoginDateStr) {
        return { currentDay: 1, claimedDays: [], canClaimToday: true, streakBroken: false };
    }

    const dayDiff = computeDayDifference(todayStr, stored.lastLoginDateStr);

    if (dayDiff === 0) {
        // Already claimed today; next reward unlocks at midnight.
        return { ...stored, canClaimToday: false, streakBroken: false };
    }

    if (dayDiff === 1) {
        // Claimed yesterday: the streak advances, wrapping after the last day.
        let currentDay = stored.currentDay;
        let claimedDays = stored.claimedDays;
        if (claimedDays.includes(currentDay)) {
            currentDay = currentDay >= STREAK.cycleDays ? 1 : currentDay + 1;
            if (currentDay === 1) claimedDays = [];
        }
        return { currentDay, claimedDays, canClaimToday: true, streakBroken: false };
    }

    // A day or more was missed: back to the start.
    return { currentDay: 1, claimedDays: [], canClaimToday: true, streakBroken: true };
}

/** Gem rewards scale with level; coins do not. */
function gemBonusForLevel(level) {
    return Math.floor((Math.max(1, level) - 1) / STREAK.gemBonusPerLevels);
}

function rewardForDay(dayDef, level, rules) {
    const bonus = gemBonusForLevel(level);
    return {
        coins: Math.round((dayDef.baseCoins || 0) * levelMultiplier(level, rules)),
        gems: dayDef.baseGems > 0 ? dayDef.baseGems + bonus : 0
    };
}

function msUntilMidnight() {
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    return { at: nextMidnight.getTime(), ms: Math.max(0, nextMidnight.getTime() - Date.now()) };
}

/** GET /api/dailystreak/status — the calendar as it stands right now. */
router.get('/status', async (req, res, next) => {
    try {
        const pool = getPool();
        const todayStr = getLocalDateString();

        const [userRows] = await pool.query('SELECT level FROM users WHERE id = ? FOR UPDATE', [req.userId]);
        if (userRows.length === 0) {
            return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Account not found.' });
        }
        const userLevel = userRows[0].level || 1;
        const rules = getRules();

        const [rows] = await pool.query(
            'SELECT * FROM user_daily_streaks WHERE user_id = ?',
            [req.userId]
        );

        const state = resolveStreak(rows[0] || null, todayStr);

        const calendar = STREAK.days.map(d => {
            const reward = rewardForDay(d, userLevel, rules);
            const isToday = d.day === state.currentDay;
            return {
                day: d.day,
                icon: d.icon,
                label: [reward.coins ? `${reward.coins.toLocaleString()} Coins` : '', reward.gems ? `${reward.gems} Gems` : ''].filter(Boolean).join(' + '),
                pill: [reward.coins ? `+${reward.coins.toLocaleString()} coins` : '', reward.gems ? `+${reward.gems} gems` : ''].filter(Boolean).join(' / '),
                coins: reward.coins,
                gems: reward.gems,
                pack: null,
                isMega: !!d.isMega,
                isClaimed: state.claimedDays.includes(d.day),
                isToday,
                canClaim: isToday && state.canClaimToday,
                isLocked: d.day > state.currentDay
            };
        });

        const midnight = msUntilMidnight();

        res.json({
            success: true,
            userLevel,
            currentDay: state.currentDay,
            canClaimToday: state.canClaimToday,
            streakBroken: state.streakBroken,
            nextResetTimestamp: midnight.at,
            secondsUntilMidnight: Math.floor(midnight.ms / 1000),
            calendar
        });
    } catch (err) {
        next(err);
    }
});

/** POST /api/dailystreak/claim — collects today's reward, once. */
router.post('/claim', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const todayStr = getLocalDateString();
        await conn.beginTransaction();

        const [userRows] = await conn.query('SELECT level FROM users WHERE id = ? FOR UPDATE', [req.userId]);
        if (userRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Account not found.' });
        }
        const userLevel = userRows[0].level || 1;
        const rules = getRules();

        // Ensure a row exists so the lock below has something to hold. The
        // no-op update makes this safe to run concurrently.
        await conn.query(`
            INSERT INTO user_daily_streaks (user_id, current_day, last_login_date, claimed_days)
            VALUES (?, 1, NULL, '[]')
            ON DUPLICATE KEY UPDATE user_id = user_id
        `, [req.userId]);

        const [rows] = await conn.query(
            'SELECT * FROM user_daily_streaks WHERE user_id = ? FOR UPDATE',
            [req.userId]
        );

        const state = resolveStreak(rows[0], todayStr);
        if (!state.canClaimToday) {
            await conn.rollback();
            const midnight = msUntilMidnight();
            return res.status(429).json({
                success: false,
                code: 'ALREADY_CLAIMED_TODAY',
                nextResetTimestamp: midnight.at,
                message: "You have already claimed today's daily bonus! Next reward unlocks tonight at 12:00 AM."
            });
        }

        const dayDef = STREAK.days.find(d => d.day === state.currentDay) || STREAK.days[0];
        const reward = rewardForDay(dayDef, userLevel, rules);

        const claimedDays = state.claimedDays.includes(state.currentDay)
            ? state.claimedDays
            : [...state.claimedDays, state.currentDay];

        await conn.query(`
            UPDATE user_daily_streaks
               SET current_day = ?, last_login_date = ?, claimed_days = ?
             WHERE user_id = ?
        `, [state.currentDay, todayStr, JSON.stringify(claimedDays), req.userId]);

        const wallet = await applyWalletDelta(req.userId, {
            coins: reward.coins,
            gems: reward.gems, reason: 'daily_streak'
        }, conn, rules);

        await conn.commit();

        const parts = [];
        if (reward.coins > 0) parts.push(`+${reward.coins.toLocaleString()} 🪙`);
        if (reward.gems > 0) parts.push(`+${reward.gems} 💎`);
        const rewardText = parts.join(' ');

        res.json({
            success: true,
            day: state.currentDay,
            coins: wallet.user.coins,
            gems: wallet.user.gems,
            coinsAwarded: reward.coins,
            gemsAwarded: reward.gems,
            pack: null,
            rewardText,
            message: `Day ${state.currentDay} Bonus Collected: ${rewardText}!`
        });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

module.exports = router;
