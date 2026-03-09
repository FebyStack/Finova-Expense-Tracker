// js/dashboard.js

import { db }          from './firebase-config.js';
import { auth }        from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";


// ── Category icon + color map ──────────────────────────────
const CATEGORY_STYLES = {
  'Food':          { icon: 'fa-solid fa-utensils',       bg: '#fff3e0', color: '#f59e0b' },
  'Transport':     { icon: 'fa-solid fa-car',            bg: '#e3f2fd', color: '#2196f3' },
  'Shopping':      { icon: 'fa-solid fa-bag-shopping',   bg: '#fce4ec', color: '#e91e63' },
  'Bills':         { icon: 'fa-solid fa-file-invoice',   bg: '#f3e5f5', color: '#9c27b0' },
  'Health':        { icon: 'fa-solid fa-heart-pulse',    bg: '#e8f5e9', color: '#4caf50' },
  'Entertainment': { icon: 'fa-solid fa-tv',             bg: '#e0f7fa', color: '#00bcd4' },
  'Education':     { icon: 'fa-solid fa-graduation-cap', bg: '#e8eaf6', color: '#3f51b5' },
  'Savings':       { icon: 'fa-solid fa-piggy-bank',     bg: '#fff8e1', color: '#ffc107' },
  'Income':        { icon: 'fa-solid fa-arrow-trend-up', bg: '#e8f5e9', color: '#22c55e' },
  'Other':         { icon: 'fa-solid fa-circle-dot',     bg: '#f5f5f5', color: '#9aa0b0' },
};

function getCategoryStyle(category) {
  return CATEGORY_STYLES[category] || CATEGORY_STYLES['Other'];
}


// ── Format currency ────────────────────────────────────────
function formatCurrency(amount, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style:    'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
}


// ── Format date ────────────────────────────────────────────
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day:   'numeric'
  });
}


// ── Set greeting based on time of day ─────────────────────
function setGreeting(displayName) {
  const hour = new Date().getHours();
  console.log('Current hour:', hour); // ← temporary debug

  let greeting;
  if (hour >= 5 && hour < 12) {
    greeting = 'Good morning';
  } else if (hour >= 12 && hour < 18) {
    greeting = 'Good afternoon';
  } else {
    greeting = 'Good evening';
  }

  const firstName = displayName?.split(' ')[0] || '';
  const greetingEl = document.getElementById('dashGreeting');

  if (greetingEl) {
    greetingEl.textContent = `${greeting}${firstName ? ', ' + firstName : ''}! 👋`;
  } else {
    console.error('dashGreeting element not found');
  }
}

// ── Set current month label ────────────────────────────────
function setMonthLabel() {
  const now = new Date();
  const label = now.toLocaleDateString('en-PH', {
    month: 'long',
    year:  'numeric'
  });
  document.getElementById('dashMonth').textContent = label;
}


// ── Load dashboard data ────────────────────────────────────
export async function loadDashboard(user, userData) {
  console.log('🚀 loadDashboard called');
  setGreeting(userData?.displayName || user.displayName);
  setMonthLabel();  

  const uid      = user.uid;
  const currency = userData?.baseCurrency || 'PHP';
  const now      = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  try {
    // ── Load expenses this month ─────────────────────────
    const expensesRef = collection(db, 'users', uid, 'expenses');
    const expQ = query(
      expensesRef,
      where('month', '==', thisMonth)
    );
    const expSnap   = await getDocs(expQ);
    let totalExpenses = 0;
    expSnap.forEach(doc => {
      totalExpenses += doc.data().amount || 0;
    });

    // ── Load income this month ───────────────────────────
    const incomeRef = collection(db, 'users', uid, 'income');
    const incQ = query(
      incomeRef,
      where('month', '==', thisMonth)
    );
    const incSnap   = await getDocs(incQ);
    let totalIncome = 0;
    incSnap.forEach(doc => {
      totalIncome += doc.data().amount || 0;
    });

    // ── Calculate balance & savings rate ─────────────────
    const balance     = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0
      ? Math.round((balance / totalIncome) * 100)
      : 0;

    // ── Update summary cards ─────────────────────────────
    document.getElementById('cardIncome').textContent =
      formatCurrency(totalIncome, currency);

    document.getElementById('cardExpenses').textContent =
      formatCurrency(totalExpenses, currency);

    document.getElementById('cardBalance').textContent =
      formatCurrency(balance, currency);

    document.getElementById('cardSavingsRate').textContent =
      `${savingsRate}%`;

    // Update balance color
    const balanceEl = document.getElementById('cardBalance');
    balanceEl.style.color = balance >= 0
      ? 'var(--success)'
      : 'var(--danger)';

    // Update delta badges when there's data
    if (totalIncome > 0) {
      document.getElementById('cardIncomeDelta').innerHTML =
        `<i class="fa-solid fa-circle-check"></i> This month`;
      document.getElementById('cardIncomeDelta').className =
        'summary-card-delta up';
    }

    if (totalExpenses > 0) {
      document.getElementById('cardExpensesDelta').innerHTML =
        `<i class="fa-solid fa-circle-info"></i> This month`;
      document.getElementById('cardExpensesDelta').className =
        'summary-card-delta neutral';
    }

    if (totalIncome > 0 || totalExpenses > 0) {
      const balDelta = document.getElementById('cardBalanceDelta');
      balDelta.className = `summary-card-delta ${balance >= 0 ? 'up' : 'down'}`;
      balDelta.innerHTML = balance >= 0
        ? `<i class="fa-solid fa-arrow-up"></i> Positive balance`
        : `<i class="fa-solid fa-arrow-down"></i> Overspending`;
    }

    if (savingsRate > 0) {
      document.getElementById('cardSavingsDelta').innerHTML =
        `<i class="fa-solid fa-arrow-up"></i> ${savingsRate}% of income saved`;
      document.getElementById('cardSavingsDelta').className =
        `summary-card-delta ${savingsRate >= 20 ? 'up' : 'neutral'}`;
    }

    // ── Load recent transactions ─────────────────────────
    await loadRecentTransactions(uid, currency);

    // ── Load budget overview ─────────────────────────────
    await loadBudgetOverview(uid, currency, thisMonth, totalExpenses);

    // ── Load savings goals ───────────────────────────────
    await loadSavingsOverview(uid, currency);

  } catch (error) {
    console.error('Dashboard load error:', error);
  }
}


// ── Recent transactions ────────────────────────────────────
async function loadRecentTransactions(uid, currency) {
  const container = document.getElementById('recentTransactions');

  try {
    // Get 5 most recent expenses
    const q = query(
      collection(db, 'users', uid, 'expenses'),
      orderBy('date', 'desc'),
      limit(5)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-receipt"></i>
          <span class="empty-state-title">No transactions yet</span>
          <span class="empty-state-sub">Add your first expense to get started</span>
        </div>`;
      return;
    }

    let html = '<div class="transaction-list">';
    snap.forEach(doc => {
      const d     = doc.data();
      const style = getCategoryStyle(d.category);
      html += `
        <div class="transaction-item">
          <div class="transaction-icon" style="background:${style.bg}; color:${style.color};">
            <i class="${style.icon}"></i>
          </div>
          <div class="transaction-info">
            <div class="transaction-name">${d.note || d.category || 'Expense'}</div>
            <div class="transaction-meta">${d.category} · ${formatDate(d.date)}</div>
          </div>
          <div class="transaction-amount expense">
            -${formatCurrency(d.amount, currency)}
          </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

  } catch (error) {
    console.error('Recent transactions error:', error);
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span class="empty-state-title">Couldn't load transactions</span>
      </div>`;
  }
}


// ── Budget overview ────────────────────────────────────────
async function loadBudgetOverview(uid, currency, thisMonth, totalExpenses) {
  const container = document.getElementById('dashBudgetList');

  try {
    const now = new Date();
    const q   = query(
      collection(db, 'users', uid, 'budgets'),
      where('month', '==', String(now.getMonth() + 1)),
      where('year',  '==', String(now.getFullYear()))
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-chart-pie"></i>
          <span class="empty-state-title">No budgets set</span>
          <span class="empty-state-sub">Set spending limits to stay on track</span>
        </div>`;
      return;
    }

    let html = '';
    snap.forEach(doc => {
      const b       = doc.data();
      const spent   = b.spent || 0;
      const limit   = b.limitAmount || 1;
      const pct     = Math.min(Math.round((spent / limit) * 100), 100);
      const level   = pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'safe';

      html += `
        <div class="budget-item">
          <div class="budget-item-header">
            <span class="budget-item-label">
              <span>${b.category}</span>
            </span>
            <span class="budget-item-amounts">
              ${formatCurrency(spent, currency)} / ${formatCurrency(limit, currency)}
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${level}" style="width: ${pct}%"></div>
          </div>
        </div>`;
    });
    container.innerHTML = html;

  } catch (error) {
    console.error('Budget overview error:', error);
  }
}


// ── Savings goals overview ─────────────────────────────────
async function loadSavingsOverview(uid, currency) {
  const container = document.getElementById('dashSavingsList');

  try {
    const snap = await getDocs(
      collection(db, 'users', uid, 'savings')
    );

    if (snap.empty) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-piggy-bank"></i>
          <span class="empty-state-title">No savings goals</span>
          <span class="empty-state-sub">Create a goal to start saving</span>
        </div>`;
      return;
    }

    let html = '';
    snap.forEach(doc => {
      const s     = doc.data();
      const curr  = s.currentAmount || 0;
      const tgt   = s.targetAmount  || 1;
      const pct   = Math.min(Math.round((curr / tgt) * 100), 100);

      html += `
        <div class="budget-item">
          <div class="budget-item-header">
            <span class="budget-item-label">${s.name}</span>
            <span class="budget-item-amounts">
              ${formatCurrency(curr, currency)} / ${formatCurrency(tgt, currency)}
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill safe" style="width: ${pct}%"></div>
          </div>
        </div>`;
    });
    container.innerHTML = html;

  } catch (error) {
    console.error('Savings overview error:', error);
  }
}

