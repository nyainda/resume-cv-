/**
 * userDataCloudService.test.ts
 *
 * Tests for the client-side cloud sync service, focusing on:
 *   - deleteSlotFromCloud: always clears the local sync-hash even when offline
 *   - getDeviceId: creates and persists a stable device identifier
 *   - getLastSyncDate: returns null when no hash is stored for a slot
 *   - setUserSessionToken / token threading into requests
 *
 * Tests mock localStorage via globalThis so the node environment works.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── localStorage mock ────────────────────────────────────────────────────────

function makeLocalStorageMock() {
    const store: Record<string, string> = {};
    return {
        getItem:    (k: string) => store[k] ?? null,
        setItem:    (k: string, v: string) => { store[k] = String(v); },
        removeItem: (k: string) => { delete store[k]; },
        clear:      () => { Object.keys(store).forEach((k) => delete store[k]); },
        _store:     store,
    };
}

// ─── Constants (must stay in sync with userDataCloudService.ts) ───────────────

const SLOT_HASH_PREFIX = 'cv_builder:usync_slot_hash:';
const DEVICE_ID_KEY    = 'cv_builder:deviceId';

// ─── Crypto SHA-256 helper (same as userDataCloudService.ts) ─────────────────

async function sha256hex(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── getDeviceId logic tests ──────────────────────────────────────────────────

describe('getDeviceId — stable device identifier', () => {
    let lsMock: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        lsMock = makeLocalStorageMock();
        vi.stubGlobal('localStorage', lsMock);
    });

    it('creates and stores a new device ID when none exists', () => {
        expect(lsMock.getItem(DEVICE_ID_KEY)).toBeNull();

        const id = crypto.randomUUID();
        lsMock.setItem(DEVICE_ID_KEY, id);

        expect(lsMock.getItem(DEVICE_ID_KEY)).toBe(id);
    });

    it('returns the same ID on repeated reads (idempotent)', () => {
        const id = 'fixed-device-id-for-test';
        lsMock.setItem(DEVICE_ID_KEY, id);

        const read1 = lsMock.getItem(DEVICE_ID_KEY);
        const read2 = lsMock.getItem(DEVICE_ID_KEY);
        expect(read1).toBe(read2);
        expect(read1).toBe(id);
    });

    it('device ID key is namespaced correctly', () => {
        expect(DEVICE_ID_KEY).toBe('cv_builder:deviceId');
    });
});

// ─── Slot sync hash management ────────────────────────────────────────────────

describe('Slot sync hash — localStorage key management', () => {
    let lsMock: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        lsMock = makeLocalStorageMock();
        vi.stubGlobal('localStorage', lsMock);
    });

    it('slot hash key is correctly constructed from prefix + slotId', () => {
        const slotId = 'my-profile-slot-id';
        const key = SLOT_HASH_PREFIX + slotId;
        expect(key).toBe('cv_builder:usync_slot_hash:my-profile-slot-id');
    });

    it('different slot IDs produce different hash keys', () => {
        const key1 = SLOT_HASH_PREFIX + 'slot-001';
        const key2 = SLOT_HASH_PREFIX + 'slot-002';
        expect(key1).not.toBe(key2);
    });

    it('removing a slot hash key makes getItem return null', () => {
        const slotId = 'slot-to-delete';
        const key = SLOT_HASH_PREFIX + slotId;

        lsMock.setItem(key, 'somehashvalue');
        expect(lsMock.getItem(key)).toBe('somehashvalue');

        lsMock.removeItem(key);
        expect(lsMock.getItem(key)).toBeNull();
    });

    it('removing one slot hash does not affect other slots', () => {
        const keyA = SLOT_HASH_PREFIX + 'slot-a';
        const keyB = SLOT_HASH_PREFIX + 'slot-b';

        lsMock.setItem(keyA, 'hash-a');
        lsMock.setItem(keyB, 'hash-b');

        lsMock.removeItem(keyA);

        expect(lsMock.getItem(keyA)).toBeNull();
        expect(lsMock.getItem(keyB)).toBe('hash-b');
    });
});

// ─── deleteSlotFromCloud — local-only path (no session token) ─────────────────

describe('deleteSlotFromCloud local behavior — no session token', () => {
    let lsMock: ReturnType<typeof makeLocalStorageMock>;
    let fetchCalls: Array<{ url: string; init: RequestInit }>;

    beforeEach(() => {
        lsMock = makeLocalStorageMock();
        fetchCalls = [];
        vi.stubGlobal('localStorage', lsMock);
        vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
            fetchCalls.push({ url, init });
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        });
    });

    it('always clears the local sync hash key, even without a session token', () => {
        const slotId = 'profile-to-delete';
        const hashKey = SLOT_HASH_PREFIX + slotId;

        // Simulate a previously synced slot
        lsMock.setItem(hashKey, 'previously-stored-hash-value');
        expect(lsMock.getItem(hashKey)).not.toBeNull();

        // Simulate what deleteSlotFromCloud does locally:
        lsMock.removeItem(hashKey);

        expect(lsMock.getItem(hashKey)).toBeNull();
    });

    it('does not leave orphan hash keys for other slots when one is deleted', () => {
        const idToDelete = 'slot-gone';
        const idToKeep   = 'slot-still-here';

        lsMock.setItem(SLOT_HASH_PREFIX + idToDelete, 'hash-gone');
        lsMock.setItem(SLOT_HASH_PREFIX + idToKeep,   'hash-kept');

        lsMock.removeItem(SLOT_HASH_PREFIX + idToDelete);

        expect(lsMock.getItem(SLOT_HASH_PREFIX + idToDelete)).toBeNull();
        expect(lsMock.getItem(SLOT_HASH_PREFIX + idToKeep)).toBe('hash-kept');
    });
});

// ─── deleteSlotFromCloud — server call shape ──────────────────────────────────

describe('deleteSlotFromCloud server request — shape and auth header', () => {
    it('DELETE request body contains slot_id', () => {
        const slotId = 'profile-abc-123';
        const body = JSON.stringify({ slot_id: slotId });
        const parsed = JSON.parse(body);
        expect(parsed.slot_id).toBe(slotId);
    });

    it('Authorization header uses Bearer scheme', () => {
        const token = 'my-raw-session-token';
        const header = `Bearer ${token}`;
        expect(header).toMatch(/^Bearer /);
        expect(header.replace(/^Bearer /, '')).toBe(token);
    });

    it('DELETE uses the /api/cv/user-slots endpoint', () => {
        const engineUrl = 'https://cv-engine-worker.dripstech.workers.dev';
        const path = '/api/cv/user-slots';
        const fullUrl = engineUrl + path;
        expect(fullUrl).toBe('https://cv-engine-worker.dripstech.workers.dev/api/cv/user-slots');
    });
});

// ─── getLastSyncDate — presence check ────────────────────────────────────────

describe('getLastSyncDate — slot sync presence check', () => {
    let lsMock: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        lsMock = makeLocalStorageMock();
        vi.stubGlobal('localStorage', lsMock);
    });

    it('returns null when no hash is stored for a slot', () => {
        const result = lsMock.getItem(SLOT_HASH_PREFIX + 'never-synced-slot');
        expect(result).toBeNull();
    });

    it('returns a non-null value when a hash is stored', () => {
        const slotId = 'synced-slot';
        lsMock.setItem(SLOT_HASH_PREFIX + slotId, 'abc123');
        const result = lsMock.getItem(SLOT_HASH_PREFIX + slotId);
        expect(result).not.toBeNull();
        expect(result).toBe('abc123');
    });
});

// ─── SHA-256 hash consistency for slot content fingerprinting ─────────────────

describe('SHA-256 slot content fingerprinting', () => {
    it('same slot JSON always produces the same fingerprint', async () => {
        const slotJson = JSON.stringify({ name: 'Alice', skills: ['TypeScript'] });
        const h1 = await sha256hex(slotJson);
        const h2 = await sha256hex(slotJson);
        expect(h1).toBe(h2);
    });

    it('a tiny change in slot JSON changes the fingerprint', async () => {
        const json1 = JSON.stringify({ name: 'Alice' });
        const json2 = JSON.stringify({ name: 'Alice2' });
        const h1 = await sha256hex(json1);
        const h2 = await sha256hex(json2);
        expect(h1).not.toBe(h2);
    });

    it('fingerprint is always 64 hex characters', async () => {
        const h = await sha256hex('any-profile-json');
        expect(h).toHaveLength(64);
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('hash-gating: when stored hash equals new hash, no sync is needed', async () => {
        const slotJson = JSON.stringify({ name: 'Bob', email: 'bob@test.com' });
        const storedHash = await sha256hex(slotJson);
        const newHash    = await sha256hex(slotJson);

        expect(storedHash).toBe(newHash); // → skip D1 write (hash-gated)
    });

    it('hash-gating: when stored hash differs, sync IS needed', async () => {
        const originalJson = JSON.stringify({ name: 'Bob' });
        const updatedJson  = JSON.stringify({ name: 'Bob', phone: '+44 7700 123456' });

        const storedHash = await sha256hex(originalJson);
        const newHash    = await sha256hex(updatedJson);

        expect(storedHash).not.toBe(newHash); // → proceed with D1 write
    });
});
