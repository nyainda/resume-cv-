-- Migration 026: Scope user_slots and user_preferences to user_id
--
-- Bug 2 fix: Previously all user data was keyed by device_id only — anyone
-- who knew a device_id could read another user's full profile data.
-- This migration adds user_id columns (from user_identities.id via user_sessions)
-- so all data is scoped to the authenticated user.
--
-- Strategy: additive, no breaking changes.
--   • Adds nullable user_id columns (existing device_id rows are unaffected)
--   • Creates new unique indexes for user-scoped upserts
--   • Backend handlers now require Bearer token auth; fall-back rows with NULL
--     user_id are effectively orphaned (unreachable via the secured endpoints)

-- ── user_slots ────────────────────────────────────────────────────────────────
ALTER TABLE user_slots ADD COLUMN user_id INTEGER REFERENCES user_identities(id);

-- Unique index enables ON CONFLICT(user_id, slot_id) upsert in the handler
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_slots_user_slot
    ON user_slots(user_id, slot_id)
    WHERE user_id IS NOT NULL;

-- ── user_preferences ─────────────────────────────────────────────────────────
ALTER TABLE user_preferences ADD COLUMN user_id INTEGER REFERENCES user_identities(id);

-- One preferences row per user (vs. previously one per device)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_prefs_user_id
    ON user_preferences(user_id)
    WHERE user_id IS NOT NULL;
