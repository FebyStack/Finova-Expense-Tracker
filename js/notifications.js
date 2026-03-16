// js/notifications.js
// Handles in-app notifications (e.g. Budget Alerts, Reminders)

import { db, auth } from './firebase-config.js';
import { 
  collection, doc, setDoc, query, where, 
  onSnapshot, orderBy, updateDoc, writeBatch 
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// -- Globals --
let unreadCount = 0;
let notificationsListener = null;

// -- Elements --
const notifBtn = document.getElementById('btnNotifications');
const notifDot = document.getElementById('notifDot');
const notifDropdown = document.getElementById('notifDropdown');
const notifList = document.getElementById('notifList');
const btnMarkAllRead = document.getElementById('btnMarkAllRead');

/**
 * Creates an in-app notification in Firestore.
 * 
 * @param {string} id Unique identifier to prevent duplicates (e.g. `budget-${budgetId}-80-month-year`)
 * @param {string} title Notification Title
 * @param {string} message Notification body text
 * @param {string} type 'warning', 'danger', 'info', 'success'
 */
export async function addNotification(id, title, message, type = 'info') {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const notifRef = doc(db, 'users', user.uid, 'notifications', id);
    await setDoc(notifRef, {
      title,
      message,
      type,
      isRead: false,
      createdAt: new Date().toISOString()
    }, { merge: true }); // Merge ensures we don't overwrite if it exists, though read status might be kept
  } catch (err) {
    console.warn("Failed to create notification:", err);
  }
}

/**
 * Listens to notifications for the current user in real-time.
 */
export function initNotifications() {
  const user = auth.currentUser;
  if (!user) return;
  
  if (notificationsListener) notificationsListener();

  const q = query(
    collection(db, 'users', user.uid, 'notifications'),
    orderBy('createdAt', 'desc')
  );

  notificationsListener = onSnapshot(q, (snapshot) => {
    const notifications = [];
    unreadCount = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      notifications.push({ id: doc.id, ...data });
      if (!data.isRead) unreadCount++;
    });

    updateNotificationUI(notifications);
  }, (err) => {
    console.error("Notifications listener error:", err);
  });
}

function updateNotificationUI(notifications) {
  // Update Dot
  if (notifDot) {
    notifDot.style.display = unreadCount > 0 ? 'block' : 'none';
  }

  if (!notifList) return;

  if (notifications.length === 0) {
    notifList.innerHTML = `
      <div class="empty-state" style="padding:var(--space-6) var(--space-4);">
        <i class="fa-regular fa-bell" style="font-size:24px; margin-bottom:12px;"></i>
        <div style="font-size:var(--text-md); font-weight:var(--weight-semibold); color:var(--text-primary);">All caught up!</div>
        <div style="font-size:var(--text-sm); color:var(--text-muted); text-align:center;">No new notifications.</div>
      </div>
    `;
    return;
  }

  // Render List
  notifList.innerHTML = notifications.map(n => {
    let icon = 'fa-circle-info';
    let color = 'var(--accent)';
    
    if (n.type === 'danger') {
      icon = 'fa-circle-exclamation';
      color = 'var(--danger)';
    } else if (n.type === 'warning') {
      icon = 'fa-triangle-exclamation';
      color = 'var(--warning)';
    } else if (n.type === 'success') {
      icon = 'fa-circle-check';
      color = 'var(--success)';
    }

    const unreadDot = n.isRead ? '' : `<div class="notif-unread-dot"></div>`;
    
    // Formatting date
    const d = new Date(n.createdAt);
    let timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = d.toLocaleDateString();
    // If today, show "Today at 10:00 AM". If older, show date.
    if (new Date().toDateString() === d.toDateString()) {
      dateStr = 'Today';
    } else if (new Date(Date.now() - 86400000).toDateString() === d.toDateString()) {
      dateStr = 'Yesterday';
    }
    
    return `
      <div class="notif-item ${n.isRead ? 'read' : 'unread'}" data-id="${n.id}">
        <div class="notif-icon" style="color: ${color}">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="notif-content">
          <div class="notif-title">${n.title}</div>
          <div class="notif-message">${n.message}</div>
          <div class="notif-time">${dateStr} · ${timeStr}</div>
        </div>
        ${unreadDot}
      </div>
    `;
  }).join('');
}

/**
 * Mark all notifications as read.
 */
async function markAllAsRead() {
  const user = auth.currentUser;
  if (!user || unreadCount === 0) return;

  try {
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('isRead', '==', false)
    );
    
    // A query is needed to batch update, unfortunately we have to fetch them
    // but the array is already available via the snapshot technically. 
    // Since Firebase Web SDK doesn't support bulk update purely by where clause,
    // we fetch and batch write.
    // Note: We avoid heavy loading if there are too many, but usually it's fine.
    import("https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js").then(async ({ getDocs }) => {
       const snapshot = await getDocs(q);
       const batch = writeBatch(db);
       snapshot.forEach(d => {
         batch.update(d.ref, { isRead: true });
       });
       await batch.commit();
    });
  } catch(err) {
    console.error("Failed to mark all as read:", err);
  }
}

// -- Event Listeners --
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

if (btnMarkAllRead) {
  btnMarkAllRead.addEventListener('click', (e) => {
    e.preventDefault();
    markAllAsRead();
  });
}

// Expose individual click to mark as read
if (notifList) {
  notifList.addEventListener('click', async (e) => {
    const item = e.target.closest('.notif-item');
    if (!item) return;
    
    const id = item.dataset.id;
    if (item.classList.contains('unread')) {
      const user = auth.currentUser;
      if (user) {
        try {
          await updateDoc(doc(db, 'users', user.uid, 'notifications', id), { isRead: true });
        } catch(err) {
           console.warn("Failed marking single notif read:", err);
        }
      }
    }
  });
}
