---
name: Auth account-switch isolation
description: How ProCV prevents cross-account data leaks when users share a device — the two-layer guard in AuthContext.tsx.
---

## The problem (closed June 2026)

Two separate bugs allowed User A's profile data to appear after User B signed in:

1. **`wipeLocalAppData` didn't set IDB-skip sentinels.** `restoreLocalStorageFromIDB()` runs at boot BEFORE React mounts and reads `cv_appdata_cleared` to decide whether to skip the restore. Without this sentinel, User A's IDB data would flow back into localStorage even after a localStorage wipe.

2. **`userRef.current` became null after sign-out.** If User A signed out and User B signed in, `_applySession` read `userRef.current?.email` (null) so the account-switch wipe never triggered — User B started seeing User A's profiles.

## The fix

### `wipeLocalAppData` — now three-phase
1. **Set sentinels synchronously**: `localStorage.setItem('cv_appdata_cleared', '1')` and `localStorage.setItem('procv:google_auth_cleared', '1')`. These are consumed on next boot by `restoreLocalStorageFromIDB()` and `loadAuthState()` to skip stale IDB data.
2. **Clear user-scoped localStorage keys** (same as before — `cv_builder:*`, `procv:*`, `p:*`, `cv:*`, legacy bare keys, excluding `deviceId` and `USER_CACHE_KEY`).
3. **Fire-and-forget IDB deletes** for all 5 stores: `cv_builder_auth`, `cv_builder_cvdata`, `cv_builder_appdata`, `cv_builder_sync`, `cv_builder_keyvault`.

### `lastKnownEmailRef` (replaces `userRef`)
- `useRef<string | null>(user?.email ?? null)` — seeded from the LS display cache at mount.
- Updated to `incoming.email` on every SUCCESSFUL `_applySession` call (same-user path only; the account-switch path reloads before updating).
- **Never cleared** on sign-out — this is the key difference from `userRef`. After sign-out, `lastKnownEmailRef.current` still holds the last email, so if a different user signs in, `prevEmail !== incoming.email` is true and the wipe fires.

### `_applySession` — simplified signature
- No longer takes `currentEmail` parameter; reads `lastKnownEmailRef.current` internally.
- All call sites (`googleSignIn`, `onAuthSuccess`, magic-link boot, future callers) just pass `(user, isNew)`.

### Cross-tab `onStorage` handler
- Was: `setUser(current => { if (current?.email !== incoming.email) { wipeLocalAppData(); reload(); } return current; })` — setState-inside-setState anti-pattern, and `current` could be null after sign-out in another tab.
- Now: reads `lastKnownEmailRef.current` directly (no setState needed) and calls `wipeLocalAppData()` + `reload()` if email differs.

## Why `lastKnownEmailRef` and not a localStorage sentinel

Using a dedicated sentinel key (like the old `ACCOUNT_HASH_KEY` / `LAST_REAL_HASH_KEY` system from `clearUserStorage.ts`) was over-engineered. `lastKnownEmailRef` is:
- Simpler — one ref, no hashing, no sentinel rotation logic.
- Correct — it's initialized from the same LS cache key that's cleared on sign-out, so it starts with the right value.
- Survives sign-out naturally — because React refs aren't reset by `setUser(null)`.

The legacy `clearUserStorage.ts` hash-based guards (`ACCOUNT_HASH_KEY`, `LAST_REAL_HASH_KEY`, `stampSignedOut`) are NOT used in `AuthContext.tsx`. They exist only in `accountDataLeak.test.ts` and as dead exports in `clearUserStorage.ts`. Do not re-introduce them into the main auth flow.
