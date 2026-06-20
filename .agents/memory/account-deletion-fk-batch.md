---
name: Account deletion FK batch
description: Why the account deletion used to leak D1 data, and how the D1 batch fix works.
---

## The bug

Cloudflare D1 enforces SQLite foreign key constraints by default.
`handleAuthDeleteAccount` used individual `await stmt.run().catch(() => {})` for every deletion step.
If ANY step failed (FK violation, D1 error, etc.) the error was silently swallowed.
The final `DELETE FROM user_identities WHERE id = ?` would then fail with a FK violation (child rows still existed), also silently swallowed.
The `user_identities` row survived in D1.

On the next sign-in with the same email:
- `handleAuthGoogle` Path 2 (email match) found the old row → reused the same `user_id`
- `fetchUserData()` returned all the "deleted" profile data for that `user_id`
- D1 restore was offered → old profile data reappeared

**Why:** `.catch(() => {})` on a chain means each error is independent — there's no cascade abort. The chain appears to "succeed" even when the critical last step failed.

## The fix (backend)

Replaced the sequential individual deletes with `env.CV_DB.batch([...statements])` for all FK-referencing tables.

D1 batch executes atomically: if any statement fails the whole batch fails with a real thrown error (not silently swallowed). We catch the batch error, attempt a last-resort direct delete, verify whether user_identities is actually gone, and return `{ ok: false }` if not.

FK-safe batch order (matters because D1 enforces FK constraints):
1. `user_slots WHERE user_id = ?` (FK → user_identities, mig 026)
2. `user_slots WHERE device_id = ? AND user_id IS NULL` (orphan device-only rows)
3. `user_preferences WHERE user_id = ?` (FK → user_identities, mig 026)
4. `user_preferences WHERE device_id = ?` (legacy PK row)
5. `user_sessions WHERE user_id = ?` (FK → user_identities, mig 024)
6. `public_profiles WHERE user_id = ?` (FK → user_identities, mig 027)
7. `auth_audit_log WHERE user_id = ?` (FK → user_identities, mig 025)
8. `user_identities WHERE id = ?` — MUST be last

Non-FK tables (profile_cache, saved_cvs, tracked_applications, etc.) are still deleted individually with `.catch(() => {})` BEFORE the batch because they cannot cause FK violations on user_identities.

## The fix (frontend)

`stampDeletedAccount()` writes `DELETED_CLEAN_SENTINEL` to localStorage so the account-switch guard knows the slate is clean on next boot.
`clearAllBrowserStorage()` (called right after) was wiping that sentinel away.

Fix: `stampDeletedAccount()` is now called AFTER `clearAllBrowserStorage()`, not before, so it survives the nuclear wipe.

The frontend also now checks the `ok` field from `deleteAccountWorker` and shows a visible `toast.error` if server-side deletion failed, so the user knows to try again rather than silently getting data back.

## How to apply

- Never use `.catch(() => {})` on a chain of FK-ordered deletes — one silent failure cascades to all subsequent deletes.
- Use `env.CV_DB.batch([...])` for any sequence where order matters and the last statement must only run if all prior ones succeeded.
- Any sentinel written to localStorage before `clearAllBrowserStorage()` will be erased — always re-write post-wipe.
