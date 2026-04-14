import { dbSave, dbDelete, dbGetAll } from './db.js';
import { supabase } from './supabase-config.js';

// ── Authentication & Session ─────────────────────────────────
/**
 * Helper to get active Supabase session headers for PHP backend calls
 */
export async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': session ? `Bearer ${session.access_token}` : ''
  };
}

/**
 * Standard fetch helper for the Node backend
 */
export async function apiFetch(endpoint, options = {}) {
  const authHeaders = await getAuthHeaders();
  const baseUrl = window.API_BASE_URL || '';
  const path = endpoint.startsWith('api/') ? endpoint : `api/${endpoint.replace(/^\//,'')}`;
  const url = `${baseUrl}/${path}`;
  
  const config = {
      ...options,
      headers: {
          ...authHeaders,
          ...(options.headers || {})
      }
  };
  
  const resp = await fetch(url, config);
  if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`API Fetch Error [${resp.status}]:`, errorText);
      throw new Error(errorText || 'API request failed');
  }
  return await resp.json();
}

// ── Expenses ───────────────────────────────────────────────
export async function fetchExpenses(uid, filters = {}) {
  try {
    return await dbGetAll('expenses', filters);
  } catch (err) {
    console.error('API Proxy: fetchExpenses failed', err.message);
    return [];
  }
}

export async function addExpense(uid, expenseData) {
  try {
    return await dbSave('expenses', { ...expenseData, user_id: uid });
  } catch (err) {
    console.error('API Proxy: addExpense failed', err.message);
    throw err;
  }
}

export async function editExpense(id, uid, expenseData) {
  try {
    return await dbSave('expenses', { ...expenseData, id, user_id: uid });
  } catch (err) {
    console.error('API Proxy: editExpense failed', err.message);
    throw err;
  }
}

export async function removeExpense(id, uid) {
  try {
    return await dbDelete('expenses', id);
  } catch (err) {
    console.error('API Proxy: removeExpense failed', err.message);
    throw err;
  }
}

// ── Income ─────────────────────────────────────────────────
export async function fetchIncome(uid, filters = {}) {
  try {
    return await dbGetAll('income', filters);
  } catch (err) {
    console.error('API Proxy: fetchIncome failed', err.message);
    return [];
  }
}

export async function addIncome(uid, incomeData) {
  try {
    return await dbSave('income', { ...incomeData, user_id: uid });
  } catch (err) {
    console.error('API Proxy: addIncome failed', err.message);
    throw err;
  }
}

export async function editIncome(id, uid, incomeData) {
  try {
    return await dbSave('income', { ...incomeData, id, user_id: uid });
  } catch (err) {
    console.error('API Proxy: editIncome failed', err.message);
    throw err;
  }
}

export async function removeIncome(id, uid) {
  try {
    return await dbDelete('income', id);
  } catch (err) {
    console.error('API Proxy: removeIncome failed', err.message);
    throw err;
  }
}

// ── Budgets ────────────────────────────────────────────────
export async function fetchBudgets(uid, filters = {}) {
  try {
    return await dbGetAll('budgets', filters);
  } catch (err) {
    console.error('API Proxy: fetchBudgets failed', err.message);
    return [];
  }
}

export async function addBudget(uid, budgetData) {
  try {
    return await dbSave('budgets', { ...budgetData, user_id: uid });
  } catch (err) {
    console.error('API Proxy: addBudget failed', err.message);
    throw err;
  }
}

export async function editBudget(id, uid, budgetData) {
  try {
    return await dbSave('budgets', { ...budgetData, id, user_id: uid });
  } catch (err) {
    console.error('API Proxy: editBudget failed', err.message);
    throw err;
  }
}

export async function removeBudget(id, uid) {
  try {
    return await dbDelete('budgets', id);
  } catch (err) {
    console.error('API Proxy: removeBudget failed', err.message);
    throw err;
  }
}

// ── Savings goals ──────────────────────────────────────────
export async function fetchSavingsGoals(uid) {
  try {
    return await dbGetAll('savings');
  } catch (err) {
    console.error('API Proxy: fetchSavingsGoals failed', err.message);
    return [];
  }
}

export async function addSavingsGoal(uid, goalData) {
  try {
    return await dbSave('savings', { ...goalData, user_id: uid });
  } catch (err) {
    console.error('API Proxy: addSavingsGoal failed', err.message);
    throw err;
  }
}

export async function editSavingsGoal(id, uid, goalData) {
  try {
    return await dbSave('savings', { ...goalData, id, user_id: uid });
  } catch (err) {
    console.error('API Proxy: editSavingsGoal failed', err.message);
    throw err;
  }
}

export async function removeSavingsGoal(id, uid) {
  try {
    return await dbDelete('savings', id);
  } catch (err) {
    console.error('API Proxy: removeSavingsGoal failed', err.message);
    throw err;
  }
}

// ── Categories ─────────────────────────────────────────────
export async function fetchCategories(uid) {
  try {
    const cats = await dbGetAll('categories');
    if (cats.length > 0) return cats;
    
    // If empty locally, fallback to PHP endpoint
    const headers = await getAuthHeaders();
    const resp = await fetch('api/categories', { headers });
    const resData = await resp.json();
    return resData.success ? resData.data : [];
  } catch (err) {
    console.warn('API Proxy: fetchCategories failed', err.message);
    return [];
  }
}

// ── User profile ───────────────────────────────────────────
export async function updateUser(uid, updates) {
  try {
    const headers = await getAuthHeaders();
    const resp = await fetch(`api/users?id=${uid}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    const resData = await resp.json();
    if (!resData.success) throw new Error(resData.error);
    return resData.data;
  } catch (err) {
    console.error('API Proxy: updateUser failed', err.message);
    throw err;
  }
}

// ── AI Services & Insights ─────────────────────────────────
export async function fetchAIInsights(uid, month, force = false) {
  // Skip network call entirely when offline
  if (!navigator.onLine) {
    console.log('API Proxy: AI Insights skipped (offline)');
    return {
      summary: 'AI Insights are unavailable while offline. Connect to the internet to see your spending analysis.',
      insights: [], recommendations: [], warning: null
    };
  }

  try {
    let url = `api/ai-insights?`;
    if (month) url += `month=${month}&`;
    if (force) url += `force=true`;
    
    const headers = await getAuthHeaders();
    const resp = await fetch(url, { headers });
    const resData = await resp.json();
    if (resData.success) return resData.data;
    throw new Error(resData.error || 'Unknown AI error');
  } catch (err) {
    console.warn('API Proxy: AI Insights deferred (error)', err.message);
    return { 
      summary: 'AI Insights are currently unavailable. Please check your connection and try again.',
      insights: [], recommendations: [], warning: null
    };
  }
}

export async function sendAIChatMessage(uid, message) {
  try {
    if (!navigator.onLine) {
        throw new Error('Chat is unavailable while offline.');
    }
    const headers = await getAuthHeaders();
    const resp = await fetch('api/ai-chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message })
    });
    const resData = await resp.json();
    if (!resData.success) throw new Error(resData.error);
    return resData.data;
  } catch (err) {
    console.error('API Proxy: Chat failed', err.message);
    throw err;
  }
}

// ── Recurring Expenses ─────────────────────────────────────
export async function fetchRecurringExpenses(uid) {
  try {
    return await dbGetAll('expenses', { recurring: true });
  } catch (err) {
    console.error('API Proxy: fetchRecurringExpenses failed', err.message);
    return [];
  }
}
