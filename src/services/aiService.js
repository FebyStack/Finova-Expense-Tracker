// src/services/aiService.js
// AI Service — replaces services/aiService.php
// Handles Gemini + Anthropic API calls, financial summaries, prompt building

const axios = require('axios');
const { query } = require('../config/database');

class AIService {
  constructor(userId) {
    this.userId = userId;
  }

  // ─── Environment Variable Helper ─────────────────────────
  static getEnvVar(key) {
    return process.env[key] || null;
  }

  // ─── Financial Summary (auto-fallback to last 30 days) ───
  async getAutoFinancialSummary(month) {
    let summary = await this.getUserFinancialSummary(month);
    if (!summary.hasData) {
      summary = await this.getUserFinancialSummaryByDays(30);
    }
    return summary;
  }

  async getUserFinancialSummaryByDays(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const { rows: expenses } = await query(
      `SELECT amount, category, date, note FROM finova.expenses
       WHERE user_id = $1 AND date >= $2 AND amount > 0`,
      [this.userId, startDateStr]
    );

    const summary = this._processFinancialData(expenses, `the last ${days} days`);
    return this._enrichSummary(summary, 'last30days', startDateStr);
  }

  async getUserFinancialSummary(month) {
    const { rows: expenses } = await query(
      `SELECT amount, category, date, note FROM finova.expenses
       WHERE user_id = $1 AND month = $2 AND amount > 0`,
      [this.userId, month]
    );

    const summary = this._processFinancialData(expenses, month);
    if (summary.hasData) {
      return this._enrichSummary(summary, 'month', month);
    }
    return summary;
  }

  // ─── Process raw expense data into summary ───────────────
  _processFinancialData(expenses, periodLabel) {
    if (expenses.length === 0) {
      return {
        hasData: false,
        total: 0,
        transactions: 0,
        categories: {},
        topCategoryName: 'None',
        topCategoryAmt: 0,
        categoryString: `No expenses recorded for ${periodLabel}.`,
        periodLabel,
      };
    }

    let total = 0;
    const categories = {};
    for (const exp of expenses) {
      const amt = parseFloat(exp.amount);
      const cat = exp.category || 'Other';
      total += amt;
      categories[cat] = (categories[cat] || 0) + amt;
    }

    // Sort categories descending by amount
    const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    const topCategoryName = sorted[0][0];
    const topCategoryAmt = sorted[0][1];

    let catString = '';
    for (const [c, a] of sorted) {
      catString += `- ${c}: ${a}\n`;
    }

    return {
      hasData: true,
      total,
      transactions: expenses.length,
      categories: Object.fromEntries(sorted),
      topCategoryName,
      topCategoryAmt,
      categoryString: catString,
      periodLabel,
    };
  }

  // ─── Enrich summary with income, savings, budgets, subscriptions ──
  async _enrichSummary(summary, type, value) {
    // Fetch Income
    let totalIncome = 0;
    try {
      if (type === 'month') {
        const res = await query(
          'SELECT SUM(amount) as total_income FROM finova.income WHERE user_id = $1 AND month = $2',
          [this.userId, value]
        );
        totalIncome = parseFloat(res.rows[0]?.total_income || 0);
      } else {
        const res = await query(
          'SELECT SUM(amount) as total_income FROM finova.income WHERE user_id = $1 AND date >= $2',
          [this.userId, value]
        );
        totalIncome = parseFloat(res.rows[0]?.total_income || 0);
      }
    } catch (e) { /* ignore */ }

    // Fetch Savings
    let totalSavings = 0;
    try {
      const res = await query(
        'SELECT SUM(current_amount) as total FROM finova.savings_goals WHERE user_id = $1',
        [this.userId]
      );
      totalSavings = parseFloat(res.rows[0]?.total || 0);
    } catch (e) { /* ignore */ }

    // Fetch Budgets (only for month type)
    let totalBudget = 0;
    let budgetString = 'No budgets set.';
    if (type === 'month') {
      try {
        const res = await query(
          'SELECT category, amount FROM finova.budgets WHERE user_id = $1 AND month = $2',
          [this.userId, value]
        );
        if (res.rows.length > 0) {
          budgetString = '';
          for (const b of res.rows) {
            totalBudget += parseFloat(b.amount);
            const spent = summary.categories[b.category] || 0;
            const rem = parseFloat(b.amount) - spent;
            budgetString += `- ${b.category}: Budget ₱${b.amount}, Remaining: ₱${rem}\n`;
          }
        }
      } catch (e) { /* ignore */ }
    }

    // Fetch Subscriptions (recurring expenses)
    let subString = 'No active subscriptions.';
    try {
      const res = await query(
        'SELECT note, amount, frequency FROM finova.expenses WHERE user_id = $1 AND recurring = true',
        [this.userId]
      );
      if (res.rows.length > 0) {
        subString = '';
        for (const s of res.rows) {
          subString += `- ${s.note}: ₱${s.amount} (${s.frequency})\n`;
        }
      }
    } catch (e) { /* ignore */ }

    return {
      ...summary,
      totalIncome,
      netBalance: totalIncome - summary.total,
      savings: totalSavings,
      budgetRemaining: totalBudget - summary.total,
      categoryBudgets: budgetString,
      subscriptions: subString,
      hasData: true,
    };
  }

  // ─── Prompt Builders ─────────────────────────────────────

  buildInsightsPrompt(month, summary) {
    const period = summary.periodLabel || month;
    return `You are a financial assistant AI.
Analyze the user's spending data for ${period} and provide insights.

DATA:
- Period: ${period}
- Total Spending: ${summary.total}
- Number of Transactions: ${summary.transactions}
- Category Breakdown:
${summary.categoryString}

Your response MUST be a VALID JSON OBJECT with NO markdown formatting.
{
  "summary": "overview",
  "insights": ["point1", "point2"],
  "topCategory": {"name": "${summary.topCategoryName}", "reason": "why"},
  "recommendations": ["tip1", "tip2"],
  "warning": "Risks or null"
}`;
  }

  buildChatPrompt(message, history, summary) {
    let historyText = '';
    for (const msg of history) {
      historyText += `User: ${msg.message}\nAI: ${msg.response}\n\n`;
    }
    return `You are a personal finance assistant. Context: Net Balance ${summary.netBalance}, Total Expenses ${summary.total}. History: ${historyText} User message: ${message}`;
  }

  // ─── Gemini API Call ─────────────────────────────────────
  // Replaces PHP callGeminiApi() with axios instead of cURL
  async callGeminiApi(prompt, jsonMode = false) {
    const apiKey = AIService.getEnvVar('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('AI configuration is currently incomplete. Please check your credentials.');
    }

    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 8192,
      },
    };

    if (jsonMode) {
      payload.generationConfig.responseMimeType = 'application/json';
    }

    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000, // Increased to 30s
      });

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.error('[AI] Gemini response structure error:', JSON.stringify(response.data));
        throw new Error('AI insights unavailable: Received an invalid response format.');
      }

      return text;
    } catch (err) {
      if (err.response) {
        const msg = err.response.data?.error?.message || 'Unknown Gemini API Error';
        console.error(`[AI] Gemini HTTP Error (${err.response.status}):`, msg);
        throw new Error(`AI insights unavailable (${msg})`);
      }
      console.error('[AI] Gemini connection error:', err.message);
      throw new Error(`AI insights unavailable (Connection Error: ${err.message})`);
    }
  }
}

module.exports = AIService;
