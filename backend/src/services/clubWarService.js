/**
 * Weekend club war state.
 *
 * Wars roll over on their own and dog tags are earned by winning matches, so
 * the war leaderboard reflects play rather than whatever a client posted.
 */
const { getPool } = require('../config/db');
const { CLUB_WAR } = require('../config/gameRules');

/**
 * Returns the active war, opening a new one when the previous has expired.
 *
 * The old route created "Weekend Glory War #1" once and left it active
 * indefinitely, so `war_number` never advanced and scores never reset.
 */
async function getOrCreateActiveWar() {
    const pool = getPool();

    const [active] = await pool.query(
        'SELECT * FROM club_wars WHERE is_active = 1 AND end_date > NOW() ORDER BY id DESC LIMIT 1'
    );
    if (active.length > 0) return describeWar(active[0]);

    // Close anything that has run past its end date before opening the next.
    await pool.query('UPDATE club_wars SET is_active = 0 WHERE end_date <= NOW()');

    const [last] = await pool.query('SELECT MAX(war_number) AS n FROM club_wars');
    const warNumber = Number(last[0]?.n || 0) + 1;
    const endDate = new Date(Date.now() + CLUB_WAR.durationDays * 86400000);

    const [inserted] = await pool.query(`
        INSERT INTO club_wars (war_number, name, start_date, end_date, is_active)
        VALUES (?, ?, NOW(), ?, 1)
    `, [warNumber, `Weekend Glory War #${warNumber} 🏆`, endDate]);

    const [rows] = await pool.query('SELECT * FROM club_wars WHERE id = ?', [inserted.insertId]);
    return describeWar(rows[0]);
}

function describeWar(row) {
    const endsAt = new Date(row.end_date).getTime();
    return {
        id: row.id,
        warNumber: row.war_number,
        name: row.name,
        endsAt,
        remainingMs: Math.max(0, endsAt - Date.now())
    };
}

/**
 * Credits a winner's club with dog tags. Called from match settlement inside
 * the match transaction; a player with no club is simply a no-op.
 *
 * This deliberately reads the war through the caller's connection rather than
 * calling getOrCreateActiveWar — that helper uses the pool, and issuing a
 * second connection's write while this transaction holds locks risks a
 * deadlock. If no war is open, the match simply scores no tags; the status
 * endpoint opens the next one.
 */
async function awardDogTagsForWin(userId, conn = null) {
    const db = conn || getPool();

    const [membership] = await db.query(
        'SELECT club_id FROM club_members WHERE user_id = ? LIMIT 1',
        [userId]
    );
    if (membership.length === 0) return 0;

    const [wars] = await db.query(
        'SELECT id FROM club_wars WHERE is_active = 1 AND end_date > NOW() ORDER BY id DESC LIMIT 1'
    );
    if (wars.length === 0) return 0;

    await db.query(`
        INSERT INTO club_war_scores (war_id, club_id, dog_tags)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE dog_tags = dog_tags + VALUES(dog_tags)
    `, [wars[0].id, membership[0].club_id, CLUB_WAR.dogTagsPerWin]);

    return CLUB_WAR.dogTagsPerWin;
}

module.exports = {
    getOrCreateActiveWar,
    awardDogTagsForWin
};
