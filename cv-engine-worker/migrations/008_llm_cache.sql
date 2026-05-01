-- Phase I: LLM response cache stored in D1.
-- Identical (model + temperature + system + user) prompts return instantly
-- without burning any AI provider quota.  SHA-256 key is computed client-side
-- so the raw prompt text never leaves the browser.
--
-- TTL: 30 days from last_hit_at (or created_at when never hit).
-- Cleanup: a lightweight DELETE is run on every POST to evict old rows.

CREATE TABLE IF NOT EXISTS llm_cache (
    cache_key    TEXT    PRIMARY KEY,          -- SHA-256 hex of model+temp+system+user
    model        TEXT    NOT NULL,
    temperature  REAL    NOT NULL,
    response     TEXT    NOT NULL,
    prompt_size  INTEGER NOT NULL DEFAULT 0,
    hit_count    INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    last_hit_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_llm_cache_created ON llm_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_cache_last_hit ON llm_cache(last_hit_at);
