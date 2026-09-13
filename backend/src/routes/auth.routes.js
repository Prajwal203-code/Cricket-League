const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getPool } = require('../config/db');

// GET /api/auth/config (Public OAuth App IDs from .env)
router.get('/config', (req, res) => {
    res.json({
        success: true,
        googleClientId: process.env.GOOGLE_CLIENT_ID || '',
        facebookAppId: process.env.FACEBOOK_APP_ID || ''
    });
});

// GET /api/auth/current (Get current session and guest/social status)
router.get('/current', async (req, res) => {
    try {
        const pool = getPool();
        const userId = req.query.userId || 1;
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({
            success: true,
            user: users[0],
            isGuest: Boolean(users[0].is_guest)
        });
    } catch (err) {
        console.error('SQL Error in auth current:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/auth/players (List all registered players in MySQL for fast switching / testing)
router.get('/players', async (req, res) => {
    try {
        const pool = getPool();
        const [users] = await pool.query('SELECT id, username, auth_provider, social_id, email, avatar, level, trophies, coins, gems, is_guest FROM users ORDER BY id ASC');
        res.json({
            success: true,
            users
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/social-signin (Sign in / Connect Google Play, Google GIS, or Facebook)
router.post('/social-signin', async (req, res) => {
    try {
        const { provider, socialId, displayName, avatar, email, googleCredential } = req.body;
        const pool = getPool();

        let realSocialId = socialId;
        let realEmail = email;
        let realName = displayName;
        let realAvatar = avatar;

        // 1. If Google GIS Credential JWT was provided, decode real Google OAuth payload
        if (googleCredential) {
            const decoded = jwt.decode(googleCredential);
            if (decoded) {
                realSocialId = decoded.sub || realSocialId;
                realEmail = decoded.email || realEmail;
                realName = decoded.name || realName;
                realAvatar = decoded.picture || realAvatar || '🎮';
            }
        }

        if (!provider || !realSocialId) {
            return res.status(400).json({ success: false, message: 'Provider and Social ID are required' });
        }

        // 2. Check if this social account or user ID already exists in MySQL
        const [existing] = await pool.query(`
            SELECT * FROM users 
            WHERE (auth_provider = ? AND social_id = ?) 
               OR (email IS NOT NULL AND email = ?)
               OR (username = ?)
        `, [provider, realSocialId, realEmail || '', realName || '']);

        if (existing.length > 0) {
            // Matched existing user in MySQL!
            const matchedUser = existing[0];
            await pool.query('UPDATE users SET is_guest = 0, auth_provider = ?, social_id = ? WHERE id = ?', [provider, realSocialId, matchedUser.id]);
            
            const [refreshed] = await pool.query('SELECT * FROM users WHERE id = ?', [matchedUser.id]);

            return res.json({
                success: true,
                isNew: false,
                user: refreshed[0],
                message: `🎉 Matched existing account in MySQL! Welcome back, ${refreshed[0].username} (ID: ${realSocialId}).`
            });
        }

        // 3. New User: Create fresh registered player row in MySQL
        const cleanUsername = realName || `${provider === 'google' ? 'GoogleUser' : 'FBUser'}_${Date.now().toString().slice(-4)}`;
        const cleanRef = `CRIC-${cleanUsername.toUpperCase().replace(/\s+/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

        const [insertRes] = await pool.query(`
            INSERT INTO users (username, auth_provider, social_id, email, avatar, level, coins, gems, trophies, referral_code, is_guest)
            VALUES (?, ?, ?, ?, ?, 2, 25870, 60, 120, ?, 0)
        `, [cleanUsername, provider, realSocialId, realEmail || `${realSocialId}@${provider}.com`, realAvatar || '🎮', cleanRef]);

        const newUserId = insertRes.insertId;

        // Seed full starting 11 squad cards for this new user in MySQL
        const { syncUserSquadForCountry } = require('../config/db');
        await syncUserSquadForCountry(newUserId, 'IN');

        const [newUser] = await pool.query('SELECT * FROM users WHERE id = ?', [newUserId]);

        res.json({
            success: true,
            isNew: true,
            user: newUser[0],
            message: `🎉 New player registered in MySQL database! User ID: ${realSocialId} linked.`
        });
    } catch (err) {
        console.error('SQL Error in social-signin:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/switch-guest (Switch to Guest Mode for testing / guest play)
router.post('/switch-guest', async (req, res) => {
    try {
        const pool = getPool();
        const userId = req.body.userId || 1;
        await pool.query(`
            UPDATE users 
            SET is_guest = 1,
                auth_provider = 'guest'
            WHERE id = ?
        `, [userId]);

        const [user] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);

        res.json({
            success: true,
            user: user[0],
            message: 'Switched to Guest Account. Sign in with Google or Facebook to enable friends.'
        });
    } catch (err) {
        console.error('SQL Error in switch-guest:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
