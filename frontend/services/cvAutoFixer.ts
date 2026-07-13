/**
 * cvAutoFixer.ts
 *
 * Deterministic, zero-LLM CV fix engine.
 * Takes a CVData and a list of fixes to apply, returns a deep-cloned
 * updated CVData along with a human-readable change log.
 *
 * Fixes supported:
 *  - VERB_VARIETY  — replace overused starting verbs with rotating synonyms
 *  - AIISM_REMOVE  — strip/replace known AI-ism phrases
 */

import type { CVData } from '../types';
import { VERB_SYNONYMS, type OverusedVerb } from './cvVerbVariety';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FixChange {
  role: string;
  original: string;
  fixed: string;
  reason: string;
}

export interface FixResult {
  updatedCV: CVData;
  fixCount: number;
  changes: FixChange[];
}

// ── Deep clone ────────────────────────────────────────────────────────────────

function cloneCV(cv: CVData): CVData {
  return JSON.parse(JSON.stringify(cv)) as CVData;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractStartingVerb(bullet: string): string {
  const cleaned = bullet.trim().replace(/^[•\-–—*►▶▸▹→‣⁃◆◇○●]\s*/, '');
  return cleaned.split(/[\s,;:]/)[0].toLowerCase().replace(/[^a-z]/g, '');
}

function replaceStartingVerb(bullet: string, replacement: string): string {
  const trimmed = bullet.trim();
  const prefix  = trimmed.match(/^[•\-–—*]\s*/)?.[0] ?? '';
  const body    = trimmed.slice(prefix.length);
  const firstWord = body.split(/[\s,;:]/)[0];
  if (!firstWord) return bullet;

  // Preserve capitalisation: "Managed" → "Directed" (cap), "managed" → "directed"
  const isCapitalised = firstWord[0] === firstWord[0].toUpperCase() && firstWord[0] !== firstWord[0].toLowerCase();
  const newVerb = isCapitalised
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;

  return prefix + newVerb + body.slice(firstWord.length);
}

// ── AI-ism phrase replacements ────────────────────────────────────────────────
// Keys are lowercase patterns (will be matched case-insensitively).

const AIISM_REPLACEMENTS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\bdelve[sd]?\s+into\b/gi,                    replacement: 'analyzed' },
  { pattern: /\bharne(?:ss|ssed|sses|ssing)\s+the\s+power\s+of\b/gi, replacement: 'used' },
  { pattern: /\bin\s+order\s+to\b/gi,                      replacement: 'to' },
  { pattern: /\butilize[sd]?\b/gi,                         replacement: 'used' },
  { pattern: /\butilizing\b/gi,                            replacement: 'using' },
  { pattern: /\butilization\b/gi,                          replacement: 'use' },
  { pattern: /\bfacilitate[sd]?\s+the\b/gi,               replacement: 'enabled' },
  { pattern: /\bprovided\s+comprehensive\b/gi,             replacement: 'provided' },
  { pattern: /\bin\s+a\s+(?:fast|rapid|quick)-paced\s+environment\b/gi, replacement: 'in a fast-paced environment' },
  { pattern: /\bwith\s+a\s+(?:proven|track)\s+record\s+of\b/gi, replacement: 'with a record of' },
  { pattern: /\bseamlessly\b/gi,                           replacement: '' },
  { pattern: /\brobust\b/gi,                               replacement: 'strong' },
  { pattern: /\binnovative\s+(?:solutions?|approaches?)\b/gi, replacement: 'solutions' },
  { pattern: /\bcutting-edge\b/gi,                         replacement: 'advanced' },
  { pattern: /\bstate-of-the-art\b/gi,                     replacement: 'advanced' },
  { pattern: /\bsynergize[sd]?\b/gi,                       replacement: 'collaborated' },
  { pattern: /\bsynergy\b/gi,                              replacement: 'collaboration' },
  { pattern: /\bthought\s+leader(?:ship)?\b/gi,            replacement: 'industry expertise' },
];

function applyAiismFixes(bullet: string): { result: string; changed: boolean } {
  let result = bullet;
  for (const { pattern, replacement } of AIISM_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  // Clean up double spaces from empty replacements
  result = result.replace(/\s{2,}/g, ' ').trim();
  return { result, changed: result !== bullet };
}

// ── FIX: Verb Variety ─────────────────────────────────────────────────────────

export function fixVerbVariety(cv: CVData, overusedVerbs: OverusedVerb[]): FixResult {
  const updated = cloneCV(cv);
  const changes: FixChange[] = [];

  // Build a set of (verb → synonym index) so we cycle through synonyms
  const synonymCursor: Record<string, number> = {};

  function getNextSynonym(verb: string): string | null {
    const syns = VERB_SYNONYMS[verb.toLowerCase()];
    if (!syns || syns.length === 0) return null;
    const idx = synonymCursor[verb] ?? 0;
    synonymCursor[verb] = (idx + 1) % syns.length;
    return syns[idx];
  }

  // Build a lookup: verbText (lowercase) → how many times we've seen it (skip first)
  const seenCount: Record<string, number> = {};

  // Only fix verbs that are overused (in the passed list)
  const overusedSet = new Set(overusedVerbs.map(ov => ov.verb.toLowerCase()));

  function processBullet(
    bullet: string,
    roleLabel: string,
  ): string {
    const verb = extractStartingVerb(bullet);
    if (!verb || !overusedSet.has(verb)) return bullet;

    seenCount[verb] = (seenCount[verb] ?? 0) + 1;
    if (seenCount[verb] <= 1) return bullet; // keep first occurrence

    const synonym = getNextSynonym(verb);
    if (!synonym) return bullet;

    const fixed = replaceStartingVerb(bullet, synonym);
    changes.push({
      role: roleLabel,
      original: bullet,
      fixed,
      reason: `"${verb}" used ${seenCount[verb]}× — replaced with "${synonym}"`,
    });
    return fixed;
  }

  // Apply to experience
  for (const role of updated.experience ?? []) {
    const label = [role.jobTitle, role.company].filter(Boolean).join(' @ ') || 'Role';
    if (Array.isArray(role.responsibilities)) {
      role.responsibilities = role.responsibilities.map(b =>
        typeof b === 'string' ? processBullet(b, label) : b
      );
    }
  }

  // Apply to projects
  for (const proj of updated.projects ?? []) {
    const label = proj.name || 'Project';
    if (Array.isArray(proj.bullets)) {
      proj.bullets = proj.bullets.map(b =>
        typeof b === 'string' ? processBullet(b, label) : b
      );
    }
  }

  return { updatedCV: updated, fixCount: changes.length, changes };
}

// ── FIX: AI-isms ──────────────────────────────────────────────────────────────

export function fixAiIsms(cv: CVData): FixResult {
  const updated = cloneCV(cv);
  const changes: FixChange[] = [];

  function processBullet(bullet: string, roleLabel: string): string {
    const { result, changed } = applyAiismFixes(bullet);
    if (changed) {
      changes.push({ role: roleLabel, original: bullet, fixed: result, reason: 'AI-ism phrase removed or replaced' });
    }
    return result;
  }

  for (const role of updated.experience ?? []) {
    const label = [role.jobTitle, role.company].filter(Boolean).join(' @ ') || 'Role';
    if (Array.isArray(role.responsibilities)) {
      role.responsibilities = role.responsibilities.map(b =>
        typeof b === 'string' ? processBullet(b, label) : b
      );
    }
  }

  for (const proj of updated.projects ?? []) {
    const label = proj.name || 'Project';
    if (Array.isArray(proj.bullets)) {
      proj.bullets = proj.bullets.map(b =>
        typeof b === 'string' ? processBullet(b, label) : b
      );
    }
  }

  if (updated.summary) {
    const { result, changed } = applyAiismFixes(updated.summary);
    if (changed) {
      changes.push({ role: 'Summary', original: updated.summary, fixed: result, reason: 'AI-ism phrase removed or replaced' });
      updated.summary = result;
    }
  }

  return { updatedCV: updated, fixCount: changes.length, changes };
}
