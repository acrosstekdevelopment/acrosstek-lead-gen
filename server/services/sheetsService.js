const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const Company1a = require('../models/Company1a');
const Company1b = require('../models/Company1b');
const Employee2a = require('../models/Employee2a');
const Employee2b = require('../models/Employee2b');
const rateLimitService = require('./rateLimitService');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const TOKEN_PATH = path.resolve(__dirname, '../../.google_tokens.json');
const SHEET_IDS_PATH = path.resolve(__dirname, '../../.sheet_ids.json');
const REDIRECT_URI = process.env.GOOGLE_SHEETS_REDIRECT_URI || `http://localhost:${process.env.PORT || 5002}/api/sheets/auth/callback`;
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];

let oAuth2Client = null;
let sheetsApi = null;


// Load sheet IDs from file first, then fall back to .env
function loadSheetIds() {
    if (fs.existsSync(SHEET_IDS_PATH)) {
        try {
            const saved = JSON.parse(fs.readFileSync(SHEET_IDS_PATH, 'utf-8'));
            console.log('Google Sheets: Loaded saved sheet IDs');
            return saved;
        } catch (err) {
            console.error('Google Sheets: Failed to load sheet IDs:', err.message);
        }
    }
    return {
        table1a: process.env.SHEET_ID_1A || '',
        table1b: process.env.SHEET_ID_1B || '',
        table2a: process.env.SHEET_ID_2A || '',
        table2b: process.env.SHEET_ID_2B || ''
    };
}

function saveSheetIds() {
    fs.writeFileSync(SHEET_IDS_PATH, JSON.stringify(sheetIds, null, 2));
}

let sheetIds = loadSheetIds();

// Initialize auth state eagerly at module load — survives node --watch restarts
let isAuthenticated = (() => {
    if (fs.existsSync(TOKEN_PATH)) {
        try {
            const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
            // Consider authenticated if we have a refresh_token (access_token may be expired but can be refreshed)
            return !!(tokens.refresh_token);
        } catch { return false; }
    }
    return false;
})();

// ─── OAUTH2 ─────────────────────────────────────────────────────

function getOAuth2Client() {
    if (oAuth2Client) return oAuth2Client;

    oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_SHEETS_CLIENT_ID,
        process.env.GOOGLE_SHEETS_CLIENT_SECRET,
        REDIRECT_URI
    );

    // Load saved tokens
    if (fs.existsSync(TOKEN_PATH)) {
        try {
            const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
            oAuth2Client.setCredentials(tokens);
            isAuthenticated = true;
            console.log('Google Sheets: Loaded saved OAuth2 tokens ✓');
        } catch (err) {
            console.error('Google Sheets: Failed to load saved tokens:', err.message);
        }
    }

    // Auto-save refreshed tokens
    oAuth2Client.on('tokens', (tokens) => {
        const existing = fs.existsSync(TOKEN_PATH)
            ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
            : {};
        const merged = { ...existing, ...tokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
        isAuthenticated = true;
        console.log('Google Sheets: Tokens refreshed and saved ✓');
    });

    return oAuth2Client;
}

/**
 * Generate the consent URL for the user to authorize.
 */
function getAuthUrl() {
    const client = getOAuth2Client();
    return client.generateAuthUrl({
        access_type: 'offline',    // Ensures we get a refresh_token
        prompt: 'consent',         // Force consent to always get refresh_token
        scope: SCOPES
    });
}

/**
 * Exchange the authorization code for tokens.
 */
async function handleAuthCallback(code) {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Save tokens to disk
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    isAuthenticated = true;
    sheetsApi = null; // Reset so it reinitializes with new tokens

    console.log('Google Sheets: OAuth2 tokens saved successfully');
    return tokens;
}

/**
 * Check if we have valid auth.
 */
function checkAuth() {
    return isAuthenticated;
}

// ─── SHEETS API ──────────────────────────────────────────────────

async function initSheetsApi() {
    if (sheetsApi && isAuthenticated) return sheetsApi;

    const client = getOAuth2Client();
    if (!isAuthenticated) {
        throw new Error('Google Sheets not authenticated. Visit /api/sheets/auth to authorize.');
    }

    sheetsApi = google.sheets({ version: 'v4', auth: client });
    return sheetsApi;
}

// ─── SHEET CREATION ──────────────────────────────────────────────

async function createSheet(title) {
    const sheets = await initSheetsApi();
    const response = await sheets.spreadsheets.create({
        requestBody: {
            properties: { title },
            sheets: [{ properties: { title: 'Sheet1' } }]
        }
    });
    return response.data.spreadsheetId;
}

async function ensureSheets(logFn) {
    if (!isAuthenticated) {
        if (logFn) logFn('Step 7: Google Sheets not authenticated. Skipping sync. Visit /api/sheets/auth to authorize.', 'warning', 7);
        return sheetIds;
    }

    const tables = [
        {
            key: 'table1a', title: 'ACROSSTEK - Job Postings (Table 1a)',
            headers: ['Company ID', 'Company Name', 'Company Location', 'Source', 'Title', 'Job URL', 'Status', 'Company LinkedIn URL', 'Date Added']
        },
        {
            key: 'table1b', title: 'ACROSSTEK - Companies with Funding (Table 1b)',
            headers: ['Company ID', 'Company Name', 'News Title', 'Source', 'Funding Amount', 'Funding Stage', 'Date Added', 'Company LinkedIn URL', 'Status']
        },
        {
            key: 'table2a', title: 'ACROSSTEK - Job Posting Stakeholders (Table 2a)',
            headers: ['Company ID', 'Company Name', 'Job Title', 'Employee ID', 'First Name', 'Last Name', 'Employee Title', 'Employee LinkedIn URL', 'Email ID', 'Status', 'Date Added']
        },
        {
            key: 'table2b', title: 'ACROSSTEK - Funding Company Stakeholders (Table 2b)',
            headers: ['Company ID', 'Company Name', 'Funding Amount', 'Funding Stage', 'Employee ID', 'First Name', 'Last Name', 'Employee Title', 'Employee LinkedIn URL', 'Email ID', 'Status', 'Date Added']
        }
    ];

    for (const table of tables) {
        if (!sheetIds[table.key]) {
            try {
                const id = await createSheet(table.title);
                sheetIds[table.key] = id;
                saveSheetIds();

                const sheets = await initSheetsApi();
                await sheets.spreadsheets.values.update({
                    spreadsheetId: id,
                    range: 'Sheet1!A1',
                    valueInputOption: 'RAW',
                    requestBody: { values: [table.headers] }
                });

                if (logFn) logFn(`Step 7: Created Google Sheet for ${table.title}: ${id}`, 'success', 7);
            } catch (err) {
                if (logFn) logFn(`Step 7: Failed to create sheet ${table.key}: ${err.message}`, 'error', 7);
            }
        }
    }

    return sheetIds;
}

// ─── DATA SYNC ───────────────────────────────────────────────────

function formatDate(date) {
    if (!date) return '';
    return new Date(date).toISOString().split('T')[0];
}

/**
 * Clear a sheet and write rows (header + data). Prevents duplication.
 */
async function clearAndWriteRows(sheetId, headerRow, dataRows, logFn) {
    if (!sheetId || !isAuthenticated) return;

    const { allowed } = await rateLimitService.canMakeRequest('google_sheets');
    if (!allowed) {
        if (logFn) logFn('Step 7: Google Sheets rate limit reached. Retrying in 1 minute.', 'warning', 7);
        await new Promise(resolve => setTimeout(resolve, 60000));
    }

    await rateLimitService.recordRequest('google_sheets');
    const sheets = await initSheetsApi();

    // Clear the entire sheet first
    await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: 'Sheet1'
    });

    // Write header + data
    const allRows = [headerRow, ...dataRows];
    if (allRows.length > 0) {
        await rateLimitService.recordRequest('google_sheets');
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: 'Sheet1!A1',
            valueInputOption: 'RAW',
            requestBody: { values: allRows }
        });
    }
}

async function syncTable1a(logFn) {
    if (!isAuthenticated) return { synced: 0 };
    await ensureSheets(logFn);
    if (!sheetIds.table1a) return { synced: 0 };

    const header = ['Company ID', 'Company Name', 'Company Location', 'Source', 'Title', 'Job URL', 'Status', 'Company LinkedIn URL', 'Date Added'];
    const companies = await Company1a.find({});
    const rows = companies.map(c => [
        c.companyId, c.companyName, c.companyLocation,
        c.source, c.title, c.jobUrl,
        c.status, c.companyLinkedinUrl, formatDate(c.dateAdded)
    ]);

    await clearAndWriteRows(sheetIds.table1a, header, rows, logFn);
    if (logFn) logFn(`Step 7: Synced ${rows.length} rows to Table 1a sheet`, 'success', 7);
    return { synced: rows.length };
}

async function syncTable1b(logFn) {
    if (!isAuthenticated) return { synced: 0 };
    await ensureSheets(logFn);
    if (!sheetIds.table1b) return { synced: 0 };

    const header = ['Company ID', 'Company Name', 'News Title', 'Source', 'Funding Amount', 'Funding Stage', 'Date Added', 'Company LinkedIn URL', 'Status'];
    const companies = await Company1b.find({});
    const rows = companies.map(c => [
        c.companyId, c.companyName, c.newsTitle,
        c.source, c.fundingAmount, c.fundingStage,
        formatDate(c.dateAdded), c.companyLinkedinUrl, c.status
    ]);

    await clearAndWriteRows(sheetIds.table1b, header, rows, logFn);
    if (logFn) logFn(`Step 7: Synced ${rows.length} rows to Table 1b sheet`, 'success', 7);
    return { synced: rows.length };
}

async function syncTable2a(logFn) {
    if (!isAuthenticated) return { synced: 0 };
    await ensureSheets(logFn);
    if (!sheetIds.table2a) return { synced: 0 };

    const header = ['Company ID', 'Company Name', 'Job Title', 'Employee ID', 'First Name', 'Last Name', 'Employee Title', 'Employee LinkedIn URL', 'Email ID', 'Status', 'Date Added'];
    const employees = await Employee2a.find({});
    const rows = employees.map(e => [
        e.companyId, e.companyName, e.jobTitle,
        e.employeeId, e.firstName, e.lastName,
        e.employeeTitle, e.employeeLinkedinUrl,
        e.emailId, e.status, formatDate(e.dateAdded)
    ]);

    await clearAndWriteRows(sheetIds.table2a, header, rows, logFn);
    if (logFn) logFn(`Step 7: Synced ${rows.length} rows to Table 2a sheet`, 'success', 7);
    return { synced: rows.length };
}

async function syncTable2b(logFn) {
    if (!isAuthenticated) return { synced: 0 };
    await ensureSheets(logFn);
    if (!sheetIds.table2b) return { synced: 0 };

    const header = ['Company ID', 'Company Name', 'Funding Amount', 'Funding Stage', 'Employee ID', 'First Name', 'Last Name', 'Employee Title', 'Employee LinkedIn URL', 'Email ID', 'Status', 'Date Added'];
    const employees = await Employee2b.find({});
    const rows = employees.map(e => [
        e.companyId, e.companyName, e.fundingAmount, e.fundingStage,
        e.employeeId, e.firstName, e.lastName,
        e.employeeTitle, e.employeeLinkedinUrl,
        e.emailId, e.status, formatDate(e.dateAdded)
    ]);

    await clearAndWriteRows(sheetIds.table2b, header, rows, logFn);
    if (logFn) logFn(`Step 7: Synced ${rows.length} rows to Table 2b sheet`, 'success', 7);
    return { synced: rows.length };
}


function getEmbedUrls() {
    const base = 'https://docs.google.com/spreadsheets/d/';
    return {
        table1a: sheetIds.table1a ? `${base}${sheetIds.table1a}/edit?usp=sharing&embedded=true` : '',
        table1b: sheetIds.table1b ? `${base}${sheetIds.table1b}/edit?usp=sharing&embedded=true` : '',
        table2a: sheetIds.table2a ? `${base}${sheetIds.table2a}/edit?usp=sharing&embedded=true` : '',
        table2b: sheetIds.table2b ? `${base}${sheetIds.table2b}/edit?usp=sharing&embedded=true` : ''
    };
}

/**
 * Force-sync ALL MongoDB data to Google Sheets regardless of status.
 * Clears existing sheet data first to avoid duplicates, then re-writes all rows.
 */
async function forceSyncAll() {
    if (!isAuthenticated) {
        throw new Error('Google Sheets not authenticated. Visit /api/sheets/auth to authorize.');
    }

    await ensureSheets();
    const sheets = await initSheetsApi();

    const results = { table1a: 0, table1b: 0, table2a: 0, table2b: 0 };

    // ── TABLE 1a: All companies from Job Postings ──────────────────
    if (sheetIds.table1a) {
        const companies1a = await Company1a.find({});
        if (companies1a.length > 0) {
            const headers = ['Company ID', 'Company Name', 'Company Location', 'Source', 'Title', 'Job URL', 'Status', 'Company LinkedIn URL', 'Date Added'];
            const rows = companies1a.map(c => [
                c.companyId || '', c.companyName || '', c.companyLocation || '',
                c.source || '', c.title || '', c.jobUrl || '',
                c.status || '', c.companyLinkedinUrl || '', formatDate(c.dateAdded)
            ]);
            // Clear and rewrite
            await sheets.spreadsheets.values.clear({
                spreadsheetId: sheetIds.table1a, range: 'Sheet1'
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetIds.table1a, range: 'Sheet1!A1',
                valueInputOption: 'RAW',
                requestBody: { values: [headers, ...rows] }
            });
            results.table1a = rows.length;
        }
    }

    // ── TABLE 1b: All companies from Funding ───────────────────────
    if (sheetIds.table1b) {
        const companies1b = await Company1b.find({});
        if (companies1b.length > 0) {
            const headers = ['Company ID', 'Company Name', 'News Title', 'Source', 'Funding Amount', 'Funding Stage', 'Date Added', 'Company LinkedIn URL', 'Status'];
            const rows = companies1b.map(c => [
                c.companyId || '', c.companyName || '', c.newsTitle || '',
                c.source || '', c.fundingAmount || '', c.fundingStage || '',
                formatDate(c.dateAdded), c.companyLinkedinUrl || '', c.status || ''
            ]);
            await sheets.spreadsheets.values.clear({
                spreadsheetId: sheetIds.table1b, range: 'Sheet1'
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetIds.table1b, range: 'Sheet1!A1',
                valueInputOption: 'RAW',
                requestBody: { values: [headers, ...rows] }
            });
            results.table1b = rows.length;
        }
    }

    // ── TABLE 2a: All job posting stakeholders ─────────────────────
    if (sheetIds.table2a) {
        const employees2a = await Employee2a.find({});
        if (employees2a.length > 0) {
            const headers = ['Company ID', 'Company Name', 'Job Title', 'Employee ID', 'First Name', 'Last Name', 'Employee Title', 'Employee LinkedIn URL', 'Email ID', 'Status', 'Date Added'];
            const rows = employees2a.map(e => [
                e.companyId || '', e.companyName || '', e.jobTitle || '',
                e.employeeId || '', e.firstName || '', e.lastName || '',
                e.employeeTitle || '', e.employeeLinkedinUrl || '',
                e.emailId || '', e.status || '', formatDate(e.dateAdded)
            ]);
            await sheets.spreadsheets.values.clear({
                spreadsheetId: sheetIds.table2a, range: 'Sheet1'
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetIds.table2a, range: 'Sheet1!A1',
                valueInputOption: 'RAW',
                requestBody: { values: [headers, ...rows] }
            });
            results.table2a = rows.length;
        }
    }

    // ── TABLE 2b: All funding company stakeholders ─────────────────
    if (sheetIds.table2b) {
        const employees2b = await Employee2b.find({});
        if (employees2b.length > 0) {
            const headers = ['Company ID', 'Company Name', 'Funding Amount', 'Funding Stage', 'Employee ID', 'First Name', 'Last Name', 'Employee Title', 'Employee LinkedIn URL', 'Email ID', 'Status', 'Date Added'];
            const rows = employees2b.map(e => [
                e.companyId || '', e.companyName || '', e.fundingAmount || '', e.fundingStage || '',
                e.employeeId || '', e.firstName || '', e.lastName || '',
                e.employeeTitle || '', e.employeeLinkedinUrl || '',
                e.emailId || '', e.status || '', formatDate(e.dateAdded)
            ]);
            await sheets.spreadsheets.values.clear({
                spreadsheetId: sheetIds.table2b, range: 'Sheet1'
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetIds.table2b, range: 'Sheet1!A1',
                valueInputOption: 'RAW',
                requestBody: { values: [headers, ...rows] }
            });
            results.table2b = rows.length;
        }
    }

    console.log('Force sync complete:', results);
    return results;
}

module.exports = {
    getAuthUrl,
    handleAuthCallback,
    checkAuth,
    ensureSheets,
    syncTable1a, syncTable1b,
    syncTable2a, syncTable2b,
    getEmbedUrls,
    forceSyncAll
};
