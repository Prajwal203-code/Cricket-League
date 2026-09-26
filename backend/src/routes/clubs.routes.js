/**
 * Clubs: membership, roster management, chat, card donations and the weekly
 * chest.
 *
 * Fixes carried by this rewrite:
 *  - Every handler read its caller from `req.query.userId || 1` or
 *    `req.body.userId || 1`, so any client could act as any player: kick a
 *    member of a club it had never joined, transfer someone else's leadership,
 *    or post chat as another user. Identity now comes from the session token.
 *  - `/create` checked the coin balance and deducted it in two separate
 *    statements with no transaction, so two concurrent requests could both pass
 *    the check; the club row, the leader membership and the debit could also
 *    half-apply on failure.
 *  - `/donate-card` only counted the *total* donations on a request, never who
 *    made them. One player could fill all five copies of a request repeatedly,
 *    farming 50 coins and 10 XP per click. It also never checked that the donor
 *    was in the same club as the request.
 *  - Leaving as LEADER left `clubs.leader_user_id` pointing at a player who was
 *    no longer a member, and the club had no leader from then on.
 *  - `/accept-request` removed the applicant from their previous club without
 *    decrementing that club's member count.
 *  - `POST /api/clubs/claim-chest` is called by the client but never existed on
 *    the server, so the claim button silently did nothing.
 *  - Errors returned `err.message`, leaking SQL text to the client.
 */
const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { CLUB } = require('../config/gameRules');
const { applyWalletDelta } = require('../services/userService');
const {
    ASSIGNABLE_ROLES,
    rankOf,
    weekKey,
    getMembership,
    loadActor,
    postSystemMessage,
    generateClubTag,
    getChestProgress
} = require('../services/clubService');

router.use(requireAuth);

/** Guests are limited to browsing; clubs need a real account. */
function guestBlocked(res, message) {
    return res.status(403).json({ success: false, isGuest: true, message });
}

/**
 * Trims free text and drops the characters that let a stored value break out of
 * the markup it is rendered into. Several of these fields are interpolated into
 * the client's `innerHTML`, so this is the first of two defences — the render
 * site escapes as well.
 */
function cleanText(value, maxLength) {
    return String(value ?? '')
        .replace(/[<>"`\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

/**
 * Stricter form for values the client drops into an HTML *attribute* — the
 * challenge stadium reaches `onclick="acceptFriendlyBattle('...')"`, where a
 * bare apostrophe is enough to break out.
 */
function cleanAttributeText(value, maxLength) {
    return cleanText(value, maxLength).replace(/['&();]/g, '');
}

// ---------------------------------------------------------------------------
// GET /api/clubs — my club, roster, feed, and the browse list
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        const pool = getPool();
        const actor = await loadActor(req.userId);
        if (!actor) {
            return res.status(404).json({ success: false, message: 'Account not found.' });
        }

        if (actor.isGuest) {
            return res.json({
                success: true,
                isGuest: true,
                myClub: null,
                members: [],
                messages: [],
                clubs: [],
                pendingRequests: [],
                myPendingClubIds: [],
                chest: null,
                message: 'Guest players must sign in with Google Play Games or Facebook to access Clubs.'
            });
        }

        const [myClubRows] = await pool.query(`
            SELECT c.*, cm.role, cm.contribution_trophies, cm.donations_weekly
              FROM club_members cm
              JOIN clubs c ON cm.club_id = c.id
             WHERE cm.user_id = ?
        `, [req.userId]);

        let myClub = null;
        let members = [];
        let messages = [];
        let chest = null;
        let pendingRequests = [];

        if (myClubRows.length > 0) {
            myClub = myClubRows[0];

            const [memberRows] = await pool.query(`
                SELECT cm.role, cm.contribution_trophies, cm.donations_weekly, cm.joined_at,
                       u.id AS user_id, u.username AS name, u.level, u.avatar, u.trophies, u.country_code
                  FROM club_members cm
                  JOIN users u ON cm.user_id = u.id
                 WHERE cm.club_id = ?
                 ORDER BY FIELD(cm.role, 'LEADER', 'CO_LEADER', 'ELDER', 'MEMBER'), u.trophies DESC
            `, [myClub.id]);
            members = memberRows;

            const [msgRows] = await pool.query(`
                SELECT id, user_id, username, avatar, message_type, content, card_name,
                       card_role, donations_received, donations_max, created_at
                  FROM club_messages
                 WHERE club_id = ?
                 ORDER BY id DESC
                 LIMIT ?
            `, [myClub.id, CLUB.chatHistoryLimit]);
            // Newest-first in SQL so the LIMIT keeps the *recent* messages;
            // the feed renders oldest-first.
            messages = msgRows.reverse();

            chest = await getChestProgress(myClub.id, req.userId);

            if (rankOf(myClub.role) >= rankOf('ELDER')) {
                const [reqs] = await pool.query(`
                    SELECT * FROM club_join_requests
                     WHERE club_id = ? AND status = 'PENDING'
                     ORDER BY id DESC
                `, [myClub.id]);
                pendingRequests = reqs;
            }
        }

        const [allClubs] = await pool.query(`
            SELECT c.*, u.username AS leader_name
              FROM clubs c
              LEFT JOIN users u ON c.leader_user_id = u.id
             ORDER BY c.total_trophies DESC
             LIMIT 100
        `);

        const [myPendingReqs] = await pool.query(
            "SELECT club_id FROM club_join_requests WHERE user_id = ? AND status = 'PENDING'",
            [req.userId]
        );

        res.json({
            success: true,
            isGuest: false,
            myClub,
            members,
            messages,
            clubs: allClubs,
            pendingRequests,
            myPendingClubIds: myPendingReqs.map(r => r.club_id),
            chest
        });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/create
// ---------------------------------------------------------------------------
router.post('/create', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const name = cleanText(req.body.name, CLUB.nameMaxLength);
        const badge = cleanText(req.body.badge, CLUB.badgeMaxLength) || '🛡️';
        const description = cleanText(req.body.description, CLUB.descriptionMaxLength)
            || 'Welcome to our club!';
        const minTrophies = Math.max(0, Math.trunc(Number(req.body.minTrophies) || 0));
        const clubType = ['OPEN', 'INVITE_ONLY', 'CLOSED'].includes(req.body.clubType)
            ? req.body.clubType
            : 'OPEN';

        if (name.length < CLUB.nameMinLength) {
            return res.status(400).json({
                success: false,
                message: `Club name must be at least ${CLUB.nameMinLength} characters.`
            });
        }

        await conn.beginTransaction();

        const actor = await loadActor(req.userId, conn);
        if (!actor) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Account not found.' });
        }
        if (actor.isGuest) {
            await conn.rollback();
            return guestBlocked(res, '🔒 Guest players cannot create clubs. Please sign in with Google Play Games or Facebook.');
        }

        const existing = await getMembership(req.userId, conn);
        if (existing) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: '⚠️ One person can belong to only one club! Leave your current club before creating a new one.'
            });
        }

        const [nameClash] = await conn.query('SELECT id FROM clubs WHERE club_name = ? LIMIT 1', [name]);
        if (nameClash.length > 0) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'That club name is already taken.' });
        }

        // applyWalletDelta refuses to overdraw, so this is both the affordability
        // check and the debit — previously two separate statements with a race
        // between them.
        const paid = await applyWalletDelta(req.userId, { coins: -CLUB.createCostCoins }, conn);
        if (!paid) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: `You need ${CLUB.createCostCoins.toLocaleString()} 🪙 Coins to create a Club!`
            });
        }

        const tag = await generateClubTag(conn, name);

        const [insertRes] = await conn.query(`
            INSERT INTO clubs
                (club_name, badge_icon, tag, level, min_trophies, club_type,
                 member_count, max_members, total_trophies, leader_user_id, description, country)
            VALUES (?, ?, ?, 1, ?, ?, 1, ?, ?, ?, ?, ?)
        `, [
            name, badge, tag, minTrophies, clubType,
            CLUB.maxMembers, actor.trophies, req.userId, description,
            actor.country_code || 'IN'
        ]);

        const clubId = insertRes.insertId;

        await conn.query(`
            INSERT INTO club_members (club_id, user_id, role, contribution_trophies)
            VALUES (?, ?, 'LEADER', ?)
        `, [clubId, req.userId, actor.trophies]);

        // A pending request elsewhere would otherwise still be acceptable and
        // silently move the new leader out of the club they just paid for.
        await conn.query('DELETE FROM club_join_requests WHERE user_id = ?', [req.userId]);

        await postSystemMessage(conn, clubId, actor,
            `👑 ${actor.username} founded the club! Welcome strikers!`);

        await conn.commit();

        res.json({
            success: true,
            clubId,
            tag,
            coins: paid.user.coins,
            message: `🎉 Club '${name}' created successfully!`
        });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/request-join
// ---------------------------------------------------------------------------
router.post('/request-join', async (req, res, next) => {
    try {
        const pool = getPool();
        const clubId = Number(req.body.clubId);
        if (!Number.isInteger(clubId) || clubId <= 0) {
            return res.status(400).json({ success: false, message: 'Unknown club.' });
        }

        const actor = await loadActor(req.userId);
        if (!actor) return res.status(404).json({ success: false, message: 'Account not found.' });
        if (actor.isGuest) {
            return guestBlocked(res, '🔒 Guest players cannot join clubs. Please sign in with Google Play Games or Facebook.');
        }

        if (await getMembership(req.userId)) {
            return res.status(400).json({
                success: false,
                message: 'You are already a member of a club! Leave your current club before requesting to join another.'
            });
        }

        const [clubs] = await pool.query('SELECT * FROM clubs WHERE id = ?', [clubId]);
        if (clubs.length === 0) {
            return res.status(404).json({ success: false, message: 'Club not found.' });
        }
        const club = clubs[0];

        if (club.club_type === 'CLOSED') {
            return res.status(403).json({ success: false, message: '🔒 This club is closed to new members.' });
        }
        if (club.member_count >= club.max_members) {
            return res.status(400).json({
                success: false,
                message: `Club is currently full (${club.member_count}/${club.max_members} members).`
            });
        }
        if (actor.trophies < club.min_trophies) {
            return res.status(400).json({
                success: false,
                message: `🔒 Requires at least ${club.min_trophies} 🏆 trophies to request!`
            });
        }

        await pool.query(`
            INSERT INTO club_join_requests (club_id, user_id, username, avatar, trophies, level, status)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
            ON DUPLICATE KEY UPDATE status = 'PENDING', trophies = VALUES(trophies), level = VALUES(level)
        `, [clubId, req.userId, actor.username, actor.avatar || '👤', actor.trophies, actor.level]);

        await postSystemMessage(pool, clubId, actor,
            `📝 ${actor.username} sent a request to join the club!`);

        res.json({ success: true, message: `📨 Join request sent to ${club.club_name} leaders!` });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/accept-request
// ---------------------------------------------------------------------------
router.post('/accept-request', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const requestId = Number(req.body.requestId);
        if (!Number.isInteger(requestId) || requestId <= 0) {
            return res.status(400).json({ success: false, message: 'Unknown request.' });
        }

        await conn.beginTransaction();

        const membership = await getMembership(req.userId, conn);
        if (!membership || rankOf(membership.role) < rankOf('ELDER')) {
            await conn.rollback();
            return res.status(403).json({
                success: false,
                message: 'Only Club Leaders and Elders can approve join requests!'
            });
        }

        const clubId = membership.club_id;

        // Locked so two officers accepting at once cannot take the club over
        // its member cap or both process the same request.
        const [reqRows] = await conn.query(
            'SELECT * FROM club_join_requests WHERE id = ? AND club_id = ? FOR UPDATE',
            [requestId, clubId]
        );
        if (reqRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Join request not found or already processed.' });
        }
        const joinReq = reqRows[0];

        const [clubRows] = await conn.query(
            'SELECT member_count, max_members, club_name FROM clubs WHERE id = ? FOR UPDATE',
            [clubId]
        );
        const club = clubRows[0];
        if (club.member_count >= club.max_members) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: `Club is already full (${club.member_count}/${club.max_members})!`
            });
        }

        const applicant = await loadActor(joinReq.user_id, conn);
        if (!applicant) {
            await conn.query('DELETE FROM club_join_requests WHERE id = ?', [requestId]);
            await conn.commit();
            return res.status(404).json({ success: false, message: 'That player no longer exists.' });
        }

        // If they joined somewhere else while this request sat pending, take
        // them off that club's books properly. The old code deleted the row and
        // left the other club's member_count one too high forever.
        const previous = await getMembership(applicant.id, conn);
        if (previous) {
            if (previous.club_id === clubId) {
                await conn.query('DELETE FROM club_join_requests WHERE id = ?', [requestId]);
                await conn.commit();
                return res.json({ success: true, message: `${applicant.username} is already in the club.` });
            }
            await conn.query('DELETE FROM club_members WHERE user_id = ? AND club_id = ?',
                [applicant.id, previous.club_id]);
            await conn.query(`
                UPDATE clubs
                   SET member_count = GREATEST(0, member_count - 1),
                       total_trophies = GREATEST(0, total_trophies - ?)
                 WHERE id = ?
            `, [applicant.trophies, previous.club_id]);
        }

        await conn.query(`
            INSERT INTO club_members (club_id, user_id, role, contribution_trophies)
            VALUES (?, ?, 'MEMBER', ?)
        `, [clubId, applicant.id, applicant.trophies]);

        await conn.query(`
            UPDATE clubs
               SET member_count = member_count + 1, total_trophies = total_trophies + ?
             WHERE id = ?
        `, [applicant.trophies, clubId]);

        // Any other clubs they had asked to join are moot now.
        await conn.query('DELETE FROM club_join_requests WHERE user_id = ?', [applicant.id]);

        await postSystemMessage(conn, clubId, applicant,
            `🎉 ${applicant.username} was accepted into the club! Welcome!`);

        await conn.commit();
        res.json({ success: true, message: `🎉 Accepted ${applicant.username} into the club!` });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/decline-request
// ---------------------------------------------------------------------------
router.post('/decline-request', async (req, res, next) => {
    try {
        const pool = getPool();
        const requestId = Number(req.body.requestId);
        if (!Number.isInteger(requestId) || requestId <= 0) {
            return res.status(400).json({ success: false, message: 'Unknown request.' });
        }

        const membership = await getMembership(req.userId);
        if (!membership || rankOf(membership.role) < rankOf('ELDER')) {
            return res.status(403).json({
                success: false,
                message: 'Only Club Leaders and Elders can manage join requests!'
            });
        }

        await pool.query('DELETE FROM club_join_requests WHERE id = ? AND club_id = ?',
            [requestId, membership.club_id]);

        res.json({ success: true, message: 'Join request declined.' });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/leave
// ---------------------------------------------------------------------------
router.post('/leave', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const actor = await loadActor(req.userId, conn);
        if (!actor) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Account not found.' });
        }

        const membership = await getMembership(req.userId, conn);
        if (!membership) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'You are not in any club.' });
        }

        const clubId = membership.club_id;
        await conn.query('DELETE FROM club_members WHERE user_id = ? AND club_id = ?', [req.userId, clubId]);

        const [[{ remaining }]] = await conn.query(
            'SELECT COUNT(*) AS remaining FROM club_members WHERE club_id = ?',
            [clubId]
        );

        if (remaining === 0) {
            // Messages and join requests cascade with the club row.
            await conn.query('DELETE FROM clubs WHERE id = ?', [clubId]);
            await conn.commit();
            return res.json({ success: true, message: 'You left the club. With nobody left, it was disbanded.' });
        }

        await conn.query(`
            UPDATE clubs
               SET member_count = GREATEST(0, member_count - 1),
                   total_trophies = GREATEST(0, total_trophies - ?)
             WHERE id = ?
        `, [actor.trophies, clubId]);

        // A departing leader hands over rather than leaving the club headless,
        // which is what used to happen: leader_user_id kept pointing at someone
        // who was no longer a member, so nobody could ever manage the club.
        if (membership.role === 'LEADER') {
            const [heirs] = await conn.query(`
                SELECT cm.user_id, u.username
                  FROM club_members cm
                  JOIN users u ON u.id = cm.user_id
                 WHERE cm.club_id = ?
                 ORDER BY FIELD(cm.role, 'CO_LEADER', 'ELDER', 'MEMBER'), u.trophies DESC
                 LIMIT 1
            `, [clubId]);

            if (heirs.length > 0) {
                await conn.query("UPDATE club_members SET role = 'LEADER' WHERE club_id = ? AND user_id = ?",
                    [clubId, heirs[0].user_id]);
                await conn.query('UPDATE clubs SET leader_user_id = ? WHERE id = ?',
                    [heirs[0].user_id, clubId]);
                await postSystemMessage(conn, clubId, actor,
                    `👑 ${actor.username} left the club. ${heirs[0].username} is the new Leader!`);
            }
        } else {
            await postSystemMessage(conn, clubId, actor, `👋 ${actor.username} left the club.`);
        }

        await conn.commit();
        res.json({ success: true, message: 'You left the club.' });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/message
// ---------------------------------------------------------------------------
router.post('/message', async (req, res, next) => {
    try {
        const pool = getPool();
        const text = cleanText(req.body.text, CLUB.chatMessageMaxLength);
        if (!text) {
            return res.status(400).json({ success: false, message: 'Write something first.' });
        }

        const actor = await loadActor(req.userId);
        if (!actor) return res.status(404).json({ success: false, message: 'Account not found.' });
        if (actor.isGuest) {
            return guestBlocked(res, '🔒 Guest players cannot send club messages.');
        }

        const membership = await getMembership(req.userId);
        if (!membership) {
            return res.status(400).json({ success: false, message: 'You must be in a club to send messages.' });
        }

        await pool.query(`
            INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content)
            VALUES (?, ?, ?, ?, 'CHAT', ?)
        `, [membership.club_id, req.userId, actor.username, actor.avatar || '👤', text]);

        res.json({ success: true, message: 'Message sent' });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/request-card
// ---------------------------------------------------------------------------
router.post('/request-card', async (req, res, next) => {
    try {
        const pool = getPool();
        const cardName = cleanText(req.body.cardName, 60);
        if (!cardName) {
            return res.status(400).json({ success: false, message: 'Pick a card to request.' });
        }

        const actor = await loadActor(req.userId);
        if (!actor) return res.status(404).json({ success: false, message: 'Account not found.' });
        if (actor.isGuest) {
            return guestBlocked(res, '🔒 Guest players cannot request cards.');
        }

        const membership = await getMembership(req.userId);
        if (!membership) {
            return res.status(400).json({ success: false, message: 'You must be in a club to request cards.' });
        }

        // The card has to be one the player actually owns. The route used to
        // take whatever name the client sent and post it verbatim.
        const [owned] = await pool.query(
            'SELECT card_name, role FROM squad_cards WHERE user_id = ? AND card_name = ? LIMIT 1',
            [req.userId, cardName]
        );
        if (owned.length === 0) {
            return res.status(400).json({ success: false, message: 'That card is not in your squad.' });
        }

        // One open request at a time, so the feed cannot be flooded.
        const [open] = await pool.query(`
            SELECT id FROM club_messages
             WHERE club_id = ? AND user_id = ? AND message_type = 'CARD_REQUEST'
               AND donations_received < donations_max
             LIMIT 1
        `, [membership.club_id, req.userId]);
        if (open.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'You already have a card request open. Wait for it to fill first.'
            });
        }

        await pool.query(`
            INSERT INTO club_messages
                (club_id, user_id, username, avatar, message_type, content,
                 card_name, card_role, donations_received, donations_max)
            VALUES (?, ?, ?, ?, 'CARD_REQUEST', ?, ?, ?, 0, ?)
        `, [
            membership.club_id, req.userId, actor.username, actor.avatar || '👤',
            `Requesting ${cardName} card copies!`,
            owned[0].card_name, owned[0].role || 'Player Card',
            CLUB.cardCopiesPerRequest
        ]);

        res.json({ success: true, message: `Card request for ${cardName} posted in Club Chat!` });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/donate-card
// ---------------------------------------------------------------------------
router.post('/donate-card', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const messageId = Number(req.body.messageId);
        if (!Number.isInteger(messageId) || messageId <= 0) {
            return res.status(400).json({ success: false, message: 'Unknown card request.' });
        }

        await conn.beginTransaction();

        const actor = await loadActor(req.userId, conn);
        if (!actor) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Account not found.' });
        }
        if (actor.isGuest) {
            await conn.rollback();
            return guestBlocked(res, '🔒 Guest players cannot donate cards.');
        }

        const membership = await getMembership(req.userId, conn);
        if (!membership) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'You must be in a club to donate.' });
        }

        const [msgs] = await conn.query(
            "SELECT * FROM club_messages WHERE id = ? AND message_type = 'CARD_REQUEST' FOR UPDATE",
            [messageId]
        );
        if (msgs.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Card request not found.' });
        }
        const request = msgs[0];

        // Donations only count inside your own club.
        if (request.club_id !== membership.club_id) {
            await conn.rollback();
            return res.status(403).json({ success: false, message: 'That request belongs to another club.' });
        }
        if (request.user_id === req.userId) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'You cannot donate to your own card request!' });
        }
        if (request.donations_received >= request.donations_max) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Card request is already fully filled!' });
        }

        // Insert before crediting: the unique key on (message_id, donor_user_id)
        // is what actually stops a player donating to the same request twice.
        try {
            await conn.query(`
                INSERT INTO club_card_donations
                    (message_id, donor_user_id, recipient_user_id, card_name, coins_reward, xp_reward)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                messageId, req.userId, request.user_id, request.card_name,
                CLUB.donationCoins, CLUB.donationXp
            ]);
        } catch (dupErr) {
            await conn.rollback();
            if (dupErr.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({
                    success: false,
                    message: 'You have already donated to this request.'
                });
            }
            throw dupErr;
        }

        await conn.query(
            'UPDATE club_messages SET donations_received = donations_received + 1 WHERE id = ?',
            [messageId]
        );
        await conn.query(
            'UPDATE club_members SET donations_weekly = donations_weekly + 1 WHERE user_id = ? AND club_id = ?',
            [req.userId, membership.club_id]
        );

        const paid = await applyWalletDelta(req.userId, {
            coins: CLUB.donationCoins,
            xp: CLUB.donationXp
        }, conn);

        await conn.commit();

        res.json({
            success: true,
            coinsEarned: CLUB.donationCoins,
            xpEarned: CLUB.donationXp,
            coins: paid ? paid.user.coins : null,
            message: `🎉 Donated 1x ${request.card_name}! +${CLUB.donationCoins} 🪙 Coins & +${CLUB.donationXp} XP Claimed!`
        });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/change-role
// ---------------------------------------------------------------------------
router.post('/change-role', async (req, res, next) => {
    try {
        const pool = getPool();
        const targetUserId = Number(req.body.targetUserId);
        const newRole = String(req.body.newRole || '');

        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ success: false, message: 'Unknown member.' });
        }
        if (!ASSIGNABLE_ROLES.includes(newRole)) {
            return res.status(400).json({ success: false, message: 'Invalid role specified.' });
        }
        if (targetUserId === req.userId) {
            return res.status(400).json({ success: false, message: 'You cannot change your own role.' });
        }

        const actor = await loadActor(req.userId);
        if (!actor) return res.status(404).json({ success: false, message: 'Account not found.' });

        const membership = await getMembership(req.userId);
        if (!membership) {
            return res.status(403).json({ success: false, message: 'You are not in a club.' });
        }
        if (rankOf(membership.role) < rankOf('CO_LEADER')) {
            return res.status(403).json({
                success: false,
                message: 'Only Leaders and Co-Leaders can change member roles!'
            });
        }

        const [targetRows] = await pool.query(`
            SELECT cm.role, u.username
              FROM club_members cm
              JOIN users u ON cm.user_id = u.id
             WHERE cm.user_id = ? AND cm.club_id = ?
        `, [targetUserId, membership.club_id]);
        if (targetRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Target member not found in your club.' });
        }

        const targetOldRole = targetRows[0].role;
        const targetName = targetRows[0].username;

        // You can only act on someone below you, and only promote to a rank
        // below your own — a Co-Leader cannot mint another Co-Leader.
        if (rankOf(targetOldRole) >= rankOf(membership.role)) {
            return res.status(403).json({
                success: false,
                message: `You cannot change the role of a ${targetOldRole}.`
            });
        }
        if (rankOf(newRole) >= rankOf(membership.role)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot promote someone to your own rank or above.'
            });
        }
        if (targetOldRole === newRole) {
            return res.status(400).json({ success: false, message: `${targetName} already holds that role.` });
        }

        await pool.query('UPDATE club_members SET role = ? WHERE user_id = ? AND club_id = ?',
            [newRole, targetUserId, membership.club_id]);

        const promoted = rankOf(newRole) > rankOf(targetOldRole);
        const actionVerb = promoted ? 'promoted' : 'demoted';
        const roleLabel = newRole === 'CO_LEADER' ? 'Co-Leader 🥈'
            : newRole === 'ELDER' ? 'Elder 🥉' : 'Member 👤';

        await postSystemMessage(pool, membership.club_id, actor,
            `🛡️ ${actor.username} ${actionVerb} ${targetName} to ${roleLabel}`);

        res.json({ success: true, message: `Successfully ${actionVerb} ${targetName} to ${newRole}!` });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/transfer-leadership
// ---------------------------------------------------------------------------
router.post('/transfer-leadership', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const newLeaderUserId = Number(req.body.newLeaderUserId);
        if (!Number.isInteger(newLeaderUserId) || newLeaderUserId <= 0) {
            return res.status(400).json({ success: false, message: 'Unknown member.' });
        }
        if (newLeaderUserId === req.userId) {
            return res.status(400).json({ success: false, message: 'You are already the Leader.' });
        }

        await conn.beginTransaction();

        const actor = await loadActor(req.userId, conn);
        if (!actor) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Account not found.' });
        }

        const membership = await getMembership(req.userId, conn);
        if (!membership || membership.role !== 'LEADER') {
            await conn.rollback();
            return res.status(403).json({
                success: false,
                message: 'Only the Club Leader can transfer leadership!'
            });
        }

        const [targetRows] = await conn.query(`
            SELECT u.username FROM club_members cm
              JOIN users u ON cm.user_id = u.id
             WHERE cm.user_id = ? AND cm.club_id = ?
        `, [newLeaderUserId, membership.club_id]);
        if (targetRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'New leader must be an active club member.' });
        }

        const newLeaderName = targetRows[0].username;

        await conn.query('UPDATE clubs SET leader_user_id = ? WHERE id = ?',
            [newLeaderUserId, membership.club_id]);
        await conn.query("UPDATE club_members SET role = 'CO_LEADER' WHERE user_id = ? AND club_id = ?",
            [req.userId, membership.club_id]);
        await conn.query("UPDATE club_members SET role = 'LEADER' WHERE user_id = ? AND club_id = ?",
            [newLeaderUserId, membership.club_id]);

        await postSystemMessage(conn, membership.club_id, actor,
            `👑 ${actor.username} transferred Club Leadership to ${newLeaderName}!`);

        await conn.commit();
        res.json({ success: true, message: `🎉 Leadership transferred to ${newLeaderName}!` });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/kick-member
// ---------------------------------------------------------------------------
router.post('/kick-member', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const targetUserId = Number(req.body.targetUserId);
        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ success: false, message: 'Unknown member.' });
        }
        if (targetUserId === req.userId) {
            return res.status(400).json({ success: false, message: 'Use Leave Club to remove yourself.' });
        }

        await conn.beginTransaction();

        const actor = await loadActor(req.userId, conn);
        if (!actor) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Account not found.' });
        }

        const membership = await getMembership(req.userId, conn);
        if (!membership) {
            await conn.rollback();
            return res.status(403).json({ success: false, message: 'You are not in a club.' });
        }

        const [targetRows] = await conn.query(`
            SELECT cm.role, cm.contribution_trophies, u.username, u.trophies
              FROM club_members cm
              JOIN users u ON cm.user_id = u.id
             WHERE cm.user_id = ? AND cm.club_id = ?
        `, [targetUserId, membership.club_id]);
        if (targetRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Member not found in your club.' });
        }

        const target = targetRows[0];

        // Rank strictly above the target: Leader kicks anyone, Co-Leader kicks
        // Elders and Members, Elder kicks Members.
        if (rankOf(membership.role) <= rankOf(target.role) || membership.role === 'MEMBER') {
            await conn.rollback();
            return res.status(403).json({
                success: false,
                message: `You do not have permission to kick a ${target.role}!`
            });
        }

        await conn.query('DELETE FROM club_members WHERE user_id = ? AND club_id = ?',
            [targetUserId, membership.club_id]);
        await conn.query(`
            UPDATE clubs
               SET member_count = GREATEST(1, member_count - 1),
                   total_trophies = GREATEST(0, total_trophies - ?)
             WHERE id = ?
        `, [target.trophies, membership.club_id]);

        await postSystemMessage(conn, membership.club_id, actor,
            `👢 ${target.username} was kicked from the club by ${actor.username}.`);

        await conn.commit();
        res.json({ success: true, message: `Kicked ${target.username} from the club.` });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/friendly-challenge
// ---------------------------------------------------------------------------
router.post('/friendly-challenge', async (req, res, next) => {
    try {
        const pool = getPool();
        const stadium = cleanAttributeText(req.body.stadium, 40) || 'Adelaide Oval';

        const actor = await loadActor(req.userId);
        if (!actor) return res.status(404).json({ success: false, message: 'Account not found.' });
        if (actor.isGuest) return guestBlocked(res, '🔒 Guest players cannot post challenges.');

        const membership = await getMembership(req.userId);
        if (!membership) {
            return res.status(400).json({ success: false, message: 'You are not in a club.' });
        }

        await pool.query(`
            INSERT INTO club_messages
                (club_id, user_id, username, avatar, message_type, content, card_name)
            VALUES (?, ?, ?, ?, 'FRIENDLY_CHALLENGE', ?, ?)
        `, [
            membership.club_id, req.userId, actor.username, actor.avatar || '🏏',
            `⚔️ Friendly Match Challenge! Stadium: ${stadium}`,
            stadium
        ]);

        res.json({ success: true, message: '⚔️ Friendly Match challenge posted to Club Chat!' });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/clubs/claim-chest
//
// The client has always had a claim button wired to this path; the server never
// implemented it, so the request 404'd and the handler credited the player with
// a hardcoded 10,000 coins client-side that the next reload threw away.
// ---------------------------------------------------------------------------
router.post('/claim-chest', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const membership = await getMembership(req.userId, conn);
        if (!membership) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'You must be in a club to claim the chest.' });
        }

        const chest = await getChestProgress(membership.club_id, req.userId, conn);
        if (chest.tier < 1) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                code: 'TIER_LOCKED',
                message: 'Your club has not reached Tier 1 yet. Win matches together this week!',
                chest
            });
        }

        // Recorded before the credit; the unique key on (user_id, week_key) is
        // the real guard against a double claim.
        try {
            await conn.query(`
                INSERT INTO club_chest_claims
                    (user_id, club_id, week_key, tier, coins_awarded, gems_awarded)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                req.userId, membership.club_id, weekKey(),
                chest.tier, chest.rewardCoins, chest.rewardGems
            ]);
        } catch (dupErr) {
            await conn.rollback();
            if (dupErr.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({
                    success: false,
                    code: 'ALREADY_CLAIMED',
                    message: 'You have already claimed this week’s club chest.'
                });
            }
            throw dupErr;
        }

        const paid = await applyWalletDelta(req.userId, {
            coins: chest.rewardCoins,
            gems: chest.rewardGems,
            xp: CLUB.chest.xpPerClaim
        }, conn);

        await conn.commit();

        res.json({
            success: true,
            tier: chest.tier,
            coinsReward: chest.rewardCoins,
            gemsReward: chest.rewardGems,
            xpReward: CLUB.chest.xpPerClaim,
            coins: paid ? paid.user.coins : null,
            gems: paid ? paid.user.gems : null,
            leveledUp: paid ? paid.leveledUp : false,
            newLevel: paid ? paid.newLevel : null,
            message: `🎁 Tier ${chest.tier} Club Chest claimed! +${chest.rewardCoins.toLocaleString()} 🪙 +${chest.rewardGems} 💎`
        });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

module.exports = router;
