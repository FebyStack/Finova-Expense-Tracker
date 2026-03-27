// js/expense-list.js
// Logic for displaying, filtering, editing, and deleting expenses

import { auth } from './firebase-config.js';
import { fetchExpenses, removeExpense } from './api.js';
import { showToast, openExpenseModal } from './expenses.js';
import { getCategoryStyle, loadCategories } from './categories.js';
import { convertItems } from './currency.js';


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
    const monthFilter = document.getElementById('expListMonthFilter')?.value || undefined;
    const catFilter   = document.getElementById('expListCategoryFilter')?.value || undefined;

    const rawExpenses = await fetchExpenses(user.uid, { month: monthFilter, category: catFilter });
    const { items: converted } = await convertItems(rawExpenses, currentCurrency);
    allExpenses = converted;

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
        <i class="fa-solid fa-receipt"></i>
        <span class="empty-state-title">No expenses yet</span>
        <span class="empty-state-sub">Start tracking your spending by adding your first expense</span>
        <button class="btn btn-primary" onclick="document.getElementById('btnAddExpense')?.click()">
          <i class="fa-solid fa-plus"></i> Add Expense
        </button>
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
            -${formatCurrency(exp.convertedAmount || exp.amount, currentCurrency)}
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
export async function initExpenseListFilters() {
  const catFilter = document.getElementById('expListCategoryFilter');
  if (catFilter && catFilter.options.length <= 1) {
    const cats = await loadCategories();
    cats.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
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
