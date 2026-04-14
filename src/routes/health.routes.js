// src/routes/health.routes.js
const express = require('express');
const router = express.Router();
const { healthCheck, dbTest } = require('../controllers/health.controller');

router.get('/health', healthCheck);
router.get('/db-test', dbTest);  // Replaces api/db_test.php

module.exports = router;
