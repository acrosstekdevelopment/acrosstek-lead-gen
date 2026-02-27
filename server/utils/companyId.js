const crypto = require('crypto');
const { normalizeString } = require('./normalize');

/**
 * Generates a deterministic company ID from company name.
 * Process: normalize name → MD5 hash → first 16 hex chars.
 */
function generateCompanyId(companyName) {
    const normalized = normalizeString(companyName);
    if (!normalized) return null;
    return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

module.exports = { generateCompanyId };
