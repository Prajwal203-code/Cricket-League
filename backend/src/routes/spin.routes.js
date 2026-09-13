const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// Cooldown: 3 Days = 72 Hours in Milliseconds
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 259,200,000 ms

// 8 Calibrated Prize Wedges
const SPIN_PRIZES = [
    { id: 0, label: '1,000 🪙', type: 'coins', amount: 1000, icon: '🪙', color: '#0284c7', weight: 30 },
    { id: 1, label: '15 💎', type: 'gems', amount: 15, icon: '💎', color: '#10b981', weight: 20 },
    { id: 2, label: 'Elite Pack 🎁', type: 'pack', name: 'Elite Pack', icon: '🎁', color: '#8b5cf6', weight: 15 },
    { id: 3, label: '2,500 🪙', type: 'coins', amount: 2500, icon: '🪙', color: '#f59e0b', weight: 15 },
    { id: 4, label: '50 💎 MEGA', type: 'gems', amount: 50, icon: '💎', color: '#06b6d4', weight: 8 },
    { id: 5, label: '⚡ Neon Ball', type: 'skin', name: 'Neon Thunderball ⚡', icon: '⚡', color: '#3b82f6', weight: 5 },
    { id: 6, label: '5,000 🪙', type: 'coins', amount: 5000, icon: '🪙', color: '#eab308', weight: 5 },
    { id: 7, label: '🏆 100 💎 JACKPOT', type: 'gems', amount: 100, icon: '🏆', color: '#f43f5e', weight: 2 }
];

// Helper: Ensure Table exists
async function ensureSpinTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_lucky_spins (
            user_id INT PRIMARY KEY,
            last_spin_time BIGINT DEFAULT 0,
            total_spins INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

// GET /api/spin/status?userId=X
router.get('/status', async (req, res) => {
    try {
        const userId = parseInt(req.query.userId || 1, 10);
        const pool = getPool();
        await ensureSpinTable(pool);

        const [rows] = await pool.query('SELECT * FROM user_lucky_spins WHERE user_id = ?', [userId]);
        const now = Date.now();
        let lastSpinTime = 0;
        let totalSpins = 0;

        if (rows.length > 0) {
            lastSpinTime = Number(rows[0].last_spin_time || 0);
            totalSpins = Number(rows[0].total_spins || 0);
        } else {
            await pool.query('INSERT INTO user_lucky_spins (user_id, last_spin_time, total_spins) VALUES (?, 0, 0)', [userId]);
        }

        const elapsed = now - lastSpinTime;
        const canSpinFree = elapsed >= THREE_DAYS_MS;
        const remainingMs = canSpinFree ? 0 : (THREE_DAYS_MS - elapsed);
        const nextSpinTime = canSpinFree ? now : (lastSpinTime + THREE_DAYS_MS);

        res.json({
            success: true,
            canSpinFree,
            remainingMs,
            nextSpinTime,
            cooldownHours: 72,
            totalSpins,
            prizes: SPIN_PRIZES.map(({ weight, ...p }) => p)
        });
    } catch (err) {
        console.error('Error in /api/spin/status:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/spin/roll
router.post('/roll', async (req, res) => {
    try {
        const { userId, useGems } = req.body;
        const activeUserId = parseInt(userId || 1, 10);
        const pool = getPool();
        await ensureSpinTable(pool);

        const [userRows] = await pool.query('SELECT coins, gems FROM users WHERE id = ?', [activeUserId]);
        if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

        const [spinRows] = await pool.query('SELECT * FROM user_lucky_spins WHERE user_id = ?', [activeUserId]);
        const now = Date.now();
        let lastSpinTime = spinRows.length > 0 ? Number(spinRows[0].last_spin_time || 0) : 0;
        const elapsed = now - lastSpinTime;
        const canSpinFree = elapsed >= THREE_DAYS_MS;

        if (!canSpinFree) {
            if (!useGems) {
                const remainingHours = Math.ceil((THREE_DAYS_MS - elapsed) / (1000 * 60 * 60));
                return res.status(400).json({
                    success: false,
                    canSpinFree: false,
                    message: `⏳ Lucky Spin is on cooldown! Next free spin in ${remainingHours} hours (or use 25 💎 Gems).`
                });
            }

            // Deduct 25 Gems for paid re-spin
            if (userRows[0].gems < 25) {
                return res.status(400).json({ success: false, message: 'You need 25 💎 Gems for an extra spin!' });
            }
            await pool.query('UPDATE users SET gems = gems - 25 WHERE id = ?', [activeUserId]);
        }

        // Weighted Random Selection for Fair RNG
        const totalWeight = SPIN_PRIZES.reduce((sum, p) => sum + p.weight, 0);
        let rand = Math.random() * totalWeight;
        let chosenIndex = 0;

        for (let i = 0; i < SPIN_PRIZES.length; i++) {
            if (rand < SPIN_PRIZES[i].weight) {
                chosenIndex = i;
                break;
            }
            rand -= SPIN_PRIZES[i].weight;
        }

        const prize = SPIN_PRIZES[chosenIndex];

        // Award prize to user
        let coinsToAdd = 0;
        let gemsToAdd = 0;

        if (prize.type === 'coins') coinsToAdd = prize.amount;
        if (prize.type === 'gems') gemsToAdd = prize.amount;

        if (coinsToAdd > 0 || gemsToAdd > 0) {
            await pool.query('UPDATE users SET coins = coins + ?, gems = gems + ? WHERE id = ?', [coinsToAdd, gemsToAdd, activeUserId]);
        }

        // If it was a free spin, update last_spin_time to start 3-day cooldown
        if (canSpinFree) {
            await pool.query(`
                INSERT INTO user_lucky_spins (user_id, last_spin_time, total_spins)
                VALUES (?, ?, 1)
                ON DUPLICATE KEY UPDATE last_spin_time = ?, total_spins = total_spins + 1
            `, [activeUserId, now, now]);
        } else {
            await pool.query('UPDATE user_lucky_spins SET total_spins = total_spins + 1 WHERE user_id = ?', [activeUserId]);
        }

        // Get updated user balance
        const [updatedUser] = await pool.query('SELECT coins, gems FROM users WHERE id = ?', [activeUserId]);

        res.json({
            success: true,
            winningIndex: chosenIndex,
            prize: {
                id: prize.id,
                label: prize.label,
                type: prize.type,
                amount: prize.amount || 0,
                icon: prize.icon
            },
            newCoins: updatedUser[0].coins,
            newGems: updatedUser[0].gems,
            canSpinFree: false,
            remainingMs: THREE_DAYS_MS,
            message: `🎉 You won ${prize.label}!`
        });
    } catch (err) {
        console.error('Error in /api/spin/roll:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
