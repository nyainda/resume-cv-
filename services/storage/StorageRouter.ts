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
    return !!(token && Date.now() < expiry);
}

export async function migrateLocalToDrive(
    onProgress?: (uploaded: number, total: number) => void
): Promise<void> {
    if (localStorage.getItem(MIGRATION_FLAG) === 'done') return;

    const cache = getCacheService();
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('Not signed in to Google');

    const drive = getDriveService(token);
    const allData = await cache.dumpAll();
    const entries = Object.entries(allData);

    if (entries.length === 0) {
        localStorage.setItem(MIGRATION_FLAG, 'done');
        return;
    }

    let uploaded = 0;
    for (const [key, value] of entries) {
        await drive.save(key, value);
        uploaded++;
        onProgress?.(uploaded, entries.length);
    }

    localStorage.setItem(MIGRATION_FLAG, 'done');
}

export function resetMigrationFlag(): void {
    localStorage.removeItem(MIGRATION_FLAG);
}