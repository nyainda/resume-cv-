# ProCV — Development Roadmap

> Tracks planned work, bug fixes, and architecture improvements.
> Ticked items are **done and merged**. See also: `MAINTENANCE.md` for ops/deploy runbooks.

---

## Phase 1 — Foundation Fixes (Current Sprint)

Fix these first. Everything in Phase 2 depends on a correct foundation.

### ✅ Auth & Sign-out Fixes (Bug 1)

**Problem:** Every sign-out path only called one auth system. Worker sign-out left Google
token alive in IndexedDB → user returned to app on refresh.

- [x] `App.tsx` — top nav sign-out button calls `workerSignOut()` + `googleSignOut()` + `clearUserScopedStorage()`
- [x] `App.tsx` — mobile menu sign-out button — same
- [x] `SettingsModal.tsx` — profile card sign-out button — same
- [x] `CloudBackupSettings.tsx` — Drive disconnect calls `workerSignOut()` + `googleSignOut()` + `clearUserScopedStorage()`
- [x] `GoogleSignInButton.tsx` — sign-out calls `workerSignOut()` + `googleSignOut()` + `clearUserScopedStorage()`
- [x] `frontend/utils/clearUserStorage.ts` — `clearUserScopedStorage()` utility created (clears tokens, mtime keys, D1 hashes, restore flags, migration flag)

### ✅ Security — Strip Profile Photo from D1 Sync

**Problem:** `syncSlot()` sent `profile: slot.profile` intact — including `personalInfo.photo`
(a 50–150 KB base64 blob). Photos were stored unencrypted in D1 for every user.

- [x] `userDataCloudService.ts` — photo stripped before building `slotPayload` (`photo: undefined`)
- Photos now stay in Google Drive (OAuth-scoped) or on-device only

### ✅ Bug 5 — Worker Session Outlives Google Session

**Problem:** If Google's silent-refresh failed (>2 week absence), `GoogleAuthContext` cleared
`user = null` but `WorkerAuthContext` kept its 30-day token alive → split-brain auth state
(some guards passed, others failed).

- [x] `WorkerAuthContext.tsx` — added watcher `useEffect` that calls `clearSession()` when
  `isGoogleAuthed` drops to false while a `sessionToken` still exists

### ✅ UI Improvements (this session)

- [x] `DriveDataPanel.tsx` — file list now shows only human-labelled entries (hides raw cache keys like `profile_cache_hash_*`)
- [x] `SettingsModal.tsx` — profile card at top of modal (56px avatar, name, email, account badge, sign-out button)
- [x] `wrangler.toml` — required secrets documented (`BREVO_API_KEY`, `ADMIN_TOKEN`)
- [x] `backend/cv-engine-worker/src/types.ts` — `APP_URL` env var added to `Env` interface

---

### 🔲 Bug 2 — D1 Data Scoped to Device, Not User *(Critical — Backend Required)*

**Problem:** `user_slots` and `user_preferences` are keyed by `device_id` only. Any caller
who knows a `device_id` can read another user's full profile data.

**Files to change:**
- `backend/cv-engine-worker/src/handlers/user.ts` — add `getUserIdFromRequest()` helper; scope all queries to `user_id`
- `frontend/services/userDataCloudService.ts` — add `Authorization: Bearer <sessionToken>` header to every request; change `isAuthenticated` guard → `isWorkerAuthenticated`
- D1 migration needed:

```sql
-- backend/cv-engine-worker/migrations/011_user_scoped_d1.sql
ALTER TABLE user_slots ADD COLUMN user_id INTEGER;
ALTER TABLE user_preferences ADD COLUMN user_id INTEGER;
DROP INDEX IF EXISTS sqlite_autoindex_user_slots_1;
CREATE UNIQUE INDEX idx_user_slots_user_slot ON user_slots(user_id, slot_id);
CREATE UNIQUE INDEX idx_user_prefs_user ON user_preferences(user_id);
```

**Also:** Change `syncSlot` / `syncPrefs` guards in `App.tsx` from `if (isAuthenticated)` → `if (isWorkerAuthenticated)`

---

### 🔲 Auto D1 Restore on Login *(Blocked by Bug 2 fix)*

**Problem:** D1 data only restores when user manually clicks "Restore" in Settings. Drive
restore is semi-automatic but D1 is not — new device with no Drive gets nothing.

**Target flow:**
```
Login → local profiles empty?
    ├── Check Drive first → Drive has data → show restore banner → DONE
    └── Drive empty → Check D1 → D1 has data → show D1 restore banner → DONE
```

**Files to change:** `App.tsx` — add `d1RestoreCheckedRef` + `d1RestoreSlots` state + useEffect (see guide Section 3 for full code)

---

### 🔲 Bug 3 — Drive Migration Flag Not Scoped to User *(Medium)*

**Problem:** `cv_builder:gdrive_migrated` is a single global key. User A migrates → User B logs in on same device → flag already set → B's Drive never gets populated.

**Fix:** `StorageRouter.ts` — `getMigrationFlagKey(email)` function; scope flag to email hash

---

### 🔲 Bug 4 — Drive mtime Conflict Baseline Not Scoped to User *(Medium)*

**Problem:** `cv_drv_mtime:{filename}` stored without user context → User A's timestamps contaminate User B's conflict detection.

**Fix:** `DriveStorageService.ts` — add `userEmail` to constructor; prefix all mtime keys as `cv_drv_mtime:{emailHash}:{filename}`

---

### 🔲 Bug 6 — Slot Delete Doesn't Remove from IndexedDB *(Low)*

**Problem:** `LocalStorageService.delete()` only removes from `localStorage`. On next cache clear, `restoreLocalStorageFromIDB()` refills localStorage from IDB → deleted slots resurrect.

**Fix:** `LocalStorageService.ts` — add `await idbAppDel(CV_PREFIX + key)` in `delete()`; export `idbAppDel` from `AppDataPersistence.ts`

---

## Phase 2 — Architecture Upgrade

*Do not start until all Phase 1 items are complete and tested.*

### 🔲 2A — IDB as Primary Write Target

**Why:** localStorage blocks the main thread, has ~5 MB quota, becomes painful as CVs accumulate. IDB is async, effectively unlimited, survives cache clears.

**Current (wrong):** `localStorage.setItem()` first → IDB mirror second
**Target:** React state (immediate UI) → IDB write (durable) → localStorage mirror (fast boot read)

**Key rule after fix:** localStorage used only for boot snapshots, tiny metadata, auth hints, and sync hashes. Never as primary storage for full slots/CVs/cover letters.

---

### 🔲 2B — Server-Assigned Revision Counter (replace mtime)

**Why:** Drive's `modifiedTime` is wall-clock — unreliable when two devices write within the same second. mtime = 101 on both sides → no conflict detected → silent data loss.

**Target:** Monotonically incrementing `revision` column in D1 (`user_slots`). Client sends current revision; server rejects with `409` if stored revision is higher.

**D1 migration:**
```sql
ALTER TABLE user_slots ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_slots ADD COLUMN device_id_last TEXT;
```

---

### 🔲 2C — IDB-Backed Sync Queue with Exponential Backoff

**Why:** Current D1 sync is fire-and-forget with a 6s timeout. Network blip = silent drop. No retry, no queue.

**Target:** New `services/syncQueue.ts` — queue entries in IDB; flush on save, app focus, and network reconnect; retry schedule: 5s → 30s → 2min → 10min → surface error to user.

---

### 🔲 2D — Rename Storage Classes

`WriteThroughDriveService` → `HybridStorageService` (offline-first replication, not write-through caching). Do this last — cosmetic, noisy diff.

---

## Phase 3 — Resilience (Future)

*Low priority until Phase 1 and 2 are stable.*

- [ ] Service Worker for background sync queue flush (survives tab close)
- [ ] `navigator.sendBeacon` for flush-on-unload
- [ ] Conflict UI shows revision diff (which device wrote what and when)
- [ ] D1 as source-of-truth for structured data; Drive for large blobs (CV JSON, cover letters)

---

## Testing Checklist (Phase 1)

Run these manually after each fix:

- [ ] Sign in → sign out → refresh → lands on login screen, not app *(Bug 1)*
- [ ] Sign in → sign out → sign in as different user → sees empty state, not previous user's data *(Bug 2 + clearUserScopedStorage)*
- [ ] Sign in → save profile with photo → verify D1 entry via `/api/cv/user-data` → `personalInfo.photo` absent *(photo strip)*
- [ ] Sign in on Device A → sign out → sign in on Device B → Drive restore banner appears *(existing)*
- [ ] Sign in on Device B with no Drive → D1 restore banner appears automatically *(Section 3 — after Bug 2 fix)*
- [ ] Sign in → revoke Google access at myaccount.google.com → refresh → fully logged out, not split-brain *(Bug 5)*
- [ ] Sign in → save profiles → clear browser cache (not cookies) → refresh → data restored from IDB
- [ ] Sign in → delete a profile slot → clear cache → profile stays deleted, does not resurrect *(Bug 6)*

---

## Architecture Reference

```
TODAY (post Phase 1 fixes)
────────────────────────────────────────────
localStorage ← primary write target (still wrong — Phase 2 will fix)
IDB          ← secondary mirror + fallback
Drive        ← write-through when active; conflict detection via mtime
D1           ← fire-and-forget by device_id (Bug 2 still open)
Logout       ← kills both auth systems ✅ (fixed this sprint)
Photo        ← stripped from D1 ✅ (fixed this sprint)
Conflicts    ← mtime (unreliable on simultaneous edits — Phase 2B)
Restore      ← Drive: semi-auto ✅ | D1: manual only (Phase 1 backlog)

PHASE 2 TARGET
────────────────────────────────────────────
IDB as primary write, localStorage as boot mirror
mtime → server-assigned revision counter
IDB-backed sync queue with exponential backoff
Bugs 3, 4, 6 resolved
```

---

*Last updated: June 2026*
