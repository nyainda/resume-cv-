---
name: User-partitioned storage namespace
description: All localStorage/IDB keys are prefixed by CF user ID so two accounts on the same device never share storage buckets.
---

## The rule
Every localStorage key and IDB database name is scoped by the CF user's numeric ID. This prevents cross-account data bleed on shared devices.

## Key format
- localStorage: `u_<userId>:cv_builder:<key>` (logged in), `anon:cv_builder:<key>` (anonymous)
- IDB DB names: `cv_builder_cvdata_u_<userId>`, `cv_builder_appdata_u_<userId>`, `cv_builder_sync_u_<userId>`
- Keys that are intentionally device-scoped (no prefix): `cv_builder:deviceId`, `procv:worker_session`, `procv:account_email_hash`, `procv:worker_user`

## Entry point
`frontend/services/storage/userStorageNamespace.ts` — single source of truth. Exports:
- `initStorageNamespace()` — call at app boot in index.tsx BEFORE restoreLocalStorageFromIDB
- `setStorageUser(userId: string)` — call in AuthContext after validated session
- `clearStorageUser()` — call in signOut + account deletion
- `getUserPrefix()` — used by LocalStorageService, useLocalStorage, DriveStorageService
- `getScopedDbName(base)` — used by AppDataPersistence, cvDataStore, syncQueue
- `migrateToUserNamespace(userId)` — one-time migration from old unprefixed keys on first login

## Wiring points
1. `index.tsx`: `initStorageNamespace()` called synchronously before `restoreLocalStorageFromIDB()`
2. `AuthContext._applySession`: `setStorageUser(String(user.id))` + `migrateToUserNamespace()`
3. `AuthContext.boot (validateSession)`: `setStorageUser(String(user.id))` on cookie restore
4. `AuthContext.signOut`: `clearStorageUser()`
5. `AuthContext.wipeLocalAppData`: wipes `u_*` and `anon:*` keys + all user-scoped IDB DBs via `indexedDB.databases()`

## Migration
`migrateToUserNamespace(userId)` copies all old `cv_builder:*`, `p:*`, `cv:*`, `cv_drv_mtime:*` keys to `u_<userId>:` prefix, then deletes the originals. Runs once per user per device (flagged by `procv:ns_migrated_<userId>`).

## Why
The previous global key scheme let two accounts on the same device share storage. Logout wiped the other user's data. Delete account cleared data that the second user was using. CF user ID (from validated session) is the authority — not email, not device ID, not hashed sentinels.

**Why:** Pre-existing "account switch guard" (FNV hash sentinels, `stampSignedOut`) was duct tape on a structural problem. This solves it structurally.

**How to apply:** Any new persistent state that is user-specific must use `useLocalStorage` or `LocalStorageService` (both auto-prefix). Never write raw `localStorage.setItem('cv_builder:...')` — always go through the service layer.
