---
name: Account deletion data isolation
description: Complete account deletion must wipe both user_id-scoped AND device_id-keyed D1 tables, plus rotate the device_id, or data leaks on same-device re-registration.
---

## The Rule
`handleAuthDeleteAccount` in `backend/cv-engine-worker/src/handlers/auth.ts` must:
1. Fetch `device_id` from `user_identities` BEFORE deleting that row
2. Delete ALL device_id-keyed legacy tables
3. Accept `device_id` from request body as a fallback

`handleDeleteAccount` in `frontend/App.tsx` must:
1. Call `getDeviceId()` and pass it to `deleteAccountWorker(token, deviceId)`
2. Call `rotateDeviceId()` AFTER `clearUserScopedStorage()` so the new account starts with a fresh device_id

**Why:** Six tables are keyed by `device_id` only (no `user_id` column): `saved_cvs`, `tracked_applications`, `star_stories`, `saved_cover_letters`, `user_preferences`, `custom_templates`. Also `user_slots` can have orphan rows with `user_id IS NULL`. The `device_id` intentionally survives account deletion for anonymous/offline use, but old D1 rows keyed by the same device_id reappear when the same device re-registers. `user_identities.device_id` is stored at signup — always retrieve it there.

**How to apply:**
- Any future tables that store user data must include a `user_id` column and be added to the deletion cascade in `handleAuthDeleteAccount`.
- `rotateDeviceId()` is exported from `frontend/utils/clearUserStorage.ts` — call it in every full account-deletion flow, never in a regular sign-out.
- `deleteAccountWorker(token, deviceId)` signature in `authService.ts` — always pass the device_id.

## Tables in deletion order (backend)
1. `profile_cache` — by slot_id (via user_slots WHERE user_id = ?) + orphan slots (device_id, user_id IS NULL)
2. `user_slots` — WHERE user_id = ? then WHERE device_id = ? AND user_id IS NULL
3. `saved_cvs`, `tracked_applications`, `star_stories`, `saved_cover_letters` — WHERE device_id = ?
4. `user_preferences` — WHERE device_id = ? AND WHERE user_id = ?
5. `custom_templates` — WHERE user_id = ? (this column stores device_id per mig 016 comment)
6. `user_sessions`, `public_profiles`, `auth_audit_log` — WHERE user_id = ?
7. `user_identities` — WHERE id = ? (LAST — all FKs must be cleared first)

## Remaining vector (not a bug, product decision)
Google Drive restore: users who granted Drive scope and then delete + re-register with the same Google account will be offered a Drive restore. `deleteAllDriveData()` is best-effort; if the token is expired or Drive scope was not granted, files survive. This is arguably correct product behavior (Drive is an explicit cloud backup).
