// js/notifications.js
// Handles in-app notifications (e.g. Budget Alerts, Reminders)
// Migrated away from Firebase. Placeholder for future PostgreSQL notifications.

// -- Globals --
let unreadCount = 0;

export async function addNotification(id, title, message, type = 'info') {
    console.log('Notification placeholder:', title, message);
}

export function initNotifications() {
    const notifList = document.getElementById('notifList');
    if (notifList) {
        notifList.innerHTML = `
          <div class="empty-state" style="padding:var(--space-6) var(--space-4);">
            <i class="fa-regular fa-bell" style="font-size:24px; margin-bottom:12px;"></i>
            <div style="font-size:var(--text-md); font-weight:var(--weight-semibold); color:var(--text-primary);">All caught up!</div>
            <div style="font-size:var(--text-sm); color:var(--text-muted); text-align:center;">Notifications disabled in local mode.</div>
          </div>
        `;
    }
}

// -- Elements --
const notifBtn = document.getElementById('btnNotifications');
const notifDropdown = document.getElementById('notifDropdown');

if (notifBtn && notifDropdown) {
  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
      notifDropdown.classList.remove('open');
    }
  });
}
