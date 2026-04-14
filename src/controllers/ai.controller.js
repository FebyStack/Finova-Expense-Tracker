// src/controllers/ai.controller.js
// AI endpoints — replaces api/ai-insights.php, api/ai-chat.php, api/scan-receipt.php

const axios = require('axios');
const { query } = require('../config/database');
const { ok, fail } = require('../helpers/response');
const AIService = require('../services/aiService');

/**
 * GET /api/ai-insights?month=
 * Replaces api/ai-insights.php
 */
async function getAiInsights(req, res) {
  try {
    const userId = req.userId;
    const month = req.query.month || new Date().toISOString().substring(0, 7);
    const force = req.query.force === 'true';

    // 1. Data snapshot for cache comparison
    const snapResult = await query(
      `SELECT (COUNT(*) || '-' || COALESCE(MAX(id), 0) || '-' || COALESCE(SUM(amount), 0)) as snapshot
       FROM finova.expenses WHERE user_id = $1 AND month = $2`,
      [userId, month]
    );
    const currentSnapshot = snapResult.rows[0]?.snapshot || '';

    // 2. Cache check (24h + data snapshot)
    if (!force) {
      const cacheResult = await query(
        'SELECT insights_json, updated_at, data_snapshot FROM finova.ai_insights WHERE user_id = $1 AND month = $2',
        [userId, month]
      );
      const cached = cacheResult.rows[0];

      if (cached) {
        const updatedAt = new Date(cached.updated_at).getTime();
        const cachedSnapshot = cached.data_snapshot || '';
        const ageMs = Date.now() - updatedAt;

        if (cachedSnapshot === currentSnapshot && ageMs < 86400000) {
          const decoded = JSON.parse(cached.insights_json);
          decoded._cached = true;
          return ok(res, decoded);
        }
      }
    }

    // 3. AI Service execution
    const aiService = new AIService(userId);
    const summary = await aiService.getAutoFinancialSummary(month);

    if (!summary.hasData) {
      return ok(res, {
        summary: `No financial data found for ${month} to analyze yet.`,
        insights: [`Start adding your expenses for ${month} to see AI-powered trends.`],
        topCategory: null,
        recommendations: [],
        warning: null,
      });
    }

    // 4. Call Gemini
    const prompt = aiService.buildInsightsPrompt(month, summary);
    const text = await aiService.callGeminiApi(prompt, true);

    const parsed = JSON.parse(text);
    if (!parsed || !parsed.summary) {
      throw new Error('The AI response was processed but could not be parsed into valid dashboard insights.');
    }

    // 5. Update Cache
    await query(
      `INSERT INTO finova.ai_insights (user_id, month, insights_json, updated_at, data_snapshot)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (user_id, month)
       DO UPDATE SET insights_json = EXCLUDED.insights_json, updated_at = NOW(), data_snapshot = EXCLUDED.data_snapshot`,
      [userId, month, JSON.stringify(parsed), currentSnapshot]
    );

    parsed._cached = false;
    return ok(res, parsed);
  } catch (err) {
    if (err.message.includes('Database') || err.code) {
      console.error('Database Error in ai-insights:', err.message);
      return fail(res, 'AI Insights system encountered a database error. Please try again later.', 500);
    }

    console.error('AI Insights Exception:', err.message);
    return ok(res, {
      success: false,
      error: 'AI insights temporarily limited: ' + err.message,
      summary: 'Spending Insights are currently unavailable due to high AI service demand. Please check back in a few moments.',
      insights: [],
      recommendations: [],
      warning: null,
    }, 200);
  }
}

/**
 * POST /api/ai-chat
 * Replaces api/ai-chat.php
 */
async function aiChat(req, res) {
  try {
    const userId = req.userId;
    const { message } = req.body;
    if (!message) return fail(res, 'message is required', 400);

    const month = new Date().toISOString().substring(0, 7);
    const aiService = new AIService(userId);

    // 1. Fetch Chat History (Last 5)
    const histResult = await query(
      `SELECT message, response FROM finova.ai_chat_logs
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );
    const history = histResult.rows.reverse(); // Chronological order

    // 2. Financial Summary
    const summary = await aiService.getUserFinancialSummary(month);

    // 3. Build prompt
    const prompt = aiService.buildChatPrompt(message, history, summary);

    // 4. Call Gemini (text mode)
    const reply = await aiService.callGeminiApi(prompt, false);

    // 5. Log interaction
    await query(
      `INSERT INTO finova.ai_chat_logs (user_id, message, response, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, message, reply]
    );

    return ok(res, { reply });
  } catch (err) {
    return fail(res, 'Server error: ' + err.message, 500);
  }
}

/**
 * POST /api/scan-receipt
 * Replaces api/scan-receipt.php
 * Anthropic (primary) → Gemini (fallback)
 */
async function scanReceipt(req, res) {
  try {
    const { image_base64, mime_type } = req.body;
    if (!image_base64 || !mime_type) {
      return fail(res, 'Missing image_base64 or mime_type', 400);
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY || null;
    const geminiKey = process.env.GEMINI_API_KEY || null;

    const prompt = `Analyze this receipt image and extract the following information. Respond ONLY with a valid JSON object, no markdown, no explanation.

{
  "merchant": "store or restaurant name",
  "date": "YYYY-MM-DD format, or null if not found",
  "total": number (the final total amount paid, as a number only),
  "currency": "PHP, USD, EUR, etc — detect from symbols like ₱ = PHP, $ = USD",
  "items": ["list", "of", "items", "purchased"],
  "tax": number or null,
  "confidence": "high, medium, or low"
}

Rules:
- total must be the FINAL amount paid (after tax, after discounts)
- If you see ₱ symbol, currency is PHP
- date must be YYYY-MM-DD format
- If any field cannot be determined, use null
- items should be actual product names, max 5 items`;

    let text = '';

    if (anthropicKey) {
      // Anthropic (primary)
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime_type, data: image_base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 15000,
      });
      text = response.data?.content?.[0]?.text || '';
    } else if (geminiKey) {
      // Gemini (fallback)
      const model = 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

      const response = await axios.post(url, {
        contents: [{
          parts: [
            { inline_data: { mime_type, data: image_base64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      return fail(res, 'No AI keys configured. Please add GEMINI_API_KEY or ANTHROPIC_API_KEY to your .env file.', 500);
    }

    return ok(res, { text });
  } catch (err) {
    if (err.response) {
      const msg = err.response.data?.error?.message || 'Unknown API error';
      return fail(res, `AI API error: ${msg}`, 500);
    }
    return fail(res, 'Server Error: ' + err.message, 500);
  }
}

module.exports = { getAiInsights, aiChat, scanReceipt };
