-- Migration 013: CV Share links
--
-- Stores compressed CV payloads keyed by a random 8-char ID.
-- Replaces the "stuff everything in the URL hash" approach with a short,
-- clean share link:  https://<domain>/#s=<8-char-id>
--
-- Columns:
--   id          — random 8-char alphanumeric, URL-safe primary key
--   payload     — lz-string compressed JSON (SharedCVPayload), max 64 KB
--   created_at  — unix epoch seconds
--   expires_at  — unix epoch seconds (default: 30 days after creation)
--   view_count  — incremented on every GET

CREATE TABLE IF NOT EXISTS cv_shares (
    id          TEXT    PRIMARY KEY,
    payload     TEXT    NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at  INTEGER NOT NULL DEFAULT (unixepoch() + 2592000),
    view_count  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cv_shares_expires ON cv_shares(expires_at);
