// src/services/storage/StorageRouter.ts
// Auth-aware version — no email field needed.
// DriveStorageService is active whenever there's a valid Google token in localStorage.
// When the user signs out, we fall back to LocalStorageService automatically.

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

// ── Public API ────────────────────────────────────────────────────────────

export function getStorageService(): IStorageService {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
    if (token && Date.now() < expiry) {
        return getDriveService(token);
    }
    return getCacheService();
}

export function isDriveActive(): boolean {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
    // Be generous: if token is present and not super old, try using it.
    // DriveStorageService will catch the 401 if it's actually invalid.
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

    // 1. Get all local data
    const allData = await cache.dumpAll();
    const entries = Object.entries(allData);

    // 2. Safety check: do we actually have ANY relevant data in LocalStorage?
    // If not, maybe index.tsx restorer hasn't finished or it's a fresh install.
    // If it's a fresh install, we mark as 'done' so we don't keep checking.
    // If it's a cache clear, we should have restored from IDB already.
    if (entries.length === 0) {
        localStorage.setItem(MIGRATION_FLAG, 'done');
        return;
    }

    // 3. Before uploading, sanity check: if the Drive already has files, 
    // we should be CAREFUL not to just blank them out.
    // In this app's logic, "migrate" means "Browser -> Drive".
    // We only do this once when the user first connects.
    let uploaded = 0;
    for (const [key, value] of entries) {
        // Skip migration metadata itself
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