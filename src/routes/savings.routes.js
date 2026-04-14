// src/routes/savings.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getSavings, createSavings, updateSavings, deleteSavings } = require('../controllers/savings.controller');

router.get('/savings', requireAuth, getSavings);
router.post('/savings', requireAuth, createSavings);
router.put('/savings', requireAuth, updateSavings);
router.delete('/savings', requireAuth, deleteSavings);

module.exports = router;
