-- Migration 030: Clear existing plaintext session tokens
--
-- Bug 8 fix: session tokens are now stored as SHA-256 hashes in D1.
-- Any existing rows contain raw tokens that will never match the new
-- hashed lookups, so we wipe them here. Users will be asked to sign
-- in again once — a one-time inconvenience for a meaningful security
-- improvement (leaked D1 data cannot be used as bearer tokens).

DELETE FROM user_sessions;
