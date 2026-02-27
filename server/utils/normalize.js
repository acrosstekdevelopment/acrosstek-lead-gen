/**
 * Normalizes a string: lowercase, collapse multiple spaces to single, trim leading/trailing.
 */
function normalizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

module.exports = { normalizeString };
