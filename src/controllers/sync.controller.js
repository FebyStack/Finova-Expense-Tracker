// src/controllers/sync.controller.js
// Sync endpoints — replaces api/sync.php, api/sync_status.php, api/sync_now.php
// Handles batch push (POST), pull (GET), status, and manual sync-now

const { query, getClient } = require('../config/database');
const { ok, fail } = require('../helpers/response');
const { isOnline, getPendingCount, getAbandonedCount, getSyncedTodayCount, processSyncQueue } = require('../services/syncQueue');

// ─── Table mapping (same as PHP) ──────────────────────────
const TABLE_MAP = {
  expenses: 'finova.expenses',
  income: 'finova.income',
  budgets: 'finova.budgets',
  savings: 'finova.savings_goals',
  categories: 'finova.categories',
  notifications: 'finova.notifications',
};

const BLOCKED_COLUMNS = ['sync_status', 'local_id', '_data', 'compressed'];

const COLUMN_WHITELISTS = {
  expenses: ['id','user_id','amount','currency','category','date','month','note','recurring','frequency','receipt_path','created_at','updated_at','receipt_data'],
  income: ['id','user_id','amount','currency','source','date','month','note','created_at','updated_at'],
  budgets: ['id','user_id','category','limit_amount','spent','month','year','created_at','updated_at'],
  savings: ['id','user_id','name','target_amount','current_amount','deadline','created_at','updated_at'],
  categories: ['id','user_id','items','updated_at'],
  notifications: ['id', 'user_id', 'notification_key', 'title', 'message', 'type', 'is_read', 'created_at'],
};

// ─── camelCase → snake_case remapping ─────────────────────
const CAMEL_TO_SNAKE = {
  receiptData: 'receipt_data',
  receiptPath: 'receipt_path',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  userId: 'user_id',
  targetAmount: 'target_amount',
  currentAmount: 'current_amount',
  limitAmount: 'limit_amount',
  spent: 'spent',
};

/**
 * Sanitize payload before DB insert — mirrors PHP sanitizePayload()
 */
function sanitizePayload(payload, table) {
  // 1. Remap camelCase → snake_case
  for (const [camel, snake] of Object.entries(CAMEL_TO_SNAKE)) {
    if (camel in payload) {
      payload[snake] = payload[camel];
      delete payload[camel];
    }
  }

  // 2. Defaulting essential values before whitelisting
  if (table === 'expenses') {
    payload.date = payload.date || new Date().toISOString().substring(0, 10);
    payload.month = payload.month || payload.date.substring(0, 7);
    payload.currency = (payload.currency || 'PHP').substring(0, 3).padEnd(3);
    payload.category = (payload.category || 'Other').substring(0, 100);
    payload.note = payload.note || '';
    
    // Amount Guard (check amount >= 0)
    const rawAmt = parseFloat(payload.amount);
    payload.amount = isNaN(rawAmt) || rawAmt < 0 ? 0.0 : rawAmt;
    
    payload.recurring = !!payload.recurring;

    // Frequency Array Validation
    const validFreqs = ['daily', 'weekly', 'monthly', 'yearly'];
    if (payload.frequency && !validFreqs.includes(payload.frequency.toLowerCase())) {
      payload.frequency = null;
    } else if (payload.frequency) {
      payload.frequency = payload.frequency.toLowerCase();
    }
  } else if (table === 'income') {
    payload.date = payload.date || new Date().toISOString().substring(0, 10);
    payload.month = payload.month || payload.date.substring(0, 7);
    payload.currency = (payload.currency || 'PHP').substring(0, 3).padEnd(3);
    payload.source = (payload.source || 'General').substring(0, 150);
    payload.note = payload.note || '';
    
    // Amount Guard (check amount >= 0)
    const rawAmt = parseFloat(payload.amount);
    payload.amount = isNaN(rawAmt) || rawAmt < 0 ? 0.0 : rawAmt;
  } else if (table === 'budgets') {
    // Map Frontend names to DB names
    if (payload.limitAmount !== undefined) {
      payload.limit_amount = parseFloat(payload.limitAmount);
      delete payload.limitAmount;
    } else if (payload.amount !== undefined) {
      payload.limit_amount = parseFloat(payload.amount);
      delete payload.amount;
    }

    // ENSURE VALUES ARE NEVER NULL (Not-Null Constraint Guard)
    payload.limit_amount = isNaN(parseFloat(payload.limit_amount)) ? 0.0 : parseFloat(payload.limit_amount);
    payload.spent = isNaN(parseFloat(payload.spent)) ? 0.0 : parseFloat(payload.spent);

    payload.month = parseInt(payload.month) || (new Date().getMonth() + 1);
    payload.year = parseInt(payload.year) || new Date().getFullYear();
    payload.category = payload.category || 'Other';
  } else if (table === 'savings') {
    payload.name = payload.name || 'Savings Goal';
    payload.currency = (payload.currency || 'PHP').substring(0, 3).padEnd(3);
    
    // Ensure numbers are valid and satisfy target_amount > 0 constraint
    const rawTarget = parseFloat(payload.target_amount);
    payload.target_amount = isNaN(rawTarget) || rawTarget <= 0 ? 1.0 : rawTarget;
    
    const rawCurrent = parseFloat(payload.current_amount);
    payload.current_amount = isNaN(rawCurrent) || rawCurrent < 0 ? 0.0 : rawCurrent;
  } else if (table === 'notifications') {
    payload.title = (payload.title || 'Notification').substring(0, 255);
    payload.message = payload.message || '';
    payload.type = ['info', 'warning', 'success', 'danger'].includes(payload.type) ? payload.type : 'info';
    payload.is_read = !!payload.is_read;
    // notification_key is essential for unique constraint
    payload.notification_key = payload.notification_key || `local_${Date.now()}`;
  }

  // 3. Strip blocked columns
  for (const col of BLOCKED_COLUMNS) {
    delete payload[col];
  }

  // 4. Whitelist columns per table
  const whitelist = COLUMN_WHITELISTS[table];
  if (whitelist) {
    const filtered = {};
    for (const key of whitelist) {
      if (payload[key] !== undefined) {
        filtered[key] = payload[key];
      }
    }
    payload = filtered;
  }

  return payload;
}

/**
 * POST /api/sync — batch push
 * Replaces sync.php POST handler
 */
async function syncPush(req, res) {
  const userId = req.userId;
  const data = req.body;

  if (!data.batch || !Array.isArray(data.batch)) {
    return fail(res, 'Invalid sync batch format');
  }

  const results = { success: true, applied: [], errors: [] };
  const client = await getClient();

  try {
    await client.query('BEGIN');

    for (const operation of data.batch) {
      const table = operation.table || '';
      const action = operation.action || '';
      let payload = operation.payload || {};
      const localId = operation.localId || null;

      if (!TABLE_MAP[table]) {
        results.errors.push(`Unsupported table: ${table}`);
        continue;
      }

      const dbTable = TABLE_MAP[table];
      payload = sanitizePayload({ ...payload }, table);
      payload.user_id = userId;

      if (action === 'upsert') {
        // Strip non-integer IDs (local_xxx)
        if (payload.id && !/^\d+$/.test(String(payload.id))) {
          delete payload.id;
        }

        const cols = Object.keys(payload);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const updates = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`);

        // Handle composite conflict keys for specific tables
        let conflictClause = '(id)';
        if (table === 'budgets') {
          conflictClause = '(user_id, category, month, year)';
        } else if (table === 'categories') {
          conflictClause = '(user_id)';
        } else if (table === 'notifications') {
          conflictClause = '(user_id, notification_key)';
        }

        const sql = `INSERT INTO ${dbTable} (${cols.join(', ')})
                     VALUES (${placeholders.join(', ')})
                     ON CONFLICT ${conflictClause} DO UPDATE SET ${updates.join(', ')}
                     RETURNING id`;

        try {
          const { rows } = await client.query(sql, cols.map(c => payload[c]));
          results.applied.push({
            localId,
            serverId: rows[0]?.id || null,
            status: 'synced',
            table,
          });
        } catch (err) {
          console.error(`Upsert failed on ${dbTable}:`, err.message, '| payload:', JSON.stringify(payload));
          results.errors.push(`Failed to upsert into ${table}: ${err.message}`);
        }
      } else if (action === 'delete') {
        const id = payload.id;

        // local_xxx id was never persisted — just acknowledge
        if (!id || !/^\d+$/.test(String(id))) {
          results.applied.push({ localId, status: 'deleted', table });
          continue;
        }

        await client.query(
          `DELETE FROM ${dbTable} WHERE id = $1 AND user_id = $2`,
          [parseInt(id, 10), userId]
        );
        results.applied.push({ localId, status: 'deleted', table });
      } else {
        results.errors.push(`Unknown action '${action}' on ${table}`);
      }
    }

    await client.query('COMMIT');
    return res.json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sync failed:', err.message);
    return fail(res, 'Sync failed: ' + err.message, 500);
  } finally {
    client.release();
  }
}

/**
 * GET /api/sync — pull data
 * Replaces sync.php GET handler
 */
async function syncPull(req, res) {
  try {
    const userId = req.userId;
    const since = req.query.since || null;
    const fullData = { success: true, data: {}, warnings: [] };

    for (const [frontendKey, dbTable] of Object.entries(TABLE_MAP)) {
      try {
        let rows;
        if (since) {
          const result = await query(
            `SELECT * FROM ${dbTable} WHERE user_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
            [userId, since]
          );
          rows = result.rows;
        } else {
          const sort = frontendKey === 'categories' ? 'updated_at' : 'created_at';
          const result = await query(
            `SELECT * FROM ${dbTable} WHERE user_id = $1 ORDER BY ${sort} DESC`,
            [userId]
          );
          rows = result.rows;
        }
        fullData.data[frontendKey] = rows;
      } catch (tableErr) {
        console.error(`Pull failed for ${dbTable}:`, tableErr.message);
        fullData.data[frontendKey] = [];
        fullData.warnings.push(`Could not load ${frontendKey}`);
      }
    }

    return res.json(fullData);
  } catch (err) {
    return fail(res, 'Sync failed: ' + err.message, 500);
  }
}

/**
 * GET /api/sync-status
 * Replaces api/sync_status.php
 */
async function syncStatus(req, res) {
  try {
    const pending = await getPendingCount();
    const abandoned = await getAbandonedCount();
    const syncedToday = await getSyncedTodayCount();
    const online = await isOnline();

    return res.json({
      success: true,
      online,
      pending,
      abandoned,
      syncedToday,
    });
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

/**
 * POST /api/sync-now
 * Replaces api/sync_now.php — drains the queue to Firestore
 */
async function syncNow(req, res) {
  try {
    const online = await isOnline();
    if (!online) {
      return res.status(503).json({
        success: false,
        error: 'No internet connection. Items remain queued.',
        online: false,
      });
    }

    const result = await processSyncQueue();
    return res.json({ success: true, ...result });
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

module.exports = { syncPush, syncPull, syncStatus, syncNow };
