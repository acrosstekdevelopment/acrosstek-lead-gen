const express = require('express');
const router = express.Router();
const sheetsService = require('../services/sheetsService');

/**
 * GET /api/sheets/auth
 * Redirect to Google OAuth2 consent screen.
 */
router.get('/auth', (req, res) => {
  const url = sheetsService.getAuthUrl();
  res.redirect(url);
});

/**
 * GET /api/sheets/auth/callback
 * Handle the OAuth2 callback from Google.
 */
router.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    await sheetsService.handleAuthCallback(code);
    res.send(`
      <html>
        <body style="font-family: Inter, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #F8FAFC;">
          <div style="text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h1 style="color: #059669; margin-bottom: 12px;">✅ Google Sheets Authorized!</h1>
            <p style="color: #6B7280;">You can now close this tab and run scrapers.<br>Sheets will be created and synced automatically.</p>
            <a href="http://localhost:5173/" style="display: inline-block; margin-top: 20px; padding: 10px 24px; background: #2563EB; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Back to Dashboard</a>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`
      <html>
        <body style="font-family: Inter, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #F8FAFC;">
          <div style="text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h1 style="color: #DC2626; margin-bottom: 12px;">❌ Authorization Failed</h1>
            <p style="color: #6B7280;">${err.message}</p>
            <a href="/api/sheets/auth" style="display: inline-block; margin-top: 20px; padding: 10px 24px; background: #2563EB; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Try Again</a>
          </div>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/sheets/auth/status
 * Check if Google Sheets is authenticated.
 */
router.get('/auth/status', (req, res) => {
  res.json({ authenticated: sheetsService.checkAuth() });
});

/**
 * GET /api/sheets/config
 * Get Google Sheets embed URLs and auth status.
 */
router.get('/config', async (req, res) => {
  try {
    const urls = sheetsService.getEmbedUrls();
    res.json({
      embedUrls: urls,
      authenticated: sheetsService.checkAuth()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sheets/sync/force
 * Force-sync ALL existing MongoDB data to Google Sheets.
 * Used when data was scraped but never synced due to earlier bugs.
 */
router.post('/sync/force', async (req, res) => {
  try {
    const result = await sheetsService.forceSyncAll();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
