// services/storage/StorageRouter.ts
//
// Auth-aware storage router with write-through caching.
//
// When Google Drive is active:
//   • save()  → writes to localStorage FIRST (fast, synchronous-ish) then to Drive.
//               If Drive fails the local copy is still up-to-date.
//   • load()  → reads from Drive (authoritative), writes result to localStorage cache,
//               falls back to localStorage if Drive is unreachable.
//
// When Drive is not active (not signed in / token expired):
//   • Falls through to LocalStorageService (localStorage + IndexedDB).
//
// This write-through strategy ensures that synchronous consumers (e.g.
// geminiService reading directly from localStorage) always see fresh data,
// even when Google Drive is the primary storage backend.

import { IStorageService } from './IStorageService';
import { LocalStorageService } from './LocalStorageService';
import { DriveStorageService } from './DriveStorageService';

const TOKEN_KEY = 'cv_gdrive_token';
const EXPIRY_KEY = 'cv_gdrive_expiry';
const MIGRATION_FLAG = 'cv_builder:gdrive_migrated';

// ── Singletons ────────────────────────────────────────────────────────────
let _cache: LocalStorageService | null = null;
let _drive: DriveStorageService | null = null;

function getCacheService(): LocalStorageService {
    if (!_cache) _cache = new LocalStorageService();
    return _cache;
}

function getDriveService(token: string): DriveStorageService {
    if (!_drive || _drive.currentToken !== token) {
        _drive = new DriveStorageService(token);
    }
    return _drive;
}

// ── Write-through Drive wrapper ───────────────────────────────────────────
//
// Wraps DriveStorageService so that every save also updates the local
// cache and every load populates the local cache. This makes localStorage
// always contain a fresh copy of Drive data for synchronous consumers.

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
        // 1. Write to localStorage immediately so synchronous readers
        //    (e.g. geminiService) always see the freshest value.
        await this.local.save(key, data);

        // 2. Write to Drive. If this throws, the local copy is still good.
        //    The drive-save-error event will surface the error to the user.
        await this.drive.save(key, data);
    }

    async load<T = unknown>(key: string): Promise<T | null> {
        // 1. Try Drive first (it is the authoritative source).
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

export function isDriveActive(): boolean {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
    return !!(token && Date.now() < (expiry + 300000)); // +5 min buffer
}

/**
 * Migrates data from Browser to Google Drive.
 * SAFE: Only uploads if local data exists.
 */
export async function migrateLocalToDrive(
    onProgress?: (uploaded: number, total: number) => void
): Promise<void> {
    if (localStorage.getItem(MIGRATION_FLAG) === 'done') return;

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not signed in to Google');

    const cache = getCacheService();
    const drive = getDriveService(token);

    const allData = await cache.dumpAll();
    const entries = Object.entries(allData);

    if (entries.length === 0) {
        localStorage.setItem(MIGRATION_FLAG, 'done');
        return;
    }

    let uploaded = 0;
    for (const [key, value] of entries) {
        if (key === MIGRATION_FLAG) continue;
        await drive.save(key, value);
        uploaded++;
        onProgress?.(uploaded, entries.length);
    }

    localStorage.setItem(MIGRATION_FLAG, 'done');
}

/** Forced restore from Drive back to Browser (Emergency fallback) */
export async function restoreDriveToLocal(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not signed in to Google');

    const cache = getCacheService();
    const drive = getDriveService(token);

    const keys = await drive.list();
    for (const k of keys) {
        const data = await drive.load(k);
        if (data) await cache.save(k, data);
    }
}

export function resetMigrationFlag(): void {
    localStorage.removeItem(MIGRATION_FLAG);
}
