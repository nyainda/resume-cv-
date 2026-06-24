-- Migration 033: Add slug to public_profiles for non-enumerable share URLs
--
-- Problem: the old URL used ?id=<integer> which is a sequential user ID —
-- trivial to enumerate and discover every published CV.
-- Fix: add a random 16-char slug generated at publish time.
-- New URL format:  https://<domain>/#p=<slug>
-- Legacy ?id= lookups continue to work during the transition.

ALTER TABLE public_profiles ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_profiles_slug ON public_profiles(slug) WHERE slug IS NOT NULL;
