// js/savings-list.js
// Fetches and renders Savings Goals on the Dashboard


import { fetchSavingsGoals, removeSavingsGoal } from './api.js';
import { formatCurrency, convertSync, warmRateCache } from './currency.js';

const container = document.getElementById('savingsListContainer');

export async function loadSavingsList() {
  const user = window.currentUser;
  if (!user || !container) return;

  try {
    container.innerHTML = '<div class="list-empty">Loading savings goals...</div>';
    
    // Convert to User's Currency context
    await warmRateCache(window.userCurrency || 'PHP');
    const goals = await fetchSavingsGoals(user.uid);

    if (goals.length === 0) {
      container.innerHTML = `
        <div class="list-empty" style="grid-column: 1 / -1;">
          <i class="fa-solid fa-piggy-bank" style="font-size:32px; color:var(--text-muted); margin-bottom:12px;"></i>
          <p>No savings goals found.</p>
          <p style="font-size:var(--text-sm); opacity:0.7; margin-top:8px;">Click 'New Goal' to start saving.</p>
        </div>`;
      return;
    }

    container.innerHTML = goals.map(g => buildSavingsCardHTML(g)).join('');

  } catch (err) {
    console.error("Error loading savings goals:", err);
    container.innerHTML = `<div class="list-empty text-danger">Failed to load goals: ${err.message}</div>`;
  }
}

function buildSavingsCardHTML(goal) {
  const { id, name, target_amount, current_amount, deadline, currency } = goal;
  const baseCurrency = window.userCurrency || 'PHP';

  const rawTarget  = parseFloat(target_amount) || 1; // avoid /0
  const rawCurrent = parseFloat(current_amount) || 0;
  
  const target  = convertSync(rawTarget, currency || 'PHP', baseCurrency);
  const current = convertSync(rawCurrent, currency || 'PHP', baseCurrency);
  
  let percentage = (current / target) * 100;
  if (percentage > 100) percentage = 100;
  
  // Calculate Days Remaining
  let deadlineStr = `<span style="color:var(--text-muted);"><i class="fa-regular fa-clock"></i> No deadline</span>`;
  if (deadline) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const dDate = new Date(deadline);
    
    const diffTime = dDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      deadlineStr = `<span style="color:var(--danger); font-weight:var(--weight-bold);"><i class="fa-solid fa-triangle-exclamation"></i> Overdue by ${Math.abs(diffDays)} days</span>`;
    } else if (diffDays === 0) {
       deadlineStr = `<span style="color:var(--warning); font-weight:var(--weight-bold);"><i class="fa-regular fa-clock"></i> Due today</span>`;
    } else {
      deadlineStr = `<span><i class="fa-regular fa-clock"></i> ${diffDays} days left</span>`;
    }
  }

  // Safe escape for ID and Name for onClick
  const safeId = String(id).replace(/'/g, "\\'");
  const safeName = String(name).replace(/'/g, "\\'");

  return `
    <div class="savings-card">
      <div class="savings-card-header">
        <h3 class="savings-card-title">${name}</h3>
        <div class="savings-card-actions">
           <button class="btn btn-ghost btn-xs" onclick="window.openSavingsModal(${safeId})" title="Edit Goal">
             <i class="fa-solid fa-pen"></i>
           </button>
           <button class="btn btn-ghost btn-xs text-danger" onclick="window.deleteSavingsGoal(${safeId})" title="Delete Goal">
             <i class="fa-solid fa-trash"></i>
           </button>
        </div>
      </div>
      
      <div class="savings-card-amounts">
        <div class="savings-amount-current">${formatCurrency(current, window.userCurrency)}</div>
        <div class="savings-amount-target">/ ${formatCurrency(target, window.userCurrency)}</div>
      </div>
      
      <div class="savings-progress-track">
        <div class="savings-progress-fill" style="width: ${percentage}%"></div>
      </div>
      
      <div class="savings-card-footer">
        <div class="savings-deadline">${deadlineStr}</div>
        <div class="savings-percentage">${Math.round(percentage)}%</div>
      </div>

      <button class="btn btn-primary btn-block btn-sm" style="margin-top:var(--space-3);" 
              onclick="window.openContribModal(${safeId}, '${safeName}')">
        <i class="fa-solid fa-plus"></i> Add Contribution
      </button>
    </div>
  `;
}

// Global Del Function
window.deleteSavingsGoal = async (id) => {
  const confirmed = await window.showConfirm(
    'Are you sure you want to delete this savings goal?',
    'Delete Goal'
  );
  if (!confirmed) return;

  const user = window.currentUser;
  if (!user) return;
  try {
    await removeSavingsGoal(id, user.uid);
    loadSavingsList(); // refresh local
  } catch (err) {
    console.error("Delete failed:", err);
    alert(err.message || 'Failed to delete');
  }
};

// Event Listeners
window.addEventListener('savingsUpdated', () => {
  loadSavingsList();
});

// Auto-load if we arrive at the page
const onHashChange = () => {
  if (window.location.hash === '#savings') {
    loadSavingsList();
  }
};
window.addEventListener('hashchange', onHashChange);
// Initial load if starting on page
if (window.location.hash === '#savings') {
  if (window.currentUser) loadSavingsList();
}
