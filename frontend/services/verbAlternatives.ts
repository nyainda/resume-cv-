/**
 * verbAlternatives.ts — Verb swap maps for Tier 1 deterministic fixes.
 *
 * WEAK_VERB_ALTERNATIVES: maps weak opener verbs → stronger alternatives.
 * PASSIVE_ROLE_REWRITES: maps passive role phrases → active rewrites.
 */

/** Maps a weak opener verb (lowercase) to a strong alternative. */
export const WEAK_VERB_ALTERNATIVES: Record<string, string> = {
  helped:        'Supported',
  assisted:      'Aided',
  worked:        'Contributed',
  participated:  'Engaged',
  involved:      'Contributed',
  contributed:   'Delivered',
  supported:     'Enabled',
  provided:      'Delivered',
  maintained:    'Managed',
  used:          'Applied',
  did:           'Executed',
  made:          'Built',
  got:           'Achieved',
  engaged:       'Collaborated',
  aided:         'Facilitated',
};

/**
 * Passive role phrase patterns → replacement active prefix.
 * These match the START of a bullet (case-insensitive).
 * The replacement is applied to the phrase, then the remainder of the bullet
 * is capitalised and appended.
 */
export const PASSIVE_ROLE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^responsible\s+for\s+/i,   replacement: '' },
  { pattern: /^tasked\s+with\s+/i,       replacement: '' },
  { pattern: /^was\s+tasked\s+with\s+/i, replacement: '' },
  { pattern: /^was\s+responsible\s+for\s+/i, replacement: '' },
  { pattern: /^in\s+charge\s+of\s+/i,    replacement: '' },
  { pattern: /^duties\s+include[d]?\s+/i, replacement: '' },
  { pattern: /^role\s+involve[d]?\s+/i,  replacement: '' },
];

/**
 * "Ensuring" virus patterns — strip the ensuring clause and restructure.
 * Operates on full bullet text.
 */
export const ENSURING_PATTERNS: RegExp[] = [
  /,?\s*ensuring\s+(?:that\s+)?[^,;.]+[,;.]?/gi,
  /\s+while\s+ensuring\s+(?:that\s+)?[^,;.]+[,;.]?/gi,
];
