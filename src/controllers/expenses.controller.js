// src/controllers/expenses.controller.js
// Expenses CRUD — replaces api/expenses.php
// Preserves: month filter, category filter, recurring filter, receipt_data column fallback

const { query, getClient } = require('../config/database');
const { ok, fail } = require('../helpers/response');
const fs = require('fs');
const path = require('path');

/**
 * GET /api/expenses
 * Query params: id, month, category, recurring
 */
async function getExpenses(req, res) {
  try {
    const userId = req.userId;

    // Single expense by ID
    if (req.query.id && req.query.id !== '') {
      const { rows } = await query(
        'SELECT * FROM finova.expenses WHERE id = $1 AND user_id = $2',
        [parseInt(req.query.id, 10), userId]
      );
      if (!rows[0]) return fail(res, 'Expense not found', 404);
      return ok(res, rows[0]);
    }

    // List with filters
    let sql = 'SELECT * FROM finova.expenses WHERE user_id = $1';
    const params = [userId];
    let paramIdx = 2;

    if (req.query.month) {
      sql += ` AND month = $${paramIdx++}`;
      params.push(req.query.month);
    }
    if (req.query.category) {
      sql += ` AND category = $${paramIdx++}`;
      params.push(req.query.category);
    }
    if (req.query.recurring === 'true') {
      sql += ' AND recurring = true';
    }

    sql += ' ORDER BY date DESC';

    const { rows } = await query(sql, params);
    return ok(res, { expenses: rows });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

/**
 * POST /api/expenses
 * Creates a new expense with transaction + receipt_data column fallback
 */
async function createExpense(req, res) {
  const userId = req.userId;
  const body = req.body;

  // --- Debug Logging (same as PHP) ---
  const logDir = path.join(__dirname, '..', '..', 'logs');
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logMsg = `[${new Date().toISOString()}] POST /expenses | User: ${userId} | Payload: ${JSON.stringify(body)}\n`;
    fs.appendFileSync(path.join(logDir, 'api_debug.log'), logMsg);
  } catch (e) { /* silent */ }

  // Validation
  if (!body.amount) return fail(res, 'amount is required', 400);
  if (!body.category) return fail(res, 'category is required', 400);
  if (!body.date) return fail(res, 'date is required', 400);

  const amount = parseFloat(body.amount);
  if (amount <= 0) return fail(res, 'Amount must be greater than zero', 400);

  const dateRaw = body.date;
  const month = dateRaw.substring(0, 7); // YYYY-MM from YYYY-MM-DD
  const currency = body.currency || 'PHP';
  const note = body.note || null;
  const recurring = body.recurring ? true : false;
  const frequency = recurring ? (body.frequency || null) : null;
  const receiptData = body.receiptData ? JSON.stringify(body.receiptData) : null;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO finova.expenses
         (user_id, amount, currency, category, date, month, note, recurring, frequency, receipt_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [userId, amount, currency, body.category, dateRaw, month, note, recurring, frequency, receiptData]
    );

    await client.query('COMMIT');
    return ok(res, rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');

    // Column missing fallback — same as PHP receipt_data column retry
    if (err.message.includes('receipt_data')) {
      try {
        await client.query('ALTER TABLE finova.expenses ADD COLUMN IF NOT EXISTS receipt_data JSONB');
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO finova.expenses
             (user_id, amount, currency, category, date, month, note, recurring, frequency, receipt_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *`,
          [userId, amount, currency, body.category, dateRaw, month, note, recurring, frequency, receiptData]
        );
        await client.query('COMMIT');
        return ok(res, rows[0], 201);
      } catch (retryErr) {
        await client.query('ROLLBACK');
        return fail(res, 'Database error: ' + retryErr.message, 500);
      }
    }

    return fail(res, 'Database error: ' + err.message, 500);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/expenses?id=
 * Updates an expense with COALESCE pattern + receipt_data fallback
 */
async function updateExpense(req, res) {
  const userId = req.userId;
  const id = parseInt(req.query.id, 10);
  if (!req.query.id || req.query.id === '') return fail(res, 'Missing expense id', 400);

  const body = req.body;
  const month = body.date ? body.date.substring(0, 7) : null;
  const receiptData = body.receiptData ? JSON.stringify(body.receiptData) : null;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE finova.expenses SET
         amount    = COALESCE($1, amount),
         currency  = COALESCE($2, currency),
         category  = COALESCE($3, category),
         date      = COALESCE($4, date),
         month     = COALESCE($5, month),
         note      = COALESCE($6, note),
         recurring = COALESCE($7, recurring),
         frequency = COALESCE($8, frequency),
         receipt_data = COALESCE($9, receipt_data),
         updated_at = NOW()
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [
        body.amount != null ? parseFloat(body.amount) : null,
        body.currency || null,
        body.category || null,
        body.date || null,
        month,
        body.note || null,
        body.recurring != null ? Boolean(body.recurring) : null,
        body.frequency || null,
        receiptData,
        id,
        userId,
      ]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return fail(res, 'Expense not found', 404);
    }

    await client.query('COMMIT');
    return ok(res, rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');

    // receipt_data column fallback
    if (err.message.includes('receipt_data')) {
      try {
        await client.query('ALTER TABLE finova.expenses ADD COLUMN IF NOT EXISTS receipt_data JSONB');
        await client.query('BEGIN');
        const { rows } = await client.query(
          `UPDATE finova.expenses SET
             amount    = COALESCE($1, amount),
             currency  = COALESCE($2, currency),
             category  = COALESCE($3, category),
             date      = COALESCE($4, date),
             month     = COALESCE($5, month),
             note      = COALESCE($6, note),
             recurring = COALESCE($7, recurring),
             frequency = COALESCE($8, frequency),
             receipt_data = COALESCE($9, receipt_data),
             updated_at = NOW()
           WHERE id = $10 AND user_id = $11
           RETURNING *`,
          [
            body.amount != null ? parseFloat(body.amount) : null,
            body.currency || null,
            body.category || null,
            body.date || null,
            month,
            body.note || null,
            body.recurring != null ? Boolean(body.recurring) : null,
            body.frequency || null,
            receiptData,
            id,
            userId,
          ]
        );
        if (!rows[0]) { await client.query('ROLLBACK'); return fail(res, 'Expense not found', 404); }
        await client.query('COMMIT');
        return ok(res, rows[0]);
      } catch (retryErr) {
        await client.query('ROLLBACK');
        return fail(res, 'Database error: ' + retryErr.message, 500);
      }
    }

    return fail(res, 'Database error: ' + err.message, 500);
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/expenses?id=
 */
async function deleteExpense(req, res) {
  try {
    const userId = req.userId;
    if (!req.query.id || req.query.id === '') return fail(res, 'id is required', 400);
    const id = parseInt(req.query.id, 10);

    const { rows } = await query(
      'DELETE FROM finova.expenses WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (!rows[0]) return fail(res, 'Expense not found', 404);
    return ok(res, { deleted: true, id });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

module.exports = { getExpenses, createExpense, updateExpense, deleteExpense };
