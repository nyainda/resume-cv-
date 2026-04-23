// auth/AuthPersistence.ts
// Stores Google auth state in IndexedDB, which is NOT cleared by
// "Clear cache" or "Clear browsing history". It is only wiped when the
// user explicitly chooses "Cookies and site data" in the browser's
// clear-data dialog — far more resilient than localStorage.
//
// Falls back gracefully to localStorage when IndexedDB isn't available.

const DB_NAME = 'cv_builder_auth';
const DB_VERSION = 1;
const STORE = 'auth_store';

export interface PersistedAuthState {
    accessToken: string;
    expiresAt: number; // Unix ms
    email: string;
    name: string;
    picture: string;
}

// ── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(key);
            req.onsuccess = () => resolve(req.result as T | undefined);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return undefined;
    }
}

async function idbSet(key: string, value: unknown): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch {
        // silently swallow if IDB unavailable
    }
}

async function idbDel(key: string): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch {
        // silently swallow
    }
}

// ── localStorage mirror keys (legacy / fallback) ─────────────────────────────

const LS_TOKEN = 'cv_gdrive_token';
const LS_EXPIRY = 'cv_gdrive_expiry';
const LS_USER = 'cv_gdrive_user';

// ── Public API ────────────────────────────────────────────────────────────────

/** Persist auth state to BOTH IndexedDB (primary) and localStorage (fallback). */
export async function saveAuthState(state: PersistedAuthState): Promise<void> {
    // IndexedDB — survives "Clear cache"
    await idbSet('auth', state);

    // localStorage — quick sync read on next boot, also serves as fallback
    try {
        localStorage.setItem(LS_TOKEN, state.accessToken);
        localStorage.setItem(LS_EXPIRY, String(state.expiresAt));
        localStorage.setItem(LS_USER, JSON.stringify({
            email: state.email,
            name: state.name,
            picture: state.picture,
        }));
    } catch {
        // storage quota exceeded — IndexedDB copy is enough
    }
}

/** Load auth state. Tries IndexedDB first, then falls back to localStorage. */
export async function loadAuthState(): Promise<PersistedAuthState | null> {
    // 1. Try IndexedDB
    const idbState = await idbGet<PersistedAuthState>('auth');
    if (idbState?.accessToken && idbState.expiresAt) {
        // Restore localStorage mirror so StorageRouter.getStorageService() works
        _mirrorToLocalStorage(idbState);
        return idbState;
    }

    // 2. Fall back to localStorage (e.g. first load before IDB was populated)
    try {
        const token = localStorage.getItem(LS_TOKEN);
        const expiry = Number(localStorage.getItem(LS_EXPIRY) ?? 0);
        const rawUser = localStorage.getItem(LS_USER);
        if (token && rawUser && expiry) {
            const u = JSON.parse(rawUser) as { email: string; name: string; picture: string };
            const state: PersistedAuthState = { accessToken: token, expiresAt: expiry, ...u };
            // Back-fill IDB so future loads are resilient
            await idbSet('auth', state);
            return state;
        }
    } catch {
        // corrupted localStorage
    }

    return null;
}

/** Remove auth state from both stores. */
export async function clearAuthState(): Promise<void> {
    await idbDel('auth');
    try {
        localStorage.removeItem(LS_TOKEN);
        localStorage.removeItem(LS_EXPIRY);
        localStorage.removeItem(LS_USER);
    } catch {
        // nothing
    }
}

/** Update only the token + expiry (called after silent refresh). */
export async function updateToken(accessToken: string, expiresAt: number): Promise<void> {
    const existing = await idbGet<PersistedAuthState>('auth');
    if (!existing) return;
    const updated: PersistedAuthState = { ...existing, accessToken, expiresAt };
    await saveAuthState(updated);
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _mirrorToLocalStorage(state: PersistedAuthState) {
    try {
        localStorage.setItem(LS_TOKEN, state.accessToken);
        localStorage.setItem(LS_EXPIRY, String(state.expiresAt));
        localStorage.setItem(LS_USER, JSON.stringify({
            email: state.email,
            name: state.name,
            picture: state.picture,
        }));
    } catch {
        // quota error — ignore
    }
}
