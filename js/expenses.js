// js/expenses.js
// Add Expense modal — UI + Firestore save

import { db, auth }   from './firebase-config.js';
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";


// ── Category definitions ───────────────────────────────────
const CATEGORIES = [
  { name: 'Food',          icon: 'fa-solid fa-utensils',       bg: '#fff3e0', color: '#f59e0b' },
  { name: 'Transport',     icon: 'fa-solid fa-car',            bg: '#e3f2fd', color: '#2196f3' },
  { name: 'Shopping',      icon: 'fa-solid fa-bag-shopping',   bg: '#fce4ec', color: '#e91e63' },
  { name: 'Bills',         icon: 'fa-solid fa-file-invoice',   bg: '#f3e5f5', color: '#9c27b0' },
  { name: 'Health',        icon: 'fa-solid fa-heart-pulse',    bg: '#e8f5e9', color: '#4caf50' },
  { name: 'Entertainment', icon: 'fa-solid fa-tv',             bg: '#e0f7fa', color: '#00bcd4' },
  { name: 'Education',     icon: 'fa-solid fa-graduation-cap', bg: '#e8eaf6', color: '#3f51b5' },
  { name: 'Savings',       icon: 'fa-solid fa-piggy-bank',     bg: '#fff8e1', color: '#ffc107' },
  { name: 'Subscriptions', icon: 'fa-solid fa-repeat',         bg: '#f3e5f5', color: '#7c3aed' },
  { name: 'Travel',        icon: 'fa-solid fa-plane',          bg: '#e0f2fe', color: '#0284c7' },
  { name: 'Groceries',     icon: 'fa-solid fa-cart-shopping',  bg: '#f0fdf4', color: '#16a34a' },
  { name: 'Other',         icon: 'fa-solid fa-circle-dot',     bg: '#f5f5f5', color: '#9aa0b0' },
];

// Currency symbol map
const CURRENCY_SYMBOLS = {
  PHP: '₱', USD: '$', EUR: '€',
  GBP: '£', JPY: '¥', SGD: 'S$', AUD: 'A$'
};


// ── State ──────────────────────────────────────────────────
let selectedCategory = null;
let isSaving         = false;


// ── Build category grid ────────────────────────────────────
function buildCategoryGrid() {
  const grid = document.getElementById('expCategoryGrid');
  if (!grid) return;

  grid.innerHTML = CATEGORIES.map(cat => `
    <button
      type="button"
      class="category-btn"
      data-category="${cat.name}"
      onclick="selectCategory('${cat.name}')"
    >
      <div class="category-btn-icon"
           style="background:${cat.bg}; color:${cat.color};">
        <i class="${cat.icon}"></i>
      </div>
      <span class="category-btn-label">${cat.name}</span>
    </button>
  `).join('');
}


// ── Select a category ──────────────────────────────────────
window.selectCategory = function(name) {
  selectedCategory = name;
  document.getElementById('expCategory').value = name;

  // Update visual selection
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.category === name);
  });

  hideExpenseError();
};


// ── Open modal ─────────────────────────────────────────────
export function openExpenseModal() {
  const modal = document.getElementById('modalAddExpense');
  if (!modal) return;

  // Reset form
  resetExpenseForm();

  // Set today's date as default
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('expDate').value = today;

  // Set user's base currency
  const user = auth.currentUser;
  // Currency will be set by app.js after profile loads

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Focus amount input
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
  document.getElementById('expAmount').value       = '';
  document.getElementById('expNote').value         = '';
  document.getElementById('expCategory').value     = '';
  document.getElementById('expRecurring').checked  = false;
  document.getElementById('expRecurringGroup').style.display = 'none';
  selectedCategory = null;

  // Clear category selection
  document.querySelectorAll('.category-btn')
    .forEach(btn => btn.classList.remove('selected'));

  hideExpenseError();
}


// ── Error handling ─────────────────────────────────────────
function showExpenseError(message) {
  const box  = document.getElementById('expError');
  const text = document.getElementById('expErrorText');
  if (!box || !text) return;
  text.textContent   = message;
  box.style.display  = 'flex';
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


// ── Save expense to Firestore ──────────────────────────────
async function saveExpense() {
  if (!validateExpenseForm()) return;
  if (isSaving) return;

  const user = auth.currentUser;
  if (!user) return;

  isSaving = true;
  const btn = document.getElementById('btnSaveExpense');
  btn.disabled  = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving…`;

  try {
    const amount    = parseFloat(document.getElementById('expAmount').value);
    const currency  = document.getElementById('expCurrency').value;
    const date      = document.getElementById('expDate').value;
    const note      = document.getElementById('expNote').value.trim();
    const recurring = document.getElementById('expRecurring').checked;
    const frequency = document.getElementById('expFrequency').value;

    const dateObj = new Date(date);
    const month   = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

    console.log('📦 db:', db);
    console.log('👤 user:', user.uid);
    console.log('💰 amount:', amount);

    const docRef = await addDoc(
      collection(db, 'users', user.uid, 'expenses'),
      {
        amount,
        currency,
        category:  selectedCategory,
        date,
        month,
        note:      note || '',
        recurring,
        frequency: recurring ? frequency : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    console.log('✅ Saved! Doc ID:', docRef.id);

    closeExpenseModal();
    showToast('Expense saved successfully!', 'success');

    const currentPage = window.location.hash.replace('#', '') || 'dashboard';
    if (currentPage === 'dashboard' && window.refreshDashboard) {
      window.refreshDashboard();
    }

  } catch (error) {
    console.error('❌ Save expense error code:', error.code);
    console.error('❌ Save expense error message:', error.message);
    showExpenseError('Failed to save expense. Please try again.');
  } finally {
    isSaving = false;
    btn.disabled  = false;
    btn.innerHTML = `<i class="fa-solid fa-plus"></i> Save Expense`;
  }
}
    // Close modal
    closeExpenseModal();

    // Show success toast
    showToast('Expense saved successfully!', 'success');

    // Refresh dashboard if on dashboard page
    const currentPage = window.location.hash.replace('#', '') || 'dashboard';
    if (currentPage === 'dashboard' && window.refreshDashboard) {
      window.refreshDashboard();
    }

// ── Toast notification ─────────────────────────────────────
function showToast(message, type = 'success') {
  // Remove existing toast
  document.getElementById('appToast')?.remove();

  const toast = document.createElement('div');
  toast.id    = 'appToast';
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => toast.classList.add('visible'));

  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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
document.getElementById('btnCloseExpenseModal')
  ?.addEventListener('click', closeExpenseModal);

document.getElementById('btnCancelExpense')
  ?.addEventListener('click', closeExpenseModal);

// Close on overlay click
document.getElementById('modalAddExpense')
  ?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeExpenseModal();
  });

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeExpenseModal();
});


// ── Save button ────────────────────────────────────────────
document.getElementById('btnSaveExpense')
  ?.addEventListener('click', saveExpense);


// ── Initialize ─────────────────────────────────────────────
buildCategoryGrid();


// ── Export toast for use in other modules ─────────────────
export { showToast };