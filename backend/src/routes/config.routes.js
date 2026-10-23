const router = require('express').Router();
const { getRules } = require('../config/liveRules');

// Public, read-only contract. Publishing is a deployment operation, never a player API.
router.get('/', (req, res) => {
    const rules = getRules();
    res.set('Cache-Control', 'no-store').json({
        success: true, schemaVersion: 1, version: rules.version,
        xp: rules.xp, levelScaling: rules.levelScaling,
        autoGrantOnLevelUp: true, refreshAfterMs: 30000
    });
});

module.exports = router;
