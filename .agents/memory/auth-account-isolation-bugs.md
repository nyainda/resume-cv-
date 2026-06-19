---
name: Auth account isolation bugs
description: Four root-cause bugs in the ProCV account-switch / cross-account isolation flow and the exact fixes applied.
---

# Auth account isolation bugs — root causes and fixes

## Bug 1 — Popup closed hangs loading state for 5 minutes
**File**: `frontend/auth/GoogleAuthContext.tsx`  
**Root cause**: `openOAuthPopup()` had no `popup.closed` detection. If the user closed the Google popup without completing sign-in, the promise hung for 5 min (the hard timeout). During that window the UI showed an un-dismissable loading spinner and old event listeners from abandoned attempts stayed live, able to consume tokens from subsequent sign-in clicks.  
**Fix**: Added a `setInterval` polling `popup.closed` every 500ms; on detection calls `fail('Sign-in cancelled. Please try again.')` which clears all listeners and the timer.

## Bug 2 — Stale IDB auth token survives account-switch wipe (silent re-auth)
**Files**: `frontend/auth/AuthPersistence.ts`, `frontend/utils/clearUserStorage.ts`  
**Root cause**: `_clearGoogleAuthIdb()` is async/fire-and-forget. `window.location.reload()` fires in the same JS tick. The IDB deletion may not complete before the page reloads. On next load, `loadAuthState()` finds the old user's token in IDB and silently restores their session.  
**Fix**: Write `LS_AUTH_CLEARED = 'cv_auth_cleared'` to localStorage SYNCHRONOUSLY inside `clearUserScopedStorage()` before firing the reload. In `loadAuthState()`, if this sentinel is present, consume it (delete), do a best-effort `idbDel('auth')`, and return null — never trusting stale IDB data.

## Bug 3 — In-memory CV cache and Drive singleton survive the wipe
**Files**: `frontend/services/storage/cvDataStore.ts`, `frontend/services/storage/StorageRouter.ts`, `frontend/utils/clearUserStorage.ts`  
**Root cause**: `cvDataStore._cache` (module-level Map) and `StorageRouter._drive` (module-level DriveStorageService singleton holding the old user's OAuth token) were never cleared by `clearUserScopedStorage`. Any async effect firing between the wipe and the reload could read stale CV data or write with the wrong Drive token.  
**Fix**: Added `clearCVDataStore()` (clears `_cache`, closes + nulls `_db`) and `resetStorageRouter()` (nulls `_cache` + `_drive`). Both are called SYNCHRONOUSLY inside `clearUserScopedStorage({ clearAppData: true })` before the async IDB wipes.

## Bug 4 — syncProfileToCache can push old user's profile to D1 after wipe
**File**: `frontend/App.tsx`  
**Root cause**: The account-switch guard calls `clearUserScopedStorage()` then `window.location.reload()` inside a useEffect. `window.location.reload()` schedules a navigation but JS continues executing. A 3-second `setTimeout` inside the `activeSlot?.id` effect could fire before the navigation completes, pushing the previous user's profile to D1 under the new user's worker session.  
**Fix**: Module-level flag `_wipePending` set to `true` in every branch that calls `window.location.reload()` (both same-tab guard and cross-tab `onStorage`). The `syncProfileToCache` timeout checks `if (_wipePending) return` before firing.

## Additional fix — localStorage iteration safety
`clearUserScopedStorage({ clearAppData: true })` previously mutated localStorage keys while iterating over `localStorage.length`, which is unsafe (indices shift on deletion). Refactored to collect all keys into an array first, then delete.

**Why these matter**: On a shared device (or phone with multiple Google accounts), these four bugs together could cause User B to see User A's CVs, or silently log User A back in after User B tries to start fresh.
