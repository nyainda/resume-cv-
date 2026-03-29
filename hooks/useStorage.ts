import { useState, useEffect, useCallback } from 'react';
import { getStorageService } from '../services/storage/StorageRouter';
import { useGoogleAuth } from '../auth/GoogleAuthContext';

type Setter<T> = (newValue: T | ((prev: T) => T)) => Promise<void>;

export function useStorage<T>(key: string, initialValue: T): [T, Setter<T>] {
    const { isAuthenticated, loading: authLoading } = useGoogleAuth();
    const [value, setValue] = useState<T>(initialValue);

    useEffect(() => {
        if (authLoading) return;

        let cancelled = false;
        getStorageService()
            .load<T>(key)
            .then((loaded) => {
                if (!cancelled && loaded !== null) setValue(loaded);
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