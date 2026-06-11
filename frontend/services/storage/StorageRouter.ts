// services/storage/StorageRouter.ts
//
// Auth-aware storage router with write-through caching.
//
// When Google Drive is active:
//   • save()  → writes to localStorage FIRST (fast, synchronous-ish) then to Drive.
//               If Drive fails the local copy is still up-to-date.
//               If Drive returns a CONFLICT, we dispatch drive-conflict and skip
//               overwriting Drive — the user will decide what to do.
//   • load()  → reads from Drive (authoritative), writes result to localStorage cache,
//               falls back to localStorage if Drive is unreachable.
//
// When Drive is not active (not signed in / token expired):
//   • Falls through to LocalStorageService (localStorage + IndexedDB).

import { IStorageService } from './IStorageService';
import { LocalStorageService } from './LocalStorageService';
import { DriveStorageService } from './DriveStorageService';
import { DriveConflictError, dispatchConflict } from './storageErrors';

const TOKEN_KEY = 'cv_gdrive_token';
const EXPIRY_KEY = 'cv_gdrive_expiry';

// Bug 3 fix: scope migration flag per user so account-switching doesn't
// skip migration for a second user (or worse, overwrite Drive with empty data).
function getMigrationFlagKey(email: string): string {
    const safe = btoa(email).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
    return `cv_builder:gdrive_migrated:${safe}`;
}

// Legacy global flag — kept for backward compat check only
const MIGRATION_FLAG_LEGACY = 'cv_builder:gdrive_migrated';

// ── Singletons ────────────────────────────────────────────────────────────
let _cache: LocalStorageService | null = null;
let _drive: DriveStorageService | null = null;

function getCacheService(): LocalStorageService {
    if (!_cache) _cache = new LocalStorageService();
    return _cache;
}

function getDriveService(token: string, email?: string): DriveStorageService {
    if (!_drive || _drive.currentToken !== token) {
        _drive = new DriveStorageService(token, email);
    }
    return _drive;
}

// ── Write-through Drive wrapper ───────────────────────────────────────────

class WriteThroughDriveService implements IStorageService {
    readonly isPersistent = true;
    readonly label = 'Google Drive (write-through)';

    private drive: DriveStorageService;
    private local: LocalStorageService;

    constructor(drive: DriveStorageService, local: LocalStorageService) {
        this.drive = drive;
        this.local = local;
    }

    async save(key: string, data: unknown): Promise<void> {
        // 1. Write to localStorage immediately so synchronous readers always
        //    see the freshest value, regardless of Drive outcome.
        await this.local.save(key, data);

        // 2. Write to Drive with optimistic-locking conflict check.
        try {
            await this.drive.save(key, data);
        } catch (err) {
            if (err instanceof DriveConflictError) {
                // Dispatch an event so the UI can show the conflict dialog.
                // We do NOT overwrite Drive — local has the user's edits, which
                // they can choose to push or discard via the conflict UI.
                dispatchConflict({
                    key: err.key,
                    localData: err.localData,
                    driveData: err.driveData,
                    driveModifiedAt: err.driveModifiedAt,
                    storedModifiedAt: err.storedModifiedAt,
                });
                return; // don't re-throw — local write already succeeded
            }
            // Non-conflict Drive error — surface it but local write is good.
            throw err;
        }
    }

    async load<T = unknown>(key: string): Promise<T | null> {
        // 1. Try Drive first (authoritative source).
        try {
            const driveData = await this.drive.load<T>(key);
            if (driveData !== null) {
                // Populate the local cache so synchronous reads are up-to-date.
                await this.local.save(key, driveData);
                return driveData;
            }
        } catch {
            // Drive unreachable — fall through to local cache.
        }

        // 2. Fall back to the local cache (IndexedDB → localStorage).
        return this.local.load<T>(key);
    }

    async list(): Promise<string[]> {
        try {
            return await this.drive.list();
        } catch {
            return this.local.list();
        }
    }

    async delete(key: string): Promise<void> {
        await this.local.delete(key);
        try { await this.drive.delete(key); } catch { /* best-effort */ }
    }

    async sync(): Promise<void> { }

    // ── Conflict resolution helpers exposed to UI ─────────────────────────

    /** Force-push local data to Drive, bypassing conflict check. */
    async forceSaveToDrive(key: string, data: unknown): Promise<void> {
        await this.drive.forceSave(key, data);
    }

    /** Pull Drive version of a key into localStorage (discards local). */
    async pullFromDrive(key: string): Promise<unknown> {
        const driveData = await this.drive.fetchDriveData(key);
        if (driveData !== null) {
            await this.local.save(key, driveData);
        }
        return driveData;
    }
}

// ── Public API ────────────────────────────────────────────────────────────

export function getStorageService(): IStorageService {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
    if (token && Date.now() < expiry) {
        const drive = getDriveService(token);
        const local = getCacheService();
        return new WriteThroughDriveService(drive, local);
    }
    return getCacheService();
}

/** Returns the WriteThroughDriveService if Drive is active, null otherwise. */
export function getDriveRouter(): WriteThroughDriveService | null {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
    if (token && Date.now() < expiry) {
        const drive = getDriveService(token);
        const local = getCacheService();
        return new WriteThroughDriveService(drive, local);
    }
    return null;
}

export function isDriveActive(): boolean {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
    return !!(token && Date.now() < (expiry + 300000)); // +5 min buffer
}

/**
 * Migrates data from Browser to Google Drive.
 * SAFE: Only uploads if local data exists.
 *
 * Bug 3 fix: pass userEmail so the flag is scoped per account.
 * Falls back to the legacy global flag if email is not available,
 * then upgrades it on completion.
 */
export async function migrateLocalToDrive(
    onProgress?: (uploaded: number, total: number) => void,
    userEmail?: string,
): Promise<void> {
    const flagKey = userEmail ? getMigrationFlagKey(userEmail) : MIGRATION_FLAG_LEGACY;

    // Also honour the legacy flag so existing users don't re-migrate
    if (
        localStorage.getItem(flagKey) === 'done' ||
        (userEmail && localStorage.getItem(MIGRATION_FLAG_LEGACY) === 'done')
    ) {
        if (userEmail && localStorage.getItem(flagKey) !== 'done') {
            // Upgrade legacy flag to scoped flag
            localStorage.setItem(flagKey, 'done');
        }
        return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not signed in to Google');

    const cache = getCacheService();
    const drive = getDriveService(token, userEmail);

    const allData = await cache.dumpAll();
    const entries = Object.entries(allData);

    if (entries.length === 0) {
        localStorage.setItem(flagKey, 'done');
        return;
    }

    let uploaded = 0;
    for (const [key, value] of entries) {
        if (key === flagKey || key === MIGRATION_FLAG_LEGACY) continue;
        // Skip conflict check during migration — we are the authoritative source
        await drive.forceSave(key, value);
        uploaded++;
        onProgress?.(uploaded, entries.length);
    }

    localStorage.setItem(flagKey, 'done');
}

/** Forced restore from Drive back to Browser (Emergency fallback) */
export async function restoreDriveToLocal(userEmail?: string): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not signed in to Google');

    const cache = getCacheService();
    const drive = getDriveService(token, userEmail);

    const keys = await drive.list();
    for (const k of keys) {
        const data = await drive.load(k);
        if (data) await cache.save(k, data);
    }
}

/** Returns true if this user has already migrated their local data to Drive. */
export function hasMigratedToDrive(userEmail?: string): boolean {
    if (userEmail && localStorage.getItem(getMigrationFlagKey(userEmail)) === 'done') return true;
    return localStorage.getItem(MIGRATION_FLAG_LEGACY) === 'done';
}

export function resetMigrationFlag(userEmail?: string): void {
    if (userEmail) localStorage.removeItem(getMigrationFlagKey(userEmail));
    localStorage.removeItem(MIGRATION_FLAG_LEGACY);
}
