-- Migration 041: BYOK monthly PDF download cap
--
-- BYOK accounts previously had zero download limit (only "pure free" was
-- capped, at 2 lifetime PDFs). This adds a rolling calendar-month counter so
-- BYOK can be capped at 10 PDF downloads/month as an abuse/cost safety net,
-- without touching the free tier's existing lifetime cap.
--
-- pdf_dl_month_reset stores the UTC month string (YYYY-MM) of the current
-- window; when it no longer matches the current month the counter resets.
ALTER TABLE user_usage ADD COLUMN pdf_dl_month_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_usage ADD COLUMN pdf_dl_month_reset TEXT    NOT NULL DEFAULT '';
