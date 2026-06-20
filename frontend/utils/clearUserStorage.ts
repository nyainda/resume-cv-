import { LS_AUTH_CLEARED } from '../auth/AuthPersistence';
import { clearCVDataStore } from '../services/storage/cvDataStore';
import { resetStorageRouter } from '../services/storage/StorageRouter';

/**
 * clearUserScopedStorage — call as part of every sign-out sequence.
 *
 * Clears all per-user tokens, Drive conflict baselines, D1 sync hashes,
 * and restore-dismissal flags so the next user starts with a clean slate.
 *
 * By default does NOT clear app data (profiles, CV data) so a returning
 * user finds their work when they sign back in.
 *
 * Pass { clearAppData: true } on an account-switch event to also wipe
 * cv_builder:* localStorage keys and the cvdata IndexedDB store so a
 * different email cannot see the previous user's work.
 *
 * Does NOT clear:
 *  - cv_builder:deviceId           (device-level, not user-level)
 *  - procv:account_email_hash      (kept for account-switch detection)
 *  - procv:last_real_email_hash    (kept for same-user-return detection)
 */

/** localStorage key that stores the FNV-32 hash of the last signed-in email. */
export const ACCOUNT_HASH_KEY = 'procv:account_email_hash';

/**
 * localStorage key that stores the FNV-32 hash of the user who explicitly
 * signed out.  Written by stampSignedOut() alongside the sentinel so the
 * account-switch guard can distinguish "same user returning" (no wipe needed)
 * from "different user signing in" (wipe required).
 */
export const LAST_REAL_HASH_KEY = 'procv:last_real_email_hash';

/**
 * Sentinel written to ACCOUNT_HASH_KEY on explicit sign-out.
 * The guard consults LAST_REAL_HASH_KEY to decide whether to wipe.
 */
export const SIGNED_OUT_SENTINEL = 'signed_out';

/**
 * Sentinel written to ACCOUNT_HASH_KEY after a full account deletion where
 * both IDB stores were AWAITED (not fire-and-forget).
 *
 * When the guard sees this sentinel it knows the local slate is already
 * guaranteed clean — no second wipe+reload is needed.  Any email (same or
 * different) can sign straight in: "new account = one click."
 */
export const DELETED_CLEAN_SENTINEL = 'deleted_clean';

/**
 * Write the signed-out sentinel.  Call this AFTER clearUserScopedStorage()
 * in every explicit sign-out handler.
 *
 * Preserves the current user's email hash in LAST_REAL_HASH_KEY so that when
 * the next sign-in fires the account-switch guard, it can detect "same user
 * returning" and skip the wipe+reload (the double-login fix).
 */
export function stampSignedOut(): void {
    try {
        const currentHash = localStorage.getItem(ACCOUNT_HASH_KEY);
        // Save who signed out — never save either sentinel value itself.
        if (
            currentHash &&
            currentHash !== SIGNED_OUT_SENTINEL &&
            currentHash !== DELETED_CLEAN_SENTINEL
        ) {
            localStorage.setItem(LAST_REAL_HASH_KEY, currentHash);
        }
        localStorage.setItem(ACCOUNT_HASH_KEY, SIGNED_OUT_SENTINEL);
    } catch {
        // localStorage unavailable — non-fatal
    }
}

/**
 * Rotate the device_id to a brand-new UUID.
 *
 * Call this after a full account deletion.  The device_id persists across
 * account deletion by design (anonymous/offline mode needs it), but legacy
 * D1 tables (saved_cvs, tracked_applications, star_stories, etc.) are keyed
 * by device_id only.  Even after the server-side wipe, any data that slipped
 * through would reappear if the same device_id is re-used on re-registration.
 * Rotating ensures the new account always starts with a fresh device_id that
 * has zero rows in any D1 table.
 */
export function rotateDeviceId(): void {
    try {
        const newId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem('cv_builder:deviceId', newId);
    } catch {
        // localStorage unavailable — non-fatal
    }
}

/**
 * Write the deleted-clean sentinel after a full account deletion.
 *
 * Call this AFTER clearUserScopedStorage({ clearAppData: true }) AND after
 * clearAllIdbAsync() has resolved — only then is the local slate guaranteed
 * empty.  The guard will let the next sign-in proceed without a second wipe,
 * making delete → re-register a single click, exactly like first-time sign-up.
 */
export function stampDeletedAccount(): void {
    try {
        // Erase last-real-hash: whoever signs in next is a brand-new user.
        localStorage.removeItem(LAST_REAL_HASH_KEY);
        localStorage.setItem(ACCOUNT_HASH_KEY, DELETED_CLEAN_SENTINEL);
    } catch {
        // localStorage unavailable — non-fatal
    }
}

/**
 * Await completion of both IDB wipes (Google auth DB + CV data store).
 * Call this in the delete-account flow to ensure IDB is actually empty before
 * the page reloads, preventing any async-race where the reload fires while the
 * IDB clear is still in progress.
 */
export async function clearAllIdbAsync(): Promise<void> {
    await Promise.allSettled([
        _clearGoogleAuthIdbAsync(),
        _clearCvDataIdbAsync(),
    ]);
}

export function clearUserScopedStorage(opts?: { clearAppData?: boolean }): void {
    // ── Auth tokens ───────────────────────────────────────────────────────────
    const authKeys = [
        'cv_gdrive_token',
        'cv_gdrive_expiry',
        'cv_gdrive_user',
        'cv_drive_last_sync',
        'procv:worker_session',
        'procv:worker_user',
    ];
    authKeys.forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem('procv:worker_session_temp');

    // ── Drive conflict baselines (mtime) ──────────────────────────────────────
    const mtimeKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('cv_drv_mtime:')) mtimeKeys.push(k);
    }
    mtimeKeys.forEach(k => localStorage.removeItem(k));

    // ── D1 sync hashes (forces fresh writes on next login) ────────────────────
    const hashKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('cv_builder:usync_')) hashKeys.push(k);
    }
    hashKeys.forEach(k => localStorage.removeItem(k));

    // ── Profile cache hashes (so re-login re-uploads) ─────────────────────────
    const cacheHashKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('procv:profile_hash_')) cacheHashKeys.push(k);
    }
    cacheHashKeys.forEach(k => localStorage.removeItem(k));

    // ── Restore-dismissal flags (next user gets offered restore) ──────────────
    sessionStorage.removeItem('procv:restore-dismissed');
    sessionStorage.removeItem('procv:d1-restore-dismissed');

    // ── Migration flag (next user gets fresh Drive migration) ─────────────────
    localStorage.removeItem('cv_builder:gdrive_migrated');

    // ── Account switch: wipe ALL cv_builder:* app data ────────────────────────
    // Only done when a different email is detected — not on normal logout.
    // This prevents a new user from seeing the previous user's CVs and profiles.
    if (opts?.clearAppData) {
        // ── Collect all keys first (mutating localStorage while iterating is unsafe) ──
        const allKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) allKeys.push(k);
        }

        // cv_builder:* (except deviceId — device-level, not user-level)
        allKeys
            .filter(k => k.startsWith('cv_builder:') && k !== 'cv_builder:deviceId')
            .forEach(k => localStorage.removeItem(k));

        // procv:* except the two account-switch keys (needed across reloads)
        allKeys
            .filter(k =>
                k.startsWith('procv:') &&
                k !== ACCOUNT_HASH_KEY &&
                k !== LAST_REAL_HASH_KEY,
            )
            .forEach(k => localStorage.removeItem(k));

        // Profile-room keys: p:${id}:jd / company / jobTitle / mode / purpose / keywords
        allKeys.filter(k => k.startsWith('p:')).forEach(k => localStorage.removeItem(k));

        // cv:* per-session state (cv:purpose, cv:jdKeywords, cv:targetCompany, cv:targetJobTitle)
        allKeys.filter(k => k.startsWith('cv:')).forEach(k => localStorage.removeItem(k));

        // ── Synchronous in-memory resets ─────────────────────────────────────────
        // These MUST happen before window.location.reload() so async effects that
        // fire between the wipe and the reload cannot read or write stale data.

        // 1. Nullify the StorageRouter Drive singleton (holds the old user's OAuth token).
        try { resetStorageRouter(); } catch { /* non-fatal */ }

        // 2. Clear the CV data in-memory cache and close its IDB connection.
        try { clearCVDataStore(); } catch { /* non-fatal */ }

        // 3. Write the IDB-skip sentinel SYNCHRONOUSLY so that on the next page load
        //    loadAuthState() ignores any stale Google auth entry that the async IDB
        //    deletion (below) may not have finished removing before the reload.
        try { localStorage.setItem(LS_AUTH_CLEARED, '1'); } catch { /* quota — non-fatal */ }

        // ── Async IDB wipes (fire-and-forget; sentinel above is the safety net) ──
        _clearCvDataIdb();
        _clearGoogleAuthIdb();
    }
}

/** Delete the Google auth IDB entirely so a stale token cannot silently re-auth the old user. */
function _clearGoogleAuthIdb(): void {
    try {
        const req = indexedDB.deleteDatabase('cv_builder_auth');
        req.onerror = () => {};    // non-fatal
        req.onsuccess = () => {};  // non-fatal
    } catch {
        // IndexedDB unavailable — safe to ignore
    }
}

/** Awaitable version of _clearGoogleAuthIdb — resolves when the database is deleted. */
function _clearGoogleAuthIdbAsync(): Promise<void> {
    return new Promise((resolve) => {
        try {
            const req = indexedDB.deleteDatabase('cv_builder_auth');
            req.onsuccess = () => resolve();
            req.onerror   = () => resolve(); // non-fatal — always resolve
            req.onblocked = () => resolve();
        } catch {
            resolve(); // IndexedDB unavailable — non-fatal
        }
    });
}

/** Wipe the cv_builder_cvdata IndexedDB store (non-fatal, fire-and-forget). */
function _clearCvDataIdb(): void {
    try {
        const req = indexedDB.open('cv_builder_cvdata');
        req.onsuccess = () => {
            const db = req.result;
            const stores = Array.from(db.objectStoreNames);
            if (stores.length === 0) { db.close(); return; }
            try {
                const tx = db.transaction(stores, 'readwrite');
                stores.forEach(s => tx.objectStore(s).clear());
                tx.oncomplete = () => db.close();
                tx.onerror   = () => db.close();
            } catch { db.close(); }
        };
    } catch {
        // IndexedDB unavailable — safe to ignore
    }
}

/** Awaitable version of _clearCvDataIdb — resolves when all stores are cleared. */
function _clearCvDataIdbAsync(): Promise<void> {
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open('cv_builder_cvdata');
            req.onerror = () => resolve(); // DB may not exist — non-fatal
            req.onsuccess = () => {
                const db = req.result;
                const stores = Array.from(db.objectStoreNames);
                if (stores.length === 0) { db.close(); resolve(); return; }
                try {
                    const tx = db.transaction(stores, 'readwrite');
                    stores.forEach(s => tx.objectStore(s).clear());
                    tx.oncomplete = () => { db.close(); resolve(); };
                    tx.onerror    = () => { db.close(); resolve(); }; // non-fatal
                } catch { db.close(); resolve(); }
            };
        } catch {
            resolve(); // IndexedDB unavailable — non-fatal
        }
    });
}
