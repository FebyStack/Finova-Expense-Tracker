// src/controllers/utils.controller.js
// Utility endpoints — replaces api/fix_month_labels.php and api/check_data.php

const { query, getClient } = require('../config/database');
const { ok, fail } = require('../helpers/response');

/**
 * POST /api/fix-month-labels
 * Corrects month field (YYYY-MM) to match first 7 chars of date (YYYY-MM-DD)
 * Replaces api/fix_month_labels.php
 */
async function fixMonthLabels(req, res) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Fix Expenses
    const expResult = await client.query('SELECT id, date, month FROM finova.expenses');
    let updatedEx = 0;
    for (const ex of expResult.rows) {
      if (!ex.date) continue;
      const correctMonth = ex.date.substring(0, 7);
      if (ex.month !== correctMonth) {
        await client.query('UPDATE finova.expenses SET month = $1 WHERE id = $2', [correctMonth, ex.id]);
        updatedEx++;
      }
    }

    // 2. Fix Income
    const incResult = await client.query('SELECT id, date, month FROM finova.income');
    let updatedIn = 0;
    for (const inc of incResult.rows) {
      if (!inc.date) continue;
      const correctMonth = inc.date.substring(0, 7);
      if (inc.month !== correctMonth) {
        await client.query('UPDATE finova.income SET month = $1 WHERE id = $2', [correctMonth, inc.id]);
        updatedIn++;
      }
    }

    await client.query('COMMIT');

    return ok(res, {
      message: 'Month-label synchronization complete',
      expenses_updated: updatedEx,
      income_updated: updatedIn,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return fail(res, 'Error: ' + err.message, 500);
  } finally {
    client.release();
  }
}

/**
 * GET /api/check-data
 * Returns users/expenses/income counts and sample data
 * Replaces api/check_data.php
 */
async function checkData(req, res) {
  try {
    const result = { users: [], expenses: [], income: [] };

    const usersResult = await query('SELECT id, email FROM finova.users');
    result.users = usersResult.rows;

    const expensesResult = await query('SELECT * FROM finova.expenses');
    result.expenses = expensesResult.rows;

    const incomeResult = await query('SELECT * FROM finova.income');
    result.income = incomeResult.rows;

    return res.json(result);
  } catch (err) {
    return res.json({ error: err.message });
  }
}

module.exports = { fixMonthLabels, checkData };
