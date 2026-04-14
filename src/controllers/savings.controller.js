// src/controllers/savings.controller.js
// Savings Goals CRUD — replaces api/savings.php

const { query, getClient } = require('../config/database');
const { ok, fail } = require('../helpers/response');

/** GET /api/savings */
async function getSavings(req, res) {
  try {
    const userId = req.userId;

    if (req.query.id && req.query.id !== '') {
      const { rows } = await query(
        'SELECT * FROM finova.savings_goals WHERE id = $1 AND user_id = $2',
        [parseInt(req.query.id, 10), userId]
      );
      if (!rows[0]) return fail(res, 'Savings goal not found', 404);
      return ok(res, rows[0]);
    }

    const { rows } = await query(
      'SELECT * FROM finova.savings_goals WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return ok(res, { savings: rows });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

/** POST /api/savings */
async function createSavings(req, res) {
  const userId = req.userId;
  const body = req.body;

  if (!body.name) return fail(res, 'name is required', 400);
  const target = parseFloat(body.target_amount || body.targetAmount);
  if (!target || isNaN(target) || target <= 0) return fail(res, 'Valid target_amount is required', 400);

  const current = parseFloat(body.current_amount || body.currentAmount || 0);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finova.savings_goals (user_id, name, target_amount, current_amount, deadline)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, body.name.trim(), target, current, body.deadline || null]
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

/** PUT /api/savings?id= */
async function updateSavings(req, res) {
  const userId = req.userId;
  if (!req.query.id || req.query.id === '') return fail(res, 'id is required', 400);
  const id = parseInt(req.query.id, 10);
  const body = req.body;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE finova.savings_goals SET
         name           = COALESCE($1, name),
         target_amount  = COALESCE($2, target_amount),
         current_amount = COALESCE($3, current_amount),
         deadline       = COALESCE($4, deadline),
         updated_at     = NOW()
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [
        body.name || null,
        (body.target_amount != null || body.targetAmount != null) ? parseFloat(body.target_amount || body.targetAmount) : null,
        (body.current_amount != null || body.currentAmount != null) ? parseFloat(body.current_amount || body.currentAmount) : null,
        body.deadline || null,
        id, userId,
      ]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return fail(res, 'Savings goal not found', 404); }
    await client.query('COMMIT');
    return ok(res, rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    return fail(res, 'Database error: ' + err.message, 500);
  } finally {
    client.release();
  }
}

/** DELETE /api/savings?id= */
async function deleteSavings(req, res) {
  try {
    const userId = req.userId;
    if (!req.query.id || req.query.id === '') return fail(res, 'id is required', 400);
    const id = parseInt(req.query.id, 10);

    const { rows } = await query(
      'DELETE FROM finova.savings_goals WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (!rows[0]) return fail(res, 'Savings goal not found', 404);
    return ok(res, { deleted: true, id });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

module.exports = { getSavings, createSavings, updateSavings, deleteSavings };
