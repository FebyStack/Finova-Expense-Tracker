// js/receipts.js
// Smart Receipt Upload — Claude AI extracts date + amount
// then pre-fills the Add Expense modal for user confirmation

import { fetchExpenses } from './api.js';
import { openExpenseModal } from './expenses.js';
import { showToast }        from './expenses.js';

// ── State ──────────────────────────────────────────────────
let selectedFile        = null;
let extractedData       = null;
let uploaderInitialized = false;

// ── Category keywords for auto-detection ──────────────────
// ── Category keywords for auto-detection ──────────────────
const CATEGORY_KEYWORDS = {
  Food:          ['restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'food', 'dining', 'eat', 'kfc', 'mcdo', 'jollibee', 'mcdonald'],
  Groceries:     ['supermarket', 'grocery', 'market', 'sm', 'robinsons', 'puregold', 'savemore', 'hypermarket'],
  Transport:     ['grab', 'uber', 'taxi', 'gas', 'fuel', 'petron', 'shell', 'caltex', 'toll', 'lrt', 'mrt', 'bus'],
  Shopping:      ['mall', 'shop', 'store', 'boutique', 'zara', 'uniqlo', 'department'],
  Health:        ['pharmacy', 'hospital', 'clinic', 'drug', 'medical', 'health', 'watsons', 'mercury'],
  Bills:         ['electric', 'water', 'internet', 'meralco', 'pldt', 'globe', 'smart', 'converge', 'utility'],
  Entertainment: ['cinema', 'movie', 'netflix', 'spotify', 'game', 'theatre', 'concert'],
  Education:     ['school', 'university', 'tuition', 'book', 'bookstore', 'national bookstore'],
};

// ── Detect category from merchant name ────────────────────
function detectCategory(merchantName = '', items = []) {
  const text = (merchantName + ' ' + items.join(' ')).toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return category;
  }
  return 'Other';
}

// ════════════════════════════════════════════════════════════
// OPEN RECEIPT MODAL
// ════════════════════════════════════════════════════════════
window.openReceiptModal = async function () {
  const backdrop = document.getElementById('receiptModalBackdrop');
  if (!backdrop) return;

  // Reset everything
  selectedFile    = null;
  extractedData   = null;
  window._pendingReceiptData = null;

  resetReceiptUI();
  showReceiptStep('upload'); // Start at upload step

  backdrop.style.display = 'flex';
  requestAnimationFrame(() => backdrop.classList.add('open'));

  // Load recent expenses for dropdown
  await loadRecentExpenses();

  // Init file uploader once
  if (!uploaderInitialized) {
    initFileSelector();
    uploaderInitialized = true;
  }
};

// ── Close modal ────────────────────────────────────────────
window.closeReceiptModal = function () {
  const backdrop = document.getElementById('receiptModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  setTimeout(() => { backdrop.style.display = 'none'; }, 300);
};

// ── Steps: 'upload' | 'scanning' | 'review' | 'done' ─────
function showReceiptStep(step) {
  ['stepUpload', 'stepScanning', 'stepReview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const target = document.getElementById(`step${step.charAt(0).toUpperCase() + step.slice(1)}`);
  if (target) target.style.display = 'flex';

  // Update footer buttons
  const btnScan    = document.getElementById('btnScanReceipt');
  const btnConfirm = document.getElementById('btnConfirmReceipt');
  const btnCancel  = document.getElementById('btnCancelReceipt');

  if (btnScan)    btnScan.style.display    = step === 'upload'   ? 'flex' : 'none';
  if (btnConfirm) btnConfirm.style.display = step === 'review'   ? 'flex' : 'none';
  if (btnCancel)  btnCancel.style.display  = step === 'scanning' ? 'none' : 'flex';
}

// ════════════════════════════════════════════════════════════
// FILE SELECTOR (no PHP upload yet — just pick the file)
// ════════════════════════════════════════════════════════════
function initFileSelector() {
  const zone      = document.getElementById('receiptDropZone');
  const fileInput = document.getElementById('receiptFileInput');
  const browseBtn = document.getElementById('btnBrowseReceipt');

  if (!zone || !fileInput) return;

  browseBtn?.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelected(e.target.files[0]);
  });

  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFileSelected(e.dataTransfer.files[0]);
  });
}

function handleFileSelected(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    showReceiptError('Invalid file type. Use JPG, PNG, or PDF.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showReceiptError('File too large. Max 5MB.');
    return;
  }

  selectedFile = file;

  // Show preview
  const preview     = document.getElementById('receiptPreview');
  const previewName = document.getElementById('receiptPreviewName');
  const previewSize = document.getElementById('receiptPreviewSize');
  const previewImg  = document.getElementById('receiptPreviewImg');

  if (previewName) previewName.textContent = file.name;
  if (previewSize) previewSize.textContent = formatFileSize(file.size);

  if (file.type.startsWith('image/') && previewImg) {
    previewImg.src             = URL.createObjectURL(file);
    previewImg.style.display   = 'block';
  } else if (previewImg) {
    previewImg.style.display   = 'none';
  }

  if (preview) preview.style.display = 'flex';

  // Enable scan button
  const btnScan = document.getElementById('btnScanReceipt');
  if (btnScan) {
    btnScan.disabled  = false;
    btnScan.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Scan Receipt`;
  }

  hideReceiptError();
}

// ════════════════════════════════════════════════════════════
// SCAN RECEIPT — send image to Claude API for OCR extraction
// ════════════════════════════════════════════════════════════
window.scanReceipt = async function () {
  if (!selectedFile) {
    showReceiptError('Please select a receipt image first.');
    return;
  }

  showReceiptStep('scanning');

  try {
    // Convert file to base64
    const base64 = await fileToBase64(selectedFile);
    const mediaType = selectedFile.type;

    // Call local PHP proxy
    const response = await fetch('api/scan-receipt.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: base64,
        mime_type: mediaType
      })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || `API error: ${response.status}`);
    }

    const text = data.data?.text || '';

    // Parse JSON from response
    let parsed;
    try {
      // Strip any markdown fences just in case
      const clean = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      throw new Error('Could not parse receipt data. Please try a clearer image.');
    }

    extractedData = parsed;
    populateReviewStep(parsed);
    showReceiptStep('review');

  } catch (err) {
    console.error('Scan error:', err);
    showReceiptStep('upload');
    showReceiptError('Scan failed: ' + err.message);
  }
};

// ── Populate the review step with extracted data ───────────
function populateReviewStep(data) {
  // Merchant
  const merchantEl = document.getElementById('reviewMerchant');
  if (merchantEl) merchantEl.textContent = data.merchant || 'Unknown merchant';

  // Amount
  const amountEl = document.getElementById('reviewAmount');
  if (amountEl) {
    const symbol = getCurrencySymbol(data.currency || 'PHP');
    amountEl.textContent = data.total ? `${symbol}${parseFloat(data.total).toFixed(2)}` : 'Not detected';
    amountEl.style.color = data.total ? 'var(--success)' : 'var(--danger)';
  }

  // Date
  const dateEl = document.getElementById('reviewDate');
  if (dateEl) {
    dateEl.textContent = data.date
      ? new Date(data.date).toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })
      : 'Not detected';
    dateEl.style.color = data.date ? 'var(--text-primary)' : 'var(--danger)';
  }

  // Currency
  const currencyEl = document.getElementById('reviewCurrency');
  if (currencyEl) currencyEl.textContent = data.currency || 'PHP';

  // Items
  const itemsEl = document.getElementById('reviewItems');
  if (itemsEl) {
    if (data.items && data.items.length > 0) {
      itemsEl.innerHTML = data.items.map(i => `<span class="review-item-tag">${i}</span>`).join('');
    } else {
      itemsEl.innerHTML = '<span style="color:var(--text-muted);">No items detected</span>';
    }
  }

  // Confidence badge
  const confEl = document.getElementById('reviewConfidence');
  if (confEl) {
    const conf = data.confidence || 'low';
    const colors = { high: 'var(--success)', medium: 'var(--warning)', low: 'var(--danger)' };
    confEl.textContent  = `${conf.charAt(0).toUpperCase() + conf.slice(1)} confidence`;
    confEl.style.color  = colors[conf] || colors.low;
  }

  // Auto-detect category
  const detectedCategory = detectCategory(data.merchant, data.items || []);
  const catEl = document.getElementById('reviewCategory');
  if (catEl) catEl.textContent = detectedCategory;
}

// ── Confirm — open expense modal pre-filled ────────────────
window.confirmReceiptAndAddExpense = async function () {
  if (!extractedData) return;

  // Store extracted receipt data for saving with expense
  window._pendingReceiptData = extractedData;

  const prefill = {
    amount:   extractedData.total   || '',
    date:     extractedData.date    || new Date().toISOString().split('T')[0],
    note:     extractedData.merchant ? `Receipt: ${extractedData.merchant}` : '',
    category: detectCategory(extractedData.merchant, extractedData.items || []),
  };

  // Close receipt modal first
  closeReceiptModal();

  // Small delay then open expense modal pre-filled
  setTimeout(() => {
    openExpenseModal(prefill);

    // Show helpful toast
    showToast(
      extractedData.total
        ? `Receipt scanned! Amount ₱${parseFloat(extractedData.total).toFixed(2)} pre-filled.`
        : 'Receipt scanned! Please verify the details.',
      'success'
    );
  }, 350);
};

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function getCurrencySymbol(currency) {
  const map = { PHP:'₱', USD:'$', EUR:'€', GBP:'£', JPY:'¥', SGD:'S$', AUD:'A$' };
  return map[currency] || currency + ' ';
}

function formatFileSize(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showReceiptError(msg) {
  const el = document.getElementById('receiptError');
  const tx = document.getElementById('receiptErrorMsg');
  if (el && tx) { tx.textContent = msg; el.style.display = 'flex'; }
}

function hideReceiptError() {
  const el = document.getElementById('receiptError');
  if (el) el.style.display = 'none';
}

function resetReceiptUI() {
  selectedFile  = null;
  extractedData = null;

  const fileInput   = document.getElementById('receiptFileInput');
  const preview     = document.getElementById('receiptPreview');
  const btnScan     = document.getElementById('btnScanReceipt');

  if (fileInput) fileInput.value = '';
  if (preview)   preview.style.display = 'none';
  if (btnScan) {
    btnScan.disabled  = true;
    btnScan.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Scan Receipt`;
  }

  hideReceiptError();
}

async function loadRecentExpenses() {
  const user = window.currentUser;
  if (!user) return;

  const select = document.getElementById('receiptExpenseLink');
  if (!select) return;
  select.innerHTML = '<option value="">— Select an expense —</option>';

  try {
    const expenses = await fetchExpenses(user.uid);
    expenses.slice(0, 20).forEach((d) => {
      const option = document.createElement('option');
      option.value = d.id;
      option.textContent = `${d.category || 'Expense'} — ${d.currency || '₱'}${parseFloat(d.amount || 0).toFixed(2)} (${d.date || ''})`;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Could not load expenses:', err);
  }
}

// ── Keyboard + backdrop close ──────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeReceiptModal();
});

document.getElementById('receiptModalBackdrop')
  ?.addEventListener('click', (e) => {
    if (e.target.id === 'receiptModalBackdrop') closeReceiptModal();
  });