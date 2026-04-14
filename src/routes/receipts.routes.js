// src/routes/receipts.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getReceipts, createReceipt, updateReceipt, deleteReceipt } = require('../controllers/receipts.controller');

router.get('/receipts', requireAuth, getReceipts);
router.post('/receipts', requireAuth, createReceipt);
router.put('/receipts', requireAuth, updateReceipt);
router.delete('/receipts', requireAuth, deleteReceipt);

module.exports = router;
