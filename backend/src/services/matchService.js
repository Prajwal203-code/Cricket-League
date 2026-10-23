/** Durable entry reservations and exactly-once match settlement. */
const crypto = require('node:crypto');
const { getPool } = require('../config/db');
const { getRules } = require('../config/liveRules');
const { matchReward } = require('./progression');
const { applyWalletDelta } = require('./userService');
const { awardMatchTokens } = require('./battlePassService');
const { awardDogTagsForWin } = require('./clubWarService');

async function getTour(tourId) {
    const [rows] = await getPool().query('SELECT id, tour_number, name, entry_fee, prize, min_level FROM tours WHERE id = ?', [tourId]);
    if (rows[0] && (!['entry_fee', 'prize'].every(key => Number.isSafeInteger(rows[0][key]) && rows[0][key] >= 0 && rows[0][key] <= 10_000_000)
        || !Number.isInteger(rows[0].min_level) || rows[0].min_level < 1)) throw new Error('Invalid tour economy');
    return rows[0] || null;
}

async function chargeEntryFee(userId, tourId) {
    const tour = await getTour(tourId);
    if (!tour) return { ok: false, code: 'UNKNOWN_TOUR', message: 'That venue does not exist.' };
    const conn = await getPool().getConnection();
    try {
        await conn.beginTransaction();
        const [users] = await conn.query('SELECT level FROM users WHERE id = ? FOR UPDATE', [userId]);
        if (!users.length) {
            await conn.rollback();
            return { ok: false, code: 'NO_ACCOUNT', message: 'Account not found.' };
        }
        const [entries] = await conn.query("SELECT id FROM match_entries WHERE user_id = ? AND status IN ('queued','playing')", [userId]);
        if (entries.length) {
            await conn.rollback();
            return { ok: false, code: 'ALREADY_QUEUED', message: 'You already have an active match or search.' };
        }
        if (users[0].level < tour.min_level) {
            await conn.rollback();
            return { ok: false, code: 'LEVEL_TOO_LOW', message: `${tour.name} unlocks at level ${tour.min_level}.` };
        }
        const wallet = await applyWalletDelta(userId, { coins: -tour.entry_fee, reason: 'match_entry' }, conn);
        if (!wallet) {
            await conn.rollback();
            return { ok: false, code: 'INSUFFICIENT_COINS', message: `You need ${tour.entry_fee} coins to enter ${tour.name}.` };
        }
        const entryId = crypto.randomUUID();
        await conn.query('INSERT INTO match_entries (id, user_id, tour_id, entry_fee, prize) VALUES (?, ?, ?, ?, ?)',
            [entryId, userId, tourId, tour.entry_fee, tour.prize]);
        await conn.commit();
        return { ok: true, tour, entryId, balance: wallet.user.coins, rules: getRules() };
    } catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
}

async function refundEntryFee(userId, tourId, entryId = null) {
    const conn = await getPool().getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
        const [rows] = await conn.query(`SELECT * FROM match_entries WHERE user_id = ? AND tour_id = ?
            AND status = 'queued' AND (? IS NULL OR id = ?) FOR UPDATE`, [userId, tourId, entryId, entryId]);
        if (!rows.length) { await conn.rollback(); return null; }
        const entry = rows[0];
        const wallet = await applyWalletDelta(userId, { coins: entry.entry_fee, reason: 'match_refund' }, conn);
        await conn.query("UPDATE match_entries SET status = 'refunded' WHERE id = ?", [entry.id]);
        await conn.commit();
        return wallet.user.coins;
    } catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
}

async function activateEntries(match) {
    const conn = await getPool().getConnection();
    try {
        await conn.beginTransaction();
        for (const userId of [...match.order].sort((a, b) => a - b)) {
            const [result] = await conn.query(`UPDATE match_entries SET status = 'playing', match_uuid = ?
                WHERE id = ? AND user_id = ? AND status = 'queued'`, [match.matchId, match.entryIds[userId], userId]);
            if (result.affectedRows !== 1) throw new Error('Match entry is no longer available');
        }
        await conn.commit();
    } catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
}

async function settleMatch(match) {
    if (match.status !== 'finished' || !match.rules || !match.entryIds) throw new Error('Only completed server matches may settle');
    // Commit the work item first. A crash during payout leaves a retryable job.
    await getPool().query(`INSERT INTO match_settlements (match_uuid, match_data) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE match_uuid = VALUES(match_uuid)`, [match.matchId, JSON.stringify(match)]);
    return settlePendingMatch(match.matchId);
}

async function settlePendingMatch(matchId) {
    const conn = await getPool().getConnection();
    try {
        await conn.beginTransaction();
        const [jobs] = await conn.query('SELECT * FROM match_settlements WHERE match_uuid = ? FOR UPDATE', [matchId]);
        if (!jobs.length) throw new Error('Missing settlement');
        if (jobs[0].payouts) { await conn.commit(); return JSON.parse(jobs[0].payouts); }
        const match = JSON.parse(jobs[0].match_data);
        const rules = match.rules;
        const [a, b] = match.order;
        const payouts = {};
        // Stable lock order across matches, claims and retries.
        for (const userId of [...match.order].sort((x, y) => x - y)) {
            await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
        }
        for (const userId of match.order) {
            const opponentId = userId === a ? b : a;
            const score = match.scores[userId];
            const sixes = score.balls.filter(n => n === 6).length;
            const won = match.winnerUserId === userId;
            const isTie = match.winnerUserId === null;
            const forfeited = match.forfeitedBy === userId;
            const reward = matchReward({ level: match.players[userId].level,
                tourTier: match.tourTier || 1, prize: match.prize, entryFee: match.entryFee,
                won, tied: isTie, sixes, runs: score.runs, wickets: match.scores[opponentId].wickets, forfeited }, rules);
            const result = await applyWalletDelta(userId, { ...reward, sixes, matchPlayed: true, matchWon: won,
                reason: `match:${matchId}` }, conn, rules);
            if (!result) throw new Error('Settlement account missing');
            const passTokens = forfeited ? 0 : await awardMatchTokens(userId, { won, sixes }, conn);
            const dogTags = won ? await awardDogTagsForWin(userId, conn) : 0;
            const [entry] = await conn.query("UPDATE match_entries SET status = 'settled' WHERE id = ? AND match_uuid = ? AND status = 'playing'",
                [match.entryIds[userId], matchId]);
            if (entry.affectedRows !== 1) throw new Error('Match entry already refunded or unavailable');
            payouts[userId] = { ...reward, sixes, won, isTie, passTokens, dogTags,
                leveledUp: result.leveledUp, newLevel: result.newLevel, levelUpCoins: result.levelUpCoins,
                milestoneRewards: result.milestoneRewards, user: result.user,
                balance: result.user.coins, trophyTotal: result.user.trophies };
        }
        await conn.query(`INSERT INTO match_history
            (match_uuid, p1_user_id, p2_user_id, tour_id, p1_score, p2_score, p1_wickets, p2_wickets,
             p1_sixes, p2_sixes, winner_user_id, coins_awarded, end_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [matchId, a, b, match.tourId,
            match.scores[a].runs, match.scores[b].runs, match.scores[a].wickets, match.scores[b].wickets,
            payouts[a].sixes, payouts[b].sixes, match.winnerUserId,
            match.winnerUserId ? payouts[match.winnerUserId].coins : 0, match.endReason]);
        await conn.query('UPDATE match_settlements SET payouts = ?, settled_at = NOW() WHERE match_uuid = ?', [JSON.stringify(payouts), matchId]);
        await conn.commit();
        return payouts;
    } catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
}

async function recoverPendingSettlements() {
    const [jobs] = await getPool().query('SELECT match_uuid FROM match_settlements WHERE payouts IS NULL ORDER BY created_at LIMIT 100');
    for (const job of jobs) await settlePendingMatch(job.match_uuid);
    return jobs.length;
}

// Called once at startup, before accepting players. Matches live in this process;
// unsettled abandoned reservations are refunded, using the amount originally charged.
async function recoverAbandonedEntries() {
    await getPool().query(`UPDATE match_entries e LEFT JOIN match_settlements s ON s.match_uuid = e.match_uuid
        SET e.status = 'queued' WHERE e.status = 'playing' AND s.match_uuid IS NULL`);
    const [entries] = await getPool().query("SELECT id, user_id, tour_id FROM match_entries WHERE status = 'queued'");
    for (const entry of entries) await refundEntryFee(entry.user_id, entry.tour_id, entry.id);
    return entries.length;
}

module.exports = { getTour, chargeEntryFee, refundEntryFee, activateEntries, settleMatch, settlePendingMatch,
    recoverPendingSettlements, recoverAbandonedEntries };
