import { auth } from './firebase-config.js';
import { fetchBudgets, fetchExpenses, editBudget, removeBudget } from './api.js';
import { getCategoryStyle } from './categories.js';
import { convertItems, formatCurrency, warmRateCache, convertSync } from './currency.js';
import { addNotification } from './notifications.js';
// openBudgetModal accessed via window.openBudgetModal (set by budgets.js)

// Local toast helper (avoids circular dep with expenses.js)
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

let currentBudgets = [];
let currentMonth = new Date().getMonth() + 1;
let currentYear = new Date().getFullYear();

// Elements
const filterMonth = document.getElementById('budgetMonthFilter');
const filterYear = document.getElementById('budgetYearFilter');
const budgetListContainer = document.getElementById('budgetItemsContainer');
const dashBudgetListContainer = document.getElementById('dashBudgetList'); // on dashboard

export async function initBudgetsList() {
  if (filterMonth && filterYear) {
    // Populate filter dropdowns
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    filterMonth.innerHTML = months.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
    
    let yearsHtml = '';
    for(let i = currentYear - 2; i <= currentYear + 2; i++) {
      yearsHtml += `<option value="${i}">${i}</option>`;
    }
    filterYear.innerHTML = yearsHtml;

    filterMonth.value = currentMonth;
    filterYear.value = currentYear;

    filterMonth.addEventListener('change', (e) => { currentMonth = parseInt(e.target.value); loadBudgets(); });
    filterYear.addEventListener('change', (e) => { currentYear = parseInt(e.target.value); loadBudgets(); });
  }

  // Listen for refresh events
  window.addEventListener('budgetsUpdated', loadBudgets);
  window.addEventListener('expensesUpdated', loadBudgets); // because expenses change the spent amount
  
  // Expose delete to window so HTML inline onclick works
  window.confirmDeleteBudget = confirmDeleteBudget;
  window.openEditBudget = openEditBudget;

  // Initial load if auth is ready, else wait
  if (auth.currentUser) {
    loadBudgets();
  } else {
    auth.onAuthStateChanged(user => { if(user) loadBudgets(); });
  }
}

async function loadBudgets() {
  const user = auth.currentUser;
  if (!user) return;

  if (budgetListContainer) budgetListContainer.innerHTML = '<div class="list-empty">Loading budgets...</div>';

  try {
    // 1. Ensure currency rates are warmed up
    await warmRateCache(window.userCurrency || 'PHP');

    // 2. Fetch budgets and expenses for the month
    const [ budgets, expenses ] = await Promise.all([
      fetchBudgets(user.uid, { month: currentMonth, year: currentYear }),
      fetchExpenses(user.uid, { month: currentMonth, year: currentYear })
    ]);

    currentBudgets = budgets || [];

    // 3. Convert all expenses to user's base currency to accurately calculate 'spent'
    const { items: convertedExpenses } = await convertItems(expenses || [], window.userCurrency || 'PHP');

    // 4. Aggregate spent by category
    const spentByCategory = {};
    convertedExpenses.forEach(exp => {
      const cat = exp.category || 'Uncategorized';
      if (!spentByCategory[cat]) spentByCategory[cat] = 0;
      spentByCategory[cat] += parseFloat(exp.convertedAmount || 0);
    });

    // 5. Update budgets if spent amount has drifted & trigger alerts
    const updatePromises = [];
    currentBudgets.forEach(b => {
      const actualSpent = spentByCategory[b.category] || 0;
      
      const rawLimit = parseFloat(b.limit_amount) || 1;
      const limit    = convertSync(rawLimit, b.currency || 'PHP', window.userCurrency || 'PHP');
      
      // Compare ignoring tiny float differences
      if (Math.abs(parseFloat(b.spent || 0) - actualSpent) > 0.02) {
        b.spent = actualSpent; // Update local memory immediately
        updatePromises.push(editBudget(b.id, user.uid, { spent: actualSpent }));
      }

      // -- Budget Alerts Logic --
      const ratio = actualSpent / limit;
      if (ratio >= 1.0) {
        // Exceeded alert
        addNotification(
          `budget-${b.id}-100-${currentMonth}-${currentYear}`,
          `${b.category} Budget Exceeded!`,
          `You've spent ${formatCurrency(actualSpent, window.userCurrency)} out of ${formatCurrency(limit, window.userCurrency)} for ${b.category}.`,
          'danger'
        );
      } else if (ratio >= 0.8) {
        // Warning alert
        addNotification(
          `budget-${b.id}-80-${currentMonth}-${currentYear}`,
          `${b.category} Budget Warning`,
          `You've reached ${Math.round(ratio * 100)}% of your ${b.category} budget.`,
          'warning'
        );
      }
    });

    // Fire off updates silently in background (don't block UI render)
    if (updatePromises.length > 0) {
      Promise.all(updatePromises).catch(err => console.error("Failed to auto-sync budget spent limits", err));
    }

    renderBudgets();

  } catch (err) {
    console.error("Error loading budgets:", err);
    if (budgetListContainer) budgetListContainer.innerHTML = `<div class="list-empty text-danger">Failed to load budgets: ${err.message}</div>`;
  }
}

function renderBudgets() {
  const html = currentBudgets.length === 0 
    ? `<div class="list-empty" style="grid-column: 1 / -1;">
         <i class="fa-solid fa-chart-pie" style="font-size:32px; color:var(--text-muted); margin-bottom:12px;"></i>
         <p>No budgets found for this month.</p>
       </div>`
    : currentBudgets.map(b => buildBudgetCardHTML(b)).join('');

  if (budgetListContainer) {
    budgetListContainer.innerHTML = html;
  }
}

function buildBudgetCardHTML(budget) {
  const { category, limit_amount, spent, id, currency } = budget;
  const style = getCategoryStyle(category);
  
  const baseCurrency = window.userCurrency || 'PHP';

  const rawLimit = parseFloat(limit_amount) || 0;
  const limit    = convertSync(rawLimit, currency || 'PHP', baseCurrency);
  
  const currentSpent = parseFloat(spent) || 0; // Note: spent was updated to userCurrency logic above
  
  let percentage = limit > 0 ? (currentSpent / limit) * 100 : 0;
  if (percentage > 100) percentage = 100;

  // Determine status classes
  let progressClass = '';
  let dangerClass = '';
  let statusText = 'On track';
  let statusClass = '';

  if (currentSpent >= limit) {
    progressClass = 'danger';
    dangerClass = 'danger';
    statusText = 'Over budget';
    statusClass = 'danger';
  } else if (currentSpent >= limit * 0.8) {
    progressClass = 'warning';
    statusText = 'Near limit';
    statusClass = 'warning';
  }

  return `
    <div class="budget-card ${dangerClass}">
      <div class="budget-header">
        <div class="budget-category">
          <div class="budget-cat-icon" style="background:${style.bg}; color:${style.color}">
            <i class="${style.icon}"></i>
          </div>
          <span class="budget-cat-name">${category}</span>
        </div>
        <div class="budget-actions">
          <button class="budget-action-btn edit" onclick="window.openEditBudget(${id})" title="Edit limit">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="budget-action-btn delete" onclick="window.confirmDeleteBudget(${id})" title="Delete budget">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="budget-meta">
         <span class="budget-amounts">
           <strong>${formatCurrency(currentSpent, baseCurrency)}</strong> / ${formatCurrency(limit, baseCurrency)}
         </span>
         <span class="budget-status ${statusClass}">${statusText}</span>
      </div>
      
      <div class="budget-progress-container">
        <div class="budget-progress-bar ${progressClass}" style="width: ${percentage}%"></div>
      </div>

      <div class="budget-meta">
        <span class="budget-meta-percent">${Math.round(percentage)}%</span>
      </div>
    </div>
  `;
}

// Global actions
function openEditBudget(id) {
  const budget = currentBudgets.find(b => b.id === id);
  if (budget) window.openBudgetModal(budget);
}

window.confirmDeleteBudget = function(id) {
  // We can reuse the confirm-dialog overlay already in index/dashboard HTML
  const overlay = document.getElementById('confirmDialogOverlay');
  if (!overlay) {
    if (confirm("Delete this budget?")) executeDeleteBudget(id);
    return;
  }
  
  document.getElementById('confirmDialogTitle').textContent = 'Delete Budget?';
  document.getElementById('confirmDialogMessage').textContent = 'Are you sure you want to delete this budget constraint? Your expenses will remain unaffected.';
  
  const confirmBtn = document.getElementById('confirmDialogActionBtn');
  confirmBtn.textContent = 'Delete Budget';
  confirmBtn.onclick = () => {
    overlay.classList.remove('open');
    setTimeout(() => { overlay.style.display = 'none'; }, 250);
    executeDeleteBudget(id);
  };
  
  overlay.style.display = 'flex';
  setTimeout(() => overlay.classList.add('open'), 10);
};

async function executeDeleteBudget(id) {
  try {
    const user = auth.currentUser;
    await removeBudget(id, user.uid);
    budgetToast('Budget deleted successfully', 'success');
    window.dispatchEvent(new Event('budgetsUpdated'));
  } catch (err) {
    console.error("Delete Error:", err);
    budgetToast('Failed to delete budget', 'error');
  }
}

// Self-initialize
initBudgetsList();
console.log('[budgets-list] ✅ Module loaded and self-initialized');
