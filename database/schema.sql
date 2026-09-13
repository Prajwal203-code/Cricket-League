-- ==========================================================
-- Cricket Strike Database Schema (MySQL 8.0)
-- Production Ready & ACID compliant
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `cricket_strike` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `cricket_strike`;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `username` VARCHAR(30) UNIQUE NOT NULL,
    `email` VARCHAR(100) UNIQUE,
    `phone` VARCHAR(15) UNIQUE,
    `password_hash` VARCHAR(255),
    `avatar_url` VARCHAR(500),
    `country_code` CHAR(2) DEFAULT 'IN',
    `gems` INT DEFAULT 50,
    `coins` INT DEFAULT 1000,
    `level` INT DEFAULT 1,
    `xp` INT DEFAULT 0,
    `is_guest` BOOLEAN DEFAULT FALSE,
    `guest_id` VARCHAR(50),
    `push_token` VARCHAR(300),
    `last_login` DATETIME,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_country` (`country_code`),
    INDEX `idx_last_login` (`last_login`)
) ENGINE=InnoDB;

-- 2. Player Cards Catalogue
CREATE TABLE IF NOT EXISTS `player_cards` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `role` ENUM('batsman','fast_bowler','medium_fast', 'leg_spinner','off_spinner') NOT NULL,
    `rarity` ENUM('starter','common','rare','epic','legendary') NOT NULL,
    `base_power` INT NOT NULL,
    `max_level` INT DEFAULT 10,
    `special_ability` VARCHAR(150),
    `unlock_tour` INT DEFAULT 1,
    `avatar_url` VARCHAR(500),
    `description` TEXT,
    `is_active` BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

-- 3. User Cards Inventory
CREATE TABLE IF NOT EXISTS `user_cards` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `card_id` INT NOT NULL,
    `level` INT DEFAULT 1,
    `copies` INT DEFAULT 1,
    `copies_to_upgrade` INT DEFAULT 4,
    `is_active` BOOLEAN DEFAULT FALSE,
    `slot_position` TINYINT DEFAULT NULL, -- 0,1,2 = team slot
    `xp` INT DEFAULT 0,
    `equipped_at` DATETIME,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`card_id`) REFERENCES `player_cards`(`id`),
    UNIQUE KEY `uq_user_card` (`user_id`, `card_id`),
    INDEX `idx_user_active` (`user_id`, `is_active`)
) ENGINE=InnoDB;

-- 4. Ball Skins Catalogue & User Ball Collection
CREATE TABLE IF NOT EXISTS `balls` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `rarity` ENUM('common','rare','epic','legendary') DEFAULT 'common',
    `icon_url` VARCHAR(500),
    `description` VARCHAR(200)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `user_balls` (
    `user_id` BIGINT,
    `ball_id` INT,
    `quantity` INT DEFAULT 0,
    `is_active` BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (`user_id`, `ball_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. Tours & Venues
CREATE TABLE IF NOT EXISTS `tours` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `tour_number` INT NOT NULL UNIQUE,
    `entry_fee` INT NOT NULL,
    `prize` INT NOT NULL,
    `house_rake_pct` DECIMAL(4,2) DEFAULT 10.00,
    `icon_url` VARCHAR(500),
    `color_hex` VARCHAR(7),
    `min_level` INT DEFAULT 1,
    `is_active` BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

-- 6. Matches
CREATE TABLE IF NOT EXISTS `matches` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `tour_id` INT,
    `player1_id` BIGINT NOT NULL,
    `player2_id` BIGINT NOT NULL,
    `toss_winner_id` BIGINT,
    `bat_first_id` BIGINT,
    `p1_score` INT DEFAULT 0,
    `p2_score` INT DEFAULT 0,
    `p1_balls` JSON, -- [6,2,4,1,6,4]
    `p2_balls` JSON,
    `p1_bowler_card` INT,
    `p2_bowler_card` INT,
    `p1_bat_card` INT,
    `p2_bat_card` INT,
    `winner_id` BIGINT,
    `coins_awarded` INT DEFAULT 0,
    `status` ENUM('searching','matched','in_progress', 'completed','abandoned') DEFAULT 'searching',
    `socket_room` VARCHAR(100),
    `started_at` DATETIME,
    `ended_at` DATETIME,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`),
    INDEX `idx_player1` (`player1_id`, `status`),
    INDEX `idx_player2` (`player2_id`, `status`),
    INDEX `idx_status` (`status`, `created_at`)
) ENGINE=InnoDB;

-- 7. Ball Events Analytics
CREATE TABLE IF NOT EXISTS `ball_events` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `match_id` BIGINT NOT NULL,
    `innings` TINYINT NOT NULL, -- 1 or 2
    `ball_number` TINYINT NOT NULL, -- 1 to 6
    `bowler_card_id` INT,
    `batsman_card_id` INT,
    `bowl_speed_kmh` FLOAT,
    `bowl_timing` FLOAT, -- 0.0=early, 0.5=perfect, 1.0=late
    `bowl_line` FLOAT, -- normalized -1.0 to 1.0
    `bowl_length` FLOAT,
    `bat_timing` FLOAT,
    `bat_direction` ENUM('straight','cover','leg','loft','defensive'),
    `runs_scored` TINYINT DEFAULT 0,
    `is_wicket` BOOLEAN DEFAULT FALSE,
    `timing_result` ENUM('perfect','good','early','late'),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON DELETE CASCADE,
    INDEX `idx_match_innings` (`match_id`, `innings`)
) ENGINE=InnoDB;

-- 8. Leaderboard Seasons & Stats
CREATE TABLE IF NOT EXISTS `leaderboard_seasons` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(50),
    `starts_at` DATETIME NOT NULL,
    `ends_at` DATETIME NOT NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    INDEX `idx_active` (`is_active`, `ends_at`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `user_season_stats` (
    `user_id` BIGINT,
    `season_id` INT,
    `scope` ENUM('league','country','world'),
    `total_coins` BIGINT DEFAULT 0,
    `wins` INT DEFAULT 0,
    `losses` INT DEFAULT 0,
    `matches` INT DEFAULT 0,
    `league_tier` VARCHAR(30) DEFAULT 'Rookie',
    `rank_position` INT,
    PRIMARY KEY (`user_id`, `season_id`, `scope`),
    INDEX `idx_scope_coins` (`scope`, `season_id`, `total_coins` DESC)
) ENGINE=InnoDB;

-- 9. Transactions Financial Ledger (Append-Only)
CREATE TABLE IF NOT EXISTS `transactions` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `type` ENUM('match_win','match_loss','entry_fee','iap_purchase',
                'daily_reward','piggy_bank','spin_win','ad_reward',
                'pack_purchase','card_upgrade') NOT NULL,
    `amount` INT NOT NULL, -- + credit, - debit
    `currency` ENUM('coins','gems') NOT NULL,
    `balance_after` INT NOT NULL,
    `reference_id` BIGINT,
    `note` VARCHAR(200),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB;

-- 10. Shop Packs
CREATE TABLE IF NOT EXISTS `shop_packs` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `price_inr` DECIMAL(10,2),
    `price_usd` DECIMAL(10,2),
    `coins_bonus` INT DEFAULT 0,
    `gems_bonus` INT DEFAULT 0,
    `card_slots` INT DEFAULT 0,
    `min_rarity` ENUM('common','rare','epic') DEFAULT 'common',
    `is_featured` BOOLEAN DEFAULT FALSE,
    `ad_accessible` BOOLEAN DEFAULT FALSE,
    `is_active` BOOLEAN DEFAULT TRUE,
    `expires_at` DATETIME,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 11. Piggy Bank & Daily Rewards
CREATE TABLE IF NOT EXISTS `user_piggy_bank` (
    `user_id` BIGINT PRIMARY KEY,
    `current_fill` INT DEFAULT 0,
    `max_fill` INT DEFAULT 500,
    `tier` INT DEFAULT 1,
    `gems_to_open` INT DEFAULT 350,
    `reward_gems` INT DEFAULT 385,
    `reward_coins` INT DEFAULT 4000,
    `reward_cards` INT DEFAULT 2,
    `last_opened` DATETIME,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `user_daily_rewards` (
    `user_id` BIGINT PRIMARY KEY,
    `streak_days` INT DEFAULT 0,
    `last_claimed` DATE,
    `next_available` DATETIME,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `daily_reward_schedule` (
    `day_number` INT PRIMARY KEY, -- 1 to 7
    `coins` INT DEFAULT 0,
    `gems` INT DEFAULT 0,
    `card_pack` BOOLEAN DEFAULT FALSE
) ENGINE=InnoDB;
