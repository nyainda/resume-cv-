/**
 * KeyVault — AES-GCM 256-bit encryption for API keys.
 *
 * Architecture:
 *  - The master CryptoKey lives ONLY in a dedicated IndexedDB store
 *    ("cv_builder_keyvault") that is NEVER synced to Google Drive or
 *    exported anywhere else.
 *  - Plaintext keys exist only in JS memory (never written to any store).
 *  - Every value written to localStorage / IDB / Drive is an opaque blob:
 *      "enc:v1:<base64(IV[12] + ciphertext)>"
 *  - If the vault is unavailable (private browsing, IDB error) the system
 *    degrades gracefully — values are stored as plaintext with a warning.
 */

const VAULT_DB_NAME    = 'cv_builder_keyvault';
const VAULT_DB_VERSION = 1;
const VAULT_STORE      = 'master';
const MASTER_KEY_ID    = 'aes_gcm_v1';
const ENC_PREFIX       = 'enc:v1:';

// ── Fields on ApiSettings that should be encrypted ───────────────────────────
const SENSITIVE_FIELDS: string[] = [
    'apiKey',
    'groqApiKey',
    'claudeApiKey',
    'tavilyApiKey',
    'brevoApiKey',
    'jsearchApiKey',
];

// ── Internal state ────────────────────────────────────────────────────────────
let _masterKey: CryptoKey | null = null;
let _initPromise: Promise<void> | null = null;

// ── IDB helpers ───────────────────────────────────────────────────────────────

function openVaultDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(VAULT_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror  = () => reject(req.error);
    });
}

async function vaultGet(db: IDBDatabase, key: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(VAULT_STORE, 'readonly');
        const req = tx.objectStore(VAULT_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

async function vaultPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx  = db.transaction(VAULT_STORE, 'readwrite');
        const req = tx.objectStore(VAULT_STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
    });
}

// ── Codec helpers ─────────────────────────────────────────────────────────────

function bufToB64(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string): Uint8Array {
    const bin = atob(b64);
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// ── Core Crypto ───────────────────────────────────────────────────────────────

async function generateMasterKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,    // extractable so we can store the JWK
        ['encrypt', 'decrypt']
    );
}

async function exportKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
    return crypto.subtle.exportKey('jwk', key);
}

async function importKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the vault.  Call once at app startup.
 * Idempotent — safe to call multiple times.
 */
export function init(): Promise<void> {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
        try {
            const db  = await openVaultDB();
            const jwk = await vaultGet(db, MASTER_KEY_ID) as JsonWebKey | undefined;

            if (jwk && typeof jwk === 'object' && (jwk as JsonWebKey).k) {
                // Existing key — import it
                _masterKey = await importKeyJwk(jwk as JsonWebKey);
            } else {
                // First run — generate & persist
                _masterKey = await generateMasterKey();
                await vaultPut(db, MASTER_KEY_ID, await exportKeyJwk(_masterKey));
            }
        } catch (err) {
            // IDB unavailable (e.g. Firefox private mode).
            // Fall through: _masterKey stays null → plaintext fallback.
            console.warn('[KeyVault] Could not initialize — keys will be stored without encryption.', err);
        }
    })();
    return _initPromise;
}

export function isAvailable(): boolean {
    return _masterKey !== null;
}

/**
 * Encrypt a plaintext string.
 * Returns  "enc:v1:<base64>"  or  the original plaintext if the vault is unavailable.
 */
export async function encrypt(plaintext: string | null | undefined): Promise<string | null> {
    if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext ?? null;
    if (!_masterKey) return plaintext;          // graceful degradation

    const iv         = crypto.getRandomValues(new Uint8Array(12));
    const encoded    = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _masterKey, encoded);

    // Prepend IV to ciphertext so they travel together
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);

    return ENC_PREFIX + bufToB64(combined.buffer);
}

/**
 * Decrypt a blob produced by `encrypt()`.
 * Passthrough for non-encrypted values (migration compatibility).
 */
export async function decrypt(blob: string | null | undefined): Promise<string | null> {
    if (blob === null || blob === undefined || blob === '') return blob ?? null;
    if (!blob.startsWith(ENC_PREFIX)) return blob;   // plaintext passthrough (migration)
    if (!_masterKey) return blob;                     // can't decrypt — return blob as-is

    try {
        const combined  = b64ToBuf(blob.slice(ENC_PREFIX.length));
        const iv        = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            _masterKey,
            ciphertext
        );
        return new TextDecoder().decode(decrypted);
    } catch {
        // Decryption failed (wrong key / corrupted data) — surface nothing
        console.error('[KeyVault] Decryption failed — returning null');
        return null;
    }
}

/**
 * Encrypt all sensitive fields in an ApiSettings-shaped object.
 * Returns a new object — original is not mutated.
 */
export async function encryptApiSettings<T extends Record<string, unknown>>(settings: T): Promise<T & { _kv?: 1 }> {
    const out = { ...settings } as Record<string, unknown>;
    for (const field of SENSITIVE_FIELDS) {
        if (field in out) {
            out[field] = await encrypt(out[field] as string | null);
        }
    }
    if (_masterKey) out['_kv'] = 1;   // flag: vault-encrypted
    return out as T & { _kv?: 1 };
}

/**
 * Decrypt all sensitive fields in an (optionally encrypted) ApiSettings object.
 * Safe to call on plaintext objects — passthrough for non-encrypted values.
 */
export async function decryptApiSettings<T extends Record<string, unknown>>(settings: T | null): Promise<T> {
    if (!settings) return settings as T;
    const out = { ...settings } as Record<string, unknown>;
    for (const field of SENSITIVE_FIELDS) {
        if (field in out) {
            out[field] = await decrypt(out[field] as string | null);
        }
    }
    delete out['_kv'];
    return out as T;
}

/**
 * True when a value looks like a KeyVault ciphertext blob.
 */
export function isEncrypted(value: unknown): boolean {
    return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * True when an ApiSettings object was encrypted by the vault.
 */
export function settingsAreEncrypted(settings: Record<string, unknown> | null | undefined): boolean {
    if (!settings) return false;
    return settings['_kv'] === 1 || SENSITIVE_FIELDS.some(f => isEncrypted(settings[f]));
}
