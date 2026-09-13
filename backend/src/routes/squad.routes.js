const express = require('express');
const router = express.Router();
const { getPool, syncUserSquadForCountry, getStartingSquadForCountry, getAllCountryOptions } = require('../config/db');

// GET /api/squad/countries (List of major & non-major countries with 11-player squad preview)
router.get('/countries', (req, res) => {
    try {
        const countryOptions = getAllCountryOptions();
        res.json({
            success: true,
            ...countryOptions
        });
    } catch (err) {
        console.error('Error fetching country options:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/squad/preview?country=IN (Preview 11-player roster for any country)
router.get('/preview', (req, res) => {
    try {
        const countryCode = req.query.country || 'IN';
        const squadData = getStartingSquadForCountry(countryCode);
        res.json({
            success: true,
            ...squadData
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/squad/select-country (Change country and assign 11 starting players)
router.post('/select-country', async (req, res) => {
    try {
        const { countryCode, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();
        const code = (countryCode || 'IN').toUpperCase();

        // 1. Update user country in users table
        await pool.query('UPDATE users SET country_code = ? WHERE id = ?', [code, activeUserId]);

        // 2. Generate and sync 11 fixed starting players in squad_cards
        const squadData = await syncUserSquadForCountry(activeUserId, code);

        // 3. Fetch newly generated cards
        const [cardsRaw] = await pool.query('SELECT * FROM squad_cards WHERE user_id = ? ORDER BY batting_order ASC, level DESC', [activeUserId]);
        const cards = cardsRaw.map(c => ({
            ...c,
            name: c.card_name,
            maxCopies: c.max_copies,
            order: c.batting_order,
            countryOrigin: c.country_origin,
            originFlag: c.origin_flag,
            active: Boolean(c.is_active)
        }));

        const playing11 = cards.filter(c => c.batting_order > 0);
        const teamPower = playing11.reduce((sum, p) => sum + (p.power || 0), 0);

        res.json({
            success: true,
            message: `🎉 Selected ${squadData.countryInfo.name} ${squadData.countryInfo.flag}! Starting 11 squad initialized.`,
            countryInfo: squadData.countryInfo,
            playing11,
            cards,
            teamPower
        });
    } catch (err) {
        console.error('SQL Error in select-country:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/squad from MySQL
router.get('/', async (req, res) => {
    try {
        const pool = getPool();
        const userId = req.query.userId || 1;

        // Get user country
        const [users] = await pool.query('SELECT country_code, username FROM users WHERE id = ?', [userId]);
        const userCountry = (users.length > 0 && users[0].country_code) ? users[0].country_code : 'IN';

        // Check if user already has 11 starting players
        let [cardsRaw] = await pool.query('SELECT * FROM squad_cards WHERE user_id = ? ORDER BY batting_order ASC, level DESC', [userId]);
        let playing11Cards = cardsRaw.filter(c => c.batting_order > 0);

        if (playing11Cards.length < 11) {
            await syncUserSquadForCountry(userId, userCountry);
            const [freshCards] = await pool.query('SELECT * FROM squad_cards WHERE user_id = ? ORDER BY batting_order ASC, level DESC', [userId]);
            cardsRaw = freshCards;
        }

        const cards = cardsRaw.map(c => ({
            ...c,
            name: c.card_name,
            maxCopies: c.max_copies,
            order: c.batting_order,
            countryOrigin: c.country_origin,
            originFlag: c.origin_flag,
            active: Boolean(c.is_active)
        }));

        const playing11 = cards.filter(c => c.batting_order > 0).sort((a, b) => a.batting_order - b.batting_order);
        const bowlers = cards.filter(c => c.card_type === 'bowler' || c.role.toLowerCase().includes('bowler') || c.role.toLowerCase().includes('spinner') || c.role.toLowerCase().includes('fast'));
        const batsmen = cards.filter(c => c.card_type === 'batsman' || c.card_type === 'wicket_keeper' || c.card_type === 'all_rounder' || c.card_name.includes('Bat'));
        const ballSkins = cards.filter(c => c.card_type === 'ball_skin');

        const teamPower = playing11.reduce((sum, p) => sum + (p.power || 0), 0);
        const squadInfo = getStartingSquadForCountry(userCountry);

        res.json({
            success: true,
            countryCode: userCountry,
            countryInfo: squadInfo.countryInfo,
            playing11,
            bowlers,
            batsmen,
            ballSkins,
            teamPower,
            cards
        });
    } catch (err) {
        console.error('SQL Error in squad route:', err.message);
        res.status(500).json({ success: false, message: 'Database error fetching squad cards' });
    }
});

// POST /api/squad/upgrade card in MySQL
router.post('/upgrade', async (req, res) => {
    try {
        const { cardId, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        const [cards] = await pool.query('SELECT * FROM squad_cards WHERE id = ? AND user_id = ?', [cardId, activeUserId]);
        if (cards.length === 0) {
            return res.status(404).json({ success: false, message: 'Card not found' });
        }

        const card = cards[0];
        const costCoins = card.level * 400;

        // Check user coins
        const [users] = await pool.query('SELECT coins FROM users WHERE id = ?', [activeUserId]);
        if (users[0].coins < costCoins) {
            return res.status(400).json({ success: false, message: 'Not enough coins to upgrade card' });
        }

        // Deduct coins & upgrade card in SQL
        await pool.query('UPDATE users SET coins = coins - ?, xp = xp + 50 WHERE id = ?', [costCoins, activeUserId]);
        await pool.query(`
            UPDATE squad_cards 
            SET level = level + 1, 
                power = power + 5, 
                copies = GREATEST(0, copies - max_copies),
                max_copies = max_copies + 5
            WHERE id = ?
        `, [cardId]);

        const [updatedCard] = await pool.query('SELECT * FROM squad_cards WHERE id = ?', [cardId]);

        res.json({
            success: true,
            card: updatedCard[0],
            coinsDeducted: costCoins,
            xpAwarded: 50,
            message: `🎉 ${card.card_name} upgraded to Level ⭐ ${card.level + 1}!`
        });
    } catch (err) {
        console.error('SQL Error in squad upgrade:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/squad/select card in match lineup
router.post('/select', async (req, res) => {
    try {
        const { cardId, cardType, userId } = req.body;
        const activeUserId = userId || 1;
        const pool = getPool();

        // If batsman, deactivate other batsmen
        if (cardType === 'batsman') {
            await pool.query('UPDATE squad_cards SET is_active = 0 WHERE user_id = ? AND card_type = "batsman"', [activeUserId]);
        }

        await pool.query('UPDATE squad_cards SET is_active = 1 WHERE id = ? AND user_id = ?', [cardId, activeUserId]);

        res.json({ success: true, message: 'Card lineup updated in SQL' });
    } catch (err) {
        console.error('SQL Error in squad select:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
