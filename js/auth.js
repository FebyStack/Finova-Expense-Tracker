// js/auth.js
// Full Firebase Authentication — Day 5

import { auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";


// ── Providers ──────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
const appleProvider  = new OAuthProvider('apple.com');

// Request user's name and email from Apple
appleProvider.addScope('email');
appleProvider.addScope('name');


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

// Map Firebase error codes to friendly messages
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
    'auth/popup-closed-by-user':     'Sign-in popup was closed. Please try again.',
    'auth/cancelled-popup-request':  'Only one sign-in popup can be open at a time.',
    'auth/network-request-failed':   'Network error. Check your internet connection.',
    'auth/invalid-verification-code':'Invalid OTP code. Please check and try again.',
    'auth/code-expired':             'OTP code has expired. Please request a new one.',
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


// ── Hide error when user types ─────────────────────────────
['inputEmail', 'inputPassword'].forEach(id => {
  document.getElementById(id)
    ?.addEventListener('input', () => {
      document.getElementById('authError').style.display = 'none';
    });
});


// ── Google Sign-In ─────────────────────────────────────────
document.getElementById('btnGoogle')
  ?.addEventListener('click', async () => {
    setLoading('btnGoogle', true, `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18"/> Continue with Google`);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged below will handle the redirect
    } catch (error) {
      showError(friendlyError(error.code));
      setLoading('btnGoogle', false, `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18"/> Continue with Google`);
    }
  });


// ── Apple Sign-In ──────────────────────────────────────────
document.getElementById('btnApple')
  ?.addEventListener('click', async () => {
    setLoading('btnApple', true, `<i class="fa-brands fa-apple" style="font-size:18px;"></i> Continue with Apple`);
    try {
      await signInWithPopup(auth, appleProvider);
    } catch (error) {
      showError(friendlyError(error.code));
      setLoading('btnApple', false, `<i class="fa-brands fa-apple" style="font-size:18px;"></i> Continue with Apple`);
    }
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
      // Show success message
      const errorBox  = document.getElementById('authError');
      const errorText = document.getElementById('authErrorText');
      errorBox.style.display    = 'flex';
      errorBox.style.background = 'var(--success-light)';
      errorBox.style.borderColor= 'var(--success)';
      errorBox.style.color      = 'var(--success)';
      errorText.textContent     = `Password reset email sent to ${email}`;
      setTimeout(() => {
        errorBox.style.display = 'none';
        // Reset styles back to error style
        errorBox.style.background  = '';
        errorBox.style.borderColor = '';
        errorBox.style.color       = '';
      }, 6000);
    } catch (error) {
      showError(friendlyError(error.code));
    }
  });




// ── Auth State Listener & Route Guard ─────────────────────
// This runs every time the auth state changes (login / logout)
onAuthStateChanged(auth, (user) => {
  const page = window.location.pathname;

  // Pages that should only be visible when LOGGED OUT
  const authPages = ['/login.html', '/signup.html', '/index.html', '/'];

  // Pages that require LOGIN
  const protectedPages = ['/dashboard.html'];

  const isAuthPage      = authPages.some(p => page.endsWith(p));
  const isProtectedPage = protectedPages.some(p => page.endsWith(p));

  if (user) {
    // User is logged in
    if (isAuthPage) {
      // Redirect away from login/signup to dashboard
      window.location.href = 'dashboard.html';
    }
  } else {
    // User is not logged in
    if (isProtectedPage) {
      // Redirect away from protected pages to login
      window.location.href = 'login.html';
    }
  }
});


// ── Logout (call this from dashboard) ─────────────────────
export async function logout() {
  try {
    await signOut(auth);
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Logout error:', error);
  }
}