// src/controllers/health.controller.js
// Health check + DB diagnostics — replaces api/health.php and api/db_test.php

const path = require('path');
const fs = require('fs');
const { query, getPool } = require('../config/database');
const { isFirebaseInitialized } = require('../config/firebase');
const { ok, fail } = require('../helpers/response');

/**
 * GET /api/health
 * DB connection test + Firebase config check
 * Replaces api/health.php
 */
async function healthCheck(req, res) {
  const status = {
    db: false,
    firebase_initialized: isFirebaseInitialized(),
    firebase_config: false,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    node_version: process.version,
  };

  // Check Firebase serviceAccountKey
  const saPath = path.join(__dirname, '..', '..', process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'serviceAccountKey.json');
  status.firebase_config = fs.existsSync(saPath);

  // Check PostgreSQL
  try {
    await query('SELECT 1');
    status.db = true;
  } catch (err) {
    status.db_error = err.message;
  }

  const allOk = status.db;
  return ok(res, { health: allOk, status });
}

/**
 * GET /api/db-test
 * Detailed database diagnostic — replaces api/db_test.php
 * Returns: connection status, schema check, table check, user count
 */
async function dbTest(req, res) {
  const results = {
    connection: false,
    schema_exists: false,
    users_table: false,
    users_count: 0,
    tables: [],
    errors: [],
  };

  try {
    // 1. Test database connection
    await query('SELECT 1');
    results.connection = true;

    // 2. Check if 'finova' schema exists
    const schemaResult = await query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'finova'"
    );
    results.schema_exists = schemaResult.rows.length > 0;

    if (!results.schema_exists) {
      results.errors.push("'finova' schema does NOT exist");
      return ok(res, results);
    }

    // 3. Check if finova.users table exists
    const usersTableResult = await query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'finova' AND table_name = 'users'"
    );
    results.users_table = usersTableResult.rows.length > 0;

    if (results.users_table) {
      // 4. Count users
      const countResult = await query('SELECT COUNT(*) FROM finova.users');
      results.users_count = parseInt(countResult.rows[0].count, 10);
    }

    // 5. List all tables in finova schema
    const tablesResult = await query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'finova' ORDER BY table_name"
    );
    results.tables = tablesResult.rows.map(r => r.table_name);

    return ok(res, results);
  } catch (err) {
    results.errors.push(err.message);
    return ok(res, results);
  }
}

module.exports = { healthCheck, dbTest };
