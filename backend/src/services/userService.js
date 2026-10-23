/**
 * User account and wallet operations.
 *
 * All balance changes go through here. The previous design let the client POST
 * absolute `coins`/`gems`/`level` values, which meant a single crafted request
 * could grant unlimited currency. Callers now describe *what happened* (won a
 * match, bought an item) and this module computes the resulting balance inside
 * a transaction.
 */
const crypto = require('crypto');
const { getPool, syncUserSquadForCountry } = require('../config/db');
const { ECONOMY } = require('../config/gameRules');
const { getRules, WALLET_LIMIT } = require('../config/liveRules');
const { advanceProgress, rewardForLevel, xpForLevel } = require('./progression');

/** Columns safe to return to a client. Excludes email and social_id. */
const PUBLIC_USER_FIELDS = `
    id, username, level, xp, coins, gems, trophies,
    matches_played, matches_won, total_sixes, avatar,
    country_code, referral_code, auth_provider, is_guest, character_config
`;

function generateReferralCode(username) {
    const base = (username || 'PLAYER')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10) || 'PLAYER';
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `CRIC-${base}-${suffix}`;
}

async function getUserById(userId, conn = null) {
    const db = conn || getPool();
    const [rows] = await db.query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [userId]);
    return rows[0] ? { ...rows[0], max_xp: xpForLevel(rows[0].level) } : null;
}

/**
 * Finds a user by verified social identity. Deliberately matches only on
 * (provider, social_id) — the previous implementation also matched on
 * `username`, which handed over any account whose name matched the display
 * name on an attacker's Google profile.
 */
async function findBySocialIdentity(provider, socialId, conn = null) {
    const db = conn || getPool();
    const [rows] = await db.query(
        'SELECT * FROM users WHERE auth_provider = ? AND social_id = ? LIMIT 1',
        [provider, socialId]
    );
    return rows[0] || null;
}

/** Finds the guest account previously issued to a device, if any. */
async function findGuestByDevice(deviceId, conn = null) {
    const db = conn || getPool();
    const [rows] = await db.query(
        "SELECT * FROM users WHERE auth_provider = 'guest' AND social_id = ? LIMIT 1",
        [deviceId]
    );
    return rows[0] || null;
}

/**
 * Creates an account with the standard starting balances and a full starting
 * squad. `provider` is 'guest' for device-scoped anonymous play.
 */
async function createUser({ username, provider, socialId, email, avatar, countryCode = 'IN' }) {
    const pool = getPool();

    // Usernames are UNIQUE; add a discriminator on collision rather than
    // failing the sign-in outright.
    let finalUsername = (username || 'Player').trim().slice(0, 40) || 'Player';
    const [clash] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [finalUsername]);
    if (clash.length > 0) {
        finalUsername = `${finalUsername.slice(0, 33)}_${crypto.randomBytes(2).toString('hex')}`;
    }

    const [result] = await pool.query(
        `INSERT INTO users
            (username, auth_provider, social_id, email, avatar, level, xp,
             coins, gems, trophies, country_code, referral_code, is_guest)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
        [
            finalUsername,
            provider,
            socialId,
            email || null,
            avatar || (provider === 'guest' ? '👤' : '🎮'),
            ECONOMY.startingLevel,
            ECONOMY.startingCoins,
            ECONOMY.startingGems,
            ECONOMY.startingTrophies,
            countryCode,
            generateReferralCode(finalUsername),
            provider === 'guest' ? 1 : 0
        ]
    );

    await syncUserSquadForCountry(result.insertId, countryCode);
    return getUserById(result.insertId);
}

/**
 * Links a verified social identity onto an existing account — used when a
 * guest signs in, so their progress carries over instead of stranding them
 * with a fresh account.
 */
async function linkSocialIdentity(userId, { provider, socialId, email, avatar }) {
    const pool = getPool();
    await pool.query(
        `UPDATE users
            SET auth_provider = ?, social_id = ?, is_guest = 0,
                email = COALESCE(?, email),
                avatar = COALESCE(?, avatar)
          WHERE id = ?`,
        [provider, socialId, email || null, avatar || null, userId]
    );
    return getUserById(userId);
}

/**
 * Applies a signed delta to a user's wallet and progression, inside the
 * caller's transaction when one is supplied.
 *
 * Guarantees:
 *  - balances are computed by SQL from the current row, never supplied wholesale
 *  - coins and gems are floored at zero, so a bad delta cannot leave a debt
 *  - a spend fails loudly (returns null) rather than silently overdrawing
 *
 * @param {object} delta - { coins, gems, trophies, xp, sixes, matchPlayed, matchWon }
 * @param {object} [conn] - existing transaction connection
 */
async function applyWalletDelta(userId, delta = {}, conn = null, rules = getRules()) {
    // FOR UPDATE only protects the read when all statements share a transaction.
    if (!conn) {
        const transaction = await getPool().getConnection();
        try {
            await transaction.beginTransaction();
            const result = await applyWalletDelta(userId, delta, transaction, rules);
            await transaction.commit();
            return result;
        } catch (error) {
            await transaction.rollback();
            throw error;
        } finally { transaction.release(); }
    }
    const db = conn;
    for (const key of ['coins', 'gems', 'trophies', 'xp', 'sixes']) {
        if (delta[key] !== undefined && (!Number.isSafeInteger(delta[key]) || Math.abs(delta[key]) > WALLET_LIMIT)) {
            throw new RangeError(`Invalid wallet delta: ${key}`);
        }
    }
    if ((delta.xp ?? 0) < 0 || (delta.sixes ?? 0) < 0) throw new RangeError('Progress increments cannot be negative');

    const coins = Math.trunc(delta.coins || 0);
    const gems = Math.trunc(delta.gems || 0);
    const trophies = Math.trunc(delta.trophies || 0);
    const xpGain = Math.max(0, Math.trunc(delta.xp || 0));
    const sixes = Math.max(0, Math.trunc(delta.sixes || 0));
    const matchPlayed = delta.matchPlayed ? 1 : 0;
    const matchWon = delta.matchWon ? 1 : 0;

    const [rows] = await db.query(
        'SELECT coins, gems, trophies, xp, level FROM users WHERE id = ? FOR UPDATE',
        [userId]
    );
    if (rows.length === 0) return null;

    const current = rows[0];

    // Refuse an overdraft instead of clamping it, so the caller can surface a
    // proper "not enough coins" error rather than quietly taking a partial fee.
    if (coins < 0 && current.coins + coins < 0) return null;
    if (gems < 0 && current.gems + gems < 0) return null;

    // Level-ups roll forward: a large XP award can cross several levels.
    const progress = advanceProgress(current.level, current.xp, xpGain, rules);
    const newXp = progress.xp;
    const newLevel = progress.level;
    const levelUpCoins = progress.levelUpCoins;
    const milestoneRewards = [];
    for (const level of progress.levels) {
        const reward = rewardForLevel(level, rules);
        const [claimed] = await db.query('SELECT id FROM user_level_rewards WHERE user_id = ? AND level = ?', [userId, level]);
        if (claimed.length) continue;
        await db.query(`INSERT INTO user_level_rewards
            (user_id, level, coins_awarded, gems_awarded, pack_awarded, rules_version)
            VALUES (?, ?, ?, ?, '', ?)`, [userId, level, reward.coins, reward.gems, rules.version]);
        milestoneRewards.push(reward);
    }
    const creditedCoins = coins + levelUpCoins + milestoneRewards.reduce((sum, r) => sum + r.coins, 0);
    const creditedGems = gems + milestoneRewards.reduce((sum, r) => sum + r.gems, 0);
    if (current.coins + creditedCoins > WALLET_LIMIT || current.gems + creditedGems > WALLET_LIMIT) throw new RangeError('Wallet limit exceeded');

    await db.query(
        `UPDATE users SET
            coins = GREATEST(0, coins + ?),
            gems = GREATEST(0, gems + ?),
            trophies = GREATEST(0, trophies + ?),
            xp = ?,
            level = ?,
            total_sixes = total_sixes + ?,
            matches_played = matches_played + ?,
            matches_won = matches_won + ?
          WHERE id = ?`,
        [creditedCoins, creditedGems, trophies, newXp, newLevel, sixes, matchPlayed, matchWon, userId]
    );

    await db.query(`INSERT INTO wallet_ledger
        (user_id, reason, coins_delta, gems_delta, xp_awarded, level_before, level_after, coins_after, gems_after, rules_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, String(delta.reason || 'game_action').slice(0, 80),
        creditedCoins, creditedGems, xpGain, current.level, newLevel, current.coins + creditedCoins, current.gems + creditedGems, rules.version]);

    const updated = await getUserById(userId, db);
    return {
        user: updated,
        leveledUp: newLevel > current.level,
        newLevel,
        levelUpCoins,
        milestoneRewards,
        rulesVersion: rules.version
    };
}

/**
 * Reads the batting power the server should use for a player, from their
 * database squad. Never trust a client-supplied power value.
 */
async function getBattingPower(userId, conn = null) {
    const db = conn || getPool();
    const [rows] = await db.query(
        `SELECT power FROM squad_cards
          WHERE user_id = ? AND batting_order > 0 AND is_active = 1
          ORDER BY batting_order ASC LIMIT 1`,
        [userId]
    );
    return rows.length > 0 ? Number(rows[0].power) : null;
}

module.exports = {
    PUBLIC_USER_FIELDS,
    getUserById,
    findBySocialIdentity,
    findGuestByDevice,
    createUser,
    linkSocialIdentity,
    applyWalletDelta,
    getBattingPower,
    generateReferralCode
};
