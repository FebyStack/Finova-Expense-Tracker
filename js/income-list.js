// js/income-list.js
// Logic for displaying, filtering, editing, and deleting income entries

import { auth } from './firebase-config.js';
import { fetchIncome, removeIncome } from './api.js';
import { showIncomeToast, openIncomeModal } from './income.js';

const SOURCE_STYLES = {
  'Salary':      { icon: 'fa-solid fa-briefcase',      bg: '#e8f5e9', color: '#22c55e' },
  'Freelance':   { icon: 'fa-solid fa-laptop-code',    bg: '#e0f2fe', color: '#0284c7' },
  'Business':    { icon: 'fa-solid fa-store',           bg: '#fff8e1', color: '#f59e0b' },
  'Investment':  { icon: 'fa-solid fa-chart-line',      bg: '#f3e5f5', color: '#9c27b0' },
  'Gift':        { icon: 'fa-solid fa-gift',            bg: '#fce4ec', color: '#e91e63' },
  'Refund':      { icon: 'fa-solid fa-rotate-left',     bg: '#e0f7fa', color: '#00bcd4' },
  'Rental':      { icon: 'fa-solid fa-house',           bg: '#fff3e0', color: '#ef6c00' },
  'Side Hustle': { icon: 'fa-solid fa-bolt',            bg: '#eef2ff', color: '#6366f1' },
  'Pension':     { icon: 'fa-solid fa-landmark',        bg: '#f0fdf4', color: '#16a34a' },
  'Allowance':   { icon: 'fa-solid fa-wallet',           bg: '#e8eaf6', color: '#3f51b5' },
  'Other':       { icon: 'fa-solid fa-circle-dot',      bg: '#f5f5f5', color: '#9aa0b0' },
};

function getSourceStyle(src) {
  return SOURCE_STYLES[src] || SOURCE_STYLES['Other'];
}

function formatCurrency(amount, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency', currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

// ── State ──────────────────────────────────────────────────
let allIncome = [];
let currentCurrency = 'PHP';

// ── Load Income ────────────────────────────────────────────
export async function loadIncomeList(userDataCurrency = 'PHP') {
  const user = auth.currentUser;
  if (!user) return;

  currentCurrency = userDataCurrency;

  const container = document.getElementById('incomeListContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="skeleton-list">
      ${Array(5).fill(`
        <div class="skeleton-row">
          <div class="skeleton-circle"></div>
          <div class="skeleton-lines">
            <div class="skeleton-line w-60"></div>
            <div class="skeleton-line w-40"></div>
          </div>
          <div class="skeleton-amount"></div>
        </div>
      `).join('')}
    </div>`;

  try {
    const monthFilter = document.getElementById('incListMonthFilter')?.value || undefined;
    const srcFilter   = document.getElementById('incListSourceFilter')?.value || undefined;

    allIncome = await fetchIncome(user.uid, { month: monthFilter });

    // Client-side source filter
    if (srcFilter) {
      allIncome = allIncome.filter(i => i.source === srcFilter);
    }

    renderIncomeList();
  } catch (err) {
    console.error('Failed to load income:', err);
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span class="empty-state-title">Error loading income</span>
        <span class="empty-state-sub">${err.message}</span>
      </div>`;
  }
}

// ── Render List ────────────────────────────────────────────
function renderIncomeList() {
  const container = document.getElementById('incomeListContainer');
  if (!container) return;

  if (allIncome.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-wallet"></i>
        <span class="empty-state-title">No income recorded</span>
        <span class="empty-state-sub">Start tracking your earnings by adding your first income entry</span>
        <button class="btn btn-primary" onclick="document.getElementById('btnAddIncome')?.click()">
          <i class="fa-solid fa-plus"></i> Add Income
        </button>
      </div>`;
    return;
  }

  // Calculate total
  const total = allIncome.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

  const html = allIncome.map(inc => {
    const style = getSourceStyle(inc.source);
    return `
      <div class="transaction-item" style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:var(--space-4);">
          <div class="transaction-icon" style="background:${style.bg}; color:${style.color};">
            <i class="${style.icon}"></i>
          </div>
          <div class="transaction-info">
            <div class="transaction-name">${inc.note || inc.source || 'Income'}</div>
            <div class="transaction-meta">${inc.source} · ${formatDate(inc.date)}</div>
          </div>
        </div>
        
        <div style="display:flex; align-items:center; gap:var(--space-4);">
          <div class="transaction-amount income">
            +${formatCurrency(inc.amount, inc.currency || currentCurrency)}
          </div>
          <div class="expense-actions">
            <button class="expense-action-btn edit" onclick="editIncomeHandler(${inc.id})" title="Edit">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="expense-action-btn delete" onclick="deleteIncomeHandler(${inc.id})" title="Delete">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="income-total-bar">
      <span>Total Income</span>
      <strong class="transaction-amount income">+${formatCurrency(total, currentCurrency)}</strong>
    </div>
    <div class="transaction-list">${html}</div>
  `;
}

// ── Styled Confirmation Dialog ─────────────────────────────
function showConfirmDialog(message, onConfirm) {
  document.getElementById('confirmDialogOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirmDialogOverlay';
  overlay.className = 'confirm-dialog-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-dialog-icon">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <h3 class="confirm-dialog-title">Confirm Delete</h3>
      <p class="confirm-dialog-message">${message}</p>
      <div class="confirm-dialog-actions">
        <button class="btn btn-ghost" id="confirmDialogCancel">Cancel</button>
        <button class="btn btn-danger" id="confirmDialogConfirm">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 250);
  };

  document.getElementById('confirmDialogCancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  document.getElementById('confirmDialogConfirm').addEventListener('click', () => {
    close();
    onConfirm();
  });
}

// ── Delete Handler ─────────────────────────────────────────
window.deleteIncomeHandler = function(id) {
  const inc = allIncome.find(i => i.id == id);
  const label = inc ? (inc.note || inc.source || 'this income') : 'this income';

  showConfirmDialog(
    `Are you sure you want to delete <strong>"${label}"</strong>? This action cannot be undone.`,
    async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        await removeIncome(id, user.uid);
        showIncomeToast('Income deleted', 'success');
        loadIncomeList(currentCurrency);
        if (window.refreshDashboard) window.refreshDashboard();
      } catch (err) {
        console.error('Delete income failed:', err);
        showIncomeToast('Failed to delete income', 'error');
      }
    }
  );
};

// ── Edit Handler ───────────────────────────────────────────
window.editIncomeHandler = function(id) {
  const inc = allIncome.find(i => i.id == id);
  if (!inc) return;

  openIncomeModal({
    id:       inc.id,
    amount:   inc.amount,
    source:   inc.source,
    date:     inc.date,
    note:     inc.note || '',
    currency: inc.currency || currentCurrency,
  });
};

// ── Setup Filters ──────────────────────────────────────────
export function initIncomeListFilters() {
  const srcFilter = document.getElementById('incListSourceFilter');
  if (srcFilter && srcFilter.options.length <= 1) {
    Object.keys(SOURCE_STYLES).forEach(src => {
      const option = document.createElement('option');
      option.value = src;
      option.textContent = src;
      srcFilter.appendChild(option);
    });
  }

  const now = new Date();
  const monthInput = document.getElementById('incListMonthFilter');
  if (monthInput && !monthInput.value) {
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  document.getElementById('incListMonthFilter')?.addEventListener('change', () => loadIncomeList(currentCurrency));
  document.getElementById('incListSourceFilter')?.addEventListener('change', () => loadIncomeList(currentCurrency));
}
