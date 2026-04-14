// src/services/firestoreService.js
// Firestore mirror service — replaces services/Firestore.php
// Uses Firebase Admin SDK instead of manual JWT + cURL REST calls

const fs = require('fs');
const path = require('path');
const { getFirestore, isFirebaseInitialized } = require('../config/firebase');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

/**
 * Log Firestore operations to logs/firestore.log
 * Same format as PHP _firestore_log()
 */
function fsLog(method, docPath, statusCode, detail) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const line = `[${timestamp}] ${method.padEnd(6)} ${docPath} → ${statusCode} | ${detail}\n`;
    fs.appendFileSync(path.join(LOG_DIR, 'firestore.log'), line);
  } catch (e) {
    // Silent fail for logging
  }
}

/**
 * Upsert (create or overwrite) a Firestore document.
 * Path: users/{uid}/{collection}/{docId}
 * Replaces PHP firestore_upsert()
 */
async function firestoreUpsert(uid, collection, docId, data) {
  if (!isFirebaseInitialized()) {
    fsLog('SKIP', `${uid}/${collection}/${docId}`, 0, 'Firebase not initialized');
    return false;
  }

  try {
    const db = getFirestore();
    const docRef = db.collection('users').doc(uid)
      .collection(collection).doc(String(docId));

    // Add _syncedAt timestamp (matches PHP _to_firestore_fields)
    const payload = { ...data, _syncedAt: Math.floor(Date.now() / 1000) };

    await docRef.set(payload, { merge: true });
    fsLog('PATCH', `users/${uid}/${collection}/${docId}`, 200, 'OK');
    return true;
  } catch (err) {
    fsLog('ERROR', `${uid}/${collection}/${docId}`, 0, err.message);
    return false;
  }
}

/**
 * Delete a Firestore document.
 * Replaces PHP firestore_delete()
 */
async function firestoreDelete(uid, collection, docId) {
  if (!isFirebaseInitialized()) {
    fsLog('SKIP', `${uid}/${collection}/${docId}`, 0, 'Firebase not initialized');
    return false;
  }

  try {
    const db = getFirestore();
    const docRef = db.collection('users').doc(uid)
      .collection(collection).doc(String(docId));

    await docRef.delete();
    fsLog('DELETE', `users/${uid}/${collection}/${docId}`, 200, 'OK');
    return true;
  } catch (err) {
    // 404 = already gone, treat as success (same as PHP)
    fsLog('DELETE', `users/${uid}/${collection}/${docId}`, 0, err.message);
    return true;
  }
}

module.exports = { firestoreUpsert, firestoreDelete, fsLog };
