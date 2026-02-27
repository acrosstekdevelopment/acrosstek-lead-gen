const mongoose = require('mongoose');

const EMPLOYEE_STATUSES = ['NEW', 'EMAIL_FOUND', 'EMAIL_ERROR', 'EMAIL_UNKNOWN', 'ERROR'];

const employee2bSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    companyName: { type: String, required: true },
    fundingAmount: { type: String, default: 'empty' },
    fundingStage: { type: String, default: 'empty' },
    employeeId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, default: 'empty' },
    lastName: { type: String, default: 'empty' },
    employeeTitle: { type: String, default: 'empty' },
    employeeLinkedinUrl: { type: String, default: 'empty' },
    emailId: { type: String, default: '' },
    status: { type: String, enum: EMPLOYEE_STATUSES, default: 'NEW' },
    dateAdded: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Employee2b', employee2bSchema);
