---
name: Unified AuthContext migration
description: GoogleAuthContext + WorkerAuthContext + AuthPersistence + SilentRefresh replaced by a single AuthContext.tsx
---

## The rule
All auth state lives in `frontend/auth/AuthContext.tsx`. Do NOT recreate separate Google / Worker auth contexts.

**Why:** The dual-context system (GoogleAuthContext + WorkerAuthContext) produced 10+ cross-context bugs:
FNV hash mismatches, IDB tokens surviving wipes, stale in-memory Drive singletons, race conditions
on account switch, and magic-link sessions being wiped by Google auth absence. A single context
eliminates the entire class of "context A thinks X, context B thinks Y" bugs.

**How to apply:**
- Import `useAuth`, `useGoogleAuth`, or `useWorkerAuth` (shims) all from `../auth/AuthContext`.
- `useGoogleAuth` shim exposes: `isAuthenticated`, `loading`, `googleUser`, `signIn`, `signOut`, `driveToken`.
- `useWorkerAuth` shim exposes: `workerUser`, `requireAuth`, `sessionToken` (always null — cookie-based), `workerSignOut` (alias for signOut).
- Session is 100% HttpOnly cookie (`procv_session`). `sessionToken` from the shim is always `null` — don't use it for Authorization headers; rely on `credentials: 'include'` instead.
- `clearUserStorage.ts` is NOT deleted — `clearAllBrowserStorage` + `rotateDeviceId` are still used in App.tsx. The `LS_AUTH_CLEARED` constant was inlined as `'procv:google_auth_cleared'` (removed AuthPersistence import).
- `deleteSlotFromCloud` in `userDataCloudService.ts` uses `_isSignedIn()` guard (localStorage `procv:worker_user` key), no Bearer header.
- `linkGoogleSession` returns `LinkGoogleResult` union; when narrowing after a null check on a `let` variable with multiple reassignments, assign to a `const` first so TypeScript flow-narrows correctly.
- Pre-existing TS errors in the project total ~59 (template files, geminiService, etc.) — all unrelated to auth.
