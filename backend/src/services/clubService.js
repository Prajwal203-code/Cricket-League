/**
 * Club membership, roles and the weekly chest.
 *
 * The route layer used to hold all of this inline, with the caller's identity
 * taken from the request body and several multi-step writes (create a club,
 * accept a member, kick a member) issued as loose queries that could half-apply.
 * Everything that touches more than one row now runs in a transaction here.
 */
const crypto = require('crypto');
const { getPool } = require('../config/db');
const { CLUB, ECONOMY } = require('../config/gameRules');

/** Role ordering, strongest first. Used for permission checks and succession. */
const ROLE_RANK = { LEADER: 3, CO_LEADER: 2, ELDER: 1, MEMBER: 0 };

/** Roles that may be assigned through /change-role. LEADER is not one of them. */
const ASSIGNABLE_ROLES = ['CO_LEADER', 'ELDER', 'MEMBER'];

function rankOf(role) {
    return ROLE_RANK[role] ?? -1;
}

// ---------------------------------------------------------------------------
// Week boundaries for the chest
// ---------------------------------------------------------------------------

/** Monday 00:00 of the week containing `date`, in server local time. */
function weekStart(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // getDay(): 0 = Sunday. Shift so Monday is the first day.
    const daysSinceMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - daysSinceMonday);
    return d;
}

/**
 * Stable 8-character key for the week, e.g. `2026-W37`. Used as the uniqueness
 * scope for chest claims, so a player cannot claim twice by switching clubs.
 */
function weekKey(date = new Date()) {
    const start = weekStart(date);
    // ISO week number: Thursday of this week decides which year the week is in.
    const thursday = new Date(start);
    thursday.setDate(thursday.getDate() + 3);
    const firstThursday = new Date(thursday.getFullYear(), 0, 4);
    const firstWeekStart = weekStart(firstThursday);
    const week = Math.round((thursday - firstWeekStart) / (7 * 86400000)) + 1;
    return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/** The caller's club and role, or null when they are not in a club. */
async function getMembership(userId, db = null) {
    const conn = db || getPool();
    const [rows] = await conn.query(
        'SELECT club_id, role FROM club_members WHERE user_id = ? LIMIT 1',
        [userId]
    );
    return rows[0] || null;
}

/**
 * Loads the acting user with the fields the club routes need.
 *
 * `is_guest` is read from the database rather than from the session token: a
 * guest who signs in with Google keeps their old token until it expires, and
 * that token still says `isGuest: true`.
 */
async function loadActor(userId, db = null) {
    const conn = db || getPool();
    const [rows] = await conn.query(
        `SELECT id, username, avatar, level, trophies, coins, country_code,
                is_guest, auth_provider
           FROM users WHERE id = ? LIMIT 1`,
        [userId]
    );
    if (rows.length === 0) return null;

    const user = rows[0];
    user.isGuest = Boolean(user.is_guest || user.auth_provider === 'guest');
    return user;
}

/** Posts a SYSTEM line into a club's feed. */
async function postSystemMessage(db, clubId, actor, content) {
    await db.query(
        `INSERT INTO club_messages (club_id, user_id, username, avatar, message_type, content)
         VALUES (?, ?, ?, ?, 'SYSTEM', ?)`,
        [clubId, actor.id, actor.username, actor.avatar || '👤', content]
    );
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Builds a club tag that does not collide.
 *
 * The old route derived it from the first three letters of the name, which is
 * unique-keyed in the schema — the second club starting with "STR" failed with
 * a raw SQL duplicate-key error surfaced to the player as a 500.
 */
async function generateClubTag(db, name) {
    const base = (name || 'CLUB')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4) || 'CLUB';

    for (let attempt = 0; attempt < 8; attempt++) {
        const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
        const tag = `#${base}${suffix}`.slice(0, CLUB.tagMaxLength);
        const [clash] = await db.query('SELECT id FROM clubs WHERE tag = ? LIMIT 1', [tag]);
        if (clash.length === 0) return tag;
    }
    // Fall back to something that cannot realistically collide.
    return `#${crypto.randomBytes(4).toString('hex').toUpperCase()}`.slice(0, CLUB.tagMaxLength);
}

// ---------------------------------------------------------------------------
// Weekly chest
// ---------------------------------------------------------------------------

/**
 * Club chest standing for the current week.
 *
 * `weekly_chest_score`, `weekly_chest_goal` and `weekly_chest_tier` are columns
 * on `clubs` that no code ever wrote to, so every club displayed the seeded
 * 1250 / 2500 at tier 3 permanently. The score is now the trophies the club's
 * members earned from matches they won since Monday.
 */
async function getChestProgress(clubId, userId, db = null) {
    const conn = db || getPool();
    const since = weekStart();

    const [[{ members }]] = await conn.query(
        'SELECT COUNT(*) AS members FROM club_members WHERE club_id = ?',
        [clubId]
    );

    const [[{ wins }]] = await conn.query(
        `SELECT COUNT(*) AS wins
           FROM match_history mh
           JOIN club_members cm ON cm.user_id = mh.winner_user_id
          WHERE cm.club_id = ? AND mh.created_at >= ?`,
        [clubId, since]
    );

    const score = Number(wins) * ECONOMY.trophiesPerWin;
    const goal = Math.max(
        CLUB.chest.minGoalTrophies,
        Number(members) * CLUB.chest.goalTrophiesPerMember
    );

    const tier = Math.min(
        CLUB.chest.tiers,
        Math.floor((score / goal) * CLUB.chest.tiers)
    );

    const [claims] = await conn.query(
        'SELECT tier FROM club_chest_claims WHERE user_id = ? AND week_key = ? LIMIT 1',
        [userId, weekKey()]
    );

    return {
        score,
        goal,
        tier,
        maxTiers: CLUB.chest.tiers,
        wins: Number(wins),
        claimed: claims.length > 0,
        claimedTier: claims.length > 0 ? claims[0].tier : null,
        rewardCoins: tier * CLUB.chest.coinsPerTier,
        rewardGems: tier * CLUB.chest.gemsPerTier,
        resetsAt: new Date(weekStart().getTime() + 7 * 86400000).getTime()
    };
}

module.exports = {
    ROLE_RANK,
    ASSIGNABLE_ROLES,
    rankOf,
    weekStart,
    weekKey,
    getMembership,
    loadActor,
    postSystemMessage,
    generateClubTag,
    getChestProgress
};
