const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// Ball Prices (Buy 1 Ball with Coins)
const BALL_PRICES = {
    classic: 0,         // FREE Default Brown Leather Ball (Infinite ∞)
    fireball: 1000,      // Fireball Inferno
    water: 1200,        // Ocean Tsunami
    lightning: 1500,    // Lightning Plasma
    galaxy: 2500,       // Galaxy Cosmic
    gold_sun: 3000,     // Golden Sun King
    frostbite: 1200,    // Frostbite Ice Dragon
    rainbow: 1000,      // Rainbow Disco Pop
    magma: 2000,        // Lava Magma Core
    bomb: 1500,         // Comic BOOM Bomb
    cyber: 800          // Cyber Neon Matrix
};

// Seed default ball inventory (ONLY Classic Brown Leather is infinite ∞, all others 0)
async function seedDefaultBallInventory(pool, userId) {
    // Ensure default Classic Ball exists
    await pool.query(
        `INSERT IGNORE INTO user_ball_skins (user_id, skin_id, price_paid, quantity, is_equipped) VALUES (?, 'classic', 0, 999999, 1)`,
        [userId]
    );

    // Clean up any old dummy starter seeded rows where price_paid was 0 (except classic)
    try {
        await pool.query(
            `DELETE FROM user_ball_skins WHERE user_id = ? AND price_paid = 0 AND skin_id != 'classic'`,
            [userId]
        );
    } catch (e) {}
}

// ----------------------------------------------------
// 1. GET /api/balls — Fetch User Ball Inventory Counts
// ----------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const pool = getPool();
        const userId = req.session?.userId || 1;

        await seedDefaultBallInventory(pool, userId);

        const [users] = await pool.query(`SELECT coins FROM users WHERE id = ?`, [userId]);
        const userCoins = users[0] ? users[0].coins : 2500;

        const [skins] = await pool.query(
            `SELECT skin_id, quantity, is_equipped FROM user_ball_skins WHERE user_id = ?`,
            [userId]
        );

        const inventory = {
            classic: 999999
        };
        let equippedBall = 'classic';

        skins.forEach(s => {
            if (s.skin_id === 'classic') {
                inventory['classic'] = 999999;
            } else {
                inventory[s.skin_id] = s.quantity || 0;
            }
            if (s.is_equipped === 1) equippedBall = s.skin_id;
        });

        // Unlocked skins are ONLY skins with quantity > 0, plus classic
        const unlockedSkins = Object.keys(inventory).filter(id => id === 'classic' || inventory[id] > 0);

        return res.json({
            success: true,
            coins: userCoins,
            inventory,
            unlockedSkins,
            equippedBall,
            totalPurchased: unlockedSkins.length
        });
    } catch (err) {
        console.error('Error fetching user ball inventory:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch ball inventory' });
    }
});

// ----------------------------------------------------
// 2. POST /api/balls/buy — Buy 1 Ball with Coins
// ----------------------------------------------------
router.post('/buy', async (req, res) => {
    try {
        const pool = getPool();
        const userId = req.session?.userId || 1;
        const { skinId } = req.body;

        if (!skinId || BALL_PRICES[skinId] === undefined) {
            return res.status(400).json({ success: false, message: 'Invalid ball skin ID' });
        }

        const price = BALL_PRICES[skinId];

        const [users] = await pool.query(`SELECT coins FROM users WHERE id = ?`, [userId]);
        if (!users[0]) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const currentCoins = users[0].coins;

        if (currentCoins < price) {
            return res.json({
                success: false,
                message: `Not enough coins! You need ${price.toLocaleString()} 🪙 to buy this ball.`
            });
        }

        const newCoins = currentCoins - price;
        await pool.query(`UPDATE users SET coins = ? WHERE id = ?`, [newCoins, userId]);

        // Add 1 ball to user inventory in MySQL DB
        await pool.query(
            `INSERT INTO user_ball_skins (user_id, skin_id, price_paid, quantity, is_equipped)
             VALUES (?, ?, ?, 1, 0)
             ON DUPLICATE KEY UPDATE quantity = quantity + 1, price_paid = ?`,
            [userId, skinId, price, price]
        );

        const [skins] = await pool.query(
            `SELECT skin_id, quantity, is_equipped FROM user_ball_skins WHERE user_id = ?`,
            [userId]
        );

        const inventory = { classic: 999999 };
        let equippedBall = 'classic';
        skins.forEach(s => {
            if (s.skin_id === 'classic') inventory['classic'] = 999999;
            else inventory[s.skin_id] = s.quantity || 0;
            if (s.is_equipped === 1) equippedBall = s.skin_id;
        });

        const unlockedSkins = Object.keys(inventory).filter(id => id === 'classic' || inventory[id] > 0);

        return res.json({
            success: true,
            coins: newCoins,
            inventory,
            unlockedSkins,
            equippedBall,
            message: `1 Ball added to your inventory!`
        });

    } catch (err) {
        console.error('Error buying ball:', err);
        return res.status(500).json({ success: false, message: 'Transaction failed' });
    }
});

// ----------------------------------------------------
// 3. POST /api/balls/sync — Backup Phone Local Storage Inventory to MySQL DB on Login
// ----------------------------------------------------
router.post('/sync', async (req, res) => {
    try {
        const pool = getPool();
        const userId = req.session?.userId || 1;
        const { inventory, equippedBall } = req.body;

        if (inventory && typeof inventory === 'object') {
            for (const sId of Object.keys(inventory)) {
                if (sId === 'classic') continue;
                const qty = parseInt(inventory[sId], 10) || 0;
                if (qty > 0) {
                    await pool.query(
                        `INSERT INTO user_ball_skins (user_id, skin_id, price_paid, quantity, is_equipped)
                         VALUES (?, ?, ?, ?, 0)
                         ON DUPLICATE KEY UPDATE quantity = GREATEST(quantity, ?)`,
                        [userId, sId, BALL_PRICES[sId] || 1000, qty, qty]
                    );
                }
            }
        }

        const [skins] = await pool.query(`SELECT skin_id, quantity FROM user_ball_skins WHERE user_id = ?`, [userId]);
        const updatedInventory = { classic: 999999 };
        skins.forEach(s => {
            if (s.skin_id === 'classic') updatedInventory['classic'] = 999999;
            else updatedInventory[s.skin_id] = s.quantity || 0;
        });

        const unlockedSkins = Object.keys(updatedInventory).filter(id => id === 'classic' || updatedInventory[id] > 0);

        return res.json({
            success: true,
            inventory: updatedInventory,
            unlockedSkins,
            equippedBall: equippedBall || 'classic'
        });
    } catch (err) {
        console.error('Error syncing local ball inventory to SQL DB:', err);
        return res.status(500).json({ success: false, message: 'Sync failed' });
    }
});

module.exports = router;
