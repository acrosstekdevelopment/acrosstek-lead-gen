const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ApiKey = require('../models/ApiKey');
const ExtensionData = require('../models/ExtensionData');
const apiKeyAuth = require('../middleware/apiKeyAuth');

const EXTENSION_NAMES = ['linkedin_jobs', 'stackoverflow_jobs', 'monster', 'yc_jobs', 'wellfound_jobs'];

/**
 * POST /api/extensions/keys/generate
 * Generate API keys for all 5 chrome extensions (run once).
 */
router.post('/keys/generate', async (req, res) => {
    try {
        const results = [];

        for (const name of EXTENSION_NAMES) {
            const existing = await ApiKey.findOne({ extensionName: name });
            if (existing) {
                results.push({ extensionName: name, apiKey: existing.apiKey, status: 'existing' });
                continue;
            }

            const key = uuidv4();
            await ApiKey.create({ extensionName: name, apiKey: key });
            results.push({ extensionName: name, apiKey: key, status: 'created' });
        }

        res.json({ keys: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/extensions/keys
 * List all extension API keys.
 */
router.get('/keys', async (req, res) => {
    try {
        const keys = await ApiKey.find({});
        res.json({ keys: keys.map(k => ({ extensionName: k.extensionName, apiKey: k.apiKey })) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/extensions/data
 * Receive scraped data from a chrome extension.
 * Requires x-api-key header for authentication.
 */
router.post('/data', apiKeyAuth, async (req, res) => {
    try {
        const extensionName = req.extensionName;
        const data = req.body.data || req.body;

        if (!data || (Array.isArray(data) && data.length === 0)) {
            return res.status(400).json({ error: 'No data provided' });
        }

        await ExtensionData.create({
            extensionName,
            data: Array.isArray(data) ? data : [data],
            receivedAt: new Date()
        });

        res.json({
            message: `Data received from ${extensionName}`,
            count: Array.isArray(data) ? data.length : 1
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/extensions/status
 * Get last received timestamp for each extension.
 */
router.get('/status', async (req, res) => {
    try {
        const statuses = [];

        for (const name of EXTENSION_NAMES) {
            const latest = await ExtensionData.findOne({ extensionName: name }).sort({ receivedAt: -1 });
            statuses.push({
                extensionName: name,
                lastReceivedAt: latest ? latest.receivedAt : null,
                dataCount: latest ? latest.data.length : 0
            });
        }

        res.json({ extensions: statuses });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/jobs/batch
 * Native endpoint that Chrome extensions post to.
 * Extensions append this path to the base server URL automatically.
 * Requires x-api-key header for authentication.
 */
router.post('/jobs/batch', apiKeyAuth, async (req, res) => {
    try {
        const extensionName = req.extensionName;
        const data = req.body.data || req.body.jobs || req.body;

        if (!data || (Array.isArray(data) && data.length === 0)) {
            return res.status(400).json({ error: 'No data provided' });
        }

        const dataArray = Array.isArray(data) ? data : [data];

        await ExtensionData.create({
            extensionName,
            data: dataArray,
            receivedAt: new Date()
        });

        res.json({
            success: true,
            message: `Batch received from ${extensionName}`,
            count: dataArray.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
