// js/expense-list.js
// Logic for displaying, filtering, editing, and deleting expenses

import { auth } from './firebase-config.js';
import { fetchExpenses, removeExpense } from './api.js';
import { showToast, openExpenseModal } from './expenses.js';

const CATEGORY_STYLES = {
  'Food':          { icon: 'fa-solid fa-utensils',       bg: '#fff3e0', color: '#f59e0b' },
  'Transport':     { icon: 'fa-solid fa-car',            bg: '#e3f2fd', color: '#2196f3' },
  'Shopping':      { icon: 'fa-solid fa-bag-shopping',   bg: '#fce4ec', color: '#e91e63' },
  'Bills':         { icon: 'fa-solid fa-file-invoice',   bg: '#f3e5f5', color: '#9c27b0' },
  'Health':        { icon: 'fa-solid fa-heart-pulse',    bg: '#e8f5e9', color: '#4caf50' },
  'Entertainment': { icon: 'fa-solid fa-tv',             bg: '#e0f7fa', color: '#00bcd4' },
  'Education':     { icon: 'fa-solid fa-graduation-cap', bg: '#e8eaf6', color: '#3f51b5' },
  'Savings':       { icon: 'fa-solid fa-piggy-bank',     bg: '#fff8e1', color: '#ffc107' },
  'Subscriptions': { icon: 'fa-solid fa-repeat',         bg: '#f3e5f5', color: '#7c3aed' },
  'Travel':        { icon: 'fa-solid fa-plane',          bg: '#e0f2fe', color: '#0284c7' },
  'Groceries':     { icon: 'fa-solid fa-cart-shopping',  bg: '#f0fdf4', color: '#16a34a' },
  'Other':         { icon: 'fa-solid fa-circle-dot',     bg: '#f5f5f5', color: '#9aa0b0' },
};

function getCategoryStyle(cat) {
  return CATEGORY_STYLES[cat] || CATEGORY_STYLES['Other'];
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
let allExpenses = [];
let currentCurrency = 'PHP';

// ── Load Expenses ──────────────────────────────────────────
export async function loadExpenseList(userDataCurrency = 'PHP') {
  const user = auth.currentUser;
  if (!user) return;

  currentCurrency = userDataCurrency;

  const container = document.getElementById('expenseListContainer');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading expenses...</div>';

  try {
    const monthFilter = document.getElementById('expListMonthFilter')?.value || undefined;
    const catFilter   = document.getElementById('expListCategoryFilter')?.value || undefined;

    allExpenses = await fetchExpenses(user.uid, { month: monthFilter, category: catFilter });
    renderExpenseList();
  } catch (err) {
    console.error('Failed to load expenses:', err);
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span class="empty-state-title">Error loading expenses</span>
        <span class="empty-state-sub">${err.message}</span>
      </div>`;
  }
}

// ── Render List ────────────────────────────────────────────
function renderExpenseList() {
  const container = document.getElementById('expenseListContainer');
  if (!container) return;

  if (allExpenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-arrow-trend-down"></i>
        <span class="empty-state-title">No expenses found</span>
        <span class="empty-state-sub">Try changing filters or add a new expense</span>
      </div>`;
    return;
  }

  const html = allExpenses.map(exp => {
    const style = getCategoryStyle(exp.category);
    return `
      <div class="transaction-item" style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:var(--space-4);">
          <div class="transaction-icon" style="background:${style.bg}; color:${style.color};">
            <i class="${style.icon}"></i>
          </div>
          <div class="transaction-info">
            <div class="transaction-name">${exp.note || exp.category || 'Expense'}</div>
            <div class="transaction-meta">${exp.category} · ${formatDate(exp.date)}</div>
          </div>
        </div>
        
        <div style="display:flex; align-items:center; gap:var(--space-4);">
          <div class="transaction-amount expense">
            -${formatCurrency(exp.amount, exp.currency || currentCurrency)}
          </div>
          <div class="expense-actions">
            <button class="expense-action-btn edit" onclick="editExpenseHandler(${exp.id})" title="Edit">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="expense-action-btn delete" onclick="deleteExpenseHandler(${exp.id})" title="Delete">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="transaction-list">${html}</div>`;
}

// ── Styled Confirmation Dialog ─────────────────────────────
function showConfirmDialog(message, onConfirm) {
  // Remove any existing dialog
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
window.deleteExpenseHandler = function(id) {
  const exp = allExpenses.find(e => e.id == id);
  const label = exp ? (exp.note || exp.category || 'this expense') : 'this expense';

  showConfirmDialog(
    `Are you sure you want to delete <strong>"${label}"</strong>? This action cannot be undone.`,
    async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        await removeExpense(id, user.uid);
        showToast('Expense deleted', 'success');
        loadExpenseList(currentCurrency);
        if (window.refreshDashboard) window.refreshDashboard();
      } catch (err) {
        console.error('Delete failed:', err);
        showToast('Failed to delete expense', 'error');
      }
    }
  );
};

// ── Edit Handler ───────────────────────────────────────────
window.editExpenseHandler = function(id) {
  const exp = allExpenses.find(e => e.id == id);
  if (!exp) return;
  
  // Open the modal in edit mode with full prefill data including ID
  openExpenseModal({
    id:        exp.id,
    amount:    exp.amount,
    category:  exp.category,
    date:      exp.date,
    note:      exp.note || '',
    currency:  exp.currency || currentCurrency,
    recurring: exp.recurring === true || exp.recurring === 'true' || exp.recurring === 't',
    frequency: exp.frequency || null,
  });
};

// ── Setup Filters ──────────────────────────────────────────
export function initExpenseListFilters() {
  const catFilter = document.getElementById('expListCategoryFilter');
  if (catFilter && catFilter.options.length <= 1) {
    Object.keys(CATEGORY_STYLES).forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      catFilter.appendChild(option);
    });
  }

  const now = new Date();
  const monthInput = document.getElementById('expListMonthFilter');
  if (monthInput && !monthInput.value) {
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  document.getElementById('expListMonthFilter')?.addEventListener('change', () => loadExpenseList(currentCurrency));
  document.getElementById('expListCategoryFilter')?.addEventListener('change', () => loadExpenseList(currentCurrency));
}
