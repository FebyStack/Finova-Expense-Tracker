// js/db.js
// Unified Data Layer - IndexedDB (Offline-first source of truth)
// This version is decoupled from direct Supabase SDK for writes, 
// relying on the background sync engine via events.

const DB_NAME = 'FinovaDB';
const DB_VERSION = 5; 

const STORES = ['expenses', 'income', 'budgets', 'savings', 'categories', 'notifications'];

/**
 * Data Compression Helpers
 */
async function compress(data) {
  const json = JSON.stringify(data);
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

async function decompress(buffer) {
  try {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  } catch (e) {
    return null; // Fallback handled in dbGetAll
  }
}

/**
 * Initializes IndexedDB
 */
export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      STORES.forEach(store => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error('IndexedDB init error:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Generic Save (Add/Edit)
 * Always writes to IDB first, then triggers the sync engine.
 */
export async function dbSave(store, data) {
  const db = await initDB();
  const timestamp = new Date().toISOString();
  
  // Ensure metadata for sync
  const record = {
    ...data,
    updated_at: timestamp,
    sync_status: 'pending' 
  };

  if (!record.id) {
    record.id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 1. Determine the Correct ID Type (Read Only)
  let finalId = record.id;
  if (!String(finalId).startsWith('local_')) {
      const checkTx = db.transaction(store, 'readonly');
      const os = checkTx.objectStore(store);
      
      const tryGet = (lid) => new Promise(r => {
          const rq = os.get(lid);
          rq.onsuccess = () => r(rq.result);
          rq.onerror = () => r(null);
      });

      const existingExact = await tryGet(finalId);
      if (!existingExact) {
          if (typeof finalId === 'string' && /^\d+$/.test(finalId)) {
              if (await tryGet(parseInt(finalId, 10))) finalId = parseInt(finalId, 10);
          } else if (typeof finalId === 'number') {
              if (await tryGet(String(finalId))) finalId = String(finalId);
          }
      }
  }
  
  // 2. Prepare Data (Compression is Async - MUST BE OUTSIDE WRITING TX)
  record.id = finalId;
  const { id, updated_at, sync_status, ...payload } = record;
  const compressedData = await compress(payload);
  
  const storageRecord = {
    id, 
    updated_at, 
    sync_status, 
    _data: compressedData,
    compressed: true
  };

  // 3. Perform final WRITE (Short-lived Transaction)
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  await new Promise((resolve, reject) => {
    const request = os.put(storageRecord);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  console.log(`Local save successful in ${store}:`, record.id);

  // 4. Notify Sync Engine
  window.dispatchEvent(new CustomEvent('syncStatusChange', { 
      detail: { status: 'pending', store, id: record.id } 
  }));

  return record;
}

/**
 * Generic Delete
 */
export async function dbDelete(store, id) {
  const db = await initDB();
  
  // If it was a local-only record that never hit the server, just delete it immediately
  if (String(id).startsWith('local_')) {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    return;
  }

  // 1. Find Record Type-Resiliently (Read Session)
  const lookupTx = db.transaction(store, 'readonly');
  const storeObj = lookupTx.objectStore(store);
  
  const tryGet = async (lookupId) => {
    return new Promise((resolve) => {
      const req = storeObj.get(lookupId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  };

  let record = await tryGet(id);
  let finalId = id;

  if (!record && typeof id === 'string' && /^\d+$/.test(id)) {
      record = await tryGet(parseInt(id, 10));
      if (record) finalId = parseInt(id, 10);
  } else if (!record && typeof id === 'number') {
      record = await tryGet(String(id));
      if (record) finalId = String(id);
  }

  if (record) {
    // 2. Perform final WRITE (Short-lived Transaction)
    const writeTx = db.transaction(store, 'readwrite');
    const writeStore = writeTx.objectStore(store);
    
    record.sync_status = 'deleted';
    record.updated_at = new Date().toISOString();
    writeStore.put(record);
    
    console.log(`Marked for deletion in ${store}:`, finalId);
    
    // 3. Notify Sync Engine
    window.dispatchEvent(new CustomEvent('syncStatusChange', { 
        detail: { status: 'pending', store, id: finalId, action: 'delete' } 
    }));
  } else {
    console.warn(`[dbDelete] Record not found for ID ${id} in ${store}`);
  }
}

/**
 * Generic Get All
 * Returns records from IDB, excluding those marked as deleted.
 */
export async function dbGetAll(store, filters = {}) {
  const db = await initDB();
  
  // 1. Fetch raw records from IDB (Synchronous Transaction)
  const rawRecords = await new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // 2. Perform Decompression (Asynchronous - OUTSIDE of transaction)
  const decompressedRecords = [];
  for (let r of rawRecords) {
    if (r.compressed && r._data) {
      const data = await decompress(r._data);
      if (data) {
        const { _data, compressed, ...rest } = r;
        decompressedRecords.push({ ...rest, ...data });
      } else {
        decompressedRecords.push(r);
      }
    } else {
      decompressedRecords.push(r);
    }
  }

  // 3. Filter and Sort
  let results = decompressedRecords.filter(r => r.sync_status !== 'deleted');
  
  if (filters.month) {
    results = results.filter(r => r.month === filters.month);
  }
  if (filters.category) {
    results = results.filter(r => r.category === filters.category);
  }
  if (filters.recurring !== undefined) {
    results = results.filter(r => !!r.recurring === !!filters.recurring);
  }
  
  results.sort((a, b) => new Date(b.date || b.updated_at) - new Date(a.date || a.updated_at));
  
  return results;
}

/**
 * Merges fresh data from the server into IDB.
 * This is used when the dashboard or page refreshes.
 */
export async function dbMerge(store, remoteData) {
  const db = await initDB();
  
  // 1. Get all local records first to compare timestamps
  const localRecords = await dbGetAll(store);
  const localMap = new Map(localRecords.map(r => [r.id, r]));

  // 2. Prepare updates (Async - outside of transaction)
  const preparedUpdates = [];
  for (const remote of remoteData) {
    const local = localMap.get(remote.id);
    
    // Only update if local is missing or remote is newer
    if (!local || new Date(remote.updated_at) > new Date(local.updated_at)) {
      const { id, updated_at, sync_status, ...payload } = remote;
      const compressedData = await compress(payload);
      preparedUpdates.push({
        id,
        updated_at,
        sync_status: 'synced',
        _data: compressedData,
        compressed: true
      });
    }
  }

  // 3. Perform batch update in a single transaction
  if (preparedUpdates.length > 0) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      
      preparedUpdates.forEach(record => {
        os.put(record);
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/**
 * Storage Quota Monitor
 */
export async function checkStorage() {
  if (navigator.storage && navigator.storage.estimate) {
    const quota = await navigator.storage.estimate();
    const usedMB = (quota.usage / (1024 * 1024)).toFixed(2);
    const totalMB = (quota.quota / (1024 * 1024)).toFixed(2);
    console.log(`[Storage] Used: ${usedMB} MB / Total: ${totalMB} MB (${Math.round((quota.usage/quota.quota)*100)}%)`);
  }
}

/**
 * Auto-Archive Old Records (> 30 days)
 */
export async function archiveOldRecords() {
  const STORES_TO_ARCHIVE = ['expenses', 'income', 'notifications'];
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  if (!navigator.onLine) {
    console.log('[Archive] Device offline, skipping archiving cycle.');
    return;
  }

  let totalArchived = 0;

  for (const store of STORES_TO_ARCHIVE) {
    const allRecords = await dbGetAll(store);
    const oldRecords = allRecords.filter(r => {
      const date = new Date(r.updated_at || r.date).getTime();
      return (now - date) > THIRTY_DAYS_MS;
    });

    if (oldRecords.length === 0) continue;

    console.log(`[Archive] Found ${oldRecords.length} old records in ${store}. Archiving...`);

    const payload = oldRecords.map(r => ({
      id: r.id,
      table_name: store,
      data: r
    }));

    try {
      const response = await fetch('api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        // Delete archived records locally
        const db = await initDB();
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        
        for (const record of oldRecords) {
          os.delete(record.id);
        }
        
        totalArchived += oldRecords.length;
        console.log(`[Archive] Successfully archived ${oldRecords.length} records from ${store}.`);
      } else {
        console.error(`[Archive] Server rejected archive for ${store}:`, await response.text());
      }
    } catch (err) {
      console.error(`[Archive] Error connecting to archive endpoint for ${store}:`, err);
    }
  }

  if (totalArchived > 0) {
    console.log(`[Archive] Completed! Total records cleaned: ${totalArchived}`);
  }
}
