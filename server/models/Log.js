const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    message: { type: String, required: true },
    level: { type: String, enum: ['info', 'success', 'error', 'warning'], default: 'info' },
    step: { type: Number, default: null },
    scraperName: { type: String, default: null },
    timestamp: { type: Date, default: Date.now }
});

logSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Log', logSchema);
