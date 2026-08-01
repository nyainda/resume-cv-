-- Migration 045: Enrich vault_jobs with remote, location, and notes columns
--
-- remote:   'Remote' | 'Hybrid' | 'On-site' — extracted from JD by LLM/heuristic
-- location: free-text city/region e.g. 'London, UK'
-- notes:    per-job private scratchpad for the user

ALTER TABLE vault_jobs ADD COLUMN notes    TEXT    DEFAULT NULL;
ALTER TABLE vault_jobs ADD COLUMN remote   TEXT    DEFAULT NULL;  -- 'Remote'|'Hybrid'|'On-site'
ALTER TABLE vault_jobs ADD COLUMN location TEXT    DEFAULT NULL;
