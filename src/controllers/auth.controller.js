// src/controllers/auth.controller.js
// Auth endpoints — replaces login.php, signup.php, logout.php, me.php

const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { ok, fail } = require('../helpers/response');

/**
 * POST /api/login
 * Replaces api/login.php
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return fail(res, 'Email and password are required');
    }

    const cleanEmail = email.trim().toLowerCase();

    const { rows } = await query(
      'SELECT * FROM finova.users WHERE email = $1',
      [cleanEmail]
    );
    const user = rows[0];

    // Note: PHP password_hash uses $2y$ but Node.js bcrypt expects $2a$ or $2b$. We patch it on the fly.
    const normalizedHash = user.password_hash ? user.password_hash.replace(/^\$2y\$/, '$2a$') : '';

    if (!user || !await bcrypt.compare(password, normalizedHash)) {
      return fail(res, 'Incorrect email or password', 401);
    }

    // Don't send password hash to frontend
    delete user.password_hash;

    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

/**
 * POST /api/signup
 * Replaces api/signup.php
 */
async function signup(req, res) {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return fail(res, 'Email and password are required');
    }

    const cleanEmail = email.trim().toLowerCase();
    const name = displayName ? displayName.trim() : 'User';

    if (password.length < 6) {
      return fail(res, 'Password must be at least 6 characters');
    }

    // Hash the password securely (bcrypt replaces PHP password_hash)
    const hash = await bcrypt.hash(password, 10);

    // Upsert — matches PHP ON CONFLICT (email) behavior
    const { rows } = await query(
      `INSERT INTO finova.users (email, password_hash, display_name, base_currency, theme)
       VALUES ($1, $2, $3, 'PHP', 'light')
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         display_name = COALESCE(finova.users.display_name, EXCLUDED.display_name)
       RETURNING *`,
      [cleanEmail, hash, name]
    );

    const user = rows[0];
    if (!user) return fail(res, 'Failed to create account', 500);

    delete user.password_hash;

    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

/**
 * POST /api/logout
 * Replaces api/logout.php
 * Stateless — just returns success (client clears token)
 */
async function logout(req, res) {
  return res.json({ success: true });
}

/**
 * GET /api/me
 * Replaces api/me.php
 * Uses JWT userId instead of PHP session
 */
async function me(req, res) {
  try {
    const { rows } = await query(
      'SELECT * FROM finova.users WHERE id = $1',
      [req.userId]
    );
    const user = rows[0];

    if (!user) return fail(res, 'User not found', 401);

    delete user.password_hash;

    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    return fail(res, 'Database error: ' + err.message, 500);
  }
}

module.exports = { login, signup, logout, me };
