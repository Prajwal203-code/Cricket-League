/**
 * Ordered schema migrations.
 *
 * Replaces the block of `try { ALTER TABLE ... } catch (e) {}` statements that
 * used to run on every boot. Those silently swallowed *every* error — a genuine
 * failure looked identical to "column already exists" — and gave no way to know
 * which version of the schema a database was actually on.
 *
 * Each migration runs once and is recorded in `schema_migrations`. Migrations
 * are append-only: never edit one that has shipped, add a new one.
 */

/** Rows the application needs in place before it can serve traffic. */
const MIGRATIONS = [
    {
        id: 1,
        name: 'club and user columns from the pre-migration era',
        async up(conn) {
            await addColumn(conn, 'club_members', 'donations_weekly', 'INT DEFAULT 0');
            await addColumn(conn, 'clubs', 'club_type',
                "ENUM('OPEN', 'INVITE_ONLY', 'CLOSED') DEFAULT 'OPEN'");
            await addColumn(conn, 'clubs', 'weekly_chest_score', 'INT DEFAULT 1250');
            await addColumn(conn, 'clubs', 'weekly_chest_goal', 'INT DEFAULT 2500');
            await addColumn(conn, 'clubs', 'weekly_chest_tier', 'INT DEFAULT 3');
            await addColumn(conn, 'clubs', 'country', "VARCHAR(10) DEFAULT 'IN'");

            await addColumn(conn, 'users', 'auth_provider',
                "ENUM('guest', 'google', 'facebook') DEFAULT 'guest'");
            await addColumn(conn, 'users', 'social_id', 'VARCHAR(100) NULL');
            await addColumn(conn, 'users', 'email', 'VARCHAR(100) NULL');
            await addColumn(conn, 'users', 'is_guest', 'TINYINT(1) DEFAULT 1');
            await addColumn(conn, 'users', 'country_code', "VARCHAR(10) DEFAULT 'IN'");
            await addColumn(conn, 'users', 'character_config', 'LONGTEXT NULL');

            await addColumn(conn, 'squad_cards', 'batting_order', 'INT DEFAULT 0');
            await addColumn(conn, 'squad_cards', 'country_origin', "VARCHAR(10) DEFAULT 'IN'");
            await addColumn(conn, 'squad_cards', 'origin_flag', "VARCHAR(10) DEFAULT '🇮🇳'");
            await conn.query('ALTER TABLE squad_cards MODIFY COLUMN card_type VARCHAR(30) NOT NULL');

            await addColumn(conn, 'user_ball_skins', 'quantity', 'INT DEFAULT 0');
        }
    },
    {
        id: 2,
        name: 'match_history columns required by match settlement',
        async up(conn) {
            // matchService.settleMatch writes both of these. Without them every
            // completed match would fail to persist and no prize would be paid.
            await addColumn(conn, 'match_history', 'match_uuid', 'CHAR(36) NULL');
            await addColumn(conn, 'match_history', 'end_reason', "VARCHAR(20) DEFAULT 'runs'");
            await addColumn(conn, 'match_history', 'p1_wickets', 'INT DEFAULT 0');
            await addColumn(conn, 'match_history', 'p2_wickets', 'INT DEFAULT 0');
            await addIndex(conn, 'match_history', 'idx_match_uuid', '(match_uuid)', { unique: true });
        }
    },
    {
        id: 3,
        name: 'indexes on foreign-key columns',
        async up(conn) {
            // The schema shipped with zero indexes beyond primary and unique
            // keys, so every "my squad", "my friends", "club feed" query was a
            // full table scan.
            const indexes = [
                ['friends', 'idx_friends_user', '(user_id)'],
                ['friends', 'idx_friends_friend', '(friend_user_id)'],
                ['squad_cards', 'idx_squad_user', '(user_id)'],
                ['squad_cards', 'idx_squad_user_order', '(user_id, batting_order)'],
                ['referrals', 'idx_referrals_inviter', '(inviter_user_id)'],
                ['referrals', 'idx_referrals_claimed_by', '(claimed_by_user_id)'],
                ['club_members', 'idx_club_members_user', '(user_id)'],
                ['club_messages', 'idx_club_messages_club', '(club_id, created_at)'],
                ['club_messages', 'idx_club_messages_user', '(user_id)'],
                ['club_card_donations', 'idx_donations_message', '(message_id)'],
                ['club_card_donations', 'idx_donations_donor', '(donor_user_id)'],
                ['club_card_donations', 'idx_donations_recipient', '(recipient_user_id)'],
                ['club_join_requests', 'idx_join_requests_user', '(user_id)'],
                ['clubs', 'idx_clubs_leader', '(leader_user_id)'],
                ['clubs', 'idx_clubs_trophies', '(total_trophies)'],
                ['match_history', 'idx_match_p1', '(p1_user_id)'],
                ['match_history', 'idx_match_p2', '(p2_user_id)'],
                ['match_history', 'idx_match_tour', '(tour_id)'],
                ['season_rewards_history', 'idx_season_rewards_user', '(user_id)'],
                ['club_war_scores', 'idx_war_scores_club', '(club_id)'],
                ['custom_match_rooms', 'idx_rooms_host', '(host_user_id)'],
                ['custom_match_rooms', 'idx_rooms_guest', '(guest_user_id)'],
                // Leaderboards sort on these every request.
                ['users', 'idx_users_trophies', '(trophies)'],
                ['users', 'idx_users_level', '(level)']
            ];
            for (const [table, name, cols] of indexes) {
                await addIndex(conn, table, name, cols);
            }

            // Social sign-in looks users up by exactly this pair.
            await addIndex(conn, 'users', 'idx_users_provider_social', '(auth_provider, social_id)');
        }
    },
    {
        id: 4,
        name: 'foreign keys onto users and clubs',
        async up(conn) {
            // Orphan rows — left behind by deletes that had no cascade — would
            // block the constraints below. They reference accounts that no
            // longer exist, so nothing can read them anyway.
            await purgeOrphans(conn, 'squad_cards', 'user_id', 'users');
            await purgeOrphans(conn, 'friends', 'user_id', 'users');
            await purgeOrphans(conn, 'friends', 'friend_user_id', 'users');
            await purgeOrphans(conn, 'club_members', 'user_id', 'users');
            await purgeOrphans(conn, 'club_members', 'club_id', 'clubs');
            await purgeOrphans(conn, 'club_messages', 'user_id', 'users');
            await purgeOrphans(conn, 'club_messages', 'club_id', 'clubs');
            await purgeOrphans(conn, 'club_join_requests', 'user_id', 'users');
            await purgeOrphans(conn, 'club_join_requests', 'club_id', 'clubs');
            await purgeOrphans(conn, 'free_rewards_status', 'user_id', 'users');
            await purgeOrphans(conn, 'user_ball_skins', 'user_id', 'users');
            await purgeOrphans(conn, 'user_level_rewards', 'user_id', 'users');
            await purgeOrphans(conn, 'strike_pass_progress', 'user_id', 'users');
            await purgeOrphans(conn, 'user_daily_streaks', 'user_id', 'users');
            await purgeOrphans(conn, 'season_rewards_history', 'user_id', 'users');

            const cascades = [
                ['squad_cards', 'fk_squad_user', 'user_id', 'users'],
                ['friends', 'fk_friends_user', 'user_id', 'users'],
                ['friends', 'fk_friends_friend', 'friend_user_id', 'users'],
                ['club_members', 'fk_club_members_user', 'user_id', 'users'],
                ['club_members', 'fk_club_members_club', 'club_id', 'clubs'],
                ['club_messages', 'fk_club_messages_user', 'user_id', 'users'],
                ['club_messages', 'fk_club_messages_club', 'club_id', 'clubs'],
                ['club_join_requests', 'fk_join_requests_user', 'user_id', 'users'],
                ['club_join_requests', 'fk_join_requests_club', 'club_id', 'clubs'],
                ['free_rewards_status', 'fk_free_rewards_user', 'user_id', 'users'],
                ['user_ball_skins', 'fk_ball_skins_user', 'user_id', 'users'],
                ['user_level_rewards', 'fk_level_rewards_user', 'user_id', 'users'],
                ['strike_pass_progress', 'fk_strike_pass_user', 'user_id', 'users'],
                ['user_daily_streaks', 'fk_daily_streaks_user', 'user_id', 'users'],
                ['season_rewards_history', 'fk_season_rewards_user', 'user_id', 'users']
            ];
            for (const [table, name, column, target] of cascades) {
                await addForeignKey(conn, table, name, column, target, 'CASCADE');
            }

            // match_history is a ledger: deleting an account must not erase the
            // record of matches their opponent played.
            await addForeignKey(conn, 'match_history', 'fk_match_p1', 'p1_user_id', 'users', 'RESTRICT');
            await addForeignKey(conn, 'match_history', 'fk_match_p2', 'p2_user_id', 'users', 'RESTRICT');
        }
    },
    {
        id: 5,
        name: 'drop the seeded placeholder account',
        async up(conn) {
            // The seed used to insert "Player_1" with an invented match record
            // (level 5, 12 played, 9 won) and every unauthenticated request fell
            // through to it. Accounts now come from /api/auth/guest, so a
            // placeholder that nobody owns is just a shared, forgeable identity.
            const [rows] = await conn.query(
                "SELECT id FROM users WHERE username = 'Player_1' AND social_id IS NULL AND matches_played = 12"
            );
            if (rows.length > 0) {
                const ids = rows.map(r => r.id);
                await conn.query('DELETE FROM users WHERE id IN (?)', [ids]);
                console.log(`   · removed ${ids.length} placeholder account(s)`);
            }
        }
    },
    {
        id: 6,
        name: 'per-match stats for battle pass missions',
        async up(conn) {
            // Pass missions ("hit 3 sixes today", "win 5 matches this week")
            // were previously hardcoded rows with invented progress. They are
            // now aggregated from match_history, which needs per-match counts
            // rather than only the lifetime totals held on `users`.
            await addColumn(conn, 'match_history', 'p1_sixes', 'INT DEFAULT 0');
            await addColumn(conn, 'match_history', 'p2_sixes', 'INT DEFAULT 0');
            await addIndex(conn, 'match_history', 'idx_match_p1_created', '(p1_user_id, created_at)');
            await addIndex(conn, 'match_history', 'idx_match_p2_created', '(p2_user_id, created_at)');

            // Tokens are earned per match from here on, so the seeded "380"
            // that every account started on is no longer meaningful.
            await addColumn(conn, 'strike_pass_progress', 'season_started_at',
                'TIMESTAMP NULL DEFAULT NULL');
        }
    },
    {
        id: 7,
        name: 'club donation limits and weekly chest claims',
        async up(conn) {
            // One donation per player per card request. Without this key a
            // single donor could fill all five copies of their own club's
            // request over and over, farming 50 coins and 10 XP each time —
            // the route only checked the *total* count, never who donated.
            await conn.query(`
                DELETE d FROM club_card_donations d
                  JOIN club_card_donations keep
                    ON keep.message_id = d.message_id
                   AND keep.donor_user_id = d.donor_user_id
                   AND keep.id < d.id
            `);
            await addIndex(conn, 'club_card_donations', 'uniq_donation_message_donor',
                '(message_id, donor_user_id)', { unique: true });

            // Weekly club chest claims. The chest previously had no record of
            // having been claimed at all, because the endpoint the client
            // called did not exist on the server.
            await conn.query(`
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
            await purgeOrphans(conn, 'club_chest_claims', 'user_id', 'users');
            await addForeignKey(conn, 'club_chest_claims', 'fk_chest_claims_user',
                'user_id', 'users', 'CASCADE');

            // The chest score counts wins by club members in the current week.
            await addIndex(conn, 'match_history', 'idx_match_winner_created',
                '(winner_user_id, created_at)');

            // `/friendly-challenge` has always inserted message_type
            // 'FRIENDLY_CHALLENGE', which was never a member of the column's
            // ENUM — so in strict mode the insert errored and in loose mode it
            // stored an empty string, and the challenge never rendered.
            await conn.query(`
                ALTER TABLE club_messages
                MODIFY COLUMN message_type
                ENUM('CHAT', 'SYSTEM', 'CARD_REQUEST', 'FRIENDLY_CHALLENGE') DEFAULT 'CHAT'
            `);
        }
    }
    ,{
        id: 8,
        name: 'auditable progression and recoverable match payments',
        async up(conn) {
            await conn.query('ALTER TABLE users MODIFY coins BIGINT NOT NULL DEFAULT 25870, MODIFY gems BIGINT NOT NULL DEFAULT 60');
            await addColumn(conn, 'user_level_rewards', 'rules_version', 'VARCHAR(40) NULL');
            await conn.query(`CREATE TABLE IF NOT EXISTS wallet_ledger (
                id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL,
                reason VARCHAR(80) NOT NULL, coins_delta BIGINT NOT NULL, gems_delta BIGINT NOT NULL,
                xp_awarded INT NOT NULL, level_before INT NOT NULL, level_after INT NOT NULL,
                coins_after BIGINT NOT NULL, gems_after BIGINT NOT NULL, rules_version VARCHAR(40) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_wallet_user_created (user_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
            await conn.query(`CREATE TABLE IF NOT EXISTS match_entries (
                id CHAR(36) PRIMARY KEY, user_id INT NOT NULL, tour_id INT NOT NULL,
                entry_fee INT NOT NULL, prize INT NOT NULL,
                status ENUM('queued','playing','refunded','settled') NOT NULL DEFAULT 'queued',
                match_uuid CHAR(36) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_entries_user_status (user_id, status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
            await conn.query(`CREATE TABLE IF NOT EXISTS match_settlements (
                match_uuid CHAR(36) PRIMARY KEY, match_data LONGTEXT NOT NULL,
                payouts LONGTEXT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                settled_at TIMESTAMP NULL DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        }
    }
];

// ---------------------------------------------------------------------------
// Schema introspection helpers
//
// `ADD COLUMN IF NOT EXISTS` is MariaDB-only, so these check information_schema
// instead and work on both MariaDB and MySQL.
// ---------------------------------------------------------------------------

async function columnExists(conn, table, column) {
    const [rows] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return rows.length > 0;
}

async function addColumn(conn, table, column, definition) {
    if (await columnExists(conn, table, column)) return false;
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    return true;
}

async function indexExists(conn, table, indexName) {
    const [rows] = await conn.query(
        `SELECT 1 FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, indexName]
    );
    return rows.length > 0;
}

async function addIndex(conn, table, indexName, columns, { unique = false } = {}) {
    if (await indexExists(conn, table, indexName)) return false;
    const kind = unique ? 'UNIQUE INDEX' : 'INDEX';
    await conn.query(`ALTER TABLE \`${table}\` ADD ${kind} \`${indexName}\` ${columns}`);
    return true;
}

async function constraintExists(conn, table, name) {
    const [rows] = await conn.query(
        `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
        [table, name]
    );
    return rows.length > 0;
}

async function addForeignKey(conn, table, name, column, targetTable, onDelete) {
    if (await constraintExists(conn, table, name)) return false;
    await conn.query(
        `ALTER TABLE \`${table}\`
            ADD CONSTRAINT \`${name}\` FOREIGN KEY (\`${column}\`)
            REFERENCES \`${targetTable}\`(id) ON DELETE ${onDelete}`
    );
    return true;
}

/** Deletes rows whose foreign key points at a row that no longer exists. */
async function purgeOrphans(conn, table, column, targetTable) {
    const [result] = await conn.query(
        `DELETE child FROM \`${table}\` child
          LEFT JOIN \`${targetTable}\` parent ON child.\`${column}\` = parent.id
          WHERE child.\`${column}\` IS NOT NULL AND parent.id IS NULL`
    );
    if (result.affectedRows > 0) {
        console.log(`   · pruned ${result.affectedRows} orphaned ${table}.${column} row(s)`);
    }
    return result.affectedRows;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runMigrations(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INT PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [applied] = await pool.query('SELECT id FROM schema_migrations');
    const done = new Set(applied.map(r => r.id));

    let ran = 0;
    for (const migration of MIGRATIONS) {
        if (done.has(migration.id)) continue;

        const conn = await pool.getConnection();
        try {
            console.log(`🔧 migration ${migration.id}: ${migration.name}`);
            // DDL is not transactional in MySQL/MariaDB, so a failure mid-way
            // leaves the migration unrecorded and it is retried next boot. Every
            // step above is written to be safe to re-run for that reason.
            await migration.up(conn);
            await conn.query(
                'INSERT INTO schema_migrations (id, name) VALUES (?, ?)',
                [migration.id, migration.name]
            );
            ran += 1;
        } finally {
            conn.release();
        }
    }

    if (ran === 0) {
        console.log('✅ Schema up to date.');
    } else {
        console.log(`✅ Applied ${ran} migration(s).`);
    }
    return ran;
}

module.exports = {
    runMigrations,
    MIGRATIONS,
    // exported for tests and for reuse by future migrations
    addColumn,
    addIndex,
    addForeignKey,
    columnExists,
    indexExists
};

// `npm run migrate` runs this file directly.
if (require.main === module) {
    const { getPool } = require('./db');
    runMigrations(getPool())
        .then(() => process.exit(0))
        .catch(err => {
            console.error('❌ Migration failed:', err);
            process.exit(1);
        });
}
