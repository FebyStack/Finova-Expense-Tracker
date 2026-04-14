// src/controllers/push.controller.js
// Push notification endpoints — replaces get-vapid.php, save-subscription.php, send-budget-alert.php

const webPush = require('web-push');
const { query } = require('../config/database');
const { ok, fail } = require('../helpers/response');

/**
 * GET /api/get-vapid
 * Returns the VAPID public key for the frontend Push API
 */
async function getVapid(req, res) {
  const pubKey = process.env.VAPID_PUBLIC_KEY;
  if (pubKey) {
    return res.json({ success: true, publicKey: pubKey });
  }
  return res.status(500).json({ success: false, error: 'VAPID key not configured' });
}

/**
 * POST /api/save-subscription
 * Upserts a push subscription endpoint for the authenticated user
 */
async function saveSubscription(req, res) {
  try {
    const userId = req.userId;
    const { subscription } = req.body;

    if (!subscription) return fail(res, 'Invalid payload', 400);

    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return fail(res, 'Invalid subscription data', 400);
    }

    await query(
      `INSERT INTO finova.push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         keys_p256dh = EXCLUDED.keys_p256dh,
         keys_auth = EXCLUDED.keys_auth`,
      [userId, endpoint, p256dh, auth]
    );

    return res.json({ success: true });
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

/**
 * POST /api/send-budget-alert
 * Sends a web push notification using the web-push npm package
 */
async function sendBudgetAlert(req, res) {
  try {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;

    if (!pub || !priv) throw new Error('VAPID Keys missing in .env');

    const userId = req.userId;

    // Get latest subscription
    const { rows } = await query(
      `SELECT endpoint, keys_p256dh, keys_auth FROM finova.push_subscriptions
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const subData = rows[0];

    if (!subData) {
      return res.json({ success: false, error: 'No push subscription found for this user' });
    }

    // Configure web-push
    webPush.setVapidDetails('mailto:admin@finova.com', pub, priv);

    const subscription = {
      endpoint: subData.endpoint,
      keys: {
        p256dh: subData.keys_p256dh,
        auth: subData.keys_auth,
      },
    };

    const payload = JSON.stringify({
      title: '⚠️ Budget Alert!',
      body: 'You just hit 80% of your Food and Dining budget for this month. Be careful!',
      url: '/dashboard.html',
    });

    await webPush.sendNotification(subscription, payload);
    return res.json({ success: true, message: 'Test Notification Pushed!' });
  } catch (err) {
    if (err.statusCode) {
      return res.json({ success: false, error: err.body || err.message });
    }
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getVapid, saveSubscription, sendBudgetAlert };
