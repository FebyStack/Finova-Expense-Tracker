const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

const pool = new Pool({
  host:     'localhost',
  port:     5432,
  database: 'finova_db',
  user:     'postgres',
  password: 'bingbong321',
  ssl:     false,
});

const EXPORT_DIR = './firebase-export';
const BATCH_SIZE = 50;

function readJSON(file) {
  const filePath = path.join(EXPORT_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ ${file} not found, skipping.`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safeDate(val) {
  if (!val) return new Date();

  // Firestore Timestamp object
  if (val && typeof val === 'object' && val._seconds) {
    return new Date(val._seconds * 1000);
  }

  // Plain string or number
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ── USERS ────────────────────────────────────────────────
async function migrateUsers(client, users) {
  console.log(`\nMigrating ${users.length} users...`);
  let ok = 0, skipped = 0;

  for (const u of users) {
    try {
      await client.query('SAVEPOINT sp_user');

      const res = await client.query(`
        INSERT INTO finova.users
          (firebase_uid, email, display_name, base_currency, theme, created_at)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (firebase_uid) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          updated_at   = NOW()
        RETURNING id
      `, [
        u.uid,
        u.email ? u.email.toLowerCase().trim() : `${u.uid}@placeholder.local`,
        u.displayName || null,
        u.baseCurrency || 'PHP',
        u.theme        || 'light',
        safeDate(u.createdAt),
      ]);

      await client.query(
        `INSERT INTO finova.migration_log (table_name, firebase_id, pg_id)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        ['users', u.uid, res.rows[0].id]
      );

      await client.query('RELEASE SAVEPOINT sp_user');
      ok++;
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT sp_user');
      console.warn(`  ⚠ User ${u.uid}: ${err.message}`);
      skipped++;
    }
  }
  console.log(`  ✓ Users: ${ok} inserted, ${skipped} skipped`);
}

// ── EXPENSES ─────────────────────────────────────────────
async function migrateExpenses(client, expenses) {
  console.log(`\nMigrating ${expenses.length} expenses...`);
  let ok = 0, skipped = 0;

  for (let i = 0; i < expenses.length; i += BATCH_SIZE) {
    const batch = expenses.slice(i, i + BATCH_SIZE);

    for (const e of batch) {
      try {
        await client.query('SAVEPOINT sp_expense');

        const userRow = await client.query(
          'SELECT id FROM finova.users WHERE firebase_uid = $1',
          [e.uid]
        );
        if (!userRow.rows.length) {
          await client.query('RELEASE SAVEPOINT sp_expense');
          console.warn(`  ⚠ Expense ${e.firebase_id}: user ${e.uid} not found`);
          skipped++; continue;
        }

        const userId  = userRow.rows[0].id;
        const dateStr = e.date || new Date().toISOString().split('T')[0];
        const month   = e.month || dateStr.slice(0, 7);

        const res = await client.query(`
          INSERT INTO finova.expenses
            (firebase_id, user_id, amount, currency, category,
             date, month, note, recurring, frequency, receipt_path)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (firebase_id) DO NOTHING
          RETURNING id
        `, [
          e.firebase_id,
          userId,
          parseFloat(e.amount)  || 0,
          e.currency  || 'PHP',
          e.category  || 'Other',
          dateStr,
          month,
          e.note      || null,
          !!e.recurring,
          e.frequency || null,
          e.receiptURL|| null,
        ]);

        if (res.rows.length) {
          await client.query(
            `INSERT INTO finova.migration_log (table_name, firebase_id, pg_id)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            ['expenses', e.firebase_id, res.rows[0].id]
          );
          ok++;
        } else { skipped++; }

        await client.query('RELEASE SAVEPOINT sp_expense');

      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT sp_expense');
        console.warn(`  ⚠ Expense ${e.firebase_id}: ${err.message}`);
        skipped++;
      }
    }
    console.log(`  … ${Math.min(i + BATCH_SIZE, expenses.length)} / ${expenses.length}`);
  }
  console.log(`  ✓ Expenses: ${ok} inserted, ${skipped} skipped`);
}

// ── INCOME ───────────────────────────────────────────────
async function migrateIncome(client, income) {
  console.log(`\nMigrating ${income.length} income records...`);
  let ok = 0, skipped = 0;

  for (const e of income) {
    try {
      const userRow = await client.query(
        'SELECT id FROM finova.users WHERE firebase_uid = $1', [e.uid]
      );
      if (!userRow.rows.length) { skipped++; continue; }

      const userId  = userRow.rows[0].id;
      const dateStr = e.date || new Date().toISOString().split('T')[0];
      const month   = e.month || dateStr.slice(0, 7);

      const res = await client.query(`
        INSERT INTO finova.income
          (firebase_id, user_id, amount, currency, source, date, month, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (firebase_id) DO NOTHING
        RETURNING id
      `, [
        e.firebase_id,
        userId,
        parseFloat(e.amount) || 0,
        e.currency || 'PHP',
        e.source   || 'Other',
        dateStr,
        month,
        e.note     || null,
      ]);

      if (res.rows.length) {
        await client.query(
          `INSERT INTO finova.migration_log (table_name, firebase_id, pg_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          ['income', e.firebase_id, res.rows[0].id]
        );
        ok++;
      } else { skipped++; }
    } catch (err) {
      console.warn(`  ⚠ Income ${e.firebase_id}: ${err.message}`);
      skipped++;
    }
  }
  console.log(`  ✓ Income: ${ok} inserted, ${skipped} skipped`);
}

// ── BUDGETS ──────────────────────────────────────────────
async function migrateBudgets(client, budgets) {
  console.log(`\nMigrating ${budgets.length} budgets...`);
  let ok = 0, skipped = 0;

  for (const b of budgets) {
    try {
      const userRow = await client.query(
        'SELECT id FROM finova.users WHERE firebase_uid = $1', [b.uid]
      );
      if (!userRow.rows.length) { skipped++; continue; }

      const res = await client.query(`
        INSERT INTO finova.budgets
          (firebase_id, user_id, category, limit_amount, spent, month, year)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (firebase_id) DO NOTHING
        RETURNING id
      `, [
        b.firebase_id,
        userRow.rows[0].id,
        b.category    || 'Other',
        parseFloat(b.limitAmount) || 0,
        parseFloat(b.spent)       || 0,
        parseInt(b.month)         || new Date().getMonth() + 1,
        parseInt(b.year)          || new Date().getFullYear(),
      ]);

      if (res.rows.length) {
        await client.query(
          `INSERT INTO finova.migration_log (table_name, firebase_id, pg_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          ['budgets', b.firebase_id, res.rows[0].id]
        );
        ok++;
      } else { skipped++; }
    } catch (err) {
      console.warn(`  ⚠ Budget ${b.firebase_id}: ${err.message}`);
      skipped++;
    }
  }
  console.log(`  ✓ Budgets: ${ok} inserted, ${skipped} skipped`);
}

// ── SAVINGS ──────────────────────────────────────────────
async function migrateSavings(client, savings) {
  console.log(`\nMigrating ${savings.length} savings goals...`);
  let ok = 0, skipped = 0;

  for (const s of savings) {
    try {
      const userRow = await client.query(
        'SELECT id FROM finova.users WHERE firebase_uid = $1', [s.uid]
      );
      if (!userRow.rows.length) { skipped++; continue; }

      const res = await client.query(`
        INSERT INTO finova.savings_goals
          (firebase_id, user_id, name, target_amount, current_amount, deadline)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (firebase_id) DO NOTHING
        RETURNING id
      `, [
        s.firebase_id,
        userRow.rows[0].id,
        s.name                      || 'Unnamed Goal',
        parseFloat(s.targetAmount)  || 0,
        parseFloat(s.currentAmount) || 0,
        s.deadline                  || null,
      ]);

      if (res.rows.length) {
        await client.query(
          `INSERT INTO finova.migration_log (table_name, firebase_id, pg_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          ['savings_goals', s.firebase_id, res.rows[0].id]
        );
        ok++;
      } else { skipped++; }
    } catch (err) {
      console.warn(`  ⚠ Savings ${s.firebase_id}: ${err.message}`);
      skipped++;
    }
  }
  console.log(`  ✓ Savings: ${ok} inserted, ${skipped} skipped`);
}

// ── MAIN ─────────────────────────────────────────────────
async function runMigration() {
  console.log('====================================');
  console.log('  Finova — Firebase → PostgreSQL');
  console.log('====================================');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await migrateUsers(client,    readJSON('users.json'));
    await migrateExpenses(client, readJSON('expenses.json'));
    await migrateIncome(client,   readJSON('income.json'));
    await migrateBudgets(client,  readJSON('budgets.json'));
    await migrateSavings(client,  readJSON('savings.json'));

    await client.query('COMMIT');
    console.log('\n====================================');
    console.log('  Migration complete!');
    console.log('====================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n Migration FAILED — all changes rolled back.');
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }

  // Print final counts AFTER client is released
  const tables = ['users','expenses','income','budgets','savings_goals'];
  for (const t of tables) {
    const r = await pool.query(`SELECT COUNT(*) FROM finova.${t}`);
    console.log(`  ${t}: ${r.rows[0].count} rows`);
  }

  await pool.end();
}

runMigration();