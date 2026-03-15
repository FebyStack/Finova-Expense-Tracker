import { addExpense, editExpense } from './api.js'
import { auth }       from './firebase-config.js';
import { loadCategories, bgFromColor } from './categories.js';

// ── Category definitions are loaded dynamically ────────────
// (from Firestore via categories.js)

const CURRENCY_SYMBOLS = {
  PHP: '₱', USD: '$', EUR: '€',
  GBP: '£', JPY: '¥', SGD: 'S$', AUD: 'A$'
};

// ── State ──────────────────────────────────────────────────
let selectedCategory   = null;
let isSaving           = false;
let editingExpenseId   = null;   // null = add mode, number = edit mode

// ── Build category grid (async — loads from Firestore) ────
async function buildCategoryGrid() {
  const grid = document.getElementById('expCategoryGrid');
  if (!grid) return;

  const categories = await loadCategories();
  grid.innerHTML = categories.map(cat => {
    const bg = bgFromColor(cat.color);
    return `
    <button
      type="button"
      class="category-btn"
      data-category="${cat.name}"
      onclick="selectCategory('${cat.name}')"
    >
      <div class="category-btn-icon" style="background:${bg}; color:${cat.color};">
        <i class="${cat.icon}"></i>
      </div>
      <span class="category-btn-label">${cat.name}</span>
    </button>
  `;
  }).join('');
}

// ── Select a category ──────────────────────────────────────
window.selectCategory = function(name) {
  selectedCategory = name;
  document.getElementById('expCategory').value = name;
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.category === name);
  });
  hideExpenseError();
};

// ── Open modal ─────────────────────────────────────────────
export async function openExpenseModal(prefill = {}) {
  const modal = document.getElementById('modalAddExpense');
  if (!modal) return;

  resetExpenseForm();
  await buildCategoryGrid(); // always rebuild from latest Firestore categories

  // ── Edit mode (prefill.id is set) vs Add mode ──
  editingExpenseId = prefill.id || null;

  const titleEl = document.getElementById('modalExpenseTitle');
  const saveBtn = document.getElementById('btnSaveExpense');
  if (editingExpenseId) {
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen" style="color:var(--accent);"></i> Edit Expense';
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Update Expense</span>';
  } else {
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-arrow-trend-down" style="color:var(--danger);"></i> Add Expense';
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-plus"></i> <span>Save Expense</span>';
  }

  // Default to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('expDate').value = prefill.date || today;

  // Prefill fields
  if (prefill.amount)   document.getElementById('expAmount').value = prefill.amount;
  if (prefill.note)     document.getElementById('expNote').value   = prefill.note;
  if (prefill.currency) {
    const currSel = document.getElementById('expCurrency');
    if (currSel) currSel.value = prefill.currency;
    const sym = CURRENCY_SYMBOLS[prefill.currency] || prefill.currency;
    const symEl = document.getElementById('expCurrencySymbol');
    if (symEl) symEl.textContent = sym;
  }
  if (prefill.category) window.selectCategory(prefill.category);
  if (prefill.recurring) {
    document.getElementById('expRecurring').checked = true;
    document.getElementById('expRecurringGroup').style.display = 'block';
    if (prefill.frequency) document.getElementById('expFrequency').value = prefill.frequency;
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  setTimeout(() => {
    document.getElementById('expAmount')?.focus();
  }, 200);
}

// ── Close modal ────────────────────────────────────────────
export function closeExpenseModal() {
  const modal = document.getElementById('modalAddExpense');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Reset form ─────────────────────────────────────────────
function resetExpenseForm() {
  document.getElementById('expAmount').value      = '';
  document.getElementById('expNote').value        = '';
  document.getElementById('expCategory').value    = '';
  document.getElementById('expRecurring').checked = false;
  document.getElementById('expRecurringGroup').style.display = 'none';
  selectedCategory   = null;
  editingExpenseId   = null;
  document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('selected'));
  hideExpenseError();
}

// ── Error handling ─────────────────────────────────────────
function showExpenseError(message) {
  const box  = document.getElementById('expError');
  const text = document.getElementById('expErrorText');
  if (!box || !text) return;
  text.textContent  = message;
  box.style.display = 'flex';
}

function hideExpenseError() {
  const box = document.getElementById('expError');
  if (box) box.style.display = 'none';
}

// ── Validate form ──────────────────────────────────────────
function validateExpenseForm() {
  const amount = parseFloat(document.getElementById('expAmount').value);
  const date   = document.getElementById('expDate').value;

  if (!amount || isNaN(amount) || amount <= 0) {
    showExpenseError('Please enter a valid amount greater than 0.');
    return false;
  }
  if (!selectedCategory) {
    showExpenseError('Please select a category.');
    return false;
  }
  if (!date) {
    showExpenseError('Please select a date.');
    return false;
  }
  return true;
}

// ── Toast notification ─────────────────────────────────────
// Defined BEFORE saveExpense so it's always available when called
export function showToast(message, type = 'success') {
  document.getElementById('appToast')?.remove();

  const toast     = document.createElement('div');
  toast.id        = 'appToast';
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Save expense ───────────────────────────────────────────
async function saveExpense() {
  if (!validateExpenseForm()) return;
  if (isSaving) return;

  const user = auth.currentUser;
  if (!user) return;

  isSaving      = true;
  const btn     = document.getElementById('btnSaveExpense');
  btn.disabled  = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving…`;

  try {
    const amount    = parseFloat(document.getElementById('expAmount').value);
    const currency  = document.getElementById('expCurrency').value  || 'PHP';
    const date      = document.getElementById('expDate').value;
    const note      = document.getElementById('expNote').value.trim();
    const recurring = document.getElementById('expRecurring').checked;
    const frequency = document.getElementById('expFrequency')?.value || null;

    const dateObj = new Date(date);
    const month   = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

    const payload = {
      amount,
      currency,
      category:    selectedCategory,
      date,
      month,
      note:        note || '',
      recurring,
      frequency:   recurring ? frequency : null,
      receiptPath: window._pendingReceiptPath || null,
    };

    // ── Edit mode vs Add mode ──
    let saved;
    if (editingExpenseId) {
      saved = await editExpense(editingExpenseId, user.uid, payload);
      console.log('✅ Updated in PostgreSQL! ID:', editingExpenseId);
    } else {
      saved = await addExpense(user.uid, payload);
      console.log('✅ Saved to PostgreSQL! ID:', saved.id);
    }

    window._pendingReceiptPath = null;

    closeExpenseModal();
    showToast(
      editingExpenseId ? 'Expense updated successfully!' : 'Expense saved successfully!',
      'success'
    );

    // Refresh both dashboard and expense list
    if (window.refreshDashboard) window.refreshDashboard();

  } catch (err) {
    console.error('❌ Save expense error:', err.message);
    showExpenseError(
      editingExpenseId
        ? 'Failed to update expense. Please try again.'
        : 'Failed to save expense. Please try again.'
    );
  } finally {
    isSaving      = false;
    btn.disabled  = false;
    btn.innerHTML = editingExpenseId
      ? `<i class="fa-solid fa-check"></i> Update Expense`
      : `<i class="fa-solid fa-plus"></i> Save Expense`;
    editingExpenseId = null;
  }
}

// ── Currency symbol update ─────────────────────────────────
document.getElementById('expCurrency')
  ?.addEventListener('change', (e) => {
    const symbol = CURRENCY_SYMBOLS[e.target.value] || e.target.value;
    document.getElementById('expCurrencySymbol').textContent = symbol;
  });

// ── Recurring toggle ───────────────────────────────────────
document.getElementById('expRecurring')
  ?.addEventListener('change', (e) => {
    document.getElementById('expRecurringGroup').style.display =
      e.target.checked ? 'block' : 'none';
  });

// ── Modal close handlers ───────────────────────────────────
document.getElementById('btnCloseExpenseModal')?.addEventListener('click', closeExpenseModal);
document.getElementById('btnCancelExpense')?.addEventListener('click', closeExpenseModal);
document.getElementById('modalAddExpense')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeExpenseModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeExpenseModal();
});

// ── Save button ────────────────────────────────────────────
document.getElementById('btnSaveExpense')?.addEventListener('click', saveExpense);

// ── Initialize ─────────────────────────────────────────────
buildCategoryGrid();