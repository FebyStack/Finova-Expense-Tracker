// js/supabase-config.js
// Synchronously initializes the Supabase client using credentials injected into the global scope
// by api/config-js (which reads from .env)

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const config = window.SUPABASE_CONFIG || {};

if (!config.url || !config.anonKey) {
    console.error('Supabase Configuration Error: Credentials not found in global scope.');
    console.warn('Ensure <script src="api/config-js"></script> is included in the head.');
}

export const supabase = createClient(config.url || '', config.anonKey || '', {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'finova-auth-token',
        storage: window.localStorage
    }
});

console.log('Supabase Initialized from .env config');
