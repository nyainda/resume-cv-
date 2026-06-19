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
 * Sentinel value written to ACCOUNT_HASH_KEY on explicit sign-out.
 * Tells the guard that a sign-out happened; it consults LAST_REAL_HASH_KEY
 * to decide whether to wipe (different user) or just proceed (same user).
 */
export const SIGNED_OUT_SENTINEL = 'signed_out';

/**
 * Write the signed-out sentinel.  Call this AFTER clearUserScopedStorage()
 * in every explicit sign-out handler.
 *
 * Preserves the current user's email hash in LAST_REAL_HASH_KEY so that when
 * the next sign-in fires the account-switch guard, it can detect "same user
 * returning" and skip the wipe+reload (which was causing the double-login bug).
 */
export function stampSignedOut(): void {
    try {
        const currentHash = localStorage.getItem(ACCOUNT_HASH_KEY);
        // Save who signed out so the guard can compare on the next sign-in.
        // Only save a real hash — never re-save the sentinel itself.
        if (currentHash && currentHash !== SIGNED_OUT_SENTINEL) {
            localStorage.setItem(LAST_REAL_HASH_KEY, currentHash);
        }
        localStorage.setItem(ACCOUNT_HASH_KEY, SIGNED_OUT_SENTINEL);
    } catch {
        // localStorage unavailable — non-fatal
    }
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
