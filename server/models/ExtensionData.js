const mongoose = require('mongoose');

const extensionDataSchema = new mongoose.Schema({
    extensionName: { type: String, required: true, index: true },
    data: { type: Array, default: [] },
    receivedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ExtensionData', extensionDataSchema);
