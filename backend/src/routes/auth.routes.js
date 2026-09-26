const express = require('express');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();
const config = require('../config/env');
const { issueToken, requireAuth } = require('../middleware/auth');
const {
    getUserById,
    findBySocialIdentity,
    findGuestByDevice,
    createUser,
    linkSocialIdentity
} = require('../services/userService');

const googleClient = config.google.enabled ? new OAuth2Client(config.google.clientId) : null;

/**
 * Verifies a Google ID token against Google's published signing keys.
 *
 * The previous implementation called `jwt.decode()`, which parses a token
 * without checking its signature — anyone could hand-craft a payload naming
 * any account and be signed in as them. `verifyIdToken` checks the signature,
 * issuer, audience and expiry.
 */
async function verifyGoogleIdToken(idToken) {
    if (!googleClient) {
        throw Object.assign(new Error('Google Sign-In is not configured'), { status: 503 });
    }

    let ticket;
    try {
        ticket = await googleClient.verifyIdToken({
            idToken,
            audience: config.google.clientId
        });
    } catch (err) {
        throw Object.assign(new Error('Google token verification failed'), {
            status: 401,
            cause: err
        });
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
        throw Object.assign(new Error('Google token missing subject'), { status: 401 });
    }
    if (payload.email && payload.email_verified === false) {
        throw Object.assign(new Error('Google email is not verified'), { status: 401 });
    }

    return {
        socialId: payload.sub,
        email: payload.email || null,
        name: payload.name || payload.given_name || null,
        avatar: payload.picture || null
    };
}

/**
 * Verifies a Facebook user access token via the Graph debug_token endpoint,
 * then reads the profile. debug_token confirms the token was issued for *our*
 * app, which a plain /me call does not.
 */
async function verifyFacebookToken(accessToken) {
    if (!config.facebook.enabled) {
        throw Object.assign(new Error('Facebook Login is not configured'), { status: 503 });
    }

    const appToken = `${config.facebook.appId}|${config.facebook.appSecret}`;
    const debugUrl =
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}` +
        `&access_token=${encodeURIComponent(appToken)}`;

    const debugRes = await fetch(debugUrl);
    const debugBody = await debugRes.json().catch(() => null);
    const data = debugBody && debugBody.data;

    if (!debugRes.ok || !data || !data.is_valid || String(data.app_id) !== String(config.facebook.appId)) {
        throw Object.assign(new Error('Facebook token verification failed'), { status: 401 });
    }

    const profileUrl =
        `https://graph.facebook.com/v19.0/${encodeURIComponent(data.user_id)}` +
        `?fields=id,name,email,picture&access_token=${encodeURIComponent(accessToken)}`;

    const profileRes = await fetch(profileUrl);
    const profile = await profileRes.json().catch(() => ({}));

    return {
        socialId: data.user_id,
        email: profile.email || null,
        name: profile.name || null,
        avatar: profile.picture?.data?.url || null
    };
}

/**
 * GET /api/auth/config
 * Public client IDs so the browser can initialise the SDKs. Secrets are never
 * included. `enabled` flags let the UI hide buttons that cannot work.
 */
router.get('/config', (req, res) => {
    res.json({
        success: true,
        google: { enabled: config.google.enabled, clientId: config.google.clientId },
        facebook: { enabled: config.facebook.enabled, appId: config.facebook.appId }
    });
});

/**
 * POST /api/auth/guest
 * Anonymous play tied to a device-generated id, so a guest keeps their
 * progress across sessions on the same device. Replaces the old behaviour of
 * silently treating every unauthenticated caller as user 1.
 */
router.post('/guest', async (req, res, next) => {
    try {
        const rawDeviceId = String(req.body.deviceId || '').trim();

        // Must be unguessable: the device id is the only thing standing between
        // an anonymous account and anyone who wants to resume it.
        if (!/^[A-Za-z0-9_-]{16,64}$/.test(rawDeviceId)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_DEVICE_ID',
                message: 'A valid device identifier is required.'
            });
        }

        let user = await findGuestByDevice(rawDeviceId);
        let isNew = false;

        if (!user) {
            const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
            user = await createUser({
                username: `Guest_${suffix}`,
                provider: 'guest',
                socialId: rawDeviceId,
                countryCode: 'IN'
            });
            isNew = true;
        }

        res.json({
            success: true,
            isNew,
            token: issueToken(user),
            user: await getUserById(user.id)
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/auth/social-signin
 * Exchanges a verified Google or Facebook token for a session token.
 *
 * If the caller presents a valid guest session, the social identity is linked
 * onto that existing account so their progress carries over.
 */
router.post('/social-signin', async (req, res, next) => {
    try {
        const { provider, googleCredential, facebookAccessToken } = req.body;

        let identity;
        if (provider === 'google') {
            if (!googleCredential) {
                return res.status(400).json({
                    success: false, code: 'MISSING_CREDENTIAL',
                    message: 'A Google credential is required.'
                });
            }
            identity = await verifyGoogleIdToken(googleCredential);
        } else if (provider === 'facebook') {
            if (!facebookAccessToken) {
                return res.status(400).json({
                    success: false, code: 'MISSING_CREDENTIAL',
                    message: 'A Facebook access token is required.'
                });
            }
            identity = await verifyFacebookToken(facebookAccessToken);
        } else {
            return res.status(400).json({
                success: false, code: 'UNSUPPORTED_PROVIDER',
                message: 'Unsupported sign-in provider.'
            });
        }

        // 1. Already linked — sign straight in.
        let user = await findBySocialIdentity(provider, identity.socialId);
        let isNew = false;

        if (!user) {
            // 2. Upgrading a guest session: keep their existing progress.
            const { verifyToken } = require('../middleware/auth');
            const header = req.headers.authorization || '';
            const current = header.startsWith('Bearer ')
                ? verifyToken(header.slice(7).trim())
                : null;

            const guestId = current ? parseInt(current.sub, 10) : NaN;
            const guest = Number.isInteger(guestId) ? await getUserById(guestId) : null;

            if (guest && guest.is_guest) {
                user = await linkSocialIdentity(guest.id, {
                    provider,
                    socialId: identity.socialId,
                    email: identity.email,
                    avatar: identity.avatar
                });
            } else {
                // 3. Genuinely new player.
                user = await createUser({
                    username: identity.name || `Player_${identity.socialId.slice(-6)}`,
                    provider,
                    socialId: identity.socialId,
                    email: identity.email,
                    avatar: identity.avatar
                });
                isNew = true;
            }
        }

        res.json({
            success: true,
            isNew,
            token: issueToken(user),
            user: await getUserById(user.id)
        });
    } catch (err) {
        if (err.status) {
            console.error('[auth] social sign-in rejected:', err.message);
            return res.status(err.status).json({
                success: false,
                code: 'SIGNIN_FAILED',
                message: err.message
            });
        }
        next(err);
    }
});

/**
 * GET /api/auth/me
 * The current session's own account. Replaces `/current`, which read its
 * target from `?userId=` and so would return anyone's record.
 */
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const user = await getUserById(req.userId);
        if (!user) {
            return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Account not found.' });
        }
        res.json({ success: true, user, isGuest: Boolean(user.is_guest) });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
