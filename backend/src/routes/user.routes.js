const express = require('express');
const router = express.Router();
const { getPool, syncUserSquadForCountry, getStartingSquadForCountry } = require('../config/db');

// GET /api/user/profile from MySQL database
router.get('/profile', async (req, res) => {
    try {
        const pool = getPool();
        const userId = req.query.userId || 1;
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = users[0];
        const userCountry = user.country_code || 'IN';
        const squadInfo = getStartingSquadForCountry(userCountry);
        const [cards] = await pool.query('SELECT * FROM squad_cards WHERE user_id = ? ORDER BY batting_order ASC, level DESC', [userId]);

        let characterConfig = null;
        try { characterConfig = user.character_config ? JSON.parse(user.character_config) : null; } catch (e) { characterConfig = null; }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                country_code: userCountry,
                country_flag: squadInfo.countryInfo.flag,
                country_name: squadInfo.countryInfo.name,
                is_major_country: squadInfo.countryInfo.isMajor,
                star_rating: user.level * 6,
                level: user.level,
                xp: user.xp,
                max_xp: Math.round(50 * Math.pow(user.level, 1.35)),
                coins: user.coins,
                gems: user.gems,
                trophies: user.trophies,
                matches_played: user.matches_played,
                matches_won: user.matches_won,
                total_sixes: user.total_sixes,
                referral_code: user.referral_code,
                auth_provider: user.auth_provider,
                is_guest: user.is_guest,
                character_config: characterConfig,
                squad: cards
            }
        });
    } catch (err) {
        console.error('SQL Error in user profile route:', err.message);
        res.status(500).json({ success: false, message: 'Database error fetching profile' });
    }
});

// POST /api/user/set-country in MySQL
router.post('/set-country', async (req, res) => {
    try {
        const { countryCode, userId, resetSquad } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();
        const code = (countryCode || 'IN').toUpperCase();

        await pool.query('UPDATE users SET country_code = ? WHERE id = ?', [code, activeUserId]);

        let squadData = null;
        if (resetSquad !== false) {
            squadData = await syncUserSquadForCountry(activeUserId, code);
        } else {
            squadData = getStartingSquadForCountry(code);
        }

        res.json({
            success: true,
            message: `Country updated to ${squadData.countryInfo.name} ${squadData.countryInfo.flag}`,
            countryInfo: squadData.countryInfo,
            countryCode: code
        });
    } catch (err) {
        console.error('SQL Error in set-country:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/user/update-wallet in MySQL
router.post('/update-wallet', async (req, res) => {
    try {
        const { coins, gems, xp, level, sixes, won, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        await pool.query(`
            UPDATE users 
            SET coins = COALESCE(?, coins),
                gems = COALESCE(?, gems),
                xp = COALESCE(?, xp),
                level = COALESCE(?, level),
                total_sixes = total_sixes + COALESCE(?, 0),
                matches_played = matches_played + 1,
                matches_won = matches_won + IF(? = 1, 1, 0)
            WHERE id = ?
        `, [coins, gems, xp, level, sixes, won, activeUserId]);

        res.json({ success: true, message: 'Wallet updated in SQL' });
    } catch (err) {
        console.error('SQL Error in update-wallet:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/user/sync-guest-data (Backs up all phone storage data to MySQL DB upon login)
router.post('/sync-guest-data', async (req, res) => {
    try {
        const { coins, gems, trophies, level, countryCode, unlockedBallSkins, equippedBallId, userId } = req.body;
        const activeUserId = userId || req.session?.userId || 1;
        const pool = getPool();

        // 1. Update User Stats in MySQL
        await pool.query(`
            UPDATE users
            SET coins = COALESCE(?, coins),
                gems = COALESCE(?, gems),
                trophies = COALESCE(?, trophies),
                level = COALESCE(?, level),
                country_code = COALESCE(?, country_code)
            WHERE id = ?
        `, [coins, gems, trophies, level, countryCode, activeUserId]);

        // 2. Backup Local Ball Skins to MySQL
        if (Array.isArray(unlockedBallSkins)) {
            for (const skinId of unlockedBallSkins) {
                const isEq = (skinId === equippedBallId) ? 1 : 0;
                await pool.query(
                    `INSERT IGNORE INTO user_ball_skins (user_id, skin_id, price_paid, is_equipped) VALUES (?, ?, 0, ?)`,
                    [activeUserId, skinId, isEq]
                );
            }
        }

        if (equippedBallId) {
            await pool.query(`UPDATE user_ball_skins SET is_equipped = 0 WHERE user_id = ?`, [activeUserId]);
            await pool.query(`UPDATE user_ball_skins SET is_equipped = 1 WHERE user_id = ? AND skin_id = ?`, [activeUserId, equippedBallId]);
        }

        // Fetch updated profile
        const [users] = await pool.query('SELECT coins, gems, trophies, level, country_code FROM users WHERE id = ?', [activeUserId]);

        return res.json({
            success: true,
            message: 'All local phone data backed up to SQL DB successfully!',
            user: users[0]
        });
    } catch (err) {
        console.error('SQL Sync Error in sync-guest-data:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/user/appearance — persist the 3D character customization config (mirrors update-wallet)
router.post('/appearance', async (req, res) => {
    try {
        const { config, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        await pool.query(
            'UPDATE users SET character_config = ? WHERE id = ?',
            [JSON.stringify(config || {}), activeUserId]
        );

        res.json({ success: true, message: 'Character appearance saved to SQL' });
    } catch (err) {
        console.error('SQL Error in appearance route:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
