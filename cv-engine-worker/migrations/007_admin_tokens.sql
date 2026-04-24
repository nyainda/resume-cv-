-- Phase H: DB-driven multi-token admin auth.
-- Replaces the single shared ADMIN_TOKEN secret with per-person tokens that
-- have roles ('viewer' | 'editor' | 'admin'). Tokens are stored as SHA-256
-- hashes — the plaintext is shown ONCE on creation and never persisted.
--
-- Backwards compatibility: the worker keeps honouring env.ADMIN_TOKEN as a
-- bootstrap "admin" credential, so this migration alone never locks anyone out.
CREATE TABLE IF NOT EXISTS cv_admin_tokens (
    id           TEXT PRIMARY KEY,
    token_hash   TEXT NOT NULL UNIQUE,        -- SHA-256 hex of the plaintext
    label        TEXT NOT NULL,               -- human-readable name
    role         TEXT NOT NULL DEFAULT 'editor',  -- viewer | editor | admin
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT,
    revoked_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_tokens_active ON cv_admin_tokens(token_hash, revoked_at);
