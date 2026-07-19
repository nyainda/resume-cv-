/**
 * tier1Fixes.ts — Deterministic Tier 1 rewrites for the Autonomous Repair Engine.
 *
 * Tier 1: fixes that change actual content but don't need AI. Applied automatically,
 * shown as brief "we fixed X" notes in the Build Complete panel.
 *
 * All functions are pure — they take text in, return text out, and emit a Tier1Event
 * for each change applied.
 */

import { CVData } from '../types';
import { WEAK_VERB_ALTERNATIVES, PASSIVE_ROLE_PATTERNS, ENSURING_PATTERNS } from './verbAlternatives';
import type { PipelineEvent } from '../types/buildReport';

export interface Tier1Result {
  cv: CVData;
  events: PipelineEvent[];
}

// ─── Individual fixers ────────────────────────────────────────────────────────

/** Upgrade weak opening verbs. Returns the fixed bullet + whether a fix was applied. */
function fixWeakVerb(bullet: string): { text: string; fixed: boolean } {
  const m = bullet.match(/^([A-Za-z]+)\b/);
  if (!m) return { text: bullet, fixed: false };
  const opener = m[1].toLowerCase();
  const replacement = WEAK_VERB_ALTERNATIVES[opener];
  if (!replacement) return { text: bullet, fixed: false };
  const rest = bullet.slice(m[1].length);
  return { text: replacement + rest, fixed: true };
}

/** Strip passive role openers ("Responsible for X" → capitalise "X"). */
function fixPassiveRoleOpener(bullet: string): { text: string; fixed: boolean } {
  for (const { pattern } of PASSIVE_ROLE_PATTERNS) {
    if (pattern.test(bullet)) {
      const stripped = bullet.replace(pattern, '').trim();
      if (stripped.length < 10) continue; // would leave almost nothing
      const fixed = stripped.charAt(0).toUpperCase() + stripped.slice(1);
      return { text: fixed, fixed: true };
    }
  }
  return { text: bullet, fixed: false };
}

/** Strip "ensuring X" clauses from a bullet. */
function fixEnsuringVirus(bullet: string): { text: string; fixed: boolean } {
  let result = bullet;
  let fixed = false;
  for (const pattern of ENSURING_PATTERNS) {
    const replaced = result.replace(pattern, '');
    if (replaced !== result) {
      result = replaced.replace(/\s{2,}/g, ' ').trim().replace(/,\s*$/, '');
      fixed = true;
    }
  }
  return { text: result, fixed };
}

/** Fix bare metric opener: "40% revenue growth" → "Grew revenue by 40%". */
function fixBareMetricOpener(bullet: string): { text: string; fixed: boolean } {
  // Matches bullets starting with a number/percent/currency immediately
  const metricOpener = /^(\d[\d,.$%×xX]+[%×xX]?\s+\w)/;
  if (!metricOpener.test(bullet)) return { text: bullet, fixed: false };
  // Simple restructure: move the leading metric to after the first verb phrase
  // e.g. "40% increase in revenue by optimising…" → "Optimised … achieving 40% revenue increase"
  // We use a conservative rewrite: just prepend "Achieved" as a safe default
  const fixed = 'Achieved ' + bullet.charAt(0).toLowerCase() + bullet.slice(1);
  return { text: fixed, fixed: true };
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Apply all Tier 1 fixes to the CV. Returns the patched CV and a summary of events.
 * No AI calls — purely deterministic text transforms.
 */
export function applyTier1Fixes(cv: CVData): Tier1Result {
  const events: PipelineEvent[] = [];
  let weakVerbCount = 0;
  let passiveCount = 0;
  let ensuringCount = 0;
  let metricOpenerCount = 0;

  const newExperience = cv.experience.map(role => {
    const newResponsibilities = role.responsibilities.map(bullet => {
      let text = bullet;

      // 1. Passive role opener (takes priority over weak verb)
      const passive = fixPassiveRoleOpener(text);
      if (passive.fixed) { text = passive.text; passiveCount++; }
      else {
        // 2. Weak verb (only if not already fixed by passive)
        const weak = fixWeakVerb(text);
        if (weak.fixed) { text = weak.text; weakVerbCount++; }
      }

      // 3. Ensuring virus (independent of above)
      const ensuring = fixEnsuringVirus(text);
      if (ensuring.fixed) { text = ensuring.text; ensuringCount++; }

      // 4. Bare metric opener
      const metric = fixBareMetricOpener(text);
      if (metric.fixed) { text = metric.text; metricOpenerCount++; }

      return text;
    });

    return { ...role, responsibilities: newResponsibilities };
  });

  const resultCV = { ...cv, experience: newExperience };

  // Build events grouped by category
  if (passiveCount > 0) {
    events.push({
      tier: 1,
      category: 'voice_tense',
      description: `Rewrote ${passiveCount} passive role opener${passiveCount > 1 ? 's' : ''}`,
      count: passiveCount,
    });
  }
  if (weakVerbCount > 0) {
    events.push({
      tier: 1,
      category: 'verbs',
      description: `Upgraded ${weakVerbCount} weak verb${weakVerbCount > 1 ? 's' : ''}`,
      count: weakVerbCount,
    });
  }
  if (ensuringCount > 0) {
    events.push({
      tier: 1,
      category: 'language',
      description: `Removed "ensuring" filler from ${ensuringCount} bullet${ensuringCount > 1 ? 's' : ''}`,
      count: ensuringCount,
    });
  }
  if (metricOpenerCount > 0) {
    events.push({
      tier: 1,
      category: 'metrics',
      description: `Restructured ${metricOpenerCount} metric opener${metricOpenerCount > 1 ? 's' : ''}`,
      count: metricOpenerCount,
    });
  }

  return { cv: resultCV, events };
}
