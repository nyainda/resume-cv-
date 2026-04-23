-- Phase I: leak miner queue. Phrases reported by the frontend leak detector
-- are upserted here; the nightly cron promotes ones above the threshold into
-- cv_banned_phrases and marks them 'promoted'.
CREATE TABLE IF NOT EXISTS cv_leak_candidates (
    id            TEXT PRIMARY KEY,
    phrase        TEXT NOT NULL UNIQUE,
    count         INTEGER NOT NULL DEFAULT 1,
    sample        TEXT,
    first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
    status        TEXT NOT NULL DEFAULT 'pending',  -- pending | promoted | rejected
    decided_at    TEXT,
    decided_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_leak_candidates_status_count
    ON cv_leak_candidates(status, count DESC);
