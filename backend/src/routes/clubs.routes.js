const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// Helper to verify user is not a guest
async function checkUserAuth(pool, userId) {
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return { exists: false };
    const user = users[0];
    const isGuest = Boolean(user.is_guest || user.auth_provider === 'guest');
    return { exists: true, isGuest, user };
}

// GET /api/clubs
router.get('/', async (req, res) => {
    try {
        const pool = getPool();
        const userId = req.query.userId || 1;

        const authInfo = await checkUserAuth(pool, userId);
        if (authInfo.isGuest) {
            return res.json({
                success: true,
                isGuest: true,
                myClub: null,
                members: [],
                messages: [],
                clubs: [],
                message: 'Guest players must sign in with Google Play Games or Facebook to access Clubs.'
            });
        }
        
        // 1. Fetch User's current club & membership
        const [myClubRows] = await pool.query(`
            SELECT c.*, cm.role, cm.contribution_trophies, cm.donations_weekly
            FROM club_members cm
            JOIN clubs c ON cm.club_id = c.id
            WHERE cm.user_id = ?
        `, [userId]);

        let myClub = null;
        let members = [];
        let messages = [];

        if (myClubRows.length > 0) {
            myClub = myClubRows[0];

            // Fetch Club Members Roster
            const [memberRows] = await pool.query(`
                SELECT cm.role, cm.contribution_trophies, cm.donations_weekly, cm.joined_at,
                       u.id as user_id, u.username as name, u.level, u.avatar, u.trophies, u.country_code
                FROM club_members cm
                JOIN users u ON cm.user_id = u.id
                WHERE cm.club_id = ?
                ORDER BY u.trophies DESC, cm.role = 'LEADER' DESC
            `, [myClub.id]);
            members = memberRows;

            // Fetch Club Chat & Requests
            const [msgRows] = await pool.query(`
                SELECT id, user_id, username, avatar, message_type, content, card_name, card_role, donations_received, donations_max, created_at
                FROM club_messages
                WHERE club_id = ?
                ORDER BY id ASC
                LIMIT 50
            `, [myClub.id]);
            messages = msgRows;
        }

        // 2. Fetch All Clubs for Search / Browse
        const [allClubs] = await pool.query(`
            SELECT c.*, u.username as leader_name
            FROM clubs c
            LEFT JOIN users u ON c.leader_user_id = u.id
            ORDER BY c.total_trophies DESC
        `);

        // 3. If in club and Leader/Co-Leader/Elder, fetch pending join requests
        let pendingRequests = [];
        if (myClub && ['LEADER', 'CO_LEADER', 'ELDER'].includes(myClub.role)) {
            const [reqs] = await pool.query(`
                SELECT * FROM club_join_requests 
                WHERE club_id = ? AND status = 'PENDING'
                ORDER BY id DESC
            `, [myClub.id]);
            pendingRequests = reqs;
        }

        // 4. Fetch my pending requests to show "REQUESTED" state on browse list
        const [myPendingReqs] = await pool.query(`
            SELECT club_id FROM club_join_requests 
            WHERE user_id = ? AND status = 'PENDING'
        `, [userId]);
        const myPendingClubIds = myPendingReqs.map(r => r.club_id);

        res.json({
            success: true,
            isGuest: false,
            myClub,
            members,
            messages,
            clubs: allClubs,
            pendingRequests,
            myPendingClubIds
        });
    } catch (err) {
        console.error('SQL Error in clubs route:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/create (One person can create only one club! Costs 5,000 Coins)
router.post('/create', async (req, res) => {
    try {
        const { name, badge, tag, description, minTrophies, clubType, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) {
            return res.status(403).json({ success: false, isGuest: true, message: '🔒 Guest players cannot create clubs. Please sign in with Google Play Games or Facebook.' });
        }

        // RULE: ONE PERSON CAN CREATE ONLY ONE CLUB
        const [existingMembership] = await pool.query('SELECT club_id, role FROM club_members WHERE user_id = ?', [activeUserId]);
        if (existingMembership.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: '⚠️ One person can create and belong to only one club! You must leave your current club before creating a new one.' 
            });
        }

        // Check user coins
        const user = [authInfo.user];
        if (user[0].coins < 5000) {
            return res.status(400).json({ success: false, message: 'You need 5,000 🪙 Coins to create a Club!' });
        }

        // Deduct 5,000 coins in SQL
        await pool.query('UPDATE users SET coins = coins - 5000 WHERE id = ?', [activeUserId]);

        // Insert new club
        const [insertRes] = await pool.query(`
            INSERT INTO clubs (club_name, badge_icon, tag, level, min_trophies, club_type, member_count, max_members, total_trophies, leader_user_id, description)
            VALUES (?, ?, ?, 1, ?, ?, 1, 50, ?, ?, ?)
        `, [name, badge || '🛡️', tag || `#${name.substring(0,3).toUpperCase()}`, minTrophies || 0, clubType || 'OPEN', user[0].trophies, activeUserId, description || 'Welcome to our club!']);

        const newClubId = insertRes.insertId;
        const userName = user.length > 0 ? user[0].username : 'Player';
        const userAvatar = user.length > 0 ? user[0].avatar : '👤';

        // Add creator as LEADER
        await pool.query(`
            INSERT INTO club_members (club_id, user_id, role, contribution_trophies)
            VALUES (?, ?, 'LEADER', ?)
        `, [newClubId, activeUserId, user[0].trophies]);

        // Insert initial system message
        await pool.query(`
            INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content)
            VALUES (?, ?, ?, ?, 'SYSTEM', ?)
        `, [newClubId, activeUserId, userName, userAvatar, `👑 ${userName} founded the club! Welcome strikers!`]);

        res.json({
            success: true,
            clubId: newClubId,
            message: `🎉 Club '${name}' created successfully!`
        });
    } catch (err) {
        console.error('SQL Error in club create:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/request-join (If any person wants to join, they send a request to club leaders)
router.post('/request-join', async (req, res) => {
    try {
        const { clubId, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) {
            return res.status(403).json({ success: false, isGuest: true, message: '🔒 Guest players cannot join clubs. Please sign in with Google Play Games or Facebook.' });
        }

        // Check if user is already in a club
        const [existingMember] = await pool.query('SELECT club_id FROM club_members WHERE user_id = ?', [activeUserId]);
        if (existingMember.length > 0) {
            return res.status(400).json({ success: false, message: 'You are already a member of a club! Leave your current club before requesting to join another.' });
        }

        const [club] = await pool.query('SELECT * FROM clubs WHERE id = ?', [clubId]);
        if (club.length === 0) {
            return res.status(404).json({ success: false, message: 'Club not found' });
        }

        if (club[0].member_count >= club[0].max_members) {
            return res.status(400).json({ success: false, message: 'Club is currently full (50/50 members).' });
        }

        const user = [authInfo.user];
        const userName = user.length > 0 ? user[0].username : 'Player';
        const userAvatar = user.length > 0 ? user[0].avatar : '👤';
        const trophies = user[0].trophies || 0;
        const level = user[0].level || 1;

        // Check required trophies
        if (trophies < club[0].min_trophies) {
            return res.status(400).json({ success: false, message: `🔒 Requires at least ${club[0].min_trophies} 🏆 trophies to request!` });
        }

        // Insert or update pending join request
        await pool.query(`
            INSERT INTO club_join_requests (club_id, user_id, username, avatar, trophies, level, status)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
            ON DUPLICATE KEY UPDATE status = 'PENDING', trophies = ?, level = ?
        `, [clubId, activeUserId, userName, userAvatar, trophies, level, trophies, level]);

        // Insert system activity into club
        await pool.query(`
            INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content)
            VALUES (?, ?, ?, ?, 'SYSTEM', ?)
        `, [clubId, activeUserId, userName, userAvatar, `📝 ${userName} sent a request to join the club!`]);

        res.json({ success: true, message: `📨 Join request sent to ${club[0].club_name} leaders!` });
    } catch (err) {
        console.error('SQL Error in club request-join:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/accept-request (Club leader accepts a pending join request)
router.post('/accept-request', async (req, res) => {
    try {
        const { requestId, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Verify approver is leader, co-leader, or elder
        const [approverMember] = await pool.query('SELECT club_id, role FROM club_members WHERE user_id = ?', [activeUserId]);
        if (approverMember.length === 0 || !['LEADER', 'CO_LEADER', 'ELDER'].includes(approverMember[0].role)) {
            return res.status(403).json({ success: false, message: 'Only Club Leaders and Elders can approve join requests!' });
        }

        const clubId = approverMember[0].club_id;
        const [reqRows] = await pool.query('SELECT * FROM club_join_requests WHERE id = ? AND club_id = ?', [requestId, clubId]);
        if (reqRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Join request not found or already processed.' });
        }

        const targetReq = reqRows[0];
        const applicantUserId = targetReq.user_id;

        // Check if club is full
        const [club] = await pool.query('SELECT member_count, max_members, club_name FROM clubs WHERE id = ?', [clubId]);
        if (club[0].member_count >= club[0].max_members) {
            return res.status(400).json({ success: false, message: 'Club is already full (50/50)!' });
        }

        // Clean applicant from any existing club
        await pool.query('DELETE FROM club_members WHERE user_id = ?', [applicantUserId]);

        // Add applicant to club
        await pool.query(`
            INSERT INTO club_members (club_id, user_id, role, contribution_trophies)
            VALUES (?, ?, 'MEMBER', ?)
        `, [clubId, applicantUserId, targetReq.trophies]);

        // Update club member count & trophies
        await pool.query(`
            UPDATE clubs 
            SET member_count = member_count + 1, total_trophies = total_trophies + ?
            WHERE id = ?
        `, [targetReq.trophies, clubId]);

        // Remove processed request
        await pool.query('DELETE FROM club_join_requests WHERE id = ?', [requestId]);

        // Add Welcome system message
        await pool.query(`
            INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content)
            VALUES (?, ?, ?, ?, 'SYSTEM', ?)
        `, [clubId, applicantUserId, targetReq.username, targetReq.avatar, `🎉 ${targetReq.username} was accepted into the club! Welcome!`]);

        res.json({ success: true, message: `🎉 Accepted ${targetReq.username} into the club!` });
    } catch (err) {
        console.error('SQL Error in accept-request:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/decline-request (Club leader declines a pending join request)
router.post('/decline-request', async (req, res) => {
    try {
        const { requestId, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const [approverMember] = await pool.query('SELECT club_id, role FROM club_members WHERE user_id = ?', [activeUserId]);
        if (approverMember.length === 0 || !['LEADER', 'CO_LEADER', 'ELDER'].includes(approverMember[0].role)) {
            return res.status(403).json({ success: false, message: 'Only Club Leaders and Elders can manage join requests!' });
        }

        const clubId = approverMember[0].club_id;
        await pool.query('DELETE FROM club_join_requests WHERE id = ? AND club_id = ?', [requestId, clubId]);

        res.json({ success: true, message: 'Join request declined.' });
    } catch (err) {
        console.error('SQL Error in decline-request:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/leave
router.post('/leave', async (req, res) => {
    try {
        const { userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) {
            return res.status(403).json({ success: false, isGuest: true, message: '🔒 Guest players cannot access clubs.' });
        }

        const [memberRow] = await pool.query('SELECT club_id, role FROM club_members WHERE user_id = ?', [activeUserId]);
        if (memberRow.length === 0) {
            return res.status(400).json({ success: false, message: 'You are not in any club' });
        }

        const clubId = memberRow[0].club_id;
        const user = [authInfo.user];
        const userName = user.length > 0 ? user[0].username : 'Player';
        const userAvatar = user.length > 0 ? user[0].avatar : '👤';
        const trophies = user.length > 0 ? user[0].trophies : 0;

        await pool.query('DELETE FROM club_members WHERE user_id = ? AND club_id = ?', [activeUserId, clubId]);

        const [rem] = await pool.query('SELECT COUNT(*) as cnt FROM club_members WHERE club_id = ?', [clubId]);
        if (rem[0].cnt === 0) {
            await pool.query('DELETE FROM clubs WHERE id = ?', [clubId]);
            await pool.query('DELETE FROM club_messages WHERE club_id = ?', [clubId]);
        } else {
            await pool.query(`
                UPDATE clubs 
                SET member_count = GREATEST(0, member_count - 1), 
                    total_trophies = GREATEST(0, total_trophies - ?)
                WHERE id = ?
            `, [trophies, clubId]);

            await pool.query(`
                INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content)
                VALUES (?, ?, ?, ?, 'SYSTEM', ?)
            `, [clubId, activeUserId, userName, userAvatar, `👋 ${userName} left the club.`]);
        }

        res.json({ success: true, message: 'You left the club.' });
    } catch (err) {
        console.error('SQL Error in club leave:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/message (Send chat message)
router.post('/message', async (req, res) => {
    try {
        const { text, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) {
            return res.status(403).json({ success: false, isGuest: true, message: '🔒 Guest players cannot send club messages.' });
        }

        const [myClub] = await pool.query('SELECT club_id FROM club_members WHERE user_id = ?', [activeUserId]);
        if (myClub.length === 0) {
            return res.status(400).json({ success: false, message: 'You must be in a club to send messages' });
        }

        const user = [authInfo.user];
        const userName = user.length > 0 ? user[0].username : 'Player';
        const userAvatar = user.length > 0 ? user[0].avatar : '👤';

        const clubId = myClub[0].club_id;
        await pool.query(`
            INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content)
            VALUES (?, ?, ?, ?, 'CHAT', ?)
        `, [clubId, activeUserId, userName, userAvatar, text]);

        res.json({ success: true, message: 'Message sent' });
    } catch (err) {
        console.error('SQL Error in club message:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/request-card
router.post('/request-card', async (req, res) => {
    try {
        const { cardName, cardRole, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) {
            return res.status(403).json({ success: false, isGuest: true, message: '🔒 Guest players cannot request cards.' });
        }

        const [myClub] = await pool.query('SELECT club_id FROM club_members WHERE user_id = ?', [activeUserId]);
        if (myClub.length === 0) {
            return res.status(400).json({ success: false, message: 'You must be in a club to request cards' });
        }

        const user = [authInfo.user];
        const userName = user.length > 0 ? user[0].username : 'Player';
        const userAvatar = user.length > 0 ? user[0].avatar : '👤';

        const clubId = myClub[0].club_id;

        await pool.query(`
            INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content, card_name, card_role, donations_received, donations_max)
            VALUES (?, ?, ?, ?, 'CARD_REQUEST', ?, ?, ?, 0, 5)
        `, [clubId, activeUserId, userName, userAvatar, `Requesting ${cardName} card copies!`, cardName, cardRole || 'Player Card']);

        res.json({ success: true, message: `Card request for ${cardName} posted in Club Chat!` });
    } catch (err) {
        console.error('SQL Error in card request:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/donate-card
router.post('/donate-card', async (req, res) => {
    try {
        const { messageId, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) {
            return res.status(403).json({ success: false, isGuest: true, message: '🔒 Guest players cannot donate cards.' });
        }

        const [msg] = await pool.query('SELECT * FROM club_messages WHERE id = ?', [messageId]);
        if (msg.length === 0 || msg[0].message_type !== 'CARD_REQUEST') {
            return res.status(404).json({ success: false, message: 'Card request not found' });
        }

        if (msg[0].user_id === activeUserId) {
            return res.status(400).json({ success: false, message: 'You cannot donate to your own card request!' });
        }

        if (msg[0].donations_received >= msg[0].donations_max) {
            return res.status(400).json({ success: false, message: 'Card request is already fully filled!' });
        }

        // Increment donation count in message
        await pool.query(`
            UPDATE club_messages 
            SET donations_received = donations_received + 1 
            WHERE id = ?
        `, [messageId]);

        // Reward Donor +50 Coins, +10 XP in MySQL users table
        const donorUserId = activeUserId;
        await pool.query('UPDATE users SET coins = coins + 50, xp = xp + 10 WHERE id = ?', [donorUserId]);

        // Track weekly donation in club_members
        await pool.query('UPDATE club_members SET donations_weekly = donations_weekly + 1 WHERE user_id = ?', [donorUserId]);

        // Log in club_card_donations
        await pool.query(`
            INSERT INTO club_card_donations (message_id, donor_user_id, recipient_user_id, card_name)
            VALUES (?, ?, ?, ?)
        `, [messageId, donorUserId, msg[0].user_id, msg[0].card_name]);

        res.json({
            success: true,
            coinsEarned: 50,
            xpEarned: 10,
            message: `🎉 Donated 1x ${msg[0].card_name}! +50 🪙 Coins & +10 XP Claimed!`
        });
    } catch (err) {
        console.error('SQL Error in donate card:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/change-role (Promote / Demote member)
router.post('/change-role', async (req, res) => {
    try {
        const { targetUserId, newRole, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) return res.status(403).json({ success: false, message: 'Unauthorized' });

        // Get actor's club and role
        const [actorRows] = await pool.query('SELECT club_id, role FROM club_members WHERE user_id = ?', [activeUserId]);
        if (actorRows.length === 0) return res.status(403).json({ success: false, message: 'You are not in a club' });

        const actorRole = actorRows[0].role;
        const clubId = actorRows[0].club_id;

        // Get target's club and role
        const [targetRows] = await pool.query('SELECT cm.role, u.username FROM club_members cm JOIN users u ON cm.user_id = u.id WHERE cm.user_id = ? AND cm.club_id = ?', [targetUserId, clubId]);
        if (targetRows.length === 0) return res.status(404).json({ success: false, message: 'Target member not found in your club' });

        const targetOldRole = targetRows[0].role;
        const targetName = targetRows[0].username;

        // RBAC Permissions Check
        if (actorRole === 'MEMBER' || actorRole === 'ELDER') {
            return res.status(403).json({ success: false, message: 'Only Leaders and Co-Leaders can change member roles!' });
        }

        if (actorRole === 'CO_LEADER' && (targetOldRole === 'CO_LEADER' || targetOldRole === 'LEADER' || newRole === 'CO_LEADER' || newRole === 'LEADER')) {
            return res.status(403).json({ success: false, message: 'Co-Leaders can only promote/demote Elders and Members!' });
        }

        if (!['CO_LEADER', 'ELDER', 'MEMBER'].includes(newRole)) {
            return res.status(400).json({ success: false, message: 'Invalid role specified' });
        }

        // Update role
        await pool.query('UPDATE club_members SET role = ? WHERE user_id = ? AND club_id = ?', [newRole, targetUserId, clubId]);

        // Insert System Message
        const actorName = authInfo.user ? authInfo.user.username : 'Leader';
        const isPromotion = (newRole === 'CO_LEADER' || (newRole === 'ELDER' && targetOldRole === 'MEMBER'));
        const actionVerb = isPromotion ? 'promoted' : 'demoted';
        const roleLabel = newRole === 'CO_LEADER' ? 'Co-Leader 🥈' : newRole === 'ELDER' ? 'Elder 🥉' : 'Member 👤';

        await pool.query(`
            INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content)
            VALUES (?, ?, ?, ?, 'SYSTEM', ?)
        `, [clubId, activeUserId, actorName, '👑', `🛡️ ${actorName} ${actionVerb} ${targetName} to ${roleLabel}`]);

        res.json({ success: true, message: `Successfully ${actionVerb} ${targetName} to ${newRole}!` });
    } catch (err) {
        console.error('SQL Error in change-role:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/transfer-leadership (Transfer club ownership)
router.post('/transfer-leadership', async (req, res) => {
    try {
        const { newLeaderUserId, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) return res.status(403).json({ success: false, message: 'Unauthorized' });

        const [actorRows] = await pool.query('SELECT club_id, role FROM club_members WHERE user_id = ?', [activeUserId]);
        if (actorRows.length === 0 || actorRows[0].role !== 'LEADER') {
            return res.status(403).json({ success: false, message: 'Only the Club Leader can transfer leadership!' });
        }

        const clubId = actorRows[0].club_id;
        const [targetRows] = await pool.query('SELECT u.username FROM club_members cm JOIN users u ON cm.user_id = u.id WHERE cm.user_id = ? AND cm.club_id = ?', [newLeaderUserId, clubId]);
        if (targetRows.length === 0) return res.status(404).json({ success: false, message: 'New leader must be an active club member' });

        const oldLeaderName = authInfo.user.username;
        const newLeaderName = targetRows[0].username;

        // 1. Update clubs table leader_user_id
        await pool.query('UPDATE clubs SET leader_user_id = ? WHERE id = ?', [newLeaderUserId, clubId]);

        // 2. Set previous leader to CO_LEADER
        await pool.query('UPDATE club_members SET role = "CO_LEADER" WHERE user_id = ? AND club_id = ?', [activeUserId, clubId]);

        // 3. Set new leader to LEADER
        await pool.query('UPDATE club_members SET role = "LEADER" WHERE user_id = ? AND club_id = ?', [newLeaderUserId, clubId]);

        // 4. System announcement
        await pool.query(`
            INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content)
            VALUES (?, ?, ?, ?, 'SYSTEM', ?)
        `, [clubId, activeUserId, oldLeaderName, '👑', `👑 ${oldLeaderName} transferred Club Leadership to ${newLeaderName}!`]);

        res.json({ success: true, message: `🎉 Leadership transferred to ${newLeaderName}!` });
    } catch (err) {
        console.error('SQL Error in transfer-leadership:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/kick-member (Kick a member from the club)
router.post('/kick-member', async (req, res) => {
    try {
        const { targetUserId, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) return res.status(403).json({ success: false, message: 'Unauthorized' });

        const [actorRows] = await pool.query('SELECT club_id, role FROM club_members WHERE user_id = ?', [activeUserId]);
        if (actorRows.length === 0) return res.status(403).json({ success: false, message: 'You are not in a club' });

        const actorRole = actorRows[0].role;
        const clubId = actorRows[0].club_id;

        if (activeUserId === targetUserId) {
            return res.status(400).json({ success: false, message: 'Use Leave Club to remove yourself.' });
        }

        const [targetRows] = await pool.query('SELECT cm.role, cm.contribution_trophies, u.username FROM club_members cm JOIN users u ON cm.user_id = u.id WHERE cm.user_id = ? AND cm.club_id = ?', [targetUserId, clubId]);
        if (targetRows.length === 0) return res.status(404).json({ success: false, message: 'Member not found in your club' });

        const targetRole = targetRows[0].role;
        const targetTrophies = targetRows[0].contribution_trophies || 0;
        const targetName = targetRows[0].username;

        // Check kick hierarchy:
        // Leader can kick Co-Leader, Elder, Member
        // Co-Leader can kick Elder, Member
        // Elder can kick Member
        let canKick = false;
        if (actorRole === 'LEADER') canKick = true;
        else if (actorRole === 'CO_LEADER' && (targetRole === 'ELDER' || targetRole === 'MEMBER')) canKick = true;
        else if (actorRole === 'ELDER' && targetRole === 'MEMBER') canKick = true;

        if (!canKick) {
            return res.status(403).json({ success: false, message: `You do not have permission to kick a ${targetRole}!` });
        }

        // Delete from club_members
        await pool.query('DELETE FROM club_members WHERE user_id = ? AND club_id = ?', [targetUserId, clubId]);

        // Update club stats
        await pool.query('UPDATE clubs SET member_count = GREATEST(1, member_count - 1), total_trophies = GREATEST(0, total_trophies - ?) WHERE id = ?', [targetTrophies, clubId]);

        // System notification
        const actorName = authInfo.user.username;
        await pool.query(`
            INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content)
            VALUES (?, ?, ?, ?, 'SYSTEM', ?)
        `, [clubId, activeUserId, actorName, '👢', `👢 ${targetName} was kicked from the club by ${actorName}.`]);

        res.json({ success: true, message: `Kicked ${targetName} from the club.` });
    } catch (err) {
        console.error('SQL Error in kick-member:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/clubs/friendly-challenge (Post a Friendly Match challenge in Club Chat)
router.post('/friendly-challenge', async (req, res) => {
    try {
        const { userId, stadium } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const authInfo = await checkUserAuth(pool, activeUserId);
        if (authInfo.isGuest) return res.status(403).json({ success: false, message: 'Unauthorized' });

        const [myClub] = await pool.query('SELECT club_id FROM club_members WHERE user_id = ?', [activeUserId]);
        if (myClub.length === 0) return res.status(400).json({ success: false, message: 'You are not in a club' });

        const user = authInfo.user;
        const stadiumName = stadium || 'Adelaide Oval';

        await pool.query(`
            INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content, card_name)
            VALUES (?, ?, ?, ?, 'FRIENDLY_CHALLENGE', ?, ?)
        `, [myClub[0].club_id, activeUserId, user.username, user.avatar || '🏏', `⚔️ Friendly Match Challenge! Stadium: ${stadiumName} (Tournament Card Levels: 5)`, stadiumName]);

        res.json({ success: true, message: '⚔️ Friendly Match challenge posted to Club Chat!' });
    } catch (err) {
        console.error('SQL Error in friendly-challenge:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;

