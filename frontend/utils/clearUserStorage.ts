/**
 * clearUserScopedStorage — call as step 7 of every sign-out sequence.
 *
 * Clears all per-user tokens, Drive conflict baselines, D1 sync hashes,
 * and restore-dismissal flags so the next user starts with a clean slate.
 *
 * Does NOT clear:
 *  - cv_builder:deviceId    (device-level, not user-level)
 *  - cv_builder:*           (app data — profiles stay on-device after logout)
 */
export function clearUserScopedStorage(): void {
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
}
