// js/signup.js
// Sign-up page UI & validation — Supabase SDK
import { supabase } from './supabase-config.js';
import { checkAuth } from './auth.js';

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
  setTimeout(() => { if (errorBox) errorBox.style.display = 'none'; }, 5000);
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

function setLoading(btnId, isLoading, defaultHTML) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled  = isLoading;
  btn.innerHTML = isLoading
    ? `<i class="fa-solid fa-spinner fa-spin"></i> Please wait…`
    : defaultHTML;
}

// ── Email / Password sign-up handler (Supabase SDK) ──────────
document.getElementById('btnSignup')
  ?.addEventListener('click', async () => {
    if (!validateForm()) return;

    const firstName = document.getElementById('inputFirstName').value.trim();
    const lastName  = document.getElementById('inputLastName').value.trim();
    const email     = document.getElementById('inputEmail').value.trim();
    const password  = document.getElementById('inputPassword').value;
    const currency  = document.getElementById('inputCurrency')?.value || 'PHP';

    const defaultHTML = `<span class="btn-label" data-text="SIGN UP">Create Account</span> <i class="fa-solid fa-arrow-right"></i>`;
    setLoading('btnSignup', true, defaultHTML);

    try {
      if (!navigator.onLine) {
        throw new Error('You must be online to create an account for the first time.');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: `${firstName} ${lastName}`,
            base_currency: currency,
            full_name: `${firstName} ${lastName}`,
            first_name: firstName,
            last_name: lastName
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        console.log('[Signup] Successful:', data.user.email);
        // Show success modal instead of browser alert
        const modal = document.getElementById('signupSuccessModal');
        if (modal) {
          modal.classList.add('active');
          document.getElementById('btnModalGoLogin')?.addEventListener('click', () => {
            window.location.replace('login.html');
          });
        } else {
          window.location.replace('login.html');
        }
      }

    } catch (err) {
      console.error('[Signup] Error:', err.message);
      showError(err.message || 'Registration failed. Please try again.');
      setLoading('btnSignup', false, defaultHTML);
    }
  });


// Route guard — redirect logged-in users away from signup
async function init() {
    const user = await checkAuth();
    if (user) {
        window.location.replace('dashboard.html');
    }
}

init();