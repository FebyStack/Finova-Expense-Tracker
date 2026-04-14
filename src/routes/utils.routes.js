// src/routes/utils.routes.js
const express = require('express');
const router = express.Router();
const { fixMonthLabels, checkData } = require('../controllers/utils.controller');

router.post('/fix-month-labels', fixMonthLabels);
router.get('/check-data', checkData);

module.exports = router;
