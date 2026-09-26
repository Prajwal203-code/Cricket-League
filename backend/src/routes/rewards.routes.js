/**
 * Free and rewarded-ad coin claims.
 *
 * The cooldown these endpoints advertise is now also enforced here. Previously
 * `/claim-free` wrote a new timestamp and paid out on every call without ever
 * reading the old one, so the "once per 24 hours" reward could be claimed in a
 * loop for unlimited coins.
 */
const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { applyWalletDelta } = require('../services/userService');
const { REWARDS } = require('../config/gameRules');

router.use(requireAuth);

async function readStatus(userId) {
    const [rows] = await getPool().query(
        'SELECT * FROM free_rewards_status WHERE user_id = ?',
        [userId]
    );
    return rows[0] || { last_free_100_claim: 0, current_ad_step: 1, last_ad_step_claim: 0 };
}

/** GET /api/rewards/status */
router.get('/status', async (req, res, next) => {
    try {
        const status = await readStatus(req.userId);
        const lastFree = Number(status.last_free_100_claim) || 0;
        const nextFreeAt = lastFree + REWARDS.freeCooldownMs;

        res.json({
            success: true,
            status: {
                lastFreeClaim: lastFree,
                currentAdStep: status.current_ad_step,
                canClaimFree: Date.now() >= nextFreeAt,
                nextFreeAt,
                freeCoins: REWARDS.freeCoins,
                adStepCoins: REWARDS.adStepCoins
            }
        });
    } catch (err) {
        next(err);
    }
});

/** POST /api/rewards/claim-free */
router.post('/claim-free', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Locked read, so two simultaneous requests cannot both pass the check.
        const [rows] = await conn.query(
            'SELECT last_free_100_claim FROM free_rewards_status WHERE user_id = ? FOR UPDATE',
            [req.userId]
        );

        const lastClaim = rows.length > 0 ? Number(rows[0].last_free_100_claim) || 0 : 0;
        const now = Date.now();

        if (now - lastClaim < REWARDS.freeCooldownMs) {
            await conn.rollback();
            return res.status(429).json({
                success: false,
                code: 'ON_COOLDOWN',
                message: 'Your next free reward is not ready yet.',
                nextFreeAt: lastClaim + REWARDS.freeCooldownMs
            });
        }

        await conn.query(`
            INSERT INTO free_rewards_status (user_id, last_free_100_claim, current_ad_step)
            VALUES (?, ?, 1)
            ON DUPLICATE KEY UPDATE last_free_100_claim = VALUES(last_free_100_claim)
        `, [req.userId, now]);

        const result = await applyWalletDelta(req.userId, {
            coins: REWARDS.freeCoins,
            xp: REWARDS.freeXp
        }, conn);

        await conn.commit();

        res.json({
            success: true,
            coinsAwarded: REWARDS.freeCoins,
            xpAwarded: REWARDS.freeXp,
            lastFreeClaim: now,
            nextFreeAt: now + REWARDS.freeCooldownMs,
            balance: result ? result.user.coins : null,
            message: `🎉 +${REWARDS.freeCoins} Free Coins Claimed!`
        });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

module.exports = router;
