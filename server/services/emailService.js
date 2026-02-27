const axios = require('axios');
const Company1a = require('../models/Company1a');
const Company1b = require('../models/Company1b');
const Employee2a = require('../models/Employee2a');
const Employee2b = require('../models/Employee2b');
const rateLimitService = require('./rateLimitService');
const domainService = require('./domainService');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const SNOV_CLIENT_ID = process.env.SNOV_CLIENT_ID;
const SNOV_CLIENT_SECRET = process.env.SNOV_CLIENT_SECRET;

let snovAccessToken = null;
let tokenExpiresAt = 0;

/**
 * Step 6b: Find emails for employees using Snov.io API.
 */

// ─── AUTH ─────────────────────────────────────────────────────────

async function getSnovToken() {
    if (snovAccessToken && Date.now() < tokenExpiresAt) {
        return snovAccessToken;
    }

    const response = await axios.post('https://api.snov.io/v1/oauth/access_token', {
        grant_type: 'client_credentials',
        client_id: SNOV_CLIENT_ID,
        client_secret: SNOV_CLIENT_SECRET
    }, { timeout: 30000 });

    snovAccessToken = response.data.access_token;
    // Token lasts 1 hour, refresh at 50 minutes
    tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    return snovAccessToken;
}

// ─── EMAIL SEARCH (Snov v2 API) ─────────────────────────────────

/**
 * Start an async email search via Snov v2 API.
 * Docs: POST /v2/emails-by-domain-by-name/start
 * Auth: Bearer token in header
 * Body: { rows: [{ first_name, last_name, domain }] }
 * Returns: { data: { task_hash: "..." }, meta: { rows: [...] } }
 */
async function startEmailSearch(firstName, lastName, domain) {
    const token = await getSnovToken();

    const response = await axios.post('https://api.snov.io/v2/emails-by-domain-by-name/start', {
        rows: [
            { first_name: firstName, last_name: lastName, domain }
        ]
    }, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 30000
    });

    return response.data;
}

/**
 * Poll for results of a Snov v2 email search task.
 * Docs: GET /v2/emails-by-domain-by-name/result?task_hash=...
 * Auth: Bearer token in header
 * Returns: { status: "completed"|"in_progress", data: [{ people, result: [{email,...}] }] }
 */
async function getEmailSearchResult(taskHash) {
    const token = await getSnovToken();

    const response = await axios.get('https://api.snov.io/v2/emails-by-domain-by-name/result', {
        params: { task_hash: taskHash },
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 30000
    });

    return response.data;
}

// ─── SNOV OUTPUT CLASSIFICATION ──────────────────────────────────

/**
 * Classify a single email result per product_description.txt rules.
 * Snov v2 result object: { email, smtp_status, is_valid_format, is_disposable, is_webmail, is_gibberish, unknown_status_reason }
 * Returns: { email, status, score }
 */
function classifyEmail(emailResult) {
    const email = emailResult.email || '';
    const smtpStatus = emailResult.smtp_status || '';
    const isValidFormat = emailResult.is_valid_format;
    const isDisposable = emailResult.is_disposable;
    const unknownReason = emailResult.unknown_status_reason || '';

    // a. smtp_status = valid → EMAIL_FOUND immediately
    if (smtpStatus === 'valid') {
        return { email, status: 'EMAIL_FOUND', score: 100 };
    }

    // smtp_status = unknown → check further conditions
    if (smtpStatus === 'unknown') {
        // b. is_valid_format = false → EMAIL_ERROR
        if (isValidFormat === false) {
            return { email: '', status: 'EMAIL_ERROR', score: 0 };
        }

        // c. is_disposable = true → EMAIL_ERROR
        if (isDisposable === true) {
            return { email: '', status: 'EMAIL_ERROR', score: 0 };
        }

        // d. Check unknown_status_reason
        switch (unknownReason) {
            case 'banned':
                return { email, status: 'EMAIL_UNKNOWN', score: 30 };
            case 'catchall':
                return { email, status: 'EMAIL_FOUND', score: 70 };
            case 'connection_error':
                return { email, status: 'EMAIL_FOUND', score: 60 };
            case 'greylist':
                return { email, status: 'EMAIL_FOUND', score: 65 };
            default:
                return { email, status: 'EMAIL_ERROR', score: 0 };
        }
    }

    // Any other smtp_status → EMAIL_ERROR
    return { email: '', status: 'EMAIL_ERROR', score: 0 };
}

/**
 * Handle multi-email comparison per product_description.txt rules.
 * Returns the best classified email result.
 */
function selectBestEmail(emailResults) {
    if (!emailResults || emailResults.length === 0) {
        return { email: '', status: 'EMAIL_ERROR', score: 0 };
    }

    if (emailResults.length === 1) {
        return classifyEmail(emailResults[0]);
    }

    const classified = emailResults.map(e => classifyEmail(e));

    // Pick the one with highest score
    const valid = classified.filter(c => c.score === 100);
    if (valid.length > 0) return valid[0];

    const nonDisposable = classified.filter((c, i) => {
        return emailResults[i].is_disposable !== true;
    });

    if (nonDisposable.length === 0) {
        return { email: '', status: 'EMAIL_ERROR', score: 0 };
    }
    if (nonDisposable.length === 1) return nonDisposable[0];

    const validFormat = nonDisposable.filter(c => c.status !== 'EMAIL_ERROR');
    if (validFormat.length === 0) {
        return { email: '', status: 'EMAIL_ERROR', score: 0 };
    }

    return validFormat[0];
}

// ─── POLLING ─────────────────────────────────────────────────────

/**
 * Start a Snov v2 email search and poll for results.
 * Flow: POST /start → get task_hash → GET /result?task_hash= poll until completed.
 */
async function pollForEmailResult(firstName, lastName, domain, logFn, maxPolls = 6) {
    try {
        // Step 1: Start the async task
        const startResult = await startEmailSearch(firstName, lastName, domain);

        if (logFn) logFn(`Step 6: Snov start response for ${firstName} ${lastName}: ${JSON.stringify(startResult)}`, 'info', 6);

        const taskHash = startResult?.data?.task_hash;
        if (!taskHash) {
            const errMsg = `No task_hash from Snov. Response: ${JSON.stringify(startResult)}`;
            if (logFn) logFn(`Step 6: ${errMsg}`, 'error', 6);
            return { success: false, emails: [], error: errMsg };
        }

        if (logFn) logFn(`Step 6: Snov task started (task_hash: ${taskHash}) for ${firstName} ${lastName}`, 'info', 6);

        // Step 2: Poll for results — wait 5 minutes between polls per spec, max ~30 min total
        for (let poll = 0; poll < maxPolls; poll++) {
            await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes

            const pollResult = await getEmailSearchResult(taskHash);
            const status = pollResult?.status || '';

            if (logFn) logFn(`Step 6: Snov poll #${poll + 1} status=${status} for ${firstName} ${lastName}`, 'info', 6);

            if (status === 'in_progress') {
                continue;
            }

            if (status === 'not_enough_credits') {
                if (logFn) logFn(`Step 6: Snov out of credits!`, 'error', 6);
                return { success: false, emails: [], error: 'Snov: not enough credits' };
            }

            if (status === 'completed') {
                // data is: [{ people: "John Doe", result: [{email, smtp_status,...}] }]
                const dataArray = pollResult?.data || [];
                // For single-person lookup, take the first entry's result array
                const personResult = dataArray[0]?.result || [];

                if (logFn) logFn(`Step 6: Snov found ${personResult.length} email(s) for ${firstName} ${lastName}: ${JSON.stringify(personResult)}`, 'info', 6);

                return { success: true, emails: personResult, error: null };
            }

            // Unknown status — log and treat as done with no results
            if (logFn) logFn(`Step 6: Snov unexpected status="${status}" for ${firstName} ${lastName}: ${JSON.stringify(pollResult)}`, 'warning', 6);
            return { success: false, emails: [], error: `Unexpected Snov status: ${status}` };
        }

        return { success: false, emails: [], error: 'Snov polling timed out after max retries' };

    } catch (err) {
        const errMsg = err.response?.data
            ? JSON.stringify(err.response.data)
            : err.message;
        if (logFn) logFn(`Step 6: Snov API error for ${firstName} ${lastName}: ${errMsg}`, 'error', 6);
        return { success: false, emails: [], error: errMsg };
    }
}


// ─── MAIN PROCESSING ─────────────────────────────────────────────

/**
 * Process a single employee for email enrichment.
 */
async function processEmployeeEmail(employee, company, logFn) {
    // Get domain for company
    const domainResult = await domainService.findDomainForCompany(company, logFn);

    if (domainResult.rateLimited) {
        return { processed: false, rateLimited: true };
    }

    if (!domainResult.domain) {
        employee.status = 'EMAIL_ERROR';
        await employee.save();
        return { processed: true, rateLimited: false };
    }

    // Check Snov rate limit
    const { allowed, reason } = await rateLimitService.canMakeRequest('snov');
    if (!allowed) {
        if (logFn) logFn(`Step 6: Snov rate limit reached. ${reason}`, 'warning', 6);
        return { processed: false, rateLimited: true };
    }

    await rateLimitService.recordRequest('snov');

    const pollResult = await pollForEmailResult(
        employee.firstName,
        employee.lastName,
        domainResult.domain,
        logFn
    );

    if (!pollResult.success) {
        employee.status = 'EMAIL_ERROR';
        await employee.save();
        if (logFn) logFn(`Step 6: Email search failed for ${employee.firstName} ${employee.lastName}: ${pollResult.error}`, 'error', 6);
        return { processed: true, rateLimited: false };
    }

    const best = selectBestEmail(pollResult.emails);
    employee.emailId = best.email;
    employee.status = best.status;
    await employee.save();

    if (best.status === 'EMAIL_FOUND') {
        if (logFn) logFn(`Step 6: Email found for ${employee.firstName} ${employee.lastName}: ${best.email}`, 'success', 6);
    } else {
        if (logFn) logFn(`Step 6: Email status=${best.status} for ${employee.firstName} ${employee.lastName}`, 'info', 6);
    }

    return { processed: true, rateLimited: false };
}

/**
 * Process all NEW employees grouped by company.
 * Updates company status in Table 1a/1b after processing all employees.
 */
async function processTable(CompanyModel, EmployeeModel, tableType, logFn) {
    // Get all companies with EMPLOYEES_SCRAPED status
    const companies = await CompanyModel.find({ status: 'EMPLOYEES_SCRAPED' });
    let totalProcessed = 0, totalEmailsFound = 0, totalErrors = 0;
    let rateLimited = false;

    for (const company of companies) {
        const employees = await EmployeeModel.find({ companyId: company.companyId, status: 'NEW' });

        if (employees.length === 0) {
            // No NEW employees, but company is EMPLOYEES_SCRAPED — update to EMAILS_ENRICHED
            company.status = 'EMAILS_ENRICHED';
            await company.save();
            continue;
        }

        let companyEmailsFound = 0;
        let companyErrors = 0;

        for (const employee of employees) {
            const result = await processEmployeeEmail(employee, company, logFn);

            if (result.rateLimited) {
                rateLimited = true;
                break;
            }

            if (result.processed) {
                totalProcessed++;
                const refreshed = await EmployeeModel.findById(employee._id);
                if (refreshed.status === 'EMAIL_FOUND') {
                    companyEmailsFound++;
                    totalEmailsFound++;
                } else if (refreshed.status === 'EMAIL_ERROR' || refreshed.status === 'ERROR') {
                    companyErrors++;
                    totalErrors++;
                }
            }
        }

        if (rateLimited) break;

        // Update company status based on results
        const allEmployees = await EmployeeModel.find({ companyId: company.companyId });
        const allProcessed = allEmployees.every(e => e.status !== 'NEW');

        if (allProcessed) {
            const anySuccess = allEmployees.some(e => e.status === 'EMAIL_FOUND' || e.status === 'EMAIL_UNKNOWN');
            if (anySuccess) {
                company.status = 'EMAILS_ENRICHED';
            } else {
                // All employees failed
                company.status = 'ERROR';
            }
            await company.save();
            if (logFn) logFn(`Step 6: Company ${company.companyName} status → ${company.status}`, 'info', 6);
        }
    }

    return { totalProcessed, totalEmailsFound, totalErrors, rateLimited };
}

async function processTable2a(logFn) {
    return processTable(Company1a, Employee2a, '2a', logFn);
}

async function processTable2b(logFn) {
    return processTable(Company1b, Employee2b, '2b', logFn);
}

module.exports = { processTable2a, processTable2b, classifyEmail, selectBestEmail };
