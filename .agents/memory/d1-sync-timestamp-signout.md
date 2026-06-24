---
name: D1 sync timestamp must survive sign-out
description: Why usync_slot_ts:* keys must NOT be cleared during sign-out — clearing them causes D1 to always win merge and silently overwrites local edits.
---

## The Rule
`clearUserScopedStorage()` in `clearUserStorage.ts` must only clear **hash** keys (`usync_slot_hash:*`, `usync_prefs_hash`), never **timestamp** keys (`usync_slot_ts:*`).

**Why:** The D1 merge in `runD1MergeSync` compares:
```
d1Slot.updated_at > getLastSyncTimestamp(slotId) + 10_000
```
If `usync_slot_ts:*` keys are cleared, `getLastSyncTimestamp()` returns `null → 0`. Since any real D1 `updated_at` is much larger than `0 + 10_000`, D1 **always wins** on the first login after sign-out. Any profile edits made in the 30-second sync-queue throttle window before sign-out are permanently lost.

**How to apply:** In the `clearUserScopedStorage` loop, match only:
- `k.startsWith('cv_builder:usync_slot_hash:')` or `k.includes(':cv_builder:usync_slot_hash:')`
- `k === 'cv_builder:usync_prefs_hash'` or `k.includes(':cv_builder:usync_prefs_hash')`

Timestamp keys contain no auth credentials. They are safe across sign-out cycles — slot UUIDs ensure they never leak between different users on the same device.

## Related bugs fixed in the same pass
- `_applyJsonImport` useCallback was missing `isAuthenticated` in deps → stale closure could skip the D1 sync on JSON import.
- `handleRenameProfile` updated name/color locally but never called `enqueueSlotSync` → renames not persisted to D1.
