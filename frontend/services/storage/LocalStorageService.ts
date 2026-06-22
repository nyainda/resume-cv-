// services/storage/LocalStorageService.ts
// Wraps window.localStorage with the IStorageService contract.
// All keys are namespaced under a user-scoped prefix to prevent cross-account
// contamination on shared devices.
//
// Key format: `u_<userId>:cv_builder:<key>`  (logged in)
//             `anon:cv_builder:<key>`         (not logged in)
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
import { getUserPrefix } from './userStorageNamespace';

// Keys we can safely evict when quota is full (ordered by eviction priority: biggest/least important first)
const EVICTABLE_KEYS = [
    'jb_pageCache',
    'jb_seenIds',
    'jb_jsRole',
    'jb_jsCategory',
];

// Key suffixes that must never be auto-evicted (critical user data)
const PROTECTED_SUFFIXES = ['userProfile', 'savedCVs', 'profiles',
    'trackedApps', 'currentCV', 'apiSettings',
    'activeProfileId'];

function isQuotaError(err: unknown): boolean {
    if (!(err instanceof DOMException)) return false;
    return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function getFullKey(key: string): string {
    return getUserPrefix() + 'cv_builder:' + key;
}

function evictCacheKeys(userPrefix: string): string[] {
    const evicted: string[] = [];
    for (const key of EVICTABLE_KEYS) {
        const fullKey = userPrefix + 'cv_builder:' + key;
        if (localStorage.getItem(fullKey) !== null) {
            localStorage.removeItem(fullKey);
            evicted.push(key);
        }
    }
    return evicted;
}

function evictLargestNonProtected(userPrefix: string): string[] {
    const candidates: { key: string; size: number }[] = [];
    const namespacedCvPrefix = userPrefix + 'cv_builder:';
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const isProtected = PROTECTED_SUFFIXES.some(s => k.endsWith(s));
        if (!isProtected && k.startsWith(namespacedCvPrefix)) {
            const val = localStorage.getItem(k) ?? '';
            candidates.push({ key: k, size: val.length });
        }
    }
    candidates.sort((a, b) => b.size - a.size);
    const evicted: string[] = [];
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
        const fullKey = getFullKey(key);
        const serialised = JSON.stringify(data);
        const userPrefix = getUserPrefix();

        let lsSaved = false;
        let allEvicted: string[] = [];

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                localStorage.setItem(fullKey, serialised);
                lsSaved = true;
                break;
            } catch (err) {
                if (!isQuotaError(err)) throw err;

                if (attempt === 0) {
                    const evicted = evictCacheKeys(userPrefix);
                    allEvicted = [...allEvicted, ...evicted];
                }
                if (attempt === 1) {
                    const evicted = evictLargestNonProtected(userPrefix);
                    allEvicted = [...allEvicted, ...evicted];
                }
            }
        }

        if (!lsSaved) {
            dispatchQuotaWarning({ key, evicted: allEvicted });
            console.warn(`[LocalStorageService] localStorage full — falling back to IDB-only for key "${key}". Evicted:`, allEvicted);
        }

        await idbAppSet(fullKey, data);
    }

    async load<T = unknown>(key: string): Promise<T | null> {
        const fullKey = getFullKey(key);

        const raw = localStorage.getItem(fullKey);
        if (raw !== null) {
            try { return JSON.parse(raw) as T; } catch {
                console.warn(`[LocalStorageService] Corrupt value for "${key}" in localStorage — trying IDB`);
            }
        }

        const idbVal = await idbAppGet<T>(fullKey);
        if (idbVal !== null) {
            try { localStorage.setItem(fullKey, JSON.stringify(idbVal)); } catch { /* quota */ }
            return idbVal;
        }

        return null;
    }

    async list(): Promise<string[]> {
        const namespacedCvPrefix = getUserPrefix() + 'cv_builder:';
        const lsKeys = new Set<string>();
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith(namespacedCvPrefix)) lsKeys.add(k.slice(namespacedCvPrefix.length));
        }

        if (lsKeys.size === 0) {
            const all = await idbAppGetAll();
            for (const k of Object.keys(all)) {
                if (k.startsWith(namespacedCvPrefix)) lsKeys.add(k.slice(namespacedCvPrefix.length));
            }
        }

        return Array.from(lsKeys);
    }

    async delete(key: string): Promise<void> {
        const fullKey = getFullKey(key);
        localStorage.removeItem(fullKey);
        try {
            const { idbAppDel } = await import('./AppDataPersistence');
            await idbAppDel(fullKey);
        } catch { /* best-effort */ }
    }

    async sync(): Promise<void> { }

    async dumpAll(): Promise<Record<string, unknown>> {
        const result: Record<string, unknown> = {};
        const keys = await this.list();
        await Promise.all(
            keys.map(async (k) => {
                result[k] = await this.load(k);
            })
        );
        return result;
    }

    static estimateUsage(): number {
        try {
            let total = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i) ?? '';
                total += k.length + (localStorage.getItem(k)?.length ?? 0);
            }
            return total / (5 * 1024 * 1024);
        } catch {
            return 0;
        }
    }
}
