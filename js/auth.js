// js/auth.js

import { apiFetch } from './api.js';

// ── UI Helpers ─────────────────────────────────────────────
function showError(message) {
  const errorBox  = document.getElementById('authError');
  const errorText = document.getElementById('authErrorText');
  if (!errorBox || !errorText) return;
  errorText.textContent  = message;
  errorBox.style.display = 'flex';
  setTimeout(() => errorBox.style.display = 'none', 5000);
}

function setLoading(btnId, isLoading, defaultHTML) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled  = isLoading;
  btn.innerHTML = isLoading
    ? `<i class="fa-solid fa-spinner fa-spin"></i> Please wait…`
    : defaultHTML;
}

// ── Password Visibility Toggle ─────────────────────────────
const togglePasswordBtn  = document.getElementById('togglePassword');
const togglePasswordIcon = document.getElementById('togglePasswordIcon');
const inputPassword      = document.getElementById('inputPassword');

togglePasswordBtn?.addEventListener('click', () => {
  const visible      = inputPassword.type === 'text';
  inputPassword.type = visible ? 'password' : 'text';
  togglePasswordIcon.className = visible
    ? 'fa-solid fa-eye'
    : 'fa-solid fa-eye-slash';
});

// ── Hide error when typing ─────────────────────────────────
['inputEmail', 'inputPassword'].forEach(id => {
  document.getElementById(id)
    ?.addEventListener('input', () => {
      document.getElementById('authError').style.display = 'none';
    });
});

// ── Email / Password Sign-In ───────────────────────────────
document.getElementById('btnEmailLogin')
  ?.addEventListener('click', async () => {
    const email    = document.getElementById('inputEmail').value.trim();
    const password = document.getElementById('inputPassword').value;

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    setLoading('btnEmailLogin', true, `<span class="btn-label">Sign In</span> <i class="fa-solid fa-arrow-right"></i>`);

    try {
      const resp = await fetch('api/login.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          credentials: 'include' // needed so session cookie drops securely
      });
      const data = await resp.json();
      
      if (!data.success) {
          throw new Error(data.error || 'Failed to authenticate');
      }

      // Automatically redirect logic
      window.location.href = 'dashboard.html';
      
    } catch (error) {
      showError(error.message);
      setLoading('btnEmailLogin', false, `<span class="btn-label">Sign In</span> <i class="fa-solid fa-arrow-right"></i>`);
    }
  });

// ── Forgot Password ────────────────────────────────────────
document.getElementById('linkForgot')
  ?.addEventListener('click', async (e) => {
    e.preventDefault();
    showError('Password reset currently unavailable in local mode. Please ask the administrator.');
  });