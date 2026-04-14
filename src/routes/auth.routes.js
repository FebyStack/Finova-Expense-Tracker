// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { login, signup, logout, me } = require('../controllers/auth.controller');

router.post('/login', login);
router.post('/signup', signup);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

module.exports = router;
