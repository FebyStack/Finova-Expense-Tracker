import { addExpense, editExpense, fetchExpenses } from './api.js'

import { loadCategories, bgFromColor } from './categories.js';
import { getCategoryStyle } from './categories.js';
import { formatCurrency } from './currency.js';

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
let currentQuickFillTab = 'recent';
let cachedRecentExpenses = [];

const TEMPLATES_KEY = 'finova_expense_templates';

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

  // Quick Fill: show only in Add mode
  const qfSection = document.getElementById('quickFillSection');
  const templateBtn = document.getElementById('btnSaveAsTemplate');
  if (editingExpenseId) {
    if (qfSection) qfSection.style.display = 'none';
    if (templateBtn) templateBtn.style.display = 'none';
  } else {
    if (qfSection) qfSection.style.display = '';
    if (templateBtn) templateBtn.style.display = '';
    currentQuickFillTab = 'recent';
    loadQuickFillData();
  }

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
    // Fallback: check the hidden input value (handles instance desync)
    const hiddenCat = document.getElementById('expCategory')?.value;
    if (hiddenCat) {
      selectedCategory = hiddenCat;
    } else {
      showExpenseError('Please select a category.');
      return false;
    }
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

  const user = window.currentUser;
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

    let dateObj = new Date(date);
    if (isNaN(dateObj)) dateObj = new Date(); // fallback if date was completely invalid
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
      receiptData: window._pendingReceiptData || null,
    };

    console.group('🚀 [Expense Save Debug]');
    console.log('Payload:', payload);

    // ── Edit mode vs Add mode ──
    let saved;
    if (editingExpenseId) {
      saved = await editExpense(editingExpenseId, user.uid, payload);
      console.log('✅ Updated in PostgreSQL! Result:', saved);
    } else {
      saved = await addExpense(user.uid, payload);
      console.log('✅ Saved to PostgreSQL! Result:', saved);
    }
    console.groupEnd();

    window._pendingReceiptData = null;

    closeExpenseModal();
    showToast(
      editingExpenseId ? 'Expense updated successfully!' : 'Expense saved successfully!',
      'success'
    );

    // Refresh both dashboard and expense list
    if (window.refreshDashboard) window.refreshDashboard();

  } catch (err) {
    console.error('❌ [Expense Save Error]:', err);
    console.groupEnd();
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

// ── Save button ──────────────────────────────────────────
document.getElementById('btnSaveExpense')?.addEventListener('click', saveExpense);

// ── Save as Template button ──────────────────────────────
// Pending template data while the name modal is open
let pendingTemplateData = null;

document.getElementById('btnSaveAsTemplate')?.addEventListener('click', () => {
  const amount = document.getElementById('expAmount').value;
  const currency = document.getElementById('expCurrency').value || 'PHP';
  const note = document.getElementById('expNote').value.trim();

  if (!selectedCategory) {
    // Fallback: check the hidden input value (handles instance desync)
    const hiddenCat = document.getElementById('expCategory')?.value;
    if (hiddenCat) {
      selectedCategory = hiddenCat;
    } else {
      showExpenseError('Please select a category first before saving a template.');
      return;
    }
  }

  // Store data and open the naming modal
  pendingTemplateData = { category: selectedCategory, amount: amount || '', currency, note };

  const nameInput = document.getElementById('templateNameInput');
  const overlay = document.getElementById('templateNameOverlay');
  if (nameInput) nameInput.value = `${selectedCategory}${note ? ' - ' + note : ''}`;
  if (overlay) overlay.classList.add('open');
  setTimeout(() => nameInput?.focus(), 200);
});

// Confirm template name from the modal
document.getElementById('btnConfirmTemplateName')?.addEventListener('click', () => {
  const nameInput = document.getElementById('templateNameInput');
  const templateName = nameInput?.value.trim();
  if (!templateName) { nameInput?.focus(); return; }
  if (!pendingTemplateData) return;

  const templates = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
  templates.push({ name: templateName, ...pendingTemplateData });
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));

  pendingTemplateData = null;
  document.getElementById('templateNameOverlay')?.classList.remove('open');

  showToast('Template saved!', 'success');

  // Refresh to Templates tab
  currentQuickFillTab = 'templates';
  loadQuickFillData();
});

window.cancelTemplateName = function() {
  pendingTemplateData = null;
  document.getElementById('templateNameOverlay')?.classList.remove('open');
};

// Close template name modal on backdrop click
document.getElementById('templateNameOverlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) window.cancelTemplateName();
});

// ── Quick Fill: Load Data ───────────────────────────────
async function loadQuickFillData() {
  // Update tab active states
  document.getElementById('tabRecent')?.classList.toggle('active', currentQuickFillTab === 'recent');
  document.getElementById('tabTemplates')?.classList.toggle('active', currentQuickFillTab === 'templates');

  const list = document.getElementById('quickFillList');
  if (!list) return;

  if (currentQuickFillTab === 'recent') {
    await loadRecentChips(list);
  } else {
    loadTemplateChips(list);
  }
}

async function loadRecentChips(list) {
  list.innerHTML = '<div class="quick-fill-empty">Loading…</div>';

  try {
    const user = window.currentUser;
    if (!user) { list.innerHTML = '<div class="quick-fill-empty">Not signed in.</div>'; return; }

    // Fetch recent expenses (no month filter = all, take last 5)
    if (cachedRecentExpenses.length === 0) {
      const all = await fetchExpenses(user.uid);
      all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      cachedRecentExpenses = all.slice(0, 5);
    }

    if (cachedRecentExpenses.length === 0) {
      list.innerHTML = '<div class="quick-fill-empty">No recent expenses found.</div>';
      return;
    }

    list.innerHTML = cachedRecentExpenses.map((exp, i) => {
      const style = getCategoryStyle(exp.category);
      const currency = exp.currency || window.userCurrency || 'PHP';
      const amt = formatCurrency(parseFloat(exp.amount) || 0, currency);
      return `
        <div class="quick-fill-chip" onclick="window.applyQuickFill('recent', ${i})">
          <div class="quick-fill-chip-icon" style="background:${style.bg}; color:${style.color};">
            <i class="${style.icon}"></i>
          </div>
          <div class="quick-fill-chip-info">
            <div class="quick-fill-chip-label">${exp.category}</div>
            <div class="quick-fill-chip-amount">${amt}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn('Failed to load recent expenses:', err);
    list.innerHTML = '<div class="quick-fill-empty">Could not load recent expenses.</div>';
  }
}

function loadTemplateChips(list) {
  const templates = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');

  if (templates.length === 0) {
    list.innerHTML = '<div class="quick-fill-empty"><i class="fa-solid fa-bookmark" style="margin-right:4px;"></i> No templates yet. Fill the form and click "Save as Template".</div>';
    return;
  }

  list.innerHTML = templates.map((tpl, i) => {
    const style = getCategoryStyle(tpl.category);
    const currency = tpl.currency || window.userCurrency || 'PHP';
    const amt = tpl.amount ? formatCurrency(parseFloat(tpl.amount) || 0, currency) : '';
    return `
      <div class="quick-fill-chip" onclick="window.applyQuickFill('template', ${i})">
        <div class="quick-fill-chip-icon" style="background:${style.bg}; color:${style.color};">
          <i class="${style.icon}"></i>
        </div>
        <div class="quick-fill-chip-info">
          <div class="quick-fill-chip-label">${tpl.name}</div>
          <div class="quick-fill-chip-amount">${amt}</div>
        </div>
        <button class="quick-fill-chip-delete" onclick="event.stopPropagation(); window.deleteTemplate(${i});" title="Delete template">&times;</button>
      </div>
    `;
  }).join('');
}

// ── Quick Fill: Tab Switching ──────────────────────────
window.switchQuickFillTab = function(tab) {
  currentQuickFillTab = tab;
  loadQuickFillData();
};

// ── Quick Fill: Apply ─────────────────────────────────
window.applyQuickFill = function(source, index) {
  let data;
  if (source === 'recent') {
    data = cachedRecentExpenses[index];
  } else {
    const templates = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
    data = templates[index];
  }
  if (!data) return;

  // Prefill the form
  if (data.amount) document.getElementById('expAmount').value = data.amount;
  if (data.note)   document.getElementById('expNote').value   = data.note;
  if (data.currency) {
    const currSel = document.getElementById('expCurrency');
    if (currSel) currSel.value = data.currency;
    const sym = CURRENCY_SYMBOLS[data.currency] || data.currency;
    const symEl = document.getElementById('expCurrencySymbol');
    if (symEl) symEl.textContent = sym;
  }
  if (data.category) window.selectCategory(data.category);

  // Keep today's date
  showToast('Form filled from ' + (source === 'recent' ? 'recent expense' : 'template') + '!', 'success');
};

// ── Quick Fill: Delete Template ────────────────────────
window.deleteTemplate = function(index) {
  const templates = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
  templates.splice(index, 1);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  loadQuickFillData();
  showToast('Template removed.', 'success');
};

// ── Initialize ─────────────────────────────────────────
buildCategoryGrid();