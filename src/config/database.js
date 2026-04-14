// src/config/database.js
// PostgreSQL connection pool — replaces config/database.php singleton PDO
// Uses the same env vars: DB_ENVIRONMENT, DB_PROD_*, DB_LOCAL_*

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool, types } = require('pg');

// Prevent Postgres from automatically parsing DATE to a JS Date object. 
// Otherwise it converts '2026-04-05' to '2026-04-05T00:00:00.000Z' (local time shift).
types.setTypeParser(1082, function(stringValue) {
  return stringValue; // Keep as 'YYYY-MM-DD'
});

let pool = null;

/**
 * Returns a singleton pg.Pool instance.
 * On first call, creates the pool and sets search_path to 'finova, public'
 * (matching the PHP: SET search_path TO finova, public).
 */
function getPool() {
  if (pool) return pool;

  const env = process.env.DB_ENVIRONMENT || 'local';

  const config = env === 'production'
    ? {
        host: process.env.DB_PROD_HOST,
        port: parseInt(process.env.DB_PROD_PORT, 10) || 5432,
        database: process.env.DB_PROD_NAME,
        user: process.env.DB_PROD_USER,
        password: process.env.DB_PROD_PASS,
        ssl: { rejectUnauthorized: false },  // Supabase requires SSL
      }
    : {
        host: process.env.DB_LOCAL_HOST || 'localhost',
        port: parseInt(process.env.DB_LOCAL_PORT, 10) || 5432,
        database: process.env.DB_LOCAL_NAME || 'finova_db',
        user: process.env.DB_LOCAL_USER || 'postgres',
        password: process.env.DB_LOCAL_PASS || '',
      };

  // Connection timeout of 5 seconds — matches PHP PDO::ATTR_TIMEOUT => 5
  config.connectionTimeoutMillis = 5000;
  config.idleTimeoutMillis = 30000;
  config.max = 10;

  pool = new Pool(config);

  // Set search_path on every new client connection
  pool.on('connect', (client) => {
    client.query('SET search_path TO finova, public');
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });

  return pool;
}

/**
 * Helper: get a client from the pool (for transactions).
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     // ... queries ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
async function getClient() {
  const client = await getPool().connect();
  return client;
}

/**
 * Helper: run a single query (no transaction needed).
 * Usage: const { rows } = await query('SELECT * FROM finova.users WHERE id = $1', [userId]);
 */
async function query(text, params) {
  return getPool().query(text, params);
}

module.exports = { getPool, getClient, query };
