/**
 * Lucky spin wheel.
 *
 * The prize is drawn on the server and the cooldown is enforced against a
 * locked row, so a client cannot pick its own prize or spin in a loop. The
 * previous version read the cooldown without a lock, deducted gems and credited
 * the prize in three separate unsynchronised queries, and trusted `userId` from
 * the request.
 */
const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { applyWalletDelta } = require('../services/userService');
const { SPIN, weightedPick } = require('../config/gameRules');

router.use(requireAuth);

/** Prize faces without their weights — the odds table stays server-side. */
const PUBLIC_PRIZES = SPIN.prizes.map(({ weight, ...face }) => face);

/** GET /api/spin/status — wheel faces and the caller's cooldown. */
router.get('/status', async (req, res, next) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query(
            'SELECT last_spin_time, total_spins FROM user_lucky_spins WHERE user_id = ?',
            [req.userId]
        );

        const now = Date.now();
        const lastSpinTime = rows.length > 0 ? Number(rows[0].last_spin_time || 0) : 0;
        const totalSpins = rows.length > 0 ? Number(rows[0].total_spins || 0) : 0;

        const elapsed = now - lastSpinTime;
        const canSpinFree = elapsed >= SPIN.cooldownMs;

        res.json({
            success: true,
            canSpinFree,
            remainingMs: canSpinFree ? 0 : SPIN.cooldownMs - elapsed,
            nextSpinTime: canSpinFree ? now : lastSpinTime + SPIN.cooldownMs,
            cooldownHours: Math.round(SPIN.cooldownMs / 3600000),
            rerollGems: SPIN.rerollGems,
            totalSpins,
            prizes: PUBLIC_PRIZES
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/spin/roll — spins the wheel.
 *
 * Body: { useGems } — when the free spin is on cooldown, `useGems` pays for an
 * extra one. Everything else is derived server-side.
 */
router.post('/roll', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const useGems = req.body.useGems === true;
        await conn.beginTransaction();

        // Locking the cooldown row first serialises concurrent rolls, so the
        // same free spin cannot be claimed twice.
        const [rows] = await conn.query(
            'SELECT last_spin_time FROM user_lucky_spins WHERE user_id = ? FOR UPDATE',
            [req.userId]
        );

        if (rows.length === 0) {
            await conn.query(
                'INSERT INTO user_lucky_spins (user_id, last_spin_time, total_spins) VALUES (?, 0, 0)',
                [req.userId]
            );
        }

        const now = Date.now();
        const lastSpinTime = rows.length > 0 ? Number(rows[0].last_spin_time || 0) : 0;
        const elapsed = now - lastSpinTime;
        const isFreeSpin = elapsed >= SPIN.cooldownMs;

        if (!isFreeSpin) {
            if (!useGems) {
                await conn.rollback();
                const remainingMs = SPIN.cooldownMs - elapsed;
                return res.status(429).json({
                    success: false,
                    code: 'ON_COOLDOWN',
                    canSpinFree: false,
                    remainingMs,
                    nextSpinTime: lastSpinTime + SPIN.cooldownMs,
                    message: `⏳ Lucky Spin is on cooldown! Next free spin in ${Math.ceil(remainingMs / 3600000)} hours (or use ${SPIN.rerollGems} 💎 Gems).`
                });
            }

            const paid = await applyWalletDelta(req.userId, { gems: -SPIN.rerollGems }, conn);
            if (!paid) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    code: 'INSUFFICIENT_GEMS',
                    message: `You need ${SPIN.rerollGems} 💎 Gems for an extra spin!`
                });
            }
        }

        const { entry: prize, index: winningIndex } = weightedPick(SPIN.prizes);

        const wallet = await applyWalletDelta(req.userId, {
            coins: prize.type === 'coins' ? prize.amount : 0,
            gems: prize.type === 'gems' ? prize.amount : 0
        }, conn);

        if (!wallet) {
            await conn.rollback();
            return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Account not found.' });
        }

        // Only a free spin restarts the cooldown; a paid re-spin just counts.
        if (isFreeSpin) {
            await conn.query(`
                INSERT INTO user_lucky_spins (user_id, last_spin_time, total_spins)
                VALUES (?, ?, 1)
                ON DUPLICATE KEY UPDATE last_spin_time = VALUES(last_spin_time),
                                        total_spins = total_spins + 1
            `, [req.userId, now]);
        } else {
            await conn.query(
                'UPDATE user_lucky_spins SET total_spins = total_spins + 1 WHERE user_id = ?',
                [req.userId]
            );
        }

        await conn.commit();

        const nextSpinTime = isFreeSpin ? now + SPIN.cooldownMs : lastSpinTime + SPIN.cooldownMs;

        res.json({
            success: true,
            winningIndex,
            prize: {
                id: prize.id,
                label: prize.label,
                type: prize.type,
                amount: prize.amount || 0,
                name: prize.name || null,
                icon: prize.icon
            },
            newCoins: wallet.user.coins,
            newGems: wallet.user.gems,
            canSpinFree: false,
            remainingMs: Math.max(0, nextSpinTime - now),
            nextSpinTime,
            message: `🎉 You won ${prize.label}!`
        });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

module.exports = router;
