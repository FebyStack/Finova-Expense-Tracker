// js/income-list.js
// Logic for displaying, filtering, editing, and deleting income entries


import { fetchIncome, removeIncome } from './api.js';
import { showIncomeToast, openIncomeModal, SOURCES } from './income.js';
import { convertItems, formatCurrency, formatDate } from './currency.js';

function getSourceStyle(src) {
  const found = SOURCES.find(s => s.name === src);
  return found || SOURCES.find(s => s.name === 'Other');
}

// ── State ──────────────────────────────────────────────────
let allIncome = [];
let currentCurrency = 'PHP';

// ── Load Income ────────────────────────────────────────────
export async function loadIncomeList(userDataCurrency = 'PHP') {
  const user = window.currentUser;
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

    const rawIncome = await fetchIncome(user.uid, { month: monthFilter });
    const { items: converted } = await convertItems(rawIncome, currentCurrency);
    allIncome = converted;

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
  const total = allIncome.reduce((sum, i) => sum + parseFloat(i.convertedAmount || i.amount || 0), 0);

  const html = allIncome.map(inc => {
    const style = getSourceStyle(inc.source);
    return `
      <div class="transaction-item">
        <div class="transaction-main">
          <div class="transaction-icon" style="background:${style.bg}; color:${style.color};">
            <i class="${style.icon}"></i>
          </div>
          <div class="transaction-info">
            <div class="transaction-name">${inc.note || inc.source || 'Income'}</div>
            <div class="transaction-meta">${inc.source} · ${formatDate(inc.date)}</div>
          </div>
        </div>
        
        <div class="transaction-right">
          <div class="transaction-amount income">
            +${formatCurrency(inc.convertedAmount || inc.amount, currentCurrency)}
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

// showConfirmDialog removed — redirected to confirm.js


// ── Delete Handler ─────────────────────────────────────────
window.deleteIncomeHandler = async function(id) {
  const inc = allIncome.find(i => i.id == id);
  const label = inc ? (inc.note || inc.source || 'this income') : 'this income';

  const confirmed = await window.showConfirm(
    `Are you sure you want to delete <strong>"${label}"</strong>? This action cannot be undone.`
  );

  if (!confirmed) return;

  const user = window.currentUser;
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
    SOURCES.forEach(src => {
      const option = document.createElement('option');
      option.value = src.name;
      option.textContent = src.name;
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
