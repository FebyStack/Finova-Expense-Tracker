
import { fetchBudgets, fetchExpenses, editBudget, removeBudget } from './api.js';
import { getCategoryStyle } from './categories.js';
import { convertItems, formatCurrency, warmRateCache, convertSync } from './currency.js';
import { addNotification } from './notifications.js';
import { showToast } from './toast.js';

// openBudgetModal accessed via window.openBudgetModal (set by budgets.js)

let currentBudgets = [];
let currentMonth = new Date().getMonth() + 1;
let currentYear = new Date().getFullYear();

// Elements
const budgetPicker = document.getElementById('budgetMonthYearPicker');
const budgetListContainer = document.getElementById('budgetItemsContainer');
const dashBudgetListContainer = document.getElementById('dashBudgetList'); // on dashboard

export async function initBudgetsList() {
  if (budgetPicker) {
    const now = new Date();
    const currentVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    budgetPicker.value = currentVal;

    budgetPicker.addEventListener('change', (e) => {
      const parts = e.target.value.split('-');
      if (parts.length === 2) {
        currentYear = parseInt(parts[0]);
        currentMonth = parseInt(parts[1]);
        loadBudgets();
      }
    });
  }

  // Listen for refresh events
  window.addEventListener('budgetsUpdated', loadBudgets);
  window.addEventListener('expensesUpdated', loadBudgets); // because expenses change the spent amount
  
  // Expose delete to window so HTML inline onclick works
  window.confirmDeleteBudget = confirmDeleteBudget;
  window.openEditBudget = openEditBudget;

  // Initial load if auth is ready, else wait
  if (window.currentUser) {
    loadBudgets();
  } else {
    // Rely on app.js to call initBudgetsList or trigger an event if not already loaded when app starts
    // For now just wait for custom event if defined, or assume auth is ready
  }
}

async function loadBudgets() {
  const user = window.currentUser;
  if (!user) return;

  // 1. Ensure currency rates are warmed up
  try {
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
    ? `<div class="empty-state">
         <i class="fa-solid fa-chart-pie"></i>
         <span class="empty-state-title">No budgets found for this month</span>
         <span class="empty-state-sub">Create a budget to stay on top of your spending and reach your financial goals faster.</span>
         <button class="btn btn-primary" onclick="window.openBudgetModal()">
           <i class="fa-solid fa-plus"></i> Add Budget
         </button>
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

  const rawLimit = parseFloat(limit_amount || budget.amount || budget.limitAmount || 0);
  const limit    = convertSync(rawLimit, currency || 'PHP', baseCurrency);
  
  const currentSpent = parseFloat(spent || budget.current_spent || 0); // Note: spent was updated to userCurrency logic above
  
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
          <button class="budget-action-btn edit" onclick="window.openEditBudget('${id}')" title="Edit limit">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="budget-action-btn delete" onclick="window.confirmDeleteBudget('${id}')" title="Delete budget">
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
  // Use loose equality in case one is string and other is integer
  const budget = currentBudgets.find(b => String(b.id) === String(id));
  if (budget) {
    if (window.openBudgetModal) window.openBudgetModal(budget);
    else console.error('[budgets-list] window.openBudgetModal not found');
  } else {
    console.warn('[budgets-list] Budget not found for ID:', id);
  }
}

window.confirmDeleteBudget = async function(id) {
  const confirmed = await window.showConfirm(
    "Are you sure you want to delete this budget constraint? Your expenses will remain unaffected.",
    "Delete Budget?"
  );

  if (confirmed) {
    executeDeleteBudget(id);
  }
};

async function executeDeleteBudget(id) {
  try {
    const user = window.currentUser;
    if (!user) return;
    
    await removeBudget(id, user.uid);
    showToast('Budget deleted successfully', 'success');
    
    // The dbDelete logic now marks it as 'deleted', and dbGetAll filters it out
    // Dispatching budgetsUpdated will trigger re-render
    window.dispatchEvent(new Event('budgetsUpdated'));
  } catch (err) {
    console.error("[budgets-list] Delete Error:", err);
    showToast('Failed to delete budget locally', 'error');
  }
}

// Self-initialize
initBudgetsList();
