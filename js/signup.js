// js/signup.js
// Sign-up page UI & validation — Day 4
// Firebase createUser logic added on Day 5

// ── Password visibility toggles ────────────────────────────
function setupToggle(btnId, iconId, inputId) {
  const btn   = document.getElementById(btnId);
  const icon  = document.getElementById(iconId);
  const input = document.getElementById(inputId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const visible   = input.type === 'text';
    input.type      = visible ? 'password' : 'text';
    icon.className  = visible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
  });
}

setupToggle('togglePassword',        'togglePasswordIcon', 'inputPassword');
setupToggle('toggleConfirmPassword', 'toggleConfirmIcon',  'inputConfirmPassword');


// ── Password strength checker ──────────────────────────────
const inputPassword    = document.getElementById('inputPassword');
const passwordStrength = document.getElementById('passwordStrength');
const strengthFill     = document.getElementById('strengthFill');
const strengthLabel    = document.getElementById('strengthLabel');

function checkStrength(password) {
  let score = 0;
  if (password.length >= 8)                    score++;
  if (password.length >= 12)                   score++;
  if (/[A-Z]/.test(password))                  score++;
  if (/[0-9]/.test(password))                  score++;
  if (/[^A-Za-z0-9]/.test(password))           score++;

  if      (score <= 1) return { level: 'weak',   label: 'Weak'   };
  else if (score === 2) return { level: 'fair',   label: 'Fair'   };
  else if (score === 3) return { level: 'good',   label: 'Good'   };
  else                  return { level: 'strong', label: 'Strong' };
}

inputPassword?.addEventListener('input', () => {
  const password = inputPassword.value;

  if (!password) {
    passwordStrength.style.display = 'none';
    return;
  }

  passwordStrength.style.display = 'flex';
  const result = checkStrength(password);

  // Update bar
  strengthFill.className = `strength-fill ${result.level}`;

  // Update label
  strengthLabel.textContent = result.label;
  strengthLabel.className   = `strength-label ${result.level}`;
});


// ── Confirm password match check ───────────────────────────
const inputConfirm  = document.getElementById('inputConfirmPassword');
const confirmHelp   = document.getElementById('confirmHelp');

inputConfirm?.addEventListener('input', () => {
  const password = inputPassword.value;
  const confirm  = inputConfirm.value;

  if (!confirm) {
    confirmHelp.textContent = '';
    inputConfirm.classList.remove('is-valid', 'is-invalid');
    return;
  }

  if (password === confirm) {
    confirmHelp.textContent  = '✓ Passwords match';
    confirmHelp.style.color  = 'var(--success)';
    inputConfirm.classList.add('is-valid');
    inputConfirm.classList.remove('is-invalid');
  } else {
    confirmHelp.textContent  = '✗ Passwords do not match';
    confirmHelp.style.color  = 'var(--danger)';
    inputConfirm.classList.add('is-invalid');
    inputConfirm.classList.remove('is-valid');
  }
});


// ── Email format validation ────────────────────────────────
const inputEmail = document.getElementById('inputEmail');
const emailHelp  = document.getElementById('emailHelp');

inputEmail?.addEventListener('blur', () => {
  const email   = inputEmail.value.trim();
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!email) {
    emailHelp.textContent = '';
    inputEmail.classList.remove('is-valid', 'is-invalid');
    return;
  }

  if (isValid) {
    emailHelp.textContent = '';
    inputEmail.classList.add('is-valid');
    inputEmail.classList.remove('is-invalid');
  } else {
    emailHelp.textContent  = 'Please enter a valid email address';
    emailHelp.style.color  = 'var(--danger)';
    inputEmail.classList.add('is-invalid');
    inputEmail.classList.remove('is-valid');
  }
});


// ── Show / hide error banner ───────────────────────────────
function showError(message) {
  const errorBox  = document.getElementById('authError');
  const errorText = document.getElementById('authErrorText');
  if (!errorBox || !errorText) return;
  errorText.textContent  = message;
  errorBox.style.display = 'flex';
  setTimeout(() => { errorBox.style.display = 'none'; }, 5000);
}

function hideError() {
  const errorBox = document.getElementById('authError');
  if (errorBox) errorBox.style.display = 'none';
}

// Hide error when user starts typing
['inputEmail', 'inputPassword', 'inputConfirmPassword', 'inputFirstName']
  .forEach(id => document.getElementById(id)?.addEventListener('input', hideError));


// ── Full form validation before submit ─────────────────────
function validateForm() {
  const firstName = document.getElementById('inputFirstName').value.trim();
  const lastName  = document.getElementById('inputLastName').value.trim();
  const email     = document.getElementById('inputEmail').value.trim();
  const password  = inputPassword.value;
  const confirm   = inputConfirm.value;
  const terms     = document.getElementById('checkTerms').checked;

  if (!firstName || !lastName) {
    showError('Please enter your full name.');
    return false;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('Please enter a valid email address.');
    return false;
  }

  if (password.length < 8) {
    showError('Password must be at least 8 characters long.');
    return false;
  }

  const strength = checkStrength(password);
  if (strength.level === 'weak') {
    showError('Your password is too weak. Add uppercase letters, numbers, or symbols.');
    return false;
  }

  if (password !== confirm) {
    showError('Passwords do not match.');
    return false;
  }

  if (!terms) {
    showError('Please accept the Terms of Service to continue.');
    return false;
  }

  return true;
}


// ── Sign up button handler ─────────────────────────────────
// ── Sign up button handler — Full Firebase version ─────────
import { auth, db } from './firebase-config.js';

// ── Temporary debug — remove after fixing ──
console.log('auth:', auth);
console.log('db:', db);

import {
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();
const appleProvider  = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

let isSigningUp = false;    

function friendlyError(code) {
  switch (code) {
    case 'auth/email-already-in-use':   return 'An account with this email already exists.';
    case 'auth/invalid-email':          return 'Please enter a valid email address.';
    case 'auth/weak-password':          return 'Password must be at least 6 characters.';
    case 'auth/network-request-failed': return 'Network error. Check your connection.';
    case 'auth/popup-blocked':          return 'Popup was blocked. Please allow popups and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    default: return 'Something went wrong. Please try again.';
  }
}

function setLoading(btnId, isLoading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled  = isLoading;
  btn.innerHTML = isLoading
    ? `<i class="fa-solid fa-spinner fa-spin"></i> Creating account…`
    : `<span class="btn-label">Create Account</span> <i class="fa-solid fa-arrow-right"></i>`;
}

// Save user profile to Firestore after account creation
async function saveUserProfile(user, extraData = {}) {
  console.log('💾 Attempting Firestore write...');
  console.log('User UID:', user.uid);
  console.log('DB instance:', db);

  try {
    await setDoc(doc(db, 'users', user.uid), {
      uid:          user.uid,
      email:        user.email,
      displayName:  user.displayName || extraData.displayName || '',
      baseCurrency: extraData.baseCurrency || 'PHP',
      theme:        'light',
      createdAt:    serverTimestamp(),
      updatedAt:    serverTimestamp(),
    });
    console.log('✅ Firestore write successful!');
  } catch (error) {
    console.error('❌ Firestore write failed:', error.code, error.message);
  }
}

// Email / Password sign-up
document.getElementById('btnSignup')
  ?.addEventListener('click', async () => {
    if (!validateForm()) return;

    isSigningUp = true;

    const firstName = document.getElementById('inputFirstName').value.trim();
    const lastName  = document.getElementById('inputLastName').value.trim();
    const email     = document.getElementById('inputEmail').value.trim();
    const currency  = document.getElementById('inputCurrency').value;
    const password  = document.getElementById('inputPassword').value;
    const fullName  = `${firstName} ${lastName}`;

    setLoading('btnSignup', true);

    try {
      // 1. Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user           = userCredential.user;

      // 2. Set display name in Firebase Auth
      await updateProfile(user, { displayName: fullName });

      // 3. Save profile to Firestore
      await saveUserProfile(user, {
        displayName:  fullName,
        baseCurrency: currency
      });

      // 4. Redirect to dashboard
      isSigningUp = false;
      window.location.href = 'dashboard.html';

    } catch (error) {
        isSigningUp = false;
      showError(friendlyError(error.code));
      setLoading('btnSignup', false);
    }
  });

// Google sign-up
btnGoogle?.addEventListener('click', async () => {
  try {
    isSigningUp = true;
    const result = await signInWithPopup(auth, googleProvider);
    const user   = result.user;

    // Only save profile if it's a brand new user
    const isNewUser = result._tokenResponse?.isNewUser;
    if (isNewUser) {
      await saveUserProfile(user, {
        name:  user.displayName || '',
        email: user.email || '',
      });
    }

    window.location.href = 'dashboard.html';

  } catch (error) {
    isSigningUp = false;

    // Ignore popup closed by user — not a real error
    if (error.code === 'auth/popup-closed-by-user' ||
        error.code === 'auth/cancelled-popup-request') {
      return;
    }

    console.error('Google sign-in error:', error.code, error.message);
    showError(friendlyError(error.code));
  }
});


// Route guard — redirect logged-in users away from signup
onAuthStateChanged(auth, (user) => {
  if (user && !isSigningUp) {
    window.location.href = 'dashboard.html';
  }
});     