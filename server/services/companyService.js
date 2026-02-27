const Company1a = require('../models/Company1a');
const Company1b = require('../models/Company1b');
const { normalizeString } = require('../utils/normalize');
const { generateCompanyId } = require('../utils/companyId');

/**
 * Step 3: Store company records with deduplication.
 * 
 * For job scrapers / chrome extensions → Table 1a
 * For funding scrapers → Table 1b
 * 
 * Deduplication is across BOTH Table 1a and 1b using companyId.
 */

/**
 * Process job/extension scraper data into Table 1a.
 * @param {Array} records - Filtered scraper output records
 * @param {Function} logFn - Logging callback
 * @returns {{ added: number, discarded: number, companies: Array }}
 */
async function processJobData(records, logFn) {
    let added = 0;
    let discarded = 0;
    const addedCompanies = [];

    for (const record of records) {
        const companyName = record.company;
        const title = record.title;

        // Validate required fields: company name AND title
        if (!companyName || !title) {
            discarded++;
            continue;
        }

        const normalizedName = normalizeString(companyName);
        const normalizedLocation = normalizeString(record.location || '');
        const companyId = generateCompanyId(companyName);

        if (!companyId) {
            discarded++;
            continue;
        }

        // Check dedup across BOTH tables
        const existsIn1a = await Company1a.findOne({ companyId });
        const existsIn1b = await Company1b.findOne({ companyId });

        if (existsIn1a || existsIn1b) {
            discarded++;
            continue;
        }

        const company = await Company1a.create({
            companyId,
            companyName: normalizedName,
            companyLocation: normalizedLocation || 'empty',
            source: record.source || 'empty',
            title: title || 'empty',
            jobUrl: record.job_url || 'empty',
            status: 'NEW',
            dateAdded: new Date()
        });

        addedCompanies.push(company);
        added++;
    }

    if (logFn) {
        logFn(`Step 3: Added ${added} companies to Table 1a, discarded ${discarded}`, 'info', 3);
    }

    return { added, discarded, companies: addedCompanies };
}

/**
 * Process funding scraper data into Table 1b.
 * @param {Array} records - Funding scraper output records
 * @param {Function} logFn - Logging callback
 * @returns {{ added: number, discarded: number, companies: Array }}
 */
async function processFundingData(records, logFn) {
    let added = 0;
    let discarded = 0;
    const addedCompanies = [];

    for (const record of records) {
        const companyName = record.company;
        const fundingAmount = record.funding_amount;

        // Validate required fields: company name AND funding amount
        if (!companyName || !fundingAmount) {
            discarded++;
            continue;
        }

        const normalizedName = normalizeString(companyName);
        const companyId = generateCompanyId(companyName);

        if (!companyId) {
            discarded++;
            continue;
        }

        // Check dedup across BOTH tables
        const existsIn1a = await Company1a.findOne({ companyId });
        const existsIn1b = await Company1b.findOne({ companyId });

        if (existsIn1a || existsIn1b) {
            discarded++;
            continue;
        }

        const company = await Company1b.create({
            companyId,
            companyName: normalizedName,
            newsTitle: record.title || 'empty',
            source: record.source || 'empty',
            fundingAmount: fundingAmount || 'empty',
            fundingStage: record.funding_stage || 'empty',
            status: 'NEW',
            dateAdded: new Date()
        });

        addedCompanies.push(company);
        added++;
    }

    if (logFn) {
        logFn(`Step 3: Added ${added} companies to Table 1b, discarded ${discarded}`, 'info', 3);
    }

    return { added, discarded, companies: addedCompanies };
}

module.exports = { processJobData, processFundingData };
