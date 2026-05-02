-- Groq response cache.
-- Keyed by sha256 of (model + temperature + system + user) so identical prompts
-- (e.g. re-generating the same CV) return instantly without burning quota.
--
-- We deliberately ONLY cache responses where temperature <= 0.5 — anything
-- creative (>0.5) is supposed to vary, so caching would defeat the purpose.

CREATE TABLE IF NOT EXISTS groq_cache (
    key          TEXT        PRIMARY KEY,        -- sha256 hex of cache inputs
    model        TEXT        NOT NULL,
    temperature  REAL        NOT NULL,
    response     TEXT        NOT NULL,
    prompt_size  INTEGER     NOT NULL DEFAULT 0,
    response_size INTEGER    NOT NULL DEFAULT 0,
    hit_count    INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_hit_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_groq_cache_expires_at ON groq_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_groq_cache_model      ON groq_cache (model);
