const axios = require('axios');
const Company1a = require('../models/Company1a');
const Company1b = require('../models/Company1b');
const rateLimitService = require('./rateLimitService');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const CSE_URL = 'https://www.googleapis.com/customsearch/v1';
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;
const SEARCH_ENGINE_API_KEY = process.env.SEARCH_ENGINE_API_KEY;

/**
 * Step 6a: Find company website domain using Google CSE.
 * Per domain_generation_plan.txt — Google CSE only, no Snov.
 */

// Domains to exclude from results
const EXCLUDED_DOMAINS = new Set([
    'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
    'instagram.com', 'youtube.com', 'crunchbase.com',
    'glassdoor.com', 'wikipedia.org', 'github.com',
    'medium.com', 'reddit.com', 'bloomberg.com',
    'indeed.com', 'wellfound.com', 'angel.co'
]);

/**
 * Build domain search query.
 */
function buildDomainQuery(companyName) {
    return `"${companyName}" official website -site:linkedin.com -site:facebook.com -site:twitter.com -site:instagram.com -site:youtube.com -site:crunchbase.com -site:glassdoor.com -site:wikipedia.org`;
}

/**
 * Extract root domain from a URL.
 */
function extractRootDomain(url) {
    try {
        const parsed = new URL(url);
        let hostname = parsed.hostname.replace(/^www\./, '');
        return hostname;
    } catch {
        return null;
    }
}

/**
 * Check if a domain should be excluded.
 */
function isExcludedDomain(domain) {
    if (!domain) return true;
    for (const excluded of EXCLUDED_DOMAINS) {
        if (domain === excluded || domain.endsWith(`.${excluded}`)) return true;
    }
    return false;
}

/**
 * Search for company domain via Google CSE.
 * @returns {string|null} The company domain or null
 */
async function searchCompanyDomain(companyName) {
    const query = buildDomainQuery(companyName);

    const response = await axios.get(CSE_URL, {
        params: {
            q: query,
            cx: SEARCH_ENGINE_ID,
            key: SEARCH_ENGINE_API_KEY,
            num: 3
        },
        timeout: 30000
    });

    const items = response.data?.items || [];

    for (const item of items) {
        const domain = extractRootDomain(item.link);
        if (domain && !isExcludedDomain(domain)) {
            return domain;
        }
    }

    return null;
}

/**
 * Check if error is a rate limit error.
 */
function isRateLimitError(error) {
    if (error.response) {
        const status = error.response.status;
        if (status === 429) return true;
        if (status === 403) {
            const msg = JSON.stringify(error.response.data || '').toLowerCase();
            if (msg.includes('quota') || msg.includes('rate') || msg.includes('limit')) return true;
        }
    }
    return false;
}

/**
 * Find and cache domain for a single company.
 * @returns {{ domain: string|null, rateLimited: boolean, error: string|null }}
 */
async function findDomainForCompany(company, logFn) {
    // Check if domain is already cached
    if (company.companyDomain) {
        return { domain: company.companyDomain, rateLimited: false, error: null };
    }

    // Check rate limit
    const { allowed, reason } = await rateLimitService.canMakeRequest('google_cse');
    if (!allowed) {
        if (logFn) logFn(`Step 6: Google CSE rate limit for domain search. ${reason}`, 'warning', 6);
        return { domain: null, rateLimited: true, error: reason };
    }

    try {
        await rateLimitService.recordRequest('google_cse');
        const domain = await searchCompanyDomain(company.companyName);

        if (domain) {
            company.companyDomain = domain;
            await company.save();
            if (logFn) logFn(`Step 6: Domain found for ${company.companyName}: ${domain}`, 'success', 6);
            return { domain, rateLimited: false, error: null };
        } else {
            if (logFn) logFn(`Step 6: No domain found for ${company.companyName}`, 'error', 6);
            return { domain: null, rateLimited: false, error: 'No domain found' };
        }
    } catch (err) {
        if (isRateLimitError(err)) {
            await rateLimitService.pauseService('google_cse', 24 * 60 * 60 * 1000);
            if (logFn) logFn(`Step 6: Google CSE rate limit hit. Paused for 24 hours.`, 'warning', 6);
            return { domain: null, rateLimited: true, error: 'Rate limit hit' };
        }
        if (logFn) logFn(`Step 6: Domain search error for ${company.companyName}: ${err.message}`, 'error', 6);
        return { domain: null, rateLimited: false, error: err.message };
    }
}

module.exports = { findDomainForCompany, searchCompanyDomain };
