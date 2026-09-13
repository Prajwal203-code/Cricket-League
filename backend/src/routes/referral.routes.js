const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// GET /api/referral/my-code from MySQL
router.get('/my-code', async (req, res) => {
    try {
        const pool = getPool();
        const userId = req.query.userId || 1;
        const [users] = await pool.query('SELECT username, referral_code FROM users WHERE id = ?', [userId]);
        
        let code = users.length > 0 && users[0].referral_code ? users[0].referral_code : `CRIC-${(users[0]?.username || 'PLAYER').toUpperCase()}-100`;

        const [claims] = await pool.query(`
            SELECT COUNT(*) as claimCount, COALESCE(SUM(coins_reward), 0) as totalCoins
            FROM referrals
            WHERE inviter_user_id = ?
        `, [userId]);

        res.json({
            success: true,
            code,
            rewardPerInvite: 1500,
            stats: {
                claimCount: claims[0].claimCount || 0,
                totalCoinsEarned: claims[0].totalCoins || 0
            }
        });
    } catch (err) {
        console.error('SQL Error in referral my-code:', err.message);
        res.json({
            success: true,
            code: 'CRIC-PLAYER-100',
            rewardPerInvite: 1500,
            stats: { claimCount: 0, totalCoinsEarned: 0 }
        });
    }
});

// GET /api/referral/verify from MySQL
router.get('/verify', async (req, res) => {
    try {
        const { ref } = req.query;
        if (!ref) {
            return res.status(400).json({ success: false, message: 'No referral code provided' });
        }

        const pool = getPool();
        const refUpper = ref.toUpperCase().trim();

        const [users] = await pool.query('SELECT id, username FROM users WHERE referral_code = ?', [refUpper]);
        let inviterName = users.length > 0 ? users[0].username : 'Teammate';

        if (users.length === 0 && refUpper.startsWith('CRIC-')) {
            const parts = refUpper.split('-');
            if (parts.length >= 2) inviterName = parts[1];
        }

        res.json({
            success: true,
            valid: true,
            code: refUpper,
            inviterName,
            rewardCoins: 1500,
            rewardXp: 50
        });
    } catch (err) {
        console.error('SQL Error in referral verify:', err.message);
        res.json({
            success: true,
            valid: true,
            code: req.query.ref || 'CRIC-JOIN-100',
            inviterName: 'Teammate',
            rewardCoins: 1500,
            rewardXp: 50
        });
    }
});

// POST /api/referral/claim into MySQL
router.post('/claim', async (req, res) => {
    try {
        const { ref, username, userId } = req.body;
        const pool = getPool();
        const refUpper = (ref || '').toUpperCase().trim();
        const activeUserId = userId || 1;

        // Check if already claimed
        const [existing] = await pool.query(`
            SELECT id FROM referrals 
            WHERE referral_code = ? AND (claimed_by_username = ? OR claimed_by_user_id = ?)
        `, [refUpper, username || 'Player', activeUserId]);

        if (existing.length > 0) {
            return res.json({
                success: false,
                alreadyClaimed: true,
                message: 'Referral reward has already been claimed!'
            });
        }

        // Find inviter user id
        const [inviters] = await pool.query('SELECT id FROM users WHERE referral_code = ?', [refUpper]);
        const inviterId = inviters.length > 0 ? inviters[0].id : activeUserId;

        // Insert referral claim record
        await pool.query(`
            INSERT INTO referrals (referral_code, inviter_user_id, claimed_by_user_id, claimed_by_username, coins_reward, xp_reward, status)
            VALUES (?, ?, ?, ?, 1500, 50, 'CLAIMED')
        `, [refUpper, inviterId, activeUserId, username || 'Player']);

        // Credit coins in SQL
        await pool.query(`
            UPDATE users SET coins = coins + 1500, xp = xp + 50 WHERE id = ?
        `, [activeUserId]);

        res.json({
            success: true,
            message: '🎉 Referral reward of 1,500 Coins & +50 XP successfully credited to your account!'
        });
    } catch (err) {
        console.error('SQL Error in referral claim:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
