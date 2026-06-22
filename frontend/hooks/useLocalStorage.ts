// hooks/useLocalStorage.ts
// Drop-in replacement for the old hook.
// Now ALSO writes every value to IndexedDB so data survives "Clear cache".
// Reads from localStorage first (instant), with IDB as the durable backup.
//
// Keys are user-scoped via getUserPrefix() to prevent cross-account contamination.

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { idbAppSet, idbAppGet } from '../services/storage/AppDataPersistence';
import { getUserPrefix } from '../services/storage/userStorageNamespace';

const CV_BASE = 'cv_builder:';

function getFullKey(key: string): string {
  return getUserPrefix() + CV_BASE + key;
}

function lsGet<T>(key: string, initialValue: T): T {
  if (typeof window === 'undefined') return initialValue;
  try {
    const fullKey = getFullKey(key);
    const item = window.localStorage.getItem(fullKey);
    return item !== null ? (JSON.parse(item) as T) : initialValue;
  } catch {
    return initialValue;
  }
}

function lsSet<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(getFullKey(key), JSON.stringify(value));
  } catch {
    // quota exceeded — IDB copy will still be there
  }
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => lsGet(key, initialValue));

  useEffect(() => {
    const lsVal = lsGet(key, undefined as unknown as T);
    if (lsVal !== undefined && JSON.stringify(lsVal) !== JSON.stringify(initialValue)) return;

    const fullKey = getFullKey(key);
    idbAppGet<T>(fullKey).then(idbVal => {
      if (idbVal !== null) {
        lsSet(key, idbVal);
        setStoredValue(idbVal);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (valueOrUpdater) => {
      setStoredValue(prev => {
        const next =
          typeof valueOrUpdater === 'function'
            ? (valueOrUpdater as (p: T) => T)(prev)
            : valueOrUpdater;

        lsSet(key, next);
        const fullKey = getFullKey(key);
        idbAppSet(fullKey, next).catch(() => { /* silent */ });

        return next;
      });
    },
    [key]
  );

  return [storedValue, setValue];
}
