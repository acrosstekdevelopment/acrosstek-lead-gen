const fs = require('fs');
const path = require('path');

const FILTERS_PATH = path.resolve(__dirname, '../../job_filters.txt');

let cachedFilters = null;

/**
 * Parses the JOB TITLES section of job_filters.txt into a Set of lowercase title strings.
 * Only the actual job title lines are extracted (skips headers, blank lines, category numbers).
 */
function loadFilters() {
    if (cachedFilters) return cachedFilters;

    const content = fs.readFileSync(FILTERS_PATH, 'utf-8');
    const lines = content.split('\n');

    // Find the "JOB TITLES" section
    let inJobTitles = false;
    const titles = new Set();

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === 'JOB TITLES') {
            inJobTitles = true;
            continue;
        }

        if (!inJobTitles) continue;

        // Skip empty lines, section headers (numbered like "1. Front-End..."), and sub-headers
        if (!trimmed) continue;
        if (/^\d+\.\s/.test(trimmed)) continue;
        if (trimmed.startsWith('Manual QA') && trimmed === 'Manual QA') {
            // "Manual QA" is actually a sub-header AND a valid title pattern; include it
            titles.add(trimmed.toLowerCase());
            continue;
        }
        if (trimmed.startsWith('Automation QA') && trimmed === 'Automation QA') {
            titles.add(trimmed.toLowerCase());
            continue;
        }

        // Valid job title line
        titles.add(trimmed.toLowerCase());
    }

    cachedFilters = titles;
    return titles;
}

/**
 * Checks if a job title matches any of the filters.
 * Both incoming title and filters are lowercased.
 * Uses substring matching — the incoming title must CONTAIN one of the filter titles.
 */
function matchesFilter(incomingTitle) {
    if (!incomingTitle) return false;
    const filters = loadFilters();
    const lower = incomingTitle.toLowerCase().trim();

    for (const filter of filters) {
        if (lower.includes(filter)) return true;
    }
    return false;
}

/**
 * Force reload filters (useful if file changes at runtime).
 */
function reloadFilters() {
    cachedFilters = null;
    return loadFilters();
}

module.exports = { loadFilters, matchesFilter, reloadFilters };
