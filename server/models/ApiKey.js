const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
    extensionName: { type: String, required: true, unique: true },
    apiKey: { type: String, required: true, unique: true, index: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ApiKey', apiKeySchema);
