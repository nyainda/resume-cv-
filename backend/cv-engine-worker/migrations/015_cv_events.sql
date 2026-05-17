-- Migration 015: Anonymous usage events
--
-- Fire-and-forget analytics stored server-side so we can understand
-- which templates, generation modes, and features are actually used —
-- without any user-identifying data ever leaving the client.
--
-- All columns are non-PII by design:
--   event_type   — e.g. 'cv_generated', 'cv_downloaded', 'template_used',
--                  'share_created', 'email_composed', 'doctor_opened'
--   template     — template slug, or '' when not applicable
--   mode         — generation mode ('honest' | 'boosted' | 'aggressive') or ''
--   metadata     — optional JSON blob for extra dimensions (purpose, lang, etc.)
--   created_at   — unix epoch seconds

CREATE TABLE IF NOT EXISTS cv_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT    NOT NULL,
    template    TEXT    NOT NULL DEFAULT '',
    mode        TEXT    NOT NULL DEFAULT '',
    metadata    TEXT    NOT NULL DEFAULT '{}',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_cv_events_type    ON cv_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cv_events_time    ON cv_events(created_at);
CREATE INDEX IF NOT EXISTS idx_cv_events_template ON cv_events(template);
