// js/recurring-list.js
// Displays and manages recurring (subscription) expenses


import { fetchRecurringExpenses, editExpense } from './api.js';
import { formatCurrency, convertItems, warmRateCache } from './currency.js';
import { getCategoryStyle } from './categories.js';

const container = document.getElementById('recurringListContainer');

// ── Next-date calculation ──────────────────────────────────
function calcNextDate(dateStr, frequency) {
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Keep advancing until we're in the future
  let next = new Date(d);
  const MAX_ITER = 500; // safety guard
  let i = 0;
  while (next <= now && i < MAX_ITER) {
    i++;
    switch (frequency) {
      case 'daily':   next.setDate(next.getDate() + 1); break;
      case 'weekly':  next.setDate(next.getDate() + 7); break;
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      case 'yearly':  next.setFullYear(next.getFullYear() + 1); break;
      default:        next.setMonth(next.getMonth() + 1); break;
    }
  }
  return next;
}

function formatNextDate(date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.ceil((date - now) / (1000 * 60 * 60 * 24));

  const dateLabel = date.toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  if (diff === 0) return `<span class="recurring-due today"><i class="fa-solid fa-circle-exclamation"></i> Due today</span>`;
  if (diff === 1) return `<span class="recurring-due tomorrow"><i class="fa-regular fa-clock"></i> Tomorrow</span>`;
  if (diff <= 7)  return `<span class="recurring-due soon"><i class="fa-regular fa-clock"></i> In ${diff} days · ${dateLabel}</span>`;
  return `<span class="recurring-due"><i class="fa-regular fa-calendar"></i> ${dateLabel}</span>`;
}

function freqBadge(frequency) {
  const labels = {
    daily:   'Daily',
    weekly:  'Weekly',
    monthly: 'Monthly',
    yearly:  'Yearly',
  };
  return `<span class="freq-badge freq-${frequency || 'monthly'}">${labels[frequency] || 'Monthly'}</span>`;
}

// ── Render ──────────────────────────────────────────────────
export async function loadRecurringList() {
  const user = window.currentUser;
  if (!user || !container) return;

  try {
    container.innerHTML = `
      <div class="loading-state">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Loading subscriptions...</p>
      </div>`;

    const rawExpenses = await fetchRecurringExpenses(user.uid);
    const currency = window.userCurrency || 'PHP';

    await warmRateCache(currency);
    let { items: expenses } = await convertItems(rawExpenses, currency);

    // Apply Frequency Filter
    const freqFilter = document.getElementById('recurringFreqFilter')?.value || 'all';
    if (freqFilter !== 'all') {
      expenses = expenses.filter(e => e.frequency === freqFilter);
    }

    if (!expenses.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-repeat"></i>
          <span class="empty-state-title">No recurring expenses found</span>
          <span class="empty-state-sub">Manage your subscriptions and recurring bills by tagging expenses as "Recurring" when you add them.</span>
          <button class="btn btn-primary" onclick="document.getElementById('btnQuickAdd')?.click()">
            <i class="fa-solid fa-plus"></i> Add Recurring
          </button>
        </div>`;
      return;
    }

    // Group by frequency
    const grouped = { daily: [], weekly: [], monthly: [], yearly: [] };
    expenses.forEach(exp => {
      const freq = exp.frequency || 'monthly';
      if (!grouped[freq]) grouped[freq] = [];
      grouped[freq].push(exp);
    });

    let html = '';
    for (const [freq, items] of Object.entries(grouped)) {
      if (!items.length) continue;

      // Calculate monthly equivalent total
      let monthlyTotal = 0;
      items.forEach(e => {
        const amt = parseFloat(e.convertedAmount || e.amount) || 0;
        switch (freq) {
          case 'daily':   monthlyTotal += amt * 30; break;
          case 'weekly':  monthlyTotal += amt * 4.33; break;
          case 'monthly': monthlyTotal += amt; break;
          case 'yearly':  monthlyTotal += amt / 12; break;
        }
      });

      const freqLabels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

      html += `
        <div class="recurring-section">
          <div class="recurring-section-header">
            <h3>${freqLabels[freq] || freq} Subscriptions</h3>
            <span class="recurring-section-total">≈ ${formatCurrency(monthlyTotal, currency)}/mo</span>
          </div>
          <div class="recurring-grid">
            ${items.map(exp => buildRecurringCard(exp, currency)).join('')}
          </div>
        </div>`;
    }

    // Summary banner
    let totalMonthly = 0;
    expenses.forEach(e => {
      const amt = parseFloat(e.convertedAmount || e.amount) || 0;
      const freq = e.frequency || 'monthly';
      switch (freq) {
        case 'daily':   totalMonthly += amt * 30; break;
        case 'weekly':  totalMonthly += amt * 4.33; break;
        case 'monthly': totalMonthly += amt; break;
        case 'yearly':  totalMonthly += amt / 12; break;
      }
    });

    const summaryHTML = `
      <div class="recurring-summary">
        <div class="recurring-summary-item">
          <span class="recurring-summary-label"><i class="fa-solid fa-list"></i> Active Subscriptions</span>
          <span class="recurring-summary-value">${expenses.length}</span>
        </div>
        <div class="recurring-summary-item">
          <span class="recurring-summary-label"><i class="fa-solid fa-coins"></i> Estimated Monthly Cost</span>
          <span class="recurring-summary-value">${formatCurrency(totalMonthly, currency)}</span>
        </div>
        <div class="recurring-summary-item">
          <span class="recurring-summary-label"><i class="fa-solid fa-calendar-check"></i> Estimated Yearly Cost</span>
          <span class="recurring-summary-value">${formatCurrency(totalMonthly * 12, currency)}</span>
        </div>
      </div>`;

    container.innerHTML = summaryHTML + html;

  } catch (err) {
    console.error('Error loading recurring expenses:', err);
    container.innerHTML = `<div class="list-empty text-danger">Failed to load: ${err.message}</div>`;
  }
}

function buildRecurringCard(exp, currency) {
  const style = getCategoryStyle(exp.category);
  const nextDate = calcNextDate(exp.date, exp.frequency || 'monthly');

  return `
    <div class="recurring-card">
      <div class="recurring-card-left">
        <div class="recurring-card-icon" style="background:${style.bg}; color:${style.color};">
          <i class="${style.icon}"></i>
        </div>
        <div class="recurring-card-info">
          <div class="recurring-card-name">${exp.note || exp.category || 'Subscription'}</div>
          <div class="recurring-card-meta">
            ${exp.category} · ${freqBadge(exp.frequency)}
          </div>
        </div>
      </div>
      <div class="recurring-card-right">
        <div class="recurring-card-amount">${formatCurrency(parseFloat(exp.convertedAmount || exp.amount), currency)}</div>
        <div class="recurring-card-next">${formatNextDate(nextDate)}</div>
      </div>
      <div class="recurring-card-actions">
        <button class="btn btn-ghost btn-xs" onclick="window.cancelRecurring(${exp.id})" title="Cancel recurring">
          <i class="fa-solid fa-ban"></i> Cancel
        </button>
      </div>
    </div>`;
}

// ── Cancel recurring ────────────────────────────────────────
window.cancelRecurring = async (expenseId) => {
  const confirmed = await window.showConfirm(
    'Stop this expense from recurring? The original expense will remain in your records.',
    'Cancel Recurring'
  );
  
  if (!confirmed) return;
  const user = window.currentUser;
  if (!user) return;

  try {
    await editExpense(expenseId, user.uid, { recurring: false, frequency: null });
    loadRecurringList();
  } catch (err) {
    console.error('Cancel recurring error:', err);
    alert(err.message || 'Failed to cancel recurring.');
  }
};

// ── Auto-load ───────────────────────────────────────────────
window.addEventListener('recurringUpdated', () => loadRecurringList());

// Listen for filter changes
document.getElementById('recurringFreqFilter')?.addEventListener('change', () => loadRecurringList());
