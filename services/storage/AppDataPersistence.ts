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
// This module is intentionally simple — no reactivity, just raw get/set/restore.

const DB_NAME = 'cv_builder_appdata';
const DB_VERSION = 1;
const STORE = 'kv';

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

export async function idbAppSet(key: string, value: unknown): Promise<void> {
    try {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).put(JSON.stringify(value), key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch {
        // IDB not available — localStorage-only is acceptable fallback
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

    // Heuristic: if we have any cv_builder: key in localStorage, it wasn't cleared
    const hasCvData = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
        .some(k => k?.startsWith('cv_builder:'));

    if (hasCvData) return; // localStorage intact — nothing to do

    // localStorage is empty — restore from IDB
    const all = await idbAppGetAll();
    const entries = Object.entries(all);
    if (entries.length === 0) return; // first-ever run — nothing to restore

    for (const [key, value] of entries) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            break; // quota exceeded — restore what we can
        }
    }
}
