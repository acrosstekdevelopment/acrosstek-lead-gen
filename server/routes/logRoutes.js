const express = require('express');
const router = express.Router();
const Log = require('../models/Log');

/**
 * GET /api/logs
 * Get logs, newest first, paginated.
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;

        const logs = await Log.find()
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Log.countDocuments();

        res.json({ logs, total, page, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
