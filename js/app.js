// js/app.js
// Main app logic — routing, auth state, sidebar, theme

import { loadDashboard }  from './dashboard.js';
import { openExpenseModal } from './expenses.js';
import { loadExpenseList, initExpenseListFilters } from './expense-list.js';
import { openIncomeModal } from './income.js';
import { loadIncomeList, initIncomeListFilters } from './income-list.js';
import { initSettings } from './settings.js';
import { initNotifications } from './notifications.js';
import { requestPushPermission } from './push-notifications.js';
// budgets.js and budgets-list.js self-initialize via their own <script> tags

// Globally store the authenticated user so other functions can access it
window.currentUser = null;

// ══════════════════════════════════════════════════════════
// LOADING SCREEN
// ══════════════════════════════════════════════════════════

const LOADING_TIPS = [
  'Syncing your latest transactions...',
  'Crunching your monthly totals...',
  'Checking your budget limits...',
  'Fetching your savings progress...',
  'Preparing your financial overview...',
  'Analyzing spending patterns...',
];

let tipIndex = 0;
const tipEl = document.getElementById('loadingTip');
const tipInterval = setInterval(() => {
  if (!tipEl) return;
  tipIndex = (tipIndex + 1) % LOADING_TIPS.length;
  tipEl.style.animation = 'none';
  tipEl.offsetHeight; // trigger reflow
  tipEl.textContent = LOADING_TIPS[tipIndex];
  tipEl.style.animation = 'tipFade 0.5s ease';
}, 2200);

function dismissLoadingScreen() {
  clearInterval(tipInterval);
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 600);
  }
}

// ══════════════════════════════════════════════════════════
// PAGE MAP
// ══════════════════════════════════════════════════════════

const PAGES = {
  dashboard: { title: 'Dashboard'     },
  expenses:  { title: 'Expenses'      },
  income:    { title: 'Income'        },
  calendar:  { title: 'Calendar'      },
  budgets:   { title: 'Budgets'       },
  savings:   { title: 'Savings Goals' },
  recurring: { title: 'Recurring'     },
  analytics: { title: 'Analytics'     },
  export:    { title: 'Export'        },
  settings:  { title: 'Settings'      },
};

// ══════════════════════════════════════════════════════════
// ROUTING
// ══════════════════════════════════════════════════════════

function getCurrentPage() {
  const hash = window.location.hash.replace('#', '');
  if (hash && PAGES[hash]) return hash;
  
  if (window.location.pathname.includes('calendar.html')) {
    return 'calendar';
  }
  
  return 'dashboard';
}

window.navigateTo = function navigateTo(pageKey) {
  window.location.hash = pageKey;

  document.querySelectorAll('.page-view').forEach(el =>
    el.classList.remove('active')
  );

  const target = document.getElementById(`page-${pageKey}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.sidebar-item[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === pageKey)
  );

  document.querySelectorAll('.bottom-nav-item[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === pageKey)
  );

  const titleEl = document.getElementById('navbarPageTitle');
  if (titleEl) titleEl.textContent = PAGES[pageKey]?.title || 'Dashboard';

  document.getElementById('pageContent')?.scrollTo(0, 0);

  if (window.innerWidth <= 768) closeMobileSidebar();

  if (pageKey === 'dashboard') {
    window.dispatchEvent(new Event('dashboardUpdated'));
  }

  if (pageKey === 'expenses') {
    initExpenseListFilters();
    loadExpenseList(window.userCurrency || 'PHP');
  }
  if (pageKey === 'income') {
    initIncomeListFilters();
    loadIncomeList(window.userCurrency || 'PHP');
  }
  if (pageKey === 'settings') {
    initSettings();
  }
  if (pageKey === 'budgets') {
    window.dispatchEvent(new Event('budgetsUpdated'));
  }
  if (pageKey === 'recurring') {
    window.dispatchEvent(new Event('recurringUpdated'));
  }
  if (pageKey === 'calendar') {
    window.dispatchEvent(new Event('calendarUpdated'));
  }
  if (pageKey === 'analytics') {
    window.dispatchEvent(new Event('analyticsUpdated'));
  }
  if (pageKey === 'export') {
    window.dispatchEvent(new Event('exportUpdated'));
  }
};

window.addEventListener('hashchange', () => navigateTo(getCurrentPage()));

document.querySelectorAll('.sidebar-item[data-page]').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

document.querySelectorAll('.bottom-nav-item[data-page]').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

// ══════════════════════════════════════════════════════════
// SIDEBAR
// ══════════════════════════════════════════════════════════

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

function isMobile() { return window.innerWidth <= 768; }

function openMobileSidebar() {
  sidebar.classList.add('mobile-open');
  if (overlay) {
    overlay.style.display = 'block';
    requestAnimationFrame(() => overlay.style.opacity = '1');
  }
}

function closeMobileSidebar() {
  sidebar.classList.remove('mobile-open');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 260);
  }
}

document.getElementById('navbarToggle')?.addEventListener('click', () => {
  if (isMobile()) {
    sidebar.classList.contains('mobile-open')
      ? closeMobileSidebar()
      : openMobileSidebar();
  }
});

overlay?.addEventListener('click', closeMobileSidebar);

window.addEventListener('resize', () => {
  if (!isMobile()) {
    sidebar.classList.remove('mobile-open');
    if (overlay) {
      overlay.style.display  = 'none';
      overlay.style.opacity  = '0';
    }
  }
});

// ══════════════════════════════════════════════════════════
// DARK MODE
// ══════════════════════════════════════════════════════════

function syncThemeIcons(isDark) {
  const cls = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  const navIcon     = document.getElementById('themeIcon');
  const sidebarIcon = document.getElementById('sidebarThemeIcon');
  if (navIcon)     navIcon.className     = cls;
  if (sidebarIcon) sidebarIcon.className = cls;
}

function applyTheme(isDark, animate = false) {
  if (animate) {
    document.body.style.transition = 'background-color 0.3s ease, color 0.15s ease';
    setTimeout(() => { document.body.style.transition = ''; }, 400);
  }
  document.body.classList.toggle('dark', isDark);
  syncThemeIcons(isDark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark ? '#0d1117' : '#ffffff');
}

async function toggleTheme() {
  const isDark = !document.body.classList.contains('dark');
  applyTheme(isDark, true);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');

  const user = window.currentUser;
  if (user) {
    try {
      await fetch('api/users.php?id=0', {
        method: 'PUT',
        credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ theme: isDark ? 'dark' : 'light' })
      });
    } catch (err) {
      console.warn('Theme save failed:', err);
    }
  }
}

(function () {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') applyTheme(true);
})();

document.getElementById('btnTheme')?.addEventListener('click', toggleTheme);
document.getElementById('sidebarThemeBtn')?.addEventListener('click', toggleTheme);

// ══════════════════════════════════════════════════════════
// AUTH STATE
// ══════════════════════════════════════════════════════════

async function initApp() {
    try {
        const resp = await fetch('api/me.php', { credentials: 'include' });
        const resData = await resp.json();
        
        if (!resData.success) {
            window.location.replace('login.html');
            return;
        }

        const userData = resData.data;
        window.currentUser = userData; // Store user globally
        // Provide mapping for old firebase references
        const user = { 
            uid: userData.id.toString(), 
            email: userData.email, 
            displayName: userData.display_name 
        };

        window.userCurrency = userData?.base_currency || 'PHP';

        const displayName = userData?.display_name || user.email || 'User';
        const email       = user.email || '';
        const initials    = displayName
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);

        const sidebarAvatar = document.getElementById('sidebarAvatar');
        const sidebarName   = document.getElementById('sidebarUserName');
        const sidebarEmail  = document.getElementById('sidebarUserEmail');
        const navbarAvatar  = document.getElementById('navbarAvatar');

        if (sidebarAvatar) sidebarAvatar.textContent = initials;
        if (sidebarName)   sidebarName.textContent   = displayName;
        if (sidebarEmail)  sidebarEmail.textContent  = email;
        if (navbarAvatar)  navbarAvatar.textContent  = initials;

        const savedTheme = userData?.theme || localStorage.getItem('theme');
        const isDark     = savedTheme === 'dark';
        applyTheme(isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');

        await loadDashboard(user, userData);
        initNotifications();
        
        // Push notification logic might error due to VAPID check, but we pass user
        setTimeout(() => requestPushPermission(user.uid), 2000);

        navigateTo(getCurrentPage());
        dismissLoadingScreen();

    } catch (err) {
        console.error('Error loading user profile:', err);
        window.location.replace('login.html');
    }
}

initApp();

// ══════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════

async function handleLogout() {
  try {
    await fetch('api/logout.php', { credentials: 'include' });
    window.location.replace('login.html');
  } catch (err) {
    console.error('Logout error:', err);
  }
}

document.getElementById('btnLogout')?.addEventListener('click', (e) => {
  e.preventDefault();
  handleLogout();
});
document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => handleLogout());

// ══════════════════════════════════════════════════════════
// EXPENSE MODAL TRIGGERS
// ══════════════════════════════════════════════════════════

document.getElementById('btnQuickAdd')?.addEventListener('click', () => openExpenseModal());
document.getElementById('btnDashAddExpense')?.addEventListener('click', () => openExpenseModal());
document.getElementById('btnAddExpense')?.addEventListener('click', () => openExpenseModal());
document.getElementById('bottomNavAdd')?.addEventListener('click', e => { e.preventDefault(); openExpenseModal(); });

// ══════════════════════════════════════════════════════════
// INCOME MODAL TRIGGERS
// ══════════════════════════════════════════════════════════

document.getElementById('btnAddIncome')?.addEventListener('click', () => openIncomeModal());

// ══════════════════════════════════════════════════════════
// DASHBOARD REFRESH
// ══════════════════════════════════════════════════════════

window.refreshDashboard = async () => {
  if (!window.currentUser) return;
  try {
    const resp = await fetch('api/me.php', { credentials: 'include' });
    const resData = await resp.json();
    if (!resData.success) return;
    
    const userData = resData.data;
    const user = { uid: userData.id, email: userData.email, displayName: userData.display_name };

    await loadDashboard(user, userData);
    
    window.dispatchEvent(new Event('expensesUpdated'));

    const page = window.location.hash.replace('#', '');
    if (page === 'expenses') loadExpenseList(userData?.base_currency || 'PHP');
    if (page === 'income') loadIncomeList(userData?.base_currency || 'PHP');
    if (page === 'budgets') window.dispatchEvent(new Event('budgetsUpdated'));
  } catch (err) {
    console.error('Refresh error:', err);
  }
};