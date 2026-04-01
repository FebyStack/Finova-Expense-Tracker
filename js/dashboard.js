import { fetchExpenses, fetchIncome, fetchBudgets, fetchSavingsGoals, fetchAIInsights } from './api.js';
import { convertItems, formatCurrency, warmRateCache, convertSync } from './currency.js';
import { getCategoryStyle } from './categories.js';

// ── TEMPORARY ERROR LOGGING (remove after debugging) ──────
console.log('[dashboard] ✅ Module imports resolved successfully');
window.addEventListener('error', (e) => {
  console.error('[dashboard] 🔴 RUNTIME ERROR:', e.message, '\n  File:', e.filename, '\n  Line:', e.lineno, ':', e.colno, '\n  Stack:', e.error?.stack);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[dashboard] 🔴 UNHANDLED PROMISE REJECTION:', e.reason);
});

    function formatDate(dateStr) {
      return new Date(dateStr).toLocaleDateString('en-PH', {
        month: 'short', day: 'numeric',
      });
    }

    // ── Greeting ───────────────────────────────────────────────
    function setGreeting(displayName) {
      const hour = new Date().getHours();
      console.log('Current hour:', hour);

      const greeting = hour >= 5 && hour < 12 ? 'Good morning'
                    : hour >= 12 && hour < 18 ? 'Good afternoon'
                    : 'Good evening';

      const firstName  = displayName?.split(' ')[0] || '';
      const greetingEl = document.getElementById('dashGreeting');
      if (greetingEl) {
        greetingEl.textContent = `${greeting}${firstName ? ', ' + firstName : ''}! 👋`;
      }
    }

    function setMonthLabel() {
      const label = new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
      const el    = document.getElementById('dashMonth');
      if (el) el.textContent = label;
    }

    // ══════════════════════════════════════════════════════════
    // MAIN LOAD
    // ══════════════════════════════════════════════════════════
    export async function loadDashboard(user, userData) {
      console.log('🚀 loadDashboard called');
      setGreeting(userData?.displayName || user.displayName);
      setMonthLabel();

      const uid      = user.uid;
      const currency = userData?.baseCurrency || 'PHP';
      const now      = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      try {
        // ── Pre-warm exchange rate cache ───────────────────────
        await warmRateCache(currency);

        // ── Expenses this month (converted to base currency) ──
        const expenses = await fetchExpenses(uid, { month: thisMonth });
        const expResult = await convertItems(expenses, currency);
        const totalExpenses = expResult.total;

        // ── Income this month (converted to base currency) ────
        let totalIncome = 0;
        let incomeData = [];
        try {
          incomeData  = await fetchIncome(uid, { month: thisMonth });
          const incResult = await convertItems(incomeData, currency);
          totalIncome = incResult.total;
        } catch (_) { /* no income yet */ }

        // ── Balance & savings rate ────────────────────────────
        const balance     = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? Math.round((balance / totalIncome) * 100) : 0;

        // ── Summary cards ─────────────────────────────────────
        document.getElementById('cardIncome').textContent      = formatCurrency(totalIncome, currency);
        document.getElementById('cardExpenses').textContent    = formatCurrency(totalExpenses, currency);
        document.getElementById('cardBalance').textContent     = formatCurrency(balance, currency);
        document.getElementById('cardSavingsRate').textContent = `${savingsRate}%`;

        const balanceEl = document.getElementById('cardBalance');
        if (balanceEl) balanceEl.style.color = balance >= 0 ? 'var(--success)' : 'var(--danger)';

        // Delta badges
        if (totalIncome > 0) {
          document.getElementById('cardIncomeDelta').innerHTML   = `<i class="fa-solid fa-circle-check"></i> This month`;
          document.getElementById('cardIncomeDelta').className   = 'summary-card-delta up';
        }
        if (totalExpenses > 0) {
          document.getElementById('cardExpensesDelta').innerHTML = `<i class="fa-solid fa-circle-info"></i> This month`;
          document.getElementById('cardExpensesDelta').className = 'summary-card-delta neutral';
        }
        if (totalIncome > 0 || totalExpenses > 0) {
          const balDelta    = document.getElementById('cardBalanceDelta');
          balDelta.className = `summary-card-delta ${balance >= 0 ? 'up' : 'down'}`;
          balDelta.innerHTML = balance >= 0
            ? `<i class="fa-solid fa-arrow-up"></i> Positive balance`
            : `<i class="fa-solid fa-arrow-down"></i> Overspending`;
        }
        if (savingsRate > 0) {
          document.getElementById('cardSavingsDelta').innerHTML = `<i class="fa-solid fa-arrow-up"></i> ${savingsRate}% of income saved`;
          document.getElementById('cardSavingsDelta').className = `summary-card-delta ${savingsRate >= 20 ? 'up' : 'neutral'}`;
        }

        // ── Sections ──────────────────────────────────────────
        renderRecentTransactions(expResult.items, currency);
        await loadBudgetOverview(uid, currency, now, expResult.items);
        await loadSavingsOverview(uid, currency);
        loadAIInsights(uid, currency);

      } catch (err) {
        console.error('Dashboard load error:', err);
      }
    }

    // ── Recent transactions ────────────────────────────────────
    function renderRecentTransactions(expenses, currency) {
      const container = document.getElementById('recentTransactions');
      if (!container) return;

      if (!expenses.length) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-receipt"></i>
            <span class="empty-state-title">No transactions yet</span>
            <span class="empty-state-sub">Add your first expense to get started</span>
          </div>`;
        return;
      }

      const recent = [...expenses]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

      let html = '<div class="transaction-list">';
      recent.forEach(d => {
        const style = getCategoryStyle(d.category);
        let receiptHtml = '';
        if (d.receipt_data) {
          try {
            const rData = typeof d.receipt_data === 'string' ? JSON.parse(d.receipt_data) : d.receipt_data;
            if (rData && rData.items && rData.items.length) {
              const itemsList = rData.items.map(i => `<li>${i}</li>`).join('');
              receiptHtml = `
                <div class="receipt-dropdown-wrapper">
                  <span class="receipt-badge"><i class="fa-solid fa-receipt"></i> items</span>
                  <div class="receipt-dropdown">
                    <div class="rd-merchant">${rData.merchant || 'Unknown Merchant'}</div>
                    <ul class="rd-items">${itemsList}</ul>
                  </div>
                </div>
              `;
            }
          } catch(e) {}
        }

        html += `
          <div class="transaction-item">
            <div class="transaction-icon" style="background:${style.bg}; color:${style.color};">
              <i class="${style.icon}"></i>
            </div>
            <div class="transaction-info">
              <div class="transaction-name">${d.note || d.category || 'Expense'}</div>
              <div class="transaction-meta" style="display:flex; align-items:center; gap:8px;">
                ${d.category} · ${formatDate(d.date)}
                ${receiptHtml}
              </div>
            </div>
            <div class="transaction-amount expense">
              -${formatCurrency(d.convertedAmount || d.amount, currency)}
            </div>
          </div>`;
      });
      html += '</div>';
      container.innerHTML = html;
    }

    // ── Budget overview ────────────────────────────────────────
    async function loadBudgetOverview(uid, currency, now, convertedExpenses = []) {
      const container = document.getElementById('dashBudgetList');
      if (!container) return;

      try {
        const month = now.getMonth() + 1;
        const year  = now.getFullYear();
        const budgets = await fetchBudgets(uid, { month, year });

        // Calculate actual spent locally for instant UI update
        const spentByCategory = {};
        convertedExpenses.forEach(exp => {
          const cat = exp.category || 'Uncategorized';
          if (!spentByCategory[cat]) spentByCategory[cat] = 0;
          spentByCategory[cat] += parseFloat(exp.convertedAmount || 0);
        });

        if (!budgets.length) {
          container.innerHTML = `
            <div class="empty-state">
              <i class="fa-solid fa-chart-pie"></i>
              <span class="empty-state-title">No budgets set</span>
              <span class="empty-state-sub">Set spending limits to stay on track</span>
            </div>`;
          return;
        }

        container.innerHTML = budgets.map(b => {
          let spent = spentByCategory[b.category];
          if (spent === undefined) {
             const rawSpent = parseFloat(b.spent) || 0;
             spent = convertSync(rawSpent, b.currency || 'PHP', currency);
          }
          
          const rawLim = parseFloat(b.limit_amount) || 1;
          const lim    = convertSync(rawLim, b.currency || 'PHP', currency);
          const pct   = Math.min(Math.round((spent / lim) * 100), 100);
          const level = pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'safe';
          return `
            <div class="budget-item">
              <div class="budget-item-header">
                <span class="budget-item-label">${b.category}</span>
                <span class="budget-item-amounts">
                  ${formatCurrency(spent, currency)} / ${formatCurrency(lim, currency)}
                </span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill ${level}" style="width:${pct}%"></div>
              </div>
            </div>`;
        }).join('');

      } catch (err) {
        console.error('Budget overview error:', err);
      }
    }

    // ── Savings goals overview ─────────────────────────────────
    async function loadSavingsOverview(uid, currency) {
      const container = document.getElementById('dashSavingsList');
      if (!container) return;

      try {
        const goals = await fetchSavingsGoals(uid);

        if (!goals.length) {
          container.innerHTML = `
            <div class="empty-state">
              <i class="fa-solid fa-piggy-bank"></i>
              <span class="empty-state-title">No savings goals</span>
              <span class="empty-state-sub">Create a goal to start saving</span>
            </div>`;
          return;
        }

        container.innerHTML = goals.map(s => {
          const rawCurr = parseFloat(s.current_amount) || 0;
          const rawTgt  = parseFloat(s.target_amount)  || 1;
          const curr = convertSync(rawCurr, s.currency || 'PHP', currency);
          const tgt  = convertSync(rawTgt,  s.currency || 'PHP', currency);
          const pct  = Math.min(Math.round((curr / tgt) * 100), 100);
          return `
            <div class="budget-item">
              <div class="budget-item-header">
                <span class="budget-item-label">${s.name}</span>
                <span class="budget-item-amounts">
                  ${formatCurrency(curr, currency)} / ${formatCurrency(tgt, currency)}
                </span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill safe" style="width:${pct}%"></div>
              </div>
            </div>`;
        }).join('');

      } catch (err) {
        console.error('Savings overview error:', err);
      }
    }

    // ── AI Insights (Day 26) ───────────────────────────────────
    async function loadAIInsights(uid, currency, force = false) {
      const container = document.getElementById('aiInsightsContent');
      const btnRefresh = document.getElementById('btnRefreshInsights');
      if (!container || !btnRefresh) return;

      if (force) {
        container.innerHTML = `
          <div class="loading-state" style="padding:var(--space-4); margin:0;">
            <i class="fa-solid fa-spinner fa-spin" style="margin-bottom:8px;"></i>
            <p style="font-size:12px; margin:0;">Asking Gemini for new insights...</p>
          </div>
        `;
        btnRefresh.classList.add('fa-spin');
      }

      try {
        // Fetch insights (defaults to current month in PHP if not passed)
        const response = await fetchAIInsights(uid, null, force);
        if (!response || !response.summary) throw new Error('Invalid AI response');

        const { summary, insights, topCategory, recommendations, warning, _cached } = response;

        let html = `
          <div style="padding:var(--space-4); display:flex; flex-direction:column; gap:var(--space-4);">
            <div style="font-size:13px; color:var(--text-primary); line-height:1.5;">
              <strong>Summary:</strong> ${summary}
            </div>
            
            ${warning && warning !== 'null' ? `
              <div class="alert danger" style="padding:var(--space-2) var(--space-3); font-size:11px; margin:0;">
                <i class="fa-solid fa-triangle-exclamation"></i> <strong>Warning:</strong> ${warning}
              </div>
            ` : ''}

            <div style="font-size:12px; color:var(--text-secondary);">
              <div style="font-weight:var(--weight-bold); color:var(--text-primary); margin-bottom:4px;">Key Insights:</div>
              <ul style="margin:0; padding-left:16px;">
                ${insights.map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>

            ${topCategory && topCategory.name ? `
              <div style="font-size:12px; background:var(--bg-secondary); padding:var(--space-3); border-radius:var(--radius-md); border:1px solid var(--border);">
                <span style="font-weight:var(--weight-bold); color:var(--accent);">Top Category: ${topCategory.name}</span>
                <p style="margin:4px 0 0 0; color:var(--text-muted);">${topCategory.reason}</p>
              </div>
            ` : ''}

            <div style="font-size:12px; color:var(--text-secondary);">
              <div style="font-weight:var(--weight-bold); color:var(--success); margin-bottom:4px;"><i class="fa-solid fa-lightbulb"></i> Saving Recommendations:</div>
              <ul style="margin:0; padding-left:16px;">
                ${recommendations.map(r => `<li>${r}</li>`).join('')}
              </ul>
            </div>
            
            ${_cached ? `<div style="font-size:9px; color:var(--text-muted); text-align:right;">⚡ Loaded from cache</div>` : ''}
          </div>
        `;
        
        container.innerHTML = html;

      } catch (err) {
        if (!err.message.includes('Not enough')) {
          console.warn('AI Insights error:', err);
        }
        container.innerHTML = `
          <div class="empty-state" style="padding:var(--space-4); margin:0; border:none;">
            <i class="fa-solid fa-robot" style="color:var(--text-muted); font-size:24px; margin-bottom:8px;"></i>
            <span class="empty-state-title" style="font-size:13px;">Waiting for data</span>
            <span class="empty-state-sub" style="font-size:11px;">${err.message.includes('Not enough') ? 'Add some expenses to get insights.' : 'AI service temporarily unavailable.'}</span>
          </div>
        `;
      } finally {
        btnRefresh.classList.remove('fa-spin');
      }
    }

    // Expose refresh function to window for the button onclick
    window.refreshAIInsights = function() {
      const user = window.currentUser;
      if (user) loadAIInsights(user.uid, window.userCurrency || 'PHP', true);
    };

    // ── Auto-reload on navigation ──────────────────────────────
    window.addEventListener('dashboardUpdated', () => {
      const user = window.currentUser;
      const userData = window.userData; // usually provided via some global
      if (user) loadDashboard(user, userData);
    });