const RateLimitState = require('../models/RateLimitState');

/**
 * Rate limits per service (from rate_limits.txt + domain_generation_plan.txt):
 *  - google_cse: 100 searches/day (shared between Step 4 and Step 6)
 *  - apify: 50 runs/day, 2 runs/minute
 *  - snov: 750 persons/day
 *  - google_sheets: 60 writes/min per user
 */
const LIMITS = {
    google_cse: { daily: 100, perMinute: null, pauseDurationMs: 24 * 60 * 60 * 1000 },
    apify: { daily: 50, perMinute: 2, pauseDurationMs: 24 * 60 * 60 * 1000 },
    snov: { daily: 750, perMinute: null, pauseDurationMs: 24 * 60 * 60 * 1000 },
    google_sheets: { daily: null, perMinute: 60, pauseDurationMs: 60 * 1000 }
};

async function getOrCreate(service) {
    let state = await RateLimitState.findOne({ service });
    if (!state) {
        state = await RateLimitState.create({ service });
    }
    return state;
}

function shouldResetDaily(state) {
    const oneDayMs = 24 * 60 * 60 * 1000;
    return (Date.now() - state.lastResetAt.getTime()) >= oneDayMs;
}

function shouldResetMinute(state) {
    return (Date.now() - state.lastMinuteReset.getTime()) >= 60 * 1000;
}

/**
 * Check if we can make a request to this service.
 * Returns { allowed: boolean, reason: string }
 */
async function canMakeRequest(service) {
    const limits = LIMITS[service];
    if (!limits) return { allowed: true, reason: 'No limits configured' };

    const state = await getOrCreate(service);

    // Check if service is paused
    if (state.pausedUntil && Date.now() < state.pausedUntil.getTime()) {
        const remainMs = state.pausedUntil.getTime() - Date.now();
        return { allowed: false, reason: `Service paused for ${Math.ceil(remainMs / 60000)} more minutes` };
    }

    // Reset daily counter if 24h has passed
    if (shouldResetDaily(state)) {
        state.dailyUsageCount = 0;
        state.lastResetAt = new Date();
        state.pausedUntil = null;
    }

    // Reset minute counter if 1 min has passed
    if (shouldResetMinute(state)) {
        state.minuteUsageCount = 0;
        state.lastMinuteReset = new Date();
    }

    // Check daily limit
    if (limits.daily && state.dailyUsageCount >= limits.daily) {
        // Auto-pause for 24h
        state.pausedUntil = new Date(Date.now() + limits.pauseDurationMs);
        await state.save();
        return { allowed: false, reason: `Daily limit of ${limits.daily} reached. Paused for 24h.` };
    }

    // Check per-minute limit
    if (limits.perMinute && state.minuteUsageCount >= limits.perMinute) {
        return { allowed: false, reason: `Per-minute limit of ${limits.perMinute} reached. Wait ~1 minute.` };
    }

    await state.save();
    return { allowed: true, reason: 'OK' };
}

/**
 * Record that we made a request to this service.
 */
async function recordRequest(service) {
    const state = await getOrCreate(service);

    if (shouldResetDaily(state)) {
        state.dailyUsageCount = 0;
        state.lastResetAt = new Date();
    }
    if (shouldResetMinute(state)) {
        state.minuteUsageCount = 0;
        state.lastMinuteReset = new Date();
    }

    state.dailyUsageCount += 1;
    state.minuteUsageCount += 1;
    await state.save();
}

/**
 * Manually pause a service for a given duration.
 */
async function pauseService(service, durationMs) {
    const state = await getOrCreate(service);
    state.pausedUntil = new Date(Date.now() + durationMs);
    await state.save();
}

/**
 * Get remaining daily quota for a service.
 */
async function getRemainingQuota(service) {
    const limits = LIMITS[service];
    if (!limits || !limits.daily) return null;

    const state = await getOrCreate(service);
    if (shouldResetDaily(state)) return limits.daily;
    return Math.max(0, limits.daily - state.dailyUsageCount);
}

module.exports = { canMakeRequest, recordRequest, pauseService, getRemainingQuota, LIMITS };
