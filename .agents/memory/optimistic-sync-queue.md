---
name: Optimistic sync queue
description: IDB-backed queue throttling all CF D1 slot/prefs writes to max 1 flush per 30 seconds.
---

## The rule
All profile-slot and preferences syncs to CF D1 MUST go through `enqueueSlotSync` / `enqueuePrefsSync` (in `frontend/services/storage/syncQueue.ts`), never direct `syncSlot` / `syncPrefs` calls from user-triggered save handlers.

**Why:** Free CF KV tier — direct fire-and-forget from every save action would burn quota. The queue is the single throttle point.

**Exception:** `syncAllSlots` (the "Back up now" force-sync) calls `syncSlot` directly — this is deliberate; it's an explicit user action that should bypass the queue.

## How to apply
- Any new explicit-save handler (e.g. new profile field, tracker note save) → call `enqueueSlotSync(slot)` or `enqueuePrefsSync(prefs)`.
- Keystrokes, previews, AI calls → never enqueue.
- On sign-out / account delete → call `clearQueueForAccount()` BEFORE wiping localStorage, so stale entries never flush under a new session.
- `flushSyncQueue('online')` — browser comes back online.
- `flushSyncQueue('visibility')` — tab returns to foreground (self-rate-limited to 1/5 min internally).

## IDB details
- DB: `cv_builder_sync`, store: `queue`, keyPath: `itemKey`.
- Upsert semantics: same itemKey = overwrite (natural dedup for rapid saves).
- Retry schedule: 30 s → 2 min → 10 min → give up after 3 attempts.
- Rate limit state: `cv_builder:sq_last_flush` and `cv_builder:sq_last_vis_flush` in localStorage.
- `clearQueueForAccount()` wipes both LS keys and clears the IDB store.
