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
// User isolation:
//   - IDB DB name is user-scoped: `cv_builder_appdata_u_<userId>` or `cv_builder_appdata_anon`
//   - This prevents a second account on the same device from reading IDB data
//     written by the first account (even after localStorage is wiped).

import { getScopedDbName } from './userStorageNamespace';

const BASE_DB_NAME = 'cv_builder_appdata';
const DB_VERSION = 1;
const STORE = 'kv';

const EVICTABLE_IDB_KEYS_SUFFIX = [
    'jb_pageCache',
    'jb_seenIds',
];

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

// ── Per-user DB connection cache ──────────────────────────────────────────────

const _dbCache = new Map<string, IDBDatabase>();

function getDbName(): string {
    return getScopedDbName(BASE_DB_NAME);
}

function openDB(): Promise<IDBDatabase> {
    const name = getDbName();
    const cached = _dbCache.get(name);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, DB_VERSION);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => { _dbCache.set(name, req.result); resolve(req.result); };
        req.onerror = () => reject(req.error);
    });
}

/** Close and remove the cached DB connection for the current user (call on logout). */
export function closeAppDataDb(): void {
    const name = getDbName();
    const db = _dbCache.get(name);
    if (db) {
        try { db.close(); } catch { /* ignore */ }
        _dbCache.delete(name);
    }
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
    for (const suffix of EVICTABLE_IDB_KEYS_SUFFIX) {
        // Match any key ending with the suffix (regardless of user prefix)
        try {
            const db = await openDB();
            await new Promise<void>((resolve) => {
                const tx = db.transaction(STORE, 'readwrite');
                const req = tx.objectStore(STORE).openCursor();
                req.onsuccess = () => {
                    const cursor = req.result;
                    if (cursor) {
                        if ((cursor.key as string).endsWith(suffix)) {
                            cursor.delete();
                        }
                        cursor.continue();
                    } else { resolve(); }
                };
                req.onerror = () => resolve();
            });
        } catch { /* best-effort */ }
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
                } else { resolve(); }
            };
            req.onerror = () => reject(req.error);
        });
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
            console.warn('[AppDataPersistence] IDB write failed (non-quota):', err);
            return;
        }
        try {
            await evictIDBCacheKeys();
            await idbPut(key, value);
            return;
        } catch (err2) {
            if (!isQuotaError(err2)) return;
        }
        try {
            await evictLargestIDBEntries();
            await idbPut(key, value);
        } catch {
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

export async function idbAppDel(key: string): Promise<void> {
    await idbDelete(key);
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
                } else { resolve(result); }
            };
            req.onerror = () => reject(req.error);
        });
    } catch {
        return {};
    }
}

// ── Restore: called once on boot to refill localStorage from IDB ──────────────

let _restored = false;

const _LS_APPDATA_CLEARED = 'cv_appdata_cleared';

/**
 * Call this ONCE at app startup (before any useLocalStorage reads).
 * If localStorage appears empty (cache cleared) but IDB has data,
 * we refill localStorage from IDB so all hooks get their data back.
 */
export async function restoreLocalStorageFromIDB(): Promise<void> {
    if (_restored) return;
    _restored = true;

    try {
        if (localStorage.getItem(_LS_APPDATA_CLEARED)) {
            localStorage.removeItem(_LS_APPDATA_CLEARED);
            // Clear the current user's IDB store
            const db = await openDB().catch(() => null);
            if (db) {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).clear();
            }
            return;
        }
    } catch { /* localStorage unavailable — proceed as normal */ }

    const idbData = await idbAppGetAll();
    const entries = Object.entries(idbData);
    if (entries.length === 0) return;

    for (const [key, value] of entries) {
        if (localStorage.getItem(key) === null) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (err) {
                const isProtected = PROTECTED_SUFFIXES.some(s => key.endsWith(s));
                if (isProtected) {
                    console.warn(`[AppDataPersistence] Restore failed for critical key ${key}:`, err);
                }
            }
        }
    }
}

/** Reset the _restored flag — used in tests and after account switches. */
export function resetRestoredFlag(): void {
    _restored = false;
}
