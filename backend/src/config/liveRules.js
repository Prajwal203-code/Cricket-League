'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const rulesPath = path.resolve(process.env.PROGRESSION_CONFIG_FILE || path.join(__dirname, '../../config/progression.json'));
const WALLET_LIMIT = 1_000_000_000_000;

function validateRules(value) {
    const fail = message => { throw new Error(`Invalid progression configuration: ${message}`); };
    const number = (object, key, min, max, integer = true) => {
        const n = object?.[key];
        if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) fail(key);
    };
    const keys = (object, allowed) => {
        if (!object || typeof object !== 'object' || Array.isArray(object)) fail('expected an object');
        for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`unknown field ${key}`);
    };
    keys(value, ['revision', 'xp', 'levelUpCoinsPerLevel', 'milestones', 'match', 'free', 'levelScaling']);
    number(value, 'revision', 1, 1_000_000);
    keys(value.xp, ['base', 'exponent', 'maxLevel']);
    number(value.xp, 'base', 10, 1000);
    number(value.xp, 'exponent', 1, 1.5, false);
    number(value.xp, 'maxLevel', 100, 10000);
    number(value, 'levelUpCoinsPerLevel', 0, 1000);
    keys(value.levelScaling, ['perLevel', 'maximum']);
    number(value.levelScaling, 'perLevel', 0, 0.1, false);
    number(value.levelScaling, 'maximum', 1, 5, false);
    keys(value.milestones, ['every', 'majorEvery', 'coinsPerLevelAfter50', 'gemsPerLevelAfter50', 'maxCoins', 'maxGems', 'legacy']);
    for (const key of ['every', 'majorEvery']) number(value.milestones, key, 2, 100);
    if (value.milestones.majorEvery % value.milestones.every) fail('majorEvery must be a multiple of every');
    number(value.milestones, 'coinsPerLevelAfter50', 0, 100000);
    number(value.milestones, 'gemsPerLevelAfter50', 0, 100);
    number(value.milestones, 'maxCoins', 500000, 5000000);
    number(value.milestones, 'maxGems', 1500, 10000);
    if (!Array.isArray(value.milestones.legacy) || value.milestones.legacy.length !== 50) fail('legacy requires 50 level rewards');
    for (const reward of value.milestones.legacy) {
        keys(reward, ['coins', 'gems']);
        number(reward, 'coins', 0, value.milestones.maxCoins);
        number(reward, 'gems', 0, value.milestones.maxGems);
    }
    const matchKeys = ['winXpPerTier', 'lossXp', 'tieXp', 'xpPerSix', 'xpPerRun', 'xpPerWicket', 'maxPerformanceXp', 'maxTourTier', 'consolationCoins', 'trophiesPerWin', 'trophiesPerLoss'];
    keys(value.match, matchKeys);
    for (const key of matchKeys.filter(k => k !== 'trophiesPerLoss')) number(value.match, key, key === 'maxTourTier' ? 1 : 0, 1000);
    number(value.match, 'trophiesPerLoss', -100, 0);
    keys(value.free, ['coins', 'xp', 'cooldownMs']);
    number(value.free, 'coins', 1, 10000);
    number(value.free, 'xp', 0, 1000);
    number(value.free, 'cooldownMs', 60000, 7 * 86400000);
    return value;
}

function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}

function snapshot(value) {
    validateRules(value);
    const version = `${value.revision}-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)}`;
    return freeze({ ...value, version });
}

// Invalid configuration at boot fails fast. Invalid edits at runtime keep the last good version.
let active = snapshot(JSON.parse(fs.readFileSync(rulesPath, 'utf8').replace(/^\uFEFF/, '')));
let timer = null;
let lastError = null;
let refreshing = null;

async function refreshRules() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
        try {
            const next = snapshot(JSON.parse((await fs.promises.readFile(rulesPath, 'utf8')).replace(/^\uFEFF/, '')));
            if (next.version !== active.version) {
                if (next.revision <= active.revision) throw new Error('Increase the configuration revision before publishing');
                if (next.xp.maxLevel < active.xp.maxLevel) throw new Error('The level limit cannot be reduced');
                active = next;
                console.info(`[rules] activated ${next.version}`);
            }
            lastError = null;
            return true;
        } catch (error) {
            if (lastError !== error.message) console.error('[rules] rejected update; retaining active rules:', error.message);
            lastError = error.message;
            return false;
        } finally { refreshing = null; }
    })();
    return refreshing;
}

function startRulesRefresh() {
    if (!timer) timer = setInterval(refreshRules, 2000).unref();
}

function stopRulesRefresh() { clearInterval(timer); timer = null; }
function getRules() { return active; }
function rulesHealth() { return { version: active.version, status: lastError ? 'retaining-last-good' : 'ok' }; }

module.exports = { getRules, refreshRules, startRulesRefresh, stopRulesRefresh, rulesHealth, validateRules, rulesPath, WALLET_LIMIT };
