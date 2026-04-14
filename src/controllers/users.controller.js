// src/controllers/users.controller.js
// Users endpoint — replaces api/users.php
// Supports _method override for PUT via POST body

const { query, getClient } = require('../config/database');
const { ok, fail } = require('../helpers/response');

/** POST /api/users — create or upsert user on login */
async function createUser(req, res) {
  const body = req.body;

  // Support _method override (for hosts that block PUT)
  if (body._method && body._method.toUpperCase() === 'PUT') {
    return updateUser(req, res);
  }

  if (!body.uid) return fail(res, 'Missing uid', 400);

  const uid = body.uid.trim();
  const email = (body.email || '').trim().toLowerCase();
  const name = body.displayName || null;
  const currency = body.baseCurrency || 'PHP';
  const theme = body.theme || 'light';

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finova.users (email, display_name, base_currency, theme)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         updated_at   = NOW()
       RETURNING *`,
      [email, name, currency, theme]
    );
    await client.query('COMMIT');
    return ok(res, rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');
    return fail(res, 'Database error: ' + err.message, 500);
  } finally {
    client.release();
  }
}

/** GET /api/users — fetch user */
async function getUser(req, res) {
  try {
    let uid = req.query.id || req.query.uid || req.userId;
    
    // If the frontend passed a string UUID instead of an integer ID, ignore it and use the resolved integer
    if (typeof uid === 'string' && uid.includes('-')) {
      uid = req.userId;
    }

    const { rows } = await query(
      'SELECT * FROM finova.users WHERE id = $1',
      [uid]
    );
    if (!rows[0]) return fail(res, 'User not found', 404);
    return ok(res, rows[0]);
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

/** PUT /api/users — update profile */
async function updateUser(req, res) {
  try {
    const body = req.body;
    let uid = req.query.id || req.query.uid || body.uid || req.userId;

    if (typeof uid === 'string' && uid.includes('-')) {
      uid = req.userId;
    }

    const { rows } = await query(
      `UPDATE finova.users SET
         display_name  = COALESCE($1, display_name),
         base_currency = COALESCE($2, base_currency),
         theme         = COALESCE($3, theme),
         updated_at    = NOW()
       WHERE id = $4 RETURNING *`,
      [
        body.displayName || null,
        body.baseCurrency || null,
        body.theme || null,
        uid,
      ]
    );
    if (!rows[0]) return fail(res, 'User not found', 404);
    return ok(res, rows[0]);
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

module.exports = { getUser, createUser, updateUser };
