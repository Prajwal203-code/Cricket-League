'use strict';

const { getRules } = require('../config/liveRules');

function validLevel(level, rules = getRules()) {
    if (!Number.isInteger(level) || level < 1 || level > rules.xp.maxLevel) throw new RangeError('Invalid level');
    return level;
}

function xpForLevel(level, rules = getRules()) {
    validLevel(level, rules);
    return Math.round(rules.xp.base * Math.pow(level, rules.xp.exponent));
}

function levelMultiplier(level, rules = getRules()) {
    validLevel(level, rules);
    return Math.min(rules.levelScaling.maximum, 1 + (level - 1) * rules.levelScaling.perLevel);
}

function rewardForLevel(level, rules = getRules()) {
    validLevel(level, rules);
    const milestone = rules.milestones;
    const major = level % milestone.majorEvery === 0;
    const key = major || level % milestone.every === 0;
    const anchor = milestone.legacy[49];
    const reward = milestone.legacy[level - 1] || {
        coins: Math.min(milestone.maxCoins, anchor.coins + (level - 50) * milestone.coinsPerLevelAfter50),
        gems: Math.min(milestone.maxGems, anchor.gems + (level - 50) * milestone.gemsPerLevelAfter50)
    };
    return {
        level, ...reward, xpRequired: xpForLevel(level, rules),
        pack: null, unlock: `${major ? 'Major milestone' : key ? 'Milestone' : 'Level'} ${level} reward`,
        icon: major ? '🏆' : key ? '🎁' : '🪙', isKeyMilestone: key,
        priority: major ? 3 : key ? 2 : 1, rulesVersion: rules.version
    };
}

function advanceProgress(level, xp, gain, rules = getRules()) {
    validLevel(level, rules);
    if (![xp, gain].every(n => Number.isSafeInteger(n) && n >= 0) || gain > 10_000_000) throw new RangeError('Invalid XP');
    const levels = [];
    let remaining = xp + gain;
    // Purchases and refunds must never change progression after a balance update.
    while (gain > 0 && level < rules.xp.maxLevel && remaining >= xpForLevel(level, rules)) {
        remaining -= xpForLevel(level++, rules);
        levels.push(level);
    }
    if (level === rules.xp.maxLevel) remaining = Math.min(remaining, xpForLevel(level, rules));
    return { level, xp: remaining, levels, levelUpCoins: levels.reduce((sum, n) => sum + n * rules.levelUpCoinsPerLevel, 0) };
}

function freeReward(level, rules = getRules()) {
    const multiplier = levelMultiplier(level, rules);
    return { coins: Math.round(rules.free.coins * multiplier), xp: Math.round(rules.free.xp * multiplier), multiplier, rulesVersion: rules.version };
}

function matchReward({ level, tourTier, prize, entryFee, won, tied, sixes, runs, wickets, forfeited = false }, rules = getRules()) {
    const policy = rules.match;
    const multiplier = levelMultiplier(level, rules);
    const baseXp = tied ? policy.tieXp : won ? policy.winXpPerTier * Math.min(policy.maxTourTier, Math.max(1, tourTier)) : policy.lossXp;
    const performanceXp = Math.min(policy.maxPerformanceXp, sixes * policy.xpPerSix + runs * policy.xpPerRun + wickets * policy.xpPerWicket);
    const baseCoins = tied ? entryFee : won ? prize : policy.consolationCoins;
    return {
        coins: forfeited ? 0 : tied ? baseCoins : Math.round(baseCoins * multiplier),
        xp: forfeited ? 0 : Math.round((baseXp + performanceXp) * multiplier),
        trophies: tied ? 0 : won ? policy.trophiesPerWin : policy.trophiesPerLoss,
        breakdown: { baseCoins, baseXp, performanceXp: forfeited ? 0 : performanceXp, levelMultiplier: multiplier },
        rulesVersion: rules.version
    };
}

module.exports = { xpForLevel, validLevel, levelMultiplier, rewardForLevel, advanceProgress, freeReward, matchReward };
