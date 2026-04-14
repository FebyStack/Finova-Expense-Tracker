const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Middleware: requireAuth
 * Validates the Supabase JWT from the Authorization header.
 * Implementation: Verifies the JWT signature using SUPABASE_JWT_SECRET.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.substring(7);
  const secret = process.env.SUPABASE_JWT_SECRET;

  if (!secret || secret === 'YOUR_SUPABASE_JWT_SECRET_HERE') {
    console.error('[Auth] SUPABASE_JWT_SECRET is not configured in .env');
    return res.status(500).json({ success: false, error: 'Server authentication misconfigured' });
  }

  try {
    // Verify the signature and decode the payload
    // Supabase uses HS256 by default. jsonwebtoken handles this automatically.
    const payload = jwt.verify(token, secret);

    if (!payload || !payload.sub || !payload.email) {
      throw new Error('Invalid token contents');
    }

    // Map the Supabase JWT to our integer-based user table
    const { rows } = await query('SELECT id FROM finova.users WHERE email = $1', [payload.email.toLowerCase()]);
    
    if (!rows[0]) {
      return res.status(401).json({ success: false, error: 'User not found in database. Please log out and sign up.' });
    }

    req.userId = rows[0].id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Authentication failed: ' + err.message });
  }
}

/**
 * Optional auth — sets req.userId if token present, but doesn't reject if missing.
 * Used for endpoints like health check or config that work with or without auth.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return requireAuth(req, res, next);
  }
  req.userId = null;
  next();
}

module.exports = { requireAuth, optionalAuth };
