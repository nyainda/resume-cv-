import { clearCVDataStore } from '../services/storage/cvDataStore';
import { resetStorageRouter } from '../services/storage/StorageRouter';

const LS_AUTH_CLEARED = 'procv:google_auth_cleared';

/**
 * Sentinel written synchronously to localStorage before window.location.reload()
 * when a full app-data wipe is in progress.  On the next boot, restoreLocalStorageFromIDB()
 * checks for this key and skips its restore — preventing stale IDB app data (from the
 * previous user) from being re-loaded into localStorage before React mounts.
 *
 * This is the parallel of LS_AUTH_CLEARED (which guards the Google auth IDB) but
 * covers the cv_builder_appdata IDB store used for profiles, CVs, etc.
 */
export const LS_APPDATA_CLEARED = 'cv_appdata_cleared';

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
        _clearAppDataIdbAsync(),
        _clearSyncQueueIdbAsync(),
        _clearKeyVaultIdbAsync(),
    ]);
}

/**
 * Nuclear browser-data reset — wipes EVERYTHING this app has ever stored
 * in this browser: localStorage, sessionStorage, all three IndexedDB databases,
 * the Cache API (service-worker caches), and any first-party cookies.
 *
 * Use for the "Reset browser data" emergency button and as the final step
 * of account deletion to guarantee a truly clean slate on the next load.
 *
 * Does NOT touch any server-side data — call deleteAccountWorker() first if
 * you also want the cloud session removed.
 */
export async function clearAllBrowserStorage(): Promise<void> {
    // 1. Write IDB-skip sentinels SYNCHRONOUSLY so that restoreLocalStorageFromIDB()
    //    and loadAuthState() skip any stale IDB data on the very next boot, even if
    //    the async deletes below haven't finished by the time the page reloads.
    try { localStorage.setItem(LS_AUTH_CLEARED, '1'); } catch { /* quota — non-fatal */ }
    try { localStorage.setItem(LS_APPDATA_CLEARED, '1'); } catch { /* quota — non-fatal */ }

    // 2. Flush in-memory caches so no async effect can read stale data after this.
    try { resetStorageRouter(); } catch { /* non-fatal */ }
    try { clearCVDataStore(); } catch { /* non-fatal */ }

    // 3. Wipe all localStorage.
    //    Collect keys into an array first — mutating localStorage while iterating
    //    its numeric indices shifts subsequent indices and skips keys.
    try {
        const allKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) allKeys.push(k);
        }
        allKeys.forEach(k => localStorage.removeItem(k));
    } catch { /* non-fatal */ }

    // 4. Wipe sessionStorage.
    try { sessionStorage.clear(); } catch { /* non-fatal */ }

    // 5. Delete all five IndexedDB databases — awaited so they finish before reload.
    //    cv_builder_sync holds the pending optimistic sync queue; pending items must
    //    be deleted (not just cleared) so they cannot replay old profile writes on
    //    the next boot under a different session token.
    //    cv_builder_keyvault holds the AES-GCM master key used to encrypt API keys;
    //    deleting it forces a fresh key to be generated for the next account.
    await Promise.allSettled([
        _clearGoogleAuthIdbAsync(),
        _clearCvDataIdbAsync(),
        _clearAppDataIdbAsync(),
        _clearSyncQueueIdbAsync(),
        _clearKeyVaultIdbAsync(),
    ]);

    // 6. Delete all Cache API entries (service-worker / Workbox caches).
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
    } catch { /* caches API unavailable or blocked — non-fatal */ }

    // 7. Expire all first-party cookies visible to JavaScript.
    //    HttpOnly cookies (set by a server, such as procv_session) cannot be
    //    cleared from JavaScript — the browser sends a credential-bearing request
    //    to the sign-out endpoint which responds with Set-Cookie: Max-Age=0 to
    //    clear the HttpOnly cookie server-side.  This loop only catches any
    //    non-HttpOnly cookies that JavaScript can see.
    try {
        document.cookie.split(';').forEach(cookie => {
            const name = cookie.trim().split('=')[0];
            if (name) {
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            }
        });
    } catch { /* non-fatal */ }
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
    // After user-namespace refactor, mtime keys are prefixed: u_<uid>:cv_drv_mtime:*
    // Match both the old unprefixed form and the new user-scoped form.
    const mtimeKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith('cv_drv_mtime:') || k.includes(':cv_drv_mtime:')) mtimeKeys.push(k);
    }
    mtimeKeys.forEach(k => localStorage.removeItem(k));

    // ── D1 sync hashes (forces fresh writes on next login) ────────────────────
    // IMPORTANT: Only clear the *hash* (dedup) keys — NOT the timestamp keys.
    // Timestamp keys (`usync_slot_ts:*`) are merge-conflict markers: if they are
    // cleared, `getLastSyncTimestamp()` returns 0 on the next sign-in, making
    // `d1Slot.updated_at > 0 + 10_000` always true → D1 always wins → local
    // edits made in the last 30 s before sign-out are silently overwritten.
    // Timestamps contain no auth credentials, so they are safe to keep across
    // sign-out cycles. Slot UUIDs ensure they never leak between users.
    const hashKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const isHashKey =
            k.startsWith('cv_builder:usync_slot_hash:') ||
            k.includes(':cv_builder:usync_slot_hash:') ||
            k === 'cv_builder:usync_prefs_hash' ||
            k.includes(':cv_builder:usync_prefs_hash');
        if (isHashKey) hashKeys.push(k);
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

        // New user-scoped namespace keys: u_<userId>:* and anon:*
        allKeys
            .filter(k => k.startsWith('u_') || k.startsWith('anon:'))
            .forEach(k => localStorage.removeItem(k));

        // ── Legacy unprefixed keys (written before cv_builder: prefix was added) ──
        // These are NOT caught by the prefix filters above but are read as fallbacks
        // by useStorage() and the migration effects in App.tsx. If left behind, the
        // next user on this device inherits the previous user's CVs, profiles, and data.
        const LEGACY_APP_KEYS = [
            'profiles',
            'currentCV',
            'savedCVs',
            'savedCoverLetters',
            'trackedApps',
            'starStories',
            'template',
        ];
        LEGACY_APP_KEYS.forEach(k => localStorage.removeItem(k));

        // ── Synchronous in-memory resets ─────────────────────────────────────────
        // These MUST happen before window.location.reload() so async effects that
        // fire between the wipe and the reload cannot read or write stale data.

        // 1. Nullify the StorageRouter Drive singleton (holds the old user's OAuth token).
        try { resetStorageRouter(); } catch { /* non-fatal */ }

        // 2. Clear the CV data in-memory cache and close its IDB connection.
        try { clearCVDataStore(); } catch { /* non-fatal */ }

        // 3. Write IDB-skip sentinels SYNCHRONOUSLY so that on the next page load
        //    both loadAuthState() and restoreLocalStorageFromIDB() skip any stale
        //    IDB entries that the async wipes below may not have finished removing
        //    before the reload fires.
        try { localStorage.setItem(LS_AUTH_CLEARED, '1'); } catch { /* quota — non-fatal */ }
        try { localStorage.setItem(LS_APPDATA_CLEARED, '1'); } catch { /* quota — non-fatal */ }

        // ── Async IDB wipes (fire-and-forget; sentinels above are the safety net) ──
        _clearCvDataIdb();
        _clearGoogleAuthIdb();
        _clearAppDataIdb();
    }
}

// ─── IDB helpers ────────────────────────────────────────────────────────────
//
// After the user-partitioned storage refactor (May 2026), IDB database names
// are user-scoped: e.g. `cv_builder_sync_u_12345` or `cv_builder_sync_anon`.
// The un-suffixed base names (e.g. `cv_builder_sync`) no longer exist for
// users who have signed in at least once since the refactor.
//
// Every delete helper therefore:
//   1. Deletes the base name (backward compat for pre-refactor browsers).
//   2. Uses indexedDB.databases() — where available — to enumerate and delete
//      every `${base}_u_*` and `${base}_anon` variant.
//
// This matches the pattern used by wipeLocalAppData() in AuthContext.tsx.

/**
 * Delete one IDB database by exact name (awaitable, non-fatal).
 */
function _deleteDbAsync(name: string): Promise<void> {
    return new Promise((resolve) => {
        try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => resolve();
            req.onerror   = () => resolve();
            req.onblocked = () => resolve();
        } catch {
            resolve();
        }
    });
}

/**
 * Delete a database and ALL user-scoped variants of it.
 *
 * Deletes `base`, `base_u_*`, and `base_anon` — covering both the old
 * un-namespaced name (pre-refactor) and every per-user name (post-refactor).
 *
 * Falls back gracefully on browsers that don't support indexedDB.databases().
 */
async function _deleteAllVariantsAsync(base: string): Promise<void> {
    // Always delete the base name (pre-refactor browsers / first-time users)
    await _deleteDbAsync(base);

    // Enumerate live databases and delete every variant that matches this base
    if (typeof indexedDB.databases === 'function') {
        try {
            const all = await indexedDB.databases();
            await Promise.all(
                all
                    .map(d => d.name ?? '')
                    .filter(n =>
                        n === base ||
                        n.startsWith(`${base}_u_`) ||
                        n.startsWith(`${base}_anon`),
                    )
                    .map(_deleteDbAsync),
            );
        } catch { /* indexedDB.databases() unavailable or blocked — already handled above */ }
    }
}

// ── Named helpers (called by clearAllIdbAsync / clearAllBrowserStorage) ─────

function _clearGoogleAuthIdbAsync(): Promise<void> {
    // Google auth DB is not user-scoped (it's device-level via Google's own IDB).
    // Delete only the base name.
    return _deleteDbAsync('cv_builder_auth');
}

function _clearCvDataIdbAsync(): Promise<void> {
    // cv_builder_cvdata holds per-user CV HTML content.
    // After namespace refactor: cv_builder_cvdata_u_<uid>.
    return _deleteAllVariantsAsync('cv_builder_cvdata');
}

function _clearAppDataIdbAsync(): Promise<void> {
    // cv_builder_appdata mirrors ALL app data so it survives "Clear cache".
    // After namespace refactor: cv_builder_appdata_u_<uid>.
    // Must be DELETED (not cleared) so restoreLocalStorageFromIDB() doesn't
    // reload stale entries on the next boot.
    return _deleteAllVariantsAsync('cv_builder_appdata');
}

function _clearSyncQueueIdbAsync(): Promise<void> {
    // cv_builder_sync holds pending optimistic profile/slot writes.
    // After namespace refactor: cv_builder_sync_u_<uid>.
    // Must be deleted so no stale item replays under a new session.
    return _deleteAllVariantsAsync('cv_builder_sync');
}

function _clearKeyVaultIdbAsync(): Promise<void> {
    // cv_builder_keyvault holds the AES-GCM master key for encrypting API keys.
    // Not user-scoped (key is device-level) but must be wiped on account delete
    // so the new account generates a fresh key.
    return _deleteDbAsync('cv_builder_keyvault');
}

// ── Fire-and-forget sync variants (used by clearUserScopedStorage) ──────────

function _clearGoogleAuthIdb(): void {
    _deleteDbAsync('cv_builder_auth').catch(() => {});
}

function _clearCvDataIdb(): void {
    _deleteAllVariantsAsync('cv_builder_cvdata').catch(() => {});
}

function _clearAppDataIdb(): void {
    _deleteAllVariantsAsync('cv_builder_appdata').catch(() => {});
}
