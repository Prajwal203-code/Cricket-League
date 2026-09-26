/**
 * Weekend club wars.
 *
 * Dog tags are awarded by the server when a club member wins a match (see
 * services/clubWarService, called from match settlement). The old
 * `POST /contribute` took both the player id *and* the number of tags from the
 * request body, so any client could award its club an arbitrary score; no
 * client ever called it. It is gone.
 */
const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getOrCreateActiveWar } = require('../services/clubWarService');
const { CLUB_WAR } = require('../config/gameRules');

router.use(requireAuth);

/** GET /api/clubwars/status */
router.get('/status', async (req, res, next) => {
    try {
        const pool = getPool();
        const war = await getOrCreateActiveWar();

        const [memRows] = await pool.query(`
            SELECT cm.club_id, c.club_name, c.badge_icon, c.tag, c.total_trophies,
                   IFNULL(cws.dog_tags, 0) AS club_dog_tags
              FROM club_members cm
              JOIN clubs c ON cm.club_id = c.id
              LEFT JOIN club_war_scores cws ON cws.club_id = c.id AND cws.war_id = ?
             WHERE cm.user_id = ?
        `, [war.id, req.userId]);

        const [leaderboard] = await pool.query(`
            SELECT c.id AS club_id, c.club_name, c.badge_icon, c.tag, c.member_count,
                   IFNULL(cws.dog_tags, 0) AS dog_tags
              FROM clubs c
              LEFT JOIN club_war_scores cws ON cws.club_id = c.id AND cws.war_id = ?
             ORDER BY dog_tags DESC, c.total_trophies DESC
             LIMIT 20
        `, [war.id]);

        res.json({
            success: true,
            warId: war.id,
            warName: war.name,
            // Computed from the war's real end date; this used to be the
            // fixed string "2d 14h 30m" for every request, forever.
            endsAt: war.endsAt,
            remainingMs: war.remainingMs,
            dogTagsPerWin: CLUB_WAR.dogTagsPerWin,
            myClubWarInfo: memRows[0] || null,
            prizes: CLUB_WAR.prizes,
            leaderboard: leaderboard.map((row, idx) => ({ ...row, rank: idx + 1 }))
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
