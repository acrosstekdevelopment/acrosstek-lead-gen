const mongoose = require('mongoose');

const scraperStateSchema = new mongoose.Schema({
    scraperName: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['job', 'funding', 'extension'], required: true },
    lastRunAt: { type: Date, default: null },
    lastRunSuccess: { type: Boolean, default: null },
    isRunning: { type: Boolean, default: false }
});

/**
 * Check if scraper is within cooldown period (2 hours after a successful run).
 * Failed runs do not trigger cooldown.
 */
scraperStateSchema.methods.isOnCooldown = function () {
    if (!this.lastRunAt || this.lastRunSuccess === false) return false;
    const twoHoursMs = 2 * 60 * 60 * 1000;
    return (Date.now() - this.lastRunAt.getTime()) < twoHoursMs;
};

scraperStateSchema.methods.getCooldownRemaining = function () {
    if (!this.isOnCooldown()) return 0;
    const twoHoursMs = 2 * 60 * 60 * 1000;
    return twoHoursMs - (Date.now() - this.lastRunAt.getTime());
};

module.exports = mongoose.model('ScraperState', scraperStateSchema);
