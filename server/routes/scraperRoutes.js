const express = require('express');
const router = express.Router();
const scraperService = require('../services/scraperService');
const pipelineOrchestrator = require('../services/pipelineOrchestrator');
const ScraperState = require('../models/ScraperState');

/**
 * GET /api/scrapers/status
 * Get all scraper states (cooldowns, last run times, running status).
 */
router.get('/status', async (req, res) => {
    try {
        const states = await ScraperState.find({});
        const result = states.map(s => ({
            scraperName: s.scraperName,
            type: s.type,
            lastRunAt: s.lastRunAt,
            lastRunSuccess: s.lastRunSuccess,
            isRunning: s.isRunning,
            onCooldown: s.isOnCooldown(),
            cooldownRemaining: s.getCooldownRemaining()
        }));

        res.json({ scrapers: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/scrapers/run/:type/:name
 * Run a single scraper and trigger the pipeline.
 */
router.post('/run/:type/:name', async (req, res) => {
    const { type, name } = req.params;

    // Validate type
    if (!['job', 'funding', 'extension'].includes(type)) {
        return res.status(400).json({ error: 'Invalid scraper type. Use: job, funding, extension' });
    }

    // Check if scraper exists
    const allNames = scraperService.getAllScraperNames(type);
    if (!allNames.includes(name)) {
        return res.status(404).json({ error: `Scraper ${name} not found in ${type} scrapers` });
    }

    // Check cooldown
    const { canRun, reason } = await scraperService.canRunScraper(name);
    if (!canRun) {
        return res.status(429).json({ error: reason });
    }

    // Check if a workflow is already running
    const status = pipelineOrchestrator.getWorkflowStatus();
    if (status && status.status === 'running') {
        return res.status(409).json({ error: 'A workflow is already running. Please wait.' });
    }

    // Start pipeline in background (non-blocking)
    res.json({ message: `Pipeline started for ${type} scraper: ${name}` });

    // Run pipeline async
    pipelineOrchestrator.runPipeline(name, type).catch(err => {
        console.error('Pipeline error:', err);
    });
});

/**
 * POST /api/scrapers/run-all/:type
 * Run all scrapers of a given type sequentially.
 */
router.post('/run-all/:type', async (req, res) => {
    const { type } = req.params;

    if (!['job', 'funding', 'extension'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type. Use: job, funding, extension' });
    }

    const status = pipelineOrchestrator.getWorkflowStatus();
    if (status && status.status === 'running') {
        return res.status(409).json({ error: 'A workflow is already running. Please wait.' });
    }

    const scraperNames = scraperService.getAllScraperNames(type);

    res.json({ message: `Running all ${type} scrapers: ${scraperNames.join(', ')}` });

    // Run each scraper's pipeline sequentially
    (async () => {
        for (const name of scraperNames) {
            const { canRun } = await scraperService.canRunScraper(name);
            if (!canRun) continue;

            await pipelineOrchestrator.runPipeline(name, type);
        }
    })().catch(err => console.error('Run-all error:', err));
});

module.exports = router;
