// js/api.js
// Frontend API service — now pointing to PHP/XAMPP backend
// Drop-in replacement for the old Node.js API calls

const API_BASE = 'api';  // Relative path

// ── Generic fetch wrapper ──────────────────────────────────
export async function apiFetch(endpoint, options = {}) {
  const fetchOptions = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    cache: 'no-store',
    ...options,
  };
  const res = await fetch(`${API_BASE}${endpoint}`, fetchOptions);

  const data = await res.json();
  if (!data.success) throw new Error(data.error || `HTTP ${res.status}`);
  return data.data ?? data;
}

// ── Expenses ───────────────────────────────────────────────
export async function fetchExpenses(uid, { month, category } = {}) {
  const params = new URLSearchParams();
  // uid is ignored, backend relies on session
  if (month)    params.set('month',    month);
  if (category) params.set('category', category);
  const qs = params.toString();
  const data = await apiFetch(`/expenses.php${qs ? '?' + qs : ''}`);
  return data.expenses ?? [];
}

export async function addExpense(uid, expenseData) {
  return apiFetch('/expenses.php', {
    method: 'POST',
    body:   JSON.stringify(expenseData),
  });
}

export async function editExpense(id, uid, expenseData) {
  return apiFetch(`/expenses.php?id=${id}`, {
    method: 'PUT',
    body:   JSON.stringify(expenseData),
  });
}

export async function removeExpense(id, uid) {
  return apiFetch(`/expenses.php?id=${id}`, { method: 'DELETE' });
}

export async function fetchRecurringExpenses(uid) {
  const data = await apiFetch(`/expenses.php?recurring=true`);
  return data.expenses ?? [];
}

// ── Income ─────────────────────────────────────────────────
export async function fetchIncome(uid, { month } = {}) {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  const qs = params.toString();
  const data = await apiFetch(`/income.php${qs ? '?' + qs : ''}`);
  return data.income ?? [];
}

export async function addIncome(uid, incomeData) {
  return apiFetch('/income.php', {
    method: 'POST',
    body:   JSON.stringify(incomeData),
  });
}

export async function editIncome(id, uid, incomeData) {
  return apiFetch(`/income.php?id=${id}`, {
    method: 'PUT',
    body:   JSON.stringify(incomeData),
  });
}

export async function removeIncome(id, uid) {
  return apiFetch(`/income.php?id=${id}`, { method: 'DELETE' });
}

// ── Budgets ────────────────────────────────────────────────
export async function fetchBudgets(uid, { month, year } = {}) {
  const now    = new Date();
  const params = new URLSearchParams({
    month: month ?? now.getMonth() + 1,
    year:  year  ?? now.getFullYear(),
  });
  const data = await apiFetch(`/budgets.php?${params}`);
  return data.budgets ?? [];
}

export async function addBudget(uid, budgetData) {
  return apiFetch('/budgets.php', {
    method: 'POST',
    body:   JSON.stringify(budgetData),
  });
}

export async function editBudget(id, uid, budgetData) {
  return apiFetch(`/budgets.php?id=${id}`, {
    method: 'PUT',
    body:   JSON.stringify(budgetData),
  });
}

export async function removeBudget(id, uid) {
  return apiFetch(`/budgets.php?id=${id}`, { method: 'DELETE' });
}

// ── Savings goals ──────────────────────────────────────────
export async function fetchSavingsGoals(uid) {
  const data = await apiFetch(`/savings.php`);
  return data.savings ?? [];
}

export async function addSavingsGoal(uid, goalData) {
  return apiFetch('/savings.php', {
    method: 'POST',
    body:   JSON.stringify(goalData),
  });
}

export async function editSavingsGoal(id, uid, goalData) {
  return apiFetch(`/savings.php?id=${id}`, {
    method: 'PUT',
    body:   JSON.stringify(goalData),
  });
}

export async function removeSavingsGoal(id, uid) {
  return apiFetch(`/savings.php?id=${id}`, { method: 'DELETE' });
}

// ── Receipts ───────────────────────────────────────────────
export async function fetchReceipts(uid, expenseId = null) {
  const params = new URLSearchParams();
  if (expenseId) params.set('expense_id', expenseId);
  const qs = params.toString();
  const data = await apiFetch(`/receipts.php${qs ? '?' + qs : ''}`);
  return data.receipts ?? [];
}

export async function uploadReceipt(uid, file, expenseId = null) {
  const form = new FormData();
  form.append('file', file);
  if (expenseId) form.append('expenseId', expenseId);

  // Note: Don't set Content-Type header — browser sets it with boundary
  // Need to pass credentials explicitly for non-apiFetch call
  const res  = await fetch(`${API_BASE}/uploads.php`, { 
      method: 'POST', 
      body: form,
      credentials: 'include'
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Upload failed');
  return data.data;
}

export async function removeReceipt(id, uid) {
  return apiFetch(`/receipts.php?id=${id}`, { method: 'DELETE' });
}

// ── User profile ───────────────────────────────────────────
export async function syncUser(uid, profile) {
  return apiFetch('/users.php', {
    method: 'POST',
    body:   JSON.stringify(profile),
  });
}

export async function updateUser(uid, updates) {
  return apiFetch(`/users.php?id=0`, {
    method: 'PUT',
    body:   JSON.stringify(updates),
  });
}

// ── AI Insights & Chat ─────────────────────────────────────
export async function fetchAIInsights(uid, month, force = false) {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (force) params.set('force', 'true');
  const qs = params.toString();
  const data = await apiFetch(`/ai-insights.php${qs ? '?' + qs : ''}`);
  return data;
}

export async function sendAIChatMessage(uid, message) {
  const data = await apiFetch(`/ai-chat.php`, {
    method: 'POST',
    body: JSON.stringify({ message })
  });
  return data;
}
