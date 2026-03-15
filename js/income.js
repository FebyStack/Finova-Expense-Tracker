// js/income.js
// Add / Edit Income modal — UI + PostgreSQL save (mirrors to Firebase automatically)

import { addIncome, editIncome } from './api.js';
import { auth } from './firebase-config.js';

// ── Source definitions ─────────────────────────────────────
const SOURCES = [
  { name: 'Salary',      icon: 'fa-solid fa-briefcase',      bg: '#e8f5e9', color: '#22c55e' },
  { name: 'Freelance',   icon: 'fa-solid fa-laptop-code',    bg: '#e0f2fe', color: '#0284c7' },
  { name: 'Business',    icon: 'fa-solid fa-store',           bg: '#fff8e1', color: '#f59e0b' },
  { name: 'Investment',  icon: 'fa-solid fa-chart-line',      bg: '#f3e5f5', color: '#9c27b0' },
  { name: 'Gift',        icon: 'fa-solid fa-gift',            bg: '#fce4ec', color: '#e91e63' },
  { name: 'Refund',      icon: 'fa-solid fa-rotate-left',     bg: '#e0f7fa', color: '#00bcd4' },
  { name: 'Rental',      icon: 'fa-solid fa-house',           bg: '#fff3e0', color: '#ef6c00' },
  { name: 'Side Hustle', icon: 'fa-solid fa-bolt',            bg: '#eef2ff', color: '#6366f1' },
  { name: 'Pension',     icon: 'fa-solid fa-landmark',        bg: '#f0fdf4', color: '#16a34a' },
  { name: 'Other',       icon: 'fa-solid fa-circle-dot',      bg: '#f5f5f5', color: '#9aa0b0' },
];

const CURRENCY_SYMBOLS = {
  PHP: '₱', USD: '$', EUR: '€',
  GBP: '£', JPY: '¥', SGD: 'S$', AUD: 'A$'
};

// ── State ──────────────────────────────────────────────────
let selectedSource     = null;
let isSaving           = false;
let editingIncomeId    = null;

// ── Build source grid ──────────────────────────────────────
function buildSourceGrid() {
  const grid = document.getElementById('incSourceGrid');
  if (!grid) return;
  grid.innerHTML = SOURCES.map(src => `
    <button
      type="button"
      class="category-btn"
      data-source="${src.name}"
      onclick="selectIncomeSource('${src.name}')"
    >
      <div class="category-btn-icon" style="background:${src.bg}; color:${src.color};">
        <i class="${src.icon}"></i>
      </div>
      <span class="category-btn-label">${src.name}</span>
    </button>
  `).join('');
}

// ── Select a source ────────────────────────────────────────
window.selectIncomeSource = function(name) {
  selectedSource = name;
  document.getElementById('incSource').value = name;
  document.querySelectorAll('#incSourceGrid .category-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.source === name);
  });
  hideIncomeError();
};

// ── Open modal ─────────────────────────────────────────────
export function openIncomeModal(prefill = {}) {
  const modal = document.getElementById('modalAddIncome');
  if (!modal) return;

  resetIncomeForm();

  editingIncomeId = prefill.id || null;

  const titleEl = document.getElementById('modalIncomeTitle');
  const saveBtn = document.getElementById('btnSaveIncome');
  if (editingIncomeId) {
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen" style="color:var(--accent);"></i> Edit Income';
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Update Income</span>';
  } else {
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-arrow-trend-up" style="color:var(--success);"></i> Add Income';
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-plus"></i> <span>Save Income</span>';
  }

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('incDate').value = prefill.date || today;

  if (prefill.amount) document.getElementById('incAmount').value = prefill.amount;
  if (prefill.note)   document.getElementById('incNote').value   = prefill.note;
  if (prefill.currency) {
    const currSel = document.getElementById('incCurrency');
    if (currSel) currSel.value = prefill.currency;
    const sym = CURRENCY_SYMBOLS[prefill.currency] || prefill.currency;
    const symEl = document.getElementById('incCurrencySymbol');
    if (symEl) symEl.textContent = sym;
  }
  if (prefill.source) window.selectIncomeSource(prefill.source);

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  setTimeout(() => {
    document.getElementById('incAmount')?.focus();
  }, 200);
}

// ── Close modal ────────────────────────────────────────────
export function closeIncomeModal() {
  const modal = document.getElementById('modalAddIncome');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Reset form ─────────────────────────────────────────────
function resetIncomeForm() {
  document.getElementById('incAmount').value = '';
  document.getElementById('incNote').value   = '';
  document.getElementById('incSource').value = '';
  selectedSource   = null;
  editingIncomeId  = null;
  document.querySelectorAll('#incSourceGrid .category-btn').forEach(btn => btn.classList.remove('selected'));
  hideIncomeError();
}

// ── Error handling ─────────────────────────────────────────
function showIncomeError(message) {
  const box  = document.getElementById('incError');
  const text = document.getElementById('incErrorText');
  if (!box || !text) return;
  text.textContent  = message;
  box.style.display = 'flex';
}

function hideIncomeError() {
  const box = document.getElementById('incError');
  if (box) box.style.display = 'none';
}

// ── Toast ──────────────────────────────────────────────────
export function showIncomeToast(message, type = 'success') {
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

// ── Validate ───────────────────────────────────────────────
function validateIncomeForm() {
  const amount = parseFloat(document.getElementById('incAmount').value);
  const date   = document.getElementById('incDate').value;

  if (!amount || isNaN(amount) || amount <= 0) {
    showIncomeError('Please enter a valid amount greater than 0.');
    return false;
  }
  if (!selectedSource) {
    showIncomeError('Please select an income source.');
    return false;
  }
  if (!date) {
    showIncomeError('Please select a date.');
    return false;
  }
  return true;
}

// ── Save income ────────────────────────────────────────────
async function saveIncome() {
  if (!validateIncomeForm()) return;
  if (isSaving) return;

  const user = auth.currentUser;
  if (!user) return;

  isSaving     = true;
  const btn    = document.getElementById('btnSaveIncome');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving…`;

  try {
    const amount   = parseFloat(document.getElementById('incAmount').value);
    const currency = document.getElementById('incCurrency').value || 'PHP';
    const date     = document.getElementById('incDate').value;
    const note     = document.getElementById('incNote').value.trim();
    const dateObj  = new Date(date);
    const month    = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

    const payload = {
      amount,
      currency,
      source: selectedSource,
      date,
      month,
      note: note || '',
    };

    if (editingIncomeId) {
      await editIncome(editingIncomeId, user.uid, payload);
      console.log('✅ Updated income in PostgreSQL! ID:', editingIncomeId);
    } else {
      const saved = await addIncome(user.uid, payload);
      console.log('✅ Saved income to PostgreSQL! ID:', saved.id);
    }

    closeIncomeModal();
    showIncomeToast(
      editingIncomeId ? 'Income updated successfully!' : 'Income saved successfully!',
      'success'
    );

    if (window.refreshDashboard) window.refreshDashboard();

  } catch (err) {
    console.error('❌ Save income error:', err.message);
    showIncomeError(
      editingIncomeId
        ? 'Failed to update income. Please try again.'
        : 'Failed to save income. Please try again.'
    );
  } finally {
    isSaving     = false;
    btn.disabled = false;
    btn.innerHTML = editingIncomeId
      ? `<i class="fa-solid fa-check"></i> Update Income`
      : `<i class="fa-solid fa-plus"></i> Save Income`;
    editingIncomeId = null;
  }
}

// ── Currency symbol update ─────────────────────────────────
document.getElementById('incCurrency')
  ?.addEventListener('change', (e) => {
    const symbol = CURRENCY_SYMBOLS[e.target.value] || e.target.value;
    document.getElementById('incCurrencySymbol').textContent = symbol;
  });

// ── Modal close handlers ───────────────────────────────────
document.getElementById('btnCloseIncomeModal')?.addEventListener('click', closeIncomeModal);
document.getElementById('btnCancelIncome')?.addEventListener('click', closeIncomeModal);
document.getElementById('modalAddIncome')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeIncomeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeIncomeModal();
});

// ── Save button ────────────────────────────────────────────
document.getElementById('btnSaveIncome')?.addEventListener('click', saveIncome);

// ── Initialize ─────────────────────────────────────────────
buildSourceGrid();
