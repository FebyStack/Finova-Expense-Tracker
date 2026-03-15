import { auth } from './firebase-config.js';
import { fetchBudgets, fetchExpenses, editBudget, removeBudget } from './api.js';
import { getCategoryStyle } from './categories.js';
import { convertItems, formatCurrency, warmRateCache } from './currency.js';
import { showToast } from './expenses.js';
import { openBudgetModal } from './budgets.js';

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
  if (dashBudgetListContainer) dashBudgetListContainer.innerHTML = '<div class="list-empty" style="padding:var(--space-2); min-height:80px;">Loading...</div>';

  try {
    // 1. Ensure currency rates are warmed up
    await warmRateCache(window.userCurrency || 'PHP');

    // 2. Fetch budgets and expenses for the month
    const [{ budgets }, { expenses }] = await Promise.all([
      fetchBudgets(user.uid, { month: currentMonth, year: currentYear }),
      fetchExpenses(user.uid, { month: currentMonth, year: currentYear })
    ]);

    currentBudgets = budgets || [];

    // 3. Convert all expenses to user's base currency to accurately calculate 'spent'
    const convertedExpenses = await convertItems(expenses || [], window.userCurrency || 'PHP');

    // 4. Aggregate spent by category
    const spentByCategory = {};
    convertedExpenses.forEach(exp => {
      const cat = exp.category || 'Uncategorized';
      if (!spentByCategory[cat]) spentByCategory[cat] = 0;
      spentByCategory[cat] += parseFloat(exp.convertedAmount || 0);
    });

    // 5. Update budgets if spent amount has drifted
    const updatePromises = [];
    currentBudgets.forEach(b => {
      const actualSpent = spentByCategory[b.category] || 0;
      // Compare ignoring tiny float differences
      if (Math.abs(parseFloat(b.spent) - actualSpent) > 0.02) {
        b.spent = actualSpent; // Update local memory immediately
        updatePromises.push(editBudget(b.id, user.uid, { spent: actualSpent }));
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
    if (dashBudgetListContainer) dashBudgetListContainer.innerHTML = `<div class="list-empty text-danger" style="padding:var(--space-2)">Error loading budgets.</div>`;
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

  if (dashBudgetListContainer) {
    // Dashboard just shows top 3
    if (currentBudgets.length === 0) {
      dashBudgetListContainer.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:120px; color:var(--text-muted); font-size:var(--text-sm);">
          <i class="fa-solid fa-chart-pie" style="font-size:24px; margin-bottom:8px; opacity:0.5;"></i>
          No budgets set
        </div>`;
    } else {
      dashBudgetListContainer.innerHTML = `<div style="display:flex; flex-direction:column; gap:var(--space-3)">` +
        currentBudgets.slice(0, 3).map(b => buildBudgetCardHTML(b)).join('') +
        `</div>`;
    }
  }
}

function buildBudgetCardHTML(budget) {
  const { category, limit_amount, spent, id } = budget;
  const style = getCategoryStyle(category);
  
  const limit = parseFloat(limit_amount) || 0;
  const currentSpent = parseFloat(spent) || 0;
  
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

  const baseCurrency = window.userCurrency || 'PHP';

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

      <div class="budget-amounts">
        <div class="budget-spent">${formatCurrency(currentSpent, baseCurrency)}</div>
        <div class="budget-limit">/ ${formatCurrency(limit, baseCurrency)}</div>
      </div>

      <div class="budget-progress-container">
        <div class="budget-progress-bar ${progressClass}" style="width: ${percentage}%"></div>
      </div>

      <div class="budget-meta">
        <span class="budget-meta-status ${statusClass}">${statusText}</span>
        <span class="budget-meta-percent">${Math.round(percentage)}%</span>
      </div>
    </div>
  `;
}

// Global actions
function openEditBudget(id) {
  const budget = currentBudgets.find(b => b.id === id);
  if (budget) openBudgetModal(budget);
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
    showToast('Budget deleted successfully', 'success');
    window.dispatchEvent(new Event('budgetsUpdated'));
  } catch (err) {
    console.error("Delete Error:", err);
    showToast('Failed to delete budget', 'error');
  }
}
