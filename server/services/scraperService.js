const { spawn } = require('child_process');
const path = require('path');
const ScraperState = require('../models/ScraperState');
const ExtensionData = require('../models/ExtensionData');
const Log = require('../models/Log');

const SCRAPERS_BASE = path.resolve(__dirname, '../../jobs_scraper-main');
const SCRAPER_TIMEOUT_MS = 120 * 1000; // 120 seconds

/**
 * Map of all known scrapers and their Python script paths.
 */
const JOB_SCRAPERS = {
    scrape_arcdev: 'job_scrapers/scrape_arcdev.py',
    scrape_builtin: 'job_scrapers/scrape_builtin.py',
    scrape_dice: 'job_scrapers/scrape_dice.py',
    scrape_indeed: 'job_scrapers/scrape_indeed.py',
    scrape_jobspresso: 'job_scrapers/scrape_jobspresso.py',
    scrape_linkedin: 'job_scrapers/scrape_linkedin.py',
    scrape_nodesk: 'job_scrapers/scrape_nodesk.py',
    scrape_pangian: 'job_scrapers/scrape_pangian.py',
    scrape_pitchnhire: 'job_scrapers/scrape_pitchnhire.py',
    scrape_powertofly: 'job_scrapers/scrape_powertofly.py',
    scrape_remote_co: 'job_scrapers/scrape_remote_co.py',
    scrape_remoteok: 'job_scrapers/scrape_remoteok.py',
    scrape_remotive: 'job_scrapers/scrape_remotive.py',
    scrape_wearedistributed: 'job_scrapers/scrape_wearedistributed.py',
    scrape_weworkremotely: 'job_scrapers/scrape_weworkremotely.py',
    scrape_working_nomads: 'job_scrapers/scrape_working_nomads.py'
};

const FUNDING_SCRAPERS = {
    scrape_crunchbase: 'funding_scrapers/scrape_crunchbase.py',
    scrape_entrackr: 'funding_scrapers/scrape_entrackr.py',
    scrape_inc42: 'funding_scrapers/scrape_inc42.py',
    scrape_techcrunch: 'funding_scrapers/scrape_techcrunch.py',
    scrape_yourstory: 'funding_scrapers/scrape_yourstory.py'
};

const CHROME_EXTENSIONS = [
    'linkedin_jobs',
    'stackoverflow_jobs',
    'monster',
    'yc_jobs',
    'wellfound_jobs'
];

function getScraperMap(type) {
    if (type === 'job') return JOB_SCRAPERS;
    if (type === 'funding') return FUNDING_SCRAPERS;
    return {};
}

function getAllScraperNames(type) {
    if (type === 'extension') return CHROME_EXTENSIONS;
    return Object.keys(getScraperMap(type));
}

/**
 * Ensures ScraperState documents exist for all known scrapers.
 */
async function initializeScraperStates() {
    const all = [
        ...Object.keys(JOB_SCRAPERS).map(name => ({ scraperName: name, type: 'job' })),
        ...Object.keys(FUNDING_SCRAPERS).map(name => ({ scraperName: name, type: 'funding' })),
        ...CHROME_EXTENSIONS.map(name => ({ scraperName: name, type: 'extension' }))
    ];

    for (const s of all) {
        await ScraperState.findOneAndUpdate(
            { scraperName: s.scraperName },
            { $setOnInsert: s },
            { upsert: true, new: true }
        );
    }
}

/**
 * Execute a Python scraper script and capture its JSON output.
 * The scraper writes JSON to a file; we read that file after execution.
 * Returns: { success: boolean, data: array, error: string|null }
 */
function executePythonScraper(scraperName, type) {
    return new Promise(async (resolve) => {
        const scraperMap = getScraperMap(type);
        const scriptRelPath = scraperMap[scraperName];
        if (!scriptRelPath) {
            return resolve({ success: false, data: [], error: `Unknown scraper: ${scraperName}` });
        }

        const scriptPath = path.join(SCRAPERS_BASE, scriptRelPath);
        let stdout = '';
        let stderr = '';

        const proc = spawn('python3', [scriptPath], {
            cwd: SCRAPERS_BASE,
            timeout: SCRAPER_TIMEOUT_MS,
            env: { ...process.env }
        });

        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve({ success: false, data: [], error: `Scraper ${scraperName} timed out after 120 seconds` });
        }, SCRAPER_TIMEOUT_MS);

        proc.on('close', (code) => {
            clearTimeout(timer);

            if (code !== 0) {
                return resolve({ success: false, data: [], error: `Scraper ${scraperName} exited with code ${code}: ${stderr}` });
            }

            // Scrapers write to files. Determine the output file path.
            const outputDir = type === 'funding' ? 'funded_json' : 'extracted json';
            const outputFileName = type === 'funding'
                ? `${scraperName.replace('scrape_', '')}_funding_companies.json`
                : `${scraperName}.json`;
            const outputPath = path.join(SCRAPERS_BASE, outputDir, outputFileName);

            try {
                const fs = require('fs');
                const fileContent = fs.readFileSync(outputPath, 'utf-8');
                const data = JSON.parse(fileContent);
                resolve({ success: true, data: Array.isArray(data) ? data : [], error: null });
            } catch (err) {
                // Try parsing stdout as JSON fallback
                try {
                    const data = JSON.parse(stdout);
                    resolve({ success: true, data: Array.isArray(data) ? data : [], error: null });
                } catch {
                    resolve({ success: false, data: [], error: `Failed to read output for ${scraperName}: ${err.message}` });
                }
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({ success: false, data: [], error: `Failed to start scraper ${scraperName}: ${err.message}` });
        });
    });
}

/**
 * Get latest chrome extension data (not a scraper run, just retrieves stored data).
 */
async function getExtensionData(extensionName) {
    const latest = await ExtensionData.findOne({ extensionName }).sort({ receivedAt: -1 });
    if (!latest || !latest.data || latest.data.length === 0) {
        return { success: false, data: [], error: `No data received from extension: ${extensionName}` };
    }
    return { success: true, data: latest.data, error: null };
}

/**
 * Check if scraper can run (cooldown check).
 */
async function canRunScraper(scraperName) {
    const state = await ScraperState.findOne({ scraperName });
    if (!state) return { canRun: true, reason: 'No state found' };
    if (state.isRunning) return { canRun: false, reason: 'Scraper is already running' };
    if (state.isOnCooldown()) {
        const remainMs = state.getCooldownRemaining();
        const remainMin = Math.ceil(remainMs / 60000);
        return { canRun: false, reason: `Cooldown active. ${remainMin} minutes remaining.` };
    }
    return { canRun: true, reason: 'OK' };
}

/**
 * Run a single scraper (job or funding) with cooldown enforcement.
 */
async function runScraper(scraperName, type, logFn) {
    const { canRun, reason } = await canRunScraper(scraperName);
    if (!canRun) {
        return { success: false, data: [], error: reason };
    }

    // Mark as running
    await ScraperState.findOneAndUpdate(
        { scraperName },
        { isRunning: true },
        { upsert: true }
    );

    if (logFn) logFn(`Starting ${type} scraper: ${scraperName}`, 'info', 1);

    let result;
    if (type === 'extension') {
        result = await getExtensionData(scraperName);
    } else {
        result = await executePythonScraper(scraperName, type);
    }

    // Update state
    await ScraperState.findOneAndUpdate(
        { scraperName },
        {
            isRunning: false,
            lastRunAt: new Date(),
            lastRunSuccess: result.success
        }
    );

    if (result.success) {
        if (logFn) logFn(`Scraper ${scraperName} completed: ${result.data.length} records`, 'success', 1);
    } else {
        if (logFn) logFn(`Scraper ${scraperName} failed: ${result.error}`, 'error', 1);
    }

    return result;
}

module.exports = {
    JOB_SCRAPERS,
    FUNDING_SCRAPERS,
    CHROME_EXTENSIONS,
    getAllScraperNames,
    initializeScraperStates,
    executePythonScraper,
    getExtensionData,
    canRunScraper,
    runScraper
};
