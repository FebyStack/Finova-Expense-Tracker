// src/routes/uploads.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { getUploads, createUpload, deleteUpload, UPLOAD_DIR } = require('../controllers/uploads.controller');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage config — replaces PHP move_uploaded_file()
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Same naming as PHP: uniqid(userId + '_', true) + ext
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${req.userId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

router.get('/uploads', requireAuth, getUploads);
router.post('/uploads', requireAuth, upload.single('file'), createUpload);
router.delete('/uploads', requireAuth, deleteUpload);

module.exports = router;
