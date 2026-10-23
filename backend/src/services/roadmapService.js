const { getPool } = require('../config/db');
const { applyWalletDelta } = require('./userService');
const { getRules } = require('../config/liveRules');
const { xpForLevel: getXpForLevel, rewardForLevel: getRewardForLevel } = require('./progression');

async function getRoadmapStatusForUser(userId, requestedStart) {
    const rules = getRules();
    const [users] = await getPool().query('SELECT level, xp FROM users WHERE id = ?', [userId]);
    if (!users.length) throw Object.assign(new Error('Account not found'), { status: 404 });
    const user = users[0];
    const [claims] = await getPool().query('SELECT level, coins_awarded, gems_awarded FROM user_level_rewards WHERE user_id = ?', [userId]);
    const claimed = new Map(claims.map(r => [r.level, r]));
    // Bounded pages keep high-level profiles as quick to open as new profiles.
    const defaultStart = Math.max(1, user.level - 20);
    const startLevel = Number.isInteger(requestedStart) && requestedStart >= 1
        ? Math.min(requestedStart, rules.xp.maxLevel) : defaultStart;
    const displayMaxLevel = Math.min(rules.xp.maxLevel, startLevel + 49);
    const [tours] = await getPool().query('SELECT name, min_level FROM tours ORDER BY tour_number');
    const roadmap = [];
    for (let level = startLevel; level <= displayMaxLevel; level++) {
        const reward = getRewardForLevel(level, rules);
        const receipt = claimed.get(level);
        const unlocks = tours.filter(t => t.min_level === level).map(t => t.name);
        roadmap.push({ ...reward,
            ...(receipt ? { coins: receipt.coins_awarded, gems: receipt.gems_awarded } : {}),
            unlock: unlocks.length ? `${reward.unlock} - Unlocks ${unlocks.join(', ')}` : reward.unlock,
            isUnlocked: level <= user.level, isCurrent: level === user.level,
            isClaimed: !!receipt, canClaim: level <= user.level && !receipt
        });
    }
    const claimable = [];
    for (let level = 1; level <= user.level; level++) if (!claimed.has(level)) claimable.push(getRewardForLevel(level, rules));
    claimable.sort((a, b) => b.priority - a.priority || b.level - a.level);
    return {
        currentLevel: user.level, currentXp: user.xp, currentLevelXpReq: getXpForLevel(user.level, rules),
        totalClaimedCount: claimed.size, displayMaxLevel, startLevel,
        previousStart: startLevel > 1 ? Math.max(1, startLevel - 50) : null,
        nextStart: displayMaxLevel < rules.xp.maxLevel ? displayMaxLevel + 1 : null,
        maxLevel: rules.xp.maxLevel, rulesVersion: rules.version, autoGrantOnLevelUp: true,
        recommendedClaim: claimable[0] || null, claimableCount: claimable.length,
        nextMilestone: user.level < rules.xp.maxLevel ? getRewardForLevel(Math.min(rules.xp.maxLevel,
            (Math.floor(user.level / rules.milestones.every) + 1) * rules.milestones.every), rules) : null,
        roadmap
    };
}

async function claimLevelReward(userId, targetLevel) {
    const pool = getPool();
    const lvl = targetLevel;
    const rules = getRules();
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > rules.xp.maxLevel) {
        return { success: false, code: 'INVALID_LEVEL', message: 'Invalid level specified.' };
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [userRows] = await conn.query('SELECT level FROM users WHERE id = ? FOR UPDATE', [userId]);
        if (userRows.length === 0) {
            await conn.rollback();
            return { success: false, code: 'NOT_FOUND', message: 'Account not found.' };
        }
        if (userRows[0].level < lvl) {
            await conn.rollback();
            return {
                success: false,
                code: 'LEVEL_NOT_REACHED',
                message: `You need to reach Level ${lvl} to claim this reward!`
            };
        }

        const reward = getRewardForLevel(lvl, rules);

        try {
            await conn.query(`
                INSERT INTO user_level_rewards (user_id, level, coins_awarded, gems_awarded, pack_awarded, rules_version)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [userId, lvl, reward.coins || 0, reward.gems || 0, '', rules.version]);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                await conn.rollback();
                return {
                    success: false,
                    code: 'ALREADY_CLAIMED',
                    message: `Level ${lvl} reward has already been claimed.`
                };
            }
            throw err;
        }

        const result = await applyWalletDelta(userId, {
            coins: reward.coins || 0,
            gems: reward.gems || 0, reason: `milestone:${lvl}`
        }, conn, rules);

        await conn.commit();

        return {
            success: true,
            message: `🎉 Level ${lvl} Reward Claimed!`,
            reward: {
                level: lvl,
                coins: reward.coins,
                gems: reward.gems,
                pack: reward.pack,
                unlock: reward.unlock
            },
            updatedUser: result ? result.user : null
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { getXpForLevel, getRewardForLevel, getRoadmapStatusForUser, claimLevelReward };
