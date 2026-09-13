const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// 30 Tier Dual-Track Season Pass Definition (Free Fire Elite Pass Style)
const PASS_TIERS = Array.from({ length: 30 }, (_, i) => {
    const tier = i + 1;
    const tokensRequired = tier * 50;

    // Free Track Rewards
    let freeReward = { type: 'coins', amount: tier * 250, label: `${(tier * 250).toLocaleString()} 🪙`, icon: '🪙' };
    if (tier % 5 === 0) {
        freeReward = { type: 'gems', amount: tier * 5, label: `${tier * 5} 💎`, icon: '💎' };
    }
    if (tier % 10 === 0) {
        freeReward = { type: 'pack', name: 'Elite Card Pack', label: 'Elite Pack 🎁', icon: '🎁' };
    }
    if (tier === 30) {
        freeReward = { type: 'gems', amount: 300, label: '300 💎 Grand Prize', icon: '💎' };
    }

    // Premium Track Rewards (Elite Pass Exclusive)
    let premiumReward = { type: 'gems', amount: 50 + (tier * 10), label: `${50 + (tier * 10)} 💎`, icon: '💎' };
    if (tier % 3 === 0) {
        premiumReward = { type: 'coins', amount: tier * 1000, label: `${(tier * 1000).toLocaleString()} 🪙`, icon: '🪙' };
    }
    if (tier === 1) {
        premiumReward = { type: 'emote', name: 'Helicopter Shot Flex', label: '💥 Helicopter Emote', icon: '🎭' };
    } else if (tier === 10) {
        premiumReward = { type: 'pack', name: 'Master Epic Pack', label: 'Master Epic Chest 👑', icon: '👑' };
    } else if (tier === 20) {
        premiumReward = { type: 'skin', name: 'Neon Thunderball ⚡', label: '⚡ 3D Neon Ball', icon: '⚡' };
    } else if (tier === 30) {
        premiumReward = { type: 'grand_chest', name: 'Immortal King Trophy Chest', label: '🏆 Immortal Chest (1,000 💎 + 100k 🪙)', icon: '🏆' };
    }

    return {
        tier,
        tokensRequired,
        freeReward,
        premiumReward
    };
});

// Daily & Weekly Pass Missions
const PASS_MISSIONS = [
    { id: 'm1', type: 'daily', desc: 'Hit 3 Sixes in live matches 💥', tokens: 30, goal: 3, current: 3, completed: true },
    { id: 'm2', type: 'daily', desc: 'Take 2 Clean Bowled Wickets 🎯', tokens: 25, goal: 2, current: 1, completed: false },
    { id: 'm3', type: 'daily', desc: 'Donate 1 Card copy to a clubmate 🃏', tokens: 20, goal: 1, current: 1, completed: true },
    { id: 'm4', type: 'weekly', desc: 'Win 5 Matches in Adelaide / Dubai 🏟️', tokens: 100, goal: 5, current: 3, completed: false },
    { id: 'm5', type: 'weekly', desc: 'Score 150 Total Runs 🏏', tokens: 120, goal: 150, current: 150, completed: true },
    { id: 'm6', type: 'weekly', desc: 'Achieve 3 Consecutive Win Streak 🔥', tokens: 150, goal: 3, current: 2, completed: false }
];

// GET /api/battlepass/status
router.get('/status', async (req, res) => {
    try {
        const userId = parseInt(req.query.userId || 1, 10);
        const pool = getPool();

        let progress = {
            season_id: 1,
            tokens: 380, // default tokens for tier 7
            is_premium: 0,
            claimed_free_tiers: '[]',
            claimed_premium_tiers: '[]'
        };

        if (pool && userId) {
            const [rows] = await pool.query('SELECT * FROM strike_pass_progress WHERE user_id = ? AND season_id = 1', [userId]);
            if (rows.length > 0) {
                progress = rows[0];
            } else {
                await pool.query('INSERT INTO strike_pass_progress (user_id, season_id, tokens, is_premium, claimed_free_tiers, claimed_premium_tiers) VALUES (?, 1, 380, 0, "[]", "[]")', [userId]);
            }
        }

        const claimedFree = JSON.parse(progress.claimed_free_tiers || '[]');
        const claimedPremium = JSON.parse(progress.claimed_premium_tiers || '[]');
        const currentTokens = progress.tokens || 0;
        const currentTier = Math.min(30, Math.floor(currentTokens / 50));

        // Format tiers with user status
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
                canClaimPremium: isUnlocked && Boolean(progress.is_premium) && !premiumClaimed
            };
        });

        res.json({
            success: true,
            season: 1,
            seasonName: 'Season 1: Strike Royale 🔥',
            daysRemaining: 34,
            currentTokens,
            currentTier,
            isPremium: Boolean(progress.is_premium),
            tiers,
            missions: PASS_MISSIONS
        });
    } catch (err) {
        console.error('Error fetching battlepass status:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/battlepass/claim
router.post('/claim', async (req, res) => {
    try {
        const { userId, tier, isPremium } = req.body;
        const activeUserId = parseInt(userId || 1, 10);
        const targetTier = parseInt(tier, 10);
        const pool = getPool();

        const [rows] = await pool.query('SELECT * FROM strike_pass_progress WHERE user_id = ? AND season_id = 1', [activeUserId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Pass progress not found' });

        const progress = rows[0];
        const tierDef = PASS_TIERS.find(t => t.tier === targetTier);
        if (!tierDef) return res.status(400).json({ success: false, message: 'Invalid tier' });

        if (progress.tokens < tierDef.tokensRequired) {
            return res.status(400).json({ success: false, message: `Reach ${tierDef.tokensRequired} tokens to unlock Tier ${targetTier}!` });
        }

        let reward = null;

        if (isPremium) {
            if (!progress.is_premium) {
                return res.status(403).json({ success: false, message: 'Upgrade to Elite Pass to claim Premium rewards!' });
            }
            const claimedPrem = JSON.parse(progress.claimed_premium_tiers || '[]');
            if (claimedPrem.includes(targetTier)) {
                return res.status(400).json({ success: false, message: 'Already claimed this tier reward' });
            }
            claimedPrem.push(targetTier);
            await pool.query('UPDATE strike_pass_progress SET claimed_premium_tiers = ? WHERE id = ?', [JSON.stringify(claimedPrem), progress.id]);
            reward = tierDef.premiumReward;
        } else {
            const claimedFree = JSON.parse(progress.claimed_free_tiers || '[]');
            if (claimedFree.includes(targetTier)) {
                return res.status(400).json({ success: false, message: 'Already claimed this tier reward' });
            }
            claimedFree.push(targetTier);
            await pool.query('UPDATE strike_pass_progress SET claimed_free_tiers = ? WHERE id = ?', [JSON.stringify(claimedFree), progress.id]);
            reward = tierDef.freeReward;
        }

        // Payout reward to user
        let coinsBonus = 0;
        let gemsBonus = 0;
        if (reward.type === 'coins') coinsBonus = reward.amount || 0;
        if (reward.type === 'gems') gemsBonus = reward.amount || 0;
        if (reward.type === 'grand_chest') { coinsBonus = 100000; gemsBonus = 1000; }

        if (coinsBonus > 0 || gemsBonus > 0) {
            await pool.query('UPDATE users SET coins = coins + ?, gems = gems + ? WHERE id = ?', [coinsBonus, gemsBonus, activeUserId]);
        }

        res.json({
            success: true,
            tier: targetTier,
            reward,
            message: `🎉 Claimed Tier ${targetTier} Reward: ${reward.label}!`
        });
    } catch (err) {
        console.error('Error claiming battlepass reward:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/battlepass/upgrade-premium (Upgrade to Elite Pass for 500 Gems - MANDATORY LOGIN)
router.post('/upgrade-premium', async (req, res) => {
    try {
        const { userId } = req.body;
        const activeUserId = parseInt(userId || 1, 10);
        const pool = getPool();

        const [userRows] = await pool.query('SELECT is_guest, auth_provider, gems FROM users WHERE id = ?', [activeUserId]);
        if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

        const user = userRows[0];
        const isGuest = Boolean(user.is_guest || user.auth_provider === 'guest');

        // MANDATORY LOGIN CHECK
        if (isGuest) {
            return res.status(403).json({
                success: false,
                isGuest: true,
                requireLogin: true,
                message: '🔒 Sign in Required: You must log in with Google Play Games or Facebook to purchase the Elite Strike Pass and secure your VIP rewards across devices!'
            });
        }

        if (user.gems < 500) {
            return res.status(400).json({ success: false, message: 'You need 500 💎 Gems to unlock the Elite Strike Pass!' });
        }

        await pool.query('UPDATE users SET gems = gems - 500 WHERE id = ?', [activeUserId]);
        await pool.query('UPDATE strike_pass_progress SET is_premium = 1 WHERE user_id = ? AND season_id = 1', [activeUserId]);

        res.json({
            success: true,
            message: '👑 Elite Strike Pass Unlocked! Enjoy exclusive rewards, skins, and double XP!'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
