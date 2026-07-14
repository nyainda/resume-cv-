// services/storage/StorageRouter.ts
//
// Storage router — reads/writes through LocalStorageService (localStorage + IDB).
// D1 cloud sync is handled separately by userDataCloudService.ts / syncQueue.ts.
// Google Drive has been removed; D1 is the sole cloud authority.

import { IStorageService } from './IStorageService';
import { LocalStorageService } from './LocalStorageService';

let _cache: LocalStorageService | null = null;

function getCacheService(): LocalStorageService {
    if (!_cache) _cache = new LocalStorageService();
    return _cache;
}

/** Returns the active storage service (localStorage + IDB). */
export function getStorageService(): IStorageService {
    return getCacheService();
}

/**
 * Always returns false — Google Drive has been removed.
 * Kept as a no-op stub so any call sites missed during cleanup compile safely.
 */
export function isDriveActive(): boolean {
    return false;
}

/**
 * Reset the storage singleton. Call as part of every account-switch wipe so
 * the cached LocalStorageService instance cannot bleed across accounts.
 */
export function resetStorageRouter(): void {
    _cache = null;
}
