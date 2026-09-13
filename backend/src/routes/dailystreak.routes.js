const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

const STREAK_DAYS = [
    { day: 1, baseCoins: 500, baseGems: 0, pack: null, icon: '🪙', label: '500 Coins', pill: '+500 🪙' },
    { day: 2, baseCoins: 0, baseGems: 5, pack: null, icon: '💎', label: '5 Diamonds', pill: '+5 💎' },
    { day: 3, baseCoins: 1000, baseGems: 0, pack: 'Basic Pack', icon: '🎁', label: '1,000 Coins', pill: '+1,000 🪙' },
    { day: 4, baseCoins: 0, baseGems: 10, pack: null, icon: '💎', label: '10 Diamonds', pill: '+10 💎' },
    { day: 5, baseCoins: 2000, baseGems: 10, pack: null, icon: '⚡', label: '2,000 Coins + 10 💎', pill: '+2k 🪙 • +10 💎' },
    { day: 6, baseCoins: 0, baseGems: 15, pack: 'Elite Pack', icon: '👑', label: '15 Diamonds + Pack', pill: '+15 💎 • Pack' },
    { day: 7, baseCoins: 5000, baseGems: 25, pack: 'Mega God Vault', icon: '🏆', label: '5,000 🪙 + 25 💎 + 3D Skin', pill: '5k 🪙 • 25 💎 • 3D Ball', isMega: true }
];

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
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function computeDayDifference(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return 0;
    const [y1, m1, d1] = dateStr1.split('-').map(Number);
    const [y2, m2, d2] = dateStr2.split('-').map(Number);
    const date1 = new Date(y1, m1 - 1, d1);
    const date2 = new Date(y2, m2 - 1, d2);
    return Math.round((date1 - date2) / (1000 * 60 * 60 * 24));
}

// GET /api/dailystreak/status
router.get('/status', async (req, res) => {
    try {
        const userId = parseInt(req.query.userId || 1, 10);
        const pool = getPool();
        const todayStr = getLocalDateString();

        let streak = {
            current_day: 1,
            last_login_date: null,
            claimed_days: '[]'
        };
        let userLevel = 1;

        if (pool && userId) {
            const [userRows] = await pool.query('SELECT level FROM users WHERE id = ?', [userId]);
            if (userRows.length > 0) userLevel = userRows[0].level || 1;

            const [rows] = await pool.query('SELECT * FROM user_daily_streaks WHERE user_id = ?', [userId]);
            if (rows.length > 0) {
                streak = rows[0];
            } else {
                await pool.query('INSERT INTO user_daily_streaks (user_id, current_day, last_login_date, claimed_days) VALUES (?, 1, NULL, "[]")', [userId]);
            }
        }

        let claimedDays = JSON.parse(streak.claimed_days || '[]');
        let currentDay = streak.current_day || 1;
        const lastLoginDateStr = parseDateToStr(streak.last_login_date);

        let canClaimToday = false;
        let streakBroken = false;

        if (!lastLoginDateStr) {
            // First time ever: can claim Day 1
            currentDay = 1;
            claimedDays = [];
            canClaimToday = true;
        } else {
            const dayDiff = computeDayDifference(todayStr, lastLoginDateStr);

            if (dayDiff === 0) {
                // Claimed today: cannot claim again until tomorrow 12:00 AM
                canClaimToday = false;
            } else if (dayDiff === 1) {
                // Claimed yesterday: advance streak to next day!
                if (claimedDays.includes(currentDay)) {
                    currentDay = (currentDay >= 7) ? 1 : currentDay + 1;
                    if (currentDay === 1) claimedDays = [];
                    // Update in DB
                    if (pool && userId) {
                        await pool.query('UPDATE user_daily_streaks SET current_day = ?, claimed_days = ? WHERE user_id = ?', 
                            [currentDay, JSON.stringify(claimedDays), userId]);
                    }
                }
                canClaimToday = true;
            } else if (dayDiff >= 2) {
                // Missed one or more days: STREAK BROKEN! Reset to Day 1
                streakBroken = true;
                currentDay = 1;
                claimedDays = [];
                canClaimToday = true;
                // Update in DB
                if (pool && userId) {
                    await pool.query('UPDATE user_daily_streaks SET current_day = 1, last_login_date = NULL, claimed_days = "[]" WHERE user_id = ?', [userId]);
                }
            }
        }

        // Level bonus multiplier (+1 gem per 3 levels)
        const levelGemBonus = Math.floor((userLevel - 1) / 3);

        const calendar = STREAK_DAYS.map(d => {
            const isClaimed = claimedDays.includes(d.day);
            const isToday = (d.day === currentDay);
            const canClaim = isToday && canClaimToday;
            const isLocked = d.day > currentDay;

            const finalGems = d.baseGems > 0 ? (d.baseGems + levelGemBonus) : 0;
            const finalCoins = d.baseCoins > 0 ? d.baseCoins : 0;

            return {
                day: d.day,
                icon: d.icon,
                label: d.label,
                pill: d.baseGems > 0 ? `+${finalGems} 💎` : d.pill,
                coins: finalCoins,
                gems: finalGems,
                pack: d.pack,
                isMega: !!d.isMega,
                isClaimed,
                isToday,
                canClaim,
                isLocked
            };
        });

        const now = new Date();
        const nextMidnight = new Date();
        nextMidnight.setHours(24, 0, 0, 0);
        const msUntilMidnight = Math.max(0, nextMidnight.getTime() - now.getTime());
        const secondsUntilMidnight = Math.floor(msUntilMidnight / 1000);

        res.json({
            success: true,
            userLevel,
            currentDay,
            canClaimToday,
            streakBroken,
            nextResetTimestamp: nextMidnight.getTime(),
            secondsUntilMidnight,
            calendar
        });
    } catch (err) {
        console.error('Error fetching daily streak:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/dailystreak/claim
router.post('/claim', async (req, res) => {
    try {
        const { userId } = req.body;
        const activeUserId = parseInt(userId || 1, 10);
        const pool = getPool();
        const todayStr = getLocalDateString();

        const [userRows] = await pool.query('SELECT level, coins, gems FROM users WHERE id = ?', [activeUserId]);
        if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        const userLevel = userRows[0].level || 1;

        const [rows] = await pool.query('SELECT * FROM user_daily_streaks WHERE user_id = ?', [activeUserId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Streak record not found' });

        const streak = rows[0];
        const lastLoginDateStr = parseDateToStr(streak.last_login_date);

        if (lastLoginDateStr === todayStr) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already claimed today\'s daily bonus! Next reward unlocks tonight at 12:00 AM.' 
            });
        }

        const dayNum = streak.current_day || 1;
        const rewardDef = STREAK_DAYS.find(d => d.day === dayNum) || STREAK_DAYS[0];

        let claimedDays = JSON.parse(streak.claimed_days || '[]');
        if (!claimedDays.includes(dayNum)) claimedDays.push(dayNum);

        // Record claim for TODAY, keeping current_day as dayNum until tomorrow!
        await pool.query(`
            UPDATE user_daily_streaks 
            SET current_day = ?, 
                last_login_date = ?, 
                claimed_days = ? 
            WHERE user_id = ?
        `, [dayNum, todayStr, JSON.stringify(claimedDays), activeUserId]);

        // Level-based gem scaling
        const levelGemBonus = Math.floor((userLevel - 1) / 3);
        const coinsBonus = rewardDef.baseCoins || 0;
        const gemsBonus = rewardDef.baseGems > 0 ? (rewardDef.baseGems + levelGemBonus) : 0;

        if (coinsBonus > 0 || gemsBonus > 0) {
            await pool.query('UPDATE users SET coins = coins + ?, gems = gems + ? WHERE id = ?', [coinsBonus, gemsBonus, activeUserId]);
        }

        const [updatedUser] = await pool.query('SELECT coins, gems FROM users WHERE id = ?', [activeUserId]);

        res.json({
            success: true,
            day: dayNum,
            coins: updatedUser[0].coins,
            gems: updatedUser[0].gems,
            rewardText: `${coinsBonus > 0 ? `+${coinsBonus} 🪙 ` : ''}${gemsBonus > 0 ? `+${gemsBonus} 💎` : ''}`,
            message: `Day ${dayNum} Bonus Collected: ${coinsBonus > 0 ? `+${coinsBonus} Coins ` : ''}${gemsBonus > 0 ? `+${gemsBonus} Diamonds` : ''}!`
        });
    } catch (err) {
        console.error('Error claiming daily streak bonus:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
