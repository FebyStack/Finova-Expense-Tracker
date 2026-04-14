// src/routes/sync.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { syncPush, syncPull, syncStatus, syncNow } = require('../controllers/sync.controller');

router.get('/sync', requireAuth, syncPull);
router.post('/sync', requireAuth, syncPush);
router.get('/sync-status', syncStatus);       // No auth — matches PHP
router.post('/sync-now', syncNow);            // No auth — matches PHP

module.exports = router;
