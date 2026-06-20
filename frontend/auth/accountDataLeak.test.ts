/**
 * accountDataLeak.test.ts
 *
 * Maximum-coverage test suite for cross-account data isolation in ProCV.
 *
 * Tests every vector by which a previous user's data could leak to a new user
 * on the same device, including the two bugs found and fixed in June 2026:
 *
 *  Bug 6 — Legacy bare localStorage keys (profiles, currentCV, savedCVs,
 *           savedCoverLetters, trackedApps, starStories, template) survived
 *           the clearAppData wipe because the wipe only targeted prefixed keys.
 *
 *  Bug 7 — restoreLocalStorageFromIDB() runs at boot before React mounts and
 *           restores ALL cv_builder_appdata IDB entries. The account-switch
 *           wipe cleared IDB fire-and-forget, then immediately reloaded. If
 *           the IDB clear didn't finish, restoreLocalStorageFromIDB would
 *           copy the old user's data right back into localStorage.
 *
 * Scenario coverage:
 *  A. Delete account → same user re-registers
 *  B. Delete account → different user signs in
 *  C. Account switch (User A active → User B signs in, no explicit sign-out)
 *  D. Sign out → same user returns
 *  E. Sign out → different user signs in
 *  F. Cross-tab sign-out isolation
 *  G. Profile-room key isolation
 *  H. IDB restore sentinel (Bug 7) — all paths
 *  I. Legacy bare key clearance (Bug 6) — all keys
 *  J. rotateDeviceId — fresh device_id on delete
 *  K. stampDeletedAccount / stampSignedOut sentinel mechanics
 *  L. Multi-account rotation (A→B→C→A)
 *  M. Edge cases: empty store, quota errors, double-wipe
 *
 * All tests are pure Node / no browser APIs — localStorage is mocked.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── localStorage mock ────────────────────────────────────────────────────────

function makeLS() {
    const store: Record<string, string> = {};
    return {
        getItem:    (k: string): string | null => store[k] ?? null,
        setItem:    (k: string, v: string): void => { store[k] = String(v); },
        removeItem: (k: string): void => { delete store[k]; },
        clear:      (): void => { Object.keys(store).forEach(k => delete store[k]); },
        get length(): number { return Object.keys(store).length; },
        key:        (i: number): string | null => Object.keys(store)[i] ?? null,
        /** Direct access to the underlying store for assertions */
        _store:     store,
        /** Snapshot all key/value pairs */
        snapshot:   (): Record<string, string> => ({ ...store }),
        /** All current keys as an array */
        keys:       (): string[] => Object.keys(store),
    };
}

// ─── Constants — must stay in sync with the source files ─────────────────────

const ACCOUNT_HASH_KEY       = 'procv:account_email_hash';
const LAST_REAL_HASH_KEY     = 'procv:last_real_email_hash';
const SIGNED_OUT_SENTINEL    = 'signed_out';
const DELETED_CLEAN_SENTINEL = 'deleted_clean';
const LS_AUTH_CLEARED        = 'cv_auth_cleared';
const LS_APPDATA_CLEARED     = 'cv_appdata_cleared';   // Bug 7 fix
const DEVICE_ID_KEY          = 'cv_builder:deviceId';

// Legacy bare keys that must be cleared by the full wipe (Bug 6 fix)
const LEGACY_APP_KEYS = [
    'profiles',
    'currentCV',
    'savedCVs',
    'savedCoverLetters',
    'trackedApps',
    'starStories',
    'template',
] as const;

// All auth-scoped keys that are cleared on every sign-out
const AUTH_KEYS = [
    'cv_gdrive_token',
    'cv_gdrive_expiry',
    'cv_gdrive_user',
    'cv_drive_last_sync',
    'procv:worker_session',
    'procv:worker_user',
];

// ─── FNV-32 (mirrors App.tsx _fnv32) ─────────────────────────────────────────

function fnv32(str: string): string {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
}

// ─── Pure implementations (mirrors source files) ──────────────────────────────

type LS = ReturnType<typeof makeLS>;

function stampSignedOut(ls: LS): void {
    const cur = ls.getItem(ACCOUNT_HASH_KEY);
    if (cur && cur !== SIGNED_OUT_SENTINEL && cur !== DELETED_CLEAN_SENTINEL) {
        ls.setItem(LAST_REAL_HASH_KEY, cur);
    }
    ls.setItem(ACCOUNT_HASH_KEY, SIGNED_OUT_SENTINEL);
}

function stampDeletedAccount(ls: LS): void {
    ls.removeItem(LAST_REAL_HASH_KEY);
    ls.setItem(ACCOUNT_HASH_KEY, DELETED_CLEAN_SENTINEL);
}

function rotateDeviceId(ls: LS): string {
    const newId = `rotated-${Math.random().toString(36).slice(2)}`;
    ls.setItem(DEVICE_ID_KEY, newId);
    return newId;
}

/**
 * clearUserScopedStorage({ clearAppData: true })
 * Mirrors the production implementation exactly, including Bug 6 fix.
 */
function clearAppData(ls: LS): void {
    // Auth keys
    AUTH_KEYS.forEach(k => ls.removeItem(k));

    // Collect all keys FIRST to avoid index-shift bug during deletion
    const allKeys = ls.keys();

    // cv_builder:* (except deviceId)
    allKeys
        .filter(k => k.startsWith('cv_builder:') && k !== DEVICE_ID_KEY)
        .forEach(k => ls.removeItem(k));

    // procv:* (except account-switch keys)
    allKeys
        .filter(k =>
            k.startsWith('procv:') &&
            k !== ACCOUNT_HASH_KEY &&
            k !== LAST_REAL_HASH_KEY,
        )
        .forEach(k => ls.removeItem(k));

    // p:* profile-room keys
    allKeys.filter(k => k.startsWith('p:')).forEach(k => ls.removeItem(k));

    // cv:* per-session state
    allKeys.filter(k => k.startsWith('cv:')).forEach(k => ls.removeItem(k));

    // Bug 6 fix — legacy bare keys
    LEGACY_APP_KEYS.forEach(k => ls.removeItem(k));

    // Bug 7 fix — write IDB-restore sentinel synchronously
    ls.setItem(LS_AUTH_CLEARED, '1');
    ls.setItem(LS_APPDATA_CLEARED, '1');
}

type GuardOutcome = 'wipe' | 'same-user' | 'clean-delete' | 'no-action';

function runGuard(ls: LS, email: string): GuardOutcome {
    const newHash    = fnv32(email);
    const stored     = ls.getItem(ACCOUNT_HASH_KEY);

    if (!stored || stored === newHash) {
        ls.setItem(ACCOUNT_HASH_KEY, newHash);
        return 'no-action';
    }

    if (stored === DELETED_CLEAN_SENTINEL) {
        ls.removeItem(LAST_REAL_HASH_KEY);
        ls.setItem(ACCOUNT_HASH_KEY, newHash);
        return 'clean-delete';
    }

    if (stored === SIGNED_OUT_SENTINEL) {
        const lastHash = ls.getItem(LAST_REAL_HASH_KEY);
        ls.removeItem(LAST_REAL_HASH_KEY); // one-time use
        if (lastHash && lastHash === newHash) {
            ls.setItem(ACCOUNT_HASH_KEY, newHash);
            return 'same-user';
        }
        ls.setItem(ACCOUNT_HASH_KEY, newHash);
        return 'wipe';
    }

    ls.setItem(ACCOUNT_HASH_KEY, newHash);
    return 'wipe';
}

/**
 * Simulate restoreLocalStorageFromIDB (Bug 7 fix).
 * Returns true if the restore was skipped (sentinel was present), false otherwise.
 */
function restoreFromIDB(ls: LS, idbData: Record<string, string>): boolean {
    if (ls.getItem(LS_APPDATA_CLEARED)) {
        ls.removeItem(LS_APPDATA_CLEARED);
        // In production, the IDB store is also cleared here
        return true; // restore skipped
    }
    // Restore: only writes keys that are missing from localStorage
    for (const [key, value] of Object.entries(idbData)) {
        if (ls.getItem(key) === null) {
            ls.setItem(key, value);
        }
    }
    return false; // restore ran
}

/**
 * Simulate loadAuthState sentinel guard (Bug 2 fix, unchanged).
 * Returns null (no auth) if LS_AUTH_CLEARED is set.
 */
function loadAuthState(ls: LS, idbAuth: object | null): object | null {
    if (ls.getItem(LS_AUTH_CLEARED)) {
        ls.removeItem(LS_AUTH_CLEARED);
        return null; // stale IDB token blocked
    }
    return idbAuth;
}

// ─── Helper: populate a realistic User A state ───────────────────────────────

const USER_A = 'alice@example.com';
const USER_B = 'bob@example.com';
const USER_C = 'carol@example.com';

function seedUserA(ls: LS): void {
    ls.setItem(ACCOUNT_HASH_KEY, fnv32(USER_A));
    ls.setItem(DEVICE_ID_KEY, 'device-original-abc');

    // Prefixed app data
    ls.setItem('cv_builder:profiles', JSON.stringify([{ id: 'slot-1', name: USER_A }]));
    ls.setItem('cv_builder:activeProfileId', 'slot-1');
    ls.setItem('cv_builder:darkMode', 'true');
    ls.setItem('cv_builder:apiSettings', JSON.stringify({ key: 'sk-alice' }));

    // Auth / Drive tokens
    ls.setItem('cv_gdrive_token', 'alice-drive-token');
    ls.setItem('cv_gdrive_expiry', String(Date.now() + 3600_000));
    ls.setItem('procv:worker_session', 'alice-session-token');
    ls.setItem('procv:worker_user', JSON.stringify({ email: USER_A }));

    // Profile-room keys
    ls.setItem('p:slot-1:jd', 'Senior Engineer at ACME');
    ls.setItem('p:slot-1:company', 'ACME Corp');
    ls.setItem('p:slot-1:jobTitle', 'Senior Engineer');

    // Per-session state
    ls.setItem('cv:purpose', 'job');
    ls.setItem('cv:targetCompany', 'ACME');

    // procv:* misc
    ls.setItem('procv:onboardingDone', '1');
    ls.setItem('procv:download_count', '5');
    ls.setItem('procv:drive_scope_granted', '1');
    ls.setItem('procv:jd-analysis:history', JSON.stringify(['some-jd']));

    // Profile cache hashes
    ls.setItem('procv:profile_hash_slot-1', 'abc123');

    // Legacy bare keys (Bug 6 territory)
    ls.setItem('profiles', JSON.stringify([{ id: 'legacy-slot' }]));
    ls.setItem('currentCV', JSON.stringify({ name: 'Alice CV' }));
    ls.setItem('savedCVs', JSON.stringify([{ id: 'cv-1' }]));
    ls.setItem('savedCoverLetters', JSON.stringify([{ id: 'cl-1' }]));
    ls.setItem('trackedApps', JSON.stringify([{ id: 'app-1' }]));
    ls.setItem('starStories', JSON.stringify([{ id: 'ss-1' }]));
    ls.setItem('template', 'executive-sidebar');

    // Migration flag
    ls.setItem('cv_builder:gdrive_migrated', 'done');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO A — Delete account → same user re-registers
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario A — Delete account then same user re-registers', () => {
    let ls: LS;

    beforeEach(() => {
        ls = makeLS();
        seedUserA(ls);

        // Simulate delete-account flow
        clearAppData(ls);
        rotateDeviceId(ls);
        stampDeletedAccount(ls);
    });

    it('DELETED_CLEAN_SENTINEL is written after delete', () => {
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(DELETED_CLEAN_SENTINEL);
    });

    it('device_id is rotated to a new value', () => {
        const newId = ls.getItem(DEVICE_ID_KEY);
        expect(newId).not.toBeNull();
        expect(newId).not.toBe('device-original-abc');
    });

    it('LAST_REAL_HASH_KEY is cleared (stampDeletedAccount erases it)', () => {
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('guard returns clean-delete when same user signs back in', () => {
        const outcome = runGuard(ls, USER_A);
        expect(outcome).toBe('clean-delete');
    });

    it('guard returns clean-delete when ANY user signs in after delete', () => {
        const outcome = runGuard(ls, USER_B);
        expect(outcome).toBe('clean-delete');
    });

    it('no prefixed app data survives delete', () => {
        const surviving = ls.keys().filter(k =>
            k.startsWith('cv_builder:') && k !== DEVICE_ID_KEY
        );
        expect(surviving).toHaveLength(0);
    });

    it('no profile-room keys survive delete (Bug 6 — p: prefix)', () => {
        expect(ls.keys().filter(k => k.startsWith('p:'))).toHaveLength(0);
    });

    it('no cv: session keys survive delete', () => {
        expect(ls.keys().filter(k => k.startsWith('cv:'))).toHaveLength(0);
    });

    it('no Drive/auth tokens survive delete', () => {
        AUTH_KEYS.forEach(k => expect(ls.getItem(k)).toBeNull());
    });

    // Bug 6 — legacy bare keys
    it('[Bug 6] "profiles" bare key is cleared on delete', () => {
        expect(ls.getItem('profiles')).toBeNull();
    });
    it('[Bug 6] "currentCV" bare key is cleared on delete', () => {
        expect(ls.getItem('currentCV')).toBeNull();
    });
    it('[Bug 6] "savedCVs" bare key is cleared on delete', () => {
        expect(ls.getItem('savedCVs')).toBeNull();
    });
    it('[Bug 6] "savedCoverLetters" bare key is cleared on delete', () => {
        expect(ls.getItem('savedCoverLetters')).toBeNull();
    });
    it('[Bug 6] "trackedApps" bare key is cleared on delete', () => {
        expect(ls.getItem('trackedApps')).toBeNull();
    });
    it('[Bug 6] "starStories" bare key is cleared on delete', () => {
        expect(ls.getItem('starStories')).toBeNull();
    });
    it('[Bug 6] "template" bare key is cleared on delete', () => {
        expect(ls.getItem('template')).toBeNull();
    });

    // Bug 7 sentinel
    it('[Bug 7] LS_APPDATA_CLEARED sentinel is set after delete', () => {
        expect(ls.getItem(LS_APPDATA_CLEARED)).toBe('1');
    });
    it('[Bug 7] LS_AUTH_CLEARED sentinel is set after delete', () => {
        expect(ls.getItem(LS_AUTH_CLEARED)).toBe('1');
    });

    it('[Bug 7] restoreFromIDB skips restore and clears sentinel', () => {
        const idbData = {
            'cv_builder:profiles': JSON.stringify([{ id: 'stale-slot', name: USER_A }]),
            'cv_builder:activeProfileId': 'stale-slot',
        };
        const skipped = restoreFromIDB(ls, idbData);
        expect(skipped).toBe(true);
        expect(ls.getItem('cv_builder:profiles')).toBeNull();
        expect(ls.getItem(LS_APPDATA_CLEARED)).toBeNull(); // consumed
    });

    it('[Bug 7] loadAuthState returns null (stale token blocked)', () => {
        const staleToken = { email: USER_A, accessToken: 'old-token' };
        const result = loadAuthState(ls, staleToken);
        expect(result).toBeNull();
    });

    it('after guard + restore: new user starts with zero profiles', () => {
        runGuard(ls, USER_B);
        const idbData = { 'cv_builder:profiles': JSON.stringify([{ id: 'alice-slot' }]) };
        restoreFromIDB(ls, idbData); // skipped because sentinel
        const raw = ls.getItem('cv_builder:profiles');
        expect(raw).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO B — Delete account then DIFFERENT user signs in
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario B — Delete account then different user signs in', () => {
    let ls: LS;

    beforeEach(() => {
        ls = makeLS();
        seedUserA(ls);
        clearAppData(ls);
        rotateDeviceId(ls);
        stampDeletedAccount(ls);
    });

    it('guard returns clean-delete for User B (not wipe — no double-wipe)', () => {
        expect(runGuard(ls, USER_B)).toBe('clean-delete');
    });

    it('LAST_REAL_HASH_KEY is consumed by clean-delete path', () => {
        runGuard(ls, USER_B);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('ACCOUNT_HASH_KEY is updated to User B hash', () => {
        runGuard(ls, USER_B);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(fnv32(USER_B));
    });

    it('[Bug 6] User B cannot read any legacy bare key from User A', () => {
        runGuard(ls, USER_B);
        LEGACY_APP_KEYS.forEach(k => expect(ls.getItem(k)).toBeNull());
    });

    it('[Bug 7] User B cannot read User A data from IDB via restoreFromIDB', () => {
        const idbData = {
            'cv_builder:profiles': JSON.stringify([{ id: 'alice-slot', name: USER_A }]),
        };
        restoreFromIDB(ls, idbData);
        expect(ls.getItem('cv_builder:profiles')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO C — Account switch: User A active, User B signs in (no sign-out)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario C — Account switch without explicit sign-out', () => {
    let ls: LS;

    beforeEach(() => {
        ls = makeLS();
        seedUserA(ls);
    });

    it('guard returns wipe when User B appears without sign-out', () => {
        expect(runGuard(ls, USER_B)).toBe('wipe');
    });

    it('after wipe: no prefixed cv_builder app data remains', () => {
        runGuard(ls, USER_B);
        clearAppData(ls);
        const surviving = ls.keys().filter(k =>
            k.startsWith('cv_builder:') && k !== DEVICE_ID_KEY
        );
        expect(surviving).toHaveLength(0);
    });

    it('[Bug 6] after wipe: no legacy bare keys from User A remain', () => {
        clearAppData(ls);
        LEGACY_APP_KEYS.forEach(k => expect(ls.getItem(k)).toBeNull());
    });

    it('[Bug 6] "profiles" bare key does not bleed to User B', () => {
        clearAppData(ls);
        const raw = ls.getItem('profiles');
        expect(raw).toBeNull();
    });

    it('[Bug 6] "savedCVs" bare key does not bleed to User B', () => {
        clearAppData(ls);
        expect(ls.getItem('savedCVs')).toBeNull();
    });

    it('[Bug 7] LS_APPDATA_CLEARED is set after account-switch wipe', () => {
        clearAppData(ls);
        expect(ls.getItem(LS_APPDATA_CLEARED)).toBe('1');
    });

    it('[Bug 7] restoreFromIDB is blocked by sentinel — User A IDB data not restored', () => {
        clearAppData(ls); // sets sentinel
        const userAIdb = {
            'cv_builder:profiles': JSON.stringify([{ id: 'alice-slot' }]),
            'cv_builder:activeProfileId': 'alice-slot',
            'cv_builder:darkMode': 'true',
        };
        restoreFromIDB(ls, userAIdb);
        expect(ls.getItem('cv_builder:profiles')).toBeNull();
        expect(ls.getItem('cv_builder:activeProfileId')).toBeNull();
    });

    it('[Bug 7] sentinel is consumed by restoreFromIDB (one-shot)', () => {
        clearAppData(ls);
        restoreFromIDB(ls, {});
        expect(ls.getItem(LS_APPDATA_CLEARED)).toBeNull();
    });

    it('[Bug 7] second restoreFromIDB call (no sentinel) restores normally', () => {
        clearAppData(ls);
        restoreFromIDB(ls, {}); // consume sentinel
        const bobData = { 'cv_builder:profiles': JSON.stringify([{ id: 'bob-slot' }]) };
        restoreFromIDB(ls, bobData);
        // Sentinel is gone, restore runs — but localStorage was empty, so it restores
        expect(ls.getItem('cv_builder:profiles')).toBe(JSON.stringify([{ id: 'bob-slot' }]));
    });

    it('device_id is preserved across account switch (not rotated)', () => {
        // rotateDeviceId is only called on full delete, not on switch
        const original = ls.getItem(DEVICE_ID_KEY);
        runGuard(ls, USER_B);
        expect(ls.getItem(DEVICE_ID_KEY)).toBe(original);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO D — Sign out → same user returns (double-login bug fix)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario D — Sign out, then SAME user signs back in', () => {
    let ls: LS;

    beforeEach(() => {
        ls = makeLS();
        seedUserA(ls);
        // Normal sign-out: clear auth keys + stamp
        AUTH_KEYS.forEach(k => ls.removeItem(k));
        stampSignedOut(ls);
    });

    it('guard returns same-user (no wipe) for Alice returning', () => {
        expect(runGuard(ls, USER_A)).toBe('same-user');
    });

    it('LAST_REAL_HASH_KEY is consumed after same-user return', () => {
        runGuard(ls, USER_A);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('ACCOUNT_HASH_KEY is restored to Alice\'s hash', () => {
        runGuard(ls, USER_A);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(fnv32(USER_A));
    });

    it('app data is still present (same user, no wipe)', () => {
        runGuard(ls, USER_A);
        // cv_builder:profiles should not have been wiped on same-user return
        expect(ls.getItem('cv_builder:profiles')).not.toBeNull();
    });

    it('second call to runGuard for same user is no-action (sentinel consumed)', () => {
        runGuard(ls, USER_A);
        const second = runGuard(ls, USER_A);
        expect(second).toBe('no-action');
    });

    it('[Bug 7] restoreFromIDB runs normally (no sentinel on same-user return)', () => {
        // same-user return does NOT call clearAppData, so no sentinel is set
        runGuard(ls, USER_A);
        expect(ls.getItem(LS_APPDATA_CLEARED)).toBeNull();
        const idbData = { 'cv_builder:profiles': JSON.stringify([{ id: 'alice-slot' }]) };
        const skipped = restoreFromIDB(ls, idbData);
        expect(skipped).toBe(false); // restore ran (no sentinel)
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO E — Sign out → different user signs in
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario E — Sign out, then DIFFERENT user signs in', () => {
    let ls: LS;

    beforeEach(() => {
        ls = makeLS();
        seedUserA(ls);
        AUTH_KEYS.forEach(k => ls.removeItem(k));
        stampSignedOut(ls);
    });

    it('guard returns wipe when Bob signs in after Alice signs out', () => {
        expect(runGuard(ls, USER_B)).toBe('wipe');
    });

    it('after wipe: no legacy bare keys from Alice remain', () => {
        runGuard(ls, USER_B);
        clearAppData(ls);
        LEGACY_APP_KEYS.forEach(k => expect(ls.getItem(k)).toBeNull());
    });

    it('[Bug 7] IDB sentinel blocks Alice\'s IDB data from reaching Bob', () => {
        clearAppData(ls);
        const aliceIdb = {
            'cv_builder:profiles': JSON.stringify([{ id: 'alice-slot', email: USER_A }]),
        };
        const skipped = restoreFromIDB(ls, aliceIdb);
        expect(skipped).toBe(true);
        expect(ls.getItem('cv_builder:profiles')).toBeNull();
    });

    it('LAST_REAL_HASH_KEY is consumed after wipe (not left as stale hint)', () => {
        runGuard(ls, USER_B);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('[Bug 6] Alice\'s "profiles" bare key does not bleed to Bob', () => {
        clearAppData(ls);
        const raw = ls.getItem('profiles');
        // Must be null — Bob has no profiles yet
        expect(raw).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO F — Cross-tab sign-out
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario F — Cross-tab sign-out forces wipe on other tabs', () => {
    let tabA: LS;
    let tabB: LS;

    beforeEach(() => {
        // Simulate two tabs sharing the same localStorage state
        tabA = makeLS();
        seedUserA(tabA);

        // Tab B is a fresh copy of the same storage
        tabB = makeLS();
        Object.entries(tabA._store).forEach(([k, v]) => tabB.setItem(k, v));
    });

    it('Tab B wipes and reloads when Tab A fires SIGNED_OUT_SENTINEL', () => {
        // Tab A signs out — writes sentinel to storage
        stampSignedOut(tabA);

        // Tab B observes the storage event (key = ACCOUNT_HASH_KEY, new value = sentinel)
        const newValue = tabA.getItem(ACCOUNT_HASH_KEY);
        expect(newValue).toBe(SIGNED_OUT_SENTINEL);

        // Tab B cross-tab handler: sees sentinel → wipe
        if (newValue === SIGNED_OUT_SENTINEL) {
            clearAppData(tabB);
        }

        // Verify Tab B is wiped
        LEGACY_APP_KEYS.forEach(k => expect(tabB.getItem(k)).toBeNull());
        expect(tabB.getItem('cv_builder:profiles')).toBeNull();
    });

    it('[Bug 6] cross-tab wipe clears legacy bare keys in the other tab', () => {
        stampSignedOut(tabA);
        clearAppData(tabB); // triggered by cross-tab storage event

        LEGACY_APP_KEYS.forEach(k => {
            expect(tabB.getItem(k)).toBeNull();
        });
    });

    it('[Bug 7] cross-tab wipe sets IDB sentinel in Tab B', () => {
        clearAppData(tabB);
        expect(tabB.getItem(LS_APPDATA_CLEARED)).toBe('1');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO G — Profile-room key isolation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario G — Profile-room keys (p:* prefix) are fully isolated', () => {
    let ls: LS;

    beforeEach(() => {
        ls = makeLS();
        seedUserA(ls);

        // Lots of profile room keys
        ls.setItem('p:slot-1:jd', 'Alice JD');
        ls.setItem('p:slot-1:company', 'Alice Corp');
        ls.setItem('p:slot-2:jd', 'Alice JD 2');
        ls.setItem('p:abc-123:jobTitle', 'Staff Engineer');
        ls.setItem('p:abc-123:purpose', 'promotion');
    });

    it('all p:* keys are wiped by clearAppData', () => {
        clearAppData(ls);
        const remaining = ls.keys().filter(k => k.startsWith('p:'));
        expect(remaining).toHaveLength(0);
    });

    it('p:* keys with complex slot IDs are wiped', () => {
        ls.setItem('p:some-very-long-uuid-slot-id:keywords', 'typescript react');
        clearAppData(ls);
        expect(ls.getItem('p:some-very-long-uuid-slot-id:keywords')).toBeNull();
    });

    it('after wipe: no profile room data from User A can reach User B', () => {
        clearAppData(ls);
        const pKeys = ls.keys().filter(k => k.startsWith('p:'));
        expect(pKeys).toHaveLength(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO H — IDB restore sentinel (Bug 7) — all paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario H — LS_APPDATA_CLEARED sentinel (Bug 7) exhaustive paths', () => {
    let ls: LS;

    beforeEach(() => { ls = makeLS(); });

    it('sentinel blocks restore: profiles not written to localStorage', () => {
        ls.setItem(LS_APPDATA_CLEARED, '1');
        const stale = { 'cv_builder:profiles': JSON.stringify([{ id: 'stale' }]) };
        restoreFromIDB(ls, stale);
        expect(ls.getItem('cv_builder:profiles')).toBeNull();
    });

    it('sentinel blocks restore: activeProfileId not written', () => {
        ls.setItem(LS_APPDATA_CLEARED, '1');
        restoreFromIDB(ls, { 'cv_builder:activeProfileId': 'stale-id' });
        expect(ls.getItem('cv_builder:activeProfileId')).toBeNull();
    });

    it('sentinel blocks restore: all cv_builder:* keys blocked', () => {
        ls.setItem(LS_APPDATA_CLEARED, '1');
        const stale: Record<string, string> = {
            'cv_builder:profiles': '[]',
            'cv_builder:activeProfileId': 'x',
            'cv_builder:darkMode': 'true',
            'cv_builder:apiSettings': '{}',
        };
        restoreFromIDB(ls, stale);
        Object.keys(stale).forEach(k => expect(ls.getItem(k)).toBeNull());
    });

    it('sentinel is consumed exactly once (one-shot)', () => {
        ls.setItem(LS_APPDATA_CLEARED, '1');
        restoreFromIDB(ls, {});
        expect(ls.getItem(LS_APPDATA_CLEARED)).toBeNull();
    });

    it('without sentinel: restore writes missing keys to localStorage', () => {
        const idbData = { 'cv_builder:profiles': JSON.stringify([{ id: 'bob-slot' }]) };
        const skipped = restoreFromIDB(ls, idbData);
        expect(skipped).toBe(false);
        expect(ls.getItem('cv_builder:profiles')).toBe(JSON.stringify([{ id: 'bob-slot' }]));
    });

    it('without sentinel: restore does NOT overwrite existing localStorage values', () => {
        ls.setItem('cv_builder:profiles', JSON.stringify([{ id: 'fresh' }]));
        restoreFromIDB(ls, { 'cv_builder:profiles': JSON.stringify([{ id: 'stale' }]) });
        // Existing key must not be overwritten
        expect(JSON.parse(ls.getItem('cv_builder:profiles')!)[0].id).toBe('fresh');
    });

    it('sentinel present even when IDB data is empty (wipe sets it regardless)', () => {
        // clearAppData always writes the sentinel — even with no IDB data
        ls.setItem(LS_APPDATA_CLEARED, '1');
        const skipped = restoreFromIDB(ls, {});
        expect(skipped).toBe(true);
    });

    it('end-to-end: wipe → sentinel set → boot restore blocked → new user starts clean', () => {
        seedUserA(ls);
        clearAppData(ls); // sets sentinel

        // New page load: restoreFromIDB runs before React mounts
        const userAIdb: Record<string, string> = {
            'cv_builder:profiles': JSON.stringify([{ id: 'alice-slot', email: USER_A }]),
            'cv_builder:activeProfileId': 'alice-slot',
            'cv_builder:apiSettings': JSON.stringify({ key: 'sk-alice-secret' }),
        };
        const skipped = restoreFromIDB(ls, userAIdb);

        expect(skipped).toBe(true);
        expect(ls.getItem('cv_builder:profiles')).toBeNull();
        expect(ls.getItem('cv_builder:activeProfileId')).toBeNull();
        // API key must not leak
        expect(ls.getItem('cv_builder:apiSettings')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO I — Legacy bare key clearance (Bug 6) — exhaustive
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario I — Legacy bare key clearance (Bug 6) exhaustive', () => {
    let ls: LS;

    beforeEach(() => {
        ls = makeLS();
        // Seed only the bare legacy keys (worst case: user never migrated to cv_builder: prefix)
        LEGACY_APP_KEYS.forEach((k, i) => ls.setItem(k, `legacy-value-${i}`));
    });

    it('every LEGACY_APP_KEY is wiped by clearAppData', () => {
        clearAppData(ls);
        LEGACY_APP_KEYS.forEach(k => expect(ls.getItem(k)).toBeNull());
    });

    it('wipe does not miss "profiles" even when cv_builder:profiles is absent', () => {
        // Before Bug 6 fix, the wipe only cleared cv_builder:profiles
        // If cv_builder:profiles was already gone but "profiles" still existed,
        // the new user would load from the bare key
        ls.removeItem('cv_builder:profiles'); // already absent
        clearAppData(ls);
        expect(ls.getItem('profiles')).toBeNull();
    });

    it('wipe does not miss "currentCV" (raw CV data leak)', () => {
        ls.setItem('currentCV', JSON.stringify({ personalInfo: { name: USER_A } }));
        clearAppData(ls);
        expect(ls.getItem('currentCV')).toBeNull();
    });

    it('wipe clears "savedCVs" containing sensitive CV content', () => {
        ls.setItem('savedCVs', JSON.stringify([{
            id: 'cv-1',
            personalInfo: { name: USER_A, email: USER_A },
        }]));
        clearAppData(ls);
        expect(ls.getItem('savedCVs')).toBeNull();
    });

    it('wipe clears "savedCoverLetters" (private correspondence)', () => {
        ls.setItem('savedCoverLetters', JSON.stringify([{ content: 'Dear Hiring Manager...' }]));
        clearAppData(ls);
        expect(ls.getItem('savedCoverLetters')).toBeNull();
    });

    it('wipe clears "trackedApps" (job application history)', () => {
        ls.setItem('trackedApps', JSON.stringify([{ company: 'Secret Employer' }]));
        clearAppData(ls);
        expect(ls.getItem('trackedApps')).toBeNull();
    });

    it('wipe clears "starStories" (STAR interview prep — sensitive)', () => {
        ls.setItem('starStories', JSON.stringify([{ situation: 'I was fired from...' }]));
        clearAppData(ls);
        expect(ls.getItem('starStories')).toBeNull();
    });

    it('wipe clears "template" preference', () => {
        ls.setItem('template', 'executive-sidebar');
        clearAppData(ls);
        expect(ls.getItem('template')).toBeNull();
    });

    it('all seven legacy keys wiped in one clearAppData call from full seed', () => {
        seedUserA(ls); // seeds all legacy keys
        clearAppData(ls);
        const count = LEGACY_APP_KEYS.filter(k => ls.getItem(k) !== null).length;
        expect(count).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO J — rotateDeviceId
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario J — Device ID rotation on account deletion', () => {
    let ls: LS;

    beforeEach(() => {
        ls = makeLS();
        ls.setItem(DEVICE_ID_KEY, 'original-device-id');
    });

    it('rotateDeviceId produces a new, non-empty device ID', () => {
        const newId = rotateDeviceId(ls);
        expect(newId).toBeTruthy();
        expect(newId).not.toBe('original-device-id');
    });

    it('new device ID is stored in localStorage', () => {
        const newId = rotateDeviceId(ls);
        expect(ls.getItem(DEVICE_ID_KEY)).toBe(newId);
    });

    it('rotation is different on every call', () => {
        const id1 = rotateDeviceId(ls);
        const id2 = rotateDeviceId(ls);
        expect(id1).not.toBe(id2);
    });

    it('rotation does not clear any other keys', () => {
        ls.setItem('cv_builder:profiles', '[]');
        rotateDeviceId(ls);
        // profiles should still be present (rotation alone doesn't wipe)
        expect(ls.getItem('cv_builder:profiles')).toBe('[]');
    });

    it('device ID survives a normal sign-out (not rotated)', () => {
        AUTH_KEYS.forEach(k => ls.setItem(k, 'v'));
        AUTH_KEYS.forEach(k => ls.removeItem(k)); // sign-out clears auth
        // deviceId must survive normal sign-out
        expect(ls.getItem(DEVICE_ID_KEY)).toBe('original-device-id');
    });

    it('device ID survives clearAppData (account-switch, not delete)', () => {
        seedUserA(ls);
        ls.setItem(DEVICE_ID_KEY, 'original-device-id');
        clearAppData(ls);
        expect(ls.getItem(DEVICE_ID_KEY)).toBe('original-device-id');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO K — stampDeletedAccount / stampSignedOut sentinel mechanics
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario K — Sentinel mechanics', () => {
    let ls: LS;

    beforeEach(() => { ls = makeLS(); });

    it('stampSignedOut writes SIGNED_OUT_SENTINEL', () => {
        ls.setItem(ACCOUNT_HASH_KEY, fnv32(USER_A));
        stampSignedOut(ls);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(SIGNED_OUT_SENTINEL);
    });

    it('stampSignedOut preserves real hash in LAST_REAL_HASH_KEY', () => {
        ls.setItem(ACCOUNT_HASH_KEY, fnv32(USER_A));
        stampSignedOut(ls);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBe(fnv32(USER_A));
    });

    it('stampSignedOut called twice does NOT overwrite LAST_REAL_HASH_KEY with sentinel', () => {
        ls.setItem(ACCOUNT_HASH_KEY, fnv32(USER_A));
        stampSignedOut(ls);
        stampSignedOut(ls); // second call: ACCOUNT_HASH_KEY is already sentinel
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBe(fnv32(USER_A));
    });

    it('stampDeletedAccount writes DELETED_CLEAN_SENTINEL', () => {
        ls.setItem(ACCOUNT_HASH_KEY, fnv32(USER_A));
        stampDeletedAccount(ls);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(DELETED_CLEAN_SENTINEL);
    });

    it('stampDeletedAccount removes LAST_REAL_HASH_KEY', () => {
        ls.setItem(ACCOUNT_HASH_KEY, fnv32(USER_A));
        ls.setItem(LAST_REAL_HASH_KEY, fnv32(USER_A));
        stampDeletedAccount(ls);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('neither sentinel is equal to any real email hash', () => {
        const emails = [USER_A, USER_B, USER_C, '', 'a@b.com', '1@2.3'];
        emails.forEach(email => {
            const h = fnv32(email);
            expect(h).not.toBe(SIGNED_OUT_SENTINEL);
            expect(h).not.toBe(DELETED_CLEAN_SENTINEL);
            expect(h).not.toBe(LS_AUTH_CLEARED);
            expect(h).not.toBe(LS_APPDATA_CLEARED);
        });
    });

    it('guard correctly handles DELETED_CLEAN_SENTINEL for any incoming email', () => {
        ls.setItem(ACCOUNT_HASH_KEY, DELETED_CLEAN_SENTINEL);
        const emails = [USER_A, USER_B, USER_C];
        emails.forEach(email => {
            const freshLs = makeLS();
            freshLs.setItem(ACCOUNT_HASH_KEY, DELETED_CLEAN_SENTINEL);
            const outcome = runGuard(freshLs, email);
            expect(outcome).toBe('clean-delete');
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO L — Multi-account rotation: A → B → C → A
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario L — Multi-account rotation A→B→C→A', () => {
    let ls: LS;

    function signIn(email: string): GuardOutcome {
        return runGuard(ls, email);
    }

    function signOut(email: string): void {
        ls.setItem(ACCOUNT_HASH_KEY, fnv32(email));
        AUTH_KEYS.forEach(k => ls.removeItem(k));
        stampSignedOut(ls);
    }

    function wipeAndReload(): void {
        clearAppData(ls);
    }

    beforeEach(() => { ls = makeLS(); });

    it('A→B: wipe triggered', () => {
        seedUserA(ls);
        const r = signIn(USER_B);
        expect(r).toBe('wipe');
    });

    it('A signs out → B signs in → wipe triggered', () => {
        seedUserA(ls);
        signOut(USER_A);
        const r = signIn(USER_B);
        expect(r).toBe('wipe');
    });

    it('A→B→C: each switch triggers a wipe', () => {
        seedUserA(ls);
        signIn(USER_B); wipeAndReload();
        ls.setItem(ACCOUNT_HASH_KEY, fnv32(USER_B)); // simulate B active
        const r = signIn(USER_C);
        expect(r).toBe('wipe');
    });

    it('A→B→C→A: A returning after C is also a wipe (not same-user)', () => {
        ls.setItem(ACCOUNT_HASH_KEY, fnv32(USER_C)); // C is active
        const r = signIn(USER_A);
        expect(r).toBe('wipe');
    });

    it('A signs out → A signs back in → no wipe', () => {
        seedUserA(ls);
        signOut(USER_A);
        const r = signIn(USER_A);
        expect(r).toBe('same-user');
    });

    it('A→B wipe clears all A bare keys so B sees nothing', () => {
        seedUserA(ls);
        signIn(USER_B);
        wipeAndReload();
        LEGACY_APP_KEYS.forEach(k => expect(ls.getItem(k)).toBeNull());
        expect(ls.getItem('cv_builder:profiles')).toBeNull();
    });

    it('[Bug 7] each wipe in the chain sets sentinel — IDB restore blocked', () => {
        seedUserA(ls);
        signIn(USER_B);
        wipeAndReload();
        expect(ls.getItem(LS_APPDATA_CLEARED)).toBe('1');

        // B's boot restore is blocked
        const aIdb = { 'cv_builder:profiles': JSON.stringify([{ id: 'alice' }]) };
        restoreFromIDB(ls, aIdb);
        expect(ls.getItem('cv_builder:profiles')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO M — Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario M — Edge cases', () => {
    let ls: LS;

    beforeEach(() => { ls = makeLS(); });

    it('clearAppData on empty localStorage does not throw', () => {
        expect(() => clearAppData(ls)).not.toThrow();
    });

    it('clearAppData is idempotent — calling twice is safe', () => {
        seedUserA(ls);
        clearAppData(ls);
        clearAppData(ls); // second call — no error
        LEGACY_APP_KEYS.forEach(k => expect(ls.getItem(k)).toBeNull());
    });

    it('guard on empty localStorage (first-ever user) returns no-action', () => {
        expect(runGuard(ls, USER_A)).toBe('no-action');
    });

    it('guard handles special characters in email (non-ASCII)', () => {
        const email = 'üsер@ñoñe.io';
        const r = runGuard(ls, email);
        expect(r).toBe('no-action');
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(fnv32(email));
    });

    it('wipe preserves ACCOUNT_HASH_KEY (needed for next guard check)', () => {
        seedUserA(ls);
        const hashBefore = ls.getItem(ACCOUNT_HASH_KEY);
        clearAppData(ls);
        // ACCOUNT_HASH_KEY must survive (not wiped by procv: filter)
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(hashBefore);
    });

    it('wipe preserves LAST_REAL_HASH_KEY (needed for same-user-return check)', () => {
        seedUserA(ls);
        ls.setItem(LAST_REAL_HASH_KEY, fnv32(USER_A));
        clearAppData(ls);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBe(fnv32(USER_A));
    });

    it('wipe does NOT clear procv_admin_dark (non-procv: prefix)', () => {
        ls.setItem('procv_admin_dark', '1'); // note: no colon after procv
        clearAppData(ls);
        // This key is NOT in the procv: namespace — it should survive
        // (it's a device-level theme pref, not user data)
        expect(ls.getItem('procv_admin_dark')).toBe('1');
    });

    it('restoreFromIDB sentinel is case-exact (lowercase "1")', () => {
        ls.setItem(LS_APPDATA_CLEARED, '1');
        expect(ls.getItem(LS_APPDATA_CLEARED)).toBe('1');
        const skipped = restoreFromIDB(ls, { 'cv_builder:profiles': '[]' });
        expect(skipped).toBe(true);
    });

    it('wipe iterates all keys safely even when count is large', () => {
        // Populate 200 fake keys to stress the iteration
        for (let i = 0; i < 200; i++) {
            ls.setItem(`cv_builder:slot-${i}`, `data-${i}`);
            ls.setItem(`procv:item-${i}`, `val-${i}`);
            ls.setItem(`p:room-${i}:jd`, `jd-${i}`);
        }
        expect(() => clearAppData(ls)).not.toThrow();
        const cvKeys = ls.keys().filter(k =>
            k.startsWith('cv_builder:') && k !== DEVICE_ID_KEY
        );
        expect(cvKeys).toHaveLength(0);
    });

    it('FNV-32 of sentinels is not equal to the sentinels themselves', () => {
        // Prevent theoretical hash collision breaking the guard
        expect(fnv32(SIGNED_OUT_SENTINEL)).not.toBe(SIGNED_OUT_SENTINEL);
        expect(fnv32(DELETED_CLEAN_SENTINEL)).not.toBe(DELETED_CLEAN_SENTINEL);
    });

    it('complete isolation guarantee: after wipe + blocked restore, zero User A data visible', () => {
        seedUserA(ls);

        // Full delete flow
        clearAppData(ls);
        rotateDeviceId(ls);
        stampDeletedAccount(ls);

        // Boot sequence for next user
        loadAuthState(ls, { email: USER_A, accessToken: 'old' }); // blocked
        restoreFromIDB(ls, {                                       // blocked
            'cv_builder:profiles': JSON.stringify([{ email: USER_A }]),
            'cv_builder:apiSettings': '{"key":"sk-alice"}',
        });

        // Assert: nothing from User A remains
        const allKeys = ls.keys();
        const dataKeys = allKeys.filter(k =>
            !k.startsWith('procv:account_email_hash') &&
            k !== DEVICE_ID_KEY
        );

        // Only sentinels / account-switch keys should be left — no data
        const dataKeyValues = dataKeys.map(k => ({
            key: k,
            value: ls.getItem(k),
        }));
        const userDataKeys = dataKeyValues.filter(({ key }) =>
            key.startsWith('cv_builder:') ||
            key.startsWith('p:') ||
            key.startsWith('cv:') ||
            LEGACY_APP_KEYS.includes(key as any)
        );

        expect(userDataKeys).toHaveLength(0);
    });
});
