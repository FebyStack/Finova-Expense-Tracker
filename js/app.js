// js/app.js
// Main app logic — routing, auth state, sidebar, theme

import { auth, db }       from './firebase-config.js';
import { onAuthStateChanged, signOut }
  from "../firebase-auth.js";
import { doc, getDoc, updateDoc }
  from "../firebase-firestore.js";
import { loadDashboard }  from './dashboard.js';
import { openExpenseModal } from './expenses.js';

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
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  return PAGES[hash] ? hash : 'dashboard';
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

  // Close sidebar drawer on mobile after navigating
  if (window.innerWidth <= 768) closeMobileSidebar();
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
// SIDEBAR — two separate modes
//   Desktop (> 768px): .collapsed  = icon-only, labels hidden
//   Mobile  (≤ 768px): .mobile-open = drawer slides in
// ══════════════════════════════════════════════════════════

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

function isMobile() { return window.innerWidth <= 768; }

// ── Desktop collapse ──────────────────────────────────────
function collapseDesktop() {
  sidebar.classList.add('collapsed');
  localStorage.setItem('sidebarCollapsed', 'true');
}

function expandDesktop() {
  sidebar.classList.remove('collapsed');
  localStorage.setItem('sidebarCollapsed', 'false');
}

function toggleDesktop() {
  if (sidebar.classList.contains('collapsed')) {
    expandDesktop();
  } else {
    collapseDesktop();
  }
}

// ── Mobile drawer ─────────────────────────────────────────
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

// ── Main toggle (hamburger button) ───────────────────────
document.getElementById('navbarToggle')?.addEventListener('click', () => {
  if (isMobile()) {
    sidebar.classList.contains('mobile-open')
      ? closeMobileSidebar()
      : openMobileSidebar();
  } else {
    toggleDesktop();
  }
});

// Close drawer when overlay is tapped on mobile
overlay?.addEventListener('click', closeMobileSidebar);

// Restore desktop collapsed state from localStorage
if (!isMobile() && localStorage.getItem('sidebarCollapsed') === 'true') {
  collapseDesktop();
}

// Handle resize — clean up states when switching breakpoints
window.addEventListener('resize', () => {
  if (!isMobile()) {
    // Going back to desktop — close mobile drawer
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

  const user = auth.currentUser;
  if (user) {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        theme: isDark ? 'dark' : 'light'
      });
    } catch (err) {
      console.warn('Theme save failed:', err);
    }
  }
}

// Apply saved theme immediately (no flash)
(function () {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') applyTheme(true);
})();

document.getElementById('btnTheme')?.addEventListener('click', toggleTheme);
document.getElementById('sidebarThemeBtn')?.addEventListener('click', toggleTheme);


// ══════════════════════════════════════════════════════════
// AUTH STATE
// ══════════════════════════════════════════════════════════

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const userDoc  = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;

    const displayName = userData?.displayName || user.displayName || user.email || 'User';
    const email       = user.email || '';
    const initials    = displayName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    // Populate sidebar user info
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarName   = document.getElementById('sidebarUserName');
    const sidebarEmail  = document.getElementById('sidebarUserEmail');
    const navbarAvatar  = document.getElementById('navbarAvatar');

    if (sidebarAvatar) sidebarAvatar.textContent = initials;
    if (sidebarName)   sidebarName.textContent   = displayName;
    if (sidebarEmail)  sidebarEmail.textContent  = email;
    if (navbarAvatar)  navbarAvatar.textContent  = initials;

    // Sync theme from Firestore or localStorage
    const savedTheme = userData?.theme || localStorage.getItem('theme');
    const isDark     = savedTheme === 'dark';
    applyTheme(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // Load dashboard data
    await loadDashboard(user, userData);

    // Navigate to current hash
    navigateTo(getCurrentPage());

  } catch (err) {
    console.error('Error loading user profile:', err);
  }
});


// ══════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════

document.getElementById('btnLogout')?.addEventListener('click', async e => {
  e.preventDefault();
  try {
    await signOut(auth);
    window.location.replace('login.html');
  } catch (err) {
    console.error('Logout error:', err);
  }
});


// ══════════════════════════════════════════════════════════
// EXPENSE MODAL TRIGGERS
// ══════════════════════════════════════════════════════════

document.getElementById('btnQuickAdd')
  ?.addEventListener('click', () => openExpenseModal());

document.getElementById('btnDashAddExpense')
  ?.addEventListener('click', () => openExpenseModal());

document.getElementById('btnAddExpense')
  ?.addEventListener('click', () => openExpenseModal());

document.getElementById('bottomNavAdd')
  ?.addEventListener('click', e => { e.preventDefault(); openExpenseModal(); });


// ══════════════════════════════════════════════════════════
// DASHBOARD REFRESH (called from expenses.js after saving)
// ══════════════════════════════════════════════════════════

window.refreshDashboard = async () => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const userDoc  = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    await loadDashboard(user, userData);
  } catch (err) {
    console.error('Refresh error:', err);
  }
};