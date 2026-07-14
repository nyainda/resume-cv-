-- Migration 039: BYOK flag on user_identities
--
-- Stores whether the user has self-reported having a third-party API key
-- (Gemini / Claude / Groq). This lets the Worker enforce BYOK-tier
-- feature gates server-side without needing the client to send its keys.
--
-- byok_enabled is set to 1 by POST /api/cv/mark-byok (called from the
-- frontend when the user saves an API key in Settings).
-- It is reset to 0 via the same endpoint when keys are removed.

ALTER TABLE user_identities ADD COLUMN byok_enabled INTEGER NOT NULL DEFAULT 0;
