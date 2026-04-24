-- Custom pack UPSERT template for Cloudflare D1 SQL editor.
-- Use this when you want to edit data directly in Cloudflare dashboard.
-- After running, refresh KV cache from Admin UI or `npm run kv:sync`.

-- 1) Verbs
INSERT INTO cv_verbs (verb_present, verb_past, category, energy_level, human_score, formality, industry)
VALUES ('Optimizes', 'Optimized', 'technical', 'high', 9, 'neutral', 'general')
ON CONFLICT(verb_present, category) DO UPDATE SET
  verb_past    = excluded.verb_past,
  energy_level = excluded.energy_level,
  human_score  = excluded.human_score,
  formality    = excluded.formality,
  industry     = excluded.industry;

-- 2) Banned phrases
INSERT INTO cv_banned_phrases (phrase, replacement, severity, reason, source)
VALUES ('results-driven professional', '', 'high', 'generic_cliche', 'custom_pack')
ON CONFLICT(phrase) DO UPDATE SET
  replacement = excluded.replacement,
  severity    = excluded.severity,
  reason      = excluded.reason,
  source      = excluded.source;

-- 3) Field profile with JD keywords (JSON stored in TEXT)
INSERT INTO cv_field_profiles (field, language_style, preferred_verbs, avoided_verbs, metric_types, jd_keywords)
VALUES (
  'tech_software',
  'technical',
  '["Built","Shipped","Scaled"]',
  '["Liaised","Synergized"]',
  '["latency","uptime","cost reduction"]',
  '["kubernetes","microservices","ci/cd","observability"]'
)
ON CONFLICT(field) DO UPDATE SET
  language_style  = excluded.language_style,
  preferred_verbs = excluded.preferred_verbs,
  avoided_verbs   = excluded.avoided_verbs,
  metric_types    = excluded.metric_types,
  jd_keywords     = excluded.jd_keywords;

-- 4) Voice profile
INSERT INTO cv_voice_profiles (
  name, tone, description, verbosity_level, metric_preference,
  opener_frequency, risk_tolerance, formality,
  compatible_fields, compatible_seniority, incompatible_with,
  verb_bias, structure_bias
)
VALUES (
  'impact_concise',
  'confident',
  'Direct, measurable, and concise.',
  2,
  'high',
  0.15,
  'balanced',
  'neutral',
  '["tech_software","data_analytics"]',
  '["mid","senior","lead"]',
  '[]',
  '["Built","Scaled","Automated"]',
  '["short","medium"]'
)
ON CONFLICT(name) DO UPDATE SET
  tone                 = excluded.tone,
  description          = excluded.description,
  verbosity_level      = excluded.verbosity_level,
  metric_preference    = excluded.metric_preference,
  opener_frequency     = excluded.opener_frequency,
  risk_tolerance       = excluded.risk_tolerance,
  formality            = excluded.formality,
  compatible_fields    = excluded.compatible_fields,
  compatible_seniority = excluded.compatible_seniority,
  incompatible_with    = excluded.incompatible_with,
  verb_bias            = excluded.verb_bias,
  structure_bias       = excluded.structure_bias;
