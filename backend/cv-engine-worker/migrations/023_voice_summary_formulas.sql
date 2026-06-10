-- Phase 3.3 — Voice-specific summary formulas
-- Adds a summary_formula TEXT column to cv_voice_profiles and populates it
-- for all voice types based on tone + verbosity + metric_preference.
-- The brief builder returns this formula; the LLM uses it to shape the
-- summary paragraph structure instead of defaulting to the generic 4-line template.
-- Each formula is a ~150-char instruction string.

ALTER TABLE cv_voice_profiles ADD COLUMN summary_formula TEXT;

-- Terse, results-first voices (verbosity 1-2, high metric preference)
-- → Short punchy hook with a number, role breadth line, strongest win, one forward value statement.
UPDATE cv_voice_profiles
SET summary_formula = 'Hook (≤12 words + one concrete number) → Role scope (one line, no pronoun) → Strongest metric win (≤15 words) → Forward value (≤10 words, no clichés).'
WHERE verbosity_level <= 2 AND metric_preference = 'high';

-- Terse, relationship-first voices (verbosity 1-2, medium/low metric)
UPDATE cv_voice_profiles
SET summary_formula = 'Role identity hook (one line, grounded in sector) → Key method or approach (one line) → One impact statement (qualitative or light metric) → Value offer (≤12 words).'
WHERE verbosity_level <= 2 AND metric_preference != 'high';

-- Balanced analytical voices (verbosity 3, high metric)
UPDATE cv_voice_profiles
SET summary_formula = 'Scoped role statement (years + domain) → Two evidence lines: one metric win, one methodology/tool strength → Differentiator sentence (what makes this candidate distinctive) → Forward CTA (one line, active tense).'
WHERE verbosity_level = 3 AND metric_preference = 'high';

-- Balanced mid-range voices (verbosity 3, medium metric)
UPDATE cv_voice_profiles
SET summary_formula = 'Role + domain context (one sentence, ≤20 words) → Strongest achievement (one sentence with one number) → Skill or approach that underpins results → Brief forward value statement. 3–4 sentences total, no buzzwords.'
WHERE verbosity_level = 3 AND metric_preference = 'medium';

-- Balanced mission/people voices (verbosity 3, low metric)
UPDATE cv_voice_profiles
SET summary_formula = 'Purpose or mission hook (why this field, grounded in experience) → Capability statement (one sentence) → Impact example (qualitative — scale, change, outcome) → Offer to next employer (one line).'
WHERE verbosity_level = 3 AND metric_preference = 'low';

-- Expansive strategic voices (verbosity 4-5, high metric)
UPDATE cv_voice_profiles
SET summary_formula = 'Career arc opener (sector + years + scope, one sentence) → Two to three evidence sentences: metrics, scale, P&L or budget owned, team size → Distinctive approach or philosophy (one sentence) → Ambition and fit statement (one sentence). 4–5 sentences, each starting with a different structural pattern.'
WHERE verbosity_level >= 4 AND metric_preference = 'high';

-- Expansive narrative voices (verbosity 4-5, medium/low metric)
UPDATE cv_voice_profiles
SET summary_formula = 'Narrative opener: context that explains career direction (one sentence) → Depth of expertise with one concrete anchor → Two sentences on how this person works (approach, collaboration, systems thinking) → One sentence on what they are building toward. 4–5 sentences, varied rhythm (mix long and short).'
WHERE verbosity_level >= 4 AND metric_preference != 'high';
