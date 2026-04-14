// src/routes/income.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getIncome, createIncome, updateIncome, deleteIncome } = require('../controllers/income.controller');

router.get('/income', requireAuth, getIncome);
router.post('/income', requireAuth, createIncome);
router.put('/income', requireAuth, updateIncome);
router.delete('/income', requireAuth, deleteIncome);

module.exports = router;
