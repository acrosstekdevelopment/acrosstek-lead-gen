const { matchesFilter } = require('../utils/jobFilters');

/**
 * Step 2: Filter job scraper / chrome extension data by matching titles
 * against job_filters.txt. Only matching records pass through.
 * 
 * NOT applied to funding scraper data.
 * 
 * @param {Array} records - Array of scraped job records
 * @returns {Array} Filtered records that match job title filters
 */
function filterJobData(records) {
    if (!Array.isArray(records)) return [];

    return records.filter(record => {
        const title = record.title || record.job_title || '';
        return matchesFilter(title);
    });
}

module.exports = { filterJobData };
