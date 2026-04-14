// src/routes/index.js
// Central route mounting — connects all route groups to the Express app

const express = require('express');
const router = express.Router();

// ─── Mount all route groups ──────────────────────────────
router.use('/', require('./auth.routes'));
router.use('/', require('./expenses.routes'));
router.use('/', require('./income.routes'));
router.use('/', require('./budgets.routes'));
router.use('/', require('./savings.routes'));
router.use('/', require('./receipts.routes'));
router.use('/', require('./uploads.routes'));
router.use('/', require('./users.routes'));
router.use('/', require('./sync.routes'));
router.use('/', require('./ai.routes'));
router.use('/', require('./push.routes'));
router.use('/', require('./health.routes'));
router.use('/', require('./config.routes'));
router.use('/', require('./archive.routes'));
router.use('/', require('./utils.routes'));

module.exports = router;
