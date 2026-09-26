/**
 * Account profile and settings.
 *
 * Every handler here acts on the authenticated caller. The `userId` field that
 * these endpoints used to read out of the query string or request body is gone:
 * it let any client read and write any account.
 */
const express = require('express');
const router = express.Router();
const { getPool, syncUserSquadForCountry, getStartingSquadForCountry } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { xpForLevel } = require('../config/gameRules');

// Nothing here is public.
router.use(requireAuth);

/** GET /api/user/profile — the signed-in player's own profile and squad. */
router.get('/profile', async (req, res, next) => {
    try {
        const pool = getPool();
        const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.userId]);

        if (users.length === 0) {
            return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Account not found.' });
        }

        const user = users[0];
        const userCountry = user.country_code || 'IN';
        const squadInfo = getStartingSquadForCountry(userCountry);
        const [cards] = await pool.query(
            'SELECT * FROM squad_cards WHERE user_id = ? ORDER BY batting_order ASC, level DESC',
            [req.userId]
        );

        let characterConfig = null;
        try {
            characterConfig = user.character_config ? JSON.parse(user.character_config) : null;
        } catch {
            characterConfig = null;
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                country_code: userCountry,
                country_flag: squadInfo.countryInfo.flag,
                country_name: squadInfo.countryInfo.name,
                is_major_country: squadInfo.countryInfo.isMajor,
                star_rating: user.level * 6,
                level: user.level,
                xp: user.xp,
                max_xp: xpForLevel(user.level),
                coins: user.coins,
                gems: user.gems,
                trophies: user.trophies,
                matches_played: user.matches_played,
                matches_won: user.matches_won,
                total_sixes: user.total_sixes,
                referral_code: user.referral_code,
                auth_provider: user.auth_provider,
                is_guest: user.is_guest,
                character_config: characterConfig,
                squad: cards
            }
        });
    } catch (err) {
        next(err);
    }
});

/** POST /api/user/set-country — changes country and optionally re-rolls the starting squad. */
router.post('/set-country', async (req, res, next) => {
    try {
        const { countryCode, resetSquad } = req.body;
        const code = String(countryCode || 'IN').toUpperCase().slice(0, 10);

        // Reject a country we have no roster for rather than writing a value
        // that would break squad lookups later.
        const squadInfo = getStartingSquadForCountry(code);
        if (!squadInfo || !squadInfo.countryInfo) {
            return res.status(400).json({
                success: false, code: 'UNKNOWN_COUNTRY', message: 'That country is not available.'
            });
        }

        await getPool().query('UPDATE users SET country_code = ? WHERE id = ?', [code, req.userId]);

        const squadData = resetSquad !== false
            ? await syncUserSquadForCountry(req.userId, code)
            : squadInfo;

        res.json({
            success: true,
            message: `Country updated to ${squadData.countryInfo.name} ${squadData.countryInfo.flag}`,
            countryInfo: squadData.countryInfo,
            countryCode: code
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/user/appearance — persists the 3D character customisation.
 *
 * Cosmetic only, so the payload is stored as given; it is size-capped because
 * it lands in a LONGTEXT column that is read on every profile load.
 */
router.post('/appearance', async (req, res, next) => {
    try {
        const serialised = JSON.stringify(req.body.config || {});
        if (serialised.length > 8192) {
            return res.status(413).json({
                success: false, code: 'CONFIG_TOO_LARGE', message: 'Appearance settings are too large.'
            });
        }

        await getPool().query(
            'UPDATE users SET character_config = ? WHERE id = ?',
            [serialised, req.userId]
        );

        res.json({ success: true, message: 'Appearance saved.' });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/user/update-wallet & POST /api/user/sync-guest-data
 *
 * Backward-compatibility shims: balances and progression are authoritatively
 * maintained server-side via services/userService. Acknowledge with 200 OK so
 * legacy or cached client callers don't log errors.
 */
router.post('/update-wallet', (req, res) => {
    res.json({ success: true, message: 'Wallet balances are authoritative server-side.' });
});

router.post('/sync-guest-data', (req, res) => {
    res.json({ success: true, message: 'Guest progress is persisted server-side.' });
});

module.exports = router;

