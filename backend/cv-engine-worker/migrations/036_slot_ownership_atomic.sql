-- Migration 036: Atomic slot_id ownership claim — close the check-then-insert
-- race in handleUserSlotsPost's ownership guard.
--
-- Root cause: user_slots' primary key is (user_id, slot_id), so it has no
-- global uniqueness constraint on slot_id alone. A "SELECT owner, then INSERT
-- if free" guard is not race-safe: two concurrent first-writes of the same
-- slot_id by two different accounts can both pass the SELECT before either
-- INSERT commits, producing the exact cross-account duplicate-slot_id leak
-- this guard exists to prevent (confirmed real: accounts 96 and 100, slot_ids
-- 19d900e7... and 84655339..., 2026-07-09).
--
-- Fix: a dedicated table with slot_id as its PRIMARY KEY. Ownership is claimed
-- with `INSERT ... ON CONFLICT(slot_id) DO NOTHING`, which SQLite/D1 executes
-- atomically — only one of two concurrent claims for the same slot_id can
-- ever win. The handler then re-reads the row: if the owner isn't the
-- requesting user, the write is rejected (409), otherwise the user_slots
-- upsert proceeds as before.
CREATE TABLE IF NOT EXISTS slot_ownership (
    slot_id    TEXT    NOT NULL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
    claimed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Backfill from existing user_slots: a slot_id already shared by more than one
-- user_id (leaked data) is intentionally left unclaimed here — the app-level
-- cleanup already run for the known incident deleted those duplicate rows.
-- Any slot_id with exactly one owner claims it retroactively so future writes
-- by that same account continue to succeed without a spurious 409.
INSERT OR IGNORE INTO slot_ownership (slot_id, user_id, claimed_at)
SELECT slot_id, MIN(user_id), unixepoch()
FROM user_slots
GROUP BY slot_id
HAVING COUNT(DISTINCT user_id) = 1;

CREATE INDEX IF NOT EXISTS idx_slot_ownership_user ON slot_ownership(user_id);
