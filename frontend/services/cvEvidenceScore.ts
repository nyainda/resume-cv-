/**
 * cvEvidenceScore.ts
 *
 * Evidence Score — zero LLM, pure deterministic.
 *
 * For every skill listed in cv.skills, classifies how strongly it is
 * backed up by the experience bullets on a 4-level ladder:
 *
 *   mentioned (1 pt)  — skill in the skills list but not in any bullet
 *   applied   (2 pts) — skill appears inside at least one experience bullet
 *   measured  (3 pts) — appears in a bullet that also contains a metric
 *   result    (4 pts) — appears in a bullet with a metric + an outcome verb
 *
 * Overall Evidence Score = (sum of points / max possible) × 100
 */

import type { CVData } from '../types';

// ── Public types ──────────────────────────────────────────────────────────────

export type EvidenceLevel = 'result' | 'measured' | 'applied' | 'mentioned';

export interface SkillEvidence {
  skill: string;            // original text from cv.skills
  level: EvidenceLevel;
  exampleBullet?: string;   // best supporting bullet (truncated to 120 chars)
}

export interface EvidenceScoreReport {
  score: number;             // 0–100
  skills: SkillEvidence[];   // per-skill breakdown, sorted by level desc
  resultCount: number;       // skills with result-level evidence
  measuredCount: number;
  appliedCount: number;
  mentionedCount: number;
  totalSkills: number;
}

// ── Detection constants ───────────────────────────────────────────────────────

/** Matches any concrete metric: 40%, 3K, 2M, 10x, 5+ */
const METRIC_RX = /\b\d[\d,.]*\s*(%|K|M|B|x|×|\+\s*(?:years?|hrs?|hours?|days?|months?)?)\b|\d[\d,.]*\s*percent/i;

/** Words that signal a measurable outcome or business result.
 *  Includes past tense, gerunds (-ing), and noun forms so that bullets like
 *  "Built X using React, improving throughput by 3×" correctly reach 'result'.
 */
const OUTCOME_VERBS = new Set([
  // Past tense
  'reduced', 'increased', 'improved', 'saved', 'grew', 'achieved', 'delivered',
  'won', 'secured', 'raised', 'boosted', 'accelerated', 'cut', 'eliminated',
  'generated', 'drove', 'streamlined', 'optimized', 'optimised', 'expanded',
  'scaled', 'doubled', 'tripled', 'halved', 'exceeded', 'surpassed',
  'outperformed', 'recovered', 'deployed', 'released', 'shipped', 'launched',
  'automated', 'migrated', 'consolidated', 'standardised', 'standardized',
  'restructured', 'overhauled', 'transformed', 'enabled', 'accelerated',
  // Gerunds / present participles (-ing) — critical for result clauses
  'reducing', 'increasing', 'improving', 'saving', 'growing', 'achieving',
  'delivering', 'winning', 'generating', 'driving', 'streamlining', 'optimizing',
  'optimising', 'expanding', 'scaling', 'exceeding', 'surpassing', 'recovering',
  'deploying', 'releasing', 'shipping', 'launching', 'enabling', 'eliminating',
  'cutting', 'boosting', 'accelerating', 'automating', 'migrating',
  'consolidating', 'transforming', 'restructuring', 'overhauling',
  // Noun forms
  'reduction', 'increase', 'improvement', 'saving', 'savings', 'growth',
  'achievement', 'delivery', 'efficiency', 'performance', 'productivity',
  'reliability', 'accuracy', 'compliance', 'security', 'retention',
  'adoption', 'conversion', 'engagement', 'throughput', 'uptime', 'revenue',
  'profit', 'ROI', 'roi', 'cost', 'latency', 'coverage', 'capacity',
]);

/** Structural before/after and causal patterns that prove a result */
const RESULT_PATTERN_RX = /\bfrom\s+\$?\d.*?\bto\s+\$?\d|\bby\s+\d[\d,.]*\s*%|\bresulting\s+in\b|\bsaving\s+\d|\bleading\s+to\b|\bdown\s+from\b|\bup\s+from\b/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalises a skill string for bullet matching:
 * strips parenthetical level indicators like "(Advanced)", lowercases,
 * and collapses whitespace.
 */
function normalizeSkill(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '')         // remove "(Advanced)", "(Proficient)"
    .replace(/[^a-z0-9\s+#.\-/]/g, ' ')   // keep code-relevant chars: C++, .NET, C#
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a case-insensitive whole-word regex for a normalised skill.
 * Short skills (≤ 3 chars, e.g. "R", "Go", "SQL") get looser matching
 * to avoid missing them inside compound words.
 */
function buildSkillRegex(norm: string): RegExp {
  const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (norm.length <= 3) return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, 'i');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

/** Returns true when the bullet text contains an outcome / result signal. */
function bulletHasResult(bullet: string): boolean {
  if (RESULT_PATTERN_RX.test(bullet)) return true;
  const words = bullet.toLowerCase().split(/\W+/);
  return words.some(w => OUTCOME_VERBS.has(w));
}

// ── Scoring ladder ─────────────────────────────────────────────────────────────

const LEVEL_POINTS: Record<EvidenceLevel, number> = {
  result: 4, measured: 3, applied: 2, mentioned: 1,
};

const LEVEL_ORDER: EvidenceLevel[] = ['result', 'measured', 'applied', 'mentioned'];

// ── Main export ───────────────────────────────────────────────────────────────

export function scoreEvidenceStrength(cv: CVData): EvidenceScoreReport {
  const rawSkills = cv.skills ?? [];

  if (rawSkills.length === 0) {
    return {
      score: 0, skills: [], resultCount: 0, measuredCount: 0,
      appliedCount: 0, mentionedCount: 0, totalSkills: 0,
    };
  }

  // Collect every bullet from experience roles
  const allBullets: string[] = [];
  for (const role of cv.experience ?? []) {
    for (const b of role.responsibilities ?? []) {
      if (typeof b === 'string' && b.trim()) allBullets.push(b.trim());
    }
  }
  // Also cover project bullets
  for (const proj of cv.projects ?? []) {
    for (const b of proj.bullets ?? []) {
      if (typeof b === 'string' && b.trim()) allBullets.push(b.trim());
    }
  }

  // Deduplicate skills (case-insensitive)
  const seenNorm = new Set<string>();
  const uniqueSkills: string[] = [];
  for (const s of rawSkills) {
    if (typeof s !== 'string' || !s.trim()) continue;
    const n = normalizeSkill(s);
    if (n && !seenNorm.has(n)) { seenNorm.add(n); uniqueSkills.push(s); }
  }

  let totalPoints = 0;
  const skillResults: SkillEvidence[] = [];

  for (const skill of uniqueSkills) {
    const norm = normalizeSkill(skill);
    if (!norm) continue;
    const rx = buildSkillRegex(norm);

    let bestLevel: EvidenceLevel = 'mentioned';
    let exampleBullet: string | undefined;

    for (const bullet of allBullets) {
      if (!rx.test(bullet)) continue;

      const hasMetric = METRIC_RX.test(bullet);
      const hasResult = hasMetric && bulletHasResult(bullet);
      const level: EvidenceLevel = hasResult ? 'result' : hasMetric ? 'measured' : 'applied';

      if (LEVEL_POINTS[level] > LEVEL_POINTS[bestLevel]) {
        bestLevel = level;
        exampleBullet = bullet.length > 120 ? bullet.slice(0, 117) + '…' : bullet;
      }
      if (bestLevel === 'result') break; // can't do better
    }

    totalPoints += LEVEL_POINTS[bestLevel];
    skillResults.push({ skill, level: bestLevel, exampleBullet });
  }

  // Sort: result → measured → applied → mentioned
  skillResults.sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));

  const maxPoints = uniqueSkills.length * 4;
  const score = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  return {
    score,
    skills: skillResults,
    resultCount:   skillResults.filter(s => s.level === 'result').length,
    measuredCount: skillResults.filter(s => s.level === 'measured').length,
    appliedCount:  skillResults.filter(s => s.level === 'applied').length,
    mentionedCount: skillResults.filter(s => s.level === 'mentioned').length,
    totalSkills: uniqueSkills.length,
  };
}
