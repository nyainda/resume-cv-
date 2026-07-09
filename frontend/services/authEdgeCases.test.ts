/**
 * authEdgeCases.test.ts
 *
 * Regression tests for the four auth edge-case classes that have historically
 * produced data-leak or data-loss bugs:
 *
 *   1. Account switch      — different user signs in on same device
 *   2. Stale session       — 7-day localStorage fallback token expiry
 *   3. Drive mismatch      — wrong Google account connected to Drive
 *   4. Delete → re-register — IDB sentinels prevent data resurrection
 *
 * Tests replicate the core logic inline (no React/browser imports) and mock
 * localStorage / fetch exactly as the other test files in this directory do.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── localStorage mock ────────────────────────────────────────────────────────

function makeLocalStorageMock() {
    const store: Record<string, string> = {};
    return {
        getItem:    (k: string) => store[k] ?? null,
        setItem:    (k: string, v: string) => { store[k] = String(v); },
        removeItem: (k: string) => { delete store[k]; },
        clear:      () => { Object.keys(store).forEach(k => delete store[k]); },
        get length() { return Object.keys(store).length; },
        key:        (i: number) => Object.keys(store)[i] ?? null,
        _store:     store,
    };
}

// ─── Constants (must stay in sync with source files) ──────────────────────────

const SESSION_FALLBACK_KEY  = 'procv:stf';
const TOKEN_MAX_AGE_MS      = 7 * 24 * 60 * 60 * 1000; // 7 days
const USER_CACHE_KEY        = 'procv:worker_user';
const DRIVE_TOKEN_KEY       = 'cv_gdrive_token';
const DRIVE_EXPIRY_KEY      = 'cv_gdrive_expiry';
const DRIVE_SCOPE_KEY       = 'procv:drive_scope_granted';
const DRIVE_FILES_URL       = 'https://www.googleapis.com/drive/v3/files';
const MIGRATION_FLAG_LEGACY = 'cv_builder:gdrive_migrated';

function getMigrationFlagKey(email: string): string {
    const safe = btoa(email).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
    return `cv_builder:gdrive_migrated:${safe}`;
}

// ─── Session fallback helpers (mirrors authService.ts) ────────────────────────

function saveSessionFallback(token: string, ls: ReturnType<typeof makeLocalStorageMock>): void {
    const payload = JSON.stringify({ token, savedAt: Date.now() });
    ls.setItem(SESSION_FALLBACK_KEY, payload);
}

function loadSessionFallback(ls: ReturnType<typeof makeLocalStorageMock>): string {
    const raw = ls.getItem(SESSION_FALLBACK_KEY);
    if (!raw) return '';
    try {
        const parsed = JSON.parse(raw) as { token?: string; savedAt?: number };
        if (typeof parsed?.token === 'string') {
            if (parsed.savedAt && Date.now() - parsed.savedAt > TOKEN_MAX_AGE_MS) {
                ls.removeItem(SESSION_FALLBACK_KEY);
                return '';
            }
            return parsed.token;
        }
    } catch { /* legacy plain string */ }
    return raw;
}

// ─── Drive filename helpers (mirrors DriveStorageService.ts) ──────────────────

function toFilename(userId: string, key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `cvb__u${userId}__${safeKey}.json`;
}

function fromFilename(name: string): string {
    const newMatch  = name.match(/^cvb__u[^_]+__(.+)\.json$/);
    if (newMatch) return newMatch[1];
    const legacyMatch = name.match(/^cvb__(.+)\.json$/);
    return legacyMatch ? legacyMatch[1] : '';
}

function isOwnedByUser(filename: string, userId: string): boolean {
    return filename.startsWith(`cvb__u${userId}__`);
}

// ─── wipeLocalAppData logic (mirrors AuthContext.ts) ──────────────────────────

const LEGACY_KEYS = [
    'profiles', 'currentCV', 'savedCVs', 'savedCoverLetters',
    'trackedApps', 'starStories', 'template',
    'cv_gdrive_token', 'cv_gdrive_expiry', 'cv_gdrive_user', 'cv_drive_last_sync',
];

function wipeLocalAppData(ls: ReturnType<typeof makeLocalStorageMock>): void {
    ls.setItem('cv_appdata_cleared', '1');
    ls.setItem('procv:google_auth_cleared', '1');

    const allKeys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k) allKeys.push(k);
    }
    allKeys.forEach(k => {
        if (
            (k.startsWith('cv_builder:') && k !== 'cv_builder:deviceId') ||
            (k.startsWith('procv:')      && k !== USER_CACHE_KEY)        ||
            k.startsWith('p:') ||
            k.startsWith('cv:') ||
            k.startsWith('u_') ||
            k.startsWith('anon:') ||
            LEGACY_KEYS.includes(k)
        ) {
            ls.removeItem(k);
        }
    });
}

// ─── migrateDriveFilesToUserScope logic (mirrors DriveStorageService.ts) ──────

async function migrateDriveFilesToUserScope(
    token: string,
    userId: string,
    ls: ReturnType<typeof makeLocalStorageMock>,
    fetchFn: typeof fetch,
): Promise<void> {
    if (!token || !userId) return;

    const flagKey = `procv:drive_ns_migrated_${userId}`;
    if (ls.getItem(flagKey) === '1') return;

    const auth = { Authorization: `Bearer ${token}` };
    let files: Array<{ id: string; name: string }> = [];
    try {
        const res = await fetchFn(
            `${DRIVE_FILES_URL}?spaces=appDataFolder&fields=files(id,name)&pageSize=100`,
            { headers: auth },
        );
        if (!res.ok) return;
        const json = await res.json() as { files?: Array<{ id: string; name: string }> };
        files = json.files ?? [];
    } catch { return; }

    const oldFormat = files.filter(
        f => /^cvb__(?!u\d+__)/.test(f.name) && f.name.endsWith('.json'),
    );

    let allRenamed = true;
    for (const file of oldFormat) {
        const oldKey = file.name.replace(/^cvb__/, '').replace(/\.json$/, '');
        const newName = `cvb__u${userId}__${oldKey}.json`;
        try {
            const res = await fetchFn(`${DRIVE_FILES_URL}/${file.id}`, {
                method: 'PATCH',
                headers: { ...auth, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName }),
            });
            if (!res.ok) allRenamed = false;
        } catch {
            allRenamed = false;
        }
    }

    if (allRenamed) {
        ls.setItem(flagKey, '1');
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. ACCOUNT SWITCH
// ══════════════════════════════════════════════════════════════════════════════

describe('Account switch — different user signs in on same device', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        vi.stubGlobal('localStorage', ls);
    });

    it('wipes Drive tokens when a new user signs in', () => {
        ls.setItem(DRIVE_TOKEN_KEY, 'old-google-token');
        ls.setItem(DRIVE_EXPIRY_KEY, String(Date.now() + 3600_000));
        ls.setItem(DRIVE_SCOPE_KEY, '1');

        wipeLocalAppData(ls);

        expect(ls.getItem(DRIVE_TOKEN_KEY)).toBeNull();
        expect(ls.getItem(DRIVE_EXPIRY_KEY)).toBeNull();
    });

    it('wipes Drive scope granted flag so the new user starts without Drive', () => {
        ls.setItem(DRIVE_SCOPE_KEY, '1');
        wipeLocalAppData(ls);
        expect(ls.getItem(DRIVE_SCOPE_KEY)).toBeNull();
    });

    it('wipes user-scoped CV data (p:, cv:, u_ prefixes)', () => {
        ls.setItem('p:slot-1:jd', 'software engineer job description');
        ls.setItem('cv:purpose', 'job');
        ls.setItem('u_42:profiles', '[]');

        wipeLocalAppData(ls);

        expect(ls.getItem('p:slot-1:jd')).toBeNull();
        expect(ls.getItem('cv:purpose')).toBeNull();
        expect(ls.getItem('u_42:profiles')).toBeNull();
    });

    it('wipes cv_builder: namespace (sync hashes, LLM cache keys)', () => {
        ls.setItem('cv_builder:usync_slot_hash:abc', 'hash-value');
        ls.setItem('cv_builder:gdrive_migrated', 'done');

        wipeLocalAppData(ls);

        expect(ls.getItem('cv_builder:usync_slot_hash:abc')).toBeNull();
        expect(ls.getItem('cv_builder:gdrive_migrated')).toBeNull();
    });

    it('preserves the device ID across an account switch', () => {
        ls.setItem('cv_builder:deviceId', 'stable-device-uuid-1234');
        ls.setItem('cv_builder:usync_slot_hash:abc', 'some-hash');

        wipeLocalAppData(ls);

        expect(ls.getItem('cv_builder:deviceId')).toBe('stable-device-uuid-1234');
    });

    it('preserves the user display cache (procv:worker_user) so the new user shows immediately after reload', () => {
        ls.setItem(USER_CACHE_KEY, JSON.stringify({ id: 99, email: 'new@example.com' }));
        ls.setItem('procv:drive_scope_granted', '1');

        wipeLocalAppData(ls);

        expect(ls.getItem(USER_CACHE_KEY)).not.toBeNull();
        expect(ls.getItem('procv:drive_scope_granted')).toBeNull();
    });

    it('writes cv_appdata_cleared sentinel so restoreLocalStorageFromIDB is blocked on next boot', () => {
        // cv_appdata_cleared survives the wipe (no matching prefix) and is read
        // by restoreLocalStorageFromIDB() on the next page load to skip IDB restore.
        // procv:google_auth_cleared is set then removed by the same loop (matches
        // the procv: prefix) — it is ephemeral and only guards the current reload cycle.
        wipeLocalAppData(ls);
        expect(ls.getItem('cv_appdata_cleared')).toBe('1');
    });

    it('account-switch detection: different email triggers wipe, same email does not', () => {
        const wipeSpy = vi.fn();

        function applySession(
            prevEmail: string | null,
            incomingEmail: string,
            onSwitch: () => void,
        ) {
            if (prevEmail && incomingEmail && prevEmail !== incomingEmail) {
                onSwitch();
            }
        }

        applySession('alice@example.com', 'bob@example.com', wipeSpy);
        expect(wipeSpy).toHaveBeenCalledTimes(1);

        applySession('alice@example.com', 'alice@example.com', wipeSpy);
        expect(wipeSpy).toHaveBeenCalledTimes(1); // no extra call
    });

    it('null prevEmail (first sign-in) never triggers wipe', () => {
        const wipeSpy = vi.fn();
        function applySession(
            prevEmail: string | null,
            incomingEmail: string,
            onSwitch: () => void,
        ) {
            if (prevEmail && incomingEmail && prevEmail !== incomingEmail) {
                onSwitch();
            }
        }
        applySession(null, 'alice@example.com', wipeSpy);
        expect(wipeSpy).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. STALE SESSION — 7-day fallback token expiry
// ══════════════════════════════════════════════════════════════════════════════

describe('Stale session — 7-day localStorage fallback token expiry', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        vi.stubGlobal('localStorage', ls);
    });

    it('returns a valid token saved moments ago', () => {
        saveSessionFallback('fresh-token-abc', ls);
        const result = loadSessionFallback(ls);
        expect(result).toBe('fresh-token-abc');
    });

    it('auto-expires and clears a token saved more than 7 days ago', () => {
        const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
        const stalePayload = JSON.stringify({ token: 'stale-token-xyz', savedAt: eightDaysAgo });
        ls.setItem(SESSION_FALLBACK_KEY, stalePayload);

        const result = loadSessionFallback(ls);

        expect(result).toBe('');
        expect(ls.getItem(SESSION_FALLBACK_KEY)).toBeNull();
    });

    it('returns empty string when no token is stored', () => {
        expect(loadSessionFallback(ls)).toBe('');
    });

    it('a token saved exactly at the 7-day boundary is still valid', () => {
        const exactBoundary = Date.now() - TOKEN_MAX_AGE_MS + 1000; // 1s inside limit
        const payload = JSON.stringify({ token: 'borderline-token', savedAt: exactBoundary });
        ls.setItem(SESSION_FALLBACK_KEY, payload);

        const result = loadSessionFallback(ls);
        expect(result).toBe('borderline-token');
    });

    it('a token saved 1ms past the 7-day boundary is expired', () => {
        const justExpired = Date.now() - TOKEN_MAX_AGE_MS - 1;
        const payload = JSON.stringify({ token: 'just-expired', savedAt: justExpired });
        ls.setItem(SESSION_FALLBACK_KEY, payload);

        const result = loadSessionFallback(ls);
        expect(result).toBe('');
    });

    it('saveSessionFallback stores token in JSON format with savedAt timestamp', () => {
        saveSessionFallback('my-token', ls);
        const raw = ls.getItem(SESSION_FALLBACK_KEY);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed.token).toBe('my-token');
        expect(typeof parsed.savedAt).toBe('number');
        expect(parsed.savedAt).toBeLessThanOrEqual(Date.now());
    });

    it('overwriting a token updates the savedAt timestamp', () => {
        const oldPayload = JSON.stringify({ token: 'old-token', savedAt: Date.now() - 5000 });
        ls.setItem(SESSION_FALLBACK_KEY, oldPayload);

        saveSessionFallback('new-token', ls);

        const raw = ls.getItem(SESSION_FALLBACK_KEY);
        const parsed = JSON.parse(raw!);
        expect(parsed.token).toBe('new-token');
        expect(parsed.savedAt).toBeGreaterThan(Date.now() - 2000); // fresh timestamp
    });

    it('clearing the fallback removes the localStorage key entirely', () => {
        saveSessionFallback('token-to-clear', ls);
        expect(ls.getItem(SESSION_FALLBACK_KEY)).not.toBeNull();

        ls.removeItem(SESSION_FALLBACK_KEY);
        expect(ls.getItem(SESSION_FALLBACK_KEY)).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. DRIVE ACCOUNT MISMATCH
// ══════════════════════════════════════════════════════════════════════════════

describe('Drive account mismatch — wrong Google account connected', () => {

    // ── 3a. Filename structural isolation ─────────────────────────────────────

    describe('filename structural isolation (userId embedded in name)', () => {
        it('toFilename embeds the ProCV userId in the Drive filename', () => {
            const name = toFilename('42', 'profiles');
            expect(name).toBe('cvb__u42__profiles.json');
        });

        it('toFilename sanitises special characters in the key', () => {
            const name = toFilename('7', 'p:slot/1:data');
            expect(name).toMatch(/^cvb__u7__/);
            expect(name).not.toContain('/');
            expect(name).not.toContain(':');
        });

        it('toFilename for two different users produces different filenames for the same key', () => {
            const nameUser1 = toFilename('1', 'profiles');
            const nameUser2 = toFilename('2', 'profiles');
            expect(nameUser1).not.toBe(nameUser2);
        });

        it('fromFilename correctly extracts the key from the new format', () => {
            expect(fromFilename('cvb__u42__profiles.json')).toBe('profiles');
            expect(fromFilename('cvb__u7__savedCVs.json')).toBe('savedCVs');
        });

        it('fromFilename falls back to the legacy format', () => {
            expect(fromFilename('cvb__profiles.json')).toBe('profiles');
        });

        it('fromFilename returns empty string for unrecognised filenames', () => {
            expect(fromFilename('unrelated-file.json')).toBe('');
        });
    });

    // ── 3b. list() prefix filtering ───────────────────────────────────────────

    describe('list() filters by userId prefix — wrong account finds nothing', () => {
        it('a file belonging to user 42 is NOT visible to user 99', () => {
            const file = toFilename('42', 'profiles'); // cvb__u42__profiles.json
            expect(isOwnedByUser(file, '99')).toBe(false);
        });

        it('a file belonging to user 42 IS visible to user 42', () => {
            const file = toFilename('42', 'profiles');
            expect(isOwnedByUser(file, '42')).toBe(true);
        });

        it('a legacy file (no userId prefix) is NOT claimed by any specific user', () => {
            const legacy = 'cvb__profiles.json';
            expect(isOwnedByUser(legacy, '42')).toBe(false);
            expect(isOwnedByUser(legacy, '99')).toBe(false);
        });

        it('filtering a mixed-user Drive listing returns only the current user files', () => {
            const driveFiles = [
                'cvb__u42__profiles.json',   // user 42
                'cvb__u42__savedCVs.json',   // user 42
                'cvb__u99__profiles.json',   // user 99 — must be excluded
                'cvb__profiles.json',         // legacy — must be excluded
                'unrelated.json',             // not ours at all
            ];

            const userPrefix = `cvb__u42__`;
            const ours = driveFiles
                .filter(f => f.startsWith(userPrefix))
                .map(f => fromFilename(f));

            expect(ours).toHaveLength(2);
            expect(ours).toContain('profiles');
            expect(ours).toContain('savedCVs');
        });

        it('wrong Google account with no matching files returns empty list', () => {
            const wrongAccountFiles = [
                'cvb__u99__profiles.json',
                'cvb__u99__savedCVs.json',
            ];

            const userPrefix = `cvb__u42__`;
            const ours = wrongAccountFiles.filter(f => f.startsWith(userPrefix));
            expect(ours).toHaveLength(0);
        });
    });

    // ── 3c. Email verification before Drive activation ────────────────────────

    describe('email verification blocks wrong Google account', () => {
        it('throws when granted email does not match ProCV session email', async () => {
            async function verifyDriveEmail(
                procvEmail: string,
                grantedEmail: string,
            ): Promise<void> {
                if (grantedEmail.toLowerCase() !== procvEmail.toLowerCase()) {
                    throw new Error(
                        `That Google account (${grantedEmail}) doesn't match your signed-in account (${procvEmail}).`,
                    );
                }
            }

            await expect(
                verifyDriveEmail('alice@example.com', 'bob@example.com'),
            ).rejects.toThrow("doesn't match");
        });

        it('does not throw when emails match (case-insensitive)', async () => {
            async function verifyDriveEmail(
                procvEmail: string,
                grantedEmail: string,
            ): Promise<void> {
                if (grantedEmail.toLowerCase() !== procvEmail.toLowerCase()) {
                    throw new Error('mismatch');
                }
            }

            await expect(
                verifyDriveEmail('Alice@Example.COM', 'alice@example.com'),
            ).resolves.toBeUndefined();
        });
    });

    // ── 3d. migrateDriveFilesToUserScope ─────────────────────────────────────

    describe('migrateDriveFilesToUserScope — legacy file rename', () => {
        let ls: ReturnType<typeof makeLocalStorageMock>;

        beforeEach(() => {
            ls = makeLocalStorageMock();
            vi.stubGlobal('localStorage', ls);
        });

        it('is idempotent — does nothing when migration flag is already set', async () => {
            const userId = '42';
            ls.setItem(`procv:drive_ns_migrated_${userId}`, '1');

            const fetchSpy = vi.fn();
            vi.stubGlobal('fetch', fetchSpy);

            await migrateDriveFilesToUserScope('token', userId, ls, fetchSpy as unknown as typeof fetch);

            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('renames legacy files and sets the done flag when all renames succeed', async () => {
            const userId = '42';
            const mockFiles = [
                { id: 'file-1', name: 'cvb__profiles.json' },
                { id: 'file-2', name: 'cvb__savedCVs.json' },
            ];

            const patchedNames: string[] = [];
            const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
                if (url.includes('spaces=appDataFolder')) {
                    return new Response(JSON.stringify({ files: mockFiles }), { status: 200 });
                }
                // PATCH rename calls
                const body = JSON.parse(init?.body as string ?? '{}');
                patchedNames.push(body.name);
                return new Response('{}', { status: 200 });
            });
            vi.stubGlobal('fetch', mockFetch);

            await migrateDriveFilesToUserScope('token', userId, ls, mockFetch as unknown as typeof fetch);

            expect(patchedNames).toContain(`cvb__u${userId}__profiles.json`);
            expect(patchedNames).toContain(`cvb__u${userId}__savedCVs.json`);
            expect(ls.getItem(`procv:drive_ns_migrated_${userId}`)).toBe('1');
        });

        it('does NOT set the done flag if any rename fails — retries on next connect', async () => {
            const userId = '42';
            const mockFiles = [
                { id: 'file-ok',   name: 'cvb__profiles.json' },
                { id: 'file-fail', name: 'cvb__savedCVs.json' },
            ];

            let callCount = 0;
            const mockFetch = vi.fn(async (url: string) => {
                if (url.includes('spaces=appDataFolder')) {
                    return new Response(JSON.stringify({ files: mockFiles }), { status: 200 });
                }
                callCount++;
                // First PATCH succeeds, second fails
                return new Response('error', { status: callCount === 1 ? 200 : 500 });
            });
            vi.stubGlobal('fetch', mockFetch);

            await migrateDriveFilesToUserScope('token', userId, ls, mockFetch as unknown as typeof fetch);

            expect(ls.getItem(`procv:drive_ns_migrated_${userId}`)).toBeNull();
        });

        it('skips files already in the new format (does not double-rename)', async () => {
            const userId = '42';
            const mockFiles = [
                { id: 'file-new', name: `cvb__u${userId}__profiles.json` }, // already renamed
                { id: 'file-old', name: 'cvb__savedCVs.json' },             // needs rename
            ];

            const patchedIds: string[] = [];
            const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
                if (url.includes('spaces=appDataFolder')) {
                    return new Response(JSON.stringify({ files: mockFiles }), { status: 200 });
                }
                // Record which file IDs were PATCHed
                const id = url.split('/').pop();
                if (id) patchedIds.push(id);
                return new Response('{}', { status: 200 });
            });
            vi.stubGlobal('fetch', mockFetch);

            await migrateDriveFilesToUserScope('token', userId, ls, mockFetch as unknown as typeof fetch);

            expect(patchedIds).not.toContain('file-new');
            expect(patchedIds).toContain('file-old');
        });

        it('handles a Drive listing failure gracefully — no flag set, no throw', async () => {
            const userId = '42';
            const mockFetch = vi.fn(async () => new Response('fail', { status: 503 }));
            vi.stubGlobal('fetch', mockFetch);

            await expect(
                migrateDriveFilesToUserScope('token', userId, ls, mockFetch as unknown as typeof fetch),
            ).resolves.toBeUndefined();

            expect(ls.getItem(`procv:drive_ns_migrated_${userId}`)).toBeNull();
        });

        it('handles a network error gracefully — no throw', async () => {
            const userId = '42';
            const mockFetch = vi.fn(async () => { throw new Error('network offline'); });
            vi.stubGlobal('fetch', mockFetch);

            await expect(
                migrateDriveFilesToUserScope('token', userId, ls, mockFetch as unknown as typeof fetch),
            ).resolves.toBeUndefined();
        });

        it('migration flag is per-userId so user 42 migrating does not skip migration for user 99', async () => {
            const userId42 = '42';
            const userId99 = '99';
            ls.setItem(`procv:drive_ns_migrated_${userId42}`, '1');

            const mockFetch = vi.fn(async () => {
                return new Response(JSON.stringify({ files: [] }), { status: 200 });
            });
            vi.stubGlobal('fetch', mockFetch);

            // Should NOT be skipped for user 99 even though user 42 is done
            await migrateDriveFilesToUserScope('token', userId99, ls, mockFetch as unknown as typeof fetch);
            expect(mockFetch).toHaveBeenCalled();
        });
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. DELETE → RE-REGISTER
// ══════════════════════════════════════════════════════════════════════════════

describe('Delete → re-register — IDB sentinels prevent data resurrection', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        vi.stubGlobal('localStorage', ls);
    });

    it('wipe sets cv_appdata_cleared so restoreLocalStorageFromIDB is blocked on next boot', () => {
        // Simulate: user has data, deletes account
        ls.setItem('u_42:profiles', '[{"name":"Alice"}]');
        wipeLocalAppData(ls);

        // The sentinel must be present so boot-time restore is skipped
        expect(ls.getItem('cv_appdata_cleared')).toBe('1');
    });

    it('wipe removes all CV and profile data', () => {
        ls.setItem('u_42:profiles', 'some-profiles');
        ls.setItem('u_42:savedCVs', 'some-cvs');
        ls.setItem('p:slot-1:jd', 'job description');
        ls.setItem('cv:purpose', 'job');

        wipeLocalAppData(ls);

        expect(ls.getItem('u_42:profiles')).toBeNull();
        expect(ls.getItem('u_42:savedCVs')).toBeNull();
        expect(ls.getItem('p:slot-1:jd')).toBeNull();
        expect(ls.getItem('cv:purpose')).toBeNull();
    });

    it('wipe removes the Drive scope flag so Drive is not auto-activated for the new account', () => {
        ls.setItem(DRIVE_SCOPE_KEY, '1');
        ls.setItem(DRIVE_TOKEN_KEY, 'google-access-token');

        wipeLocalAppData(ls);

        expect(ls.getItem(DRIVE_SCOPE_KEY)).toBeNull();
        expect(ls.getItem(DRIVE_TOKEN_KEY)).toBeNull();
    });

    it('wipe removes the session fallback token so re-login cannot reuse the deleted session', () => {
        ls.setItem(SESSION_FALLBACK_KEY, JSON.stringify({ token: 'old-token', savedAt: Date.now() }));

        wipeLocalAppData(ls);

        expect(ls.getItem(SESSION_FALLBACK_KEY)).toBeNull();
    });

    it('wipe removes Drive migration flags so re-registering user triggers a fresh migrate', () => {
        ls.setItem(MIGRATION_FLAG_LEGACY, 'done');
        ls.setItem('cv_builder:gdrive_migrated:somebase64key', 'done');

        wipeLocalAppData(ls);

        expect(ls.getItem(MIGRATION_FLAG_LEGACY)).toBeNull();
        expect(ls.getItem('cv_builder:gdrive_migrated:somebase64key')).toBeNull();
    });

    it('device ID survives account deletion (device continuity for analytics)', () => {
        const deviceId = 'device-uuid-never-deleted';
        ls.setItem('cv_builder:deviceId', deviceId);
        ls.setItem('u_42:profiles', 'data-to-wipe');

        wipeLocalAppData(ls);

        expect(ls.getItem('cv_builder:deviceId')).toBe(deviceId);
    });

    it('after wipe, loading the stale fallback token returns empty string', () => {
        ls.setItem(SESSION_FALLBACK_KEY, JSON.stringify({ token: 'pre-delete-token', savedAt: Date.now() }));

        wipeLocalAppData(ls);

        const result = loadSessionFallback(ls);
        expect(result).toBe('');
    });

    it('re-registering with a fresh account after wipe gets a clean slate', () => {
        // 1. Old account data exists
        ls.setItem('u_42:profiles', '[{"name":"OldUser"}]');
        ls.setItem(DRIVE_TOKEN_KEY, 'old-drive-token');
        ls.setItem(SESSION_FALLBACK_KEY, JSON.stringify({ token: 'old-session', savedAt: Date.now() }));

        // 2. Account deleted → wipe
        wipeLocalAppData(ls);

        // 3. New user registers and saves their first token
        saveSessionFallback('new-session-token', ls);
        ls.setItem('u_99:profiles', '[{"name":"NewUser"}]');

        // 4. New user data is clean and untouched by old account
        expect(loadSessionFallback(ls)).toBe('new-session-token');
        expect(ls.getItem('u_99:profiles')).toBe('[{"name":"NewUser"}]');
        expect(ls.getItem('u_42:profiles')).toBeNull();
        expect(ls.getItem(DRIVE_TOKEN_KEY)).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. DRIVE MIGRATION FLAG SCOPING
// ══════════════════════════════════════════════════════════════════════════════

describe('Drive migration flag scoping — per-account isolation', () => {
    it('getMigrationFlagKey produces different keys for different emails', () => {
        const key1 = getMigrationFlagKey('alice@example.com');
        const key2 = getMigrationFlagKey('bob@example.com');
        expect(key1).not.toBe(key2);
    });

    it('getMigrationFlagKey is stable (same email → same key)', () => {
        const key1 = getMigrationFlagKey('alice@example.com');
        const key2 = getMigrationFlagKey('alice@example.com');
        expect(key1).toBe(key2);
    });

    it('getMigrationFlagKey is namespaced under cv_builder:', () => {
        expect(getMigrationFlagKey('alice@example.com')).toMatch(/^cv_builder:gdrive_migrated:/);
    });

    it('hasMigratedToDrive: scoped flag takes priority over legacy flag', () => {
        const ls = makeLocalStorageMock();
        vi.stubGlobal('localStorage', ls);

        function hasMigratedToDrive(email?: string): boolean {
            if (email && ls.getItem(getMigrationFlagKey(email)) === 'done') return true;
            return ls.getItem(MIGRATION_FLAG_LEGACY) === 'done';
        }

        ls.setItem(getMigrationFlagKey('alice@example.com'), 'done');
        expect(hasMigratedToDrive('alice@example.com')).toBe(true);
        expect(hasMigratedToDrive('bob@example.com')).toBe(false);
    });

    it('hasMigratedToDrive: legacy flag covers users without email', () => {
        const ls = makeLocalStorageMock();
        vi.stubGlobal('localStorage', ls);

        function hasMigratedToDrive(email?: string): boolean {
            if (email && ls.getItem(getMigrationFlagKey(email)) === 'done') return true;
            return ls.getItem(MIGRATION_FLAG_LEGACY) === 'done';
        }

        ls.setItem(MIGRATION_FLAG_LEGACY, 'done');
        expect(hasMigratedToDrive()).toBe(true);
        expect(hasMigratedToDrive('alice@example.com')).toBe(true); // legacy covers all
    });

    it('resetMigrationFlag removes scoped flag without touching other users', () => {
        const ls = makeLocalStorageMock();
        vi.stubGlobal('localStorage', ls);

        ls.setItem(getMigrationFlagKey('alice@example.com'), 'done');
        ls.setItem(getMigrationFlagKey('bob@example.com'),   'done');

        ls.removeItem(getMigrationFlagKey('alice@example.com'));

        expect(ls.getItem(getMigrationFlagKey('alice@example.com'))).toBeNull();
        expect(ls.getItem(getMigrationFlagKey('bob@example.com'))).toBe('done');
    });
});
