/**
 * Friends, friend requests and daily gifting.
 *
 * Every query in this module used to be hardcoded to `user_id = 1` — the
 * service took no caller at all, so whoever was signed in, the server read and
 * wrote player 1's friends list. The fixes carried here:
 *
 *  - identity is a parameter, supplied by `requireAuth` from a verified token
 *  - `addFriendRequest` used to CREATE AN ACCOUNT from the posted display name
 *    when no user matched it, so typing any string into the search box minted a
 *    forgeable, password-less account and befriended it. Requests now resolve to
 *    an existing player or fail
 *  - "pending requests" listed rows where the caller was `user_id`, i.e. the
 *    requests they had *sent*, and the Accept button on them wrote back to the
 *    same row — so a player could accept their own outgoing request
 *  - friendship is now reciprocal: accepting writes the mirror row, so both
 *    players see each other. Previously only the accepting side ever did
 *  - `gift_sent_today` was set to 1 and never reset by anything, so the gift
 *    button worked exactly once per friend, forever. "Today" is now derived
 *    from `last_gift_date`
 *  - `collectAndSendAllGifts` returned `{ coinsAwarded: 350 }` without touching
 *    a single wallet; the client added 350 coins locally and the next reload
 *    discarded them. Gifts now move real balances through applyWalletDelta
 *  - every friend was reported `online: 1` (a SQL literal). Presence is real
 */
const { getPool, COUNTRY_ROSTERS, NON_MAJOR_COUNTRIES } = require('../config/db');
const { FRIENDS, rankForLevel } = require('../config/gameRules');
const { applyWalletDelta } = require('./userService');
const presence = require('./presence');

const STATUS = { PENDING: 'PENDING', ACCEPTED: 'ACCEPTED' };

function fail(code, message) {
    return { success: false, code, message };
}

function countryFlag(countryCode) {
    if (!countryCode) return '🌐';
    const code = String(countryCode).toUpperCase();
    if (COUNTRY_ROSTERS && COUNTRY_ROSTERS[code]) return COUNTRY_ROSTERS[code].flag;
    if (NON_MAJOR_COUNTRIES && NON_MAJOR_COUNTRIES[code]) return NON_MAJOR_COUNTRIES[code].flag;
    return '🌐';
}

/** Shapes a users row for the friends UI. */
function toPlayerCard(row, extra = {}) {
    return {
        id: row.id,
        playerId: row.id,
        name: row.username,
        flag: countryFlag(row.country_code),
        level: row.level,
        rank: rankForLevel(row.level),
        avatar: row.avatar || '👤',
        trophies: row.trophies,
        online: presence.isOnline(row.id),
        ...extra
    };
}

/**
 * The caller's own account, read fresh from the database.
 *
 * `is_guest` deliberately comes from the row rather than the JWT: a guest who
 * signs in with Google keeps their old token until it expires, and that token
 * still claims `isGuest: true`.
 */
async function loadActor(userId, db = null) {
    const conn = db || getPool();
    const [rows] = await conn.query(
        `SELECT id, username, avatar, level, coins, country_code, is_guest, auth_provider
           FROM users WHERE id = ? LIMIT 1`,
        [userId]
    );
    if (rows.length === 0) return null;

    const user = rows[0];
    user.isGuest = Boolean(user.is_guest || user.auth_provider === 'guest');
    return user;
}

/** Gifts the caller has already sent today, used for the daily cap. */
async function giftsSentToday(userId, conn = null) {
    const db = conn || getPool();
    const [[{ sent }]] = await db.query(
        `SELECT COUNT(*) AS sent FROM friends
          WHERE user_id = ? AND status = 'ACCEPTED' AND last_gift_date = CURDATE()`,
        [userId]
    );
    return Number(sent);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * The friends screen payload: incoming requests, accepted friends, and how many
 * gifts the caller has left today.
 */
async function getFriendsData(userId) {
    const pool = getPool();

    const actor = await loadActor(userId);
    if (!actor) return fail('NO_SUCH_USER', 'Account not found.');

    // Friends are an account-level feature: a guest has no durable identity for
    // anyone to befriend, so the client shows the sign-in prompt instead.
    if (actor.isGuest) {
        return {
            success: true,
            isGuest: true,
            authProvider: 'guest',
            pendingRequests: [],
            friends: [],
            giftsRemainingToday: 0
        };
    }

    // Incoming requests: rows where somebody else named the caller as the
    // target. The old query read `f.user_id = ?`, which is the opposite
    // direction — it listed the caller's own outgoing requests.
    const [pendingRows] = await pool.query(
        `SELECT f.id AS requestId, u.id, u.username, u.avatar, u.level,
                u.trophies, u.country_code
           FROM friends f
           JOIN users u ON u.id = f.user_id
          WHERE f.friend_user_id = ? AND f.status = 'PENDING'
          ORDER BY f.id DESC`,
        [userId]
    );

    const [friendRows] = await pool.query(
        `SELECT f.id AS relationId, u.id, u.username, u.avatar, u.level,
                u.trophies, u.country_code,
                (f.last_gift_date = CURDATE()) AS gift_sent_today
           FROM friends f
           JOIN users u ON u.id = f.friend_user_id
          WHERE f.user_id = ? AND f.status = 'ACCEPTED'
          ORDER BY u.trophies DESC, u.level DESC`,
        [userId]
    );

    const sentToday = await giftsSentToday(userId);

    return {
        success: true,
        isGuest: false,
        authProvider: actor.auth_provider,
        pendingRequests: pendingRows.map(row => toPlayerCard(row, { requestId: row.requestId })),
        friends: friendRows.map(row => toPlayerCard(row, {
            relationId: row.relationId,
            giftSent: Boolean(row.gift_sent_today)
        })),
        giftsRemainingToday: Math.max(0, FRIENDS.maxGiftsPerDay - sentToday)
    };
}

/**
 * Finds real players by username prefix.
 *
 * This replaces the old "type a name and we'll create that account for you"
 * behaviour. Excludes the caller, guests (nothing to befriend), and anyone
 * already connected to the caller in either direction.
 */
async function searchPlayers(userId, query) {
    const term = String(query ?? '').trim();
    if (term.length < FRIENDS.searchMinLength) {
        return fail('QUERY_TOO_SHORT', `Type at least ${FRIENDS.searchMinLength} characters.`);
    }

    const pool = getPool();
    // Escape LIKE wildcards so a search for "%" does not match every player.
    const pattern = `${term.replace(/[\\%_]/g, '\\$&')}%`;

    const [rows] = await pool.query(
        `SELECT u.id, u.username, u.avatar, u.level, u.trophies, u.country_code
           FROM users u
          WHERE u.username LIKE ? ESCAPE '\\\\'
            AND u.id <> ?
            AND u.is_guest = 0
            AND NOT EXISTS (
                SELECT 1 FROM friends f
                 WHERE (f.user_id = ? AND f.friend_user_id = u.id)
                    OR (f.user_id = u.id AND f.friend_user_id = ?)
            )
          ORDER BY u.trophies DESC
          LIMIT ?`,
        [pattern, userId, userId, userId, FRIENDS.searchLimit]
    );

    return { success: true, players: rows.map(row => toPlayerCard(row)) };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * Sends a friend request to an existing player, by id or exact username.
 *
 * The client historically posted `{ name, level, avatar }` and the server
 * believed all three. Only the identifier is read now; level and avatar come
 * from the target's own row.
 */
async function sendFriendRequest(userId, { targetUserId, name } = {}) {
    const pool = getPool();

    const actor = await loadActor(userId);
    if (!actor) return fail('NO_SUCH_USER', 'Account not found.');
    if (actor.isGuest) return fail('GUEST_LOCKED', 'Sign in to add friends.');

    let target = null;
    const targetId = Number(targetUserId);

    if (Number.isInteger(targetId) && targetId > 0) {
        const [rows] = await pool.query(
            `SELECT id, username, avatar, level, trophies, country_code, is_guest
               FROM users WHERE id = ? LIMIT 1`,
            [targetId]
        );
        target = rows[0] || null;
    } else if (name) {
        const [rows] = await pool.query(
            `SELECT id, username, avatar, level, trophies, country_code, is_guest
               FROM users WHERE username = ? LIMIT 1`,
            [String(name).trim()]
        );
        target = rows[0] || null;
    }

    if (!target) return fail('NO_SUCH_PLAYER', 'No player found with that name.');
    if (target.id === userId) return fail('SELF_REQUEST', 'You cannot add yourself.');
    if (target.is_guest) return fail('TARGET_IS_GUEST', 'That player has not signed in yet.');

    const [[{ friendCount }]] = await pool.query(
        "SELECT COUNT(*) AS friendCount FROM friends WHERE user_id = ? AND status = 'ACCEPTED'",
        [userId]
    );
    if (friendCount >= FRIENDS.maxFriends) {
        return fail('FRIEND_LIMIT', `You can have at most ${FRIENDS.maxFriends} friends.`);
    }

    // Either direction counts: if they already asked us, there is nothing to
    // send — the caller should accept instead.
    const [existing] = await pool.query(
        `SELECT user_id, friend_user_id, status FROM friends
          WHERE (user_id = ? AND friend_user_id = ?)
             OR (user_id = ? AND friend_user_id = ?)`,
        [userId, target.id, target.id, userId]
    );

    for (const row of existing) {
        if (row.status === STATUS.ACCEPTED) {
            return fail('ALREADY_FRIENDS', `You and ${target.username} are already friends.`);
        }
        if (row.user_id === userId) {
            return fail('ALREADY_REQUESTED', 'Your request is still waiting for an answer.');
        }
        return fail('REQUEST_INCOMING', `${target.username} already sent you a request — accept it instead.`);
    }

    await pool.query(
        `INSERT INTO friends (user_id, friend_user_id, status)
         VALUES (?, ?, 'PENDING')
         ON DUPLICATE KEY UPDATE status = 'PENDING'`,
        [userId, target.id]
    );

    return {
        success: true,
        message: `Friend request sent to ${target.username}.`,
        target: toPlayerCard(target)
    };
}

/**
 * Accepts a request addressed to the caller and writes the mirror row so the
 * friendship exists in both directions.
 */
async function acceptFriendRequest(userId, fromUserId) {
    const pool = getPool();
    const requesterId = Number(fromUserId);

    if (!Number.isInteger(requesterId) || requesterId <= 0) {
        return fail('INVALID_REQUEST', 'That request is no longer available.');
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Only a row where the caller is the *target* can be accepted. The old
        // query matched `user_id = 1 AND (id = ? OR friend_user_id = ?)`, which
        // let a player accept a request they had sent themselves.
        const [rows] = await conn.query(
            `SELECT id FROM friends
              WHERE user_id = ? AND friend_user_id = ? AND status = 'PENDING'
              FOR UPDATE`,
            [requesterId, userId]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return fail('NO_SUCH_REQUEST', 'That request is no longer available.');
        }

        await conn.query(
            "UPDATE friends SET status = 'ACCEPTED' WHERE id = ?",
            [rows[0].id]
        );
        await conn.query(
            `INSERT INTO friends (user_id, friend_user_id, status)
             VALUES (?, ?, 'ACCEPTED')
             ON DUPLICATE KEY UPDATE status = 'ACCEPTED'`,
            [userId, requesterId]
        );

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    const [friendRows] = await pool.query(
        `SELECT id, username, avatar, level, trophies, country_code
           FROM users WHERE id = ? LIMIT 1`,
        [requesterId]
    );

    return {
        success: true,
        friend: friendRows[0] ? toPlayerCard(friendRows[0], { giftSent: false }) : null
    };
}

/** Declines a request addressed to the caller. */
async function declineFriendRequest(userId, fromUserId) {
    const requesterId = Number(fromUserId);
    if (!Number.isInteger(requesterId) || requesterId <= 0) {
        return fail('INVALID_REQUEST', 'That request is no longer available.');
    }

    const [result] = await getPool().query(
        `DELETE FROM friends
          WHERE user_id = ? AND friend_user_id = ? AND status = 'PENDING'`,
        [requesterId, userId]
    );

    if (result.affectedRows === 0) {
        return fail('NO_SUCH_REQUEST', 'That request is no longer available.');
    }
    return { success: true };
}

// ---------------------------------------------------------------------------
// Gifting
// ---------------------------------------------------------------------------

/**
 * Sends one friend their daily gift.
 *
 * Coins land in the recipient's wallet and the sender is paid a thank-you, both
 * through applyWalletDelta inside one transaction. `last_gift_date` is the
 * cooldown — the old `gift_sent_today` flag had nothing to clear it.
 */
async function sendFriendGift(userId, friendUserId) {
    const pool = getPool();
    const targetId = Number(friendUserId);

    if (!Number.isInteger(targetId) || targetId <= 0) {
        return fail('INVALID_FRIEND', 'Pick a friend to gift.');
    }
    if (targetId === userId) {
        return fail('SELF_GIFT', 'You cannot gift yourself.');
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT id, (last_gift_date = CURDATE()) AS alreadyToday FROM friends
              WHERE user_id = ? AND friend_user_id = ? AND status = 'ACCEPTED'
              FOR UPDATE`,
            [userId, targetId]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return fail('NOT_FRIENDS', 'You are not friends with that player.');
        }
        if (rows[0].alreadyToday) {
            await conn.rollback();
            return fail('ALREADY_GIFTED', "You already sent today's gift to that friend.");
        }

        const [[{ sent }]] = await conn.query(
            `SELECT COUNT(*) AS sent FROM friends
              WHERE user_id = ? AND status = 'ACCEPTED' AND last_gift_date = CURDATE()`,
            [userId]
        );
        if (Number(sent) >= FRIENDS.maxGiftsPerDay) {
            await conn.rollback();
            return fail('DAILY_LIMIT', `You have sent all ${FRIENDS.maxGiftsPerDay} gifts for today.`);
        }

        await conn.query(
            'UPDATE friends SET gift_sent_today = 1, last_gift_date = CURDATE() WHERE id = ?',
            [rows[0].id]
        );

        await applyWalletDelta(targetId, { coins: FRIENDS.giftCoinsToRecipient }, conn);
        const senderResult = await applyWalletDelta(userId, {
            coins: FRIENDS.giftCoinsToSender,
            xp: FRIENDS.giftXpToSender
        }, conn);

        await conn.commit();

        return {
            success: true,
            coinsAwarded: FRIENDS.giftCoinsToSender,
            xpAwarded: FRIENDS.giftXpToSender,
            coinsSentToFriend: FRIENDS.giftCoinsToRecipient,
            giftsRemainingToday: Math.max(0, FRIENDS.maxGiftsPerDay - (Number(sent) + 1)),
            user: senderResult ? senderResult.user : null,
            leveledUp: senderResult ? senderResult.leveledUp : false
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Gifts every friend who has not had one today, up to the daily cap.
 *
 * The previous implementation stamped `gift_sent_today = 1` on the whole list
 * and returned an invented 350 coins / 25 XP that no wallet ever saw.
 */
async function collectAndSendAllGifts(userId) {
    const pool = getPool();
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        const [[{ sent }]] = await conn.query(
            `SELECT COUNT(*) AS sent FROM friends
              WHERE user_id = ? AND status = 'ACCEPTED' AND last_gift_date = CURDATE()`,
            [userId]
        );

        const remaining = Math.max(0, FRIENDS.maxGiftsPerDay - Number(sent));
        if (remaining === 0) {
            await conn.rollback();
            return fail('DAILY_LIMIT', `You have sent all ${FRIENDS.maxGiftsPerDay} gifts for today.`);
        }

        const [targets] = await conn.query(
            `SELECT id, friend_user_id FROM friends
              WHERE user_id = ? AND status = 'ACCEPTED'
                AND (last_gift_date IS NULL OR last_gift_date < CURDATE())
              ORDER BY id ASC
              LIMIT ?
              FOR UPDATE`,
            [userId, remaining]
        );

        if (targets.length === 0) {
            await conn.rollback();
            return fail('NOTHING_TO_SEND', 'All your friends already have today\'s gift.');
        }

        await conn.query(
            'UPDATE friends SET gift_sent_today = 1, last_gift_date = CURDATE() WHERE id IN (?)',
            [targets.map(t => t.id)]
        );

        for (const target of targets) {
            await applyWalletDelta(target.friend_user_id, {
                coins: FRIENDS.giftCoinsToRecipient
            }, conn);
        }

        const coinsAwarded = targets.length * FRIENDS.giftCoinsToSender;
        const xpAwarded = targets.length * FRIENDS.giftXpToSender;
        const senderResult = await applyWalletDelta(userId, {
            coins: coinsAwarded,
            xp: xpAwarded
        }, conn);

        await conn.commit();

        return {
            success: true,
            giftsSent: targets.length,
            coinsAwarded,
            xpAwarded,
            coinsSentToFriends: targets.length * FRIENDS.giftCoinsToRecipient,
            giftsRemainingToday: remaining - targets.length,
            user: senderResult ? senderResult.user : null,
            leveledUp: senderResult ? senderResult.leveledUp : false
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    getFriendsData,
    searchPlayers,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    sendFriendGift,
    collectAndSendAllGifts,
    // exported for reuse and tests
    countryFlag,
    toPlayerCard
};
