const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// GET /api/rewards/status from MySQL
router.get('/status', async (req, res) => {
    try {
        const pool = getPool();
        const userId = req.query.userId || 1;
        const [rows] = await pool.query('SELECT * FROM free_rewards_status WHERE user_id = ?', [userId]);
        
        let status = rows.length > 0 ? rows[0] : { last_free_100_claim: 0, current_ad_step: 1 };

        res.json({
            success: true,
            status: {
                lastFreeClaim: Number(status.last_free_100_claim),
                currentAdStep: status.current_ad_step,
                canClaimFree: (Date.now() - Number(status.last_free_100_claim)) >= (24 * 3600 * 1000)
            }
        });
    } catch (err) {
        console.error('SQL Error in rewards status:', err.message);
        res.json({
            success: true,
            status: { lastFreeClaim: 0, currentAdStep: 1, canClaimFree: true }
        });
    }
});

// POST /api/rewards/claim-free in MySQL
router.post('/claim-free', async (req, res) => {
    try {
        const pool = getPool();
        const { userId } = req.body;
        const activeUserId = userId || 1;
        const now = Date.now();

        await pool.query(`
            INSERT INTO free_rewards_status (user_id, last_free_100_claim, current_ad_step)
            VALUES (?, ?, 1)
            ON DUPLICATE KEY UPDATE last_free_100_claim = ?
        `, [activeUserId, now, now]);

        await pool.query('UPDATE users SET coins = coins + 100, xp = xp + 10 WHERE id = ?', [activeUserId]);

        res.json({
            success: true,
            coinsAwarded: 100,
            xpAwarded: 10,
            lastFreeClaim: now,
            message: '🎉 +100 Free Coins Claimed!'
        });
    } catch (err) {
        console.error('SQL Error in rewards claim-free:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
