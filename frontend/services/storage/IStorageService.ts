// services/storage/IStorageService.ts
// The single contract every storage backend must satisfy.
// App code imports ONLY this — never a concrete implementation directly.

export interface IStorageService {
    /** Persist a value under a given key. */
    save(key: string, data: unknown): Promise<void>;

    /** Retrieve a value by key. Returns null if not found. */
    load<T = unknown>(key: string): Promise<T | null>;

    /** List all stored keys. */
    list(): Promise<string[]>;

    /** Remove a single key. */
    delete(key: string): Promise<void>;

    /**
     * Push any locally-pending writes to the remote backend.
     * No-op for LocalStorageService.
     */
    sync(): Promise<void>;

    /** True if this backend persists beyond the current browser session. */
    readonly isPersistent: boolean;

    /** Human-readable name shown in the Settings UI status badge. */
    readonly label: string;
}