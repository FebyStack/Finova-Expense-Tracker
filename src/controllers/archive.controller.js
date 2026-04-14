// src/controllers/archive.controller.js
// Archive endpoint — replaces api/archive.php

const { query, getClient } = require('../config/database');
const { ok, fail } = require('../helpers/response');

/**
 * POST /api/archive
 * Batch insert into finova.archives
 */
async function archiveData(req, res) {
  const userId = req.userId;
  const body = req.body;

  if (!body || !Array.isArray(body) || body.length === 0) {
    return fail(res, 'No data provided', 400);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (const record of body) {
      if (!record.id || !record.table_name || !record.data) {
        continue; // Skip invalid records (same as PHP)
      }

      await client.query(
        `INSERT INTO finova.archives (user_id, original_id, table_name, payload)
         VALUES ($1, $2, $3, $4)`,
        [userId, record.id, record.table_name, JSON.stringify(record.data)]
      );
    }

    await client.query('COMMIT');
    return ok(res, { archived_count: body.length });
  } catch (err) {
    if (client) await client.query('ROLLBACK');

    // Check if archives table missing
    if (err.message.includes('relation "finova.archives" does not exist')) {
      return fail(res, 'Archiving failed: Table "finova.archives" not found. Please run the provided SQL query first.', 500);
    }
    return fail(res, 'Database error: ' + err.message, 500);
  } finally {
    client.release();
  }
}

module.exports = { archiveData };
