// src/controllers/config.controller.js
// Config endpoints — replaces api/config-supabase.php and api/config-js.php

/**
 * GET /api/config-supabase
 * Returns Supabase URL and anon key as JSON
 */
async function configSupabase(req, res) {
  let url = process.env.SUPABASE_URL || null;
  const anonKey = process.env.SUPABASE_ANON_KEY || null;

  // Fallback: derive URL from DB_PROD_HOST
  if (!url) {
    const host = process.env.DB_PROD_HOST || '';
    if (host.startsWith('db.')) {
      const projectId = host.replace('db.', '').replace('.supabase.co', '');
      url = `https://${projectId}.supabase.co`;
    }
  }

  return res.json({ url, anonKey });
}

/**
 * GET /api/config-js
 * Returns a JS snippet that sets window.SUPABASE_CONFIG
 * Content-Type: application/javascript
 */
async function configJs(req, res) {
  let url = process.env.SUPABASE_URL || null;
  const anonKey = process.env.SUPABASE_ANON_KEY || null;

  // Fallback derivation
  if (!url) {
    const host = process.env.DB_PROD_HOST || '';
    if (host.startsWith('db.')) {
      const projectId = host.replace('db.', '').replace('.supabase.co', '');
      url = `https://${projectId}.supabase.co`;
    }
  }

  // Detect current hostname for API calls
  const protocol = req.protocol;
  const host = req.get('host');
  const apiBaseUrl = `${protocol}://${host}`;

  res.setHeader('Content-Type', 'application/javascript');
  return res.send(`
    window.SUPABASE_CONFIG = {
      url: ${JSON.stringify(url)},
      anonKey: ${JSON.stringify(anonKey)}
    };
    window.API_BASE_URL = ${JSON.stringify(apiBaseUrl)};
    console.log('[Config] API Base URL set to:', window.API_BASE_URL);
  `);
}

module.exports = { configSupabase, configJs };
