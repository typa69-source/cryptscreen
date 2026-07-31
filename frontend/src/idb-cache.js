// ═══════════════════════════════════════════════════════════════
//  IndexedDB cache
// ═══════════════════════════════════════════════════════════════
//
// Tiny, dependency-free wrapper around IndexedDB for caching
// short-lived JSON blobs (24h ticker, exchange symbols, ...).
//
// Why: the first paint of the screener depends on `/exchangeInfo` and
// `/ticker/24hr` from Binance. Caching the response in IDB lets us
// render rows immediately from cache while fresh data is fetched in
// the background. Typical cold-start improves from ~3s to ~50ms.
//
// API:
//   await cacheGet(key)                          -> { ts, data } | null
//   await cacheSet(key, data, ttlMs)             -> void
//   cacheGetSync(key) (non-IDB fallback only)    -> null  (no-op in browsers w/o IDB)
//
// In non-browser environments (tests, SSR) every call resolves to null
// so importing this file is always safe.

const DB_NAME = 'cs_cache';
const DB_VERSION = 1;
const STORE = 'kv';

let _dbPromise = null;
let _hasIDB = typeof indexedDB !== 'undefined';

function openDb() {
  if (!_hasIDB) return Promise.reject(new Error('no_idb'));
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb_open_failed'));
    req.onblocked = () => reject(new Error('idb_blocked'));
  }).catch((e) => {
    _dbPromise = null;
    _hasIDB = false;
    throw e;
  });
  return _dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export function cacheHasIDB() {
  return _hasIDB;
}

export async function cacheGet(key) {
  if (!_hasIDB) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = tx(db, 'readonly').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function cacheSet(key, data, ttlMs = 5 * 60 * 1000) {
  if (!_hasIDB) return;
  try {
    const db = await openDb();
    const payload = { ts: Date.now(), exp: Date.now() + ttlMs, data };
    await new Promise((resolve, reject) => {
      const req = tx(db, 'readwrite').put(payload, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Cache write is best-effort. Swallow errors so they never break init.
  }
}

// Convenience: returns cached `data` if present and not expired, else null.
// Caller is responsible for refetching and updating via cacheSet.
export async function cacheGetFresh(key, maxAgeMs = 5 * 60 * 1000) {
  const entry = await cacheGet(key);
  if (!entry) return null;
  if (typeof entry.ts !== 'number') return null;
  if (Date.now() - entry.ts > maxAgeMs) return null;
  return entry.data;
}
