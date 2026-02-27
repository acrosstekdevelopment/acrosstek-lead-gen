const mongoose = require('mongoose');

const COMPANY_STATUSES = ['NEW', 'LINKEDIN_FOUND', 'EMPLOYEES_SCRAPED', 'EMAILS_ENRICHED', 'EMAIL_ERROR', 'ERROR'];

const company1bSchema = new mongoose.Schema({
    companyId: { type: String, required: true, unique: true, index: true },
    companyName: { type: String, required: true },
    newsTitle: { type: String, default: 'empty' },
    source: { type: String, default: 'empty' },
    fundingAmount: { type: String, default: 'empty' },
    fundingStage: { type: String, default: 'empty' },
    dateAdded: { type: Date, default: Date.now },
    companyLinkedinUrl: { type: String, default: '' },
    companyDomain: { type: String, default: '' },
    status: { type: String, enum: COMPANY_STATUSES, default: 'NEW' }
});

module.exports = mongoose.model('Company1b', company1bSchema);
