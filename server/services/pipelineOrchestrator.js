const scraperService = require('./scraperService');
const filterService = require('./filterService');
const companyService = require('./companyService');
const linkedinService = require('./linkedinService');
const employeeService = require('./employeeService');
const emailService = require('./emailService');
const sheetsService = require('./sheetsService');
const Log = require('../models/Log');

/**
 * Pipeline Orchestrator
 * Executes Steps 2→3→4→(7a)→5→6→(7b) sequentially per scraper run.
 * Emits progress events via Socket.IO for the frontend header.
 */

let io = null;
let activeWorkflow = null;

function setSocketIO(socketIO) {
    io = socketIO;
}

function emitProgress(data) {
    if (io) {
        io.emit('workflow:progress', data);
    }
}

function emitLog(logEntry) {
    if (io) {
        io.emit('workflow:log', logEntry);
    }
}

/**
 * Create a log function that saves to DB and emits to frontend.
 */
function createLogFn(scraperName) {
    return async (message, level = 'info', step = null) => {
        const entry = await Log.create({
            message,
            level,
            step,
            scraperName,
            timestamp: new Date()
        });
        emitLog(entry.toObject());
    };
}

/**
 * Get current workflow status.
 */
function getWorkflowStatus() {
    return activeWorkflow;
}

/**
 * Run the full pipeline for a scraper run.
 * @param {string} scraperName - Name of the scraper
 * @param {string} type - 'job', 'funding', or 'extension'
 */
async function runPipeline(scraperName, type) {
    const logFn = createLogFn(scraperName);

    activeWorkflow = {
        scraperName,
        type,
        step: 1,
        progress: 0,
        status: 'running',
        startedAt: new Date(),
        latestActivity: `Running scraper: ${scraperName}`
    };

    emitProgress(activeWorkflow);

    try {
        // ── STEP 1: Run Scraper ──────────────────────────────────────
        activeWorkflow.step = 1;
        activeWorkflow.latestActivity = `Running ${type} scraper: ${scraperName}`;
        activeWorkflow.progress = 5;
        emitProgress(activeWorkflow);

        const scraperResult = await scraperService.runScraper(scraperName, type, logFn);

        if (!scraperResult.success || scraperResult.data.length === 0) {
            activeWorkflow.status = 'failed';
            activeWorkflow.latestActivity = `Scraper ${scraperName} failed: ${scraperResult.error || 'No data'}`;
            activeWorkflow.progress = 100;
            emitProgress(activeWorkflow);
            return { success: false, error: scraperResult.error };
        }

        let data = scraperResult.data;
        const totalCompanies = data.length;
        await logFn(`Scraper ${scraperName} returned ${totalCompanies} records`, 'success', 1);

        // ── STEP 2: Filter (jobs/extensions only) ────────────────────
        activeWorkflow.step = 2;
        activeWorkflow.latestActivity = 'Filtering job titles...';
        activeWorkflow.progress = 10;
        emitProgress(activeWorkflow);

        if (type === 'job' || type === 'extension') {
            const beforeCount = data.length;
            data = filterService.filterJobData(data);
            await logFn(`Step 2: Filtered ${beforeCount} → ${data.length} records`, 'info', 2);

            if (data.length === 0) {
                activeWorkflow.status = 'completed';
                activeWorkflow.latestActivity = 'No matching job titles found after filtering';
                activeWorkflow.progress = 100;
                emitProgress(activeWorkflow);
                return { success: true, message: 'No matching titles' };
            }
        }

        // ── STEP 3: Store Companies ──────────────────────────────────
        activeWorkflow.step = 3;
        activeWorkflow.latestActivity = 'Storing company records...';
        activeWorkflow.progress = 20;
        emitProgress(activeWorkflow);

        let companyResult;
        if (type === 'funding') {
            companyResult = await companyService.processFundingData(data, logFn);
        } else {
            companyResult = await companyService.processJobData(data, logFn);
        }

        if (companyResult.added === 0) {
            activeWorkflow.status = 'completed';
            activeWorkflow.latestActivity = `No new companies added (all ${companyResult.discarded} duplicates)`;
            activeWorkflow.progress = 100;
            emitProgress(activeWorkflow);
            return { success: true, message: 'All companies already exist', ...companyResult };
        }

        // ── STEP 4: LinkedIn Lookup ──────────────────────────────────
        activeWorkflow.step = 4;
        activeWorkflow.latestActivity = 'Finding LinkedIn URLs...';
        activeWorkflow.progress = 30;
        emitProgress(activeWorkflow);

        let linkedinResult;
        if (type === 'funding') {
            linkedinResult = await linkedinService.processTable1b(logFn);
        } else {
            linkedinResult = await linkedinService.processTable1a(logFn);
        }

        activeWorkflow.progress = 45;
        activeWorkflow.latestActivity = `LinkedIn: found ${linkedinResult.found}, errors ${linkedinResult.errors}`;
        emitProgress(activeWorkflow);

        // ── STEP 7a: Sync Tables 1a/1b to Sheets ─────────────────
        activeWorkflow.step = 7;
        activeWorkflow.latestActivity = 'Syncing company data to Google Sheets...';
        emitProgress(activeWorkflow);

        try {
            if (type === 'funding') {
                await sheetsService.syncTable1b(logFn);
            } else {
                await sheetsService.syncTable1a(logFn);
            }
        } catch (err) {
            await logFn(`Step 7: Sheets sync error: ${err.message}`, 'error', 7);
        }

        // ── STEP 5: Employee Scraping (Apify) ────────────────────
        activeWorkflow.step = 5;
        activeWorkflow.latestActivity = 'Scraping employees via Apify...';
        activeWorkflow.progress = 50;
        emitProgress(activeWorkflow);

        let employeeResult;
        if (type === 'funding') {
            employeeResult = await employeeService.processTable1b(logFn);
        } else {
            employeeResult = await employeeService.processTable1a(logFn);
        }

        activeWorkflow.progress = 65;
        activeWorkflow.latestActivity = `Employees: ${employeeResult.totalAdded} added, ${employeeResult.errors} errors`;
        emitProgress(activeWorkflow);

        // ── STEP 6: Email Enrichment (Domain + Snov) ─────────────
        activeWorkflow.step = 6;
        activeWorkflow.latestActivity = 'Finding company domains and enriching emails...';
        activeWorkflow.progress = 70;
        emitProgress(activeWorkflow);

        let emailResult;
        if (type === 'funding') {
            emailResult = await emailService.processTable2b(logFn);
        } else {
            emailResult = await emailService.processTable2a(logFn);
        }

        activeWorkflow.progress = 90;
        activeWorkflow.latestActivity = `Emails: ${emailResult.totalEmailsFound} found, ${emailResult.totalErrors} errors`;
        emitProgress(activeWorkflow);

        // ── STEP 7b: Sync All Tables to Sheets ───────────────────
        activeWorkflow.step = 7;
        activeWorkflow.latestActivity = 'Final sync to Google Sheets...';
        emitProgress(activeWorkflow);

        try {
            if (type === 'funding') {
                await sheetsService.syncTable1b(logFn);
                await sheetsService.syncTable2b(logFn);
            } else {
                await sheetsService.syncTable1a(logFn);
                await sheetsService.syncTable2a(logFn);
            }
        } catch (err) {
            await logFn(`Step 7: Final sheets sync error: ${err.message}`, 'error', 7);
        }

        // ── COMPLETE ─────────────────────────────────────────────
        activeWorkflow.status = 'completed';
        activeWorkflow.progress = 100;
        activeWorkflow.latestActivity = `Pipeline complete. Companies: ${companyResult.added} added. Employees: ${employeeResult.totalAdded}. Emails: ${emailResult.totalEmailsFound} found.`;
        emitProgress(activeWorkflow);

        await logFn(activeWorkflow.latestActivity, 'success');

        const result = {
            success: true,
            companiesAdded: companyResult.added,
            linkedinFound: linkedinResult.found,
            employeesAdded: employeeResult.totalAdded,
            emailsFound: emailResult.totalEmailsFound,
            rateLimited: linkedinResult.rateLimited || employeeResult.rateLimited || emailResult.rateLimited
        };

        // Clear active workflow after a delay so frontend can show completion
        setTimeout(() => { activeWorkflow = null; }, 30000);

        return result;

    } catch (err) {
        activeWorkflow.status = 'failed';
        activeWorkflow.latestActivity = `Pipeline error: ${err.message}`;
        activeWorkflow.progress = 100;
        emitProgress(activeWorkflow);
        await logFn(`Pipeline error: ${err.message}`, 'error');
        setTimeout(() => { activeWorkflow = null; }, 30000);
        return { success: false, error: err.message };
    }
}

module.exports = { setSocketIO, runPipeline, getWorkflowStatus };
