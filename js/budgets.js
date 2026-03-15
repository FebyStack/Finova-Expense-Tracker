import { db, auth } from './firebase-config.js';
import { loadCategories, getCategoryStyle } from './categories.js';
import { showToast } from './app.js';
import { addBudget, editBudget } from './api.js';

let budgetModal;
let budgetBackdrop;
let isEditMode = false;
let currentBudgetId = null;
let currentBudgetUid = null;

export function initBudgetsModal() {
  budgetModal = document.querySelector('.modal:has(#budCategory)');
  budgetBackdrop = document.getElementById('budgetModalBackdrop');
  
  if (!budgetModal || !budgetBackdrop) return;

  // Buttons
  document.getElementById('btnCloseBudgetModal')?.addEventListener('click', closeBudgetModal);
  document.getElementById('btnCancelBudget')?.addEventListener('click', closeBudgetModal);
  document.getElementById('btnSaveBudget')?.addEventListener('click', saveBudgetHandler);

  // Month / Year defaults
  const mSelect = document.getElementById('budMonth');
  const ySelect = document.getElementById('budYear');
  if (mSelect && ySelect) {
    populateMonthYearSelects(mSelect, ySelect);
  }
}

function populateMonthYearSelects(mSelect, ySelect) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  mSelect.innerHTML = months.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
  
  const currentYear = new Date().getFullYear();
  let yearsHtml = '';
  for(let i = currentYear - 2; i <= currentYear + 2; i++) {
    yearsHtml += `<option value="${i}">${i}</option>`;
  }
  ySelect.innerHTML = yearsHtml;
}

export async function openBudgetModal(budget = null) {
  if (!budgetModal || !budgetBackdrop) return;
  const user = auth.currentUser;
  if (!user) return;

  isEditMode = !!budget;
  currentBudgetId = budget ? budget.id : null;
  currentBudgetUid = user.uid;

  document.getElementById('budgetModalTitle').innerHTML = isEditMode 
    ? '<i class="fa-solid fa-pen" style="color:var(--accent);"></i> Edit Budget'
    : '<i class="fa-solid fa-chart-pie" style="color:var(--accent);"></i> Add Budget';
  document.getElementById('btnSaveBudgetText').textContent = isEditMode ? 'Update Budget' : 'Save Budget';
  
  document.getElementById('budError').style.display = 'none';
  
  // Set currency symbol
  const cSym = document.getElementById('budCurrencySymbol');
  if (cSym && window.userCurrency) {
    const symbolMap = { PHP:'₱', USD:'$', EUR:'€', GBP:'£', JPY:'¥', SGD:'S$', AUD:'A$', CAD:'C$', KRW:'₩', INR:'₹' };
    cSym.textContent = symbolMap[window.userCurrency] || window.userCurrency;
  }

  // Load Categories
  const catSelect = document.getElementById('budCategory');
  catSelect.innerHTML = '<option value="" disabled selected>Loading categories...</option>';
  try {
    const categories = await loadCategories(user.uid);
    catSelect.innerHTML = '<option value="" disabled selected>Select category...</option>' + 
      categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  } catch (err) {
    catSelect.innerHTML = '<option value="" disabled>Error loading categories</option>';
  }

  // Populate data
  if (isEditMode) {
    catSelect.value = budget.category || '';
    document.getElementById('budAmount').value = budget.limit_amount || '';
    document.getElementById('budMonth').value = budget.month || new Date().getMonth() + 1;
    document.getElementById('budYear').value = budget.year || new Date().getFullYear();
    // In edit mode usually category is locked because budgets are unique per category+month+year
    catSelect.disabled = true;
  } else {
    catSelect.value = '';
    catSelect.disabled = false;
    document.getElementById('budAmount').value = '';
    document.getElementById('budMonth').value = new Date().getMonth() + 1;
    document.getElementById('budYear').value = new Date().getFullYear();
  }

  budgetBackdrop.style.display = 'flex';
  setTimeout(() => budgetModal.classList.add('visible'), 10);
}

export function closeBudgetModal() {
  if (!budgetModal || !budgetBackdrop) return;
  budgetModal.classList.remove('visible');
  setTimeout(() => {
    budgetBackdrop.style.display = 'none';
  }, 300);
}

async function saveBudgetHandler() {
  const category = document.getElementById('budCategory').value;
  const limitAmount = document.getElementById('budAmount').value;
  const month = document.getElementById('budMonth').value;
  const year = document.getElementById('budYear').value;

  const errorBanner = document.getElementById('budError');
  const errorText = document.getElementById('budErrorText');

  if (!category || !limitAmount || !month || !year) {
    errorText.textContent = "Please fill in all required fields.";
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
      category: category,
      limitAmount: parseFloat(limitAmount),
      month: parseInt(month),
      year: parseInt(year)
    };

    if (isEditMode) {
      await editBudget(currentBudgetId, currentBudgetUid, payload);
    } else {
      await addBudget(currentBudgetUid, payload);
    }

    closeBudgetModal();
    showToast(`Budget ${isEditMode ? 'updated' : 'added'} successfully!`, 'success');
    
    // Dispatch custom event to trigger reload
    window.dispatchEvent(new Event('budgetsUpdated'));

  } catch (err) {
    console.error("Save Budget Error:", err);
    errorText.textContent = err.message || "Failed to save budget.";
    errorBanner.style.display = 'flex';
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

// Global expose for buttons like "Add Budget"
window.openBudgetModal = openBudgetModal;
