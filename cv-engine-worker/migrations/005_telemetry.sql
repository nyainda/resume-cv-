-- Phase K: lightweight server-side telemetry of brief requests.
-- Logged automatically inside handleBrief — no client/admin involvement.
-- Used to see which (seniority, field, voice) combos are actually requested
-- so we know where to invest in voice profiles + verb pool depth.
CREATE TABLE IF NOT EXISTS cv_request_telemetry (
    id           TEXT PRIMARY KEY,
    seniority    TEXT,
    field        TEXT,
    voice        TEXT,
    section      TEXT,
    jd_present   INTEGER NOT NULL DEFAULT 0,  -- 0/1
    field_source TEXT,                        -- 'requested' | 'jd_keywords' | 'fallback' | 'none'
    ts           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_telemetry_combo ON cv_request_telemetry(seniority, field, voice);
CREATE INDEX IF NOT EXISTS idx_telemetry_ts    ON cv_request_telemetry(ts DESC);
