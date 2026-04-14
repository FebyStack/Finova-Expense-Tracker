// src/app.js
// Express application setup — CORS, body parsing, route mounting

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ─── Trust Proxy (Required for ngrok protocol detection) ──
app.set('trust proxy', true);

// ─── CORS ────────────────────────────────────────────────
// Mirrors the PHP config/cors.php: Allow all origins, common methods & headers
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Firebase-UID'],
  credentials: true,
}));

// ─── Request Logging ─────────────────────────────────────
app.use(morgan('dev'));

// ─── Body Parsing ────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));           // For base64 receipt images
app.use(express.urlencoded({ extended: true }));

// ─── Static Files (Frontend & Uploads) ─────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── Cache Control ───────────────────────────────────────
// Prevent aggressive caching of API responses (same fix applied in PHP)
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// ─── Routes ──────────────────────────────────────────────
const routes = require('./routes');
app.use('/api', routes);

// ─── Global Error Handler ────────────────────────────────
app.use(errorHandler);

module.exports = app;
