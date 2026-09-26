/**
 * Leaderboards.
 *
 * The board itself is public; the caller's own rank and any pending season
 * reward are attached only when a session is present. Fixes carried in here:
 *  - the `league` tab ran a query with two placeholders and no parameters, so
 *    it threw on every request and fell into the catch below
 *  - that catch answered `success: true` with an empty leaderboard and an
 *    invented season, hiding the failure from the client entirely
 */
const express = require('express');
const router = express.Router();
const { getPool, COUNTRY_ROSTERS, NON_MAJOR_COUNTRIES } = require('../config/db');
const { optionalAuth } = require('../middleware/auth');
const { getActiveSeason, checkUserPendingSeasonReward, SEASON_PRIZES } = require('../services/seasonService');

const LEADERBOARD_LIMIT = 100;

function getCountryFlag(countryCode) {
    if (!countryCode) return '🌐';
    const code = countryCode.toUpperCase();
    if (COUNTRY_ROSTERS && COUNTRY_ROSTERS[code]) return COUNTRY_ROSTERS[code].flag;
    if (NON_MAJOR_COUNTRIES && NON_MAJOR_COUNTRIES[code]) return NON_MAJOR_COUNTRIES[code].flag;
    return '🌐';
}

function getCountryName(countryCode) {
    if (!countryCode) return 'Global';
    const code = countryCode.toUpperCase();
    if (COUNTRY_ROSTERS && COUNTRY_ROSTERS[code]) return COUNTRY_ROSTERS[code].name;
    if (NON_MAJOR_COUNTRIES && NON_MAJOR_COUNTRIES[code]) return NON_MAJOR_COUNTRIES[code].name;
    return code;
}

const RANKED_COLUMNS = `
    id, username AS name, trophies, level, country_code AS country, avatar
`;

/** Resolves the league band a trophy count falls into. */
async function getLeagueForTrophies(pool, trophies) {
    const [rows] = await pool.query(
        'SELECT * FROM leagues WHERE ? >= min_trophies AND ? <= max_trophies LIMIT 1',
        [trophies, trophies]
    );
    if (rows.length > 0) return rows[0];
    return { tier_name: 'Trainee League', badge_icon: '🥉', min_trophies: 0, max_trophies: 300 };
}

/**
 * GET /api/leaderboard?tab=country|world|alltime|league[&country=IN]
 */
router.get('/', optionalAuth, async (req, res, next) => {
    try {
        const pool = getPool();
        const tab = String(req.query.tab || 'country').toLowerCase();

        const activeSeason = await getActiveSeason();

        // Identity comes from the session when there is one. Signed-out
        // visitors still get a board, just without "your rank".
        let currentUser = null;
        if (req.userId) {
            const [userRows] = await pool.query(
                'SELECT id, username, trophies, level, country_code, avatar FROM users WHERE id = ?',
                [req.userId]
            );
            currentUser = userRows[0] || null;
        }

        const requestedCountry = req.query.country ? String(req.query.country).toUpperCase().slice(0, 10) : null;
        const userCountry = requestedCountry || currentUser?.country_code?.toUpperCase() || 'IN';
        const userTrophies = currentUser?.trophies ?? 0;

        let users = [];
        let scopeTitle = 'Country';
        let leagueInfo = null;

        if (tab === 'world') {
            scopeTitle = 'World';
            const [rows] = await pool.query(
                `SELECT ${RANKED_COLUMNS} FROM users ORDER BY trophies DESC, level DESC LIMIT ?`,
                [LEADERBOARD_LIMIT]
            );
            users = rows;
        } else if (tab === 'alltime' || tab === 'all-time' || tab === 'all_time') {
            scopeTitle = '👑 All Time';
            const [rows] = await pool.query(
                `SELECT ${RANKED_COLUMNS} FROM users ORDER BY trophies DESC, level DESC LIMIT ?`,
                [LEADERBOARD_LIMIT]
            );
            users = rows;
        } else if (tab === 'league') {
            leagueInfo = await getLeagueForTrophies(pool, userTrophies);
            scopeTitle = `${leagueInfo.badge_icon} ${leagueInfo.tier_name}`;

            // The bounds were missing here, which threw on every league request.
            const [rows] = await pool.query(
                `SELECT ${RANKED_COLUMNS} FROM users
                  WHERE trophies >= ? AND trophies <= ?
                  ORDER BY trophies DESC LIMIT ?`,
                [leagueInfo.min_trophies, leagueInfo.max_trophies, LEADERBOARD_LIMIT]
            );
            users = rows;
        } else {
            scopeTitle = `${getCountryFlag(userCountry)} ${getCountryName(userCountry)}`;
            const [rows] = await pool.query(
                `SELECT ${RANKED_COLUMNS} FROM users
                  WHERE UPPER(country_code) = ?
                  ORDER BY trophies DESC LIMIT ?`,
                [userCountry, LEADERBOARD_LIMIT]
            );
            users = rows;
        }

        let myRank = null;
        const leaderboard = users.map((u, idx) => {
            const rank = idx + 1;
            if (currentUser && u.id === currentUser.id) myRank = rank;
            return {
                rank,
                id: u.id,
                name: u.name,
                username: u.name,
                trophies: u.trophies || 0,
                level: u.level || 1,
                country: (u.country || 'IN').toUpperCase(),
                flag: getCountryFlag(u.country),
                avatar: u.avatar || '👤',
                isYou: Boolean(currentUser && u.id === currentUser.id)
            };
        });

        const recentReward = req.userId ? await checkUserPendingSeasonReward(req.userId) : null;

        res.json({
            success: true,
            tab,
            scopeTitle,
            countryCode: userCountry,
            countryFlag: getCountryFlag(userCountry),
            leagueInfo,
            season: {
                seasonNumber: activeSeason?.season_number || 1,
                name: activeSeason?.name || 'Season 1',
                endDate: activeSeason?.endDateISO || activeSeason?.end_date || null,
                remainingMs: activeSeason?.remainingMs ?? null,
                prizes: SEASON_PRIZES
            },
            leaderboard,
            userRank: myRank,
            recentReward
        });
    } catch (err) {
        // Previously this returned `success: true` with an empty board, so a
        // broken query looked to the client like "nobody has played yet".
        next(err);
    }
});

module.exports = router;
