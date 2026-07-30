-- Migration 044: Soft-delete sessions + device_id tracking
--
-- Enables 30-day session resurrection: when a user logs out, their session is
-- soft-deleted rather than hard-deleted.  On the next magic-link send for the
-- same email+device, the worker reactivates the session directly and returns a
-- fresh token — no email click required.
--
-- After 30 days the session's expires_at expires naturally and the existing
-- createSession cleanup (DELETE WHERE expires_at <= now) purges it.

-- user_sessions: track which device owns the session + soft-delete timestamp
ALTER TABLE user_sessions ADD COLUMN device_id      TEXT    NOT NULL DEFAULT '';
ALTER TABLE user_sessions ADD COLUMN soft_deleted_at INTEGER;

-- magic_link_tokens: carry the sender's device_id so verify/poll can create
-- a correctly-attributed session even when clicking from a different tab
ALTER TABLE magic_link_tokens ADD COLUMN device_id TEXT NOT NULL DEFAULT '';

-- Indexes for resurrection lookup and soft-delete queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_resurrection
    ON user_sessions(user_id, device_id, expires_at)
    WHERE soft_deleted_at IS NOT NULL;
