const axios = require('axios');
const Company1a = require('../models/Company1a');
const Company1b = require('../models/Company1b');
const Employee2a = require('../models/Employee2a');
const Employee2b = require('../models/Employee2b');
const rateLimitService = require('./rateLimitService');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const APIFY_API_KEY = process.env.APIFY_API_KEY;
// Apify actor from: https://console.apify.com/actors/Vb6LZkh4EqRlR0Ka9
const APIFY_ACTOR_ID = 'Vb6LZkh4EqRlR0Ka9';
const APIFY_BASE_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs`;

/**
 * Step 5: Find employees for companies using Apify.
 * Processes companies with status=LINKEDIN_FOUND in Table 1a and 1b.
 */

/**
 * Build the Apify input payload.
 * harvestapi actor accepts: company (LinkedIn URL), count, jobTitles
 */
function buildApifyInput(companyLinkedinUrl) {
    return {
        companies: [companyLinkedinUrl],
        profileScraperMode: 'Short ($4 per 1k)',
        maxItems: 25,
        jobTitles: [
            'CEO', 'Founder', 'CTO',
            'Head of Engineering', 'VP of Engineering',
            'Director of Engineering', 'Senior Director of Engineering',
            'SVP of Engineering', 'Head of Tech',
            'Chief Architect', 'Principal Architect',
            'Engineering Manager', 'Global Head of Engineering',
            'Product Head', 'Global Head of Product',
            'Head of AI', 'Head of GenAI', 'Head AI ML',
            'Managing Director – AI & Data', 'Chief of Staff'
        ],
        startPage: 1
    };
}


/**
 * Run Apify actor and wait for results.
 */
async function runApifyActor(companyLinkedinUrl) {
    const input = buildApifyInput(companyLinkedinUrl);

    // Start the actor run
    const runResponse = await axios.post(
        `${APIFY_BASE_URL}?token=${APIFY_API_KEY}`,
        input,
        { timeout: 120000 }
    );

    const runId = runResponse.data?.data?.id;
    if (!runId) {
        throw new Error('Failed to start Apify actor run: No run ID returned');
    }

    // Wait for the run to finish (poll every 10 seconds, max 5 minutes)
    const maxWaitMs = 5 * 60 * 1000;
    const pollInterval = 10 * 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const statusResponse = await axios.get(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`,
            { timeout: 30000 }
        );

        const status = statusResponse.data?.data?.status;
        if (status === 'SUCCEEDED') {
            // Fetch dataset items
            const datasetId = statusResponse.data?.data?.defaultDatasetId;
            const dataResponse = await axios.get(
                `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_KEY}`,
                { timeout: 30000 }
            );
            return dataResponse.data || [];
        }

        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
            throw new Error(`Apify actor run ${status}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Apify actor run timed out after 5 minutes');
}

/**
 * Map Apify employee data to our schema.
 * Apify response typically contains: id, firstName, lastName, headline, profileUrl, etc.
 */
function mapEmployeeData(apifyRecord) {
    // harvestapi output fields per backend_schema.txt:
    // id → employeeId
    // firstName → firstName
    // lastName → lastName
    // currentPositions[0].title → employeeTitle
    // linkedinUrl → employeeLinkedinUrl
    const currentTitle = apifyRecord.currentPositions?.[0]?.title || '';

    return {
        employeeId: apifyRecord.id || '',
        firstName: apifyRecord.firstName || 'empty',
        lastName: apifyRecord.lastName || 'empty',
        employeeTitle: currentTitle || apifyRecord.headline || apifyRecord.title || 'empty',
        employeeLinkedinUrl: apifyRecord.linkedinUrl || apifyRecord.profileUrl || 'empty'
    };
}

/**
 * Process a single company: run Apify and store employees.
 * Dedup: only LINKEDIN_FOUND companies are queried, and status always
 * changes to EMPLOYEES_SCRAPED or ERROR after this runs.
 */
async function processCompanyEmployees(company, tableType, logFn) {
    const EmployeeModel = tableType === '1a' ? Employee2a : Employee2b;

    try {
        const employees = await runApifyActor(company.companyLinkedinUrl);

        if (!employees || employees.length === 0) {
            company.status = 'ERROR';
            await company.save();
            if (logFn) logFn(`Step 5: Apify returned no employees for ${company.companyName}`, 'error', 5);
            return { added: 0, error: 'No employees found' };
        }

        let added = 0;
        for (const emp of employees) {
            const mapped = mapEmployeeData(emp);

            if (!mapped.employeeId) continue;

            // Check if employee already exists in THIS table
            const exists = await EmployeeModel.findOne({ employeeId: mapped.employeeId });
            if (exists) continue;

            const employeeData = {
                companyId: company.companyId,
                companyName: company.companyName,
                employeeId: mapped.employeeId,
                firstName: mapped.firstName,
                lastName: mapped.lastName,
                employeeTitle: mapped.employeeTitle,
                employeeLinkedinUrl: mapped.employeeLinkedinUrl,
                emailId: '',
                status: 'NEW',
                dateAdded: new Date()
            };

            // Add table-specific fields
            if (tableType === '1a') {
                employeeData.jobTitle = company.title || 'empty';
            } else {
                employeeData.fundingAmount = company.fundingAmount || 'empty';
                employeeData.fundingStage = company.fundingStage || 'empty';
            }

            await EmployeeModel.create(employeeData);
            added++;
        }

        company.status = 'EMPLOYEES_SCRAPED';
        await company.save();
        if (logFn) logFn(`Step 5: Added ${added} employees for ${company.companyName}`, 'success', 5);
        return { added, error: null };

    } catch (err) {
        company.status = 'ERROR';
        await company.save();
        if (logFn) logFn(`Step 5: Apify error for ${company.companyName}: ${err.message}`, 'error', 5);
        return { added: 0, error: err.message };
    }
}

/**
 * Process all LINKEDIN_FOUND companies in Table 1a.
 */
async function processTable1a(logFn) {
    const companies = await Company1a.find({ status: 'LINKEDIN_FOUND' });
    let totalAdded = 0, errors = 0, rateLimited = false;

    for (const company of companies) {
        const { allowed, reason } = await rateLimitService.canMakeRequest('apify');
        if (!allowed) {
            if (logFn) logFn(`Step 5: Apify rate limit reached. ${reason}`, 'warning', 5);
            rateLimited = true;
            break;
        }

        await rateLimitService.recordRequest('apify');
        const result = await processCompanyEmployees(company, '1a', logFn);
        totalAdded += result.added;
        if (result.error) errors++;

        // Respect per-minute limit: wait if needed
        const minuteCheck = await rateLimitService.canMakeRequest('apify');
        if (!minuteCheck.allowed && minuteCheck.reason.includes('Per-minute')) {
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }

    return { processed: companies.length, totalAdded, errors, rateLimited };
}

/**
 * Process all LINKEDIN_FOUND companies in Table 1b.
 */
async function processTable1b(logFn) {
    const companies = await Company1b.find({ status: 'LINKEDIN_FOUND' });
    let totalAdded = 0, errors = 0, rateLimited = false;

    for (const company of companies) {
        const { allowed, reason } = await rateLimitService.canMakeRequest('apify');
        if (!allowed) {
            if (logFn) logFn(`Step 5: Apify rate limit reached for Table 1b. ${reason}`, 'warning', 5);
            rateLimited = true;
            break;
        }

        await rateLimitService.recordRequest('apify');
        const result = await processCompanyEmployees(company, '1b', logFn);
        totalAdded += result.added;
        if (result.error) errors++;

        const minuteCheck = await rateLimitService.canMakeRequest('apify');
        if (!minuteCheck.allowed && minuteCheck.reason.includes('Per-minute')) {
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }

    return { processed: companies.length, totalAdded, errors, rateLimited };
}

module.exports = { processTable1a, processTable1b };
