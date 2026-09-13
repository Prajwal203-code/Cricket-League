const { getPool } = require('../config/db');

async function getFriendsData() {
    try {
        const pool = getPool();

        // Check if current user is Guest or Connected
        const [userRow] = await pool.query('SELECT is_guest, auth_provider, username FROM users WHERE id = 1');
        const isGuest = userRow.length > 0 ? Boolean(userRow[0].is_guest) : true;
        const authProvider = userRow.length > 0 ? userRow[0].auth_provider : 'guest';

        if (isGuest) {
            return {
                isGuest: true,
                authProvider: 'guest',
                pendingRequests: [],
                friends: []
            };
        }

        // 1. Pending Requests for User 1
        const [pendingRows] = await pool.query(`
            SELECT f.id, u.id as playerId, u.username as name, 
                   CASE WHEN u.country_code = 'IN' THEN '🇮🇳' ELSE '🌐' END as flag,
                   u.level, 'Virtuoso' as rank, u.avatar, 1 as online
            FROM friends f
            JOIN users u ON f.friend_user_id = u.id
            WHERE f.user_id = 1 AND f.status = 'PENDING'
            ORDER BY f.id DESC
        `);

        // 2. Active Friends for User 1
        const [friendsRows] = await pool.query(`
            SELECT f.id as relationId, u.id, u.username as name, 
                   CASE WHEN u.country_code = 'IN' THEN '🇮🇳' ELSE '🌐' END as flag,
                   u.level, 
                   CASE 
                     WHEN u.level >= 25 THEN 'Virtuoso'
                     WHEN u.level >= 18 THEN 'Expert'
                     WHEN u.level >= 10 THEN 'Hotshot'
                     ELSE 'Trainee'
                   END as rank, 
                   u.avatar, 1 as online, 
                   IF(f.gift_sent_today = 1, true, false) as giftSent
            FROM friends f
            JOIN users u ON f.friend_user_id = u.id
            WHERE f.user_id = 1 AND f.status = 'ACCEPTED'
            ORDER BY u.level DESC
        `);

        return {
            isGuest: false,
            authProvider,
            pendingRequests: pendingRows,
            friends: friendsRows
        };
    } catch (err) {
        console.error('SQL Error in getFriendsData:', err.message);
        return { isGuest: true, authProvider: 'guest', pendingRequests: [], friends: [] };
    }
}

async function addFriendRequest(playerData) {
    try {
        const pool = getPool();
        const cleanName = playerData.name.trim();

        // Find or create user in MySQL
        let [users] = await pool.query('SELECT id FROM users WHERE username = ?', [cleanName]);
        let targetUserId;

        if (users.length > 0) {
            targetUserId = users[0].id;
        } else {
            const [insertRes] = await pool.query(`
                INSERT INTO users (username, level, avatar, country_code)
                VALUES (?, ?, ?, 'IN')
            `, [cleanName, playerData.level || 15, playerData.avatar || '🏏']);
            targetUserId = insertRes.insertId;
        }

        // Insert or update relation
        await pool.query(`
            INSERT INTO friends (user_id, friend_user_id, status)
            VALUES (1, ?, 'PENDING')
            ON DUPLICATE KEY UPDATE status = 'PENDING'
        `, [targetUserId]);

        return {
            success: true,
            request: {
                id: targetUserId,
                name: cleanName,
                flag: '🇮🇳',
                level: playerData.level || 15,
                rank: 'Pro Master',
                avatar: playerData.avatar || '🏏',
                online: true
            }
        };
    } catch (err) {
        console.error('SQL Error in addFriendRequest:', err.message);
        return { success: false, message: err.message };
    }
}

async function acceptFriendRequest(requestId) {
    try {
        const pool = getPool();
        // requestId can be friend record id or friend_user_id
        await pool.query(`
            UPDATE friends 
            SET status = 'ACCEPTED' 
            WHERE user_id = 1 AND (id = ? OR friend_user_id = ?)
        `, [requestId, requestId]);

        return { success: true };
    } catch (err) {
        console.error('SQL Error in acceptFriendRequest:', err.message);
        return { success: false, message: err.message };
    }
}

async function declineFriendRequest(requestId) {
    try {
        const pool = getPool();
        await pool.query(`
            DELETE FROM friends 
            WHERE user_id = 1 AND (id = ? OR friend_user_id = ?)
        `, [requestId, requestId]);

        return { success: true };
    } catch (err) {
        console.error('SQL Error in declineFriendRequest:', err.message);
        return { success: false, message: err.message };
    }
}

async function sendFriendGift(friendId) {
    try {
        const pool = getPool();
        await pool.query(`
            UPDATE friends 
            SET gift_sent_today = 1, last_gift_date = CURDATE() 
            WHERE user_id = 1 AND (id = ? OR friend_user_id = ?)
        `, [friendId, friendId]);

        return { success: true };
    } catch (err) {
        console.error('SQL Error in sendFriendGift:', err.message);
        return { success: false, message: err.message };
    }
}

async function collectAndSendAllGifts() {
    try {
        const pool = getPool();
        await pool.query(`
            UPDATE friends 
            SET gift_sent_today = 1, last_gift_date = CURDATE() 
            WHERE user_id = 1
        `);

        return { success: true, coinsAwarded: 350, xpAwarded: 25 };
    } catch (err) {
        console.error('SQL Error in collectAndSendAllGifts:', err.message);
        return { success: false, message: err.message };
    }
}

module.exports = {
    getFriendsData,
    addFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    sendFriendGift,
    collectAndSendAllGifts
};
