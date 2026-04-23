// services/storage/LocalStorageService.ts
// Wraps window.localStorage with the IStorageService contract.
// All keys are namespaced under CV_PREFIX to avoid collisions.
//
// Quota handling:
//   - If localStorage is full, we evict large non-critical keys (job caches)
//     in order of priority, then retry.
//   - If still full after eviction, we write to IndexedDB only and fire a
//     storage-quota-warning event so the UI can inform the user.
//   - Critical user data (profiles, CVs, applications) is NEVER evicted.

import { IStorageService } from './IStorageService';
import { idbAppSet, idbAppGet, idbAppGetAll } from './AppDataPersistence';
import { dispatchQuotaWarning } from './storageErrors';

const CV_PREFIX = 'cv_builder:';

// Keys we can safely evict when quota is full (ordered by eviction priority: biggest/least important first)
const EVICTABLE_KEYS = [
    'jb_pageCache',        // JSearch API cache — largest, fully re-fetchable
    'jb_jsResults',        // Last JSearch results grid
    'jb_searchResults',    // Last Tavily results grid
    'jb_seenIds',          // Seen job IDs — large, resettable
    'jb_jsRole',
    'jb_jsCategory',
];

// Keys that must never be auto-evicted (critical user data)
const PROTECTED_PREFIXES = ['cv_builder:userProfile', 'cv_builder:savedCVs', 'cv_builder:profiles',
    'cv_builder:trackedApps', 'cv_builder:currentCV', 'cv_builder:apiSettings',
    'cv_builder:activeProfileId'];

function isQuotaError(err: unknown): boolean {
    if (!(err instanceof DOMException)) return false;
    return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function evictCacheKeys(): string[] {
    const evicted: string[] = [];
    for (const key of EVICTABLE_KEYS) {
        const fullKey = CV_PREFIX + key;
        if (localStorage.getItem(fullKey) !== null) {
            localStorage.removeItem(fullKey);
            evicted.push(key);
        }
    }
    return evicted;
}

function evictLargestNonProtected(): string[] {
    // Collect all non-protected keys and their sizes
    const candidates: { key: string; size: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const isProtected = PROTECTED_PREFIXES.some(p => k.startsWith(p));
        if (!isProtected && k.startsWith(CV_PREFIX)) {
            const val = localStorage.getItem(k) ?? '';
            candidates.push({ key: k, size: val.length });
        }
    }
    // Sort largest first
    candidates.sort((a, b) => b.size - a.size);
    const evicted: string[] = [];
    // Remove top 3 largest non-protected
    for (const c of candidates.slice(0, 3)) {
        localStorage.removeItem(c.key);
        evicted.push(c.key);
    }
    return evicted;
}

export class LocalStorageService implements IStorageService {
    readonly isPersistent = false;
    readonly label = 'Browser cache';

    async save(key: string, data: unknown): Promise<void> {
        const fullKey = CV_PREFIX + key;
        const serialised = JSON.stringify(data);

        // 1. Try localStorage — with up to 2 eviction rounds on quota error
        let lsSaved = false;
        let allEvicted: string[] = [];

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                localStorage.setItem(fullKey, serialised);
                lsSaved = true;
                break;
            } catch (err) {
                if (!isQuotaError(err)) throw err; // non-quota error — re-throw immediately

                // First pass: evict known large cache keys
                if (attempt === 0) {
                    const evicted = evictCacheKeys();
                    allEvicted = [...allEvicted, ...evicted];
                }
                // Second pass: evict largest non-protected keys
                if (attempt === 1) {
                    const evicted = evictLargestNonProtected();
                    allEvicted = [...allEvicted, ...evicted];
                }
                // Third pass: give up on localStorage, fall through to IDB-only
            }
        }

        if (!lsSaved) {
            // localStorage is full even after eviction — warn user
            dispatchQuotaWarning({ key, evicted: allEvicted });
            console.warn(`[LocalStorageService] localStorage full — falling back to IDB-only for key "${key}". Evicted:`, allEvicted);
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
            try { localStorage.setItem(fullKey, JSON.stringify(idbVal)); } catch { /* quota — IDB is our fallback */ }
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

    /** Returns how much of the estimated ~5MB quota is used (0–1). */
    static estimateUsage(): number {
        try {
            let total = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i) ?? '';
                total += k.length + (localStorage.getItem(k)?.length ?? 0);
            }
            return total / (5 * 1024 * 1024); // 5MB estimate
        } catch {
            return 0;
        }
    }
}
