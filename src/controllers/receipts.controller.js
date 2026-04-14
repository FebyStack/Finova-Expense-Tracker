// src/controllers/receipts.controller.js
// Receipts CRUD — replaces api/receipts.php
// Includes physical file deletion on DELETE

const fs = require('fs');
const path = require('path');
const { query, getClient } = require('../config/database');
const { ok, fail } = require('../helpers/response');

/** GET /api/receipts */
async function getReceipts(req, res) {
  try {
    const userId = req.userId;

    if (req.query.id && req.query.id !== '') {
      const id = parseInt(req.query.id, 10);
      const { rows } = await query(
        'SELECT * FROM finova.receipts WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      if (!rows[0]) return fail(res, 'Receipt not found', 404);
      return ok(res, rows[0]);
    }

    let sql = 'SELECT * FROM finova.receipts WHERE user_id = $1';
    const params = [userId];
    let idx = 2;

    if (req.query.expense_id) {
      sql += ` AND expense_id = $${idx++}`;
      params.push(parseInt(req.query.expense_id, 10));
    }
    sql += ' ORDER BY created_at DESC';

    const { rows } = await query(sql, params);
    return ok(res, { receipts: rows });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

/** POST /api/receipts */
async function createReceipt(req, res) {
  const userId = req.userId;
  const body = req.body;

  if (!body.fileName) return fail(res, 'fileName is required', 400);
  if (!body.filePath) return fail(res, 'filePath is required', 400);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finova.receipts (user_id, expense_id, file_name, file_path, note, upload_date)
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE) RETURNING *`,
      [
        userId,
        body.expenseId ? parseInt(body.expenseId, 10) : null,
        body.fileName,
        body.filePath,
        body.note || null,
      ]
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

/** PUT /api/receipts?id= */
async function updateReceipt(req, res) {
  const userId = req.userId;
  if (!req.query.id || req.query.id === '') return fail(res, 'id is required', 400);
  const id = parseInt(req.query.id, 10);
  const body = req.body;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE finova.receipts SET
         expense_id = COALESCE($1, expense_id),
         note       = COALESCE($2, note)
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [
        body.expenseId ? parseInt(body.expenseId, 10) : null,
        body.note || null,
        id, userId,
      ]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return fail(res, 'Receipt not found', 404); }
    await client.query('COMMIT');
    return ok(res, rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    return fail(res, 'Database error: ' + err.message, 500);
  } finally {
    client.release();
  }
}

/** DELETE /api/receipts?id= */
async function deleteReceipt(req, res) {
  try {
    const userId = req.userId;
    if (!req.query.id || req.query.id === '') return fail(res, 'id is required', 400);
    const id = parseInt(req.query.id, 10);

    const { rows } = await query(
      'DELETE FROM finova.receipts WHERE id = $1 AND user_id = $2 RETURNING id, file_path',
      [id, userId]
    );
    if (!rows[0]) return fail(res, 'Receipt not found', 404);

    // Remove physical file (same as PHP unlink)
    if (rows[0].file_path) {
      const fullPath = path.join(__dirname, '..', '..', '..', rows[0].file_path);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) { /* silent */ }
      }
    }

    return ok(res, { deleted: true, id });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

module.exports = { getReceipts, createReceipt, updateReceipt, deleteReceipt };
