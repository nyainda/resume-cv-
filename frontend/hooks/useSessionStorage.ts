
import { useState, useEffect, Dispatch, SetStateAction } from 'react';

function getValueFromStorage<T>(key: string, initialValue: T): T {
  if (typeof window === 'undefined') {
    return initialValue;
  }
  try {
    const item = window.sessionStorage.getItem(key);
    return item ? JSON.parse(item) : initialValue;
  } catch (error) {
    console.error(`Error reading sessionStorage key "${key}":`, error);
    return initialValue;
  }
}

export function useSessionStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    return getValueFromStorage(key, initialValue);
  });

  useEffect(() => {
    try {
      if (storedValue === undefined || storedValue === null) {
          window.sessionStorage.removeItem(key);
      } else {
          window.sessionStorage.setItem(key, JSON.stringify(storedValue));
      }
    } catch (error) {
      console.error(`Error setting sessionStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}
