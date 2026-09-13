const express = require('express');
const router = express.Router();
const { getRoadmapStatusForUser, claimLevelReward } = require('../services/roadmapService');

// GET /api/roadmap/status
router.get('/status', async (req, res) => {
    try {
        const userId = parseInt(req.query.userId || 1, 10);
        const data = await getRoadmapStatusForUser(userId);
        res.json({
            success: true,
            ...data
        });
    } catch (err) {
        console.error('Error fetching roadmap status:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/roadmap/claim
router.post('/claim', async (req, res) => {
    try {
        const { userId, level } = req.body;
        const activeUserId = parseInt(userId || 1, 10);
        const targetLevel = parseInt(level, 10);

        if (!targetLevel) {
            return res.status(400).json({ success: false, message: 'Level is required' });
        }

        const result = await claimLevelReward(activeUserId, targetLevel);
        res.json(result);
    } catch (err) {
        console.error('Error in roadmap claim:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
