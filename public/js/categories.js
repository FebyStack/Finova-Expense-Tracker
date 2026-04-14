import { dbSave, dbGetAll } from './db.js';

// Central category management
// Migrated from localStorage to IndexedDB (db.js) for Cloud Sync support.

// ── Icon palette (FA icons users can pick from) ────────────
export const ICON_OPTIONS = [
  'fa-solid fa-utensils',       'fa-solid fa-car',
  'fa-solid fa-bag-shopping',   'fa-solid fa-file-invoice',
  'fa-solid fa-heart-pulse',    'fa-solid fa-tv',
  'fa-solid fa-graduation-cap', 'fa-solid fa-piggy-bank',
  'fa-solid fa-repeat',         'fa-solid fa-plane',
  'fa-solid fa-cart-shopping',   'fa-solid fa-circle-dot',
  'fa-solid fa-house',           'fa-solid fa-shirt',
  'fa-solid fa-dumbbell',        'fa-solid fa-gas-pump',
  'fa-solid fa-baby',            'fa-solid fa-dog',
  'fa-solid fa-wifi',            'fa-solid fa-gift',
  'fa-solid fa-mug-hot',         'fa-solid fa-gamepad',
  'fa-solid fa-music',           'fa-solid fa-book',
  'fa-solid fa-stethoscope',     'fa-solid fa-wrench',
  'fa-solid fa-palette',         'fa-solid fa-scissors',
  'fa-solid fa-plug',            'fa-solid fa-umbrella',
];

// ── Color palette ──────────────────────────────────────────
export const COLOR_OPTIONS = [
  '#f59e0b', '#2196f3', '#e91e63', '#9c27b0',
  '#4caf50', '#00bcd4', '#3f51b5', '#ffc107',
  '#7c3aed', '#0284c7', '#16a34a', '#9aa0b0',
  '#ef6c00', '#e53935', '#6366f1', '#0d9488',
  '#db2777', '#059669', '#d97706', '#7c2d12',
];

// ── Default categories (used when user has none set) ───────
const DEFAULT_CATEGORIES = [
  { name: 'Food',          icon: 'fa-solid fa-utensils',       color: '#f59e0b' },
  { name: 'Transport',     icon: 'fa-solid fa-car',            color: '#2196f3' },
  { name: 'Shopping',      icon: 'fa-solid fa-bag-shopping',   color: '#e91e63' },
  { name: 'Bills',         icon: 'fa-solid fa-file-invoice',   color: '#9c27b0' },
  { name: 'Health',        icon: 'fa-solid fa-heart-pulse',    color: '#4caf50' },
  { name: 'Entertainment', icon: 'fa-solid fa-tv',             color: '#00bcd4' },
  { name: 'Education',     icon: 'fa-solid fa-graduation-cap', color: '#3f51b5' },
  { name: 'Savings',       icon: 'fa-solid fa-piggy-bank',     color: '#ffc107' },
  { name: 'Subscriptions', icon: 'fa-solid fa-repeat',         color: '#7c3aed' },
  { name: 'Travel',        icon: 'fa-solid fa-plane',          color: '#0284c7' },
  { name: 'Groceries',     icon: 'fa-solid fa-cart-shopping',  color: '#16a34a' },
  { name: 'Other',         icon: 'fa-solid fa-circle-dot',     color: '#9aa0b0' },
];

// ── Cache ──────────────────────────────────────────────────
let cachedCategories = null;

// ── Helper: generate a light background from the color ─────
export function bgFromColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

// ── Migration Helper ────────────────────────
async function migrateFromLegacy(uid) {
  const key = 'finova_categories_' + uid;
  const legacy = localStorage.getItem(key);
  if (legacy) {
    try {
      const cats = JSON.parse(legacy);
      console.log('[Categories] Migrating legacy categories to syncable store...');
      await saveCategories(cats);
      localStorage.removeItem(key); // Cleanup
      return true;
    } catch (e) {
      console.error('[Categories] Migration failed:', e);
    }
  }
  return false;
}

// ── Load categories ─────────────────────────
export async function loadCategories(forceRefresh = false) {
  if (cachedCategories && !forceRefresh) return cachedCategories;

  const user = window.currentUser;
  if (!user) return DEFAULT_CATEGORIES;

  try {
    // 1. Try to migrate if first time
    await migrateFromLegacy(user.uid);

    // 2. Fetch from IndexedDB
    const all = await dbGetAll('categories');
    
    // Categories table should have exactly one record for this app instance.
    // We check for the fixed ID 'user_categories' or matching user_id.
    const currentUid = user.id || user.uid;
    const userCats = all.find(r => 
      r.id === 'user_categories' || 
      String(r.user_id) === String(currentUid) ||
      (r.items && r.items.length > 0) // Final fallback: take any record with data
    );

    if (userCats && userCats.items && userCats.items.length > 0) {
      console.log('[Categories] Successfully loaded custom categories.');
      cachedCategories = userCats.items;
    } else {
      // First time — seed defaults into IndexedDB
      console.log('[Categories] No custom categories found, seeding defaults...');
      cachedCategories = [...DEFAULT_CATEGORIES];
      await saveCategories(cachedCategories);
    }
  } catch (err) {
    console.warn('[Categories] Load failed, using defaults:', err);
    cachedCategories = [...DEFAULT_CATEGORIES];
  }

  return cachedCategories;
}

// ── Save categories ───────────────────────────
export async function saveCategories(categories) {
  const user = window.currentUser;
  if (!user) return;

  const uid = user.id || user.uid;
  cachedCategories = categories;

  try {
    // We use a fixed ID like 'user_categories' so that it always maps to the same record
    const record = {
      id: 'user_categories',
      user_id: uid,
      items: categories
    };
    await dbSave('categories', record);
    console.log('[Categories] Saved and queued for sync');
  } catch (err) {
    console.error('Failed to save categories:', err);
    throw err;
  }
}

// ── Get category style for rendering ───────────────────────
export function getCategoryStyle(name) {
  const cats = cachedCategories || DEFAULT_CATEGORIES;
  const found = cats.find(c => c.name === name);
  if (found) return { icon: found.icon, color: found.color, bg: bgFromColor(found.color) };
  return { icon: 'fa-solid fa-circle-dot', color: '#9aa0b0', bg: bgFromColor('#9aa0b0') };
}

// ── Get default categories (sync, no Firestore) ────────────
export function getDefaults() {
  return DEFAULT_CATEGORIES;
}

// ── Invalidate cache ───────────────────────────────────────
export function invalidateCache() {
  cachedCategories = null;
}
