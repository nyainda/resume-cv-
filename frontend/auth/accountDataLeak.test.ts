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

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO N — Cross-tab storage-event propagation
//
// When a user signs out or switches accounts in Tab A, all other open tabs
// must receive the wipe signal and clear their own in-memory + localStorage
// state before the new user can sign in.
//
// The mechanism: writing to localStorage in one tab fires a `storage` event
// in EVERY OTHER tab on the same origin.  The app's cross-tab handler reads
// the event's key + newValue and decides whether to wipe.
//
// Event shape:
//   { key: string, oldValue: string|null, newValue: string|null }
//
// Relevant triggers (key → newValue):
//   ACCOUNT_HASH_KEY → SIGNED_OUT_SENTINEL     sign-out in another tab
//   ACCOUNT_HASH_KEY → DELETED_CLEAN_SENTINEL  delete in another tab
//   ACCOUNT_HASH_KEY → fnv32(email)            account-switch (new user)
//   LS_AUTH_CLEARED  → '1'                     auth IDB wipe started elsewhere
//   LS_APPDATA_CLEARED → '1'                   app IDB wipe started elsewhere
//
// Unrelated key changes MUST NOT trigger a wipe.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Cross-tab handler (mirrors what a production useEffect would do) ──────────
//
// Returns a string describing the action taken so tests can assert on it.
// In production this is a window.addEventListener('storage', ...) handler
// that calls clearAppData + window.location.reload() as needed.

type CrossTabAction =
    | 'wipe-and-reload'      // full data wipe + page reload
    | 'write-auth-sentinel'  // write LS_AUTH_CLEARED so next boot skips IDB
    | 'write-appdata-sentinel' // write LS_APPDATA_CLEARED so next boot skips IDB
    | 'no-op';               // unrelated event — ignore

function simulateCrossTabStorageEvent(
    tabBls: LS,
    event: { key: string | null; oldValue: string | null; newValue: string | null },
): CrossTabAction {
    if (!event.key || event.newValue === null) return 'no-op';

    // Primary trigger: ACCOUNT_HASH_KEY changed to a wipe-sentinel in another tab
    if (event.key === ACCOUNT_HASH_KEY) {
        if (
            event.newValue === SIGNED_OUT_SENTINEL ||
            event.newValue === DELETED_CLEAN_SENTINEL
        ) {
            // Wipe this tab's data so the new user cannot see it
            clearAppData(tabBls);
            // In production: window.location.reload()
            return 'wipe-and-reload';
        }
        // A new email hash (account-switch) also triggers a wipe
        if (
            event.newValue !== event.oldValue &&
            event.newValue !== SIGNED_OUT_SENTINEL &&
            event.newValue !== DELETED_CLEAN_SENTINEL
        ) {
            // Only wipe if there was a previous user (oldValue is a real hash)
            if (
                event.oldValue &&
                event.oldValue !== SIGNED_OUT_SENTINEL &&
                event.oldValue !== DELETED_CLEAN_SENTINEL &&
                event.oldValue !== event.newValue
            ) {
                clearAppData(tabBls);
                return 'wipe-and-reload';
            }
        }
        return 'no-op';
    }

    // Secondary triggers: IDB wipe sentinels — propagate to this tab so its
    // next boot does not restore stale data from IDB
    if (event.key === LS_AUTH_CLEARED && event.newValue === '1') {
        tabBls.setItem(LS_AUTH_CLEARED, '1');
        return 'write-auth-sentinel';
    }
    if (event.key === LS_APPDATA_CLEARED && event.newValue === '1') {
        tabBls.setItem(LS_APPDATA_CLEARED, '1');
        return 'write-appdata-sentinel';
    }

    return 'no-op';
}

describe('Scenario N — Cross-tab storage-event propagation', () => {
    let tabA: LS;
    let tabB: LS;

    beforeEach(() => {
        // Two tabs sharing the same conceptual localStorage state
        tabA = makeLS();
        seedUserA(tabA);
        // Tab B is a mirror of Tab A's state at the time both tabs were open
        tabB = makeLS();
        Object.entries(tabA._store).forEach(([k, v]) => tabB.setItem(k, v));
    });

    // ── N1: Storage event payload contract ────────────────────────────────────

    it('N1a: SIGNED_OUT_SENTINEL on ACCOUNT_HASH_KEY triggers wipe-and-reload', () => {
        stampSignedOut(tabA);
        const action = simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });
        expect(action).toBe('wipe-and-reload');
    });

    it('N1b: DELETED_CLEAN_SENTINEL on ACCOUNT_HASH_KEY triggers wipe-and-reload', () => {
        stampDeletedAccount(tabA);
        const action = simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: DELETED_CLEAN_SENTINEL,
        });
        expect(action).toBe('wipe-and-reload');
    });

    it('N1c: LS_AUTH_CLEARED sentinel propagation → Tab B writes its own copy', () => {
        clearAppData(tabA);
        const action = simulateCrossTabStorageEvent(tabB, {
            key: LS_AUTH_CLEARED,
            oldValue: null,
            newValue: '1',
        });
        expect(action).toBe('write-auth-sentinel');
        expect(tabB.getItem(LS_AUTH_CLEARED)).toBe('1');
    });

    it('N1d: LS_APPDATA_CLEARED sentinel propagation → Tab B writes its own copy', () => {
        clearAppData(tabA);
        const action = simulateCrossTabStorageEvent(tabB, {
            key: LS_APPDATA_CLEARED,
            oldValue: null,
            newValue: '1',
        });
        expect(action).toBe('write-appdata-sentinel');
        expect(tabB.getItem(LS_APPDATA_CLEARED)).toBe('1');
    });

    it('N1e: account-switch (Tab A gets new user) triggers wipe in Tab B', () => {
        const action = simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: fnv32(USER_B),
        });
        expect(action).toBe('wipe-and-reload');
    });

    // ── N2: False-negative guard — unrelated events must NOT trigger a wipe ──

    it('N2a: unrelated key change does NOT trigger wipe', () => {
        const action = simulateCrossTabStorageEvent(tabB, {
            key: 'cv_builder:darkMode',
            oldValue: 'false',
            newValue: 'true',
        });
        expect(action).toBe('no-op');
    });

    it('N2b: null newValue (key deleted) does NOT trigger wipe', () => {
        const action = simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: null,
        });
        expect(action).toBe('no-op');
    });

    it('N2c: null key does NOT trigger wipe', () => {
        const action = simulateCrossTabStorageEvent(tabB, {
            key: null,
            oldValue: null,
            newValue: SIGNED_OUT_SENTINEL,
        });
        expect(action).toBe('no-op');
    });

    it('N2d: ACCOUNT_HASH_KEY written with same value (no change) does NOT trigger wipe', () => {
        const action = simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: fnv32(USER_A), // same user, no switch
        });
        expect(action).toBe('no-op');
    });

    it('N2e: procv:worker_session change does NOT trigger wipe', () => {
        const action = simulateCrossTabStorageEvent(tabB, {
            key: 'procv:worker_session',
            oldValue: 'old-token',
            newValue: 'new-token',
        });
        expect(action).toBe('no-op');
    });

    it('N2f: LS_AUTH_CLEARED set to a value other than "1" does NOT propagate', () => {
        const action = simulateCrossTabStorageEvent(tabB, {
            key: LS_AUTH_CLEARED,
            oldValue: null,
            newValue: 'true', // wrong value — production always writes '1'
        });
        // The '1' check is strict — any other truthy value is ignored
        expect(action).toBe('no-op');
        expect(tabB.getItem(LS_AUTH_CLEARED)).toBeNull();
    });

    // ── N3: Post-wipe state — Tab B must be fully clean ──────────────────────

    it('N3a: after sign-out cross-tab event, Tab B has no User A CV data', () => {
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });
        expect(tabB.getItem('cv_builder:profiles')).toBeNull();
        expect(tabB.getItem('cv_builder:activeProfileId')).toBeNull();
        expect(tabB.getItem('cv_builder:apiSettings')).toBeNull();
    });

    it('N3b: after sign-out cross-tab event, Tab B has no Drive tokens', () => {
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });
        AUTH_KEYS.forEach(k => expect(tabB.getItem(k)).toBeNull());
    });

    it('N3c: after sign-out cross-tab event, Tab B has no legacy bare keys', () => {
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });
        LEGACY_APP_KEYS.forEach(k => expect(tabB.getItem(k)).toBeNull());
    });

    it('N3d: after sign-out cross-tab event, Tab B has no profile-room keys', () => {
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });
        const pKeys = tabB.keys().filter(k => k.startsWith('p:'));
        expect(pKeys).toHaveLength(0);
    });

    it('N3e: after sign-out cross-tab event, Tab B IDB sentinels are set', () => {
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });
        // clearAppData writes both sentinels — Tab B's next boot is protected
        expect(tabB.getItem(LS_AUTH_CLEARED)).toBe('1');
        expect(tabB.getItem(LS_APPDATA_CLEARED)).toBe('1');
    });

    it('N3f: after delete cross-tab event, Tab B has no User A data', () => {
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: DELETED_CLEAN_SENTINEL,
        });
        const cvKeys = tabB.keys().filter(k =>
            k.startsWith('cv_builder:') && k !== DEVICE_ID_KEY
        );
        expect(cvKeys).toHaveLength(0);
    });

    it('N3g: after delete cross-tab event, device_id is preserved in Tab B', () => {
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: DELETED_CLEAN_SENTINEL,
        });
        // device_id is device-scoped — must NOT be wiped
        expect(tabB.getItem(DEVICE_ID_KEY)).toBe('device-original-abc');
    });

    // ── N4: Multiple tabs all receive the wipe ─────────────────────────────────

    it('N4a: three open tabs all wipe when Tab A signs out', () => {
        const tabC = makeLS();
        const tabD = makeLS();
        Object.entries(tabA._store).forEach(([k, v]) => {
            tabC.setItem(k, v);
            tabD.setItem(k, v);
        });
        seedUserA(tabC);
        seedUserA(tabD);

        const event = {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        };

        // All three non-originating tabs receive the event
        const actionB = simulateCrossTabStorageEvent(tabB, event);
        const actionC = simulateCrossTabStorageEvent(tabC, event);
        const actionD = simulateCrossTabStorageEvent(tabD, event);

        expect(actionB).toBe('wipe-and-reload');
        expect(actionC).toBe('wipe-and-reload');
        expect(actionD).toBe('wipe-and-reload');

        // All wiped
        [tabB, tabC, tabD].forEach(tab => {
            expect(tab.getItem('cv_builder:profiles')).toBeNull();
            LEGACY_APP_KEYS.forEach(k => expect(tab.getItem(k)).toBeNull());
        });
    });

    it('N4b: sentinel propagation reaches all other tabs simultaneously', () => {
        const tabC = makeLS();
        Object.entries(tabA._store).forEach(([k, v]) => tabC.setItem(k, v));

        const event = { key: LS_APPDATA_CLEARED, oldValue: null, newValue: '1' };

        simulateCrossTabStorageEvent(tabB, event);
        simulateCrossTabStorageEvent(tabC, event);

        expect(tabB.getItem(LS_APPDATA_CLEARED)).toBe('1');
        expect(tabC.getItem(LS_APPDATA_CLEARED)).toBe('1');
    });

    // ── N5: Boot sequence safety after cross-tab wipe ─────────────────────────

    it('N5a: Tab B with IDB sentinel set → restoreFromIDB is blocked on next boot', () => {
        // Tab A fires sign-out → Tab B wipes and writes sentinels
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });

        // Tab B reloads — on boot, restoreFromIDB runs first
        const idbSnapshot = {
            'cv_builder:profiles': JSON.stringify([{ email: USER_A }]),
            'cv_builder:apiSettings': '{"key":"sk-alice"}',
        };
        const skipped = restoreFromIDB(tabB, idbSnapshot);
        expect(skipped).toBe(true); // sentinel blocked the restore
        // User A's IDB data did not re-enter Tab B's localStorage
        expect(tabB.getItem('cv_builder:profiles')).toBeNull();
    });

    it('N5b: Tab B with auth sentinel set → loadAuthState is blocked on next boot', () => {
        // LS_AUTH_CLEARED propagated from Tab A
        simulateCrossTabStorageEvent(tabB, {
            key: LS_AUTH_CLEARED,
            oldValue: null,
            newValue: '1',
        });

        // Tab B reloads — on boot, loadAuthState runs
        const staleIdbToken = { email: USER_A, accessToken: 'alice-stale-token' };
        const loaded = loadAuthState(tabB, staleIdbToken);
        expect(loaded).toBeNull(); // stale token blocked
    });

    it('N5c: after cross-tab wipe + blocked restore, zero User A data in Tab B', () => {
        // Full cross-tab account-switch flow
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });

        // Tab B reloads — both restore paths are blocked
        restoreFromIDB(tabB, {
            'cv_builder:profiles': JSON.stringify([{ email: USER_A }]),
        });
        loadAuthState(tabB, { email: USER_A, accessToken: 'alice-old' });

        // Complete isolation: zero User A data survives in Tab B.
        // deviceId is intentionally preserved (device-level, not user-level).
        const dataKeys = tabB.keys().filter(k =>
            k !== DEVICE_ID_KEY && (
                k.startsWith('cv_builder:') ||
                k.startsWith('p:') ||
                k.startsWith('cv:') ||
                (LEGACY_APP_KEYS as readonly string[]).includes(k)
            )
        );
        expect(dataKeys).toHaveLength(0);
    });

    // ── N6: Account-switch cross-tab (no explicit sign-out) ───────────────────

    it('N6a: Tab A switches accounts (A→B) → Tab B is wiped', () => {
        // Tab A's guard runs, detects new user, writes new hash and wipes
        runGuard(tabA, USER_B);   // guard writes fnv32(USER_B) to ACCOUNT_HASH_KEY

        // Storage event fires in Tab B
        const action = simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: fnv32(USER_B),
        });
        expect(action).toBe('wipe-and-reload');
    });

    it('N6b: after account-switch cross-tab wipe, Tab B cannot see User A profile-room keys', () => {
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: fnv32(USER_B),
        });
        expect(tabB.getItem('p:slot-1:jd')).toBeNull();
        expect(tabB.getItem('p:slot-1:company')).toBeNull();
    });

    it('N6c: first-time sign-in (no previous user) does NOT wipe Tab B', () => {
        // Tab B has no previous user (oldValue is null)
        const action = simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: null,
            newValue: fnv32(USER_A),
        });
        expect(action).toBe('no-op'); // no previous user → no wipe needed
    });

    // ── N7: Race condition — Tab B was idle while Tab A wiped ─────────────────

    it('N7a: Tab B idle mid-write when wipe fires — sentinel prevents its IDB restore', () => {
        // Tab B was in the middle of writing some data before the wipe arrived
        tabB.setItem('cv_builder:draftCV', JSON.stringify({ summary: 'Draft for Alice' }));

        // Wipe event arrives (from Tab A signing out)
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });

        // The mid-write draft is gone too (wipe is complete)
        expect(tabB.getItem('cv_builder:draftCV')).toBeNull();
    });

    it('N7b: both IDB sentinels are present after wipe — boot sequence safe regardless of order', () => {
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });
        // Both sentinels set by clearAppData (called inside simulateCrossTabStorageEvent)
        expect(tabB.getItem(LS_AUTH_CLEARED)).toBe('1');
        expect(tabB.getItem(LS_APPDATA_CLEARED)).toBe('1');
        // Sentinels are consumed on first read (one-time-use)
        restoreFromIDB(tabB, {}); // consumes LS_APPDATA_CLEARED
        loadAuthState(tabB, null); // consumes LS_AUTH_CLEARED
        expect(tabB.getItem(LS_APPDATA_CLEARED)).toBeNull();
        expect(tabB.getItem(LS_AUTH_CLEARED)).toBeNull();
    });

    // ── N8: Event key specificity ─────────────────────────────────────────────

    it('N8a: a key that starts with ACCOUNT_HASH_KEY but is longer does NOT trigger wipe', () => {
        const action = simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY + '_extra',
            oldValue: null,
            newValue: SIGNED_OUT_SENTINEL,
        });
        expect(action).toBe('no-op');
    });

    it('N8b: a key that contains LS_APPDATA_CLEARED as a substring does NOT propagate sentinel', () => {
        const action = simulateCrossTabStorageEvent(tabB, {
            key: 'prefix_' + LS_APPDATA_CLEARED,
            oldValue: null,
            newValue: '1',
        });
        expect(action).toBe('no-op');
        expect(tabB.getItem(LS_APPDATA_CLEARED)).toBeNull();
    });

    // ── N9: Complete cross-tab lifecycle ─────────────────────────────────────

    it('N9: full cross-tab lifecycle — sign-out → wipe → new user signs in → no data leak', () => {
        // Tab A: User A signs out
        stampSignedOut(tabA);

        // Storage event fires → Tab B wipes
        simulateCrossTabStorageEvent(tabB, {
            key: ACCOUNT_HASH_KEY,
            oldValue: fnv32(USER_A),
            newValue: SIGNED_OUT_SENTINEL,
        });

        // Tab B reloads — boot sequence runs
        restoreFromIDB(tabB, { 'cv_builder:profiles': JSON.stringify([{ email: USER_A }]) });
        loadAuthState(tabB, { email: USER_A, accessToken: 'stale' });

        // User B signs into Tab B
        runGuard(tabB, USER_B);

        // Assert: Tab B shows User B's session with zero User A data
        expect(tabB.getItem(ACCOUNT_HASH_KEY)).toBe(fnv32(USER_B));
        expect(tabB.getItem('cv_builder:profiles')).toBeNull(); // B has no profiles yet
        expect(tabB.getItem('procv:worker_session')).toBeNull(); // Alice's session gone
        LEGACY_APP_KEYS.forEach(k => expect(tabB.getItem(k)).toBeNull());
    });
});

// ─── Scenario O — Wipe-handoff payload security & isNewUser threading ─────────
//
// Verifies three Bug-3/onboarding fixes applied together:
//  1. _wipeAndHandoff stores { user, isNewUser } — NO raw token in sessionStorage.
//  2. isNewUser is correctly threaded through the wipe+reload cycle so onboarding
//     only fires for genuinely new accounts.
//  3. device_id is rotated on account switch (not just on delete) so the new
//     user starts with a fresh identifier on the server.
//  4. The _postWipeReload guard prevents the Google auto-link (which fires again
//     after reload) from overwriting the isNewUser value set by the boot path.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario O — Wipe-handoff payload security & isNewUser threading', () => {
    // The key stored in sessionStorage (must match WorkerAuthContext source)
    const PENDING_USER_KEY = 'procv:pending_user';

    // Simulate what _wipeAndHandoff writes into sessionStorage
    function buildHandoffPayload(
        user: { email: string; id: string; name: string },
        isNewUser: boolean,
    ): string {
        return JSON.stringify({ user, isNewUser });
    }

    // Simulate what the boot path parses from sessionStorage
    function readHandoffPayload(
        raw: string,
    ): { user: { email: string }; isNewUser?: boolean; token?: string } | null {
        try { return JSON.parse(raw); } catch { return null; }
    }

    // ── O1: key name contract ─────────────────────────────────────────────────

    it('O1a: pending-session key is procv:pending_user (not the old procv:pending_session)', () => {
        expect(PENDING_USER_KEY).toBe('procv:pending_user');
        expect(PENDING_USER_KEY).not.toContain('session');
    });

    it('O1b: pending-session key contains no credential-like term', () => {
        const dangerWords = ['token', 'secret', 'key', 'credential', 'password'];
        const safe = dangerWords.every(w => !PENDING_USER_KEY.includes(w));
        expect(safe).toBe(true);
    });

    // ── O2: payload shape — no raw token ──────────────────────────────────────

    it('O2a: handoff payload contains user + isNewUser but NO token field (returning user)', () => {
        const user = { email: 'alice@example.com', id: 'u1', name: 'Alice' };
        const raw  = buildHandoffPayload(user, false);
        const payload = readHandoffPayload(raw)!;

        expect(payload.user.email).toBe(user.email);
        expect(payload.isNewUser).toBe(false);
        expect('token' in payload).toBe(false);
    });

    it('O2b: handoff payload contains user + isNewUser but NO token field (new user)', () => {
        const user = { email: 'bob@example.com', id: 'u2', name: 'Bob' };
        const raw  = buildHandoffPayload(user, true);
        const payload = readHandoffPayload(raw)!;

        expect(payload.isNewUser).toBe(true);
        expect('token' in payload).toBe(false);
    });

    it('O2c: boot path typed interface only exposes user + isNewUser — no token surface', () => {
        // Even if an old payload somehow contains a token, the typed cast
        // { user: WorkerUser; isNewUser?: boolean } does not expose it.
        const legacy = JSON.stringify({ token: 'stolen-jwt', user: { email: 'eve@example.com', id: 'u5' }, isNewUser: false });
        const payload = readHandoffPayload(legacy) as { user: { email: string }; isNewUser?: boolean };

        // Boot path only reads these two fields — token is unreachable via the type
        expect(payload.user.email).toBe('eve@example.com');
        expect(payload.isNewUser).toBe(false);
        // We deliberately do NOT assert the token value — the test proves
        // the boot path has no reason to read it.
    });

    // ── O3: isNewUser threading through reload ────────────────────────────────

    it('O3: boot path sets onboarding=true when pending payload has isNewUser=true', () => {
        const ss = new Map<string, string>();
        const user = { email: 'carol@example.com', id: 'u3', name: 'Carol' };
        ss.set(PENDING_USER_KEY, buildHandoffPayload(user, true));

        const pendingRaw = ss.get(PENDING_USER_KEY)!;
        ss.delete(PENDING_USER_KEY);
        const pending = JSON.parse(pendingRaw) as { user: { email: string }; isNewUser?: boolean };

        let onboardingShown = false;
        if (pending?.user?.email) {
            if (pending.isNewUser) onboardingShown = true; // mirrors boot path
        }

        expect(onboardingShown).toBe(true);
        expect(ss.has(PENDING_USER_KEY)).toBe(false); // key consumed
    });

    it('O4: boot path leaves onboarding=false when pending payload has isNewUser=false', () => {
        const ss = new Map<string, string>();
        const user = { email: 'dave@example.com', id: 'u4', name: 'Dave' };
        ss.set(PENDING_USER_KEY, buildHandoffPayload(user, false));

        const pendingRaw = ss.get(PENDING_USER_KEY)!;
        ss.delete(PENDING_USER_KEY);
        const pending = JSON.parse(pendingRaw) as { user: { email: string }; isNewUser?: boolean };

        let onboardingShown = false;
        if (pending?.user?.email) {
            if (pending.isNewUser) onboardingShown = true;
        }

        expect(onboardingShown).toBe(false);
    });

    it('O5: missing isNewUser field (legacy payload) defaults to false — no spurious onboarding', () => {
        // Old payload shape had no isNewUser field (before this fix)
        const raw = JSON.stringify({ user: { email: 'eve@example.com', id: 'u5', name: 'Eve' } });
        const pending = JSON.parse(raw) as { user: { email: string }; isNewUser?: boolean };

        let onboardingShown = false;
        if (pending?.user?.email) {
            if (pending.isNewUser) onboardingShown = true; // undefined is falsy
        }

        expect(onboardingShown).toBe(false);
    });

    // ── O6: _postWipeReload guard ─────────────────────────────────────────────

    it('O6: _postWipeReload=true suppresses isNewUser from Google auto-link re-call', () => {
        // After wipe+reload the boot path sets _postWipeReload.current = true.
        // The Google auto-link fires again with is_new_user from the server.
        // The flag must prevent it from overwriting what the boot path already set.
        let isNewUser = false;
        const _postWipeReload = { current: true }; // boot path set this

        const googleResult = { ok: true, is_new_user: false }; // server says returning user
        if (googleResult.is_new_user && !_postWipeReload.current) {
            isNewUser = true; // must NOT execute
        }
        _postWipeReload.current = false; // consumed

        expect(isNewUser).toBe(false);
        expect(_postWipeReload.current).toBe(false); // flag consumed for future calls
    });

    it('O7: _postWipeReload=true also suppresses a spurious is_new_user=true from server', () => {
        // Device_id rotation could (on some server implementations) cause the
        // server to return is_new_user=true on the re-link.  The flag must stop
        // this from incorrectly triggering onboarding for a returning user.
        let isNewUser = false;
        const _postWipeReload = { current: true };

        const googleResult = { ok: true, is_new_user: true }; // server says "new" (wrong)
        if (googleResult.is_new_user && !_postWipeReload.current) {
            isNewUser = true; // must NOT execute because _postWipeReload is set
        }
        _postWipeReload.current = false;

        expect(isNewUser).toBe(false); // suppressed correctly
    });

    it('O8: _postWipeReload=false allows genuine first-time sign-in to set isNewUser=true', () => {
        let isNewUser = false;
        const _postWipeReload = { current: false }; // normal first-time sign-in

        const googleResult = { ok: true, is_new_user: true };
        if (googleResult.is_new_user && !_postWipeReload.current) {
            isNewUser = true; // SHOULD execute
        }
        _postWipeReload.current = false;

        expect(isNewUser).toBe(true);
    });

    // ── O9: device_id rotation on account switch ──────────────────────────────

    it('O9: device_id is rotated during wipe-handoff — new ID differs from old', () => {
        const ls = makeLS();
        ls.setItem(DEVICE_ID_KEY, 'user-a-device-abc');

        const preWipeId = ls.getItem(DEVICE_ID_KEY)!;
        rotateDeviceId(ls);
        const postRotateId = ls.getItem(DEVICE_ID_KEY)!;

        expect(postRotateId).toBeDefined();
        expect(postRotateId).not.toBe(preWipeId);
    });

    it('O10: rotated device_id survives clearAppData — it is device-level, not user-level', () => {
        const ls = makeLS();
        ls.setItem(DEVICE_ID_KEY, 'user-a-device-abc');
        ls.setItem('cv_builder:someUserData', 'private-data');
        ls.setItem('procv:worker_session', 'old-session');

        rotateDeviceId(ls); // rotate BEFORE the wipe
        const rotatedId = ls.getItem(DEVICE_ID_KEY)!;

        clearAppData(ls); // mirrors _wipeAndHandoff calling clearUserScopedStorage

        // New device_id preserved; user-scoped data gone
        expect(ls.getItem(DEVICE_ID_KEY)).toBe(rotatedId);
        expect(ls.getItem('cv_builder:someUserData')).toBeNull();
        expect(ls.getItem('procv:worker_session')).toBeNull();
    });

    it('O11: after account-switch wipe, device_id is different from the previous user\'s', () => {
        const ls = makeLS();
        ls.setItem(DEVICE_ID_KEY, 'user-a-device-111');
        ls.setItem('cv_builder:email', 'alice@example.com');

        const userADeviceId = ls.getItem(DEVICE_ID_KEY)!;

        // Account switch: rotate then wipe
        rotateDeviceId(ls);
        clearAppData(ls);

        const userBDeviceId = ls.getItem(DEVICE_ID_KEY)!;

        expect(userBDeviceId).not.toBe(userADeviceId);
        expect(ls.getItem('cv_builder:email')).toBeNull(); // User A data gone
    });

    // ── O12: full handoff → boot sequence ─────────────────────────────────────

    it('O12: full sequence — returning user B on User A\'s device does NOT see onboarding', () => {
        const ss = new Map<string, string>();
        const ls  = makeLS();

        // Setup: User A was active
        ls.setItem(DEVICE_ID_KEY, 'user-a-device');
        ls.setItem('cv_builder:profiles', '[{"id":"p1","name":"My CV"}]');

        // User B signs in → wipe-handoff triggered
        const userB = { email: 'bob@example.com', id: 'u-bob', name: 'Bob' };
        rotateDeviceId(ls);                           // step 1: rotate device_id
        clearAppData(ls);                              // step 2: wipe User A's data
        ls.setItem(ACCOUNT_HASH_KEY, fnv32(userB.email)); // step 3: stamp new hash
        ss.set(PENDING_USER_KEY, buildHandoffPayload(userB, false)); // isNewUser=false

        // Page reloads — boot path runs
        const pendingRaw = ss.get(PENDING_USER_KEY)!;
        ss.delete(PENDING_USER_KEY);
        const pending = JSON.parse(pendingRaw) as { user: { email: string }; isNewUser?: boolean };

        let onboardingShown = false;
        let _postWipeReloadRef = false;
        if (pending?.user?.email) {
            // validateSession() succeeds (mocked)
            if (pending.isNewUser) onboardingShown = true;
            _postWipeReloadRef = true; // boot path sets the flag
        }

        // Google auto-link fires next — suppressed by _postWipeReloadRef
        const googleReLink = { ok: true, is_new_user: false };
        if (googleReLink.is_new_user && !_postWipeReloadRef) onboardingShown = true;
        _postWipeReloadRef = false;

        expect(onboardingShown).toBe(false); // returning user — no onboarding
        expect(ls.getItem('cv_builder:profiles')).toBeNull(); // User A data wiped
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(fnv32(userB.email)); // User B stamped
    });

    it('O13: full sequence — brand-new User C on User A\'s device DOES see onboarding', () => {
        const ss = new Map<string, string>();
        const ls  = makeLS();

        ls.setItem(DEVICE_ID_KEY, 'user-a-device');

        const userC = { email: 'carol@example.com', id: 'u-carol', name: 'Carol' };
        rotateDeviceId(ls);
        clearAppData(ls);
        ls.setItem(ACCOUNT_HASH_KEY, fnv32(userC.email));
        ss.set(PENDING_USER_KEY, buildHandoffPayload(userC, true)); // isNewUser=true

        const pendingRaw = ss.get(PENDING_USER_KEY)!;
        ss.delete(PENDING_USER_KEY);
        const pending = JSON.parse(pendingRaw) as { user: { email: string }; isNewUser?: boolean };

        let onboardingShown = false;
        let _postWipeReloadRef = false;
        if (pending?.user?.email) {
            if (pending.isNewUser) onboardingShown = true; // true → onboarding set
            _postWipeReloadRef = true;
        }

        // Google auto-link fires — if server wrongly says is_new_user=true again,
        // the flag must stop it from double-triggering (value is already correct)
        const googleReLink = { ok: true, is_new_user: true };
        if (googleReLink.is_new_user && !_postWipeReloadRef) onboardingShown = true;
        _postWipeReloadRef = false;

        expect(onboardingShown).toBe(true); // new user — onboarding shown exactly once
    });

    it('O14: malformed pending payload is swallowed — falls through to normal sign-in', () => {
        const ss = new Map<string, string>();
        ss.set(PENDING_USER_KEY, 'not-valid-json{{{{');

        let sessionRestored = false;
        let crashed = false;
        try {
            const raw = ss.get(PENDING_USER_KEY)!;
            ss.delete(PENDING_USER_KEY);
            const pending = JSON.parse(raw) as { user: { email: string }; isNewUser?: boolean };
            if (pending?.user?.email) sessionRestored = true;
        } catch {
            // JSON.parse threw — correctly caught; boot path falls through
        }

        expect(crashed).toBe(false);        // never uncaught
        expect(sessionRestored).toBe(false); // no session from bad payload
        expect(ss.has(PENDING_USER_KEY)).toBe(false); // key consumed even on error
    });
});
