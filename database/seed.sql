USE `cricket_strike`;

-- 1. Seed Player Cards
INSERT INTO `player_cards` (`name`, `role`, `rarity`, `base_power`, `special_ability`, `unlock_tour`) VALUES
('Bhaskar', 'fast_bowler', 'common', 25, 'Extra swing at high speed', 1),
('Lakshya', 'fast_bowler', 'rare', 32, 'Reverse swing', 1),
('James', 'leg_spinner', 'common', 25, 'Sharp turn', 1),
('Suhas', 'off_spinner', 'common', 25, 'Drift + dip', 2),
('Brad', 'fast_bowler', 'epic', 20, 'Yorker specialist', 2),
('Ranveer', 'fast_bowler', 'epic', 20, 'Bouncer king', 3),
('Joshua', 'fast_bowler', 'epic', 20, 'Death over expert', 3),
('Wajid', 'fast_bowler', 'common', 20, 'Economy bowler', 3),
('Mike', 'fast_bowler', 'epic', 30, 'All-surface expert', 4),
('Virudh', 'batsman', 'epic', 30, '6s on short balls', 1),
('Hardeep', 'batsman', 'rare', 25, 'Cover drive master', 2),
('Danny', 'batsman', 'common', 20, 'Sweep specialist', 2),
('Vikas', 'batsman', 'common', 15, 'Solid defence', 1),
('MK Singh', 'batsman', 'rare', 10, 'Pinch hitter', 3);

-- 2. Seed Tours
INSERT INTO `tours` (`name`, `tour_number`, `entry_fee`, `prize`, `color_hex`, `min_level`) VALUES
('Mumbai', 1, 100, 200, '#E07020', 1),
('Karachi', 2, 250, 500, '#1A8A6A', 2),
('Adelaide', 3, 1000, 2000, '#1A72C4', 3),
('Dubai', 4, 3000, 6000, '#0E9B9B', 5),
('Johannesburg', 5, 10000, 20000, '#2E8B2E', 7),
('Cape Town', 6, 50000, 100000, '#C41A1A', 10),
('Melbourne', 7, 105000, 200000, '#6A1A9B', 15),
('London', 8, 260000, 500000, '#C41A30', 20);

-- 3. Seed Ball Skins
INSERT INTO `balls` (`name`, `rarity`, `description`) VALUES
('Default', 'common', 'Classic red leather match ball'),
('Kingfisher', 'rare', 'Aerodynamic yellow coating for extra drift'),
('Stallion', 'rare', 'Tough orange seam for consistent bounce'),
('Lizard', 'rare', 'Textured grip for sharp turn'),
('Lion', 'epic', 'Clean white ball for high visibility'),
('Highness', 'epic', 'Royal purple finish with gold seam'),
('Tempest', 'legendary', 'Dark aerodynamic shell for lethal pace'),
('Cobra', 'legendary', 'Venomous green with maximum reverse swing');

-- 4. Seed Daily Reward Schedule
INSERT INTO `daily_reward_schedule` (`day_number`, `coins`, `gems`, `card_pack`) VALUES
(1, 200, 0, false),
(2, 400, 5, false),
(3, 600, 0, false),
(4, 800, 10, false),
(5, 1000, 0, false),
(6, 1500, 15, false),
(7, 2000, 50, true);

-- 5. Seed Shop Packs
INSERT INTO `shop_packs` (`name`, `price_inr`, `price_usd`, `coins_bonus`, `gems_bonus`, `card_slots`, `min_rarity`, `is_featured`) VALUES
('Starter Pack', 49.00, 0.99, 5000, 50, 1, 'common', false),
('Classic Pack', 99.00, 1.99, 12000, 120, 2, 'common', false),
('Rare Bowler Pack', 149.00, 2.99, 15000, 150, 1, 'rare', false),
('Epic Bowler Pack', 199.00, 3.99, 20000, 200, 1, 'epic', true),
('Champion Bundle', 499.00, 9.99, 60000, 500, 3, 'epic', false);
