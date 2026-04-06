import { useState, useEffect, useCallback } from 'react';
import { getStorageService } from '../services/storage/StorageRouter';
import { useGoogleAuth } from '../auth/GoogleAuthContext';
import { idbAppGet } from '../services/storage/AppDataPersistence';

type Setter<T> = (newValue: T | ((prev: T) => T)) => Promise<void>;

const CV_PREFIX = 'cv_builder:';

/**
 * Read from localStorage synchronously so the very first render already has
 * the persisted value — no flash of empty / default state on refresh.
 */
function readLocalSync<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw =
            window.localStorage.getItem(CV_PREFIX + key) ??
            window.localStorage.getItem(key);
        if (raw !== null) return JSON.parse(raw) as T;
    } catch {
        // ignore parse errors
    }
    return fallback;
}

export function useStorage<T>(key: string, initialValue: T): [T, Setter<T>] {
    const { isAuthenticated, loading: authLoading } = useGoogleAuth();

    // ── Synchronous initialisation from localStorage ─────────────────────────
    // This ensures the first render already has the correct persisted value
    // instead of starting with `initialValue` and causing a flicker / reset.
    const [value, setValue] = useState<T>(() => readLocalSync(key, initialValue));

    // ── Async hydration (Drive or IDB fallback) ──────────────────────────────
    useEffect(() => {
        if (authLoading) return;

        let cancelled = false;

        // Only hit the async storage if we are using Google Drive OR if
        // localStorage was empty (IDB fallback).
        const lsVal = readLocalSync<T | null>(key, null);

        if (lsVal !== null) {
            // We already have a value from localStorage — no need to wait for
            // an async round-trip unless Drive is active (authoritative source).
            const driveActive =
                !!localStorage.getItem('cv_gdrive_token') &&
                Date.now() < Number(localStorage.getItem('cv_gdrive_expiry') ?? 0);

            if (!driveActive) {
                // Try IDB in case localStorage was just partially cleared
                idbAppGet<T>(CV_PREFIX + key).then(idbVal => {
                    if (!cancelled && idbVal !== null) {
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
                if (!cancelled && loaded !== null) {
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
