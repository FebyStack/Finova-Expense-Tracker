// Background Sync Engine — Proxied via PHP to Supabase
import { initDB, dbMerge } from './db.js';
import { supabase } from './supabase-config.js';
import { getAuthHeaders } from './api.js';const STORES = ['expenses', 'income', 'budgets', 'savings', 'categories', 'notifications'];
let isSyncing = false;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_DELAYS = [5000, 15000, 45000, 120000, 300000]; // Exponential-ish backoff

/**
 * UI & STATUS HELPERS
 */
async function getUnsyncedCount() {
    let count = 0;
    const db = await initDB();
    for (const store of STORES) {
        const tx = db.transaction(store, 'readonly');
        const os = tx.objectStore(store);
        const records = await new Promise(r => {
            const req = os.getAll();
            req.onsuccess = () => r(req.result);
        });
        count += records.filter(r => r.sync_status !== 'synced').length;
    }
    return count;
}

export async function updateSyncIndicator(status, message = '') {
    const dashIndicator = document.getElementById('syncIndicator');
    const settingsStatus = document.getElementById('manualSyncStatus');
    const retryBtn = document.getElementById('btnManualSyncRetry');
    const syncBtn = document.getElementById('btnManualSync');
    
    // Status text label inside indicators
    const dashLabel = dashIndicator?.querySelector('.status-label');

    const updateEl = (el, type) => {
        if (!el) return;
        el.classList.remove('synced', 'pending', 'offline', 'error');
        if (type) el.classList.add(type);
    };

    const pendingCount = await getUnsyncedCount();

    // 1. Handle Offline State
    if (!navigator.onLine) {
        updateEl(dashIndicator, 'offline');
        if (dashIndicator) dashIndicator.title = 'Offline — changes cached locally';
        if (dashLabel) dashLabel.textContent = pendingCount > 0 ? `${pendingCount} pending` : 'Offline';
        if (settingsStatus) {
            settingsStatus.textContent = pendingCount > 0 ? `${pendingCount} pending (Offline)` : 'Offline';
            settingsStatus.style.color = 'var(--text-muted)';
        }
        if (retryBtn) retryBtn.style.display = 'none';
        if (syncBtn) syncBtn.disabled = false;
        return;
    }

    // 2. Handle Statuses
    if (status === 'synced') {
        updateEl(dashIndicator, 'synced');
        const countText = pendingCount > 0 ? `${pendingCount} pending` : 'Synced';
        if (dashIndicator) dashIndicator.title = message || (pendingCount > 0 ? `Waiting to sync ${pendingCount} changes` : 'All changes synced');
        if (dashLabel) dashLabel.textContent = countText;
        if (settingsStatus) {
            settingsStatus.textContent = pendingCount > 0 ? `ℹ️ ${pendingCount} pending` : '✓ Synced';
            settingsStatus.style.color = pendingCount > 0 ? 'var(--warning)' : 'var(--success)';
        }
        if (retryBtn) retryBtn.style.display = 'none';
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.querySelector('i')?.classList.remove('fa-spin');
        }
    } 
    else if (status === 'pending') {
        updateEl(dashIndicator, 'pending');
        if (dashIndicator) dashIndicator.title = message || 'Changes awaiting sync...';
        if (dashLabel) dashLabel.textContent = 'Syncing...';
        if (settingsStatus) {
            settingsStatus.textContent = message || 'Syncing...';
            settingsStatus.style.color = 'var(--accent)';
        }
        if (retryBtn) retryBtn.style.display = 'none';
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.querySelector('i')?.classList.add('fa-spin');
        }
    }
    else if (status === 'error') {
        updateEl(dashIndicator, 'error');
        if (dashIndicator) dashIndicator.title = message || 'Sync failed';
        if (dashLabel) dashLabel.textContent = 'Sync Error';
        if (settingsStatus) {
            settingsStatus.textContent = message || 'Sync failed';
            settingsStatus.style.color = 'var(--danger)';
        }
        if (retryBtn) retryBtn.style.display = 'inline-flex';
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.querySelector('i')?.classList.remove('fa-spin');
        }
    }
}

/**
 * CORE SYNC FUNCTIONS
 */

export async function syncAll(isManual = false) {
    if (isSyncing || !navigator.onLine) {
        if (isManual && !navigator.onLine) window.showToast?.('Cannot sync while offline. 📴', 'error');
        return;
    }

    isSyncing = true;
    console.log('🔄 Sync Engine: Gathering pending changes...');

    const syncBatch = [];
    const db = await initDB();

    try {
        for (const store of STORES) {
            const tx = db.transaction(store, 'readonly');
            const os = tx.objectStore(store);
            const records = await new Promise((resolve) => {
                const req = os.getAll();
                req.onsuccess = () => resolve(req.result);
            });

            records.forEach(r => {
                if (r.sync_status === 'pending' || r.sync_status === 'deleted') {
                    const payload = { ...r };
                    delete payload.sync_status;
                    const isLocalId = String(payload.id ?? '').startsWith('local_');
                    const localId   = r.id;
                    if (isLocalId) delete payload.id;

                    syncBatch.push({
                        table:     store,
                        action:    r.sync_status === 'deleted' ? 'delete' : 'upsert',
                        localId:   localId,
                        isLocalId: isLocalId,
                        payload:   payload
                    });
                }
            });
        }

        if (syncBatch.length === 0) {
            updateSyncIndicator('synced');
            isSyncing = false;
            retryCount = 0; // Reset on successful check
            if (isManual) window.showToast?.('Everything is up-to-date! ☁️');
            return;
        }

        updateSyncIndicator('pending', `Syncing ${syncBatch.length} changes...`);

        const authHeaders = await getAuthHeaders();
        const baseUrl = window.API_BASE_URL || '';
        const resp = await fetch(`${baseUrl}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ batch: syncBatch })
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const resData = await resp.json();

        // Detailed console logging for synchronization failures
        if (resData.errors && resData.errors.length > 0) {
            console.error('❌ Sync Engine: Some items failed to push to the database:', resData.errors);
        }

        if (resData.success && resData.applied) {
            // 1. Group by table for efficient single-transaction updates
            const tableGroups = {};
            for (const item of resData.applied) {
                if (!STORES.includes(item.table)) continue;
                if (!tableGroups[item.table]) tableGroups[item.table] = [];
                tableGroups[item.table].push(item);
            }

            // 2. Process each table in its own awaited transaction
            const updatePromises = Object.entries(tableGroups).map(([tableName, items]) => {
                return new Promise((resolveTx, rejectTx) => {
                    const txUpd = db.transaction(tableName, 'readwrite');
                    const osUpd = txUpd.objectStore(tableName);

                    items.forEach(item => {
                        if (item.status === 'deleted') {
                            osUpd.delete(item.localId);
                        } else {
                            const getReq = osUpd.get(item.localId);
                            getReq.onsuccess = () => {
                                const record = getReq.result;
                                if (!record) return;
                                
                                if (item.serverId && item.serverId !== item.localId) {
                                    osUpd.delete(item.localId);
                                    osUpd.put({ ...record, id: item.serverId, sync_status: 'synced' });
                                } else {
                                    osUpd.put({ ...record, sync_status: 'synced' });
                                }
                            };
                        }
                    });

                    txUpd.oncomplete = () => resolveTx();
                    txUpd.onerror = () => rejectTx(txUpd.error);
                });
            });

            await Promise.all(updatePromises);
            
            retryCount = 0;
            await updateSyncIndicator('synced', `Synced: ${new Date().toLocaleTimeString()}`);
            window.dispatchEvent(new Event('dashboardUpdated'));
            window.dispatchEvent(new Event('expensesUpdated'));
        } 
        else throw new Error(resData.error || 'Server rejected batch');

    } catch (err) {
        handleSyncError(err, 'push');
    } finally {
        isSyncing = false;
    }
}

export async function syncDown() {
    if (isSyncing || !navigator.onLine) return;

    console.log('🔄 Sync Engine: Pulling data from Cloud...');
    updateSyncIndicator('pending', 'Pulling cloud data...');

    try {
        const authHeaders = await getAuthHeaders();
        const baseUrl = window.API_BASE_URL || '';
        const resp = await fetch(`${baseUrl}/api/sync`, { headers: authHeaders });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const resData = await resp.json();

        if (resData.success && resData.data) {
            for (const store of STORES) {
                if (resData.data[store] && resData.data[store].length > 0) {
                    await dbMerge(store, resData.data[store]);
                }
            }
            retryCount = 0;
            updateSyncIndicator('synced', `Updated: ${new Date().toLocaleTimeString()}`);
            window.dispatchEvent(new Event('dashboardUpdated'));
            window.dispatchEvent(new Event('expensesUpdated'));
        }
        else throw new Error(resData.error || 'Cloud pull failed');

    } catch (err) {
        handleSyncError(err, 'pull');
    }
}

/**
 * ERROR HANDLING & RETRY LOGIC
 */
function handleSyncError(err, type) {
    const errorMsg = err.message || 'Unknown sync error';
    console.error(`❌ Sync Engine (${type}) failed:`, errorMsg);
    
    // Auth failures should stop immediately and notify the user
    if (errorMsg.includes('401') || errorMsg.includes('Authentication')) {
        updateSyncIndicator('error', 'Auth session expired. Please log in again.');
        window.showToast?.('Session expired. Please log in again to sync.', 'error');
        isSyncing = false;
        return;
    }

    if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount];
        const nextIn = Math.round(delay / 1000);
        retryCount++;
        
        updateSyncIndicator('error', `Retry ${retryCount}/${MAX_RETRIES} in ${nextIn}s...`);
        
        // Only show toast on the first and last retry to avoid spam
        if (retryCount === 1) {
            window.showToast?.('Sync failed. Retrying in the background...', 'warning');
        }

        setTimeout(() => {
            console.log(`🔄 Sync Engine: Retrying ${type} (${retryCount}/${MAX_RETRIES})...`);
            if (type === 'push') syncAll(); else syncDown();
        }, delay);
    } else {
        updateSyncIndicator('error', 'Sync failed after multiple attempts.');
        window.showToast?.('Sync failed repeatedly. Check your connection.', 'error');
        isSyncing = false;
    }
}

/**
 * MANUAL TRIGGERS
 */
export async function requestManualSync() {
    if (isSyncing) return;
    
    if (!navigator.onLine) {
        updateSyncIndicator('error', 'Cannot sync while offline.');
        window.showToast?.('Cannot sync while offline. 📴', 'error');
        return;
    }
    
    retryCount = 0; // Reset retries on manual push
    console.log('🚀 Manual Sync Initiated');
    await initSync(true);
}

// Expose to global for button clicks
window.manualSync = requestManualSync;

async function initSync(isManual = false) {
    if (!navigator.onLine) return;
    
    // Step 1: Push local changes
    await syncAll(isManual);
    
    // Step 2: Pull cloud changes
    await syncDown();
    
    // Step 3: Global Notification
    if (isManual && !isSyncing) {
        window.showToast?.('Sync completed successfully! ✅');
    }
}

/**
 * EVENT LISTENERS
 */
initSync();

window.addEventListener('online', () => {
    console.log('🔌 Network Restored: Initiating sync...');
    retryCount = 0;
    initSync();
});

window.addEventListener('syncStatusChange', (e) => {
    if (e.detail.status === 'pending') {
        syncAll();
    } else {
        updateSyncIndicator(e.detail.status);
    }
});

// Periodic sync every 3 minutes
setInterval(initSync, 180000);

// Periodic UI refresh every 30 seconds to update 'pending' count visibility
setInterval(() => updateSyncIndicator('synced'), 30000);

// Listen for local changes to refresh the count instantly
window.addEventListener('dashboardUpdated', () => updateSyncIndicator('synced'));
window.addEventListener('expensesUpdated', () => updateSyncIndicator('synced'));