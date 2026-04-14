// src/services/syncQueue.js
// Sync queue service — replaces logic in sync_now.php and sync_status.php
// Manages the finova.sync_queue table for offline → Firestore mirroring

const axios = require('axios');
const { query, getClient } = require('../config/database');
const { firestoreUpsert, firestoreDelete, fsLog } = require('./firestoreService');

// Max retry attempts before abandoning a sync item (same as PHP SYNC_MAX_ATTEMPTS)
const SYNC_MAX_ATTEMPTS = 5;

/**
 * Check if the server has internet connectivity.
 * Replaces PHP is_online() function.
 */
async function isOnline() {
  try {
    await axios.get('https://www.google.com', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get count of pending items in the sync queue.
 */
async function getPendingCount() {
  const res = await query(
    `SELECT COUNT(*) FROM finova.sync_queue
     WHERE synced_at IS NULL AND attempts < $1`,
    [SYNC_MAX_ATTEMPTS]
  );
  return parseInt(res.rows[0].count, 10);
}

/**
 * Get count of abandoned items (exceeded max attempts).
 */
async function getAbandonedCount() {
  const res = await query(
    `SELECT COUNT(*) FROM finova.sync_queue
     WHERE synced_at IS NULL AND attempts >= $1`,
    [SYNC_MAX_ATTEMPTS]
  );
  return parseInt(res.rows[0].count, 10);
}

/**
 * Get count of items synced today.
 */
async function getSyncedTodayCount() {
  const res = await query(
    `SELECT COUNT(*) FROM finova.sync_queue
     WHERE synced_at >= CURRENT_DATE`
  );
  return parseInt(res.rows[0].count, 10);
}

/**
 * Mark a sync queue item as successfully synced.
 */
async function markSynced(id) {
  await query(
    `UPDATE finova.sync_queue SET synced_at = NOW() WHERE id = $1`,
    [id]
  );
}

/**
 * Mark a sync queue item as failed (increment attempts, record error).
 */
async function markFailed(id, reason) {
  await query(
    `UPDATE finova.sync_queue
     SET attempts = attempts + 1, last_error = $2
     WHERE id = $1`,
    [id, reason]
  );
}

/**
 * Process all pending sync queue items → push to Firestore.
 * Replaces sync_now.php logic.
 * Returns { total, synced, failed, remaining, results }
 */
async function processSyncQueue() {
  // 1. Fetch pending items
  const { rows: items } = await query(
    `SELECT * FROM finova.sync_queue
     WHERE synced_at IS NULL AND attempts < $1
     ORDER BY created_at ASC LIMIT 100`,
    [SYNC_MAX_ATTEMPTS]
  );

  const total = items.length;
  let synced = 0;
  let failed = 0;
  const results = [];

  // 2. Process each item
  for (const item of items) {
    const docPath = `users/${item.uid}/${item.collection}/${item.doc_id}`;
    let success = false;

    try {
      if (item.operation === 'upsert') {
        let payload;
        try {
          payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
        } catch {
          payload = null;
        }

        if (!payload) {
          await markFailed(item.id, 'Empty payload');
          results.push({ id: item.id, status: 'skipped', reason: 'empty payload' });
          failed++;
          continue;
        }

        success = await firestoreUpsert(item.uid, item.collection, item.doc_id, payload);
      } else if (item.operation === 'delete') {
        success = await firestoreDelete(item.uid, item.collection, item.doc_id);
        if (!success) success = true; // 404 = already gone
      }

      if (success) {
        await markSynced(item.id);
        results.push({
          id: item.id,
          status: 'synced',
          collection: item.collection,
          doc_id: item.doc_id,
          operation: item.operation,
          attempts: parseInt(item.attempts, 10) + 1,
        });
        synced++;
      } else {
        await markFailed(item.id, 'Firestore returned error on manual sync');
        results.push({
          id: item.id,
          status: 'failed',
          collection: item.collection,
          doc_id: item.doc_id,
        });
        failed++;
      }
    } catch (err) {
      await markFailed(item.id, err.message);
      results.push({ id: item.id, status: 'error', reason: err.message });
      failed++;
    }
  }

  // 3. Count remaining
  const remaining = await getPendingCount();

  fsLog('MANUAL_SYNC', 'queue', 200,
    `Manual sync: ${synced} synced, ${failed} failed out of ${total} total`);

  return { total, synced, failed, remaining, results };
}

module.exports = {
  SYNC_MAX_ATTEMPTS,
  isOnline,
  getPendingCount,
  getAbandonedCount,
  getSyncedTodayCount,
  markSynced,
  markFailed,
  processSyncQueue,
};
