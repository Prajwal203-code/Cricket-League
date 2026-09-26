/**
 * Authentication middleware and token helpers.
 *
 * Before this existed, every route derived the caller's identity from
 * `req.query.userId || 1`, so any client could act as any user simply by
 * changing a query string. Identity now comes only from a signed token that
 * this server issued.
 */
const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Issues a session token. `userId` is the database primary key and is the only
 * identity claim any downstream code should trust.
 */
function issueToken(user) {
    return jwt.sign(
        {
            sub: String(user.id),
            username: user.username,
            isGuest: Boolean(user.is_guest)
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
    );
}

/**
 * Verifies a token and returns its payload, or null when it is missing,
 * expired, tampered with, or signed by a different secret.
 */
function verifyToken(token) {
    if (!token) return null;
    try {
        return jwt.verify(token, config.jwt.secret);
    } catch {
        return null;
    }
}

/** Pulls a bearer token out of the Authorization header. */
function extractToken(req) {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
        return header.slice(7).trim();
    }
    return null;
}

/**
 * Rejects the request unless it carries a valid session token.
 * Sets `req.userId` (number) and `req.auth` (token payload).
 */
function requireAuth(req, res, next) {
    const payload = verifyToken(extractToken(req));

    if (!payload) {
        return res.status(401).json({
            success: false,
            code: 'UNAUTHENTICATED',
            message: 'Sign in to continue.'
        });
    }

    const userId = parseInt(payload.sub, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(401).json({
            success: false,
            code: 'UNAUTHENTICATED',
            message: 'Sign in to continue.'
        });
    }

    req.userId = userId;
    req.auth = payload;
    next();
}

/**
 * Populates `req.userId` when a valid token is present but allows the request
 * through either way. For endpoints that show richer data to signed-in players
 * without requiring it, such as public leaderboards.
 */
function optionalAuth(req, res, next) {
    const payload = verifyToken(extractToken(req));
    if (payload) {
        const userId = parseInt(payload.sub, 10);
        if (Number.isInteger(userId) && userId > 0) {
            req.userId = userId;
            req.auth = payload;
        }
    }
    next();
}

/**
 * Socket.IO handshake guard. Mirrors requireAuth for the realtime layer so a
 * socket cannot claim a playerId the way the old `register_player` event let
 * it. Sets `socket.userId` and `socket.username`.
 */
function socketAuth(socket, next) {
    const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        null;

    const payload = verifyToken(token);
    if (!payload) {
        return next(new Error('UNAUTHENTICATED'));
    }

    const userId = parseInt(payload.sub, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
        return next(new Error('UNAUTHENTICATED'));
    }

    socket.userId = userId;
    socket.username = payload.username || `Player${userId}`;
    socket.isGuest = Boolean(payload.isGuest);
    next();
}

module.exports = {
    issueToken,
    verifyToken,
    requireAuth,
    optionalAuth,
    socketAuth
};
