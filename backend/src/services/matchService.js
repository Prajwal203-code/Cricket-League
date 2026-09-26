/**
 * Match persistence and payouts.
 *
 * This module owns every coin movement tied to a match. Entry fees are taken
 * when a player joins the queue and refunded if no opponent turns up; prizes
 * are paid only from a completed server-side match. The browser is never
 * consulted about how much anything is worth — it previously computed both the
 * fee and the prize itself and posted the resulting balance.
 */
const { getPool } = require('../config/db');
const { ECONOMY } = require('../config/gameRules');
const { applyWalletDelta } = require('./userService');
const { awardMatchTokens } = require('./battlePassService');
const { awardDogTagsForWin } = require('./clubWarService');

/** Cache of tour fee/prize rows; these change only on redeploy. */
let tourCache = null;

async function getTour(tourId) {
    if (!tourCache) {
        const [rows] = await getPool().query('SELECT id, name, entry_fee, prize, min_level FROM tours');
        tourCache = new Map(rows.map(r => [Number(r.id), r]));
    }
    return tourCache.get(Number(tourId)) || null;
}

function invalidateTourCache() {
    tourCache = null;
}

/**
 * Takes the entry fee for a tour. Returns the tour on success, or an error
 * describing why the player cannot enter.
 */
async function chargeEntryFee(userId, tourId) {
    const tour = await getTour(tourId);
    if (!tour) {
        return { ok: false, code: 'UNKNOWN_TOUR', message: 'That venue does not exist.' };
    }

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [userRows] = await conn.query('SELECT level FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
            await conn.rollback();
            return { ok: false, code: 'NO_ACCOUNT', message: 'Account not found.' };
        }
        if (userRows[0].level < tour.min_level) {
            await conn.rollback();
            return {
                ok: false,
                code: 'LEVEL_TOO_LOW',
                message: `${tour.name} unlocks at level ${tour.min_level}.`
            };
        }

        // applyWalletDelta refuses to overdraw, so this doubles as the
        // "can they afford it" check.
        const result = await applyWalletDelta(userId, { coins: -tour.entry_fee }, conn);
        if (!result) {
            await conn.rollback();
            return {
                ok: false,
                code: 'INSUFFICIENT_COINS',
                message: `You need ${tour.entry_fee.toLocaleString()} coins to enter ${tour.name}.`
            };
        }

        await conn.commit();
        return { ok: true, tour, balance: result.user.coins };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/** Returns an entry fee — queue cancelled, timed out, or match abandoned pre-start. */
async function refundEntryFee(userId, tourId) {
    const tour = await getTour(tourId);
    if (!tour) return null;
    const result = await applyWalletDelta(userId, { coins: tour.entry_fee });
    return result ? result.user.coins : null;
}

/**
 * Records a finished match and pays both players, in one transaction so a
 * crash cannot leave a result written with the prize unpaid.
 *
 * @returns per-user payout summaries for the match_end broadcast.
 */
async function settleMatch(match) {
    const [p1Id, p2Id] = match.order;
    const tour = await getTour(match.tourId);
    const prize = tour ? tour.prize : 0;

    const winnerId = match.winnerUserId;
    const isTie = winnerId === null;

    const pool = getPool();
    const conn = await pool.getConnection();
    const payouts = {};

    try {
        await conn.beginTransaction();

        const sixesByUser = {};
        for (const userId of match.order) {
            sixesByUser[userId] = match.scores[userId].balls.filter(b => b === 6).length;
        }

        await conn.query(
            `INSERT INTO match_history
                (match_uuid, p1_user_id, p2_user_id, tour_id, p1_score, p2_score,
                 p1_wickets, p2_wickets, p1_sixes, p2_sixes,
                 winner_user_id, coins_awarded, end_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                match.matchId,
                p1Id,
                p2Id,
                match.tourId,
                match.scores[p1Id].runs,
                match.scores[p2Id].runs,
                match.scores[p1Id].wickets,
                match.scores[p2Id].wickets,
                sixesByUser[p1Id],
                sixesByUser[p2Id],
                winnerId,
                isTie ? Math.floor(prize / 2) : prize,
                match.endReason || 'runs'
            ]
        );

        for (const userId of match.order) {
            const won = !isTie && userId === winnerId;
            const sixes = sixesByUser[userId];

            let coins;
            if (isTie) {
                // Both entered, neither won: return the stake rather than
                // pocketing it.
                coins = tour ? tour.entry_fee : 0;
            } else if (won) {
                coins = prize;
            } else {
                coins = ECONOMY.consolationCoins;
            }

            const xp = won
                ? ECONOMY.xpPerWinPerTour * Number(match.tourId || 1)
                : ECONOMY.xpPerLoss;

            let trophies = 0;
            if (!isTie) {
                trophies = won ? ECONOMY.trophiesPerWin : ECONOMY.trophiesPerLoss;
            }

            const result = await applyWalletDelta(userId, {
                coins,
                trophies,
                xp: xp + sixes * ECONOMY.xpPerSix,
                sixes,
                matchPlayed: true,
                matchWon: won
            }, conn);

            // Strike Pass tokens are earned here rather than seeded, so the
            // pass track reflects matches the player actually finished.
            const passTokens = await awardMatchTokens(userId, { won, sixes }, conn);

            // A win also scores for the player's club in the current war.
            const dogTags = won ? await awardDogTagsForWin(userId, conn) : 0;

            payouts[userId] = {
                coins,
                trophies,
                xp,
                sixes,
                won,
                isTie,
                passTokens,
                dogTags,
                leveledUp: result ? result.leveledUp : false,
                newLevel: result ? result.newLevel : null,
                levelUpCoins: result ? result.levelUpCoins : 0,
                balance: result ? result.user.coins : null,
                trophyTotal: result ? result.user.trophies : null
            };
        }

        await conn.commit();
        return payouts;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    getTour,
    invalidateTourCache,
    chargeEntryFee,
    refundEntryFee,
    settleMatch
};
