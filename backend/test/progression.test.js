const test = require('node:test');
const assert = require('node:assert/strict');
const { getRules, validateRules } = require('../src/config/liveRules');
const { advanceProgress, xpForLevel, rewardForLevel, freeReward, matchReward } = require('../src/services/progression');

test('a single award crosses every earned level and preserves remaining XP', () => {
    const gain = xpForLevel(1) + xpForLevel(2) + 7;
    assert.deepEqual(advanceProgress(1, 0, gain), { level: 3, xp: 7, levels: [2, 3], levelUpCoins: 500 });
    assert.equal(advanceProgress(1, 49, 1).level, 2);
    assert.equal(advanceProgress(1, 49, 0).level, 1);
    assert.equal(advanceProgress(1, 1000, 0).level, 1, 'spending coins cannot trigger a level-up');
});

test('invalid XP and levels cannot hang or corrupt progression', () => {
    for (const value of [NaN, Infinity, -1, 0, 1.2, '2', 10001]) assert.throws(() => xpForLevel(value));
    for (const value of [NaN, Infinity, -1, 1.2, 10000001]) assert.throws(() => advanceProgress(1, 0, value));
    const maximum = getRules().xp.maxLevel;
    assert.equal(advanceProgress(maximum, 0, 10000000).level, maximum);
});

test('generated rewards continue growing past level 50 and stay bounded', () => {
    let previous = rewardForLevel(50);
    for (let level = 51; level <= 10000; level++) {
        const reward = rewardForLevel(level);
        assert.ok(reward.coins >= previous.coins);
        assert.ok(reward.gems >= previous.gems);
        assert.ok(reward.coins <= getRules().milestones.maxCoins);
        assert.equal(reward.pack, null);
        previous = reward;
    }
    assert.ok(rewardForLevel(10).priority > rewardForLevel(5).priority);
    assert.ok(rewardForLevel(5).priority > rewardForLevel(4).priority);
});

test('match and free rewards scale with level; score rewards include sixes', () => {
    const input = { level: 1, tourTier: 1, prize: 200, entryFee: 100, won: true, tied: false, sixes: 0, runs: 0, wickets: 0 };
    const novice = matchReward(input);
    const experienced = matchReward({ ...input, level: 25, sixes: 2, runs: 12, wickets: 2 });
    assert.ok(experienced.coins > novice.coins);
    assert.ok(experienced.xp > novice.xp);
    assert.equal(experienced.breakdown.performanceXp, 24);
    assert.equal(matchReward({ ...input, level: 25, tied: true, won: false }).coins, 100);
    const forfeit = matchReward({ ...input, won: false, forfeited: true });
    assert.equal(forfeit.coins, 0);
    assert.equal(forfeit.xp, 0);
    assert.ok(freeReward(25).coins > freeReward(1).coins);
});

test('rules reject unsafe numbers, unknown fields and malformed reward tables', () => {
    const copy = () => { const { version, ...value } = getRules(); return JSON.parse(JSON.stringify(value)); };
    const invalid = copy(); invalid.xp.base = 0; assert.throws(() => validateRules(invalid));
    const unknown = copy(); unknown.fre = {}; assert.throws(() => validateRules(unknown));
    const incomplete = copy(); incomplete.milestones.legacy.pop(); assert.throws(() => validateRules(incomplete));
    assert.ok(Object.isFrozen(getRules().milestones.legacy[0]));
});
