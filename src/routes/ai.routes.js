// src/routes/ai.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getAiInsights, aiChat, scanReceipt } = require('../controllers/ai.controller');

router.get('/ai-insights', requireAuth, getAiInsights);
router.post('/ai-insights', requireAuth, getAiInsights);  // Also accepts POST (same as PHP)
router.post('/ai-chat', requireAuth, aiChat);
router.post('/scan-receipt', requireAuth, scanReceipt);

module.exports = router;
