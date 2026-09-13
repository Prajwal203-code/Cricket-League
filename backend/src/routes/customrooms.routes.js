const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// POST /api/rooms/create (Host creates a 4-digit custom room)
router.post('/create', async (req, res) => {
    try {
        const { hostUserId, hostUsername, stadium } = req.body;
        const activeUserId = parseInt(hostUserId || 1, 10);
        const name = hostUsername || 'Player';
        const stadiumName = stadium || 'Adelaide Oval';
        const pool = getPool();

        // Generate 4-digit room code
        const roomCode = Math.floor(1000 + Math.random() * 9000).toString();

        await pool.query(`
            INSERT INTO custom_match_rooms (room_code, host_user_id, host_username, stadium, status)
            VALUES (?, ?, ?, ?, 'WAITING')
        `, [roomCode, activeUserId, name, stadiumName]);

        res.json({
            success: true,
            roomCode,
            stadium: stadiumName,
            message: `🎮 Custom Room #${roomCode} Created! Share code with your opponent.`
        });
    } catch (err) {
        console.error('Error creating custom room:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/rooms/join (Guest enters 4-digit room code to join)
router.post('/join', async (req, res) => {
    try {
        const { guestUserId, guestUsername, roomCode } = req.body;
        const activeUserId = parseInt(guestUserId || 1, 10);
        const name = guestUsername || 'Player';
        const code = (roomCode || '').trim();
        const pool = getPool();

        const [rooms] = await pool.query('SELECT * FROM custom_match_rooms WHERE room_code = ? AND status = "WAITING"', [code]);
        if (rooms.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid or expired room code!' });
        }

        const room = rooms[0];
        if (room.host_user_id === activeUserId) {
            return res.status(400).json({ success: false, message: 'You are the host of this room!' });
        }

        // Connect guest to room
        await pool.query(`
            UPDATE custom_match_rooms 
            SET guest_user_id = ?, guest_username = ?, status = 'PLAYING' 
            WHERE id = ?
        `, [activeUserId, name, room.id]);

        res.json({
            success: true,
            roomCode: code,
            hostUserId: room.host_user_id,
            hostUsername: room.host_username,
            stadium: room.stadium,
            message: `⚔️ Connected to Room #${code}! Launching 1v1 duel against ${room.host_username}...`
        });
    } catch (err) {
        console.error('Error joining custom room:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/rooms/status (Host polls for opponent join)
router.get('/status', async (req, res) => {
    try {
        const code = (req.query.code || '').trim();
        const pool = getPool();

        const [rooms] = await pool.query('SELECT * FROM custom_match_rooms WHERE room_code = ?', [code]);
        if (rooms.length === 0) {
            return res.status(404).json({ success: false, message: 'Room not found' });
        }

        const r = rooms[0];
        res.json({
            success: true,
            roomCode: r.room_code,
            status: r.status,
            hostUsername: r.host_username,
            guestUsername: r.guest_username,
            stadium: r.stadium
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
