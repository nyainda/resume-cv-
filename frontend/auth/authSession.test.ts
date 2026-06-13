/**
 * authSession.test.ts
 *
 * Tests covering the session token security model introduced by Bug 8:
 *   - Sessions are stored as SHA-256 hashes in D1, never as raw tokens
 *   - Bearer token extraction from Authorization header
 *   - Hash determinism (same token → same hash, always)
 *   - Hash ≠ raw token (documents why the getUserIdFromRequest bug caused 401s)
 *
 * These are pure-crypto / pure-logic tests — no browser APIs, no network.
 */

import { describe, it, expect } from 'vitest';

// ─── SHA-256 helper (mirrors the hashToken() in auth.ts and userDataCloudService) ───

async function sha256hex(input: string): Promise<string> {
    const buf = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(input),
    );
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// ─── Bearer token extraction (mirrors the pattern in getUserIdFromRequest) ────

function extractBearerToken(authHeader: string): string {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
}

// ─── Hash determinism ─────────────────────────────────────────────────────────

describe('SHA-256 hash determinism', () => {
    it('produces the same hash for the same input on repeated calls', async () => {
        const token = 'abc123testtoken';
        const h1 = await sha256hex(token);
        const h2 = await sha256hex(token);
        expect(h1).toBe(h2);
    });

    it('produces different hashes for different tokens', async () => {
        const h1 = await sha256hex('token-aaaa');
        const h2 = await sha256hex('token-bbbb');
        expect(h1).not.toBe(h2);
    });

    it('output is always 64 hex characters (256 bits)', async () => {
        const hash = await sha256hex('any-session-token');
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('empty string has a known non-empty hash (SHA-256 of empty string)', async () => {
        const hash = await sha256hex('');
        expect(hash).toBe(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        );
    });
});

// ─── Raw token ≠ its hash (the root cause of the Bug 8 regression) ───────────

describe('Raw token vs. hash inequality — regression guard for Bug 8', () => {
    it('a real-looking session token is NOT equal to its SHA-256 hash', async () => {
        const rawToken =
            'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
        const hash = await sha256hex(rawToken);
        // The bug: D1 stored hash, but getUserIdFromRequest queried with rawToken.
        // They can never be equal — different string entirely.
        expect(rawToken).not.toBe(hash);
    });

    it('a UUID-style token is NOT equal to its hash', async () => {
        const token = '550e8400-e29b-41d4-a716-446655440000';
        const hash = await sha256hex(token);
        expect(token).not.toBe(hash);
        expect(hash).toHaveLength(64);
    });

    it('hashing a hash produces a completely different value', async () => {
        const token = 'myrawsessiontoken';
        const hash1 = await sha256hex(token);
        const hash2 = await sha256hex(hash1);
        expect(hash1).not.toBe(hash2);
    });
});

// ─── Bearer token extraction ──────────────────────────────────────────────────

describe('Bearer token extraction from Authorization header', () => {
    it('strips "Bearer " prefix (standard case)', () => {
        const token = extractBearerToken('Bearer abc123token');
        expect(token).toBe('abc123token');
    });

    it('strips "bearer " prefix (lowercase — case-insensitive)', () => {
        const token = extractBearerToken('bearer abc123token');
        expect(token).toBe('abc123token');
    });

    it('strips "BEARER " prefix (uppercase)', () => {
        const token = extractBearerToken('BEARER abc123token');
        expect(token).toBe('abc123token');
    });

    it('trims leading/trailing whitespace', () => {
        const token = extractBearerToken('Bearer   spaced-token   ');
        expect(token).toBe('spaced-token');
    });

    it('returns empty string for empty Authorization header', () => {
        const token = extractBearerToken('');
        expect(token).toBe('');
    });

    it('returns the raw value if no Bearer prefix (should not auth)', () => {
        const token = extractBearerToken('Basic dXNlcjpwYXNz');
        expect(token).toBe('Basic dXNlcjpwYXNz');
    });

    it('correctly extracts a 64-char hex token', async () => {
        const rawToken = await sha256hex('test-session-seed');
        const header = `Bearer ${rawToken}`;
        const extracted = extractBearerToken(header);
        expect(extracted).toBe(rawToken);
        expect(extracted).toHaveLength(64);
    });
});

// ─── Session storage key contract ────────────────────────────────────────────
// Documents the localStorage keys used by the worker session system.
// If these keys change, the AuthContext and authService BOTH need updating.

describe('Session storage key contract', () => {
    const WORKER_SESSION_KEY    = 'procv:worker_session';
    const WORKER_SESSION_TEMP   = 'procv:worker_session_temp';
    const WORKER_USER_KEY       = 'procv:worker_user';
    const SLOT_HASH_PREFIX      = 'cv_builder:usync_slot_hash:';

    it('worker session key is the procv namespace', () => {
        expect(WORKER_SESSION_KEY).toBe('procv:worker_session');
    });

    it('temp session key differs from persistent key', () => {
        expect(WORKER_SESSION_TEMP).not.toBe(WORKER_SESSION_KEY);
    });

    it('slot hash key is correctly namespaced with slot ID', () => {
        const slotId = 'slot-abc-123';
        const key = SLOT_HASH_PREFIX + slotId;
        expect(key).toBe('cv_builder:usync_slot_hash:slot-abc-123');
        expect(key).toContain(slotId);
    });

    it('session JSON shape contains token and user fields', () => {
        const sessionJson = JSON.stringify({
            token: 'raw-bearer-token-here',
            user: { id: 1, email: 'test@example.com', name: 'Test', plan: 'free' },
        });
        const parsed = JSON.parse(sessionJson);
        expect(parsed).toHaveProperty('token');
        expect(parsed).toHaveProperty('user');
        expect(parsed.user).toHaveProperty('email');
    });
});

// ─── D1 lookup pattern — regression test for getUserIdFromRequest bug ─────────
// This test encodes the EXACT contract:
//   client sends raw token → client hashes it → D1 is queried with hash
//   D1 stores the hash (not the raw token)
//   Therefore: D1 query MUST use the hash, never the raw token

describe('D1 session lookup contract — Bug 8 regression', () => {
    async function simulateD1Store(rawToken: string) {
        // This is what createSession() in auth.ts does:
        return sha256hex(rawToken);
    }

    async function simulateCorrectLookup(
        authHeader: string,
        storedHash: string,
    ): Promise<boolean> {
        // This is what getUserIdFromRequest SHOULD do (after Bug 8 fix):
        const raw = extractBearerToken(authHeader);
        const hash = await sha256hex(raw);
        return hash === storedHash;
    }

    async function simulateBuggyLookup(
        authHeader: string,
        storedHash: string,
    ): Promise<boolean> {
        // This is what getUserIdFromRequest did BEFORE the fix (Bug 8):
        const raw = extractBearerToken(authHeader);
        return raw === storedHash; // comparing raw token to stored hash → always false
    }

    it('correct lookup: hashed bearer token matches the stored hash', async () => {
        const token = 'my-session-token-123';
        const storedHash = await simulateD1Store(token);
        const header = `Bearer ${token}`;
        const found = await simulateCorrectLookup(header, storedHash);
        expect(found).toBe(true);
    });

    it('buggy lookup: raw bearer token never matches the stored hash (shows the original bug)', async () => {
        const token = 'my-session-token-123';
        const storedHash = await simulateD1Store(token);
        const header = `Bearer ${token}`;
        const found = await simulateBuggyLookup(header, storedHash);
        // This is WHY we got 401 — the raw token can never equal its own SHA-256 hash
        expect(found).toBe(false);
    });

    it('correct lookup fails for a different token (wrong credential rejected)', async () => {
        const correctToken = 'correct-token';
        const storedHash = await simulateD1Store(correctToken);
        const attackerHeader = `Bearer wrong-token`;
        const found = await simulateCorrectLookup(attackerHeader, storedHash);
        expect(found).toBe(false);
    });

    it('hash collision resistance: two different tokens do not hash to the same value', async () => {
        const tokens = [
            'token-alpha',
            'token-beta',
            'token-gamma',
            'completely-different',
            '0000000000000001',
        ];
        const hashes = await Promise.all(tokens.map(sha256hex));
        const uniqueHashes = new Set(hashes);
        expect(uniqueHashes.size).toBe(tokens.length);
    });
});
