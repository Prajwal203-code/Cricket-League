const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        success: true,
        featured_packs: [
            {
                id: 1,
                name: "Epic Bowler Pack",
                price_inr: 199.00,
                price_usd: 3.99,
                coins: 20000,
                gems: 200,
                card: { name: "Mike", rarity: "epic", power: 30 },
                expires_in: "1w 1d"
            }
        ],
        piggy_bank: {
            current_fill: 500,
            max_fill: 500,
            gems_to_open: 350,
            reward_gems: 385,
            reward_coins: 4000,
            reward_cards: 2
        }
    });
});

module.exports = router;
