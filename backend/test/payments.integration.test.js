const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('transactional wallet, milestones, entry reservations and settlement recovery', { skip: process.env.RUN_DB_TESTS !== '1' }, async t => {
    // Never run migrations or fixtures against the developer's real database.
    process.env.DB_NAME = `cricket_test_${crypto.randomBytes(6).toString('hex')}`;
    const db = require('../src/config/db');
    const { getRules } = require('../src/config/liveRules');
    const { applyWalletDelta, getUserById } = require('../src/services/userService');
    const { getRewardForLevel, claimLevelReward, getRoadmapStatusForUser } = require('../src/services/roadmapService');
    const matches = require('../src/services/matchService');
    const engine = require('../src/services/matchEngine');
    try {
        await db.initDatabase();
        const pool = db.getPool();
        const [first] = await pool.query("INSERT INTO users (username, coins, gems, level, xp) VALUES ('test_one', 100000, 100, 1, 49)");
        const [second] = await pool.query("INSERT INTO users (username, coins, gems, level, xp) VALUES ('test_two', 100000, 100, 1, 0)");
        const a = first.insertId, b = second.insertId;

        await t.test('simultaneous XP awards do not lose updates or duplicate level rewards', async () => {
            await Promise.all([applyWalletDelta(a, { xp: 1 }), applyWalletDelta(a, { xp: 1 })]);
            const user = await getUserById(a);
            assert.equal(user.level, 2);
            assert.equal(user.xp, 1);
            assert.equal(user.coins, 100000 + 200 + getRewardForLevel(2).coins);
            const [rows] = await pool.query('SELECT * FROM user_level_rewards WHERE user_id = ?', [a]);
            assert.equal(rows.length, 1);
            assert.equal(rows[0].level, 2);
            assert.equal((await claimLevelReward(a, 2)).code, 'ALREADY_CLAIMED');
            assert.equal((await claimLevelReward(a, '1junk')).code, 'INVALID_LEVEL');
            assert.equal((await claimLevelReward(a, 3)).code, 'LEVEL_NOT_REACHED');
        });

        await t.test('simultaneous milestone claims pay once', async () => {
            const before = await getUserById(a);
            const responses = await Promise.all([claimLevelReward(a, 1), claimLevelReward(a, 1)]);
            assert.equal(responses.filter(r => r.success).length, 1);
            assert.equal((await getUserById(a)).coins, before.coins + getRewardForLevel(1).coins);
            const roadmap = await getRoadmapStatusForUser(a);
            assert.equal(roadmap.claimableCount, 0);
        });

        await t.test('concurrent spends cannot overdraw and rollback does not leave receipts', async () => {
            const [temp] = await pool.query("INSERT INTO users (username, coins, gems, xp) VALUES ('spender', 100, 0, 0)");
            const results = await Promise.all([applyWalletDelta(temp.insertId, { coins: -80 }), applyWalletDelta(temp.insertId, { coins: -80 })]);
            assert.equal(results.filter(Boolean).length, 1);
            assert.equal((await getUserById(temp.insertId)).coins, 20);
            const conn = await pool.getConnection();
            try {
                await conn.beginTransaction();
                await applyWalletDelta(temp.insertId, { xp: 50 }, conn);
                await conn.rollback();
            } finally { conn.release(); }
            assert.equal((await getUserById(temp.insertId)).level, 1);
            const [claims] = await pool.query('SELECT * FROM user_level_rewards WHERE user_id = ?', [temp.insertId]);
            assert.equal(claims.length, 0);
        });

        await t.test('a changed tour price cannot change a refund or allow duplicate charges', async () => {
            const tour = await matches.getTour(1);
            const before = await getUserById(a);
            const results = await Promise.all([matches.chargeEntryFee(a, 1), matches.chargeEntryFee(a, 1)]);
            const paid = results.find(r => r.ok);
            assert.equal(results.filter(r => r.ok).length, 1);
            await pool.query('UPDATE tours SET entry_fee = entry_fee + 37 WHERE id = 1');
            const refunds = await Promise.all([matches.refundEntryFee(a, 1, paid.entryId), matches.refundEntryFee(a, 1, paid.entryId)]);
            assert.equal(refunds.filter(value => value !== null).length, 1);
            assert.equal((await getUserById(a)).coins, before.coins);
            await pool.query('UPDATE tours SET entry_fee = ? WHERE id = 1', [tour.entry_fee]);
        });

        await t.test('a completed match is paid exactly once and retries return the saved payout', async () => {
            const x = await matches.chargeEntryFee(a, 1), y = await matches.chargeEntryFee(b, 1);
            const match = engine.createMatch({ tourId: 1, entryFee: x.tour.entry_fee, prize: x.tour.prize,
                p1: { userId: a, level: 2 }, p2: { userId: b, level: 1 }, battingFirstUserId: a });
            match.rules = getRules(); match.tourTier = x.tour.tour_number;
            match.entryIds = { [a]: x.entryId, [b]: y.entryId };
            await matches.activateEntries(match);
            match.scores[a] = { runs: 12, wickets: 0, balls: [6, 6] };
            match.scores[b] = { runs: 0, wickets: 2, balls: ['W', 'W'] };
            engine.finishMatch(match, a, 'runs');
            await pool.query("CREATE TRIGGER reject_test_settlement BEFORE INSERT ON match_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'test settlement interruption'");
            await assert.rejects(matches.settleMatch(match));
            assert.equal((await getUserById(a)).matches_played, 0, 'failed payout transaction must roll back');
            await pool.query('DROP TRIGGER reject_test_settlement');
            assert.equal(await matches.recoverPendingSettlements(), 1, 'persisted result is recovered after an interruption');
            const [payout, repeated] = await Promise.all([matches.settleMatch(match), matches.settleMatch(match)]);
            assert.deepEqual(repeated, payout);
            assert.equal(payout[a].breakdown.performanceXp, 24);
            assert.equal(payout[a].xp, Math.round((15 + 24) * 1.02));
            assert.equal((await getUserById(a)).matches_played, 1);
            assert.equal((await getUserById(b)).matches_played, 1);
            const [history] = await pool.query('SELECT * FROM match_history WHERE match_uuid = ?', [match.matchId]);
            assert.equal(history.length, 1);
        });

        await t.test('restart recovery refunds abandoned reservations once', async () => {
            const before = await getUserById(a);
            const entry = await matches.chargeEntryFee(a, 1);
            assert.equal(entry.ok, true);
            assert.equal(await matches.recoverAbandonedEntries(), 1);
            assert.equal(await matches.recoverAbandonedEntries(), 0);
            assert.equal((await getUserById(a)).coins, before.coins);
        });
    } finally {
        const database = process.env.DB_NAME;
        if (!/^cricket_test_[a-f0-9]{12}$/.test(database)) throw new Error('Unsafe test database cleanup');
        await db.getPool().query(`DROP DATABASE IF EXISTS \`${database}\``);
        await db.getPool().end();
    }
});
