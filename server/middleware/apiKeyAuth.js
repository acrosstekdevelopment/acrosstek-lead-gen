const ApiKey = require('../models/ApiKey');

/**
 * Middleware to authenticate chrome extension API requests.
 * Expects header: x-api-key
 */
async function apiKeyAuth(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key) {
        return res.status(401).json({ error: 'Missing API key. Provide x-api-key header.' });
    }

    try {
        const record = await ApiKey.findOne({ apiKey: key });
        if (!record) {
            return res.status(403).json({ error: 'Invalid API key.' });
        }
        req.extensionName = record.extensionName;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'API key validation error.' });
    }
}

module.exports = apiKeyAuth;
