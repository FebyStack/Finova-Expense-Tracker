// js/budgets.js — Add / Edit Budget Modal
import { auth } from './firebase-config.js';
import { loadCategories } from './categories.js';
import { addBudget, editBudget } from './api.js';

let isEditMode = false;
let currentBudgetId = null;
let currentBudgetUid = null;

// ── Local toast helper (avoids circular dep with expenses.js) ──
function budgetToast(message, type = 'success') {
  document.getElementById('appToast')?.remove();
  const toast = document.createElement('div');
  toast.id        = 'appToast';
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Lazy element getters ───────────────────────────────────
function getModal()    { return document.getElementById('budgetModalContainer'); }
function getBackdrop() { return document.getElementById('budgetModalBackdrop'); }

export function initBudgetsModal() {
  console.log('[budgets] initBudgetsModal called');
  const modal    = getModal();
  const backdrop = getBackdrop();
  console.log('[budgets] modal found:', !!modal, '| backdrop found:', !!backdrop);

  if (!modal || !backdrop) {
    console.warn('[budgets] ⚠️  Modal elements not found — skipping init');
    return;
  }

  // Buttons
  document.getElementById('btnCloseBudgetModal')?.addEventListener('click', closeBudgetModal);
  document.getElementById('btnCancelBudget')?.addEventListener('click', closeBudgetModal);
  document.getElementById('btnSaveBudget')?.addEventListener('click', saveBudgetHandler);

  // Also wire the Add Budget button
  document.getElementById('btnAddBudget')?.addEventListener('click', () => openBudgetModal());

  // Populate month/year selects inside modal
  const mSelect = document.getElementById('budMonth');
  const ySelect = document.getElementById('budYear');
  if (mSelect && ySelect) populateMonthYearSelects(mSelect, ySelect);

  console.log('[budgets] ✅ Modal initialized successfully');
}

function populateMonthYearSelects(mSelect, ySelect) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  mSelect.innerHTML = months.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
  const currentYear = new Date().getFullYear();
  let html = '';
  for (let i = currentYear - 2; i <= currentYear + 2; i++) html += `<option value="${i}">${i}</option>`;
  ySelect.innerHTML = html;
}

export async function openBudgetModal(budget = null) {
  console.log('[budgets] openBudgetModal called');

  const budgetModal    = getModal();
  const budgetBackdrop = getBackdrop();

  if (!budgetModal) { console.error('[budgets] ❌ #budgetModalContainer missing'); alert('Budget modal not found — please hard-refresh.'); return; }
  if (!budgetBackdrop) { console.error('[budgets] ❌ #budgetModalBackdrop missing'); return; }

  const user = auth.currentUser;
  if (!user) { console.error('[budgets] ❌ No authenticated user'); return; }

  isEditMode = !!budget;
  currentBudgetId = budget ? budget.id : null;
  currentBudgetUid = user.uid;

  // Title
  document.getElementById('budgetModalTitle').innerHTML = isEditMode
    ? '<i class="fa-solid fa-pen" style="color:var(--accent);"></i> Edit Budget'
    : '<i class="fa-solid fa-chart-pie" style="color:var(--accent);"></i> Add Budget';
  document.getElementById('btnSaveBudgetText').textContent = isEditMode ? 'Update Budget' : 'Save Budget';

  document.getElementById('budError').style.display = 'none';

  // Currency symbol
  const cSym = document.getElementById('budCurrencySymbol');
  if (cSym && window.userCurrency) {
    const symbolMap = { PHP:'₱', USD:'$', EUR:'€', GBP:'£', JPY:'¥', SGD:'S$', AUD:'A$', CAD:'C$', KRW:'₩', INR:'₹' };
    cSym.textContent = symbolMap[window.userCurrency] || window.userCurrency;
  }

  // Categories
  const catSelect = document.getElementById('budCategory');
  catSelect.innerHTML = '<option value="" disabled selected>Loading categories...</option>';
  try {
    const categories = await loadCategories(user.uid);
    catSelect.innerHTML = '<option value="" disabled selected>Select category...</option>' +
      categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  } catch (err) {
    console.error('[budgets] Category load error:', err);
    catSelect.innerHTML = '<option value="" disabled>Error loading categories</option>';
  }

  // Month/Year selects (lazy populate if missed)
  const mSelect = document.getElementById('budMonth');
  const ySelect = document.getElementById('budYear');
  if (mSelect && (!mSelect.options.length || mSelect.options.length < 2)) populateMonthYearSelects(mSelect, ySelect);

  // Fill form
  if (isEditMode) {
    catSelect.value = budget.category || '';
    document.getElementById('budAmount').value = budget.limit_amount || '';
    mSelect.value = budget.month || new Date().getMonth() + 1;
    ySelect.value = budget.year || new Date().getFullYear();
    catSelect.disabled = true;
  } else {
    catSelect.value = '';
    catSelect.disabled = false;
    document.getElementById('budAmount').value = '';
    mSelect.value = new Date().getMonth() + 1;
    ySelect.value = new Date().getFullYear();
  }

  // SHOW
  console.log('[budgets] Showing modal…');
  budgetBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeBudgetModal() {
  const budgetBackdrop = getBackdrop();
  if (!budgetBackdrop) return;
  budgetBackdrop.classList.remove('open');
  document.body.style.overflow = '';
}

async function saveBudgetHandler() {
  const category    = document.getElementById('budCategory').value;
  const limitAmount = document.getElementById('budAmount').value;
  const month       = document.getElementById('budMonth').value;
  const year        = document.getElementById('budYear').value;

  const errorBanner = document.getElementById('budError');
  const errorText   = document.getElementById('budErrorText');

  if (!category || !limitAmount || !month || !year) {
    errorText.textContent = 'Please fill in all required fields.';
    errorBanner.style.display = 'flex';
    return;
  }

  const btn = document.getElementById('btnSaveBudget');
  const origHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  btn.disabled = true;

  try {
    const payload = {
      uid: currentBudgetUid,
      category,
      limitAmount: parseFloat(limitAmount),
      month: parseInt(month),
      year: parseInt(year),
    };

    if (isEditMode) {
      await editBudget(currentBudgetId, currentBudgetUid, payload);
    } else {
      await addBudget(currentBudgetUid, payload);
    }

    closeBudgetModal();
    budgetToast(`Budget ${isEditMode ? 'updated' : 'added'} successfully!`, 'success');
    window.dispatchEvent(new Event('budgetsUpdated'));

  } catch (err) {
    console.error('[budgets] Save error:', err);
    errorText.textContent = err.message || 'Failed to save budget.';
    errorBanner.style.display = 'flex';
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

// Global expose — this is what the HTML onclick calls
window.openBudgetModal = openBudgetModal;

// Self-initialize when module loads (module scripts are deferred = DOM is ready)
initBudgetsModal();
console.log('[budgets] ✅ Module loaded and self-initialized');
