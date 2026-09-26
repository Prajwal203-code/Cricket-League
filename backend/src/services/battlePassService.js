/**
 * Strike Pass progression.
 *
 * Tokens are earned by playing matches and missions are aggregated from
 * `match_history`. The previous implementation seeded every account at 380
 * tokens ("default tokens for tier 7") and shipped six mission rows with
 * hardcoded `current`/`completed` values, so the pass showed the same invented
 * progress to every player regardless of what they had done.
 */
const { getPool } = require('../config/db');
const { PASS, PASS_MISSIONS } = require('../config/gameRules');
const { applyWalletDelta } = require('./userService');

/**
 * The 30-tier dual-track reward table. Derived rather than stored: tier N's
 * rewards are a pure function of N, so there is nothing to keep in sync.
 */
const PASS_TIERS = Array.from({ length: PASS.tiers }, (_, i) => {
    const tier = i + 1;

    let freeReward = {
        type: 'coins', amount: tier * 250,
        label: `${(tier * 250).toLocaleString()} 🪙`, icon: '🪙'
    };
    if (tier % 5 === 0) {
        freeReward = { type: 'gems', amount: tier * 5, label: `${tier * 5} 💎`, icon: '💎' };
    }
    if (tier % 10 === 0) {
        freeReward = { type: 'pack', name: 'Elite Card Pack', label: 'Elite Pack 🎁', icon: '🎁' };
    }
    if (tier === PASS.tiers) {
        freeReward = { type: 'gems', amount: 300, label: '300 💎 Grand Prize', icon: '💎' };
    }

    let premiumReward = {
        type: 'gems', amount: 50 + tier * 10,
        label: `${50 + tier * 10} 💎`, icon: '💎'
    };
    if (tier % 3 === 0) {
        premiumReward = {
            type: 'coins', amount: tier * 1000,
            label: `${(tier * 1000).toLocaleString()} 🪙`, icon: '🪙'
        };
    }
    if (tier === 1) {
        premiumReward = { type: 'emote', name: 'Helicopter Shot Flex', label: '💥 Helicopter Emote', icon: '🎭' };
    } else if (tier === 10) {
        premiumReward = { type: 'pack', name: 'Master Epic Pack', label: 'Master Epic Chest 👑', icon: '👑' };
    } else if (tier === 20) {
        premiumReward = { type: 'skin', name: 'Neon Thunderball ⚡', label: '⚡ 3D Neon Ball', icon: '⚡' };
    } else if (tier === PASS.tiers) {
        premiumReward = {
            type: 'grand_chest', name: 'Immortal King Trophy Chest',
            label: `🏆 Immortal Chest (${PASS.grandChestGems.toLocaleString()} 💎 + ${(PASS.grandChestCoins / 1000)}k 🪙)`,
            icon: '🏆'
        };
    }

    return { tier, tokensRequired: tier * PASS.tokensPerTier, freeReward, premiumReward };
});

/** Coins and gems a reward is worth. Non-currency rewards pay nothing here. */
function rewardValue(reward) {
    if (reward.type === 'coins') return { coins: reward.amount || 0, gems: 0 };
    if (reward.type === 'gems') return { coins: 0, gems: reward.amount || 0 };
    if (reward.type === 'grand_chest') {
        return { coins: PASS.grandChestCoins, gems: PASS.grandChestGems };
    }
    return { coins: 0, gems: 0 };
}

function safeParseTiers(raw) {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed.filter(Number.isInteger) : [];
    } catch {
        return [];
    }
}

/** Ensures the caller has a progress row, and returns it. */
async function ensureProgress(userId, conn = null) {
    const db = conn || getPool();
    await db.query(`
        INSERT INTO strike_pass_progress
            (user_id, season_id, tokens, is_premium, claimed_free_tiers, claimed_premium_tiers, season_started_at)
        VALUES (?, 1, 0, 0, '[]', '[]', NOW())
        ON DUPLICATE KEY UPDATE user_id = user_id
    `, [userId]);

    const [rows] = await db.query(
        'SELECT * FROM strike_pass_progress WHERE user_id = ? AND season_id = 1',
        [userId]
    );
    return rows[0];
}

/**
 * Awards tokens for a completed match. Called from match settlement inside the
 * same transaction, so tokens and coins cannot diverge.
 */
async function awardMatchTokens(userId, { won, sixes }, conn = null) {
    const db = conn || getPool();
    const tokens = PASS.tokensPerMatch
        + (won ? PASS.tokensPerWin : 0)
        + Math.max(0, sixes) * PASS.tokensPerSix;

    await db.query(`
        INSERT INTO strike_pass_progress
            (user_id, season_id, tokens, is_premium, claimed_free_tiers, claimed_premium_tiers, season_started_at)
        VALUES (?, 1, ?, 0, '[]', '[]', NOW())
        ON DUPLICATE KEY UPDATE tokens = tokens + VALUES(tokens)
    `, [userId, tokens]);

    return tokens;
}

/**
 * Aggregates the player's real match record over a window.
 *
 * `match_history` stores two players per row, so each statistic is summed from
 * whichever side the player batted on.
 */
async function aggregateStats(userId, sinceSql) {
    const [rows] = await getPool().query(`
        SELECT
            COUNT(*) AS matches,
            SUM(CASE WHEN winner_user_id = ? THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN p1_user_id = ? THEN p1_score ELSE p2_score END) AS runs,
            SUM(CASE WHEN p1_user_id = ? THEN p1_sixes ELSE p2_sixes END) AS sixes,
            SUM(CASE WHEN p1_user_id = ? THEN p2_wickets ELSE p1_wickets END) AS wickets
          FROM match_history
         WHERE (p1_user_id = ? OR p2_user_id = ?)
           AND created_at >= ${sinceSql}
    `, [userId, userId, userId, userId, userId, userId]);

    const r = rows[0] || {};
    return {
        matches: Number(r.matches || 0),
        wins: Number(r.wins || 0),
        runs: Number(r.runs || 0),
        sixes: Number(r.sixes || 0),
        // Wickets the player took are the wickets their *opponent* lost.
        wickets: Number(r.wickets || 0)
    };
}

/** Longest run of consecutive wins inside the window. */
async function bestWinStreak(userId, sinceSql) {
    const [rows] = await getPool().query(`
        SELECT winner_user_id
          FROM match_history
         WHERE (p1_user_id = ? OR p2_user_id = ?)
           AND created_at >= ${sinceSql}
         ORDER BY created_at ASC
    `, [userId, userId]);

    let best = 0;
    let run = 0;
    for (const row of rows) {
        if (row.winner_user_id === userId) {
            run += 1;
            if (run > best) best = run;
        } else {
            run = 0;
        }
    }
    return best;
}

/** Builds the mission list with progress measured from real matches. */
async function buildMissions(userId) {
    const [daily, weekly, streak] = await Promise.all([
        aggregateStats(userId, 'CURDATE()'),
        aggregateStats(userId, 'DATE_SUB(CURDATE(), INTERVAL 7 DAY)'),
        bestWinStreak(userId, 'DATE_SUB(CURDATE(), INTERVAL 7 DAY)')
    ]);

    return PASS_MISSIONS.map(m => {
        const source = m.type === 'daily' ? daily : weekly;
        const current = m.metric === 'bestStreak' ? streak : (source[m.metric] || 0);
        return {
            id: m.id,
            type: m.type,
            desc: m.desc,
            tokens: m.tokens,
            goal: m.goal,
            current: Math.min(current, m.goal),
            rawCurrent: current,
            completed: current >= m.goal
        };
    });
}

/** Everything the pass screen needs for one player. */
async function getPassStatus(userId) {
    const progress = await ensureProgress(userId);

    const claimedFree = safeParseTiers(progress.claimed_free_tiers);
    const claimedPremium = safeParseTiers(progress.claimed_premium_tiers);
    const currentTokens = Number(progress.tokens || 0);
    const isPremium = Boolean(progress.is_premium);

    const tiers = PASS_TIERS.map(t => {
        const isUnlocked = currentTokens >= t.tokensRequired;
        const freeClaimed = claimedFree.includes(t.tier);
        const premiumClaimed = claimedPremium.includes(t.tier);
        return {
            ...t,
            isUnlocked,
            freeClaimed,
            premiumClaimed,
            canClaimFree: isUnlocked && !freeClaimed,
            canClaimPremium: isUnlocked && isPremium && !premiumClaimed
        };
    });

    const startedAt = progress.season_started_at
        ? new Date(progress.season_started_at).getTime()
        : Date.now();
    const endsAt = startedAt + PASS.seasonDays * 86400000;

    return {
        season: progress.season_id || 1,
        seasonName: 'Season 1: Strike Royale 🔥',
        daysRemaining: Math.max(0, Math.ceil((endsAt - Date.now()) / 86400000)),
        currentTokens,
        currentTier: Math.min(PASS.tiers, Math.floor(currentTokens / PASS.tokensPerTier)),
        tokensPerTier: PASS.tokensPerTier,
        isPremium,
        premiumCostGems: PASS.premiumCostGems,
        tiers,
        missions: await buildMissions(userId)
    };
}

/**
 * Claims one tier's reward on one track.
 *
 * The claimed-tier list is re-read under a row lock and rewritten in the same
 * transaction as the payout — previously the check and the write were separate
 * statements, so two concurrent claims of the same tier both paid out.
 */
async function claimTier(userId, targetTier, wantPremium) {
    const tierDef = PASS_TIERS.find(t => t.tier === targetTier);
    if (!tierDef) {
        return { success: false, status: 400, code: 'INVALID_TIER', message: 'That tier does not exist.' };
    }

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            'SELECT * FROM strike_pass_progress WHERE user_id = ? AND season_id = 1 FOR UPDATE',
            [userId]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return { success: false, status: 404, code: 'NO_PROGRESS', message: 'No pass progress found.' };
        }

        const progress = rows[0];
        if (Number(progress.tokens || 0) < tierDef.tokensRequired) {
            await conn.rollback();
            return {
                success: false, status: 400, code: 'TIER_LOCKED',
                message: `Reach ${tierDef.tokensRequired} tokens to unlock Tier ${targetTier}!`
            };
        }

        const column = wantPremium ? 'claimed_premium_tiers' : 'claimed_free_tiers';
        const claimed = safeParseTiers(progress[column]);

        if (wantPremium && !progress.is_premium) {
            await conn.rollback();
            return {
                success: false, status: 403, code: 'NOT_PREMIUM',
                message: 'Upgrade to Elite Pass to claim Premium rewards!'
            };
        }
        if (claimed.includes(targetTier)) {
            await conn.rollback();
            return {
                success: false, status: 409, code: 'ALREADY_CLAIMED',
                message: 'You have already claimed this tier reward.'
            };
        }

        claimed.push(targetTier);
        await conn.query(
            `UPDATE strike_pass_progress SET ${column} = ? WHERE id = ?`,
            [JSON.stringify(claimed), progress.id]
        );

        const reward = wantPremium ? tierDef.premiumReward : tierDef.freeReward;
        const value = rewardValue(reward);
        const wallet = await applyWalletDelta(userId, value, conn);

        await conn.commit();

        return {
            success: true,
            tier: targetTier,
            track: wantPremium ? 'premium' : 'free',
            reward,
            coinsAwarded: value.coins,
            gemsAwarded: value.gems,
            balance: wallet ? wallet.user.coins : null,
            gems: wallet ? wallet.user.gems : null,
            message: `🎉 Claimed Tier ${targetTier} Reward: ${reward.label}!`
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/** Buys the premium track. Signed-in accounts only, so the pass survives a reinstall. */
async function upgradeToPremium(userId) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [userRows] = await conn.query(
            'SELECT is_guest, auth_provider FROM users WHERE id = ? FOR UPDATE',
            [userId]
        );
        if (userRows.length === 0) {
            await conn.rollback();
            return { success: false, status: 404, code: 'NOT_FOUND', message: 'Account not found.' };
        }

        const user = userRows[0];
        if (user.is_guest || user.auth_provider === 'guest') {
            await conn.rollback();
            return {
                success: false, status: 403, code: 'REQUIRE_LOGIN', isGuest: true, requireLogin: true,
                message: '🔒 Sign in required: log in with Google or Facebook to buy the Elite Strike Pass and keep it across devices.'
            };
        }

        const [progressRows] = await conn.query(
            'SELECT id, is_premium FROM strike_pass_progress WHERE user_id = ? AND season_id = 1 FOR UPDATE',
            [userId]
        );
        if (progressRows.length > 0 && progressRows[0].is_premium) {
            await conn.rollback();
            return {
                success: false, status: 409, code: 'ALREADY_PREMIUM',
                message: 'You already own the Elite Strike Pass.'
            };
        }

        const wallet = await applyWalletDelta(userId, { gems: -PASS.premiumCostGems }, conn);
        if (!wallet) {
            await conn.rollback();
            return {
                success: false, status: 400, code: 'INSUFFICIENT_GEMS',
                message: `You need ${PASS.premiumCostGems} 💎 Gems to unlock the Elite Strike Pass!`
            };
        }

        await conn.query(`
            INSERT INTO strike_pass_progress
                (user_id, season_id, tokens, is_premium, claimed_free_tiers, claimed_premium_tiers, season_started_at)
            VALUES (?, 1, 0, 1, '[]', '[]', NOW())
            ON DUPLICATE KEY UPDATE is_premium = 1
        `, [userId]);

        await conn.commit();

        return {
            success: true,
            gems: wallet.user.gems,
            gemsSpent: PASS.premiumCostGems,
            message: '👑 Elite Strike Pass unlocked! Exclusive rewards and skins are now claimable.'
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    PASS_TIERS,
    ensureProgress,
    awardMatchTokens,
    getPassStatus,
    claimTier,
    upgradeToPremium
};
