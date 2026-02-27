const mongoose = require('mongoose');

const rateLimitStateSchema = new mongoose.Schema({
    service: { type: String, required: true, unique: true, index: true },
    dailyUsageCount: { type: Number, default: 0 },
    minuteUsageCount: { type: Number, default: 0 },
    lastResetAt: { type: Date, default: Date.now },
    lastMinuteReset: { type: Date, default: Date.now },
    pausedUntil: { type: Date, default: null }
});

module.exports = mongoose.model('RateLimitState', rateLimitStateSchema);
