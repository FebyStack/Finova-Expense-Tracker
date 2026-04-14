// src/controllers/uploads.controller.js
// File uploads CRUD — replaces api/uploads.php AND root upload.php
// Uses Multer for multipart handling (configured in the route file)
// Includes Firestore metadata sync (from upload.php)

const fs = require('fs');
const path = require('path');
const { query, getClient } = require('../config/database');
const { ok, fail } = require('../helpers/response');
const { firestoreUpsert } = require('../services/firestoreService');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'receipts');
const UPLOAD_URL = 'uploads/receipts/';
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

/** GET /api/uploads */
async function getUploads(req, res) {
  try {
    const userId = req.userId;

    if (req.query.id && req.query.id !== '') {
      const id = parseInt(req.query.id, 10);
      const { rows } = await query(
        'SELECT * FROM finova.uploads WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      if (!rows[0]) return fail(res, 'Upload not found', 404);
      return ok(res, rows[0]);
    }

    const { rows } = await query(
      'SELECT * FROM finova.uploads WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return ok(res, { uploads: rows });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

/**
 * POST /api/uploads — file upload via Multer
 * Combines logic from api/uploads.php + root upload.php
 * Saves file locally → writes to DB → mirrors metadata to Firestore
 */
async function createUpload(req, res) {
  const userId = req.userId;

  if (!req.file) {
    return fail(res, 'No file provided', 400);
  }

  const file = req.file;

  // Validate MIME type (same check as upload.php ALLOWED_MIME_TYPES)
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    // Clean up the uploaded file
    try { fs.unlinkSync(file.path); } catch (e) { /* silent */ }
    return fail(res, 'File type not allowed. Use JPG, PNG, GIF, WEBP, or PDF.', 400);
  }

  // Validate file size (same as upload.php MAX_FILE_SIZE)
  if (file.size > MAX_SIZE) {
    try { fs.unlinkSync(file.path); } catch (e) { /* silent */ }
    return fail(res, 'File too large — maximum 5 MB allowed', 400);
  }

  const relPath = UPLOAD_URL + file.filename;
  const publicPath = '/uploads/receipts/' + file.filename;
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const fileType = req.body.fileType || 'upload'; // receipt, upload, document

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finova.uploads (user_id, file_name, file_path, file_type, mime_type, file_size)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [userId, file.originalname, relPath, ext, file.mimetype, file.size]
    );
    await client.query('COMMIT');

    const record = rows[0];

    // Mirror metadata to Firestore (same as upload.php saveToFirestore)
    const metadata = {
      fileName: file.filename,
      originalName: file.originalname,
      filePath: publicPath,
      uploadDate: new Date().toISOString().split('T')[0],
      userId: String(userId),
      fileType,
      mimeType: file.mimetype,
      fileSize: file.size,
      createdAt: new Date().toISOString(),
    };

    // Fire-and-forget Firestore sync — don't block the response
    firestoreUpsert(String(userId), 'uploads', String(record.id), metadata)
      .catch(err => console.error('[Uploads] Firestore sync failed:', err.message));

    return ok(res, record, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    return fail(res, 'Database error: ' + err.message, 500);
  } finally {
    client.release();
  }
}

/** DELETE /api/uploads?id= */
async function deleteUpload(req, res) {
  try {
    const userId = req.userId;
    if (!req.query.id || req.query.id === '') return fail(res, 'id is required', 400);
    const id = parseInt(req.query.id, 10);

    const { rows } = await query(
      'DELETE FROM finova.uploads WHERE id = $1 AND user_id = $2 RETURNING id, file_path',
      [id, userId]
    );
    if (!rows[0]) return fail(res, 'Upload not found', 404);

    // Remove physical file
    if (rows[0].file_path) {
      const fullPath = path.join(__dirname, '..', '..', rows[0].file_path);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) { /* silent */ }
      }
    }

    return ok(res, { deleted: true, id });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

module.exports = { getUploads, createUpload, deleteUpload, UPLOAD_DIR };
