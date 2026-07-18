-- Migration 042: Add slot_id to public_profiles
--
-- Problem: the frontend stores per-slot publish state only in localStorage,
-- which is lost on logout / different device. The backend has no knowledge of
-- which room (slot) the profile was published from, so the frontend cannot
-- restore the correct "Published" state on login without re-publishing.
--
-- Fix: persist the slot_id alongside the published profile so the authenticated
-- GET /api/cv/public-profile/me endpoint can return it and the frontend can
-- restore the localStorage key for the right room.

ALTER TABLE public_profiles ADD COLUMN slot_id TEXT;
