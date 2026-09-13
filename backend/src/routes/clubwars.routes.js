const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// GET /api/clubwars/status
router.get('/status', async (req, res) => {
    try {
        const userId = parseInt(req.query.userId || 1, 10);
        const pool = getPool();

        // 1. Get or create active weekend war
        let warId = 1;
        const now = new Date();
        const [wars] = await pool.query('SELECT * FROM club_wars WHERE is_active = 1 LIMIT 1');

        if (wars.length > 0) {
            warId = wars[0].id;
        } else {
            const endDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
            const [insertWar] = await pool.query(`
                INSERT INTO club_wars (war_number, name, start_date, end_date, is_active)
                VALUES (1, 'Weekend Glory War #1 🏆', NOW(), ?, 1)
            `, [endDate]);
            warId = insertWar.insertId;
        }

        // 2. Fetch User's Club & User Dog Tags Contribution
        let myClubWarInfo = null;
        if (pool && userId) {
            const [memRows] = await pool.query(`
                SELECT cm.club_id, c.club_name, c.badge_icon, c.tag, c.total_trophies,
                       IFNULL(cws.dog_tags, 0) as club_dog_tags
                FROM club_members cm
                JOIN clubs c ON cm.club_id = c.id
                LEFT JOIN club_war_scores cws ON cws.club_id = c.id AND cws.war_id = ?
                WHERE cm.user_id = ?
            `, [warId, userId]);

            if (memRows.length > 0) {
                myClubWarInfo = memRows[0];
            }
        }

        // 3. Fetch Top 20 Global Club War Leaderboard
        const [leaderboard] = await pool.query(`
            SELECT c.id as club_id, c.club_name, c.badge_icon, c.tag, c.member_count,
                   IFNULL(cws.dog_tags, 0) as dog_tags
            FROM clubs c
            LEFT JOIN club_war_scores cws ON cws.club_id = c.id AND cws.war_id = ?
            ORDER BY dog_tags DESC, c.total_trophies DESC
            LIMIT 20
        `, [warId]);

        res.json({
            success: true,
            warId,
            warName: 'Weekend Guild Glory Tournament ⚔️',
            timeRemaining: '2d 14h 30m',
            dogTagBonus: '+10 Dog Tags per match win',
            myClubWarInfo,
            prizes: [
                { rank: '1st 🥇', reward: '50,000 💎 + Gold Trophy 🏆' },
                { rank: '2nd 🥈', reward: '25,000 💎 + Silver Trophy 🥈' },
                { rank: '3rd 🥉', reward: '10,000 💎 + Bronze Trophy 🥉' },
                { rank: 'Top 10', reward: '5,000 💎 + Master Chests 🎁' }
            ],
            leaderboard
        });
    } catch (err) {
        console.error('Error in club wars status:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubwars/contribute (Awards dog tags upon match win)
router.post('/contribute', async (req, res) => {
    try {
        const { userId, tags } = req.body;
        const activeUserId = parseInt(userId || 1, 10);
        const addedTags = parseInt(tags || 10, 10);
        const pool = getPool();

        const [memRows] = await pool.query('SELECT club_id FROM club_members WHERE user_id = ?', [activeUserId]);
        if (memRows.length === 0) {
            return res.json({ success: false, message: 'Player is not in a club' });
        }

        const clubId = memRows[0].club_id;
        const [wars] = await pool.query('SELECT id FROM club_wars WHERE is_active = 1 LIMIT 1');
        const warId = wars.length > 0 ? wars[0].id : 1;

        // Upsert dog tags
        await pool.query(`
            INSERT INTO club_war_scores (war_id, club_id, dog_tags)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE dog_tags = dog_tags + ?
        `, [warId, clubId, addedTags, addedTags]);

        res.json({
            success: true,
            addedTags,
            message: `🎉 +${addedTags} Guild Glory Dog Tags earned for your Club!`
        });
    } catch (err) {
        console.error('Error contributing to club wars:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
