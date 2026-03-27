// js/reports-export.js
// Reports page with date range, summary, CSV & PDF export

import { auth } from './firebase-config.js';
import { fetchExpenses, fetchIncome } from './api.js';
import { formatCurrency } from './currency.js';
import { getCategoryStyle } from './categories.js';

const container = document.getElementById('exportPageContainer');

// ── Render reports page ─────────────────────────────────────
export async function loadReportsPage() {
  const user = auth.currentUser;
  if (!user || !container) return;

  // Default: current month
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = now.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="report-controls">
      <div class="report-date-range">
        <div class="form-group">
          <label class="form-label" for="reportFrom"><i class="fa-solid fa-calendar"></i> From</label>
          <input type="date" class="form-input" id="reportFrom" value="${defaultFrom}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="reportTo"><i class="fa-solid fa-calendar-check"></i> To</label>
          <input type="date" class="form-input" id="reportTo" value="${defaultTo}" />
        </div>
        <button class="btn btn-primary btn-sm" id="reportGenerate">
          <i class="fa-solid fa-chart-simple"></i> Generate Report
        </button>
      </div>
    </div>
    <div id="reportResults">
      <div class="empty-state" style="padding:var(--space-12);">
        <i class="fa-solid fa-file-lines"></i>
        <p class="empty-state-title">Select a date range and click Generate</p>
        <p class="empty-state-sub">Your financial summary and export options will appear here</p>
      </div>
    </div>`;

  document.getElementById('reportGenerate')?.addEventListener('click', generateReport);
}

async function generateReport() {
  const user = auth.currentUser;
  if (!user) return;

  const from = document.getElementById('reportFrom')?.value;
  const to = document.getElementById('reportTo')?.value;
  const results = document.getElementById('reportResults');
  if (!from || !to || !results) return;

  results.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Building report…</div>';

  try {
    const [allExpenses, allIncome] = await Promise.all([
      fetchExpenses(user.uid),
      fetchIncome(user.uid),
    ]);

    const currency = window.userCurrency || 'PHP';

    // Filter by date range
    const expenses = allExpenses.filter(e => e.date >= from && e.date <= to);
    const income = allIncome.filter(i => i.date >= from && i.date <= to);

    const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const totalIncome = income.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const netSavings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) : '0.0';

    // Category breakdown
    const catMap = {};
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      catMap[cat] = (catMap[cat] || 0) + (parseFloat(e.amount) || 0);
    });
    const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

    const fromLabel = new Date(from).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const toLabel = new Date(to).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

    results.innerHTML = `
      <div class="report-period">
        <i class="fa-solid fa-calendar-week"></i>
        <span>${fromLabel} — ${toLabel}</span>
      </div>

      <div class="report-summary-grid">
        <div class="report-summary-card income">
          <div class="report-summary-label"><i class="fa-solid fa-arrow-trend-up"></i> Total Income</div>
          <div class="report-summary-value">${formatCurrency(totalIncome, currency)}</div>
          <div class="report-summary-count">${income.length} transaction${income.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="report-summary-card expense">
          <div class="report-summary-label"><i class="fa-solid fa-arrow-trend-down"></i> Total Expenses</div>
          <div class="report-summary-value">${formatCurrency(totalExpenses, currency)}</div>
          <div class="report-summary-count">${expenses.length} transaction${expenses.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="report-summary-card ${netSavings >= 0 ? 'positive' : 'negative'}">
          <div class="report-summary-label"><i class="fa-solid fa-piggy-bank"></i> Net Savings</div>
          <div class="report-summary-value">${formatCurrency(netSavings, currency)}</div>
          <div class="report-summary-count">Savings rate: ${savingsRate}%</div>
        </div>
      </div>

      ${catEntries.length > 0 ? `
      <div class="dash-card" style="margin-top:var(--space-6);">
        <div class="dash-card-header">
          <span class="dash-card-title">Expense Breakdown</span>
        </div>
        <div class="dash-card-body">
          <div class="report-cat-list">
            ${catEntries.map(([cat, amt]) => {
              const style = getCategoryStyle(cat);
              const pct = totalExpenses > 0 ? ((amt / totalExpenses) * 100).toFixed(1) : '0.0';
              return `
                <div class="report-cat-item">
                  <div class="report-cat-left">
                    <div class="report-cat-icon" style="background:${style.bg};color:${style.color};"><i class="${style.icon}"></i></div>
                    <span class="report-cat-name">${cat}</span>
                  </div>
                  <div class="report-cat-right">
                    <span class="report-cat-amount">${formatCurrency(amt, currency)}</span>
                    <span class="report-cat-pct">${pct}%</span>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>` : ''}

      <div class="report-export-bar">
        <button class="btn btn-outline" id="exportCSV">
          <i class="fa-solid fa-file-csv"></i> Export CSV
        </button>
        <button class="btn btn-outline" id="exportPDF">
          <i class="fa-solid fa-file-pdf"></i> Export PDF
        </button>
      </div>`;

    // Wire export buttons
    document.getElementById('exportCSV')?.addEventListener('click', () =>
      exportCSV(expenses, income, currency, fromLabel, toLabel)
    );
    document.getElementById('exportPDF')?.addEventListener('click', () =>
      exportPDF(expenses, income, totalIncome, totalExpenses, netSavings, currency, fromLabel, toLabel)
    );

  } catch (err) {
    console.error('Report generation error:', err);
    results.innerHTML = '<div class="list-empty text-danger">Failed to generate report: ' + err.message + '</div>';
  }
}

// ── CSV Export ───────────────────────────────────────────────
function exportCSV(expenses, income, currency, from, to) {
  // Helper to format date safely for Excel (MM/DD/YYYY)
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  };

  let csv = 'Type,Date,Category/Source,Amount,Currency,Note\n';

  let totalInc = 0;
  income.forEach(i => {
    totalInc += parseFloat(i.amount) || 0;
    csv += `Income,${formatDate(i.date)},"${i.source || ''}",${i.amount},${i.currency || currency},"${(i.note || '').replace(/"/g, '""')}"\n`;
  });

  let totalExp = 0;
  expenses.forEach(e => {
    totalExp += parseFloat(e.amount) || 0;
    csv += `Expense,${formatDate(e.date)},"${e.category || ''}",${e.amount},${e.currency || currency},"${(e.note || '').replace(/"/g, '""')}"\n`;
  });

  const netSavings = totalInc - totalExp;

  // Add Summary Rows at the bottom
  csv += `\n,,,,\n`; // spacer
  csv += `SUMMARY,Date Range,,Amount,Currency,\n`;
  csv += `Total Income,"${formatDate(from)} - ${formatDate(to)}",,${totalInc.toFixed(2)},${currency},\n`;
  csv += `Total Expenses,,,${totalExp.toFixed(2)},${currency},\n`;
  csv += `Net Savings,,,${netSavings.toFixed(2)},${currency},\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `finova-report-${from}-to-${to}.csv`.replace(/[^a-zA-Z0-9.-]/g, '_');
  link.click();
  URL.revokeObjectURL(url);
}

// ── PDF Export ───────────────────────────────────────────────
async function exportPDF(expenses, income, totalIncome, totalExpenses, netSavings, currency, from, to) {
  // Use html2pdf.js (loaded via CDN)
  if (typeof html2pdf === 'undefined') {
    alert('PDF library is still loading. Please try again in a moment.');
    return;
  }

  const el = document.createElement('div');
  el.style.padding = '20px';
  el.style.fontFamily = 'Inter, sans-serif';
  el.style.color = '#1a1d23';
  el.style.background = '#fff';

  el.innerHTML = `
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="font-size:22px;margin:0;">Finova Financial Report</h1>
      <p style="color:#5a6072;font-size:13px;margin:4px 0 0;">${from} — ${to}</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:12px;background:#dcfce7;border-radius:8px;text-align:center;width:33%;">
          <div style="font-size:11px;color:#16a34a;font-weight:600;">TOTAL INCOME</div>
          <div style="font-size:18px;font-weight:700;color:#16a34a;">${formatCurrency(totalIncome, currency)}</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:12px;background:#fee2e2;border-radius:8px;text-align:center;width:33%;">
          <div style="font-size:11px;color:#dc2626;font-weight:600;">TOTAL EXPENSES</div>
          <div style="font-size:18px;font-weight:700;color:#dc2626;">${formatCurrency(totalExpenses, currency)}</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:12px;background:${netSavings >= 0 ? '#e8effe' : '#fee2e2'};border-radius:8px;text-align:center;width:33%;">
          <div style="font-size:11px;color:${netSavings >= 0 ? '#4f7ef8' : '#dc2626'};font-weight:600;">NET SAVINGS</div>
          <div style="font-size:18px;font-weight:700;color:${netSavings >= 0 ? '#4f7ef8' : '#dc2626'};">${formatCurrency(netSavings, currency)}</div>
        </td>
      </tr>
    </table>

    ${expenses.length > 0 ? `
    <h3 style="font-size:14px;margin:16px 0 8px;border-bottom:1px solid #e2e6ef;padding-bottom:6px;">Expenses (${expenses.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#f5f7fa;">
        <th style="padding:6px 8px;text-align:left;">Date</th>
        <th style="padding:6px 8px;text-align:left;">Category</th>
        <th style="padding:6px 8px;text-align:right;">Amount</th>
        <th style="padding:6px 8px;text-align:left;">Note</th>
      </tr></thead>
      <tbody>${expenses.map(e => `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 8px;">${e.date}</td>
        <td style="padding:5px 8px;">${e.category || ''}</td>
        <td style="padding:5px 8px;text-align:right;color:#dc2626;">${formatCurrency(parseFloat(e.amount), currency)}</td>
        <td style="padding:5px 8px;color:#5a6072;">${e.note || ''}</td>
      </tr>`).join('')}</tbody>
    </table>` : ''}

    ${income.length > 0 ? `
    <h3 style="font-size:14px;margin:16px 0 8px;border-bottom:1px solid #e2e6ef;padding-bottom:6px;">Income (${income.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#f5f7fa;">
        <th style="padding:6px 8px;text-align:left;">Date</th>
        <th style="padding:6px 8px;text-align:left;">Source</th>
        <th style="padding:6px 8px;text-align:right;">Amount</th>
        <th style="padding:6px 8px;text-align:left;">Note</th>
      </tr></thead>
      <tbody>${income.map(i => `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 8px;">${i.date}</td>
        <td style="padding:5px 8px;">${i.source || ''}</td>
        <td style="padding:5px 8px;text-align:right;color:#16a34a;">${formatCurrency(parseFloat(i.amount), currency)}</td>
        <td style="padding:5px 8px;color:#5a6072;">${i.note || ''}</td>
      </tr>`).join('')}</tbody>
    </table>` : ''}

    <p style="text-align:center;color:#9aa0b0;font-size:10px;margin-top:24px;">Generated by Finova Expense Tracker · ${new Date().toLocaleDateString()}</p>
  `;

  document.body.appendChild(el);

  try {
    await html2pdf().set({
      margin: [10, 10],
      filename: `finova-report-${from}-to-${to}.pdf`.replace(/[^a-zA-Z0-9.-]/g, '_'),
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(el).save();
  } finally {
    document.body.removeChild(el);
  }
}

// ── Auto-load ───────────────────────────────────────────────
window.addEventListener('exportUpdated', () => loadReportsPage());

const onHash = () => {
  if (window.location.hash === '#export') loadReportsPage();
};
window.addEventListener('hashchange', onHash);

if (window.location.hash === '#export') {
  auth.onAuthStateChanged(user => { if (user) loadReportsPage(); });
}
