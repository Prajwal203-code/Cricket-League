/**
 * Friends, friend requests and daily gifts.
 *
 * Every handler here used to call a service that ignored the caller entirely
 * and operated on `user_id = 1`, so a signed-in player managed somebody else's
 * friends list. Identity now comes from the verified session token.
 *
 * Errors are passed to the global handler rather than answered with
 * `err.message`, which previously returned raw SQL text to the browser.
 */
const express = require('express');
const router = express.Router();
const friendService = require('../services/friendService');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

/** Maps a service failure code onto an HTTP status. */
const STATUS_FOR = {
    NO_SUCH_USER: 404,
    NO_SUCH_PLAYER: 404,
    NO_SUCH_REQUEST: 404,
    GUEST_LOCKED: 403,
    TARGET_IS_GUEST: 400,
    SELF_REQUEST: 400,
    SELF_GIFT: 400,
    INVALID_REQUEST: 400,
    INVALID_FRIEND: 400,
    QUERY_TOO_SHORT: 400,
    ALREADY_FRIENDS: 409,
    ALREADY_REQUESTED: 409,
    REQUEST_INCOMING: 409,
    ALREADY_GIFTED: 409,
    NOT_FRIENDS: 403,
    FRIEND_LIMIT: 409,
    DAILY_LIMIT: 429,
    NOTHING_TO_SEND: 409
};

function send(res, result) {
    if (result && result.success === false) {
        return res.status(STATUS_FOR[result.code] || 400).json(result);
    }
    return res.json(result);
}

/** The friends screen: incoming requests, friends, remaining gifts. */
router.get('/', async (req, res, next) => {
    try {
        send(res, await friendService.getFriendsData(req.userId));
    } catch (err) {
        next(err);
    }
});

/** Finds real players to add. Replaces "type a name, we'll invent that user". */
router.get('/search', async (req, res, next) => {
    try {
        send(res, await friendService.searchPlayers(req.userId, req.query.q));
    } catch (err) {
        next(err);
    }
});

router.post('/request', async (req, res, next) => {
    try {
        const { targetUserId, name } = req.body || {};
        send(res, await friendService.sendFriendRequest(req.userId, { targetUserId, name }));
    } catch (err) {
        next(err);
    }
});

router.post('/accept', async (req, res, next) => {
    try {
        // `fromUserId` is the player who sent the request. The old contract
        // accepted either a friends-row id or a user id in the same field,
        // which is what let a player accept their own outgoing request.
        const { fromUserId } = req.body || {};
        send(res, await friendService.acceptFriendRequest(req.userId, fromUserId));
    } catch (err) {
        next(err);
    }
});

router.post('/decline', async (req, res, next) => {
    try {
        const { fromUserId } = req.body || {};
        send(res, await friendService.declineFriendRequest(req.userId, fromUserId));
    } catch (err) {
        next(err);
    }
});

router.post('/gift', async (req, res, next) => {
    try {
        const { friendUserId } = req.body || {};
        send(res, await friendService.sendFriendGift(req.userId, friendUserId));
    } catch (err) {
        next(err);
    }
});

router.post('/collect-all', async (req, res, next) => {
    try {
        send(res, await friendService.collectAndSendAllGifts(req.userId));
    } catch (err) {
        next(err);
    }
});

module.exports = router;
