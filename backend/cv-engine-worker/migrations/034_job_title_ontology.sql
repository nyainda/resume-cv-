-- Migration 034: Job Title Ontology Cache
-- Stores job title → CVField slug mappings discovered at runtime.
-- Populated as a side-effect of existing LLM calls.
-- Never manually maintained — grows automatically with user data.

CREATE TABLE IF NOT EXISTS job_title_ontology (
  -- Normalized title: lowercase, trimmed, max 300 chars
  title_normalized  TEXT    PRIMARY KEY,

  -- CVField slug from fieldOntology.ts leaf nodes
  -- e.g. 'irrigation', 'tech', 'civil_engineering', 'manufacturing'
  field_slug        TEXT    NOT NULL,

  -- How confident is this classification?
  -- 'regex'          = matched by frontend regex (fast path)
  -- 'llm'            = classified by LLM during another call
  -- 'user_confirmed' = user manually selected field in ProfileForm
  confidence        TEXT    NOT NULL DEFAULT 'llm',

  -- Which touchpoint produced this entry?
  -- 'pdf_import' | 'jd_upload' | 'manual_form' | 'deep_analysis'
  source            TEXT    NOT NULL DEFAULT 'pdf_import',

  -- How many users have had this title — used for quality ranking
  usage_count       INTEGER NOT NULL DEFAULT 1,

  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- Index for fast field-based queries (e.g. "all tech titles")
CREATE INDEX IF NOT EXISTS idx_job_title_ontology_field
  ON job_title_ontology (field_slug);

-- Index for usage ranking (promotes high-confidence titles to regex layer)
CREATE INDEX IF NOT EXISTS idx_job_title_ontology_usage
  ON job_title_ontology (usage_count DESC);
