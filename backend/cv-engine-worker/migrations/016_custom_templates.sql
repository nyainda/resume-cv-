-- Migration 016: Custom Templates
-- Stores user-generated templates (created via the Template Analyzer feature).
-- user_id is a device fingerprint (not linked to any auth — app is privacy-first).

CREATE TABLE IF NOT EXISTS custom_templates (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  spec_json    TEXT NOT NULL,
  thumbnail    TEXT,
  created_at   INTEGER DEFAULT (unixepoch()),
  updated_at   INTEGER DEFAULT (unixepoch()),
  is_public    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_custom_templates_user ON custom_templates (user_id);
CREATE INDEX IF NOT EXISTS idx_custom_templates_public ON custom_templates (is_public, created_at DESC);
