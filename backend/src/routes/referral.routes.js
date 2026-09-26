/**
 * Referral codes.
 *
 * Fixes to the previous version:
 *  - a player could claim their own code (the inviter lookup fell back to the
 *    claimer's own id when the code matched nobody, so any string paid out)
 *  - the duplicate check keyed partly on a client-supplied `username`, so
 *    re-posting with a different name claimed the same code again
 *  - the inviter was recorded but never actually paid
 *  - the reward amounts were hardcoded here and in the client
 */
const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { applyWalletDelta } = require('../services/userService');
const { REFERRAL } = require('../config/gameRules');

/** GET /api/referral/my-code — the caller's own code and how it has performed. */
router.get('/my-code', requireAuth, async (req, res, next) => {
    try {
        const pool = getPool();
        const [users] = await pool.query(
            'SELECT username, referral_code FROM users WHERE id = ?',
            [req.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Account not found.' });
        }

        const [claims] = await pool.query(`
            SELECT COUNT(*) as claimCount, COALESCE(SUM(coins_reward), 0) as totalCoins
              FROM referrals
             WHERE inviter_user_id = ?
        `, [req.userId]);

        res.json({
            success: true,
            code: users[0].referral_code,
            rewardPerInvite: REFERRAL.inviterCoins,
            stats: {
                claimCount: claims[0].claimCount || 0,
                totalCoinsEarned: claims[0].totalCoins || 0
            }
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/referral/verify — checks a code before the player commits to it.
 * Open to signed-out visitors arriving on an invite link.
 */
router.get('/verify', optionalAuth, async (req, res, next) => {
    try {
        const ref = String(req.query.ref || '').toUpperCase().trim();
        if (!ref) {
            return res.status(400).json({ success: false, code: 'MISSING_CODE', message: 'No referral code provided.' });
        }

        const [users] = await getPool().query(
            'SELECT id, username FROM users WHERE referral_code = ?',
            [ref]
        );

        // Report an unknown code honestly. The old handler always answered
        // `valid: true` and invented an inviter name from the code string.
        if (users.length === 0) {
            return res.json({ success: true, valid: false, code: ref, message: 'That invite code is not recognised.' });
        }

        res.json({
            success: true,
            valid: true,
            code: ref,
            inviterName: users[0].username,
            isOwnCode: req.userId === users[0].id,
            rewardCoins: REFERRAL.inviteeCoins,
            rewardXp: REFERRAL.inviteeXp
        });
    } catch (err) {
        next(err);
    }
});

/** POST /api/referral/claim — redeems someone else's code, once per account. */
router.post('/claim', requireAuth, async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const ref = String(req.body.ref || '').toUpperCase().trim();
        if (!ref) {
            conn.release();
            return res.status(400).json({ success: false, code: 'MISSING_CODE', message: 'No referral code provided.' });
        }

        await conn.beginTransaction();

        const [inviters] = await conn.query('SELECT id, username FROM users WHERE referral_code = ?', [ref]);
        if (inviters.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, code: 'UNKNOWN_CODE', message: 'That invite code is not recognised.' });
        }

        const inviter = inviters[0];
        if (inviter.id === req.userId) {
            await conn.rollback();
            return res.status(400).json({ success: false, code: 'SELF_REFERRAL', message: 'You cannot claim your own invite code.' });
        }

        // One invite reward per account, regardless of how many codes exist.
        const [existing] = await conn.query(
            'SELECT id FROM referrals WHERE claimed_by_user_id = ? LIMIT 1',
            [req.userId]
        );
        if (existing.length > 0) {
            await conn.rollback();
            return res.status(409).json({
                success: false,
                code: 'ALREADY_CLAIMED',
                message: 'You have already claimed an invite reward.'
            });
        }

        const [claimer] = await conn.query('SELECT username FROM users WHERE id = ?', [req.userId]);

        await conn.query(`
            INSERT INTO referrals
                (referral_code, inviter_user_id, claimed_by_user_id, claimed_by_username,
                 coins_reward, xp_reward, status)
            VALUES (?, ?, ?, ?, ?, ?, 'CLAIMED')
        `, [ref, inviter.id, req.userId, claimer[0]?.username || 'Player',
            REFERRAL.inviterCoins, REFERRAL.inviterXp]);

        const claimerResult = await applyWalletDelta(req.userId, {
            coins: REFERRAL.inviteeCoins,
            xp: REFERRAL.inviteeXp
        }, conn);

        // The inviter gets paid too — recorded but never credited before.
        await applyWalletDelta(inviter.id, {
            coins: REFERRAL.inviterCoins,
            xp: REFERRAL.inviterXp
        }, conn);

        await conn.commit();

        res.json({
            success: true,
            inviterName: inviter.username,
            coinsAwarded: REFERRAL.inviteeCoins,
            xpAwarded: REFERRAL.inviteeXp,
            balance: claimerResult ? claimerResult.user.coins : null,
            message: `🎉 ${REFERRAL.inviteeCoins.toLocaleString()} coins and +${REFERRAL.inviteeXp} XP credited to your account!`
        });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

module.exports = router;
