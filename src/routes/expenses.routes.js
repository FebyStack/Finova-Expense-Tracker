// src/routes/expenses.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getExpenses, createExpense, updateExpense, deleteExpense } = require('../controllers/expenses.controller');

router.get('/expenses', requireAuth, getExpenses);
router.post('/expenses', requireAuth, createExpense);
router.put('/expenses', requireAuth, updateExpense);
router.delete('/expenses', requireAuth, deleteExpense);

module.exports = router;
