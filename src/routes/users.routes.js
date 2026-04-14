// src/routes/users.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getUser, createUser, updateUser } = require('../controllers/users.controller');

router.get('/users', requireAuth, getUser);
router.post('/users', createUser);  // No auth — used for initial user creation from frontend
router.put('/users', requireAuth, updateUser);

module.exports = router;
