const axios = require('axios');
const Company1a = require('../models/Company1a');
const Company1b = require('../models/Company1b');
const rateLimitService = require('./rateLimitService');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const CSE_URL = 'https://www.googleapis.com/customsearch/v1';
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;
const SEARCH_ENGINE_API_KEY = process.env.SEARCH_ENGINE_API_KEY;

/**
 * Step 4: Find LinkedIn company URL via Google Custom Search Engine.
 * Processes all companies with status=NEW in Table 1a and 1b.
 */

/**
 * Build LinkedIn search query for a company.
 */
function buildLinkedinQuery(companyName, companyLocation) {
    if (companyLocation && companyLocation !== 'empty') {
        return `site:linkedin.com/company "${companyName}" "${companyLocation}"`;
    }
    return `site:linkedin.com/company "${companyName}"`;
}

/**
 * Extract the first LinkedIn company URL from Google CSE results.
 */
function extractLinkedinUrl(results) {
    if (!results || !results.items || results.items.length === 0) return null;

    for (const item of results.items) {
        const url = item.link || '';
        if (url.includes('linkedin.com/company')) {
            return url;
        }
    }
    return null;
}

/**
 * Search Google CSE for a single company's LinkedIn URL.
 */
async function searchLinkedin(companyName, companyLocation) {
    const query = buildLinkedinQuery(companyName, companyLocation);

    const response = await axios.get(CSE_URL, {
        params: {
            q: query,
            cx: SEARCH_ENGINE_ID,
            key: SEARCH_ENGINE_API_KEY,
            num: 5
        },
        timeout: 30000
    });

    return extractLinkedinUrl(response.data);
}

/**
 * Check if error is a rate limit error.
 */
function isRateLimitError(error) {
    if (error.response) {
        const status = error.response.status;
        if (status === 429) return true;
        // Google also returns 403 for quota exceeded
        if (status === 403) {
            const msg = JSON.stringify(error.response.data || '').toLowerCase();
            if (msg.includes('quota') || msg.includes('rate') || msg.includes('limit')) return true;
        }
    }
    return false;
}

/**
 * Process all NEW companies in Table 1a for LinkedIn lookup.
 * @returns {{ processed: number, found: number, errors: number, rateLimited: boolean }}
 */
async function processTable1a(logFn) {
    const companies = await Company1a.find({ status: 'NEW' });
    let found = 0, errors = 0, rateLimited = false;

    for (const company of companies) {
        // Check rate limit
        const { allowed, reason } = await rateLimitService.canMakeRequest('google_cse');
        if (!allowed) {
            if (logFn) logFn(`Step 4: Google CSE rate limit reached. ${reason}. Queuing remaining companies.`, 'warning', 4);
            rateLimited = true;
            break;
        }

        try {
            await rateLimitService.recordRequest('google_cse');
            const linkedinUrl = await searchLinkedin(company.companyName, company.companyLocation);

            if (linkedinUrl) {
                company.companyLinkedinUrl = linkedinUrl;
                company.status = 'LINKEDIN_FOUND';
                await company.save();
                found++;
                if (logFn) logFn(`Step 4: LinkedIn found for ${company.companyName}: ${linkedinUrl}`, 'success', 4);
            } else {
                company.status = 'ERROR';
                await company.save();
                errors++;
                if (logFn) logFn(`Step 4: No LinkedIn URL found for ${company.companyName}`, 'error', 4);
            }
        } catch (err) {
            if (isRateLimitError(err)) {
                if (logFn) logFn(`Step 4: Google CSE rate limit hit. Pausing for 24 hours.`, 'warning', 4);
                await rateLimitService.pauseService('google_cse', 24 * 60 * 60 * 1000);
                rateLimited = true;
                break;
            }

            company.status = 'ERROR';
            await company.save();
            errors++;
            if (logFn) logFn(`Step 4: Error searching LinkedIn for ${company.companyName}: ${err.message}`, 'error', 4);
        }
    }

    return { processed: companies.length, found, errors, rateLimited };
}

/**
 * Process all NEW companies in Table 1b for LinkedIn lookup.
 */
async function processTable1b(logFn) {
    const companies = await Company1b.find({ status: 'NEW' });
    let found = 0, errors = 0, rateLimited = false;

    for (const company of companies) {
        const { allowed, reason } = await rateLimitService.canMakeRequest('google_cse');
        if (!allowed) {
            if (logFn) logFn(`Step 4: Google CSE rate limit reached for Table 1b. ${reason}`, 'warning', 4);
            rateLimited = true;
            break;
        }

        try {
            await rateLimitService.recordRequest('google_cse');
            const linkedinUrl = await searchLinkedin(company.companyName, null);

            if (linkedinUrl) {
                company.companyLinkedinUrl = linkedinUrl;
                company.status = 'LINKEDIN_FOUND';
                await company.save();
                found++;
                if (logFn) logFn(`Step 4: LinkedIn found for ${company.companyName}: ${linkedinUrl}`, 'success', 4);
            } else {
                company.status = 'ERROR';
                await company.save();
                errors++;
                if (logFn) logFn(`Step 4: No LinkedIn URL found for ${company.companyName}`, 'error', 4);
            }
        } catch (err) {
            if (isRateLimitError(err)) {
                await rateLimitService.pauseService('google_cse', 24 * 60 * 60 * 1000);
                rateLimited = true;
                break;
            }
            company.status = 'ERROR';
            await company.save();
            errors++;
            if (logFn) logFn(`Step 4: Error for ${company.companyName}: ${err.message}`, 'error', 4);
        }
    }

    return { processed: companies.length, found, errors, rateLimited };
}

module.exports = { processTable1a, processTable1b };
