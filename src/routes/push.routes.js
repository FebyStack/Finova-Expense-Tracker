// src/routes/push.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getVapid, saveSubscription, sendBudgetAlert } = require('../controllers/push.controller');

router.get('/get-vapid', getVapid);                          // No auth needed
router.post('/save-subscription', requireAuth, saveSubscription);
router.post('/send-budget-alert', requireAuth, sendBudgetAlert);

module.exports = router;
