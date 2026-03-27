// js/auth.js
import { auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";



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

function friendlyError(code) {
  const errors = {
    'auth/invalid-email':            'That email address is not valid.',
    'auth/user-not-found':           'No account found with this email.',
    'auth/wrong-password':           'Incorrect password. Please try again.',
    'auth/invalid-credential':       'Incorrect email or password.',
    'auth/too-many-requests':        'Too many attempts. Please wait a moment and try again.',
    'auth/user-disabled':            'This account has been disabled.',
    'auth/email-already-in-use':     'An account with this email already exists.',
    'auth/weak-password':            'Password is too weak. Use at least 8 characters.',
    'auth/network-request-failed':   'Network error. Check your internet connection.',
  };
  return errors[code] || 'Something went wrong. Please try again.';
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
      await signInWithEmailAndPassword(auth, email, password);
      // Redirect handled by onAuthStateChanged
    } catch (error) {
      showError(friendlyError(error.code));
      setLoading('btnEmailLogin', false, `<span class="btn-label">Sign In</span> <i class="fa-solid fa-arrow-right"></i>`);
    }
  });

// ── Forgot Password ────────────────────────────────────────
document.getElementById('linkForgot')
  ?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('inputEmail').value.trim();
    if (!email) {
      showError('Enter your email address above, then click "Forgot password?"');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      const errorBox  = document.getElementById('authError');
      const errorText = document.getElementById('authErrorText');
      errorBox.style.display    = 'flex';
      errorBox.style.background = 'var(--success-light)';
      errorBox.style.borderColor= 'var(--success)';
      errorBox.style.color      = 'var(--success)';
      errorText.textContent     = `Password reset email sent to ${email}`;
      setTimeout(() => {
        errorBox.style.display = 'none';
        errorBox.style.background  = '';
        errorBox.style.borderColor = '';
        errorBox.style.color       = '';
      }, 6000);
    } catch (error) {
      showError(friendlyError(error.code));
    }
  });

// ── Auth State Listener & Route Guard ─────────────────────
// Only handles auth on login/signup pages — app.js manages dashboard auth
onAuthStateChanged(auth, async (user) => {

  // Skip on dashboard — app.js handles auth there
  const page = window.location.pathname;
  const isAuthPage = ['/login.html', '/signup.html', '/index.html'].some(p => page.endsWith(p)) || page.endsWith('/');
  if (!isAuthPage) return;

  if (!user) {
    return;
  }

  // --- Sync user with backend database first ---
  let userSynced = false;
  try {

    const res = await fetch('api/users.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
        baseCurrency: 'PHP',
        theme: 'light'
      })
    });

    const data = await res.json();


    if (data.success) {
      console.log('✅ User synced to PostgreSQL');
      userSynced = true;
    } else {
      console.error('❌ User sync failed:', data.error);
    }
  } catch (err) {
    console.error('❌ User sync failed:', err);
  }

  // --- Redirect to dashboard if user synced successfully ---
  if (userSynced) {
    window.location.href = 'dashboard.html';
  } else {
    showError('Could not sync user. Please try again.');
  }
});