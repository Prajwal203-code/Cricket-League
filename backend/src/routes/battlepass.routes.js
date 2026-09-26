/**
 * Strike Pass routes.
 *
 * All logic lives in services/battlePassService — tier rewards, token totals
 * and mission progress are computed from the player's real match history there.
 * These handlers only translate its results into HTTP.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getPassStatus, claimTier, upgradeToPremium } = require('../services/battlePassService');

router.use(requireAuth);

/** GET /api/battlepass/status */
router.get('/status', async (req, res, next) => {
    try {
        const status = await getPassStatus(req.userId);
        res.json({ success: true, ...status });
    } catch (err) {
        next(err);
    }
});

/** POST /api/battlepass/claim — { tier, isPremium } */
router.post('/claim', async (req, res, next) => {
    try {
        const tier = parseInt(req.body.tier, 10);
        if (!Number.isInteger(tier) || tier < 1) {
            return res.status(400).json({ success: false, code: 'INVALID_TIER', message: 'A valid tier is required.' });
        }

        const result = await claimTier(req.userId, tier, req.body.isPremium === true);
        const { status = 200, ...body } = result;
        res.status(result.success ? 200 : status).json(body);
    } catch (err) {
        next(err);
    }
});

/** POST /api/battlepass/upgrade-premium — buys the Elite track. */
router.post('/upgrade-premium', async (req, res, next) => {
    try {
        const result = await upgradeToPremium(req.userId);
        const { status = 200, ...body } = result;
        res.status(result.success ? 200 : status).json(body);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
