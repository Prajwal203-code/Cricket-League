const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// GET /api/tours from MySQL database
router.get('/', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query('SELECT * FROM tours ORDER BY tour_number ASC');
        res.json({ success: true, tours: rows });
    } catch (err) {
        console.error('SQL Error in tours route:', err.message);
        res.status(500).json({ success: false, message: 'Database error fetching tours' });
    }
});

module.exports = router;
