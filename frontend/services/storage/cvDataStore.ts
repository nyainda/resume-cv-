/**
 * cvDataStore.ts
 *
 * Stores full CVData objects in a dedicated IndexedDB database
 * (`cv_builder_cvdata`) so the thin SavedCV index in localStorage only
 * holds metadata (id, name, date, purpose, template, qualityReport).
 *
 * Why separate from localStorage?
 *   localStorage cap is 5 MB (shared by ALL app state).
 *   A single CVData blob is 10–50 KB; 20 saved CVs = up to 1 MB.
 *   IndexedDB has no hard cap (browser allows 50 %+ of free disk).
 *
 * Why not CF D1?
 *   CV content is private/sensitive — it must never leave the device
 *   unless the user explicitly syncs to Google Drive.
 *   CF D1 is reserved for AI caches and shared, non-personal data.
 *
 * API
 *   saveCVData(id, data)        — write to IDB + in-memory cache
 *   loadCVData(id)              — async read from IDB (with cache)
 *   deleteCVData(id)            — remove from IDB + cache
 *   getCVDataCached(id)         — SYNCHRONOUS read from in-memory cache only
 *   preloadAllCVData(ids)       — batch-warm cache at app boot
 *   migrateToIDB(slots)         — one-time boot migration (strips inline data)
 */

import type { CVData, UserProfileSlot } from '../../types';

const DB_NAME    = 'cv_builder_cvdata';
const DB_VERSION = 1;
const STORE      = 'cv_data';

// ── In-memory cache (populated at boot via preloadAllCVData) ─────────────────
const _cache = new Map<string, CVData>();

// ── IDB helpers ───────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess  = () => { _db = req.result; resolve(_db!); };
        req.onerror    = () => reject(req.error);
    });
}

async function idbPut(id: string, data: CVData): Promise<void> {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const tx  = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).put(JSON.stringify(data), id);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
    });
}

async function idbGet(id: string): Promise<CVData | null> {
    const db = await openDB();
    return new Promise<CVData | null>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        req.onsuccess = () => {
            if (req.result == null) { resolve(null); return; }
            try   { resolve(JSON.parse(req.result as string) as CVData); }
            catch { resolve(null); }
        };
        req.onerror = () => reject(req.error);
    });
}

async function idbDelete(id: string): Promise<void> {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
        const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
    });
}

async function idbGetAllKeys(): Promise<string[]> {
    const db = await openDB();
    return new Promise<string[]>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror   = () => reject(req.error);
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Save full CVData to IDB and update in-memory cache. */
export async function saveCVData(id: string, data: CVData): Promise<void> {
    _cache.set(id, data);
    try {
        await idbPut(id, data);
    } catch (err) {
        console.warn('[cvDataStore] IDB write failed (quota?), data still in memory:', err);
    }
}

/** Load CVData from in-memory cache first, then IDB. Returns null if not found. */
export async function loadCVData(id: string): Promise<CVData | null> {
    if (_cache.has(id)) return _cache.get(id)!;
    try {
        const data = await idbGet(id);
        if (data) _cache.set(id, data);
        return data;
    } catch (err) {
        console.warn('[cvDataStore] IDB read failed:', err);
        return null;
    }
}

/** Synchronous read from in-memory cache only. Call preloadAllCVData() at boot to populate. */
export function getCVDataCached(id: string): CVData | undefined {
    return _cache.get(id);
}

/** Delete CVData from IDB and in-memory cache. */
export async function deleteCVData(id: string): Promise<void> {
    _cache.delete(id);
    try {
        await idbDelete(id);
    } catch (err) {
        console.warn('[cvDataStore] IDB delete failed:', err);
    }
}

/**
 * Preload CV data for all given IDs into the in-memory cache.
 * Call this at app boot (after profiles are loaded) so getCVDataCached()
 * works synchronously everywhere in the UI.
 */
export async function preloadAllCVData(ids: string[]): Promise<void> {
    const missing = ids.filter(id => !_cache.has(id));
    if (missing.length === 0) return;
    await Promise.all(missing.map(id => loadCVData(id)));
}

/**
 * One-time boot migration: for every SavedCV in every slot that still has
 * inline `data`, move it to IDB and strip it from the slot.
 *
 * Returns an updated copy of the slots array (caller must persist it).
 * Safe to call multiple times — skips slots that have no inline data.
 */
export async function migrateToIDB(slots: UserProfileSlot[]): Promise<{ slots: UserProfileSlot[]; migrated: number }> {
    let migrated = 0;
    const updatedSlots = await Promise.all(
        slots.map(async (slot) => {
            const updatedCVs = await Promise.all(
                (slot.savedCVs ?? []).map(async (cv) => {
                    if (!cv.data) return cv;
                    await saveCVData(cv.id, cv.data);
                    migrated++;
                    const { data: _stripped, ...thin } = cv;
                    return thin;
                }),
            );
            return { ...slot, savedCVs: updatedCVs };
        }),
    );
    return { slots: updatedSlots, migrated };
}

/**
 * Housekeeping: remove IDB entries whose IDs are no longer in any slot.
 * Run fire-and-forget — never critical.
 */
export async function pruneOrphanedCVData(activeIds: Set<string>): Promise<void> {
    try {
        const keys = await idbGetAllKeys();
        await Promise.all(
            keys.filter(k => !activeIds.has(k)).map(k => idbDelete(k)),
        );
    } catch { /* best-effort */ }
}
