// src/config/firebase.js
// Firebase Admin SDK initialization — replaces config/firebase.php + services/Firestore.php JWT logic
// The Admin SDK handles service account auth internally (no manual JWT signing needed)

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let initialized = false;

/**
 * Initialize Firebase Admin SDK using the service account key.
 * Safe to call multiple times — only initializes once.
 */
function initFirebase() {
  if (initialized) return;

  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'serviceAccountKey.json';
  const fullPath = path.resolve(__dirname, '..', '..', saPath);

  if (!fs.existsSync(fullPath)) {
    console.warn('[Firebase] serviceAccountKey.json not found at:', fullPath);
    console.warn('[Firebase] Firestore mirroring will be disabled.');
    return;
  }

  try {
    const serviceAccount = require(fullPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
    initialized = true;
    console.log('[Firebase] Admin SDK initialized successfully.');
  } catch (err) {
    console.error('[Firebase] Failed to initialize:', err.message);
  }
}

/**
 * Get a Firestore instance. Returns null if Firebase is not initialized.
 */
function getFirestore() {
  if (!initialized) return null;
  return admin.firestore();
}

function isFirebaseInitialized() {
  return initialized;
}

module.exports = { initFirebase, getFirestore, isFirebaseInitialized };
