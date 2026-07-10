-- Migration 037: Add user_id to cv_shares
--
-- Allows share links to be attributed to a logged-in user so they can be
-- cleaned up atomically when an account is deleted.
-- Nullable: anonymous shares (no session) continue to work unchanged.

ALTER TABLE cv_shares ADD COLUMN user_id INTEGER REFERENCES user_identities(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cv_shares_user_id ON cv_shares(user_id);
