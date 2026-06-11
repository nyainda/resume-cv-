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
 *  - cv_builder:deviceId    (device-level, not user-level)
 *  - procv:account_email_hash  (intentionally kept for account-switch detection)
 *
 * After an explicit sign-out, call stampSignedOut() so the guard in App.tsx
 * treats the NEXT sign-in (any user, including the same one) as a fresh
 * account-switch and wipes stale app data before rendering.
 */

/** localStorage key that stores the FNV-32 hash of the last signed-in email. */
export const ACCOUNT_HASH_KEY = 'procv:account_email_hash';

/**
 * Sentinel value written to ACCOUNT_HASH_KEY on explicit sign-out.
 * Any real email hash will differ from this, so the next sign-in always
 * triggers the account-switch wipe+reload — preventing a subsequent user
 * from seeing the previous user's cached app data.
 */
export const SIGNED_OUT_SENTINEL = 'signed_out';

/**
 * Write the signed-out sentinel.  Call this AFTER clearUserScopedStorage()
 * in every explicit sign-out handler so the account-switch guard fires on
 * the next sign-in.
 */
export function stampSignedOut(): void {
    try {
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
        // Collect all cv_builder:* keys (except deviceId — that's device-level)
        const appKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith('cv_builder:') && k !== 'cv_builder:deviceId') {
                appKeys.push(k);
            }
        }
        appKeys.forEach(k => localStorage.removeItem(k));

        // Also clear any other procv:* keys that hold per-user app state
        const procvAppKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (
                k?.startsWith('procv:') &&
                k !== ACCOUNT_HASH_KEY // keep — needed for future switch detection
            ) {
                procvAppKeys.push(k);
            }
        }
        procvAppKeys.forEach(k => localStorage.removeItem(k));

        // Clear IndexedDB cv_builder_cvdata (large CV JSON blobs)
        _clearCvDataIdb();
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
