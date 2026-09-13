const express = require('express');
const router = express.Router();
const { getPool, COUNTRY_ROSTERS, NON_MAJOR_COUNTRIES } = require('../config/db');
const { getActiveSeason, checkUserPendingSeasonReward, SEASON_PRIZES } = require('../services/seasonService');

// Helper to get country flag
function getCountryFlag(countryCode) {
    if (!countryCode) return '🌐';
    const code = countryCode.toUpperCase();
    if (COUNTRY_ROSTERS && COUNTRY_ROSTERS[code]) {
        return COUNTRY_ROSTERS[code].flag;
    }
    if (NON_MAJOR_COUNTRIES && NON_MAJOR_COUNTRIES[code]) {
        return NON_MAJOR_COUNTRIES[code].flag;
    }
    if (code === 'IN') return '🇮🇳';
    if (code === 'AU') return '🇦🇺';
    if (code === 'PK') return '🇵🇰';
    if (code === 'GB' || code === 'EN') return '🇬🇧';
    return '🌐';
}

function getCountryName(countryCode) {
    if (!countryCode) return 'Global';
    const code = countryCode.toUpperCase();
    if (COUNTRY_ROSTERS && COUNTRY_ROSTERS[code]) {
        return COUNTRY_ROSTERS[code].name;
    }
    if (NON_MAJOR_COUNTRIES && NON_MAJOR_COUNTRIES[code]) {
        return NON_MAJOR_COUNTRIES[code].name;
    }
    return code;
}

// GET /api/leaderboard from MySQL
// Supported query parameters:
// - tab: 'country' | 'world' | 'league'
// - userId: Player's user ID (defaults to 1)
// - country: Country code (e.g. 'IN', 'AU')
router.get('/', async (req, res) => {
    try {
        const pool = getPool();
        const tab = (req.query.tab || 'country').toLowerCase();
        const userId = parseInt(req.query.userId || 1, 10);

        // 1. Get active 3-Month Season & Process any due reward distribution
        const activeSeason = await getActiveSeason();

        // 2. Fetch current user details
        let currentUser = null;
        if (userId) {
            const [userRows] = await pool.query('SELECT id, username, trophies, level, country_code, avatar, coins, gems FROM users WHERE id = ?', [userId]);
            if (userRows.length > 0) {
                currentUser = userRows[0];
            }
        }

        const userCountry = (req.query.country || currentUser?.country_code || 'IN').toUpperCase();
        const userTrophies = currentUser?.trophies ?? 0;

        // 3. Query players based on the selected tab
        let users = [];
        let scopeTitle = 'Country';
        let leagueInfo = null;

        if (tab === 'world') {
            // WORLD: Top players globally across all nations
            scopeTitle = 'World';
            const [rows] = await pool.query(`
                SELECT id, username as name, trophies, level, country_code as country, avatar
                FROM users 
                ORDER BY trophies DESC 
                LIMIT 100
            `);
            users = rows;
        } else if (tab === 'alltime' || tab === 'all-time' || tab === 'all_time') {
            // ALL TIME: All-time top player rankings
            scopeTitle = '👑 All Time';
            const [rows] = await pool.query(`
                SELECT id, username as name, trophies, level, country_code as country, avatar
                FROM users 
                ORDER BY trophies DESC, level DESC 
                LIMIT 100
            `);
            users = rows;
        } else if (tab === 'league') {
            // LEAGUE: Fallback for league tier
            const [leagueRows] = await pool.query(`
                SELECT * FROM leagues 
                WHERE ? >= min_trophies AND ? <= max_trophies 
                LIMIT 1
            `, [userTrophies, userTrophies]);

            if (leagueRows.length > 0) {
                leagueInfo = leagueRows[0];
            } else {
                leagueInfo = {
                    tier_name: 'Trainee League',
                    badge_icon: '🥉',
                    min_trophies: 0,
                    max_trophies: 300
                };
            }

            scopeTitle = `${leagueInfo.badge_icon} ${leagueInfo.tier_name}`;
            const [rows] = await pool.query(`
                SELECT id, username as name, trophies, level, country_code as country, avatar
                FROM users 
                WHERE trophies >= ? AND trophies <= ?
                ORDER BY trophies DESC 
                LIMIT 100
            `);
            users = rows;
        } else {
            // COUNTRY (Default): Top players from the user's country
            const flag = getCountryFlag(userCountry);
            const countryName = getCountryName(userCountry);
            scopeTitle = `${flag} ${countryName}`;

            const [rows] = await pool.query(`
                SELECT id, username as name, trophies, level, country_code as country, avatar
                FROM users 
                WHERE UPPER(country_code) = ?
                ORDER BY trophies DESC 
                LIMIT 100
            `, [userCountry]);
            users = rows;
        }

        // Format ranked list
        let myRank = null;
        const ranked = users.map((u, idx) => {
            const rank = idx + 1;
            if (currentUser && u.id === currentUser.id) {
                myRank = rank;
            }
            return {
                rank,
                id: u.id,
                name: u.name || u.username,
                username: u.name || u.username,
                trophies: u.trophies || 0,
                level: u.level || 1,
                country: (u.country || 'IN').toUpperCase(),
                flag: getCountryFlag(u.country),
                avatar: u.avatar || '👤'
            };
        });

        // 4. Check if current user has an unacknowledged diamond prize from a completed season
        const recentReward = await checkUserPendingSeasonReward(userId);

        res.json({
            success: true,
            tab,
            scopeTitle,
            countryCode: userCountry,
            countryFlag: getCountryFlag(userCountry),
            leagueInfo,
            season: {
                seasonNumber: activeSeason?.season_number || 1,
                name: activeSeason?.name || 'Season 1 (3-Month League)',
                endDate: activeSeason?.endDateISO || activeSeason?.end_date,
                remainingMs: activeSeason?.remainingMs ?? (90 * 24 * 60 * 60 * 1000),
                prizes: [
                    { rank: '1st 🥇', gems: 1500 },
                    { rank: '2nd 🥈', gems: 1000 },
                    { rank: '3-10th 🥉', gems: 500 }
                ]
            },
            leaderboard: ranked,
            userRank: myRank,
            recentReward
        });
    } catch (err) {
        console.error('SQL Error in leaderboard route:', err.message);
        res.json({
            success: true,
            tab: req.query.tab || 'country',
            scopeTitle: 'Leaderboard',
            leaderboard: [],
            season: {
                seasonNumber: 1,
                name: 'Season 1 (3-Month League)',
                endDate: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000).toISOString(),
                remainingMs: 80 * 24 * 60 * 60 * 1000,
                prizes: [
                    { rank: '1st 🥇', gems: 1500 },
                    { rank: '2nd 🥈', gems: 1000 },
                    { rank: '3-10th 🥉', gems: 500 }
                ]
            },
            recentReward: null
        });
    }
});

module.exports = router;
