// src/routes/budgets.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getBudgets, createBudget, updateBudget, deleteBudget } = require('../controllers/budgets.controller');

router.get('/budgets', requireAuth, getBudgets);
router.post('/budgets', requireAuth, createBudget);
router.put('/budgets', requireAuth, updateBudget);
router.delete('/budgets', requireAuth, deleteBudget);

module.exports = router;
