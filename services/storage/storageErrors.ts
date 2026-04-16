/**
 * Shared storage error types used across the storage layer.
 */

/** Thrown when Drive's remote file has been modified since we last loaded it. */
export class DriveConflictError extends Error {
    constructor(
        public readonly key: string,
        public readonly localData: unknown,
        public readonly driveData: unknown,
        public readonly driveModifiedAt: string,
        public readonly storedModifiedAt: string,
    ) {
        super(`Drive conflict on key "${key}": remote was modified at ${driveModifiedAt}, local expected ${storedModifiedAt}`);
        this.name = 'DriveConflictError';
    }
}

/** Thrown (or event dispatched) when localStorage/IDB runs out of quota. */
export class StorageQuotaError extends Error {
    constructor(public readonly key: string, cause?: unknown) {
        super(`Storage quota exceeded while saving "${key}"`);
        this.name = 'StorageQuotaError';
        if (cause) this.cause = cause;
    }
}

// ── Custom DOM events ──────────────────────────────────────────────────────────

export function dispatchConflict(detail: {
    key: string;
    localData: unknown;
    driveData: unknown;
    driveModifiedAt: string;
    storedModifiedAt: string;
}) {
    window.dispatchEvent(new CustomEvent('drive-conflict', { detail }));
}

export function dispatchQuotaWarning(detail: { key: string; evicted: string[] }) {
    window.dispatchEvent(new CustomEvent('storage-quota-warning', { detail }));
}
