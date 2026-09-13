// ==========================================================
// 3D Real Cricket Player Photorealistic Avatar Engine
// Maps every player in every nation to an authentic 3D photorealistic render
// ==========================================================

const PHOTO_3D_ASSETS = {
    // Core 3D Photorealistic Models
    PK_BAT: '/images/players/pk_bat.jpg',
    AU_BAT: '/images/players/au_bat.jpg',
    IN_BAT: '/images/players/batsman.jpg',
    AGG_BAT: '/images/players/aggressive_bat.jpg',
    ALL_ROUNDER: '/images/players/allrounder.jpg',
    FAST_BOWLER: '/images/players/fast_bowler.jpg',
    PK_PACER: '/images/players/pk_pacer.jpg',
    SPINNER: '/images/players/spinner.jpg',
    WICKET_KEEPER: '/images/players/wicketkeeper.jpg'
};

/**
 * Returns a photorealistic 3D human cricket player image for any player.
 * @param {string} name - Player name
 * @param {string} role - Tactical role
 * @param {number} order - Position 1 to 11
 * @param {string} countryCode - Country (IN, PK, AU, GB, etc.)
 * @param {string} type - Card type
 */
function getUniquePlayer3DAvatar(name, role, order, countryCode, type) {
    const c = (countryCode || 'IN').toUpperCase();
    const pos = order || 1;
    const r = (role || '').toLowerCase();
    const t = (type || '').toLowerCase();

    // 1. Wicket-Keeper (Position #5 or WK role)
    if (pos === 5 || r.includes('wk') || t === 'wicket_keeper') {
        return PHOTO_3D_ASSETS.WICKET_KEEPER;
    }

    // 2. Country Specific Real 3D Renders
    if (c === 'PK') {
        if (pos === 1) return PHOTO_3D_ASSETS.PK_BAT;
        if (pos === 2) return PHOTO_3D_ASSETS.AGG_BAT;
        if (pos === 3) return PHOTO_3D_ASSETS.IN_BAT;
        if (pos === 4) return PHOTO_3D_ASSETS.AU_BAT;
        if (pos === 6) return PHOTO_3D_ASSETS.ALL_ROUNDER;
        if (pos === 7) return PHOTO_3D_ASSETS.PK_PACER;
        if (pos === 8) return PHOTO_3D_ASSETS.PK_PACER;
        if (pos === 9) return PHOTO_3D_ASSETS.FAST_BOWLER;
        if (pos === 10) return PHOTO_3D_ASSETS.SPINNER;
        if (pos === 11) return PHOTO_3D_ASSETS.SPINNER;
    }

    if (c === 'AU') {
        if (pos === 1) return PHOTO_3D_ASSETS.AU_BAT;
        if (pos === 2) return PHOTO_3D_ASSETS.AGG_BAT;
        if (pos === 3) return PHOTO_3D_ASSETS.IN_BAT;
        if (pos === 4) return PHOTO_3D_ASSETS.PK_BAT;
        if (pos === 6) return PHOTO_3D_ASSETS.ALL_ROUNDER;
        if (pos === 7) return PHOTO_3D_ASSETS.FAST_BOWLER;
        if (pos === 8) return PHOTO_3D_ASSETS.FAST_BOWLER;
        if (pos === 9) return PHOTO_3D_ASSETS.PK_PACER;
        if (pos === 10) return PHOTO_3D_ASSETS.SPINNER;
        if (pos === 11) return PHOTO_3D_ASSETS.SPINNER;
    }

    // Default India / Major / Other Nations
    if (pos === 1) return PHOTO_3D_ASSETS.IN_BAT;
    if (pos === 2) return PHOTO_3D_ASSETS.AGG_BAT;
    if (pos === 3) return PHOTO_3D_ASSETS.ALL_ROUNDER;
    if (pos === 4) return PHOTO_3D_ASSETS.AU_BAT;
    if (pos === 6) return PHOTO_3D_ASSETS.ALL_ROUNDER;
    if (pos === 7) return PHOTO_3D_ASSETS.PK_PACER;
    if (pos === 8) return PHOTO_3D_ASSETS.FAST_BOWLER;
    if (pos === 9) return PHOTO_3D_ASSETS.PK_PACER;
    if (pos === 10) return PHOTO_3D_ASSETS.SPINNER;
    if (pos === 11) return PHOTO_3D_ASSETS.SPINNER;

    // Role-based fallback
    if (r.includes('fast') || r.includes('pace') || t === 'bowler') return PHOTO_3D_ASSETS.FAST_BOWLER;
    if (r.includes('spin')) return PHOTO_3D_ASSETS.SPINNER;
    if (r.includes('all-rounder') || r.includes('ar')) return PHOTO_3D_ASSETS.ALL_ROUNDER;
    return PHOTO_3D_ASSETS.IN_BAT;
}

if (typeof window !== 'undefined') {
    window.getUniquePlayer3DAvatar = getUniquePlayer3DAvatar;
}
