const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getRoadmapStatusForUser, claimLevelReward } = require('../services/roadmapService');

router.use(requireAuth);

/** GET /api/roadmap/status */
router.get('/status', async (req, res, next) => {
    try {
        const data = await getRoadmapStatusForUser(req.userId, req.query.start === undefined ? undefined : Number(req.query.start));
        res.json({ success: true, ...data });
    } catch (err) {
        next(err);
    }
});

/** POST /api/roadmap/claim — claims the reward for a level the caller has reached. */
router.post('/claim', async (req, res, next) => {
    try {
        const targetLevel = req.body.level;
        if (!Number.isInteger(targetLevel) || targetLevel < 1) {
            return res.status(400).json({ success: false, code: 'INVALID_LEVEL', message: 'A valid level is required.' });
        }

        const result = await claimLevelReward(req.userId, targetLevel);
        res.json(result);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
