// js/app.js
// Main app logic — routing, auth state, UI interactions

import { auth, db }        from './firebase-config.js';
import { onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc }
  from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { loadDashboard } from './dashboard.js';
import { openExpenseModal, closeExpenseModal } from './expenses.js';

// ── Page map — hash → page ID & title ─────────────────────
const PAGES = {
  dashboard: { id: 'dashboard', title: 'Dashboard'     },
  expenses:  { id: 'expenses',  title: 'Expenses'      },
  income:    { id: 'income',    title: 'Income'        },
  calendar:  { id: 'calendar',  title: 'Calendar'      },
  budgets:   { id: 'budgets',   title: 'Budgets'       },
  savings:   { id: 'savings',   title: 'Savings Goals' },
  recurring: { id: 'recurring', title: 'Recurring'     },
  analytics: { id: 'analytics', title: 'Analytics'     },
  export:    { id: 'export',    title: 'Export'        },
  settings:  { id: 'settings',  title: 'Settings'      },
};


// ══════════════════════════════════════════════════════════
// ROUTING — hash-based navigation
// ══════════════════════════════════════════════════════════

function getCurrentPage() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  return PAGES[hash] ? hash : 'dashboard';
}

function navigateTo(pageKey) {
  // Update URL hash
  window.location.hash = pageKey;

  // Hide all page views
  document.querySelectorAll('.page-view').forEach(el => {
    el.classList.remove('active');
  });

  // Show target page
  const target = document.getElementById(`page-${pageKey}`);
  if (target) target.classList.add('active');

  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageKey);
  });

  // Update bottom nav active state
  document.querySelectorAll('.bottom-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageKey);
  });

  // Update navbar breadcrumb title
  const pageTitle = PAGES[pageKey]?.title || 'Dashboard';
  const titleEl   = document.getElementById('navbarPageTitle');
  if (titleEl) titleEl.textContent = pageTitle;

  // Close sidebar on mobile after navigating
  if (window.innerWidth <= 640) {
    closeSidebar();
  }

  // Scroll page content to top
  document.getElementById('pageContent')?.scrollTo(0, 0);
}

// Listen for hash changes (back/forward browser buttons)
window.addEventListener('hashchange', () => {
  navigateTo(getCurrentPage());
});

// Handle sidebar nav clicks
document.querySelectorAll('.sidebar-item[data-page]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

// Handle bottom nav clicks
document.querySelectorAll('.bottom-nav-item[data-page]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});


// ══════════════════════════════════════════════════════════
// SIDEBAR COLLAPSE
// ══════════════════════════════════════════════════════════

let sidebarCollapsed = false;

function openSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  const main     = document.getElementById('appMain');
  const navbar   = document.getElementById('navbar');

  sidebar.classList.remove('collapsed');
  overlay.classList.add('visible');
  main.classList.remove('collapsed');
  navbar.classList.remove('collapsed');
  sidebarCollapsed = false;
}

function closeSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');

  if (window.innerWidth <= 640) {
    // On mobile — slide sidebar off screen
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  } else {
    // On tablet/desktop — collapse to icon-only
    const main   = document.getElementById('appMain');
    const navbar = document.getElementById('navbar');
    sidebar.classList.add('collapsed');
    main.classList.add('collapsed');
    navbar.classList.add('collapsed');
    sidebarCollapsed = true;
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');

  if (window.innerWidth <= 640) {
    // Mobile — slide in/out
    const overlay = document.getElementById('sidebarOverlay');
    const isOpen  = sidebar.classList.contains('open');
    if (isOpen) {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
    } else {
      sidebar.classList.add('open');
      overlay.classList.add('visible');
    }
  } else {
    // Desktop/tablet — collapse/expand
    if (sidebarCollapsed) {
      openSidebar();
    } else {
      closeSidebar();
    }
  }
}

// Navbar hamburger toggle
document.getElementById('navbarToggle')
  ?.addEventListener('click', toggleSidebar);

// Close sidebar when overlay is clicked (mobile)
document.getElementById('sidebarOverlay')
  ?.addEventListener('click', closeSidebar);


// ══════════════════════════════════════════════════════════
// DARK MODE
// ══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
// DARK MODE
// ══════════════════════════════════════════════════════════

function applyTheme(isDark, animate = false) {
  if (animate) {
    document.body.style.transition =
      'background-color 0.3s ease, color 0.3s ease';
  }
  document.body.classList.toggle('dark', isDark);
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
  // Update meta theme-color for mobile browsers
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', isDark ? '#0d1117' : '#ffffff');
  }
}

async function toggleTheme() {
  const isDark = !document.body.classList.contains('dark');
  applyTheme(isDark, true);

  // Save to localStorage immediately
  localStorage.setItem('theme', isDark ? 'dark' : 'light');

  // Save to Firestore in background
  const user = auth.currentUser;
  if (user) {
    try {
      const { doc, updateDoc } = await import(
        "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js"
      );
      await updateDoc(doc(db, 'users', user.uid), {
        theme: isDark ? 'dark' : 'light'
      });
    } catch (error) {
      console.error('Failed to save theme to Firestore:', error);
    }
  }
}

// Load saved theme instantly on page load (before auth resolves)
// This prevents a flash of wrong theme
(function loadThemeImmediately() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.body.classList.add('dark');
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = 'fa-solid fa-sun';
  }
})();

// Theme toggle button
document.getElementById('btnTheme')
  ?.addEventListener('click', toggleTheme);
// ══════════════════════════════════════════════════════════
// AUTH STATE — Load user info & route guard
// ══════════════════════════════════════════════════════════

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  try {
    // Load user profile
    const userDoc  = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;

    const displayName = userData?.displayName || user.displayName || user.email;
    const email       = user.email || '';
    const initials    = displayName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    // Sidebar
    document.getElementById('sidebarAvatar').textContent    = initials;
    document.getElementById('sidebarUserName').textContent  = displayName;
    document.getElementById('sidebarUserEmail').textContent = email;

    // Navbar
    document.getElementById('navbarAvatar').textContent = initials;

    // Sync sidebar theme icon with navbar icon
function syncThemeIcons(isDark) {
  const navIcon     = document.getElementById('themeIcon');
  const sidebarIcon = document.getElementById('sidebarThemeIcon');
  const iconClass   = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  if (navIcon)     navIcon.className     = iconClass;
  if (sidebarIcon) sidebarIcon.className = iconClass;
}

// Update applyTheme to also sync sidebar icon
// Replace the existing applyTheme function's icon line with:
// syncThemeIcons(isDark);  ← call this instead of setting icon directly

// Sidebar theme button
document.getElementById('sidebarThemeBtn')
  ?.addEventListener('click', toggleTheme);

    // Apply saved theme
    const firestoreTheme = userData?.theme;
    const localTheme     = localStorage.getItem('theme');
    const isDark         = firestoreTheme
    ? firestoreTheme === 'dark'
    : localTheme === 'dark';
    applyTheme(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    function applyTheme(isDark, animate = false) {
  if (animate) {
    document.body.style.transition =
      'background-color 0.3s ease, color 0.3s ease';
  }
  document.body.classList.toggle('dark', isDark);
  syncThemeIcons(isDark);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', isDark ? '#0d1117' : '#ffffff');
  }
}

    // Load dashboard
    await loadDashboard(user, userData);

    // Navigate to page
    navigateTo(getCurrentPage());

  } catch (error) {
    console.error('Error loading user profile:', error);
  }

});


// ══════════════════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════

const btnLogout = document.getElementById("btnLogout");

if (btnLogout) {
  btnLogout.addEventListener("click", async (e) => {
    e.preventDefault();

    try {
      await signOut(auth);   // Firebase logout
      window.location.replace('login.html');
    } catch (error) {
      console.error("Logout error:", error);
    }
  });
}


// ══════════════════════════════════════════════════════════
// RESPONSIVE — handle resize events
// ══════════════════════════════════════════════════════════

window.addEventListener('resize', () => {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (window.innerWidth > 640) {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  }
});

document.getElementById('btnDashAddExpense')
  ?.addEventListener('click', () => navigateTo('expenses'));

// ── Add Expense button handlers ────────────────────────────
// All + buttons across the app open the same modal
document.getElementById('btnQuickAdd')
  ?.addEventListener('click', openExpenseModal);

document.getElementById('btnDashAddExpense')
  ?.addEventListener('click', openExpenseModal);

document.getElementById('btnAddExpense')
  ?.addEventListener('click', openExpenseModal);

document.getElementById('bottomNavAdd') 
  ?.addEventListener('click', (e) => {
    e.preventDefault();
    openExpenseModal();
  });

// Expose dashboard refresh for use after saving expenses
window.refreshDashboard = async () => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const userDoc  = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists() ? userDoc.data() : null;
    await loadDashboard(user, userData);
  } catch (error) {
    console.error('Refresh error:', error);
  }
};