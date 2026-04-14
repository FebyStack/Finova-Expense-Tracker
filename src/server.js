// src/server.js
// Entry point — loads environment, initializes services, starts the Express server

require('dotenv').config();

const app = require('./app');
const { initFirebase, isFirebaseInitialized } = require('./config/firebase');
const { getPool } = require('./config/database');

const PORT = process.env.PORT || 3001;

// ─── Initialize services before listening ───────────────────
(async () => {
  // 1. Initialize Firebase Admin SDK (for Firestore mirroring)
  initFirebase();

  // 2. Verify database connectivity
  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT 1 AS ok');
    console.log('[DB] PostgreSQL connection verified.');
  } catch (err) {
    console.error('[DB] WARNING — Could not connect to PostgreSQL:', err.message);
    console.error('[DB] The server will start, but database operations will fail.');
  }

  // 3. Start listening
  app.listen(PORT, () => {
    console.log(`
  ╔═══════════════════════════════════════════╗
  ║   Finova Backend Server                   ║
  ║   Running on http://localhost:${PORT}        ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}             ║
  ║   Firebase:    ${isFirebaseInitialized() ? 'Connected ✓' : 'Disabled ✗'}                  ║
  ╚═══════════════════════════════════════════╝
    `);
  });
})();
