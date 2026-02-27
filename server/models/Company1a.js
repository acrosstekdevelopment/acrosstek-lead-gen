const mongoose = require('mongoose');

const COMPANY_STATUSES = ['NEW', 'LINKEDIN_FOUND', 'EMPLOYEES_SCRAPED', 'EMAILS_ENRICHED', 'EMAIL_ERROR', 'ERROR'];

const company1aSchema = new mongoose.Schema({
    companyId: { type: String, required: true, unique: true, index: true },
    companyName: { type: String, required: true },
    companyLocation: { type: String, default: 'empty' },
    source: { type: String, default: 'empty' },
    title: { type: String, default: 'empty' },
    jobUrl: { type: String, default: 'empty' },
    status: { type: String, enum: COMPANY_STATUSES, default: 'NEW' },
    companyLinkedinUrl: { type: String, default: '' },
    companyDomain: { type: String, default: '' },
    dateAdded: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Company1a', company1aSchema);
