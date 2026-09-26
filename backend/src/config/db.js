const mysql = require('mysql2/promise');
const config = require('./env');
const { runMigrations } = require('./migrate');
const { ECONOMY } = require('./gameRules');
const { getStartingSquadForCountry, getAllCountryOptions, COUNTRY_ROSTERS, NON_MAJOR_COUNTRIES } = require('../data/countryRosters');

const DB_CONFIG = {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: config.db.connectionLimit,
    queueLimit: 0,
    charset: 'utf8mb4'
};

let pool = null;

/**
 * Prepares the database or throws.
 *
 * The previous version caught its own errors and logged them, so the server
 * would boot and start serving requests against a database that was never
 * initialised. Every failure now propagates to bootstrap(), which exits.
 */
async function initDatabase() {
    // 1. Connect without a database selected so we can create it if missing.
    const rootConn = await mysql.createConnection({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password
    });

    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await rootConn.end();
    console.log(`✅ MySQL Database '${DB_CONFIG.database}' verified.`);

    // 2. Create the pool bound to the database.
    pool = mysql.createPool(DB_CONFIG);

    // 3. Base tables (idempotent CREATE TABLE IF NOT EXISTS).
    await createTables();

    // 4. Versioned schema changes (columns, indexes, foreign keys).
    await runMigrations(pool);

    // 5. Reference/seed data.
    await seedInitialData();

    console.log('✅ Database ready.');
}

/** Confirms the pool can reach the database. Used by /api/health. */
async function pingDatabase() {
    await getPool().query('SELECT 1');
    return true;
}

async function createTables() {
    // 1. Users Table
    // Starting balances are seeded from gameRules ECONOMY. The literal DEFAULTs
    // here only matter for a row inserted without those columns, which no code
    // path does; the authoritative starting values live in createUser().
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(60) NOT NULL UNIQUE,
            auth_provider ENUM('guest', 'google', 'facebook') DEFAULT 'guest',
            social_id VARCHAR(100) NULL,
            email VARCHAR(100) NULL,
            is_guest TINYINT(1) DEFAULT 1,
            level INT DEFAULT 1,
            xp INT DEFAULT 0,
            coins INT DEFAULT ${ECONOMY.startingCoins},
            gems INT DEFAULT ${ECONOMY.startingGems},
            trophies INT DEFAULT ${ECONOMY.startingTrophies},
            matches_played INT DEFAULT 0,
            matches_won INT DEFAULT 0,
            total_sixes INT DEFAULT 0,
            avatar VARCHAR(50) DEFAULT '👤',
            country_code VARCHAR(10) DEFAULT 'IN',
            character_config LONGTEXT NULL,
            referral_code VARCHAR(50) UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Friends Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS friends (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            friend_user_id INT NOT NULL,
            status ENUM('PENDING', 'ACCEPTED', 'DECLINED') DEFAULT 'PENDING',
            gift_sent_today TINYINT(1) DEFAULT 0,
            last_gift_date DATE NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY user_friend_unique (user_id, friend_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Squad Cards Table (Bowlers, Batsmen, All-rounders, WK, Ball Skins)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS squad_cards (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            card_name VARCHAR(60) NOT NULL,
            card_type VARCHAR(30) NOT NULL,
            role VARCHAR(60) NOT NULL,
            power INT DEFAULT 20,
            rarity ENUM('common', 'rare', 'epic', 'legendary') DEFAULT 'common',
            level INT DEFAULT 1,
            copies INT DEFAULT 0,
            max_copies INT DEFAULT 10,
            batting_order INT DEFAULT 0,
            country_origin VARCHAR(10) DEFAULT 'IN',
            origin_flag VARCHAR(10) DEFAULT '🇮🇳',
            is_active TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. Tours Table (Venues)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS tours (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(60) NOT NULL,
            tour_number INT NOT NULL,
            entry_fee INT NOT NULL,
            prize INT NOT NULL,
            color_hex VARCHAR(20) NOT NULL,
            min_level INT DEFAULT 1,
            online_players INT DEFAULT 1500,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. Referrals Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS referrals (
            id INT AUTO_INCREMENT PRIMARY KEY,
            referral_code VARCHAR(50) NOT NULL,
            inviter_user_id INT NOT NULL,
            claimed_by_user_id INT NULL,
            claimed_by_username VARCHAR(60) NULL,
            coins_reward INT DEFAULT 1500,
            xp_reward INT DEFAULT 50,
            status ENUM('PENDING', 'CLAIMED') DEFAULT 'CLAIMED',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 6. Shop Items Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS shop_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            category VARCHAR(50) NOT NULL,
            item_name VARCHAR(100) NOT NULL,
            price INT NOT NULL,
            currency ENUM('coins', 'gems', 'inr') DEFAULT 'gems',
            reward_type VARCHAR(50) NOT NULL,
            reward_value INT NOT NULL,
            badge_text VARCHAR(50) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 7. Clubs Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS clubs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            club_name VARCHAR(60) NOT NULL UNIQUE,
            badge_icon VARCHAR(50) DEFAULT '🛡️',
            tag VARCHAR(20) NOT NULL UNIQUE,
            level INT DEFAULT 1,
            min_trophies INT DEFAULT 0,
            club_type ENUM('OPEN', 'INVITE_ONLY', 'CLOSED') DEFAULT 'OPEN',
            member_count INT DEFAULT 1,
            max_members INT DEFAULT 50,
            total_trophies INT DEFAULT 120,
            weekly_chest_score INT DEFAULT 1250,
            weekly_chest_goal INT DEFAULT 2500,
            weekly_chest_tier INT DEFAULT 3,
            leader_user_id INT NOT NULL,
            description VARCHAR(255) DEFAULT 'Join our active cricket strike club!',
            country VARCHAR(10) DEFAULT 'IN',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8. Club Members Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS club_members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            club_id INT NOT NULL,
            user_id INT NOT NULL,
            role ENUM('LEADER', 'CO_LEADER', 'ELDER', 'MEMBER') DEFAULT 'MEMBER',
            contribution_trophies INT DEFAULT 0,
            donations_weekly INT DEFAULT 0,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY club_user_unique (club_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8B. Club Messages & Activity Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS club_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            club_id INT NOT NULL,
            user_id INT NOT NULL,
            username VARCHAR(60) NOT NULL,
            avatar VARCHAR(50) DEFAULT '👤',
            message_type ENUM('CHAT', 'SYSTEM', 'CARD_REQUEST', 'FRIENDLY_CHALLENGE') DEFAULT 'CHAT',
            content TEXT NOT NULL,
            card_name VARCHAR(60) NULL,
            card_role VARCHAR(60) NULL,
            donations_received INT DEFAULT 0,
            donations_max INT DEFAULT 5,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8C. Club Card Donations Log Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS club_card_donations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            donor_user_id INT NOT NULL,
            recipient_user_id INT NOT NULL,
            card_name VARCHAR(60) NOT NULL,
            coins_reward INT DEFAULT 50,
            xp_reward INT DEFAULT 10,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_donation_message_donor (message_id, donor_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8D. Club Join Requests Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS club_join_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            club_id INT NOT NULL,
            user_id INT NOT NULL,
            username VARCHAR(60) NOT NULL,
            avatar VARCHAR(50) DEFAULT '👤',
            trophies INT DEFAULT 0,
            level INT DEFAULT 1,
            status ENUM('PENDING', 'ACCEPTED', 'DECLINED') DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY club_user_request_unique (club_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Column, index and foreign-key changes for tables that may already exist
    // are handled by the ordered migration runner (config/migrate.js), not by
    // best-effort ALTERs here.

    // 9. Leagues Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS leagues (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tier_name VARCHAR(50) NOT NULL,
            badge_icon VARCHAR(50) NOT NULL,
            min_trophies INT NOT NULL,
            max_trophies INT NOT NULL,
            weekly_coins INT NOT NULL,
            weekly_gems INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 10. Free Rewards Status Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS free_rewards_status (
            user_id INT PRIMARY KEY,
            last_free_100_claim BIGINT DEFAULT 0,
            current_ad_step INT DEFAULT 1,
            last_ad_step_claim BIGINT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 11. Matches History Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS match_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            match_uuid CHAR(36) NULL,
            p1_user_id INT NOT NULL,
            p2_user_id INT NOT NULL,
            tour_id INT NOT NULL,
            p1_score INT DEFAULT 0,
            p2_score INT DEFAULT 0,
            p1_wickets INT DEFAULT 0,
            p2_wickets INT DEFAULT 0,
            p1_sixes INT DEFAULT 0,
            p2_sixes INT DEFAULT 0,
            winner_user_id INT NULL,
            coins_awarded INT DEFAULT 0,
            end_reason VARCHAR(20) DEFAULT 'runs',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    // 12. User Ball Skins & Quantities Table (Stores purchased & equipped ball skins)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_ball_skins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            skin_id VARCHAR(50) NOT NULL,
            price_paid INT DEFAULT 0,
            quantity INT DEFAULT 0,
            is_equipped TINYINT(1) DEFAULT 0,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY user_skin_unique (user_id, skin_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 13. Seasons Table (3-Month League Seasons)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS seasons (
            id INT AUTO_INCREMENT PRIMARY KEY,
            season_number INT NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            start_date DATETIME NOT NULL,
            end_date DATETIME NOT NULL,
            is_active TINYINT(1) DEFAULT 1,
            rewards_distributed TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 14. Season Rewards History Table (Automated diamond assignment records)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS season_rewards_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            season_number INT NOT NULL,
            user_id INT NOT NULL,
            rank_position INT NOT NULL,
            reward_gems INT NOT NULL,
            category VARCHAR(30) DEFAULT 'global',
            claimed TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY season_user_unique (season_number, user_id, category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 15. User Level Progression & Roadmap Claimed Rewards Table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_level_rewards (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            level INT NOT NULL,
            coins_awarded INT DEFAULT 0,
            gems_awarded INT DEFAULT 0,
            pack_awarded VARCHAR(100) NULL,
            claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY user_level_unique (user_id, level)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 16. Strike Battle Pass Progress (Free Fire Elite Pass)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS strike_pass_progress (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            season_id INT DEFAULT 1,
            tokens INT DEFAULT 0,
            is_premium TINYINT(1) DEFAULT 0,
            claimed_free_tiers TEXT,
            claimed_premium_tiers TEXT,
            season_started_at TIMESTAMP NULL DEFAULT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY user_pass_season_unique (user_id, season_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 17. 7-Day Daily Login Streak Retention
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_daily_streaks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            current_day INT DEFAULT 1,
            last_login_date DATE NULL,
            claimed_days TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 18. Weekend Club Wars (Free Fire Dog Tags)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS club_wars (
            id INT AUTO_INCREMENT PRIMARY KEY,
            war_number INT NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            start_date DATETIME NOT NULL,
            end_date DATETIME NOT NULL,
            is_active TINYINT(1) DEFAULT 1,
            rewards_distributed TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 19. Club War Scores (Dog Tags per Club)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS club_war_scores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            war_id INT NOT NULL,
            club_id INT NOT NULL,
            dog_tags INT DEFAULT 0,
            rank_position INT DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY war_club_unique (war_id, club_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 20. Custom 1v1 Match Rooms
    await pool.query(`
        CREATE TABLE IF NOT EXISTS custom_match_rooms (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_code VARCHAR(10) NOT NULL UNIQUE,
            host_user_id INT NOT NULL,
            host_username VARCHAR(50),
            guest_user_id INT NULL,
            guest_username VARCHAR(50) NULL,
            stadium VARCHAR(50) DEFAULT 'Adelaide Oval',
            status ENUM('WAITING', 'PLAYING', 'COMPLETED') DEFAULT 'WAITING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 21. Lucky Spin cooldowns. Previously created lazily from inside the spin
    // route on every request; schema belongs here.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_lucky_spins (
            user_id INT NOT NULL PRIMARY KEY,
            last_spin_time BIGINT DEFAULT 0,
            total_spins INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 22. Weekly club chest claims, one per player per ISO week.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS club_chest_claims (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            club_id INT NOT NULL,
            week_key CHAR(8) NOT NULL,
            tier INT NOT NULL,
            coins_awarded INT NOT NULL,
            gems_awarded INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_chest_user_week (user_id, week_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
}

/**
 * Assigns or resets the fixed 11 starting players for a user based on their selected country
 */
async function syncUserSquadForCountry(userId, countryCode = 'IN') {
    const squadData = getStartingSquadForCountry(countryCode);
    const p = getPool();

    // Clear old squad cards for this user
    await p.query('DELETE FROM squad_cards WHERE user_id = ?', [userId]);

    // Insert 11 Starting Players (Batting Order 1 to 11)
    const cardRows = squadData.players.map(pl => [
        userId,
        pl.name,
        pl.type,
        pl.role,
        pl.power,
        pl.rarity,
        pl.level,
        pl.copies,
        pl.maxCopies,
        pl.order,
        pl.countryOrigin || squadData.countryInfo.code,
        pl.originFlag || squadData.countryInfo.flag,
        1
    ]);

    // Equipment items
    cardRows.push([
        userId,
        'Classic English Willow Bat',
        'batsman',
        'Equipment • Bat',
        0,
        'common',
        1,
        0,
        0,
        0,
        squadData.countryInfo.code,
        squadData.countryInfo.flag,
        1
    ]);

    cardRows.push([
        userId,
        'Standard Leather Ball',
        'ball_skin',
        'Equipment • Ball',
        0,
        'common',
        1,
        0,
        0,
        0,
        squadData.countryInfo.code,
        squadData.countryInfo.flag,
        1
    ]);

    await p.query(`
        INSERT INTO squad_cards (user_id, card_name, card_type, role, power, rarity, level, copies, max_copies, batting_order, country_origin, origin_flag, is_active)
        VALUES ?
    `, [cardRows]);

    return squadData;
}

async function seedInitialData() {
    // No user rows are seeded. Accounts are created by POST /api/auth/guest or
    // social sign-in. The old seed inserted a "Player_1" row with invented
    // stats that every unauthenticated request fell through to, which made it a
    // shared identity anyone could act as.

    // 1. Tours (venues) — entry fees and prizes the server charges and pays.
    const [existingTours] = await pool.query('SELECT COUNT(*) as cnt FROM tours');
    if (existingTours[0].cnt === 0) {
        const tours = [
            [1, 'Mumbai', 1, 100, 200, '#E07020', 1, 2210],
            [2, 'Karachi', 2, 250, 500, '#1A8A6A', 2, 22816],
            [3, 'Adelaide', 3, 1000, 2000, '#1A72C4', 3, 1942],
            [4, 'Dubai', 4, 3000, 6000, '#0E9B9B', 5, 1526],
            [5, 'Johannesburg', 5, 10000, 20000, '#2E8B2E', 7, 890],
            [6, 'Cape Town', 6, 50000, 100000, '#C41A1A', 10, 326],
            [7, 'Melbourne', 7, 105000, 200000, '#6A1A9B', 15, 110],
            [8, 'London', 8, 260000, 500000, '#C41A30', 20, 125]
        ];

        await pool.query(`
            INSERT INTO tours (id, name, tour_number, entry_fee, prize, color_hex, min_level, online_players)
            VALUES ?
        `, [tours]);
        console.log('🌱 Seeded tours.');
    }

    // 2. Leagues (trophy tiers).
    const [existingLeagues] = await pool.query('SELECT COUNT(*) as cnt FROM leagues');
    if (existingLeagues[0].cnt === 0) {
        const leagues = [
            [1, 'Trainee League', '🥉', 0, 300, 1000, 10],
            [2, 'Hotshot League', '🥈', 301, 700, 5000, 25],
            [3, 'Expert League', '🥇', 701, 1200, 15000, 50],
            [4, 'Virtuoso League', '💎', 1201, 2000, 50000, 150],
            [5, 'Champion League', '👑', 2001, 99999, 150000, 500]
        ];

        await pool.query(`
            INSERT INTO leagues (id, tier_name, badge_icon, min_trophies, max_trophies, weekly_coins, weekly_gems)
            VALUES ?
        `, [leagues]);
        console.log('🌱 Seeded leagues.');
    }

    // 3. Shop catalogue.
    const [existingShop] = await pool.query('SELECT COUNT(*) as cnt FROM shop_items');
    if (existingShop[0].cnt === 0) {
        const shop = [
            [1, 'featured', 'Epic Bowler Bundle', 199, 'inr', 'coins_gems', 20000, 'BEST VALUE +20,000 🪙 & 200 💎'],
            [2, 'piggy_bank', 'Piggy Bank Unlock', 350, 'gems', 'coins_gems', 4000, 'SAVE & BREAK! 385 💎 + 4,000 🪙'],
            [3, 'gems', 'Handful of Gems', 89, 'inr', 'gems', 80, 'POPULAR'],
            [4, 'gems', 'Sack of Gems', 399, 'inr', 'gems', 500, '+20% BONUS'],
            [5, 'coins', 'Pouch of Coins', 10, 'gems', 'coins', 1000, 'INSTANT'],
            [6, 'coins', 'Chest of Coins', 80, 'gems', 'coins', 10000, 'BEST SELLER'],
            [7, 'chests', 'Basic Pack', 500, 'coins', 'cards', 3, 'COMMON+'],
            [8, 'chests', 'Elite Pack', 150, 'gems', 'cards', 8, 'RARE+'],
            [9, 'chests', 'Master Pack', 450, 'gems', 'cards', 18, 'GUARANTEED EPIC']
        ];

        await pool.query(`
            INSERT INTO shop_items (id, category, item_name, price, currency, reward_type, reward_value, badge_text)
            VALUES ?
        `, [shop]);
        console.log('🌱 Seeded shop items.');
    }
}

function getPool() {
    if (!pool) {
        pool = mysql.createPool(DB_CONFIG);
    }
    return pool;
}

module.exports = {
    initDatabase,
    pingDatabase,
    getPool,
    syncUserSquadForCountry,
    getStartingSquadForCountry,
    getAllCountryOptions,
    COUNTRY_ROSTERS,
    NON_MAJOR_COUNTRIES
};
