// js/auth.js
// Handles user login via Supabase SDK with offline session support
import { supabase } from './supabase-config.js';
// Supports offline login via localStorage cache (PWA-friendly)

// ── UI Helpers ─────────────────────────────────────────────
function showError(message) {
  const errorBox  = document.getElementById('authError');
  const errorText = document.getElementById('authErrorText');
  if (!errorBox || !errorText) return;
  errorText.textContent  = message;
  errorBox.style.display = 'flex';
  console.error('Auth Error:', message);
  // Auto-hide after 5s
  setTimeout(() => { if (errorBox) errorBox.style.display = 'none'; }, 5000);
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
  if (!inputPassword) return;
  const visible = inputPassword.type === 'text';
  inputPassword.type = visible ? 'password' : 'text';
  if (togglePasswordIcon) {
    togglePasswordIcon.className = visible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
  }
});

// ── Email / Password Sign-In (Supabase SDK) ─────────────────
document.getElementById('btnEmailLogin')
  ?.addEventListener('click', async () => {
    const email    = document.getElementById('inputEmail')?.value.trim();
    const password = document.getElementById('inputPassword')?.value;
    const defaultHTML = `<span class="btn-label" data-type="SIGN IN">Sign In</span> <i class="fa-solid fa-arrow-right"></i>`;

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    setLoading('btnEmailLogin', true, defaultHTML);

    try {
      // 1. Attempt login via Supabase SDK
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        // If offline and login fails, check if we have a CACHED session already in SDK
        if (!navigator.onLine) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.user.email.toLowerCase() === email.toLowerCase()) {
                console.log('[Auth] Offline session verified for:', session.user.email);
                window.location.replace('dashboard.html');
                return;
            }
            throw new Error('You are offline. Please connect to the internet to sign in.');
        }
        throw error;
      }

      if (data.session) {
        console.log('[Auth] Login successful:', data.user.email);
        window.location.replace('dashboard.html');
      }

    } catch (err) {
      console.error('[Auth] Error:', err.message);
      
      let msg = err.message || 'Invalid email or password.';
      if (msg.includes('Email not confirmed')) {
          msg = 'Please check your email inbox to confirm your account before logging in.';
      }

      showError(msg);
      setLoading('btnEmailLogin', false, defaultHTML);
    }
  });

/**
 * Robust Auth Guard (PWA-friendly)
 * Returns the session if valid (online or offline)
 */
export async function checkAuth() {
    return new Promise(async (resolve) => {
        let resolved = false;

        // OFFLINE QUICK-PATH
        if (!navigator.onLine) {
            try {
                const keys = Object.keys(localStorage);
                const authKey = keys.find(k => k.includes('-auth-token'));
                const raw = authKey ? localStorage.getItem(authKey) : null;
                if (raw) {
                    const data = JSON.parse(raw);
                    if (data && data.user) {
                        console.log('[Auth Guard] Offline session recovered.');
                        resolve(data.user);
                        return;
                    }
                }
            } catch (e) {}
        }

        // SDK Attempt
        supabase.auth.getSession().then(({ data: { session }, error }) => {
            if (resolved) return;
            if (error || !session) return;
            resolved = true;
            resolve(session.user);
        }).catch(() => {});

        // Timeout + Fallback 
        const timeoutMs = navigator.onLine ? 4000 : 500;
        setTimeout(() => {
            if (resolved) return;
            resolved = true;
            
            // Final check of Supabase storage
            try {
                const keys = Object.keys(localStorage);
                const authKey = keys.find(k => k.includes('-auth-token'));
                const raw = authKey ? localStorage.getItem(authKey) : null;
                if (raw) {
                    const data = JSON.parse(raw);
                    if (data && data.user) {
                        resolve(data.user);
                        return;
                    }
                }
            } catch (e) {}
            
            resolve(null);
        }, timeoutMs);
    });
}

// ── Forgot Password ────────────────────────────────────────
document.getElementById('linkForgot')
  ?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Please contact your administrator to reset your password.');
  });