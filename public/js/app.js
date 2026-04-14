// js/app.js
// Main app logic — routing, auth state, sidebar, theme
import { loadDashboard }  from './dashboard.js';
import { openExpenseModal } from './expenses.js';
import { loadExpenseList, initExpenseListFilters } from './expense-list.js';
import { openIncomeModal } from './income.js';
import { loadIncomeList, initIncomeListFilters } from './income-list.js';
import { initSettings } from './settings.js';
import { loadSavingsList } from './savings-list.js';
import { initNotifications } from './notifications.js';
import { checkAuth } from './auth.js';
import { updateUser } from './api.js';
import { supabase } from './supabase-config.js';
import { checkStorage, archiveOldRecords } from './db.js';
import { showToast } from './toast.js';

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
// ROUTING
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

function getCurrentPage() {
  const hash = window.location.hash.replace('#', '');
  if (hash && PAGES[hash]) return hash;
  if (window.location.pathname.includes('calendar.html')) return 'calendar';
  return 'dashboard';
}

window.navigateTo = function navigateTo(pageKey) {
  window.location.hash = pageKey;
  document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
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

  // Trigger events for page-specific initialization
  if (pageKey === 'dashboard') window.dispatchEvent(new Event('dashboardUpdated'));
  if (pageKey === 'expenses') { initExpenseListFilters(); loadExpenseList(window.userCurrency || 'PHP'); }
  if (pageKey === 'income') { initIncomeListFilters(); loadIncomeList(window.userCurrency || 'PHP'); }
  if (pageKey === 'settings') initSettings();
  if (pageKey === 'budgets') window.dispatchEvent(new Event('budgetsUpdated'));
  if (pageKey === 'savings') { loadSavingsList(); }
  if (pageKey === 'recurring') window.dispatchEvent(new Event('recurringUpdated'));
  if (pageKey === 'calendar') window.dispatchEvent(new Event('calendarUpdated'));
  if (pageKey === 'analytics') window.dispatchEvent(new Event('analyticsUpdated'));
  if (pageKey === 'export') window.dispatchEvent(new Event('exportUpdated'));
};

window.addEventListener('hashchange', () => navigateTo(getCurrentPage()));

// ══════════════════════════════════════════════════════════
// SIDEBAR & UI
// ══════════════════════════════════════════════════════════

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
function isMobile() { return window.innerWidth <= 768; }
function openMobileSidebar() { 
    sidebar.classList.add('mobile-open'); 
    if (overlay) { overlay.style.display = 'block'; requestAnimationFrame(() => overlay.style.opacity = '1'); }
}
function closeMobileSidebar() { 
    sidebar.classList.remove('mobile-open'); 
    if (overlay) { overlay.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; }, 260); }
}
document.getElementById('navbarToggle')?.addEventListener('click', () => { if (isMobile()) sidebar.classList.contains('mobile-open') ? closeMobileSidebar() : openMobileSidebar(); });
overlay?.addEventListener('click', closeMobileSidebar);

// ══════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════

function applyTheme(isDark, animate = false) {
  if (animate) { document.body.style.transition = 'background-color 0.3s ease, color 0.15s ease'; setTimeout(() => { document.body.style.transition = ''; }, 400); }
  document.body.classList.toggle('dark', isDark);
  const cls = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  if (document.getElementById('themeIcon')) document.getElementById('themeIcon').className = cls;
  if (document.getElementById('sidebarThemeIcon')) document.getElementById('sidebarThemeIcon').className = cls;
}

async function toggleTheme() {
  const isDark = !document.body.classList.contains('dark');
  applyTheme(isDark, true);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  
  if (window.currentUser) {
    try {
      await updateUser(window.currentUser.id, { theme: isDark ? 'dark' : 'light' });
    } catch (err) {
      console.warn('Theme save failed:', err);
    }
  }
}
document.getElementById('btnTheme')?.addEventListener('click', toggleTheme);
document.getElementById('sidebarThemeBtn')?.addEventListener('click', toggleTheme);

// ══════════════════════════════════════════════════════════
// AUTH & INITIALIZATION (Supabase SDK)
// ══════════════════════════════════════════════════════════

async function initApp() {
    try {
        // 1. Core Auth Check (SDK + Offline aware)
        const user = await checkAuth();

        if (!user) {
            console.warn('[App Init] No active session found. Redirecting to login.');
            window.location.replace('login.html');
            return;
        }

        // 2. Hydrate user into global state
        window.currentUser = {
            ...user,
            id: user.id,
            email: user.email,
            display_name: user.user_metadata?.display_name || user.email,
            base_currency: user.user_metadata?.base_currency || 'PHP',
            theme: user.user_metadata?.theme || localStorage.getItem('theme') || 'light'
        };

        window.userCurrency = window.currentUser.base_currency;

        const displayName = window.currentUser.display_name;
        const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        if (document.getElementById('sidebarAvatar')) document.getElementById('sidebarAvatar').textContent = initials;
        if (document.getElementById('sidebarUserName')) document.getElementById('sidebarUserName').textContent = displayName;
        if (document.getElementById('sidebarUserEmail')) document.getElementById('sidebarUserEmail').textContent = user.email;
        if (document.getElementById('navbarAvatar')) document.getElementById('navbarAvatar').textContent = initials;

        applyTheme(window.currentUser.theme === 'dark');

        if (!navigator.onLine) {
            console.log('[App Init] Running in OFFLINE mode.');
            showToast('App running in offline mode', 'warning');
        } else {
            console.log('[App Init] Running in ONLINE mode.');
        }
        
        // 3. Load Dashboard components (Non-blocking or timeout protected)
        try {
            // Race loadDashboard against a timeout. 
            // If offline, we use a much shorter race (1s) because currency rates will be instant cache returns.
            // If online, we allow up to 5s for network fresh rates.
            const timeoutMs = navigator.onLine ? 5000 : 1000;
            const loadPromise = loadDashboard({ ...window.currentUser, uid: window.currentUser.id }, window.currentUser);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Dashboard timeout')), timeoutMs));
            
            await Promise.race([loadPromise, timeoutPromise]);
        } catch (dashErr) {
            console.warn('[App Init] Dashboard load bypass:', dashErr.message);
        }
        
        try {
            initNotifications();
        } catch (e) {}

        navigateTo(getCurrentPage());
        dismissLoadingScreen();

        // 4. Storage Maintenance
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(persistent => {
                if (persistent) console.log('[Storage] ✅ Persistence guaranteed.');
                else console.log('[Storage] ℹ️ Persistence not yet granted — install the PWA to enable it.');
            });
        }
        checkStorage();
        archiveOldRecords();

        // Setup Sidebar/Bottom Nav event listeners
        document.querySelectorAll('[data-page]').forEach(item => {
            item.addEventListener('click', (e) => { 
                e.preventDefault(); 
                navigateTo(item.dataset.page); 
                // Close sidebar on mobile after clicking
                if (window.innerWidth <= 1024) {
                    document.getElementById('sidebar')?.classList.remove('open');
                    document.getElementById('sidebarOverlay')?.classList.remove('active');
                }
            });
        });

    } catch (err) {
        console.error('App Init Fatal Error:', err.message);
        dismissLoadingScreen(); // Ensure screen is gone even on fatal error
    }
}

initApp();

// ══════════════════════════════════════════════════════════
// CONNECTIVITY LISTENERS
// ══════════════════════════════════════════════════════════

window.addEventListener('online', () => {
  showToast('Back online — Syncing your data...', 'success');
  // Trigger a sync if the sync engine is available
  if (window.manualSync) window.manualSync();
});

window.addEventListener('offline', () => {
  showToast('You are currently offline. Changes will be saved locally.', 'warning');
});

// ══════════════════════════════════════════════════════════
// LOGOUT & MODALS
// ══════════════════════════════════════════════════════════

window.handleLogout = async function() {
  try {
    // 1. Clear Supabase session (native)
    await supabase.auth.signOut();
    // 2. Redirect back to login
    window.location.replace('login.html');
  } catch (err) {
    console.error('Logout error:', err);
    window.location.replace('login.html');
  }
};
document.getElementById('btnLogout')?.addEventListener('click', (e) => { e.preventDefault(); window.handleLogout(); });
document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => window.handleLogout());

document.getElementById('btnQuickAdd')?.addEventListener('click', () => openExpenseModal());
document.getElementById('btnDashAddExpense')?.addEventListener('click', () => openExpenseModal());
document.getElementById('btnAddExpense')?.addEventListener('click', () => openExpenseModal());
document.getElementById('bottomNavAdd')?.addEventListener('click', e => { e.preventDefault(); openExpenseModal(); });
document.getElementById('btnAddIncome')?.addEventListener('click', () => openIncomeModal());

window.refreshDashboard = async () => {
    if (window.currentUser) {
        await loadDashboard({ ...window.currentUser, uid: window.currentUser.id }, window.currentUser);
        window.dispatchEvent(new Event('expensesUpdated'));
        window.dispatchEvent(new Event('dashboardUpdated'));
    }
};