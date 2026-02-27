const express = require('express');
const router = express.Router();
const pipelineOrchestrator = require('../services/pipelineOrchestrator');

/**
 * GET /api/workflow/progress
 * Get current workflow/pipeline progress.
 */
router.get('/progress', async (req, res) => {
    const status = pipelineOrchestrator.getWorkflowStatus();
    res.json({ workflow: status });
});

module.exports = router;
