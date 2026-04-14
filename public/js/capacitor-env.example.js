/**
 * public/js/capacitor-env.example.js
 * 
 * INSTRUCTIONS:
 * 1. Duplicate this file and rename it to 'capacitor-config.js'.
 * 2. Update the 'apiBaseUrl' with your computer's local IP address or your production URL.
 * 3. Update the Supabase credentials with your own keys.
 */

const NATIVE_CONFIG = {
    // Your PC's Local IP Address (e.g., 'http://192.168.1.12:3001')
    apiBaseUrl: 'YOUR_BACKEND_URL_HERE', 
    
    // Supabase Credentials (found in your Supabase dashboard)
    supabaseUrl: 'YOUR_SUPABASE_URL_HERE',
    supabaseKey: 'YOUR_SUPABASE_ANON_KEY_HERE' 
};

// ... Rest of the logic remains the same ...
window.isNativeApp = window.hasOwnProperty('Capacitor');
if (window.isNativeApp) {
    window.API_BASE_URL = NATIVE_CONFIG.apiBaseUrl;
    if (!window.SUPABASE_CONFIG) {
        window.SUPABASE_CONFIG = { url: NATIVE_CONFIG.supabaseUrl, anonKey: NATIVE_CONFIG.supabaseKey };
    }
} else {
    window.API_BASE_URL = ''; 
}
