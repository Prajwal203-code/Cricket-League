const router = require('express').Router();
const { getPool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { applyWalletDelta } = require('../services/userService');
const { getRules } = require('../config/liveRules');
const { freeReward } = require('../services/progression');

router.use(requireAuth);
router.get('/status', async (req, res, next) => {
    try {
        const rules = getRules();
        const [users] = await getPool().query('SELECT level FROM users WHERE id = ?', [req.userId]);
        if (!users.length) return res.status(404).json({ success: false, message: 'Account not found.' });
        const [rows] = await getPool().query('SELECT last_free_100_claim FROM free_rewards_status WHERE user_id = ?', [req.userId]);
        const lastFreeClaim = Number(rows[0]?.last_free_100_claim) || 0;
        const reward = freeReward(users[0].level, rules);
        const nextFreeAt = lastFreeClaim ? lastFreeClaim + rules.free.cooldownMs : 0;
        res.json({ success: true, status: { lastFreeClaim, nextFreeAt, serverNow: Date.now(),
            canClaimFree: Date.now() >= nextFreeAt, freeCoins: reward.coins, freeXp: reward.xp,
            level: users[0].level, rulesVersion: rules.version, adsAvailable: false } });
    } catch (error) { next(error); }
});

router.post('/claim-free', async (req, res, next) => {
    let conn;
    try {
        conn = await getPool().getConnection();
        const rules = getRules();
        await conn.beginTransaction();
        // Lock the account first, including the very first claim when no status row exists.
        const [users] = await conn.query('SELECT level FROM users WHERE id = ? FOR UPDATE', [req.userId]);
        if (!users.length) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Account not found.' }); }
        const [rows] = await conn.query('SELECT last_free_100_claim FROM free_rewards_status WHERE user_id = ? FOR UPDATE', [req.userId]);
        const last = Number(rows[0]?.last_free_100_claim) || 0;
        const now = Date.now();
        if (last && now - last < rules.free.cooldownMs) {
            await conn.rollback();
            return res.status(429).json({ success: false, code: 'ON_COOLDOWN', message: 'Your next reward is not ready yet.', nextFreeAt: last + rules.free.cooldownMs });
        }
        const reward = freeReward(users[0].level, rules);
        await conn.query(`INSERT INTO free_rewards_status (user_id, last_free_100_claim, current_ad_step) VALUES (?, ?, 1)
            ON DUPLICATE KEY UPDATE last_free_100_claim = VALUES(last_free_100_claim)`, [req.userId, now]);
        const result = await applyWalletDelta(req.userId, { ...reward, reason: 'free_reward' }, conn, rules);
        await conn.commit();
        res.json({ success: true, coinsAwarded: reward.coins, xpAwarded: reward.xp,
            lastFreeClaim: now, nextFreeAt: now + rules.free.cooldownMs, serverNow: now,
            balance: result.user.coins, updatedUser: result.user, ...result,
            message: `+${reward.coins} coins and +${reward.xp} XP collected.` });
    } catch (error) { if (conn) await conn.rollback(); next(error); }
    finally { conn?.release(); }
});
module.exports = router;
