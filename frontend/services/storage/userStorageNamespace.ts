/**
 * userStorageNamespace.ts
 *
 * Single source of truth for the current user's storage namespace.
 *
 * Why: All localStorage / IndexedDB keys and DB names are prefixed with
 * `u_<userId>:` so two accounts on the same device never share storage.
 *
 * CF is the authority — the userId comes from the validated session.
 * Set it as early as possible after login; clear it on logout.
 *
 * Rules:
 *  - When userId IS set  → prefix is `u_<userId>:`
 *  - When userId is null → prefix is `anon:` (anonymous / not logged in)
 *    Anonymous data is intentionally NOT migrated when a user logs in —
 *    they start clean. This prevents data from a previous unknown user
 *    bleeding into a newly created account.
 *
 * IDB DB name suffix: `_u_<userId>` or `_anon`
 */

const _NS_KEY = 'procv:storage_ns';   // localStorage — survives reload, cleared on logout

// In-memory cache (avoids repeated localStorage reads in tight loops)
let _cachedUserId: string | null = null;
let _initialised = false;

/**
 * Call once at app start to restore the namespace from the last session.
 * This runs before restoreLocalStorageFromIDB() so the correct prefix is
 * already active by the time the IDB restore tries to write keys.
 */
export function initStorageNamespace(): void {
    if (_initialised) return;
    _initialised = true;
    try {
        const stored = localStorage.getItem(_NS_KEY);
        _cachedUserId = stored ?? null;
    } catch {
        _cachedUserId = null;
    }
}

/**
 * Set the active user. Called immediately after a successful CF session
 * validation (login, session restore, account switch).
 *
 * Persists to localStorage so the correct namespace is restored on reload
 * before the session re-validates (prevents a single-frame flicker where
 * hooks read from the wrong namespace).
 */
export function setStorageUser(userId: string): void {
    _cachedUserId = userId;
    _initialised = true;
    try {
        localStorage.setItem(_NS_KEY, userId);
    } catch { /* quota — non-fatal; in-memory cache still works */ }
}

/**
 * Clear the active user. Called on sign-out and account deletion.
 * Subsequent reads/writes go to the anonymous namespace.
 */
export function clearStorageUser(): void {
    _cachedUserId = null;
    try {
        localStorage.removeItem(_NS_KEY);
    } catch { /* non-fatal */ }
}

/** Returns the current userId (null = anonymous / not logged in). */
export function getStorageUserId(): string | null {
    if (!_initialised) initStorageNamespace();
    return _cachedUserId;
}

/**
 * Returns the localStorage key prefix for the current user.
 * e.g. `u_abc123:cv_builder:profiles`
 */
export function getUserPrefix(): string {
    const uid = getStorageUserId();
    return uid ? `u_${uid}:` : 'anon:';
}

/**
 * Returns a user-scoped IDB database name.
 * e.g. `cv_builder_cvdata_u_abc123` or `cv_builder_cvdata_anon`
 */
export function getScopedDbName(baseName: string): string {
    const uid = getStorageUserId();
    return uid ? `${baseName}_u_${uid}` : `${baseName}_anon`;
}

/**
 * One-time migration: copy all keys from the OLD unprefixed namespace
 * (legacy keys like `cv_builder:profiles`) to the new user-scoped namespace.
 *
 * Safe to call multiple times — checks the migration-done flag first.
 * Only migrates if the new namespace has no `profiles` key yet (first login).
 *
 * Returns true if migration was performed.
 */
export async function migrateToUserNamespace(userId: string): Promise<boolean> {
    const flagKey = `procv:ns_migrated_${userId}`;
    if (localStorage.getItem(flagKey)) return false;

    const newPrefix = `u_${userId}:`;
    const oldPrefixes = ['cv_builder:', 'p:', 'cv:', 'cv_drv_mtime:'];

    // Only migrate if the new namespace is empty (first login on this device)
    const alreadyHasData = localStorage.getItem(`${newPrefix}cv_builder:profiles`) !== null;
    if (alreadyHasData) {
        localStorage.setItem(flagKey, '1');
        return false;
    }

    // Check if there is any old-prefixed data to migrate
    const keysToMigrate: Array<{ old: string; new: string }> = [];
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) allKeys.push(k);
    }

    for (const k of allKeys) {
        const matchedPrefix = oldPrefixes.find(p => k.startsWith(p));
        if (!matchedPrefix) continue;
        // Skip device-level and auth-level keys that should NOT be migrated
        if (k === 'cv_builder:deviceId') continue;
        if (k === 'procv:account_email_hash') continue;
        if (k === 'procv:last_real_email_hash') continue;
        if (k === 'procv:worker_session') continue;
        if (k === 'procv:worker_user') continue;
        if (k.startsWith('procv:')) continue; // all procv: keys are auth/device-level
        keysToMigrate.push({ old: k, new: newPrefix + k });
    }

    if (keysToMigrate.length === 0) {
        localStorage.setItem(flagKey, '1');
        return false;
    }

    // Copy old → new, then remove old
    for (const { old: oldKey, new: newKey } of keysToMigrate) {
        try {
            const val = localStorage.getItem(oldKey);
            if (val !== null) {
                localStorage.setItem(newKey, val);
                localStorage.removeItem(oldKey);
            }
        } catch { /* quota on write — skip this key, keep old */ }
    }

    // Also migrate IndexedDB appdata: copy all `cv_builder:` entries to the new prefix
    try {
        const { idbAppGet, idbAppSet } = await import('./AppDataPersistence');
        // We can't enumerate IDB keys directly here without opening the old DB,
        // so we rely on the localStorage migration above + IDB will repopulate
        // from localStorage on next writes. The old IDB DB will be left in place
        // and cleared by the normal boot sentinel logic on next sign-out.
        void idbAppGet; void idbAppSet; // suppress unused warning
    } catch { /* best-effort */ }

    localStorage.setItem(flagKey, '1');
    console.log(`[StorageNS] Migrated ${keysToMigrate.length} keys to user namespace u_${userId}`);
    return true;
}
