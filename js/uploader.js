// ============================================================
// js/uploader.js
// Handles file uploads from your JS frontend to PHP backend
// Replaces Firebase Storage — drop-in for expenses.js
// ============================================================

import { auth } from './firebase-config.js';

// ── Change this to your PHP server URL ────────────────────────
const PHP_UPLOAD_URL  = 'http://localhost/your-project/upload.php';
// Production:        = 'https://yourdomain.com/upload.php';

const ALLOWED_TYPES   = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_SIZE_BYTES  = 5 * 1024 * 1024; // 5MB


// ════════════════════════════════════════════════════════════
// uploadFile()
// Main function — call this from expenses.js or any module
//
// const result = await uploadFile(file, 'receipt');
// result.filePath  → '/uploads/receipts/receipt_xxx.jpg'
// result.fileName  → 'receipt_xxx.jpg'
// result.documentId → Firestore document ID
// ════════════════════════════════════════════════════════════
export async function uploadFile(file, fileType = 'upload', onProgress = null) {

    const check = validateFile(file);
    if (!check.valid) throw new Error(check.error);

    const user = auth.currentUser;
    if (!user) throw new Error('You must be logged in to upload files.');

    // Get Firebase ID token for authenticated PHP request
    let idToken = null;
    try { idToken = await user.getIdToken(); }
    catch (e) { console.warn('Could not get ID token:', e.message); }

    const formData = new FormData();
    formData.append('file',     file);
    formData.append('userId',   user.uid);
    formData.append('fileType', fileType);
    if (idToken) formData.append('idToken', idToken);

    // Use XHR for upload progress support
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        if (onProgress) {
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            });
        }

        xhr.addEventListener('load', () => {
            try {
                const res = JSON.parse(xhr.responseText);
                if ((xhr.status === 200 || xhr.status === 207) && res.success) {
                    resolve(res);
                } else {
                    reject(new Error(res.error || 'Upload failed'));
                }
            } catch {
                reject(new Error('Invalid server response'));
            }
        });

        xhr.addEventListener('error',   () => reject(new Error('Network error')));
        xhr.addEventListener('abort',   () => reject(new Error('Upload cancelled')));
        xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));

        xhr.timeout = 30000;
        xhr.open('POST', PHP_UPLOAD_URL);
        xhr.send(formData);
    });
}


// ── Client-side validation before sending ─────────────────────
export function validateFile(file) {
    if (!file)                            return { valid: false, error: 'No file selected' };
    if (!ALLOWED_TYPES.includes(file.type)) return { valid: false, error: 'Invalid type. Use JPG, PNG, GIF, WEBP, or PDF' };
    if (file.size > MAX_SIZE_BYTES)       return { valid: false, error: 'File too large. Max size is 5MB' };
    return { valid: true };
}

// ── Human-readable file size ──────────────────────────────────
export function formatFileSize(bytes) {
    if (bytes < 1024)          return bytes + ' B';
    if (bytes < 1024 * 1024)   return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Object URL preview for images ────────────────────────────
export function getPreviewUrl(file) {
    return (file && file.type.startsWith('image/')) ? URL.createObjectURL(file) : null;
}


// ════════════════════════════════════════════════════════════
// initReceiptUploader()
// Drop-in drag-and-drop receipt upload widget
//
// Usage in expenses.js:
//   import { initReceiptUploader } from './uploader.js';
//   initReceiptUploader('receiptUploaderContainer', (result) => {
//       console.log('Uploaded to:', result.filePath);
//   });
// ════════════════════════════════════════════════════════════
export function initReceiptUploader(containerId, onComplete) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="file-upload-zone" id="uploadZone">
            <input type="file" id="fileInput" accept="image/*,.pdf" style="display:none"/>

            <div class="file-upload-idle" id="stateIdle">
                <div class="file-upload-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
                <div class="file-upload-text">
                    <span class="file-upload-title">Upload Receipt</span>
                    <span class="file-upload-sub">
                        Drag & drop or <button class="file-upload-browse" type="button">browse</button>
                    </span>
                    <span class="file-upload-hint" id="uploadHint">JPG, PNG, PDF · max 5MB</span>
                </div>
            </div>

            <div class="file-upload-uploading" id="stateUploading" style="display:none">
                <div class="file-upload-bar"><div class="file-upload-fill" id="uploadFill"></div></div>
                <span class="file-upload-pct" id="uploadPct">Uploading… 0%</span>
            </div>

            <div class="file-upload-done" id="stateDone" style="display:none">
                <i class="fa-solid fa-circle-check"></i>
                <div class="file-upload-done-info">
                    <span id="doneFileName" class="file-upload-done-name"></span>
                    <span id="doneFileSize" class="file-upload-done-size"></span>
                </div>
                <button class="file-upload-remove" id="btnRemove" type="button">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
    `;

    const zone      = container.querySelector('#uploadZone');
    const fileInput = container.querySelector('#fileInput');

    // Open file picker
    container.querySelector('.file-upload-browse').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => e.target.files[0] && handleFile(e.target.files[0]));

    // Drag and drop
    zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]);
    });

    // Remove file
    container.querySelector('#btnRemove').addEventListener('click', () => {
        fileInput.value = '';
        setState('idle');
        if (onComplete) onComplete(null);
    });

    async function handleFile(file) {
        const check = validateFile(file);
        if (!check.valid) { showError(check.error); return; }

        setState('uploading');

        try {
            const result = await uploadFile(file, 'receipt', (pct) => {
                container.querySelector('#uploadFill').style.width = pct + '%';
                container.querySelector('#uploadPct').textContent  = `Uploading… ${pct}%`;
            });

            container.querySelector('#doneFileName').textContent = result.fileName;
            container.querySelector('#doneFileSize').textContent = formatFileSize(file.size);
            setState('done');
            if (onComplete) onComplete(result);

        } catch (err) {
            showError(err.message);
            setState('idle');
        }
    }

    function setState(state) {
        container.querySelector('#stateIdle').style.display      = state === 'idle'      ? 'flex' : 'none';
        container.querySelector('#stateUploading').style.display = state === 'uploading' ? 'flex' : 'none';
        container.querySelector('#stateDone').style.display      = state === 'done'      ? 'flex' : 'none';
        zone.classList.remove('drag-over', 'upload-error');
    }

    function showError(msg) {
        const hint = container.querySelector('#uploadHint');
        zone.classList.add('upload-error');
        if (hint) { hint.textContent = '⚠ ' + msg; hint.style.color = 'var(--danger)'; }
        setTimeout(() => {
            zone.classList.remove('upload-error');
            if (hint) { hint.textContent = 'JPG, PNG, PDF · max 5MB'; hint.style.color = ''; }
        }, 3500);
    }
}