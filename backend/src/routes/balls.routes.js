/**
 * Ball skin inventory.
 *
 * Fixes carried in here:
 *  - `req.session?.userId || 1` — there is no session middleware in this app,
 *    so that expression was *always* 1: every player read and spent user 1's
 *    inventory and coins. Identity now comes from the verified token.
 *  - `POST /api/balls/sync` accepted an inventory object from the browser and
 *    granted whatever quantities it claimed, for free. Removed; purchases are
 *    the only way to gain a ball.
 *  - `/buy` read the balance, subtracted in JavaScript and wrote the absolute
 *    result, so two concurrent buys each cost one ball's worth of coins. It is
 *    now a single transaction using applyWalletDelta.
 *  - equipping was never persisted (the old `/sync` echoed back whatever the
 *    client sent); there is a real `/equip` endpoint now.
 */
const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { applyWalletDelta } = require('../services/userService');
const { BALL_SKINS, UNLIMITED_BALL_QUANTITY } = require('../config/gameRules');

router.use(requireAuth);

const DEFAULT_SKIN = 'classic';

/** Ensures the free default ball exists for this account. */
async function ensureDefaultBall(db, userId) {
    await db.query(`
        INSERT IGNORE INTO user_ball_skins (user_id, skin_id, price_paid, quantity, is_equipped)
        VALUES (?, ?, 0, ?, 1)
    `, [userId, DEFAULT_SKIN, UNLIMITED_BALL_QUANTITY]);
}

/** Reads the caller's inventory in the shape the client renders. */
async function readInventory(db, userId) {
    const [skins] = await db.query(
        'SELECT skin_id, quantity, is_equipped FROM user_ball_skins WHERE user_id = ?',
        [userId]
    );

    const inventory = { [DEFAULT_SKIN]: UNLIMITED_BALL_QUANTITY };
    let equippedBall = DEFAULT_SKIN;

    for (const s of skins) {
        inventory[s.skin_id] = s.skin_id === DEFAULT_SKIN
            ? UNLIMITED_BALL_QUANTITY
            : Number(s.quantity || 0);
        if (s.is_equipped === 1) equippedBall = s.skin_id;
    }

    // An owned-then-spent skin stays in the table at quantity 0; only a
    // positive count counts as unlocked.
    const unlockedSkins = Object.keys(inventory)
        .filter(id => id === DEFAULT_SKIN || inventory[id] > 0);

    return { inventory, unlockedSkins, equippedBall };
}

/** GET /api/balls — inventory, balance and the authoritative price list. */
router.get('/', async (req, res, next) => {
    try {
        const pool = getPool();
        await ensureDefaultBall(pool, req.userId);

        const [users] = await pool.query('SELECT coins FROM users WHERE id = ?', [req.userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Account not found.' });
        }

        const state = await readInventory(pool, req.userId);

        res.json({
            success: true,
            coins: users[0].coins,
            prices: Object.fromEntries(
                Object.entries(BALL_SKINS).map(([id, s]) => [id, s.price])
            ),
            ...state,
            totalPurchased: state.unlockedSkins.length
        });
    } catch (err) {
        next(err);
    }
});

/** POST /api/balls/buy — { skinId } buys one ball at the server's price. */
router.post('/buy', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const skinId = String(req.body.skinId || '');
        const skin = BALL_SKINS[skinId];

        if (!skin) {
            conn.release();
            return res.status(400).json({ success: false, code: 'INVALID_SKIN', message: 'Unknown ball skin.' });
        }
        if (skin.free) {
            conn.release();
            return res.status(400).json({
                success: false, code: 'ALREADY_OWNED',
                message: 'The classic ball is free and already in your bag.'
            });
        }

        await conn.beginTransaction();
        await ensureDefaultBall(conn, req.userId);

        const wallet = await applyWalletDelta(req.userId, { coins: -skin.price }, conn);
        if (!wallet) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                code: 'INSUFFICIENT_COINS',
                message: `Not enough coins! You need ${skin.price.toLocaleString()} 🪙 to buy this ball.`
            });
        }

        await conn.query(`
            INSERT INTO user_ball_skins (user_id, skin_id, price_paid, quantity, is_equipped)
            VALUES (?, ?, ?, 1, 0)
            ON DUPLICATE KEY UPDATE quantity = quantity + 1, price_paid = VALUES(price_paid)
        `, [req.userId, skinId, skin.price]);

        const state = await readInventory(conn, req.userId);
        await conn.commit();

        res.json({
            success: true,
            coins: wallet.user.coins,
            spent: skin.price,
            ...state,
            message: `1 ${skin.name} added to your inventory!`
        });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

/** POST /api/balls/equip — { skinId } equips a ball the caller owns. */
router.post('/equip', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const skinId = String(req.body.skinId || '');
        if (!BALL_SKINS[skinId]) {
            conn.release();
            return res.status(400).json({ success: false, code: 'INVALID_SKIN', message: 'Unknown ball skin.' });
        }

        await conn.beginTransaction();
        await ensureDefaultBall(conn, req.userId);

        const [owned] = await conn.query(
            'SELECT quantity FROM user_ball_skins WHERE user_id = ? AND skin_id = ?',
            [req.userId, skinId]
        );
        if (skinId !== DEFAULT_SKIN && (owned.length === 0 || Number(owned[0].quantity) <= 0)) {
            await conn.rollback();
            return res.status(403).json({
                success: false, code: 'NOT_OWNED',
                message: 'Buy this ball before equipping it.'
            });
        }

        await conn.query('UPDATE user_ball_skins SET is_equipped = 0 WHERE user_id = ?', [req.userId]);
        await conn.query(
            'UPDATE user_ball_skins SET is_equipped = 1 WHERE user_id = ? AND skin_id = ?',
            [req.userId, skinId]
        );

        const state = await readInventory(conn, req.userId);
        await conn.commit();

        res.json({ success: true, ...state });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

module.exports = router;
