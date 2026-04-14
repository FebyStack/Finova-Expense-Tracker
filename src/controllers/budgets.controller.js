// src/controllers/budgets.controller.js
// Budgets CRUD — replaces api/budgets.php

const { query, getClient } = require('../config/database');
const { ok, fail } = require('../helpers/response');

/** GET /api/budgets */
async function getBudgets(req, res) {
  try {
    const userId = req.userId;

    if (req.query.id && req.query.id !== '') {
      const { rows } = await query(
        'SELECT * FROM finova.budgets WHERE id = $1 AND user_id = $2',
        [parseInt(req.query.id, 10), userId]
      );
      if (!rows[0]) return fail(res, 'Budget not found', 404);
      return ok(res, rows[0]);
    }

    let sql = 'SELECT * FROM finova.budgets WHERE user_id = $1';
    const params = [userId];
    let idx = 2;
    if (req.query.month) { sql += ` AND month = $${idx++}`; params.push(parseInt(req.query.month, 10)); }
    if (req.query.year) { sql += ` AND year = $${idx++}`; params.push(parseInt(req.query.year, 10)); }
    sql += ' ORDER BY category ASC';

    const { rows } = await query(sql, params);
    return ok(res, { budgets: rows });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

/** POST /api/budgets */
async function createBudget(req, res) {
  const userId = req.userId;
  const body = req.body;

  if (!body.category) return fail(res, 'category is required', 400);
  if (!body.limitAmount) return fail(res, 'limitAmount is required', 400);
  if (!body.month) return fail(res, 'month is required', 400);
  if (!body.year) return fail(res, 'year is required', 400);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finova.budgets (user_id, category, limit_amount, spent, month, year)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, category, month, year) DO UPDATE SET
         limit_amount = EXCLUDED.limit_amount,
         updated_at = NOW()
       RETURNING *`,
      [userId, body.category, parseFloat(body.limitAmount), parseFloat(body.spent || 0),
       parseInt(body.month, 10), parseInt(body.year, 10)]
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

/** PUT /api/budgets?id= */
async function updateBudget(req, res) {
  const userId = req.userId;
  if (!req.query.id || req.query.id === '') return fail(res, 'id is required', 400);
  const id = parseInt(req.query.id, 10);
  const body = req.body;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE finova.budgets SET
         limit_amount = COALESCE($1, limit_amount),
         spent        = COALESCE($2, spent),
         updated_at   = NOW()
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [
        body.limitAmount != null ? parseFloat(body.limitAmount) : null,
        body.spent != null ? parseFloat(body.spent) : null,
        id, userId,
      ]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return fail(res, 'Budget not found', 404); }
    await client.query('COMMIT');
    return ok(res, rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    return fail(res, 'Database error: ' + err.message, 500);
  } finally {
    client.release();
  }
}

/** DELETE /api/budgets?id= */
async function deleteBudget(req, res) {
  try {
    const userId = req.userId;
    if (!req.query.id || req.query.id === '') return fail(res, 'id is required', 400);
    const id = parseInt(req.query.id, 10);

    const { rows } = await query(
      'DELETE FROM finova.budgets WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (!rows[0]) return fail(res, 'Budget not found', 404);
    return ok(res, { deleted: true, id });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

module.exports = { getBudgets, createBudget, updateBudget, deleteBudget };
