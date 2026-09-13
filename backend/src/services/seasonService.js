const { getPool } = require('../config/db');

/**
 * 3-Month (Quarterly) Season System Engine
 * Synchronizes season timer across all clients and automatically distributes diamond rewards at season end.
 */

// Reward tiers matching the UI prize pool cards
const SEASON_PRIZES = [
    { rank: 1, rankLabel: '1st 🥇', gems: 1500 },
    { rank: 2, rankLabel: '2nd 🥈', gems: 1000 },
    { rank: 3, rankLabel: '3-10th 🥉', gems: 500, maxRank: 10 }
];

/**
 * Calculates current 3-month quarter dates (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec)
 */
function getQuarterDates(targetDate = new Date()) {
    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth(); // 0 to 11
    const quarterIndex = Math.floor(month / 3); // 0, 1, 2, 3
    const startMonth = quarterIndex * 3;
    const endMonth = startMonth + 3;

    const startDate = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
    // Day 0 of endMonth gives the last day of (endMonth - 1)
    const endDate = new Date(Date.UTC(year, endMonth, 0, 23, 59, 59, 999));

    // Base year 2026 for Season numbering
    const baseYear = 2026;
    const seasonNumber = Math.max(1, (year - baseYear) * 4 + (quarterIndex + 1));
    const quarterName = `Q${quarterIndex + 1}`;

    return {
        seasonNumber,
        name: `Season ${seasonNumber} (${quarterName} ${year})`,
        startDate,
        endDate
    };
}

/**
 * Ensures tables exist and retrieves or creates the active 3-month season
 */
async function getActiveSeason() {
    const pool = getPool();
    if (!pool) return null;

    // 1. Check for current active season
    const [rows] = await pool.query(`
        SELECT * FROM seasons 
        WHERE is_active = 1 
        ORDER BY season_number DESC 
        LIMIT 1
    `);

    if (rows.length > 0) {
        const season = rows[0];
        const now = new Date();
        const endDate = new Date(season.end_date);

        // If season has passed end date and rewards haven't been distributed, process it
        if (now >= endDate && season.rewards_distributed === 0) {
            return await processSeasonEndAndRoll(season);
        }

        const remainingMs = Math.max(0, endDate.getTime() - now.getTime());
        return {
            ...season,
            endDateISO: endDate.toISOString(),
            remainingMs
        };
    }

    // 2. No active season found, initialize current quarter season
    const quarter = getQuarterDates();
    await pool.query(`
        INSERT INTO seasons (season_number, name, start_date, end_date, is_active, rewards_distributed)
        VALUES (?, ?, ?, ?, 1, 0)
        ON DUPLICATE KEY UPDATE is_active = 1
    `, [quarter.seasonNumber, quarter.name, quarter.startDate, quarter.endDate]);

    const [newSeasonRows] = await pool.query(`
        SELECT * FROM seasons WHERE season_number = ?
    `, [quarter.seasonNumber]);

    const newSeason = newSeasonRows[0];
    const endDate = new Date(newSeason.end_date);
    return {
        ...newSeason,
        endDateISO: endDate.toISOString(),
        remainingMs: Math.max(0, endDate.getTime() - Date.now())
    };
}

/**
 * Processes season completion: distributes diamond rewards to top 10 users and starts next 3-month season
 */
async function processSeasonEndAndRoll(endedSeason) {
    const pool = getPool();
    console.log(`🏆 [Season Engine] Season #${endedSeason.season_number} concluded! Distributing Diamond prizes...`);

    try {
        // 1. Fetch top 10 players globally based on trophies
        const [topPlayers] = await pool.query(`
            SELECT id, username, trophies, gems, country_code 
            FROM users 
            ORDER BY trophies DESC 
            LIMIT 10
        `);

        // 2. Distribute rewards to top 10 players
        for (let i = 0; i < topPlayers.length; i++) {
            const player = topPlayers[i];
            const rank = i + 1;
            let rewardGems = 0;

            if (rank === 1) rewardGems = 1500;
            else if (rank === 2) rewardGems = 1000;
            else if (rank >= 3 && rank <= 10) rewardGems = 500;

            if (rewardGems > 0) {
                // Award gems to user
                await pool.query(`
                    UPDATE users 
                    SET gems = gems + ? 
                    WHERE id = ?
                `, [rewardGems, player.id]);

                // Record reward in history
                await pool.query(`
                    INSERT INTO season_rewards_history (season_number, user_id, rank_position, reward_gems, category, claimed)
                    VALUES (?, ?, ?, ?, 'global', 0)
                    ON DUPLICATE KEY UPDATE reward_gems = VALUES(reward_gems)
                `, [endedSeason.season_number, player.id, rank, rewardGems]);

                console.log(`💎 Awarded ${rewardGems} gems to Rank #${rank} (${player.username}) for Season #${endedSeason.season_number}`);
            }
        }

        // 3. Mark current season as completed & rewards distributed
        await pool.query(`
            UPDATE seasons 
            SET is_active = 0, rewards_distributed = 1 
            WHERE id = ?
        `, [endedSeason.id]);

        // 4. Create the next 3-month season (+3 months)
        const nextSeasonStartDate = new Date(endedSeason.end_date);
        nextSeasonStartDate.setUTCSeconds(nextSeasonStartDate.getUTCSeconds() + 1);

        const nextQuarter = getQuarterDates(nextSeasonStartDate);
        const nextSeasonNumber = endedSeason.season_number + 1;
        const nextSeasonName = `Season ${nextSeasonNumber} (3-Month League)`;

        await pool.query(`
            INSERT INTO seasons (season_number, name, start_date, end_date, is_active, rewards_distributed)
            VALUES (?, ?, ?, ?, 1, 0)
        `, [nextSeasonNumber, nextSeasonName, nextQuarter.startDate, nextQuarter.endDate]);

        console.log(`✨ [Season Engine] Started next 3-month Season #${nextSeasonNumber}: Ends ${nextQuarter.endDate.toISOString()}`);

        const [createdNextRows] = await pool.query(`
            SELECT * FROM seasons WHERE season_number = ?
        `, [nextSeasonNumber]);

        const nextSeason = createdNextRows[0];
        const nextEndDate = new Date(nextSeason.end_date);
        return {
            ...nextSeason,
            endDateISO: nextEndDate.toISOString(),
            remainingMs: Math.max(0, nextEndDate.getTime() - Date.now())
        };
    } catch (err) {
        console.error('❌ Error processing season rewards:', err.message);
        return endedSeason;
    }
}

/**
 * Checks if a specific user has pending claimable rewards from the last completed season
 */
async function checkUserPendingSeasonReward(userId) {
    const pool = getPool();
    if (!pool || !userId) return null;

    try {
        const [rows] = await pool.query(`
            SELECT id, season_number, rank_position, reward_gems, category
            FROM season_rewards_history
            WHERE user_id = ? AND claimed = 0
            ORDER BY season_number DESC
            LIMIT 1
        `, [userId]);

        if (rows.length > 0) {
            const r = rows[0];
            // Mark as acknowledged
            await pool.query(`UPDATE season_rewards_history SET claimed = 1 WHERE id = ?`, [r.id]);

            return {
                seasonNumber: r.season_number,
                rank: r.rank_position,
                gems: r.reward_gems,
                category: r.category
            };
        }
    } catch (e) {
        console.warn('Could not check user pending season rewards:', e.message);
    }
    return null;
}

module.exports = {
    getActiveSeason,
    processSeasonEndAndRoll,
    checkUserPendingSeasonReward,
    SEASON_PRIZES
};
