/**
 * Squad cards: the player's starting eleven, upgrades and lineup.
 *
 * Country and preview lookups are public reference data. Everything that reads
 * or writes a specific player's squad now requires a session, and acts on that
 * session's account rather than on a `userId` taken from the request.
 */
const express = require('express');
const router = express.Router();
const { getPool, syncUserSquadForCountry, getStartingSquadForCountry, getAllCountryOptions } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { applyWalletDelta } = require('../services/userService');
const { SQUAD, cardUpgradeCost } = require('../config/gameRules');

/** Shapes a DB row into the camelCase form the client renders. */
function toCard(c) {
    return {
        ...c,
        name: c.card_name,
        maxCopies: c.max_copies,
        order: c.batting_order,
        countryOrigin: c.country_origin,
        originFlag: c.origin_flag,
        active: Boolean(c.is_active)
    };
}

// --- Public reference data -------------------------------------------------

/** GET /api/squad/countries — every selectable country and its roster preview. */
router.get('/countries', (req, res, next) => {
    try {
        res.json({ success: true, ...getAllCountryOptions() });
    } catch (err) {
        next(err);
    }
});

/** GET /api/squad/preview?country=IN */
router.get('/preview', (req, res, next) => {
    try {
        const countryCode = String(req.query.country || 'IN').toUpperCase().slice(0, 10);
        res.json({ success: true, ...getStartingSquadForCountry(countryCode) });
    } catch (err) {
        next(err);
    }
});

// --- Player-owned data -----------------------------------------------------

router.use(requireAuth);

/** POST /api/squad/select-country — picks a country and rebuilds the starting eleven. */
router.post('/select-country', async (req, res, next) => {
    try {
        const code = String(req.body.countryCode || 'IN').toUpperCase().slice(0, 10);
        const pool = getPool();

        const squadInfo = getStartingSquadForCountry(code);
        if (!squadInfo || !squadInfo.countryInfo) {
            return res.status(400).json({ success: false, code: 'UNKNOWN_COUNTRY', message: 'That country is not available.' });
        }

        await pool.query('UPDATE users SET country_code = ? WHERE id = ?', [code, req.userId]);
        const squadData = await syncUserSquadForCountry(req.userId, code);

        const [cardsRaw] = await pool.query(
            'SELECT * FROM squad_cards WHERE user_id = ? ORDER BY batting_order ASC, level DESC',
            [req.userId]
        );
        const cards = cardsRaw.map(toCard);
        const playing11 = cards.filter(c => c.batting_order > 0);

        res.json({
            success: true,
            message: `🎉 Selected ${squadData.countryInfo.name} ${squadData.countryInfo.flag}! Starting 11 squad initialized.`,
            countryInfo: squadData.countryInfo,
            playing11,
            cards,
            teamPower: playing11.reduce((sum, p) => sum + (p.power || 0), 0)
        });
    } catch (err) {
        next(err);
    }
});

/** GET /api/squad — the caller's full collection, grouped for the squad screen. */
router.get('/', async (req, res, next) => {
    try {
        const pool = getPool();

        const [users] = await pool.query('SELECT country_code FROM users WHERE id = ?', [req.userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Account not found.' });
        }
        const userCountry = users[0].country_code || 'IN';

        let [cardsRaw] = await pool.query(
            'SELECT * FROM squad_cards WHERE user_id = ? ORDER BY batting_order ASC, level DESC',
            [req.userId]
        );

        // A new account, or one whose squad was cleared, gets its eleven built
        // on first read rather than showing an empty screen.
        if (cardsRaw.filter(c => c.batting_order > 0).length < SQUAD.playingEleven) {
            await syncUserSquadForCountry(req.userId, userCountry);
            [cardsRaw] = await pool.query(
                'SELECT * FROM squad_cards WHERE user_id = ? ORDER BY batting_order ASC, level DESC',
                [req.userId]
            );
        }

        const cards = cardsRaw.map(toCard);
        const playing11 = cards
            .filter(c => c.batting_order > 0)
            .sort((a, b) => a.batting_order - b.batting_order);

        const isBowler = c => {
            const role = (c.role || '').toLowerCase();
            return c.card_type === 'bowler' || role.includes('bowler') || role.includes('spinner') || role.includes('fast');
        };

        res.json({
            success: true,
            countryCode: userCountry,
            countryInfo: getStartingSquadForCountry(userCountry).countryInfo,
            playing11,
            bowlers: cards.filter(isBowler),
            batsmen: cards.filter(c =>
                ['batsman', 'wicket_keeper', 'all_rounder'].includes(c.card_type)),
            ballSkins: cards.filter(c => c.card_type === 'ball_skin'),
            teamPower: playing11.reduce((sum, p) => sum + (p.power || 0), 0),
            cards
        });
    } catch (err) {
        next(err);
    }
});

/** POST /api/squad/upgrade — spends coins to level a card the caller owns. */
router.post('/upgrade', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const cardId = parseInt(req.body.cardId, 10);
        if (!Number.isInteger(cardId)) {
            conn.release();
            return res.status(400).json({ success: false, code: 'INVALID_CARD', message: 'A valid card is required.' });
        }

        await conn.beginTransaction();

        // Ownership is part of the WHERE clause, so a card id belonging to
        // someone else simply does not resolve.
        const [cards] = await conn.query(
            'SELECT * FROM squad_cards WHERE id = ? AND user_id = ? FOR UPDATE',
            [cardId, req.userId]
        );
        if (cards.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Card not found.' });
        }

        const card = cards[0];
        const costCoins = cardUpgradeCost(card.level);

        // applyWalletDelta refuses to overdraw inside the same transaction, so
        // there is no window between checking the balance and spending it.
        const wallet = await applyWalletDelta(req.userId, {
            coins: -costCoins,
            xp: SQUAD.xpPerUpgrade
        }, conn);

        if (!wallet) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                code: 'INSUFFICIENT_COINS',
                message: `You need ${costCoins.toLocaleString()} coins to upgrade this card.`
            });
        }

        await conn.query(`
            UPDATE squad_cards
               SET level = level + 1,
                   power = power + ?,
                   copies = GREATEST(0, copies - max_copies),
                   max_copies = max_copies + ?
             WHERE id = ?
        `, [SQUAD.powerPerUpgrade, SQUAD.maxCopiesIncrease, cardId]);

        const [updatedCard] = await conn.query('SELECT * FROM squad_cards WHERE id = ?', [cardId]);
        await conn.commit();

        res.json({
            success: true,
            card: toCard(updatedCard[0]),
            coinsDeducted: costCoins,
            xpAwarded: SQUAD.xpPerUpgrade,
            balance: wallet.user.coins,
            message: `🎉 ${card.card_name} upgraded to Level ⭐ ${card.level + 1}!`
        });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

/** POST /api/squad/select — sets the active card for a slot. */
router.post('/select', async (req, res, next) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const cardId = parseInt(req.body.cardId, 10);
        if (!Number.isInteger(cardId)) {
            conn.release();
            return res.status(400).json({ success: false, code: 'INVALID_CARD', message: 'A valid card is required.' });
        }

        await conn.beginTransaction();

        const [owned] = await conn.query(
            'SELECT card_type FROM squad_cards WHERE id = ? AND user_id = ?',
            [cardId, req.userId]
        );
        if (owned.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Card not found.' });
        }

        // The card's own type decides which slot it fills. Taking `cardType`
        // from the body let a client clear the wrong group.
        const cardType = owned[0].card_type;
        if (cardType === 'batsman') {
            await conn.query(
                "UPDATE squad_cards SET is_active = 0 WHERE user_id = ? AND card_type = 'batsman'",
                [req.userId]
            );
        }

        await conn.query(
            'UPDATE squad_cards SET is_active = 1 WHERE id = ? AND user_id = ?',
            [cardId, req.userId]
        );

        await conn.commit();
        res.json({ success: true, message: 'Lineup updated.' });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
});

module.exports = router;
