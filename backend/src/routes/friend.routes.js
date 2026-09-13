const express = require('express');
const router = express.Router();
const friendService = require('../services/friendService');

// Get all friends and pending requests from MySQL
router.get('/', async (req, res) => {
    try {
        const data = await friendService.getFriendsData();
        res.json(data);
    } catch (err) {
        res.status(500).json({ pendingRequests: [], friends: [] });
    }
});

// Send a friend request
router.post('/request', async (req, res) => {
    try {
        const result = await friendService.addFriendRequest(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Accept a friend request
router.post('/accept', async (req, res) => {
    try {
        const { requestId } = req.body;
        const result = await friendService.acceptFriendRequest(requestId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Decline a friend request
router.post('/decline', async (req, res) => {
    try {
        const { requestId } = req.body;
        const result = await friendService.declineFriendRequest(requestId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Send gift to a friend
router.post('/gift', async (req, res) => {
    try {
        const { friendId } = req.body;
        const result = await friendService.sendFriendGift(friendId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Collect & send gifts to all
router.post('/collect-all', async (req, res) => {
    try {
        const result = await friendService.collectAndSendAllGifts();
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
