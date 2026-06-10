-- Migration 024: User auth tables
-- user_identities: one row per real person (google_id OR email as identity)
-- user_sessions:   random-token sessions issued after any sign-in
-- magic_link_tokens: short-lived one-use tokens for email magic link flow

CREATE TABLE IF NOT EXISTS user_identities (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id             TEXT    UNIQUE,
  email                 TEXT    NOT NULL UNIQUE,
  name                  TEXT,
  picture               TEXT,
  device_id             TEXT,
  plan                  TEXT    NOT NULL DEFAULT 'free',
  generation_count      INTEGER NOT NULL DEFAULT 0,
  generations_reset_at  INTEGER,
  created_at            INTEGER NOT NULL,
  last_seen_at          INTEGER
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token       TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES user_identities(id),
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id  ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires  ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  token       TEXT    PRIMARY KEY,
  email       TEXT    NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_magic_link_email    ON magic_link_tokens(email);
CREATE INDEX IF NOT EXISTS idx_magic_link_expires  ON magic_link_tokens(expires_at);
