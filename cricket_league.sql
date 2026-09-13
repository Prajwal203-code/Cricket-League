-- ==========================================================
-- Cricket League Full Database Schema & Seed Data
-- Complete MySQL / MariaDB (XAMPP / phpMyAdmin)
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `cricket_league` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `cricket_league`;

-- --------------------------------------------------------
-- Table structure for table `users`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(60) NOT NULL UNIQUE,
  `level` INT DEFAULT 1,
  `xp` INT DEFAULT 0,
  `coins` INT DEFAULT 25870,
  `gems` INT DEFAULT 60,
  `trophies` INT DEFAULT 120,
  `matches_played` INT DEFAULT 0,
  `matches_won` INT DEFAULT 0,
  `total_sixes` INT DEFAULT 0,
  `avatar` VARCHAR(50) DEFAULT '👤',
  `country_code` VARCHAR(10) DEFAULT 'IN',
  `referral_code` VARCHAR(50) UNIQUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `users` (`id`, `username`, `level`, `xp`, `coins`, `gems`, `trophies`, `matches_played`, `matches_won`, `total_sixes`, `avatar`, `country_code`, `referral_code`) VALUES
(1, 'Prajwal', 5, 10, 25870, 60, 225, 12, 9, 18, '👤', 'IN', 'CRIC-PRAJWAL-8942'),
(2, 'Naveen', 27, 45, 140000, 150, 1215, 65, 48, 85, '👨', 'IN', 'CRIC-NAVEEN-2701'),
(3, 'Basuraj', 16, 20, 85000, 90, 720, 42, 28, 44, '👤', 'IN', 'CRIC-BASURAJ-1602'),
(4, 'Darshan', 30, 80, 250000, 300, 1350, 80, 62, 110, '👤', 'IN', 'CRIC-DARSHAN-3003'),
(5, 'Paneendra', 22, 15, 110000, 120, 990, 50, 35, 60, '🧔', 'IN', 'CRIC-PANEENDRA-2204'),
(6, 'Rahul', 14, 5, 45000, 40, 630, 30, 18, 25, '😎', 'IN', 'CRIC-RAHUL-1405'),
(7, 'Srinidhi', 5, 0, 15000, 20, 225, 10, 6, 8, '🧑', 'IN', 'CRIC-SRINIDHI-0506'),
(8, 'Subhash', 28, 60, 190000, 210, 1260, 70, 54, 95, '👱', 'IN', 'CRIC-SUBHASH-2807'),
(9, 'Suhas', 19, 30, 95000, 110, 855, 45, 30, 50, '🏍️', 'IN', 'CRIC-SUHAS-1908');

-- --------------------------------------------------------
-- Table structure for table `friends`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `friends`;
CREATE TABLE `friends` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `friend_user_id` INT NOT NULL,
  `status` ENUM('PENDING', 'ACCEPTED', 'DECLINED') DEFAULT 'PENDING',
  `gift_sent_today` TINYINT(1) DEFAULT 0,
  `last_gift_date` DATE NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `user_friend_unique` (`user_id`, `friend_user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`friend_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `friends` (`id`, `user_id`, `friend_user_id`, `status`, `gift_sent_today`) VALUES
(1, 1, 2, 'PENDING', 0),
(2, 1, 3, 'ACCEPTED', 0),
(3, 1, 4, 'ACCEPTED', 0),
(4, 1, 5, 'ACCEPTED', 0),
(5, 1, 6, 'ACCEPTED', 0),
(6, 1, 7, 'ACCEPTED', 0),
(7, 1, 8, 'ACCEPTED', 0),
(8, 1, 9, 'ACCEPTED', 0);

-- --------------------------------------------------------
-- Table structure for table `squad_cards`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `squad_cards`;
CREATE TABLE `squad_cards` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `card_name` VARCHAR(60) NOT NULL,
  `card_type` VARCHAR(30) NOT NULL,
  `role` VARCHAR(60) NOT NULL,
  `power` INT DEFAULT 20,
  `rarity` ENUM('common', 'rare', 'epic', 'legendary') DEFAULT 'common',
  `level` INT DEFAULT 1,
  `copies` INT DEFAULT 0,
  `max_copies` INT DEFAULT 10,
  `batting_order` INT DEFAULT 0,
  `country_origin` VARCHAR(10) DEFAULT 'IN',
  `origin_flag` VARCHAR(10) DEFAULT '🇮🇳',
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `squad_cards` (`id`, `user_id`, `card_name`, `card_type`, `role`, `power`, `rarity`, `level`, `copies`, `max_copies`, `batting_order`, `country_origin`, `origin_flag`, `is_active`) VALUES
(1, 1, 'Aarav', 'batsman', 'RHB Opener', 28, 'common', 3, 12, 20, 1, 'IN', '🇮🇳', 1),
(2, 1, 'Bhaskar', 'batsman', 'Aggressive Batsman', 34, 'rare', 4, 8, 16, 2, 'IN', '🇮🇳', 1),
(3, 1, 'Virudh', 'batsman', 'Anchor Batsman', 42, 'epic', 4, 4, 10, 3, 'IN', '🇮🇳', 1),
(4, 1, 'Hardeep', 'batsman', 'Power Hitter', 33, 'rare', 3, 6, 12, 4, 'IN', '🇮🇳', 1),
(5, 1, 'Rohan', 'wicket_keeper', 'WK Batsman', 29, 'common', 3, 15, 20, 5, 'IN', '🇮🇳', 1),
(6, 1, 'Vikas', 'all_rounder', 'Batting All-Rounder', 35, 'rare', 4, 9, 16, 6, 'IN', '🇮🇳', 1),
(7, 1, 'MK Singh', 'all_rounder', 'Bowling All-Rounder', 30, 'common', 3, 10, 15, 7, 'IN', '🇮🇳', 1),
(8, 1, 'Lakshya', 'bowler', 'Express Fast', 44, 'epic', 5, 5, 10, 8, 'IN', '🇮🇳', 1),
(9, 1, 'Ranveer', 'bowler', 'Right-arm Fast', 36, 'rare', 4, 11, 16, 9, 'IN', '🇮🇳', 1),
(10, 1, 'Suhas', 'bowler', 'Off Spinner', 31, 'common', 4, 18, 25, 10, 'IN', '🇮🇳', 1),
(11, 1, 'Rajesh', 'bowler', 'Leg Spinner', 27, 'common', 3, 7, 15, 11, 'IN', '🇮🇳', 1),
(12, 1, 'Classic English Willow Bat', 'batsman', 'Equipment • Bat', 0, 'common', 1, 0, 0, 0, 'IN', '🇮🇳', 1),
(13, 1, 'Standard Leather Ball', 'ball_skin', 'Equipment • Ball', 0, 'common', 1, 0, 0, 0, 'IN', '🇮🇳', 1);

-- --------------------------------------------------------
-- Table structure for table `tours`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `tours`;
CREATE TABLE `tours` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(60) NOT NULL,
  `tour_number` INT NOT NULL,
  `entry_fee` INT NOT NULL,
  `prize` INT NOT NULL,
  `color_hex` VARCHAR(20) NOT NULL,
  `min_level` INT DEFAULT 1,
  `online_players` INT DEFAULT 1500,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `tours` (`id`, `name`, `tour_number`, `entry_fee`, `prize`, `color_hex`, `min_level`, `online_players`) VALUES
(1, 'Mumbai', 1, 100, 200, '#E07020', 1, 2210),
(2, 'Karachi', 2, 250, 500, '#1A8A6A', 2, 22816),
(3, 'Adelaide', 3, 1000, 2000, '#1A72C4', 3, 1942),
(4, 'Dubai', 4, 3000, 6000, '#0E9B9B', 5, 1526),
(5, 'Johannesburg', 5, 10000, 20000, '#2E8B2E', 7, 890),
(6, 'Cape Town', 6, 50000, 100000, '#C41A1A', 10, 326),
(7, 'Melbourne', 7, 105000, 200000, '#6A1A9B', 15, 110),
(8, 'London', 8, 260000, 500000, '#C41A30', 20, 125);

-- --------------------------------------------------------
-- Table structure for table `clubs`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `clubs`;
CREATE TABLE `clubs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `club_name` VARCHAR(60) NOT NULL UNIQUE,
  `badge_icon` VARCHAR(50) DEFAULT '🛡️',
  `tag` VARCHAR(20) NOT NULL UNIQUE,
  `level` INT DEFAULT 1,
  `min_trophies` INT DEFAULT 0,
  `member_count` INT DEFAULT 1,
  `max_members` INT DEFAULT 50,
  `total_trophies` INT DEFAULT 120,
  `leader_user_id` INT NOT NULL,
  `description` VARCHAR(255) DEFAULT 'Join our active cricket strike club!',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `clubs` (`id`, `club_name`, `badge_icon`, `tag`, `level`, `min_trophies`, `member_count`, `max_members`, `total_trophies`, `leader_user_id`, `description`) VALUES
(1, 'Royal Challengers', '🛡️', '#RC01', 5, 500, 28, 50, 14850, 4, 'Elite championship cricket club! Active players only.'),
(2, 'Mumbai Titans', '⚡', '#MT99', 4, 300, 35, 50, 12400, 2, 'Daily active club with gift donations & tournaments.'),
(3, 'Super Kings', '👑', '#SK77', 6, 1000, 48, 50, 28900, 8, 'Top tier tournament winners league. Friendly active squad.'),
(4, 'Delhi Strikers', '🎯', '#DS10', 3, 100, 15, 50, 4500, 1, 'Beginner friendly club open for all active strikers!');

-- --------------------------------------------------------
-- Table structure for table `club_members`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `club_members`;
CREATE TABLE `club_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `club_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `role` ENUM('LEADER', 'CO_LEADER', 'ELDER', 'MEMBER') DEFAULT 'MEMBER',
  `contribution_trophies` INT DEFAULT 0,
  `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `club_user_unique` (`club_id`, `user_id`),
  FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `club_members` (`id`, `club_id`, `user_id`, `role`, `contribution_trophies`) VALUES
(1, 4, 1, 'LEADER', 225);

-- --------------------------------------------------------
-- Table structure for table `leagues`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `leagues`;
CREATE TABLE `leagues` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tier_name` VARCHAR(50) NOT NULL,
  `badge_icon` VARCHAR(50) NOT NULL,
  `min_trophies` INT NOT NULL,
  `max_trophies` INT NOT NULL,
  `weekly_coins` INT NOT NULL,
  `weekly_gems` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `leagues` (`id`, `tier_name`, `badge_icon`, `min_trophies`, `max_trophies`, `weekly_coins`, `weekly_gems`) VALUES
(1, 'Trainee League', '🥉', 0, 300, 1000, 10),
(2, 'Hotshot League', '🥈', 301, 700, 5000, 25),
(3, 'Expert League', '🥇', 701, 1200, 15000, 50),
(4, 'Virtuoso League', '💎', 1201, 2000, 50000, 150),
(5, 'Champion League', '👑', 2001, 99999, 150000, 500);

-- --------------------------------------------------------
-- Table structure for table `free_rewards_status`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `free_rewards_status`;
CREATE TABLE `free_rewards_status` (
  `user_id` INT PRIMARY KEY,
  `last_free_100_claim` BIGINT DEFAULT 0,
  `current_ad_step` INT DEFAULT 1,
  `last_ad_step_claim` BIGINT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `free_rewards_status` (`user_id`, `last_free_100_claim`, `current_ad_step`, `last_ad_step_claim`) VALUES
(1, 0, 1, 0);

-- --------------------------------------------------------
-- Table structure for table `shop_items`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `shop_items`;
CREATE TABLE `shop_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category` VARCHAR(50) NOT NULL,
  `item_name` VARCHAR(100) NOT NULL,
  `price` INT NOT NULL,
  `currency` ENUM('coins', 'gems', 'inr') DEFAULT 'gems',
  `reward_type` VARCHAR(50) NOT NULL,
  `reward_value` INT NOT NULL,
  `badge_text` VARCHAR(50) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `shop_items` (`id`, `category`, `item_name`, `price`, `currency`, `reward_type`, `reward_value`, `badge_text`) VALUES
(1, 'featured', 'Epic Bowler Bundle', 199, 'inr', 'coins_gems', 20000, 'BEST VALUE +20,000 🪙 & 200 💎'),
(2, 'piggy_bank', 'Piggy Bank Unlock', 350, 'gems', 'coins_gems', 4000, 'SAVE & BREAK! 385 💎 + 4,000 🪙'),
(3, 'gems', 'Handful of Gems', 89, 'inr', 'gems', 80, 'POPULAR'),
(4, 'gems', 'Sack of Gems', 399, 'inr', 'gems', 500, '+20% BONUS'),
(5, 'coins', 'Pouch of Coins', 10, 'gems', 'coins', 1000, 'INSTANT'),
(6, 'coins', 'Chest of Coins', 80, 'gems', 'coins', 10000, 'BEST SELLER'),
(7, 'chests', 'Basic Pack', 500, 'coins', 'cards', 3, 'COMMON+'),
(8, 'chests', 'Elite Pack', 150, 'gems', 'cards', 8, 'RARE+'),
(9, 'chests', 'Master Pack', 450, 'gems', 'cards', 18, 'GUARANTEED EPIC');

-- --------------------------------------------------------
-- Table structure for table `referrals`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `referrals`;
CREATE TABLE `referrals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `referral_code` VARCHAR(50) NOT NULL,
  `inviter_user_id` INT NOT NULL,
  `claimed_by_user_id` INT NULL,
  `claimed_by_username` VARCHAR(60) NULL,
  `coins_reward` INT DEFAULT 1500,
  `xp_reward` INT DEFAULT 50,
  `status` ENUM('PENDING', 'CLAIMED') DEFAULT 'CLAIMED',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`inviter_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- Table structure for table `match_history`
-- --------------------------------------------------------
DROP TABLE IF EXISTS `match_history`;
CREATE TABLE `match_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `p1_user_id` INT NOT NULL,
  `p2_user_id` INT NOT NULL,
  `tour_id` INT NOT NULL,
  `p1_score` INT DEFAULT 0,
  `p2_score` INT DEFAULT 0,
  `winner_user_id` INT NULL,
  `coins_awarded` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
