/**
 * Shared storage error types used across the storage layer.
 */

/** Thrown (or event dispatched) when localStorage/IDB runs out of quota. */
export class StorageQuotaError extends Error {
    constructor(public readonly key: string, cause?: unknown) {
        super(`Storage quota exceeded while saving "${key}"`);
        this.name = 'StorageQuotaError';
        if (cause) this.cause = cause;
    }
}

// ── Custom DOM events ──────────────────────────────────────────────────────────

export function dispatchQuotaWarning(detail: { key: string; evicted: string[] }) {
    window.dispatchEvent(new CustomEvent('storage-quota-warning', { detail }));
}
