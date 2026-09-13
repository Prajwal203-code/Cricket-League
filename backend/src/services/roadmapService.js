const { getPool } = require('../config/db');

/**
 * Level Roadmap System Engine
 * Standardized, lifetime milestone progression for all players.
 * Pre-defines levels 1-50 with handcrafted milestone rewards and dynamically generates unlimited levels (51+).
 */

// XP Required Formula matching client
function getXpForLevel(lvl) {
    return Math.round(50 * Math.pow(lvl, 1.35));
}

// Handcrafted Milestone Definitions for Levels 1 - 50
const CURATED_LEVEL_REWARDS = {
    1: { coins: 500, gems: 25, pack: 'Basic Starter Pack', unlock: 'Tour 1: Mumbai Stadium 🏟️', icon: '🎁', isKeyMilestone: false },
    2: { coins: 1000, gems: 15, pack: null, unlock: 'Tour 2: Karachi Stadium 🏟️', icon: '🪙', isKeyMilestone: false },
    3: { coins: 1500, gems: 20, pack: 'Elite Pack', unlock: 'Tour 3: Adelaide + Clubs 🛡️', icon: '🎁', isKeyMilestone: true },
    4: { coins: 2000, gems: 25, pack: null, unlock: 'Rare Card Upgrade ⚡', icon: '🪙', isKeyMilestone: false },
    5: { coins: 3500, gems: 50, pack: 'Master Pack', unlock: 'Tour 4: Dubai Stadium 🏟️', icon: '👑', isKeyMilestone: true },
    6: { coins: 4000, gems: 30, pack: null, unlock: 'Rare Batter Card 🃏', icon: '🪙', isKeyMilestone: false },
    7: { coins: 5000, gems: 35, pack: 'Elite Pack', unlock: 'Tour 5: Johannesburg 🏟️', icon: '🎁', isKeyMilestone: true },
    8: { coins: 6000, gems: 40, pack: null, unlock: 'Mystery Bowler Crate 📦', icon: '🪙', isKeyMilestone: false },
    9: { coins: 7500, gems: 45, pack: null, unlock: 'Squad Power Boost +5% ⚡', icon: '⚡', isKeyMilestone: false },
    10: { coins: 12000, gems: 100, pack: 'Master Epic Pack', unlock: 'Tour 6: Cape Town 🏟️', icon: '👑', isKeyMilestone: true },
    11: { coins: 13000, gems: 50, pack: null, unlock: 'Fast Bowler Training 🏏', icon: '🪙', isKeyMilestone: false },
    12: { coins: 14000, gems: 55, pack: 'Elite Pack', unlock: 'Gold Spin Token 🎡', icon: '🎁', isKeyMilestone: false },
    13: { coins: 15000, gems: 60, pack: null, unlock: 'Rare All-Rounder Card 🃏', icon: '🪙', isKeyMilestone: false },
    14: { coins: 16500, gems: 65, pack: null, unlock: 'Express Delivery Booster ⚡', icon: '⚡', isKeyMilestone: false },
    15: { coins: 22000, gems: 150, pack: 'Master Epic Pack', unlock: 'Tour 7: Melbourne 🏟️', icon: '👑', isKeyMilestone: true },
    16: { coins: 24000, gems: 75, pack: null, unlock: 'Super Striker Glove 🧤', icon: '🪙', isKeyMilestone: false },
    17: { coins: 26000, gems: 80, pack: 'Elite Pack', unlock: 'Mystery Spin Chest 📦', icon: '🎁', isKeyMilestone: false },
    18: { coins: 28000, gems: 85, pack: null, unlock: 'Power Hitter Booster 💥', icon: '🪙', isKeyMilestone: false },
    19: { coins: 30000, gems: 90, pack: null, unlock: 'Club Donation Bonus +20% 🛡️', icon: '⚡', isKeyMilestone: false },
    20: { coins: 40000, gems: 250, pack: 'Legendary Bowler Chest', unlock: 'Tour 8: London Lord\'s 🏟️', icon: '👑', isKeyMilestone: true },
    21: { coins: 42000, gems: 100, pack: null, unlock: 'Rare Mystery Pack 📦', icon: '🪙', isKeyMilestone: false },
    22: { coins: 45000, gems: 105, pack: 'Elite Pack', unlock: 'Gold Sixes Trophy 🏆', icon: '🎁', isKeyMilestone: false },
    23: { coins: 48000, gems: 110, pack: null, unlock: 'Anchor Batter Boost 🏏', icon: '🪙', isKeyMilestone: false },
    24: { coins: 52000, gems: 115, pack: null, unlock: 'Precision Bowling Ring 🎯', icon: '⚡', isKeyMilestone: false },
    25: { coins: 65000, gems: 350, pack: 'Grand Master Chest', unlock: 'Exclusive 3D Ball Skin 🔥', icon: '👑', isKeyMilestone: true },
    26: { coins: 70000, gems: 125, pack: null, unlock: 'Master Stadium Pitch 🏟️', icon: '🪙', isKeyMilestone: false },
    27: { coins: 75000, gems: 130, pack: 'Elite Pack', unlock: 'Double Spin Wheel 🎡', icon: '🎁', isKeyMilestone: false },
    28: { coins: 80000, gems: 135, pack: null, unlock: 'Epic Wicketkeeper Card 🧤', icon: '🪙', isKeyMilestone: false },
    29: { coins: 85000, gems: 140, pack: null, unlock: 'Extreme Reverse Swing ⚡', icon: '⚡', isKeyMilestone: false },
    30: { coins: 100000, gems: 500, pack: 'Legendary Batsman Chest', unlock: 'Master League Star Badge 🌟', icon: '👑', isKeyMilestone: true },
    31: { coins: 110000, gems: 150, pack: null, unlock: 'Gold Strike Frame 🖼️', icon: '🪙', isKeyMilestone: false },
    32: { coins: 120000, gems: 160, pack: 'Elite Pack', unlock: 'Pro Spin Bowler Pack 📦', icon: '🎁', isKeyMilestone: false },
    33: { coins: 130000, gems: 170, pack: null, unlock: 'Yorker Specialist Boost 🎯', icon: '🪙', isKeyMilestone: false },
    34: { coins: 140000, gems: 180, pack: null, unlock: 'Power Batsman Aura 💫', icon: '⚡', isKeyMilestone: false },
    35: { coins: 165000, gems: 600, pack: 'Virtuoso Mega Chest', unlock: 'Virtuoso League Arena 🏟️', icon: '👑', isKeyMilestone: true },
    36: { coins: 175000, gems: 190, pack: null, unlock: 'Champion Glove Upgrade 🧤', icon: '🪙', isKeyMilestone: false },
    37: { coins: 185000, gems: 200, pack: 'Elite Pack', unlock: 'Diamond Spin Token 🎡', icon: '🎁', isKeyMilestone: false },
    38: { coins: 195000, gems: 210, pack: null, unlock: 'Express Bouncer Booster 💥', icon: '🪙', isKeyMilestone: false },
    39: { coins: 210000, gems: 220, pack: null, unlock: 'Legendary Field Cap 🧢', icon: '⚡', isKeyMilestone: false },
    40: { coins: 250000, gems: 750, pack: 'Champion Crown Chest', unlock: 'Champion Crown Badge 👑', icon: '👑', isKeyMilestone: true },
    41: { coins: 260000, gems: 230, pack: null, unlock: 'Extreme Curve Bowler ⚡', icon: '🪙', isKeyMilestone: false },
    42: { coins: 275000, gems: 240, pack: 'Elite Pack', unlock: 'Mystery Legendary Pack 📦', icon: '🎁', isKeyMilestone: false },
    43: { coins: 290000, gems: 250, pack: null, unlock: 'Super Helicopter Shot 🏏', icon: '🪙', isKeyMilestone: false },
    44: { coins: 310000, gems: 260, pack: null, unlock: 'Clubs Mega Chest Perk 🛡️', icon: '⚡', isKeyMilestone: false },
    45: { coins: 350000, gems: 900, pack: 'Immortal Legend Pack', unlock: 'Immortal Aura Effect ✨', icon: '👑', isKeyMilestone: true },
    46: { coins: 370000, gems: 280, pack: null, unlock: 'Grand Master Stadium 🏟️', icon: '🪙', isKeyMilestone: false },
    47: { coins: 390000, gems: 300, pack: 'Elite Pack', unlock: 'Gold Trophy Frame 🏆', icon: '🎁', isKeyMilestone: false },
    48: { coins: 410000, gems: 320, pack: null, unlock: 'All-Star Cricket Badge 🌟', icon: '🪙', isKeyMilestone: false },
    49: { coins: 440000, gems: 350, pack: null, unlock: 'Legendary Squad Upgrade ⚡', icon: '⚡', isKeyMilestone: false },
    50: { coins: 500000, gems: 1500, pack: 'Grand Supreme Immortal Chest', unlock: 'Grand Immortal Trophy 🏆 + All Unlocks', icon: '👑', isKeyMilestone: true }
};

/**
 * Returns the reward definition for any level (1 to 50 curated, 51+ unlimited formula)
 */
function getRewardForLevel(level) {
    if (CURATED_LEVEL_REWARDS[level]) {
        return {
            level,
            xpRequired: getXpForLevel(level),
            ...CURATED_LEVEL_REWARDS[level]
        };
    }

    // Unlimited Algorithmic Level Formula (51+)
    const isMultipleOf10 = (level % 10 === 0);
    const isMultipleOf5 = (level % 5 === 0);

    const coins = level * 350;
    const gems = isMultipleOf10 ? (level * 15) : isMultipleOf5 ? (level * 8) : 35;
    const pack = isMultipleOf10 ? 'Grand Supreme Chest' : isMultipleOf5 ? 'Master Epic Pack' : 'Elite Pack';
    const icon = isMultipleOf10 ? '👑' : isMultipleOf5 ? '🎁' : '🪙';
    const unlock = isMultipleOf10 ? `Supreme Milestone Star ⭐ ${level}` : isMultipleOf5 ? `Master Tier Perk Lv.${level} ⚡` : `Power Booster Lv.${level}`;

    return {
        level,
        xpRequired: getXpForLevel(level),
        coins,
        gems,
        pack,
        unlock,
        icon,
        isKeyMilestone: isMultipleOf5
    };
}

/**
 * Builds the complete roadmap dataset up to maxLevel (defaults to 50, expands dynamically for higher level players)
 */
async function getRoadmapStatusForUser(userId) {
    const pool = getPool();
    let currentLevel = 1;
    let currentXp = 0;
    let claimedLevels = new Set();

    if (pool && userId) {
        try {
            // 1. Fetch user level & xp
            const [userRows] = await pool.query('SELECT level, xp, coins, gems FROM users WHERE id = ?', [userId]);
            if (userRows.length > 0) {
                currentLevel = userRows[0].level || 1;
                currentXp = userRows[0].xp || 0;
            }

            // 2. Fetch already claimed milestone levels
            const [claimedRows] = await pool.query('SELECT level FROM user_level_rewards WHERE user_id = ?', [userId]);
            claimedRows.forEach(r => claimedLevels.add(r.level));
        } catch (e) {
            console.warn('Roadmap DB fetch fallback:', e.message);
        }
    }

    // Always display at least up to level 50, or beyond if user reached higher level
    const displayMaxLevel = Math.max(50, currentLevel + 10);
    const roadmapNodes = [];

    for (let lvl = 1; lvl <= displayMaxLevel; lvl++) {
        const reward = getRewardForLevel(lvl);
        const isClaimed = claimedLevels.has(lvl);
        const isUnlocked = (lvl <= currentLevel);
        const isCurrent = (lvl === currentLevel);
        const canClaim = isUnlocked && !isClaimed;

        roadmapNodes.push({
            ...reward,
            isUnlocked,
            isCurrent,
            isClaimed,
            canClaim
        });
    }

    const currentLevelXpReq = getXpForLevel(currentLevel);

    return {
        currentLevel,
        currentXp,
        currentLevelXpReq,
        totalClaimedCount: claimedLevels.size,
        displayMaxLevel,
        roadmap: roadmapNodes
    };
}

/**
 * Claims a specific milestone level reward for a user
 */
async function claimLevelReward(userId, targetLevel) {
    const pool = getPool();
    if (!pool || !userId) {
        return { success: false, message: 'Database connection unavailable' };
    }

    const lvl = parseInt(targetLevel, 10);
    if (!lvl || lvl < 1) {
        return { success: false, message: 'Invalid level specified' };
    }

    try {
        // 1. Check user current level
        const [userRows] = await pool.query('SELECT level, coins, gems FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
            return { success: false, message: 'User not found' };
        }

        const user = userRows[0];
        if (user.level < lvl) {
            return { success: false, message: `You need to reach Level ${lvl} to claim this reward!` };
        }

        // 2. Check if already claimed
        const [existingClaim] = await pool.query('SELECT id FROM user_level_rewards WHERE user_id = ? AND level = ?', [userId, lvl]);
        if (existingClaim.length > 0) {
            return { success: false, message: `Level ${lvl} reward has already been claimed.` };
        }

        // 3. Get reward details
        const reward = getRewardForLevel(lvl);

        // 4. Credit coins and gems to user
        await pool.query(`
            UPDATE users 
            SET coins = coins + ?, 
                gems = gems + ? 
            WHERE id = ?
        `, [reward.coins || 0, reward.gems || 0, userId]);

        // 5. Record claim in user_level_rewards
        await pool.query(`
            INSERT INTO user_level_rewards (user_id, level, coins_awarded, gems_awarded, pack_awarded)
            VALUES (?, ?, ?, ?, ?)
        `, [userId, lvl, reward.coins || 0, reward.gems || 0, reward.pack || '']);

        // Fetch updated balances
        const [updatedUser] = await pool.query('SELECT coins, gems, level FROM users WHERE id = ?', [userId]);

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
            updatedUser: updatedUser[0]
        };
    } catch (err) {
        console.error('SQL Error claiming level reward:', err.message);
        return { success: false, message: err.message };
    }
}

module.exports = {
    getXpForLevel,
    getRewardForLevel,
    getRoadmapStatusForUser,
    claimLevelReward,
    CURATED_LEVEL_REWARDS
};
