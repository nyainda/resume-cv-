-- Migration 040: Pipeline escape collector
-- Stores sanitised signals from ARE + user actions (skip/manual edit)
-- so admins can identify recurring pipeline gaps and promote fixes to live rules.

CREATE TABLE IF NOT EXISTS pipeline_escapes (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  escape_type TEXT    NOT NULL,   -- 'banned_phrase'|'weak_verb'|'passive'|'ai_language'|'metric'|'cert'|'other'
  pattern     TEXT    NOT NULL,   -- sanitised fragment (numbers→[NUM], names→[NAME], orgs→[ORG])
  source      TEXT    NOT NULL,   -- 'tier1_fix'|'tier2_fix'|'user_skip'|'user_edit'|'build_warn'|'gateway'
  promoted    INTEGER DEFAULT 0,  -- 1 = admin promoted to live rules
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pe_type    ON pipeline_escapes(escape_type, promoted);
CREATE INDEX IF NOT EXISTS idx_pe_user    ON pipeline_escapes(user_id);
CREATE INDEX IF NOT EXISTS idx_pe_source  ON pipeline_escapes(source, created_at);
