// services/storage/LocalStorageService.ts
// Wraps window.localStorage with the IStorageService contract.
// All keys are namespaced under CV_PREFIX to avoid collisions.
//
// Now ALSO mirrors every write to IndexedDB via AppDataPersistence,
// so data survives "Clear cache" events.

import { IStorageService } from './IStorageService';
import { idbAppSet, idbAppGet, idbAppGetAll } from './AppDataPersistence';

const CV_PREFIX = 'cv_builder:';

export class LocalStorageService implements IStorageService {
    readonly isPersistent = false;
    readonly label = 'Browser cache';

    async save(key: string, data: unknown): Promise<void> {
        const fullKey = CV_PREFIX + key;
        const serialised = JSON.stringify(data);

        // 1. localStorage (synchronous, fast read-back)
        try {
            localStorage.setItem(fullKey, serialised);
        } catch (err) {
            throw new Error(`LocalStorage save failed for key "${key}": ${(err as Error).message}`);
        }

        // 2. IndexedDB (async, durable — survives "Clear cache")
        await idbAppSet(fullKey, data);
    }

    async load<T = unknown>(key: string): Promise<T | null> {
        const fullKey = CV_PREFIX + key;

        // Try localStorage first (instant)
        const raw = localStorage.getItem(fullKey);
        if (raw !== null) {
            try { return JSON.parse(raw) as T; } catch {
                console.warn(`[LocalStorageService] Corrupt value for "${key}" in localStorage — trying IDB`);
            }
        }

        // Fallback: IndexedDB (called when localStorage was cleared)
        const idbVal = await idbAppGet<T>(fullKey);
        if (idbVal !== null) {
            // Re-populate localStorage so subsequent reads are fast
            try { localStorage.setItem(fullKey, JSON.stringify(idbVal)); } catch { /* quota */ }
            return idbVal;
        }

        return null;
    }

    async list(): Promise<string[]> {
        // Collect from localStorage
        const lsKeys = new Set<string>();
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith(CV_PREFIX)) lsKeys.add(k.slice(CV_PREFIX.length));
        }

        // If localStorage is empty, gather from IDB as well
        if (lsKeys.size === 0) {
            const all = await idbAppGetAll();
            for (const k of Object.keys(all)) {
                if (k.startsWith(CV_PREFIX)) lsKeys.add(k.slice(CV_PREFIX.length));
            }
        }

        return Array.from(lsKeys);
    }

    async delete(key: string): Promise<void> {
        localStorage.removeItem(CV_PREFIX + key);
        // Note: we intentionally don't remove from IDB so the data is
        // recoverable. If the user explicitly deletes we could add idbAppDel too.
    }

    async sync(): Promise<void> {
        // Nothing to do — browser storage is always "synced"
    }

    /** Dump all data as a plain object — used by Drive migration. */
    async dumpAll(): Promise<Record<string, unknown>> {
        const result: Record<string, unknown> = {};

        // Gather all keys (from localStorage, falling back to IDB)
        const keys = await this.list();
        await Promise.all(
            keys.map(async (k) => {
                result[k] = await this.load(k);
            })
        );
        return result;
    }
}