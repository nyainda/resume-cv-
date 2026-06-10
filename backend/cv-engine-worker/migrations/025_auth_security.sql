-- Migration 025: Auth security hardening
-- auth_audit_log: immutable record of every sign-in / sign-out event
-- (rate-limit enforcement uses the existing magic_link_tokens table — no new table needed)

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES user_identities(id),
  event       TEXT    NOT NULL,   -- 'signin_google' | 'signin_magic' | 'signout'
  method      TEXT,               -- 'google' | 'magic_link'
  ip          TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_user    ON auth_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_event   ON auth_audit_log(event, created_at DESC);
