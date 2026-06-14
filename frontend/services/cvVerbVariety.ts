/**
 * cvVerbVariety.ts
 *
 * Verb Variety Score — zero LLM, pure deterministic.
 *
 * Recruiters notice instantly when a CV starts every bullet with "Managed",
 * "Developed", or "Led". It signals limited range and lazy writing.
 * The score penalises two things:
 *
 *  1. Overused verbs — the same starting verb used 3+ times across all bullets.
 *  2. Weak verbs    — low-impact words (helped, assisted, worked, participated)
 *                     that dilute the overall impression.
 *
 * Score = 0.7 × variety_score + 0.3 × weak_verb_penalty
 * variety_score = function of unique-verb ratio and worst single-verb frequency
 */

import type { CVData } from '../types';

// ── Synonym map (also used by the auto-fixer) ─────────────────────────────────

export const VERB_SYNONYMS: Record<string, string[]> = {
  managed:       ['directed', 'oversaw', 'coordinated', 'spearheaded', 'orchestrated'],
  led:           ['directed', 'championed', 'guided', 'drove', 'headed'],
  oversaw:       ['supervised', 'directed', 'coordinated', 'monitored', 'governed'],
  supervised:    ['managed', 'directed', 'oversaw', 'coordinated', 'monitored'],
  developed:     ['built', 'engineered', 'created', 'designed', 'architected'],
  created:       ['built', 'designed', 'authored', 'established', 'launched'],
  built:         ['developed', 'designed', 'engineered', 'constructed', 'crafted'],
  designed:      ['architected', 'crafted', 'developed', 'structured', 'created'],
  implemented:   ['deployed', 'rolled out', 'introduced', 'launched', 'integrated'],
  deployed:      ['launched', 'released', 'shipped', 'rolled out', 'operationalized'],
  improved:      ['enhanced', 'optimized', 'elevated', 'strengthened', 'streamlined'],
  optimized:     ['improved', 'refined', 'enhanced', 'streamlined', 'accelerated'],
  enhanced:      ['improved', 'strengthened', 'elevated', 'refined', 'boosted'],
  delivered:     ['shipped', 'launched', 'executed', 'drove', 'completed'],
  executed:      ['delivered', 'implemented', 'completed', 'drove', 'accomplished'],
  collaborated:  ['partnered', 'coordinated with', 'teamed with', 'worked alongside'],
  worked:        ['collaborated', 'partnered', 'contributed', 'engaged', 'executed'],
  partnered:     ['collaborated', 'coordinated with', 'worked alongside', 'teamed with'],
  reported:      ['presented', 'communicated', 'delivered', 'documented', 'tracked'],
  presented:     ['reported', 'communicated', 'showcased', 'demonstrated', 'pitched'],
  analyzed:      ['assessed', 'evaluated', 'examined', 'investigated', 'audited'],
  assessed:      ['evaluated', 'analyzed', 'reviewed', 'examined', 'audited'],
  evaluated:     ['analyzed', 'assessed', 'examined', 'reviewed', 'appraised'],
  supported:     ['enabled', 'facilitated', 'assisted', 'backed', 'contributed to'],
  assisted:      ['supported', 'aided', 'facilitated', 'contributed to', 'enabled'],
  helped:        ['supported', 'enabled', 'facilitated', 'contributed to', 'assisted'],
  drove:         ['led', 'spearheaded', 'championed', 'directed', 'propelled'],
  spearheaded:   ['led', 'drove', 'championed', 'initiated', 'pioneered'],
  maintained:    ['sustained', 'preserved', 'upheld', 'managed', 'monitored'],
  monitored:     ['tracked', 'measured', 'evaluated', 'reviewed', 'governed'],
  grew:          ['scaled', 'expanded', 'accelerated', 'increased', 'drove growth in'],
  scaled:        ['grew', 'expanded', 'accelerated', 'ramped up', 'broadened'],
  expanded:      ['grew', 'scaled', 'broadened', 'extended', 'increased'],
  launched:      ['shipped', 'deployed', 'introduced', 'released', 'initiated'],
  initiated:     ['launched', 'pioneered', 'introduced', 'established', 'kicked off'],
  trained:       ['mentored', 'coached', 'developed', 'upskilled', 'guided'],
  mentored:      ['coached', 'trained', 'guided', 'developed', 'cultivated'],
  coached:       ['mentored', 'trained', 'guided', 'developed', 'upskilled'],
  reduced:       ['cut', 'decreased', 'lowered', 'minimized', 'streamlined'],
  cut:           ['reduced', 'decreased', 'lowered', 'trimmed', 'eliminated'],
  streamlined:   ['simplified', 'optimized', 'improved', 'refined', 'accelerated'],
  conducted:     ['performed', 'executed', 'carried out', 'ran', 'facilitated'],
  performed:     ['conducted', 'executed', 'carried out', 'delivered', 'completed'],
  coordinated:   ['managed', 'organized', 'aligned', 'orchestrated', 'facilitated'],
  organized:     ['coordinated', 'structured', 'managed', 'arranged', 'orchestrated'],
  established:   ['founded', 'created', 'built', 'launched', 'instituted'],
  identified:    ['discovered', 'uncovered', 'detected', 'pinpointed', 'recognized'],
  resolved:      ['fixed', 'addressed', 'eliminated', 'corrected', 'remediated'],
  defined:       ['established', 'crafted', 'shaped', 'structured', 'formulated'],
  drove:         ['led', 'spearheaded', 'propelled', 'championed', 'catalyzed'],
};

// Weak verbs that undermine impact regardless of variety
export const WEAK_VERBS = new Set([
  'helped', 'assisted', 'worked', 'participated', 'involved',
  'supported', 'contributed', 'aided', 'performed', 'conducted',
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OverusedVerb {
  verb: string;
  count: number;
  synonyms: string[];
  bullets: { text: string; role: string }[]; // all bullets starting with this verb
}

export interface VerbVarietyReport {
  score: number;
  uniqueVerbCount: number;
  totalBullets: number;
  uniqueVerbRatio: number;
  overusedVerbs: OverusedVerb[];   // verbs used 3+ times
  weakVerbInstances: { verb: string; count: number }[];
  topVerbs: { verb: string; count: number }[];
  fixableBulletCount: number;      // how many bullets the auto-fix can improve
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractStartingVerb(bullet: string): string {
  const cleaned = bullet.trim().replace(/^[•\-–—*]\s*/, '');
  const word = cleaned.split(/[\s,;:]/)[0].toLowerCase().replace(/[^a-z]/g, '');
  return word;
}

function collectBullets(cv: CVData): { text: string; role: string }[] {
  const out: { text: string; role: string }[] = [];
  for (const role of cv.experience ?? []) {
    const label = [role.jobTitle, role.company].filter(Boolean).join(' @ ') || 'Unknown Role';
    for (const b of role.responsibilities ?? []) {
      if (typeof b === 'string' && b.trim()) out.push({ text: b.trim(), role: label });
    }
  }
  for (const proj of cv.projects ?? []) {
    const label = proj.name || 'Project';
    for (const b of proj.bullets ?? []) {
      if (typeof b === 'string' && b.trim()) out.push({ text: b.trim(), role: label });
    }
  }
  return out;
}

// ── Main export ────────────────────────────────────────────────────────────────

export function scoreVerbVariety(cv: CVData): VerbVarietyReport {
  const bullets = collectBullets(cv);
  const totalBullets = bullets.length;

  if (totalBullets === 0) {
    return { score: 0, uniqueVerbCount: 0, totalBullets: 0, uniqueVerbRatio: 0,
             overusedVerbs: [], weakVerbInstances: [], topVerbs: [], fixableBulletCount: 0 };
  }

  // Build frequency map
  const verbMap = new Map<string, { text: string; role: string }[]>();
  for (const b of bullets) {
    const v = extractStartingVerb(b.text);
    if (!v || v.length < 3) continue;
    if (!verbMap.has(v)) verbMap.set(v, []);
    verbMap.get(v)!.push(b);
  }

  const uniqueVerbCount  = verbMap.size;
  const uniqueVerbRatio  = uniqueVerbCount / totalBullets;

  // Top verbs
  const topVerbs = [...verbMap.entries()]
    .map(([verb, arr]) => ({ verb, count: arr.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Overused verbs (3+ times)
  const overusedVerbs: OverusedVerb[] = [...verbMap.entries()]
    .filter(([, arr]) => arr.length >= 3)
    .map(([verb, arr]) => ({
      verb,
      count: arr.length,
      synonyms: VERB_SYNONYMS[verb] ?? [],
      bullets: arr,
    }))
    .sort((a, b) => b.count - a.count);

  // Weak verbs
  const weakVerbInstances: { verb: string; count: number }[] = [...verbMap.entries()]
    .filter(([verb]) => WEAK_VERBS.has(verb))
    .map(([verb, arr]) => ({ verb, count: arr.length }))
    .sort((a, b) => b.count - a.count);

  // Fixable bullet count = overused bullets (all except first occurrence of each)
  const fixableBulletCount = overusedVerbs.reduce((s, ov) => s + Math.max(0, ov.count - 1), 0);

  // ── Score calculation ──────────────────────────────────────────────────────

  // Variety score: ideal ratio is ≥0.75 (unique verbs / total bullets)
  const varietyScore = Math.min(100, Math.round((uniqueVerbRatio / 0.75) * 85 + (uniqueVerbCount >= 10 ? 15 : uniqueVerbCount * 1.5)));

  // Overuse penalty: each overused verb (3+ times) costs points
  const worstCount = overusedVerbs[0]?.count ?? 0;
  const overusePenalty = Math.min(40, overusedVerbs.length * 6 + Math.max(0, worstCount - 3) * 4);

  // Weak verb penalty
  const weakCount = weakVerbInstances.reduce((s, w) => s + w.count, 0);
  const weakPenalty = Math.min(20, weakCount * 4);

  const score = Math.max(0, Math.min(100, varietyScore - overusePenalty - weakPenalty));

  return { score, uniqueVerbCount, totalBullets, uniqueVerbRatio, overusedVerbs,
           weakVerbInstances, topVerbs, fixableBulletCount };
}
