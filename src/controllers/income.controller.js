// src/controllers/income.controller.js
// Income CRUD — replaces api/income.php

const { query, getClient } = require('../config/database');
const { ok, fail } = require('../helpers/response');

/** GET /api/income */
async function getIncome(req, res) {
  try {
    const userId = req.userId;

    if (req.query.id && req.query.id !== '') {
      const { rows } = await query(
        'SELECT * FROM finova.income WHERE id = $1 AND user_id = $2',
        [parseInt(req.query.id, 10), userId]
      );
      if (!rows[0]) return fail(res, 'Income not found', 404);
      return ok(res, rows[0]);
    }

    let sql = 'SELECT * FROM finova.income WHERE user_id = $1';
    const params = [userId];
    let idx = 2;
    if (req.query.month) { sql += ` AND month = $${idx++}`; params.push(req.query.month); }
    sql += ' ORDER BY date DESC';

    const { rows } = await query(sql, params);
    return ok(res, { income: rows });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

/** POST /api/income */
async function createIncome(req, res) {
  const userId = req.userId;
  const body = req.body;

  if (!body.amount) return fail(res, 'amount is required', 400);
  if (!body.source) return fail(res, 'source is required', 400);
  if (!body.date) return fail(res, 'date is required', 400);

  const amount = parseFloat(body.amount);
  if (amount <= 0) return fail(res, 'Amount must be greater than zero', 400);

  const month = body.date.substring(0, 7);
  const currency = body.currency || 'PHP';
  const note = body.note || null;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finova.income (user_id, amount, currency, source, date, month, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [userId, amount, currency, body.source, body.date, month, note]
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

/** PUT /api/income?id= */
async function updateIncome(req, res) {
  const userId = req.userId;
  if (!req.query.id || req.query.id === '') return fail(res, 'id is required', 400);
  const id = parseInt(req.query.id, 10);
  const body = req.body;
  const month = body.date ? body.date.substring(0, 7) : null;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE finova.income SET
         amount   = COALESCE($1, amount),
         currency = COALESCE($2, currency),
         source   = COALESCE($3, source),
         date     = COALESCE($4, date),
         month    = COALESCE($5, month),
         note     = COALESCE($6, note),
         updated_at = NOW()
       WHERE id = $7 AND user_id = $8 RETURNING *`,
      [
        body.amount != null ? parseFloat(body.amount) : null,
        body.currency || null,
        body.source || null,
        body.date || null,
        month,
        body.note || null,
        id,
        userId,
      ]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return fail(res, 'Income not found', 404); }
    await client.query('COMMIT');
    return ok(res, rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    return fail(res, 'Database error: ' + err.message, 500);
  } finally {
    client.release();
  }
}

/** DELETE /api/income?id= */
async function deleteIncome(req, res) {
  try {
    const userId = req.userId;
    if (!req.query.id || req.query.id === '') return fail(res, 'id is required', 400);
    const id = parseInt(req.query.id, 10);

    const { rows } = await query(
      'DELETE FROM finova.income WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (!rows[0]) return fail(res, 'Income not found', 404);
    return ok(res, { deleted: true, id });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

module.exports = { getIncome, createIncome, updateIncome, deleteIncome };
