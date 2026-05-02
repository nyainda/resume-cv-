// services/storage/AppDataPersistence.ts
// IndexedDB mirror for ALL app data (not just auth).
//
// Why: localStorage is wiped by "Clear cache + site data".
//      IndexedDB survives "Clear cache" (only cleared by "Clear cookies & site data").
//
// Strategy:
//   - Every write goes to BOTH localStorage (fast sync) AND IndexedDB (persistent).
//   - Every read tries localStorage first (instant), falls back to IndexedDB.
//   - On load, if localStorage is empty (cache cleared) we restore from IndexedDB.
//
// Quota handling:
//   - If IDB write fails with QuotaExceededError, we evict the largest
//     non-critical entries and retry once. If it still fails we log a warning
//     but never crash — localStorage still has the data.

const DB_NAME = 'cv_builder_appdata';
const DB_VERSION = 1;
const STORE = 'kv';

// Keys we can safely evict from IDB when quota is hit
const EVICTABLE_IDB_KEYS = [
    'cv_builder:jb_pageCache',
    'cv_builder:jb_jsResults',
    'cv_builder:jb_searchResults',
    'cv_builder:jb_seenIds',
];

// Keys that must never be auto-evicted
const PROTECTED_SUFFIXES = [
    'userProfile', 'savedCVs', 'profiles', 'trackedApps', 'currentCV',
    'apiSettings', 'activeProfileId',
];

function isQuotaError(err: unknown): boolean {
    if (err instanceof DOMException) {
        return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED';
    }
    return false;
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => { _db = req.result; resolve(_db!); };
        req.onerror = () => reject(req.error);
    });
}

async function idbPut(key: string, value: unknown): Promise<void> {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).put(JSON.stringify(value), key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function idbDelete(key: string): Promise<void> {
    try {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch { /* best-effort */ }
}

async function evictIDBCacheKeys(): Promise<void> {
    for (const key of EVICTABLE_IDB_KEYS) {
        await idbDelete(key);
    }
}

async function evictLargestIDBEntries(): Promise<void> {
    try {
        const db = await openDB();
        const entries: { key: string; size: number }[] = [];
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).openCursor();
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    const k = cursor.key as string;
                    const isProtected = PROTECTED_SUFFIXES.some(s => k.endsWith(s));
                    if (!isProtected) {
                        const size = typeof cursor.value === 'string' ? cursor.value.length : 0;
                        entries.push({ key: k, size });
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            req.onerror = () => reject(req.error);
        });
        // Evict the 5 largest non-protected entries
        entries.sort((a, b) => b.size - a.size);
        for (const e of entries.slice(0, 5)) {
            await idbDelete(e.key);
        }
    } catch { /* best-effort */ }
}

export async function idbAppSet(key: string, value: unknown): Promise<void> {
    try {
        await idbPut(key, value);
    } catch (err) {
        if (!isQuotaError(err)) {
            // Non-quota error — log but don't crash (localStorage is our primary)
            console.warn('[AppDataPersistence] IDB write failed (non-quota):', err);
            return;
        }

        // Quota hit — try to free space
        try {
            await evictIDBCacheKeys();
            await idbPut(key, value);
            return;
        } catch (err2) {
            if (!isQuotaError(err2)) return; // still non-quota, give up
        }

        // Second eviction round: remove largest non-protected
        try {
            await evictLargestIDBEntries();
            await idbPut(key, value);
        } catch {
            // IDB is critically full — localStorage still has the data, just warn
            console.warn(`[AppDataPersistence] IDB quota full — key "${key}" only saved to localStorage.`);
        }
    }
}

export async function idbAppGet<T>(key: string): Promise<T | null> {
    try {
        const db = await openDB();
        const raw = await new Promise<string | undefined>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(key);
            req.onsuccess = () => resolve(req.result as string | undefined);
            req.onerror = () => reject(req.error);
        });
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export async function idbAppGetAll(): Promise<Record<string, unknown>> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const result: Record<string, unknown> = {};
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).openCursor();
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    try { result[cursor.key as string] = JSON.parse(cursor.value as string); } catch { /* skip */ }
                    cursor.continue();
                } else {
                    resolve(result);
                }
            };
            req.onerror = () => reject(req.error);
        });
    } catch {
        return {};
    }
}

// ── Restore: called once on boot to refill localStorage from IDB ──────────────

let _restored = false;

/**
 * Call this ONCE at app startup (before any useLocalStorage reads).
 * If localStorage appears empty (cache cleared) but IDB has data,
 * we refill localStorage from IDB so all hooks get their data back.
 */
export async function restoreLocalStorageFromIDB(): Promise<void> {
    if (_restored) return;
    _restored = true;

    const idbData = await idbAppGetAll();
    const entries = Object.entries(idbData);
    if (entries.length === 0) return;

    for (const [key, value] of entries) {
        if (localStorage.getItem(key) === null) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (err) {
                // localStorage is full even on restore — skip non-critical keys
                const isProtected = PROTECTED_SUFFIXES.some(s => key.endsWith(s));
                if (isProtected) {
                    console.warn(`[AppDataPersistence] Restore failed for critical key ${key}:`, err);
                }
                // Non-critical keys are fine to skip
            }
        }
    }
}
