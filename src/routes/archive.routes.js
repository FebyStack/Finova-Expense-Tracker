// src/routes/archive.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { archiveData } = require('../controllers/archive.controller');

router.post('/archive', requireAuth, archiveData);

module.exports = router;
