// js/charts.js
// Reusable Chart.js helper functions for Finova dashboard
// Depends on Chart.js loaded via CDN

import { auth } from './firebase-config.js';
import { fetchExpenses, fetchIncome } from './api.js';
import { getCategoryStyle } from './categories.js';
import { formatCurrency } from './currency.js';

// ── Chart defaults ─────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getChartColors() {
  const isDark = document.body.classList.contains('dark');
  return {
    grid:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    text:   isDark ? '#8899b4' : '#5a6072',
    bg:     isDark ? '#161b22' : '#ffffff',
    income: '#22c55e',
    expense:'#ef4444',
    accent: '#4f7ef8',
    incomeFill:  isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)',
    expenseFill: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)',
  };
}

function baseOptions(colors) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600, easing: 'easeOutQuart' },
    plugins: {
      legend: {
        labels: { color: colors.text, font: { family: "'Inter', sans-serif", size: 12 }, padding: 16, usePointStyle: true, pointStyleWidth: 10 },
      },
      tooltip: {
        backgroundColor: colors.bg,
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.grid,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        bodyFont: { family: "'Inter', sans-serif" },
        titleFont: { family: "'Inter', sans-serif", weight: '600' },
        displayColors: true,
        boxPadding: 4,
      },
    },
    scales: {
      x: { grid: { color: colors.grid }, ticks: { color: colors.text, font: { family: "'Inter', sans-serif", size: 11 } } },
      y: { grid: { color: colors.grid }, ticks: { color: colors.text, font: { family: "'Inter', sans-serif", size: 11 } }, beginAtZero: true },
    },
  };
}

// ── Chart registry (for cleanup) ───────────────────────────
const charts = {};
function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

// ── Data aggregation helpers ────────────────────────────────
function aggregateByMonth(items) {
  const map = {};
  items.forEach(item => {
    const month = item.month || item.date?.substring(0, 7);
    if (!month) return;
    map[month] = (map[month] || 0) + (parseFloat(item.amount) || 0);
  });
  return map;
}

function aggregateByCategory(expenses) {
  const map = {};
  expenses.forEach(e => {
    const cat = e.category || 'Other';
    map[cat] = (map[cat] || 0) + (parseFloat(e.amount) || 0);
  });
  return map;
}

function getLast6Months() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: MONTHS[d.getMonth()] + ' ' + d.getFullYear(),
      short: MONTHS[d.getMonth()],
    });
  }
  return months;
}

// ══════════════════════════════════════════════════════════════
//  Dashboard mini chart (monthly spending bar)
// ══════════════════════════════════════════════════════════════
export async function renderDashboardChart() {
  const user = auth.currentUser;
  const el = document.getElementById('chartMonthly');
  if (!user || !el) return;

  try {
    const expenses = await fetchExpenses(user.uid);
    const byMonth = aggregateByMonth(expenses);
    const months = getLast6Months();
    const colors = getChartColors();
    const currency = window.userCurrency || 'PHP';

    el.innerHTML = '<canvas id="canvasMonthly" style="width:100%;height:220px;"></canvas>';
    el.classList.remove('chart-placeholder');
    el.style.height = '240px';
    const ctx = document.getElementById('canvasMonthly').getContext('2d');

    destroyChart('monthly');
    charts['monthly'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months.map(m => m.short),
        datasets: [{
          label: 'Spending',
          data: months.map(m => byMonth[m.key] || 0),
          backgroundColor: months.map((_, i) => i === months.length - 1 ? colors.accent : colors.accent + '60'),
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 40,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.bg, titleColor: colors.text, bodyColor: colors.text,
            borderColor: colors.grid, borderWidth: 1, padding: 12, cornerRadius: 10,
            callbacks: { label: ctx => ' ' + formatCurrency(ctx.parsed.y, currency) },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: colors.text, font: { family: "'Inter', sans-serif", size: 11 } } },
          y: { grid: { color: colors.grid }, ticks: { color: colors.text, font: { size: 10 }, callback: v => formatCurrency(v, currency) }, beginAtZero: true },
        },
      },
    });
  } catch (err) {
    console.error('Dashboard chart error:', err);
    el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">Failed to load chart</p>';
  }
}

// ══════════════════════════════════════════════════════════════
//  Analytics page — all charts
// ══════════════════════════════════════════════════════════════
export async function renderAnalyticsCharts(selectedMonth) {
  const user = auth.currentUser;
  if (!user) return;
  const container = document.getElementById('analyticsChartsContainer');
  if (!container) return;

  try {
    container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Generating charts…</div>';

    const [allExpenses, allIncome] = await Promise.all([
      fetchExpenses(user.uid),
      fetchIncome(user.uid),
    ]);

    const currency = window.userCurrency || 'PHP';
    const colors = getChartColors();
    const months = getLast6Months();

    let filteredExpenses = allExpenses;
    if (selectedMonth) {
      filteredExpenses = allExpenses.filter(e => (e.month || e.date?.substring(0, 7)) === selectedMonth);
    }

    container.innerHTML = `
      <div class="analytics-filter">
        <label for="analyticsMonthFilter"><i class="fa-solid fa-calendar"></i> Filter by month</label>
        <input type="month" id="analyticsMonthFilter" class="form-input" value="${selectedMonth || ''}" style="max-width:220px;" />
        <button class="btn btn-ghost btn-sm" id="analyticsClearFilter"><i class="fa-solid fa-xmark"></i> Clear</button>
      </div>

      <div class="analytics-grid">
        <div class="dash-card">
          <div class="dash-card-header"><span class="dash-card-title">Income vs Expenses</span></div>
          <div class="dash-card-body" style="height:300px;"><canvas id="canvasIncomeVsExpense"></canvas></div>
        </div>
        <div class="dash-card">
          <div class="dash-card-header"><span class="dash-card-title">Spending by Category</span></div>
          <div class="dash-card-body" style="height:300px;"><canvas id="canvasCategory"></canvas></div>
        </div>
        <div class="dash-card" style="grid-column: 1 / -1;">
          <div class="dash-card-header"><span class="dash-card-title">Monthly Spending Trend</span></div>
          <div class="dash-card-body" style="height:300px;"><canvas id="canvasTrend"></canvas></div>
        </div>
      </div>`;

    document.getElementById('analyticsMonthFilter')?.addEventListener('change', e => renderAnalyticsCharts(e.target.value));
    document.getElementById('analyticsClearFilter')?.addEventListener('click', () => renderAnalyticsCharts(null));

    // 1. Income vs Expense bar chart
    const expByMonth = aggregateByMonth(allExpenses);
    const incByMonth = aggregateByMonth(allIncome);

    destroyChart('incVsExp');
    charts['incVsExp'] = new Chart(document.getElementById('canvasIncomeVsExpense'), {
      type: 'bar',
      data: {
        labels: months.map(m => m.short),
        datasets: [
          { label: 'Income', data: months.map(m => incByMonth[m.key] || 0), backgroundColor: colors.income + 'CC', borderRadius: 6, maxBarThickness: 32 },
          { label: 'Expenses', data: months.map(m => expByMonth[m.key] || 0), backgroundColor: colors.expense + 'CC', borderRadius: 6, maxBarThickness: 32 },
        ],
      },
      options: {
        ...baseOptions(colors),
        plugins: {
          ...baseOptions(colors).plugins,
          tooltip: { ...baseOptions(colors).plugins.tooltip, callbacks: { label: c => ' ' + c.dataset.label + ': ' + formatCurrency(c.parsed.y, currency) } },
        },
      },
    });

    // 2. Category donut chart
    const catData = aggregateByCategory(filteredExpenses);
    const catEntries = Object.entries(catData).sort((a, b) => b[1] - a[1]);
    const catColors = catEntries.map(([cat]) => getCategoryStyle(cat).color || colors.accent);

    if (catEntries.length === 0) {
      document.getElementById('canvasCategory').parentElement.innerHTML = '<div class="empty-state" style="height:100%;"><i class="fa-solid fa-chart-pie"></i><p class="empty-state-title">No expense data</p><p class="empty-state-sub">Add expenses to see category breakdown</p></div>';
    } else {
      destroyChart('category');
      charts['category'] = new Chart(document.getElementById('canvasCategory'), {
        type: 'doughnut',
        data: {
          labels: catEntries.map(([cat]) => cat),
          datasets: [{ data: catEntries.map(([, amt]) => amt), backgroundColor: catColors, borderWidth: 2, borderColor: colors.bg, hoverOffset: 8 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: {
            legend: { position: 'right', labels: { color: colors.text, font: { family: "'Inter', sans-serif", size: 11 }, padding: 10, usePointStyle: true, pointStyleWidth: 8 } },
            tooltip: { ...baseOptions(colors).plugins.tooltip, callbacks: { label: c => ' ' + c.label + ': ' + formatCurrency(c.parsed, currency) + ` (${((c.parsed / c.dataset.data.reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%)` } },
          },
        },
      });
    }

    // 3. Spending trend line chart
    destroyChart('trend');
    charts['trend'] = new Chart(document.getElementById('canvasTrend'), {
      type: 'line',
      data: {
        labels: months.map(m => m.label),
        datasets: [
          { label: 'Income', data: months.map(m => incByMonth[m.key] || 0), borderColor: colors.income, backgroundColor: colors.incomeFill, fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2 },
          { label: 'Expenses', data: months.map(m => expByMonth[m.key] || 0), borderColor: colors.expense, backgroundColor: colors.expenseFill, fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2 },
        ],
      },
      options: {
        ...baseOptions(colors),
        plugins: { ...baseOptions(colors).plugins, tooltip: { ...baseOptions(colors).plugins.tooltip, mode: 'index', intersect: false, callbacks: { label: c => ' ' + c.dataset.label + ': ' + formatCurrency(c.parsed.y, currency) } } },
      },
    });

  } catch (err) {
    console.error('Analytics charts error:', err);
    container.innerHTML = '<div class="list-empty text-danger">Failed to load charts: ' + err.message + '</div>';
  }
}

// ── Auto-load ───────────────────────────────────────────────
window.addEventListener('analyticsUpdated', () => renderAnalyticsCharts());

const onHash = () => {
  if (window.location.hash === '#dashboard') renderDashboardChart();
  if (window.location.hash === '#analytics') renderAnalyticsCharts();
};
window.addEventListener('hashchange', onHash);

auth.onAuthStateChanged(user => {
  if (user) setTimeout(() => renderDashboardChart(), 500);
});
