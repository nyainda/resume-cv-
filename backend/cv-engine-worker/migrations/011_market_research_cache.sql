-- Migration 011: Market research cache.
--
-- Stores the JSON output of conductMarketResearch() keyed by a hash of:
--   scenario + detected_role + detected_industry + normalized_jd_text
--
-- Same JD + same detected role/industry always produces the same cache key,
-- so the AI call is skipped entirely on repeat generations. TTL is 7 days.
--
-- Columns:
--   cache_key     — SHA-256 hex of (scenario:role:industry:jd) — primary key
--   scenario      — A | B | C (for observability)
--   detected_role — human-readable role string (for observability)
--   result_json   — full MarketResearchResult serialised as JSON
--   created_at    — unix epoch seconds (when the AI produced this result)
--   last_used_at  — updated on every cache hit (for TTL cleanup)
--   use_count     — how many generations have benefited from this cache entry

CREATE TABLE IF NOT EXISTS market_research_cache (
    cache_key     TEXT    PRIMARY KEY,
    scenario      TEXT    NOT NULL DEFAULT 'C',
    detected_role TEXT    NOT NULL DEFAULT '',
    result_json   TEXT    NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    last_used_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    use_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mr_cache_last ON market_research_cache(last_used_at);
