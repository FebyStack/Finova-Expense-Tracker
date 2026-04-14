/**
 * js/pwa.js
 * Handles Service Worker registration and Offline Readiness notifications.
 */

export function initPWA() {
  // Check if we are in a secure context (HTTPS or localhost)
  const isSecure = window.isSecureContext;
  
  if (!isSecure && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    console.warn('[PWA] Insecure context detected - Offline support will be blocked by the browser.');
    updatePWAInsecure();
    return;
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(registration => {
          console.log('[PWA] ServiceWorker registration successful:', registration.scope);
          
          // If the worker is already controlling the page, it's likely ready
          if (navigator.serviceWorker.controller) {
            updatePWAStatus(true);
          }
        })
        .catch(err => {
          console.error('[PWA] ServiceWorker registration failed:', err);
          updatePWAStatus(false);
        });
    });

    // Listen for messages from the Service Worker (e.g. Caching Complete)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'OFFLINE_READY') {
        console.log('[PWA] Assets are cached and ready for offline use!');
        updatePWAStatus(true);
        showOfflineNotification();
      }
    });

    // Monitor connectivity
    window.addEventListener('online',  () => updatePWAStatus(true));
    window.addEventListener('offline', () => updatePWAStatus(true));
  }
}

/**
 * Specifically handles the insecure origin warning
 */
function updatePWAInsecure() {
  const pwaStatus = document.getElementById('pwaStatus');
  const pwaIcon   = document.getElementById('pwaIcon');
  const pwaLabel  = pwaStatus?.querySelector('.status-label');

  if (!pwaStatus || !pwaIcon) return;

  pwaStatus.classList.add('insecure');
  pwaStatus.setAttribute('title', 'Offline Unavailable: HTTPS required for mobile devices.');
  pwaIcon.className = 'fa-solid fa-triangle-exclamation';
  pwaIcon.style.color = 'var(--warning)';
  if (pwaLabel) pwaLabel.textContent = 'HTTPS Required';
}

/**
 * Updates the UI indicator for PWA status
 */
function updatePWAStatus(isReady) {
  const pwaStatus = document.getElementById('pwaStatus');
  const pwaIcon   = document.getElementById('pwaIcon');
  const pwaDot    = document.getElementById('pwaDot');

  if (!pwaStatus || !pwaIcon) return;

  if (isReady) {
    pwaStatus.classList.add('ready');
    pwaStatus.setAttribute('title', 'Finova is ready for offline use');
    
    // Change icon to cloud with check
    pwaIcon.className = 'fa-solid fa-cloud-check pwa-icon-online';
  } else {
    pwaStatus.classList.remove('ready');
    pwaStatus.setAttribute('title', 'Caching assets for offline use...');
    pwaIcon.className = 'fa-solid fa-cloud-arrow-down pwa-icon-offline';
  }
}

/**
 * Adds a one-time notification to the notification list
 */
function showOfflineNotification() {
  const notifList = document.getElementById('notifList');
  const notifDot  = document.getElementById('notifDot');
  
  if (!notifList) return;

  // If there's an empty state, clear it
  const emptyState = notifList.querySelector('.empty-state');
  if (emptyState) notifList.innerHTML = '';

  // Create notification element
  const notif = document.createElement('div');
  notif.className = 'notif-item unread';
  notif.style.padding = 'var(--space-3)';
  notif.style.borderBottom = '1px solid var(--border)';
  notif.style.cursor = 'pointer';
  
  notif.innerHTML = `
    <div style="display:flex; gap:var(--space-3); align-items:center;">
      <div style="width:32px; height:32px; border-radius:50%; background:var(--success-light); color:var(--success); display:flex; align-items:center; justify-content:center;">
        <i class="fa-solid fa-cloud-check"></i>
      </div>
      <div style="flex:1;">
        <div style="font-size:var(--text-sm); font-weight:var(--weight-semibold); color:var(--text-primary);">Offline Mode Ready</div>
        <div style="font-size:var(--text-xs); color:var(--text-muted);">Finova is now fully cached. You can use it without internet.</div>
      </div>
    </div>
  `;

  // Prepend to list
  notifList.insertBefore(notif, notifList.firstChild);

  // Show red dot on the bell
  if (notifDot) notifDot.style.display = 'block';

  // Make it clickable to "read"
  notif.addEventListener('click', () => {
    notif.classList.remove('unread');
    notif.style.opacity = '0.7';
    // Check if any other unread exist
    const otherUnread = notifList.querySelector('.notif-item.unread');
    if (!otherUnread && notifDot) notifDot.style.display = 'none';
  });
}

// Auto-run if imported properly
initPWA();
