// src/routes/config.routes.js
const express = require('express');
const router = express.Router();
const { configSupabase, configJs } = require('../controllers/config.controller');

router.get('/config-supabase', configSupabase);
router.get('/config-js', configJs);

module.exports = router;
