import { useState, useEffect, useCallback, useRef } from 'react';
import { getStorageService } from '../services/storage/StorageRouter';
import { useAuth } from '../auth/AuthContext';
import { idbAppGet } from '../services/storage/AppDataPersistence';
import { getUserPrefix } from '../services/storage/userStorageNamespace';

type Setter<T> = (newValue: T | ((prev: T) => T)) => Promise<void>;

const CV_PREFIX = 'cv_builder:';

/**
 * Verify the parsed value matches the structural type of the fallback.
 * Prevents crashes when a key is found in localStorage but holds a value
 * of the wrong type (e.g. a string stored where an array is expected).
 */
function isCompatibleType<T>(parsed: unknown, fallback: T): boolean {
    if (fallback === null || fallback === undefined) return true;
    if (Array.isArray(fallback)) return Array.isArray(parsed);
    const ft = typeof fallback;
    const pt = typeof parsed;
    // For primitives (string, number, boolean) the types must match exactly.
    // For objects we allow any object (not array), which covers all our record types.
    if (ft === 'object') return pt === 'object' && !Array.isArray(parsed) && parsed !== null;
    return ft === pt;
}

/**
 * Read from localStorage synchronously so the very first render already has
 * the persisted value — no flash of empty / default state on refresh.
 *
 * Tries keys in this order:
 *  1. User-namespaced: `u_<userId>:cv_builder:<key>`  ← where data lives post-migration
 *  2. Legacy prefixed:  `cv_builder:<key>`             ← pre-namespace-migration data
 *  3. Bare key:         `<key>`                        ← very old format
 *
 * The user namespace is read from `procv:storage_ns` (set by initStorageNamespace()
 * at app boot), so the correct prefix is available before the first render even
 * when the auth session request is still in flight.
 */
function readLocalSync<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
        const userPrefix = getUserPrefix(); // 'u_<userId>:' or 'anon:'
        const raw =
            window.localStorage.getItem(userPrefix + CV_PREFIX + key) ??
            window.localStorage.getItem(CV_PREFIX + key) ??
            window.localStorage.getItem(key);
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            if (!isCompatibleType(parsed, fallback)) {
                console.warn(
                    `[useStorage] Type mismatch for key "${key}" — expected ${Array.isArray(fallback) ? 'array' : typeof fallback}, got ${Array.isArray(parsed) ? 'array' : typeof parsed}. Using default.`
                );
                return fallback;
            }
            return parsed as T;
        }
    } catch {
        // ignore parse errors
    }
    return fallback;
}

export function useStorage<T>(key: string, initialValue: T): [T, Setter<T>] {
    const { isAuthenticated, isLoading: authLoading } = useAuth();

    // ── Synchronous initialisation from localStorage ─────────────────────────
    // This ensures the first render already has the correct persisted value
    // instead of starting with `initialValue` and causing a flicker / reset.
    const [value, setValue] = useState<T>(() => readLocalSync(key, initialValue));

    // ── Write-generation counter ──────────────────────────────────────────────
    // Every call to `persist` increments this counter. The async effect captures
    // the counter value at the moment the load starts and only applies the loaded
    // value if no writes happened while the load was in flight. This prevents a
    // stale IDB/Drive read (e.g. one that started before the user created a new
    // profile) from overwriting a newer synchronous write, which was the root
    // cause of cross-profile contamination (room A data reappearing in room B).
    const writeGenRef = useRef(0);

    // ── Async hydration (Drive or IDB fallback) ──────────────────────────────
    useEffect(() => {
        if (authLoading) return;

        let cancelled = false;
        // Snapshot the write generation at the moment this load starts.
        // If `persist` is called before the async load resolves, writeGenRef
        // will have advanced past this value and we skip the stale update.
        const capturedWriteGen = writeGenRef.current;

        // Only hit the async storage if we are using Google Drive OR if
        // localStorage was empty (IDB fallback).
        const lsVal = readLocalSync<T | null>(key, null);

        if (lsVal !== null) {
            // We already have a value from localStorage — no need to wait for
            // an async round-trip unless Drive is active (authoritative source).
            const _drivePrefix = getUserPrefix();
            const driveActive =
                !!localStorage.getItem(`${_drivePrefix}cv_gdrive_token`) &&
                Date.now() < Number(localStorage.getItem(`${_drivePrefix}cv_gdrive_expiry`) ?? 0);

            if (!driveActive) {
                // Try IDB in case localStorage was just partially cleared
                idbAppGet<T>(CV_PREFIX + key).then(idbVal => {
                    if (!cancelled && writeGenRef.current === capturedWriteGen
                        && idbVal !== null && isCompatibleType(idbVal, initialValue)) {
                        // Update localStorage so future reads are fast
                        try {
                            window.localStorage.setItem(CV_PREFIX + key, JSON.stringify(idbVal));
                        } catch { /* quota */ }
                        // Only update state if IDB has a materially different value
                        setValue(prev =>
                            JSON.stringify(prev) !== JSON.stringify(idbVal) ? idbVal : prev
                        );
                    }
                }).catch(() => { });
                return () => { cancelled = true; };
            }
        }

        // Full async load — used when: a) Drive is active, b) localStorage was empty
        getStorageService()
            .load<T>(key)
            .then((loaded) => {
                if (!cancelled && writeGenRef.current === capturedWriteGen
                    && loaded !== null && isCompatibleType(loaded, initialValue)) {
                    setValue(prev =>
                        JSON.stringify(prev) !== JSON.stringify(loaded) ? loaded : prev
                    );
                }
            })
            .catch(() => { });

        return () => { cancelled = true; };
    }, [key, isAuthenticated, authLoading]);

    const persist: Setter<T> = useCallback(
        async (newValueOrUpdater) => {
            setValue((prev) => {
                // Advance the write generation BEFORE the async storage write so any
                // in-flight IDB/Drive load that completes afterwards will see the
                // counter has moved and will discard its (now stale) loaded value.
                writeGenRef.current += 1;
                const next =
                    typeof newValueOrUpdater === 'function'
                        ? (newValueOrUpdater as (p: T) => T)(prev)
                        : newValueOrUpdater;
                getStorageService()
                    .save(key, next)
                    .catch((err) => console.error(`[useStorage] save failed for "${key}":`, err));
                return next;
            });
        },
        [key]
    );

    return [value, persist];
}
