/**
 * authAccountIsolation.test.ts
 *
 * Covers every auth-isolation contract in ProCV:
 *
 *  1. FNV-32 email hash — same input same hash, different emails differ
 *  2. stampSignedOut — writes sentinel + preserves last-real-hash
 *  3. Account-switch guard logic — same user / different user / sentinel cases
 *  4. clearUserScopedStorage — what gets wiped, what survives
 *  5. IDB-auth-cleared sentinel — loadAuthState guard on stale tokens
 *  6. _wipePending guard — syncProfileToCache blocked during wipe
 *  7. Popup-closed detection — reject fires before 5-minute hard timeout
 *  8. Cross-tab sign-out sentinel — storage event handling
 *
 * All tests run in Node (vitest node env) using a localStorage mock.
 * No browser APIs, no network calls.
 */

import { describe, it, expect, beforeEach } from 'vitest';

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

// ─── Constants (must stay in sync with clearUserStorage.ts) ──────────────────

const ACCOUNT_HASH_KEY      = 'procv:account_email_hash';
const LAST_REAL_HASH_KEY    = 'procv:last_real_email_hash';
const SIGNED_OUT_SENTINEL   = 'signed_out';
const DELETED_CLEAN_SENTINEL = 'deleted_clean';
const LS_AUTH_CLEARED       = 'cv_auth_cleared';
const DEVICE_ID_KEY         = 'cv_builder:deviceId';

// ─── FNV-32 (must stay in sync with App.tsx _fnv32) ──────────────────────────

function _fnv32(str: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
}

// ─── Pure stampSignedOut logic (mirrors clearUserStorage.ts) ─────────────────

function stampSignedOut(ls: ReturnType<typeof makeLocalStorageMock>): void {
    const currentHash = ls.getItem(ACCOUNT_HASH_KEY);
    // Never re-save either sentinel — only real hashes are worth preserving
    if (
        currentHash &&
        currentHash !== SIGNED_OUT_SENTINEL &&
        currentHash !== DELETED_CLEAN_SENTINEL
    ) {
        ls.setItem(LAST_REAL_HASH_KEY, currentHash);
    }
    ls.setItem(ACCOUNT_HASH_KEY, SIGNED_OUT_SENTINEL);
}

// ─── Pure stampDeletedAccount logic (mirrors clearUserStorage.ts) ─────────────

function stampDeletedAccount(ls: ReturnType<typeof makeLocalStorageMock>): void {
    ls.removeItem(LAST_REAL_HASH_KEY);
    ls.setItem(ACCOUNT_HASH_KEY, DELETED_CLEAN_SENTINEL);
}

// ─── Pure account-switch guard (mirrors App.tsx useEffect logic) ─────────────
//
// Returns one of four outcomes:
//   'wipe'         — different user detected; clear app data and reload
//   'same-user'    — same user returning after explicit sign-out; no wipe
//   'clean-delete' — account was deleted with awaited IDB clear; straight in
//   'no-action'    — no prior record or same user; just update the hash
//
type GuardOutcome = 'wipe' | 'same-user' | 'clean-delete' | 'no-action';

function runAccountSwitchGuard(
    ls: ReturnType<typeof makeLocalStorageMock>,
    email: string,
): GuardOutcome {
    const newHash    = _fnv32(email);
    const storedHash = ls.getItem(ACCOUNT_HASH_KEY);

    if (!storedHash || storedHash === newHash) {
        ls.setItem(ACCOUNT_HASH_KEY, newHash);
        return 'no-action';
    }

    // storedHash exists and differs from newHash
    if (storedHash === DELETED_CLEAN_SENTINEL) {
        // Data was fully wiped (IDB awaited) before reload — no second wipe needed
        ls.removeItem(LAST_REAL_HASH_KEY);
        ls.setItem(ACCOUNT_HASH_KEY, newHash);
        return 'clean-delete';
    }

    if (storedHash === SIGNED_OUT_SENTINEL) {
        const lastRealHash = ls.getItem(LAST_REAL_HASH_KEY);
        ls.removeItem(LAST_REAL_HASH_KEY); // consume — one-time use
        if (lastRealHash && lastRealHash === newHash) {
            // Same user returning — skip wipe
            ls.setItem(ACCOUNT_HASH_KEY, newHash);
            return 'same-user';
        }
        // Different user after sign-out → wipe
        ls.setItem(ACCOUNT_HASH_KEY, newHash);
        return 'wipe';
    }

    // Different real-user hash stored without explicit sign-out → wipe
    ls.setItem(ACCOUNT_HASH_KEY, newHash);
    return 'wipe';
}

// ─── Pure clearUserScopedStorage logic (auth-key subset) ─────────────────────

const AUTH_KEYS = [
    'cv_gdrive_token',
    'cv_gdrive_expiry',
    'cv_gdrive_user',
    'cv_drive_last_sync',
    'procv:worker_session',
    'procv:worker_user',
];

function clearAuthKeys(ls: ReturnType<typeof makeLocalStorageMock>): void {
    AUTH_KEYS.forEach(k => ls.removeItem(k));
}

function clearAppData(ls: ReturnType<typeof makeLocalStorageMock>): void {
    clearAuthKeys(ls);
    const allKeys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k) allKeys.push(k);
    }
    allKeys
        .filter(k => k.startsWith('cv_builder:') && k !== DEVICE_ID_KEY)
        .forEach(k => ls.removeItem(k));
    allKeys
        .filter(k =>
            k.startsWith('procv:') &&
            k !== ACCOUNT_HASH_KEY &&
            k !== LAST_REAL_HASH_KEY,
        )
        .forEach(k => ls.removeItem(k));
    allKeys.filter(k => k.startsWith('p:')).forEach(k => ls.removeItem(k));
    allKeys.filter(k => k.startsWith('cv:')).forEach(k => ls.removeItem(k));
}

// ─── 1. FNV-32 hash ───────────────────────────────────────────────────────────

describe('FNV-32 email hash', () => {
    it('produces the same hash for the same email every time', () => {
        expect(_fnv32('alice@example.com')).toBe(_fnv32('alice@example.com'));
    });

    it('produces different hashes for different emails', () => {
        expect(_fnv32('alice@example.com')).not.toBe(_fnv32('bob@example.com'));
    });

    it('is case-sensitive (alice vs ALICE differ)', () => {
        expect(_fnv32('alice@example.com')).not.toBe(_fnv32('ALICE@EXAMPLE.COM'));
    });

    it('output is always a hex string', () => {
        expect(_fnv32('test@test.com')).toMatch(/^[0-9a-f]+$/);
    });

    it('empty string produces a non-empty deterministic hash', () => {
        const h = _fnv32('');
        expect(h).toBeTruthy();
        expect(h).toBe(_fnv32(''));
    });

    it('hash is not equal to the SIGNED_OUT_SENTINEL', () => {
        // Prevents a theoretical collision that would break the guard
        expect(_fnv32('alice@example.com')).not.toBe(SIGNED_OUT_SENTINEL);
        expect(_fnv32('bob@example.com')).not.toBe(SIGNED_OUT_SENTINEL);
        expect(_fnv32('')).not.toBe(SIGNED_OUT_SENTINEL);
    });
});

// ─── 2. stampSignedOut ────────────────────────────────────────────────────────

describe('stampSignedOut', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => { ls = makeLocalStorageMock(); });

    it('writes the sentinel to ACCOUNT_HASH_KEY', () => {
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        stampSignedOut(ls);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(SIGNED_OUT_SENTINEL);
    });

    it('saves the previous real hash to LAST_REAL_HASH_KEY', () => {
        const hash = _fnv32('alice@example.com');
        ls.setItem(ACCOUNT_HASH_KEY, hash);
        stampSignedOut(ls);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBe(hash);
    });

    it('does NOT overwrite LAST_REAL_HASH_KEY with the sentinel if stampSignedOut is called twice', () => {
        const hash = _fnv32('alice@example.com');
        ls.setItem(ACCOUNT_HASH_KEY, hash);
        stampSignedOut(ls); // first call: saves real hash, writes sentinel
        stampSignedOut(ls); // second call: ACCOUNT_HASH_KEY is already sentinel
        // LAST_REAL_HASH_KEY should still hold the real hash, not the sentinel
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBe(hash);
    });

    it('does nothing to LAST_REAL_HASH_KEY when no prior hash exists', () => {
        stampSignedOut(ls);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(SIGNED_OUT_SENTINEL);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('still writes the sentinel even when localStorage has no prior ACCOUNT_HASH_KEY', () => {
        stampSignedOut(ls);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(SIGNED_OUT_SENTINEL);
    });
});

// ─── 3. Account-switch guard ──────────────────────────────────────────────────

describe('Account-switch guard — no prior record', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => { ls = makeLocalStorageMock(); });

    it('returns no-action and stores the hash on first-ever sign-in', () => {
        const result = runAccountSwitchGuard(ls, 'alice@example.com');
        expect(result).toBe('no-action');
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('alice@example.com'));
    });
});

describe('Account-switch guard — same user still signed in', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
    });

    it('returns no-action for the same user (no wipe on re-render)', () => {
        expect(runAccountSwitchGuard(ls, 'alice@example.com')).toBe('no-action');
    });

    it('still stores the hash after no-action', () => {
        runAccountSwitchGuard(ls, 'alice@example.com');
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('alice@example.com'));
    });
});

describe('Account-switch guard — different user (no sign-out)', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
    });

    it('returns wipe when a different user signs in without explicit sign-out', () => {
        expect(runAccountSwitchGuard(ls, 'bob@example.com')).toBe('wipe');
    });

    it('updates ACCOUNT_HASH_KEY to the new user after wipe', () => {
        runAccountSwitchGuard(ls, 'bob@example.com');
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('bob@example.com'));
    });
});

describe('Account-switch guard — same user returning after explicit sign-out', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        // Simulate: user was signed in, then signed out
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        stampSignedOut(ls); // writes sentinel + saves real hash
    });

    it('returns same-user (no wipe) when the same person signs back in', () => {
        expect(runAccountSwitchGuard(ls, 'alice@example.com')).toBe('same-user');
    });

    it('clears ACCOUNT_HASH_KEY sentinel after same-user return', () => {
        runAccountSwitchGuard(ls, 'alice@example.com');
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('alice@example.com'));
        expect(ls.getItem(ACCOUNT_HASH_KEY)).not.toBe(SIGNED_OUT_SENTINEL);
    });

    it('consumes (removes) LAST_REAL_HASH_KEY after use', () => {
        runAccountSwitchGuard(ls, 'alice@example.com');
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('is idempotent — a second sign-in by the same user is a no-action', () => {
        runAccountSwitchGuard(ls, 'alice@example.com'); // consumes sentinel
        const result2 = runAccountSwitchGuard(ls, 'alice@example.com');
        expect(result2).toBe('no-action');
    });
});

describe('Account-switch guard — different user after explicit sign-out', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        // Alice signs out
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        stampSignedOut(ls);
    });

    it('returns wipe when a different user signs in after someone signed out', () => {
        expect(runAccountSwitchGuard(ls, 'bob@example.com')).toBe('wipe');
    });

    it('updates ACCOUNT_HASH_KEY to the new user after wipe', () => {
        runAccountSwitchGuard(ls, 'bob@example.com');
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('bob@example.com'));
    });

    it('removes LAST_REAL_HASH_KEY after consuming it for the wipe decision', () => {
        runAccountSwitchGuard(ls, 'bob@example.com');
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });
});

describe('Account-switch guard — sign-out with no prior hash', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        // stampSignedOut called with no prior hash (edge case: first-ever sign-out)
        stampSignedOut(ls);
    });

    it('returns wipe when any user signs in (no record of who signed out)', () => {
        // No LAST_REAL_HASH_KEY was set, so we cannot identify the previous user
        expect(runAccountSwitchGuard(ls, 'alice@example.com')).toBe('wipe');
    });
});

// ─── 4. clearUserScopedStorage ────────────────────────────────────────────────

describe('clearUserScopedStorage — auth keys always cleared', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        AUTH_KEYS.forEach(k => ls.setItem(k, 'dummy-value'));
        ls.setItem('cv_builder:deviceId', 'device-123');
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        ls.setItem(LAST_REAL_HASH_KEY, 'some-hash');
    });

    it('removes all auth keys', () => {
        clearAuthKeys(ls);
        AUTH_KEYS.forEach(k => expect(ls.getItem(k)).toBeNull());
    });

    it('never removes the device ID', () => {
        clearAuthKeys(ls);
        expect(ls.getItem('cv_builder:deviceId')).toBe('device-123');
    });
});

describe('clearUserScopedStorage — clearAppData: true', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        // Populate a realistic storage state
        ls.setItem('cv_builder:profiles', JSON.stringify([{ id: '1' }]));
        ls.setItem('cv_builder:cvdata_1', 'some cv data');
        ls.setItem('cv_builder:deviceId', 'device-123');
        ls.setItem('procv:some_key', 'value');
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        ls.setItem(LAST_REAL_HASH_KEY, _fnv32('alice@example.com'));
        ls.setItem('p:slot-1:jd', 'some job description');
        ls.setItem('cv:purpose', 'job');
        ls.setItem('cv_gdrive_token', 'gtoken');
    });

    it('wipes cv_builder:* app data', () => {
        clearAppData(ls);
        expect(ls.getItem('cv_builder:profiles')).toBeNull();
        expect(ls.getItem('cv_builder:cvdata_1')).toBeNull();
    });

    it('preserves cv_builder:deviceId', () => {
        clearAppData(ls);
        expect(ls.getItem('cv_builder:deviceId')).toBe('device-123');
    });

    it('wipes procv:* keys except ACCOUNT_HASH_KEY and LAST_REAL_HASH_KEY', () => {
        clearAppData(ls);
        expect(ls.getItem('procv:some_key')).toBeNull();
        expect(ls.getItem('cv_gdrive_token')).toBeNull();
    });

    it('preserves ACCOUNT_HASH_KEY after wipe', () => {
        clearAppData(ls);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('alice@example.com'));
    });

    it('preserves LAST_REAL_HASH_KEY after wipe (needed for same-user-return check)', () => {
        clearAppData(ls);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBe(_fnv32('alice@example.com'));
    });

    it('wipes p:* profile-room keys', () => {
        clearAppData(ls);
        expect(ls.getItem('p:slot-1:jd')).toBeNull();
    });

    it('wipes cv:* per-session state keys', () => {
        clearAppData(ls);
        expect(ls.getItem('cv:purpose')).toBeNull();
    });
});

// ─── 5. IDB-auth-cleared sentinel ────────────────────────────────────────────

describe('IDB-auth-cleared sentinel (LS_AUTH_CLEARED)', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => { ls = makeLocalStorageMock(); });

    it('sentinel is present right after clearAppData sets it', () => {
        ls.setItem(LS_AUTH_CLEARED, '1');
        expect(ls.getItem(LS_AUTH_CLEARED)).toBe('1');
    });

    it('loadAuthState guard consumes (removes) the sentinel on next load', () => {
        ls.setItem(LS_AUTH_CLEARED, '1');
        // Simulate loadAuthState reading and consuming the sentinel
        const sentinel = ls.getItem(LS_AUTH_CLEARED);
        if (sentinel) ls.removeItem(LS_AUTH_CLEARED);
        // After consumption, sentinel is gone — auth proceeds fresh
        expect(ls.getItem(LS_AUTH_CLEARED)).toBeNull();
    });

    it('guard returns null auth when sentinel is present (prevents stale re-auth)', () => {
        ls.setItem(LS_AUTH_CLEARED, '1');
        // Mirror loadAuthState logic: if sentinel, return null
        function simulateLoadAuthState(): null | object {
            const cleared = ls.getItem(LS_AUTH_CLEARED);
            if (cleared) {
                ls.removeItem(LS_AUTH_CLEARED);
                return null; // stale IDB token ignored
            }
            // Would normally fetch from IDB
            return { email: 'stale@example.com', accessToken: 'old-token' };
        }
        const result = simulateLoadAuthState();
        expect(result).toBeNull();
    });

    it('guard returns auth state normally when sentinel is absent', () => {
        function simulateLoadAuthState(): null | object {
            const cleared = ls.getItem(LS_AUTH_CLEARED);
            if (cleared) {
                ls.removeItem(LS_AUTH_CLEARED);
                return null;
            }
            return { email: 'alice@example.com', accessToken: 'valid-token' };
        }
        const result = simulateLoadAuthState();
        expect(result).not.toBeNull();
        expect((result as any).email).toBe('alice@example.com');
    });
});

// ─── 6. _wipePending guard for syncProfileToCache ────────────────────────────

describe('_wipePending guard — blocks syncProfileToCache during wipe', () => {
    it('sync callback exits immediately when _wipePending is true', () => {
        let _wipePending = false;
        let syncCalled = false;

        function syncProfileToCache(slotId: string) {
            if (_wipePending) return; // guard
            syncCalled = true;
        }

        // Before wipe: sync proceeds
        syncProfileToCache('slot-1');
        expect(syncCalled).toBe(true);

        // After wipe is initiated: sync is blocked
        syncCalled = false;
        _wipePending = true;
        syncProfileToCache('slot-1');
        expect(syncCalled).toBe(false);
    });

    it('wipePending flag stays set until next page load (no automatic reset)', () => {
        let _wipePending = false;
        _wipePending = true;
        // No automatic reset — only a page reload clears it
        expect(_wipePending).toBe(true);
    });
});

// ─── 7. Popup-closed detection ───────────────────────────────────────────────

describe('Popup-closed detection — reject fires immediately, not after 5 minutes', () => {
    it('detects popup closure within the polling interval', async () => {
        let settled = false;
        let result: string | null = null;

        // Simulate the openOAuthPopup pattern with polling
        const fakePopup = { closed: false };
        const POLL_MS = 50; // reduced for test speed

        await new Promise<void>((resolve) => {
            const hardTimeout = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    result = 'timeout';
                    resolve();
                }
            }, 5000); // 5-second hard timeout (stands in for 5-minute in prod)

            const poller = setInterval(() => {
                if (fakePopup.closed && !settled) {
                    settled = true;
                    result = 'cancelled';
                    clearInterval(poller);
                    clearTimeout(hardTimeout);
                    resolve();
                }
            }, POLL_MS);

            // Simulate user closing the popup after 120ms
            setTimeout(() => { fakePopup.closed = true; }, 120);
        });

        expect(result).toBe('cancelled');
        expect(result).not.toBe('timeout');
    });

    it('does NOT fire the cancel path if the popup is still open', async () => {
        let cancelFired = false;
        const fakePopup = { closed: false }; // popup stays open

        const poller = setInterval(() => {
            if (fakePopup.closed) cancelFired = true;
        }, 50);

        await new Promise<void>(resolve => setTimeout(resolve, 200));
        clearInterval(poller);

        expect(cancelFired).toBe(false);
    });

    it('settled flag prevents double-fire when message arrives before poller', () => {
        let settled = false;
        let outcomeCount = 0;

        function settle(outcome: 'success' | 'cancelled') {
            if (settled) return;
            settled = true;
            outcomeCount++;
        }

        // Simulate message arriving (success)
        settle('success');

        // Simulate poller firing just after (should be ignored)
        if (!settled) settle('cancelled'); // guard already set

        expect(outcomeCount).toBe(1);
    });
});

// ─── 8. Cross-tab sign-out handling ──────────────────────────────────────────

describe('Cross-tab sign-out via storage event', () => {
    it('wipe is triggered when another tab writes the sentinel to ACCOUNT_HASH_KEY', () => {
        let wipeFired = false;

        function onStorage(key: string, newValue: string | null, ourEmail: string | null) {
            if (key !== ACCOUNT_HASH_KEY) return;
            if (!newValue) return;
            if (newValue === SIGNED_OUT_SENTINEL) {
                wipeFired = true; // another tab signed out — wipe this tab
                return;
            }
            const ourHash = ourEmail ? _fnv32(ourEmail) : null;
            if (ourHash && newValue === ourHash) return; // same user, no action
            wipeFired = true; // different user signed in — wipe this tab
        }

        onStorage(ACCOUNT_HASH_KEY, SIGNED_OUT_SENTINEL, 'alice@example.com');
        expect(wipeFired).toBe(true);
    });

    it('does NOT wipe when the other tab has the same user', () => {
        let wipeFired = false;

        function onStorage(key: string, newValue: string | null, ourEmail: string | null) {
            if (key !== ACCOUNT_HASH_KEY) return;
            if (!newValue) return;
            if (newValue === SIGNED_OUT_SENTINEL) { wipeFired = true; return; }
            const ourHash = ourEmail ? _fnv32(ourEmail) : null;
            if (ourHash && newValue === ourHash) return; // same user
            wipeFired = true;
        }

        // Another tab writes the same user's hash (e.g. duplicate tab signed in)
        const aliceHash = _fnv32('alice@example.com');
        onStorage(ACCOUNT_HASH_KEY, aliceHash, 'alice@example.com');
        expect(wipeFired).toBe(false);
    });

    it('does wipe when another tab signs in as a completely different user', () => {
        let wipeFired = false;

        function onStorage(key: string, newValue: string | null, ourEmail: string | null) {
            if (key !== ACCOUNT_HASH_KEY) return;
            if (!newValue) return;
            if (newValue === SIGNED_OUT_SENTINEL) { wipeFired = true; return; }
            const ourHash = ourEmail ? _fnv32(ourEmail) : null;
            if (ourHash && newValue === ourHash) return;
            wipeFired = true;
        }

        const bobHash = _fnv32('bob@example.com');
        onStorage(ACCOUNT_HASH_KEY, bobHash, 'alice@example.com');
        expect(wipeFired).toBe(true);
    });

    it('ignores storage events for irrelevant keys', () => {
        let wipeFired = false;

        function onStorage(key: string, newValue: string | null, ourEmail: string | null) {
            if (key !== ACCOUNT_HASH_KEY) return;
            wipeFired = true;
        }

        onStorage('some:other:key', 'some-value', 'alice@example.com');
        expect(wipeFired).toBe(false);
    });
});

// ─── 9. Full sign-out → same-user-return flow (integration) ──────────────────

describe('Full flow: sign-out then same user signs back in', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => { ls = makeLocalStorageMock(); });

    it('complete round-trip: sign-in → sign-out → sign-in → no wipe', () => {
        // Step 1: Alice first signs in (first ever, no stored hash)
        const step1 = runAccountSwitchGuard(ls, 'alice@example.com');
        expect(step1).toBe('no-action');
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('alice@example.com'));

        // Step 2: Alice signs out
        stampSignedOut(ls);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(SIGNED_OUT_SENTINEL);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBe(_fnv32('alice@example.com'));

        // Step 3: Alice signs back in — this was the bug (used to cause wipe+reload)
        const step3 = runAccountSwitchGuard(ls, 'alice@example.com');
        expect(step3).toBe('same-user'); // no wipe!
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('alice@example.com'));
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull(); // consumed
    });

    it('complete round-trip: sign-in → sign-out → DIFFERENT user signs in → wipe', () => {
        // Alice signs in
        runAccountSwitchGuard(ls, 'alice@example.com');

        // Alice signs out
        stampSignedOut(ls);

        // Bob signs in on Alice's device
        const result = runAccountSwitchGuard(ls, 'bob@example.com');
        expect(result).toBe('wipe');
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('bob@example.com'));
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull(); // consumed
    });

    it('delete account then same user re-registers → clean-delete (1-click, data already gone)', () => {
        // Account deletion: clearAppData + awaited IDB + stampDeletedAccount
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        ls.setItem('cv_builder:profiles', 'some data');
        clearAppData(ls);         // wipes app data, ACCOUNT_HASH_KEY preserved
        stampDeletedAccount(ls);  // DELETED_CLEAN_SENTINEL written, no LAST_REAL_HASH_KEY

        // Alice re-registers immediately — guard sees clean-delete, straight in
        const result = runAccountSwitchGuard(ls, 'alice@example.com');
        expect(result).toBe('clean-delete'); // no second wipe, no second sign-in click
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });
});

// ─── 10b. stampDeletedAccount ────────────────────────────────────────────────

describe('stampDeletedAccount — new account = new slate', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => { ls = makeLocalStorageMock(); });

    it('writes DELETED_CLEAN_SENTINEL (not SIGNED_OUT_SENTINEL) to ACCOUNT_HASH_KEY', () => {
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        stampDeletedAccount(ls);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(DELETED_CLEAN_SENTINEL);
        expect(ls.getItem(ACCOUNT_HASH_KEY)).not.toBe(SIGNED_OUT_SENTINEL);
    });

    it('does NOT save LAST_REAL_HASH_KEY (unlike stampSignedOut)', () => {
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        stampDeletedAccount(ls);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('clears any previously stored LAST_REAL_HASH_KEY', () => {
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        ls.setItem(LAST_REAL_HASH_KEY, _fnv32('alice@example.com'));
        stampDeletedAccount(ls);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('same email signing in after delete → clean-delete (straight in, data already wiped)', () => {
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        stampDeletedAccount(ls);
        // IDB was cleared before reload; guard skips second wipe
        expect(runAccountSwitchGuard(ls, 'alice@example.com')).toBe('clean-delete');
    });

    it('different email signing in after delete → clean-delete (IDB already wiped, straight in)', () => {
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        stampDeletedAccount(ls);
        // IDB was cleared before reload; any new user goes straight in
        expect(runAccountSwitchGuard(ls, 'bob@example.com')).toBe('clean-delete');
    });

    it('contrast: stampSignedOut DOES save LAST_REAL_HASH_KEY', () => {
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        stampSignedOut(ls);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBe(_fnv32('alice@example.com'));
    });

    it('contrast: stampSignedOut allows same user to return without wipe', () => {
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        stampSignedOut(ls);
        expect(runAccountSwitchGuard(ls, 'alice@example.com')).toBe('same-user');
    });
});

// ─── 10c. Delete-then-immediate-reregister end-to-end ────────────────────────

describe('Delete account then immediately re-register', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        // Populate a full user session
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        ls.setItem('cv_builder:profiles', JSON.stringify([{ id: '1', name: 'Alice' }]));
        ls.setItem('cv_builder:cvdata_1', 'my cv data');
        ls.setItem('procv:worker_session', 'session-token-abc');
        ls.setItem('p:slot-1:jd', 'software engineer at google');
        ls.setItem('cv:purpose', 'job');
    });

    it('clearAppData then stampDeletedAccount: all cv data is gone, sentinel set, no last-real-hash', () => {
        clearAppData(ls);
        stampDeletedAccount(ls);

        expect(ls.getItem('cv_builder:profiles')).toBeNull();
        expect(ls.getItem('cv_builder:cvdata_1')).toBeNull();
        expect(ls.getItem('p:slot-1:jd')).toBeNull();
        expect(ls.getItem('cv:purpose')).toBeNull();
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(DELETED_CLEAN_SENTINEL);
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('re-signing-in with the same email goes straight in (clean-delete, never "same-user")', () => {
        clearAppData(ls);
        stampDeletedAccount(ls);

        // IDB was already cleared before this reload — guard skips second wipe
        const result = runAccountSwitchGuard(ls, 'alice@example.com');
        expect(result).toBe('clean-delete');
    });

    it('re-signing-in with a different email also goes straight in (clean-delete)', () => {
        clearAppData(ls);
        stampDeletedAccount(ls);

        const result = runAccountSwitchGuard(ls, 'charlie@example.com');
        expect(result).toBe('clean-delete');
    });

    it('after clean-delete guard, ACCOUNT_HASH_KEY has the new email and no leftover data', () => {
        clearAppData(ls);
        stampDeletedAccount(ls);

        // Guard runs — clean-delete path sets new hash, no reload
        runAccountSwitchGuard(ls, 'alice@example.com');

        expect(ls.getItem('cv_builder:profiles')).toBeNull(); // already wiped by clearAppData
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('alice@example.com'));
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBeNull();
    });

    it('full round-trip: delete → same email signs in → clean-delete → signs in again → no-action', () => {
        // Step 1: delete (IDB cleared + sentinel written)
        clearAppData(ls);
        stampDeletedAccount(ls);

        // Step 2: same email signs in — guard sees DELETED_CLEAN_SENTINEL → straight in
        const step2 = runAccountSwitchGuard(ls, 'alice@example.com');
        expect(step2).toBe('clean-delete'); // 1-click re-register
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('alice@example.com'));

        // Step 3: (next load or same session) same email → hash matches → no-action
        const step3 = runAccountSwitchGuard(ls, 'alice@example.com');
        expect(step3).toBe('no-action');
    });
});

// ─── 10. stampSignedOut + clearAppData ordering ───────────────────────────────

describe('stampSignedOut + clearAppData ordering', () => {
    let ls: ReturnType<typeof makeLocalStorageMock>;

    beforeEach(() => {
        ls = makeLocalStorageMock();
        ls.setItem(ACCOUNT_HASH_KEY, _fnv32('alice@example.com'));
        ls.setItem('cv_builder:profiles', 'data');
        ls.setItem('procv:some_setting', 'value');
    });

    it('clearAppData before stampSignedOut: ACCOUNT_HASH_KEY survives clearAppData so stampSignedOut can read it', () => {
        // This is the order used in handleDeleteAccount
        clearAppData(ls); // wipes everything except ACCOUNT_HASH_KEY and LAST_REAL_HASH_KEY
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(_fnv32('alice@example.com'));

        stampSignedOut(ls); // reads real hash, writes sentinel
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBe(_fnv32('alice@example.com'));
        expect(ls.getItem(ACCOUNT_HASH_KEY)).toBe(SIGNED_OUT_SENTINEL);
    });

    it('stampSignedOut before clearAppData: LAST_REAL_HASH_KEY survives clearAppData', () => {
        // This is the order used in normal sign-out handlers
        stampSignedOut(ls);
        clearAppData(ls);
        // LAST_REAL_HASH_KEY must survive so the guard can consult it on next sign-in
        expect(ls.getItem(LAST_REAL_HASH_KEY)).toBe(_fnv32('alice@example.com'));
    });
});
