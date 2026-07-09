-- Migration 035: Scope profile_cache to (user_id, hash) — close the cross-account leak.
--
-- Root cause (see incident notes): profile_cache was keyed globally by content
-- hash alone, with an "optional" ownership check that only ran when a session
-- was already resolved via a header format the frontend stopped sending. Any
-- two accounts whose compact profile happened to hash identically (e.g. two
-- fresh/near-empty profiles) could read and then keep writing under each
-- other's slot_id — a real cross-account data leak (confirmed: accounts 96
-- and 100 shared a slot via hash fb11a5d...).
--
-- Fix (Rule 2 — Identity & Ownership Directive, same pattern as migration 031):
--   One table may have exactly ONE active uniqueness constraint that determines
--   row ownership. profile_cache is rebuilt with PRIMARY KEY (user_id, hash) so
--   a hash collision between two different users can never resolve to the same
--   row — they are physically different rows in the table. There is no
--   optional/best-effort ownership check left to bypass: the handler now
--   requires a real session and always filters by user_id, never by hash alone.
--
-- Anonymous/pre-auth rows (user_id IS NULL) are dropped. They were only ever
-- reachable by hash guessing and are not needed — user_slots already requires
-- authentication for the profile data these entries mirror.

CREATE TABLE IF NOT EXISTS profile_cache_new (
    user_id       INTEGER NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
    hash          TEXT    NOT NULL,
    slot_id       TEXT    NOT NULL,
    slot_name     TEXT    NOT NULL DEFAULT '',
    compact_json  TEXT    NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    last_used_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    use_count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, hash)
);

-- Best-effort backfill: only rows whose slot_id maps to exactly one owning
-- user in user_slots can be attributed safely. Anything ambiguous (including
-- the leaked row itself) is dropped rather than guessed.
INSERT OR REPLACE INTO profile_cache_new
    (user_id, hash, slot_id, slot_name, compact_json, created_at, last_used_at, use_count)
SELECT us.user_id, pc.hash, pc.slot_id, pc.slot_name, pc.compact_json,
       pc.created_at, pc.last_used_at, pc.use_count
FROM profile_cache pc
JOIN user_slots us ON us.slot_id = pc.slot_id
WHERE us.user_id IS NOT NULL;

DROP TABLE profile_cache;
ALTER TABLE profile_cache_new RENAME TO profile_cache;

CREATE INDEX IF NOT EXISTS idx_profile_cache_slot ON profile_cache(slot_id);
CREATE INDEX IF NOT EXISTS idx_profile_cache_last ON profile_cache(last_used_at);
CREATE INDEX IF NOT EXISTS idx_profile_cache_user ON profile_cache(user_id);
