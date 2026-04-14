// js/toast.js
// Shared toast notification utility for the entire app

/**
 * Display a transient toast notification.
 * @param {string} message — Text to display
 * @param {'success'|'error'|'warning'|'info'} type — Visual variant
 */
export function showToast(message, type = 'success') {
  document.getElementById('appToast')?.remove();

  const toast     = document.createElement('div');
  toast.id        = 'appToast';
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
