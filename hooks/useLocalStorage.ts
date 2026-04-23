// hooks/useLocalStorage.ts
// Drop-in replacement for the old hook.
// Now ALSO writes every value to IndexedDB so data survives "Clear cache".
// Reads from localStorage first (instant), with IDB as the durable backup.

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { idbAppSet, idbAppGet } from '../services/storage/AppDataPersistence';

const CV_PREFIX = 'cv_builder:';

function lsGet<T>(key: string, initialValue: T): T {
  if (typeof window === 'undefined') return initialValue;
  try {
    const item = window.localStorage.getItem(CV_PREFIX + key) || window.localStorage.getItem(key);
    return item !== null ? (JSON.parse(item) as T) : initialValue;
  } catch {
    return initialValue;
  }
}

function lsSet<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(CV_PREFIX + key, JSON.stringify(value));
  } catch {
    // quota exceeded — IDB copy will still be there
  }
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  // Initialise from localStorage immediately (synchronous — no flash)
  const [storedValue, setStoredValue] = useState<T>(() => lsGet(key, initialValue));

  // On mount: if localStorage returned the default, try IDB (it may have the real value)
  useEffect(() => {
    const lsVal = lsGet(key, undefined as unknown as T);
    // If localStorage already has a non-default value don't bother hitting IDB
    if (lsVal !== undefined && JSON.stringify(lsVal) !== JSON.stringify(initialValue)) return;

    idbAppGet<T>(CV_PREFIX + key).then(idbVal => {
      if (idbVal !== null) {
        // Re-hydrate localStorage from IDB
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

        // Write to localStorage synchronously
        lsSet(key, next);

        // Write to IndexedDB asynchronously (fire-and-forget)
        idbAppSet(CV_PREFIX + key, next).catch(() => { /* silent */ });

        return next;
      });
    },
    [key]
  );

  return [storedValue, setValue];
}