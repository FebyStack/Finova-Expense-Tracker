/**
 * js/confirm.js
 * Centralized confirmation dialog for the entire Finova Expense Tracker.
 * Use: const confirmed = await showConfirm("Are you sure?");
 */

export function showConfirm(message, title = "Confirm Delete") {
  return new Promise((resolve) => {
    // 1. Remove any existing dialogs
    document.getElementById('confirmDialogOverlay')?.remove();

    // 2. Create elements
    const overlay = document.createElement('div');
    overlay.id = 'confirmDialogOverlay';
    overlay.className = 'confirm-dialog-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-dialog-icon">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h3 class="confirm-dialog-title">${title}</h3>
        <p class="confirm-dialog-message">${message}</p>
        <div class="confirm-dialog-actions">
          <button class="btn btn-ghost" id="confirmDialogCancel">Cancel</button>
          <button class="btn btn-danger" id="confirmDialogConfirm">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // 3. Trigger animation
    requestAnimationFrame(() => {
      overlay.classList.add('open');
    });

    // 4. Cleanup and Resolve function
    const settle = (result) => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 250);
      resolve(result);
    };

    // 5. Event Listeners
    document.getElementById('confirmDialogCancel').onclick   = () => settle(false);
    document.getElementById('confirmDialogConfirm').onclick  = () => settle(true);
    overlay.onclick = (e) => { if (e.target === overlay) settle(false); };

    // Escape key support
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKeyDown);
        settle(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
  });
}

// Attach to window so non-modular code can use it (legacy support)
window.showConfirm = showConfirm;
