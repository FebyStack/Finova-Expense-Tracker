// js/settings.js
// Settings page — Category management + Base currency

import { auth, db } from './firebase-config.js';
import { doc, updateDoc }
  from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  loadCategories, saveCategories, invalidateCache,
  ICON_OPTIONS, COLOR_OPTIONS, bgFromColor
} from './categories.js';

const API_BASE = window.location.hostname === 'localhost'
  ? '/Finova-Expense-Tracker/api'   // XAMPP
  : '/api';

let editingIndex = null;

// ══════════════════════════════════════════════════════════
// BASE CURRENCY
// ══════════════════════════════════════════════════════════

async function saveBaseCurrency() {
  const user = auth.currentUser;
  if (!user) return;

  const select  = document.getElementById('settingsBaseCurrency');
  const status  = document.getElementById('currencySaveStatus');
  const btn     = document.getElementById('btnSaveBaseCurrency');
  const newCurrency = select.value;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  if (status) status.textContent = '';

  try {
    // Update PostgreSQL
    const res = await fetch(`${API_BASE}/users.php?uid=${user.uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, baseCurrency: newCurrency }),
    });
    if (!res.ok) throw new Error('API error');

    // Update Firestore
    await updateDoc(doc(db, 'users', user.uid), { baseCurrency: newCurrency });

    // Update global
    window.userCurrency = newCurrency;

    if (status) {
      status.textContent = '✓ Saved';
      status.style.color = 'var(--success)';
      setTimeout(() => { status.textContent = ''; }, 3000);
    }

    showCatToast(`Base currency changed to ${newCurrency}`);

    // Refresh dashboard
    if (window.refreshDashboard) window.refreshDashboard();

  } catch (err) {
    console.error('Save currency error:', err);
    if (status) {
      status.textContent = '✗ Failed';
      status.style.color = 'var(--danger)';
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Save</span>';
  }
}

// ══════════════════════════════════════════════════════════
// CATEGORY MANAGEMENT
// ══════════════════════════════════════════════════════════

// ── Render category list ───────────────────────────────────
async function renderCategoryList() {
  const container = document.getElementById('categoryList');
  if (!container) return;

  const categories = await loadCategories();

  if (categories.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-tag"></i><span class="empty-state-title">No categories yet</span></div>`;
    return;
  }

  container.innerHTML = categories.map((cat, i) => `
    <div class="cat-mgmt-item" data-index="${i}">
      <div class="cat-mgmt-icon" style="background:${bgFromColor(cat.color)}; color:${cat.color};">
        <i class="${cat.icon}"></i>
      </div>
      <span class="cat-mgmt-name">${cat.name}</span>
      <div class="cat-mgmt-color-dot" style="background:${cat.color};" title="${cat.color}"></div>
      <div class="cat-mgmt-actions">
        <button class="expense-action-btn edit" title="Edit" onclick="editCategory(${i})">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="expense-action-btn delete" title="Delete" onclick="deleteCategory(${i})">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

// ── Build icon picker ──────────────────────────────────────
function buildIconPicker(selectedIcon = '') {
  const grid = document.getElementById('catIconPicker');
  if (!grid) return;
  grid.innerHTML = ICON_OPTIONS.map(icon => `
    <button type="button" class="icon-pick-btn ${icon === selectedIcon ? 'selected' : ''}"
      data-icon="${icon}" onclick="pickCatIcon(this)">
      <i class="${icon}"></i>
    </button>
  `).join('');
}

// ── Build color picker ─────────────────────────────────────
function buildColorPicker(selectedColor = '') {
  const grid = document.getElementById('catColorPicker');
  if (!grid) return;
  grid.innerHTML = COLOR_OPTIONS.map(c => `
    <button type="button" class="color-pick-btn ${c === selectedColor ? 'selected' : ''}"
      data-color="${c}" style="background:${c};" onclick="pickCatColor(this)">
      ${c === selectedColor ? '<i class="fa-solid fa-check" style="color:#fff;font-size:10px;"></i>' : ''}
    </button>
  `).join('');
}

// ── Globals for picker selection ───────────────────────────
window.pickCatIcon = function(el) {
  document.querySelectorAll('.icon-pick-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
};

window.pickCatColor = function(el) {
  document.querySelectorAll('.color-pick-btn').forEach(b => {
    b.classList.remove('selected');
    b.innerHTML = '';
  });
  el.classList.add('selected');
  el.innerHTML = '<i class="fa-solid fa-check" style="color:#fff;font-size:10px;"></i>';
};

// ── Open add/edit form ─────────────────────────────────────
function openCategoryForm(cat = null, index = null) {
  editingIndex = index;
  const form = document.getElementById('catFormSection');
  const title = document.getElementById('catFormTitle');
  const nameInput = document.getElementById('catNameInput');
  const saveBtn = document.getElementById('btnSaveCategory');

  if (cat) {
    title.textContent = 'Edit Category';
    nameInput.value = cat.name;
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Update';
    buildIconPicker(cat.icon);
    buildColorPicker(cat.color);
  } else {
    title.textContent = 'New Category';
    nameInput.value = '';
    saveBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add';
    buildIconPicker();
    buildColorPicker(COLOR_OPTIONS[0]);
    document.querySelector('.color-pick-btn')?.click();
  }

  form.classList.add('open');
  nameInput.focus();
}

function closeCategoryForm() {
  const form = document.getElementById('catFormSection');
  form?.classList.remove('open');
  editingIndex = null;
}

// ── Save category ──────────────────────────────────────────
async function saveCategoryFromForm() {
  const name = document.getElementById('catNameInput').value.trim();
  if (!name) { showCatError('Category name is required.'); return; }

  const selectedIcon = document.querySelector('.icon-pick-btn.selected')?.dataset.icon;
  const selectedColor = document.querySelector('.color-pick-btn.selected')?.dataset.color;

  if (!selectedIcon) { showCatError('Please select an icon.'); return; }
  if (!selectedColor) { showCatError('Please select a color.'); return; }

  const categories = await loadCategories();
  const dupIndex = categories.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
  if (dupIndex !== -1 && dupIndex !== editingIndex) { showCatError(`"${name}" already exists.`); return; }

  if (editingIndex !== null) {
    categories[editingIndex] = { name, icon: selectedIcon, color: selectedColor };
  } else {
    categories.push({ name, icon: selectedIcon, color: selectedColor });
  }

  try {
    await saveCategories(categories);
    invalidateCache();
    closeCategoryForm();
    renderCategoryList();
    showCatToast(editingIndex !== null ? 'Category updated!' : 'Category added!');
  } catch (err) {
    showCatError('Failed to save. Please try again.');
  }
}

// ── Delete ─────────────────────────────────────────────────
window.deleteCategory = async function(index) {
  const categories = await loadCategories();
  const cat = categories[index];
  if (!cat) return;

  const overlay = document.createElement('div');
  overlay.id = 'confirmDialogOverlay';
  overlay.className = 'confirm-dialog-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-dialog-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <h3 class="confirm-dialog-title">Delete Category</h3>
      <p class="confirm-dialog-message">Delete <strong>"${cat.name}"</strong>? Existing expenses using this category will keep their label.</p>
      <div class="confirm-dialog-actions">
        <button class="btn btn-ghost" id="confirmDialogCancel">Cancel</button>
        <button class="btn btn-danger" id="confirmDialogConfirm"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 250); };
  document.getElementById('confirmDialogCancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  document.getElementById('confirmDialogConfirm').addEventListener('click', async () => {
    close();
    categories.splice(index, 1);
    await saveCategories(categories);
    invalidateCache();
    renderCategoryList();
    showCatToast('Category deleted');
  });
};

// ── Edit ───────────────────────────────────────────────────
window.editCategory = async function(index) {
  const categories = await loadCategories();
  openCategoryForm(categories[index], index);
};

// ── Error / Toast helpers ──────────────────────────────────
function showCatError(msg) {
  const box = document.getElementById('catError');
  const text = document.getElementById('catErrorText');
  if (box && text) { text.textContent = msg; box.style.display = 'flex'; }
}

function showCatToast(msg) {
  document.getElementById('appToast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'appToast';
  toast.className = 'toast toast-success';
  toast.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${msg}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ══════════════════════════════════════════════════════════
// INITIALIZE
// ══════════════════════════════════════════════════════════

export async function initSettings() {
  // Set currency selector to current value
  const currSel = document.getElementById('settingsBaseCurrency');
  if (currSel) currSel.value = window.userCurrency || 'PHP';

  await renderCategoryList();

  // Base currency save
  document.getElementById('btnSaveBaseCurrency')?.addEventListener('click', saveBaseCurrency);

  // Category management
  document.getElementById('btnNewCategory')?.addEventListener('click', () => openCategoryForm());
  document.getElementById('btnSaveCategory')?.addEventListener('click', saveCategoryFromForm);
  document.getElementById('btnCancelCategory')?.addEventListener('click', closeCategoryForm);
  document.getElementById('catFormSection')?.querySelector('.cat-form-close')
    ?.addEventListener('click', closeCategoryForm);
}

