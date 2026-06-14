/**
 * cvAchievementDensity.ts
 *
 * Achievement Density Score — zero LLM, pure deterministic.
 *
 * Classifies every experience bullet as an "achievement" or a "duty"
 * and reports the ratio:
 *
 *   Achievement Density = achievement bullets / total bullets × 100
 *
 * A bullet is an ACHIEVEMENT when it contains:
 *   - A concrete metric (number, %, K, M, B, x), OR
 *   - A before/after or causal result pattern, OR
 *   - A strong impact opener (Built, Launched, Delivered…) + at least
 *     one outcome word in the same bullet
 *
 * A bullet is a DUTY/RESPONSIBILITY when:
 *   - It starts with a duty phrase (Responsible for, Assisted with…), OR
 *   - It's purely descriptive with no metric and no outcome language
 *
 * Scoring bands (from roadmap):
 *   0–30%   Weak
 *   30–60%  Good
 *   60–80%  Strong
 *   80%+    Excellent
 */

import type { CVData } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BulletKind = 'achievement' | 'duty';

export interface ClassifiedBullet {
  text: string;
  kind: BulletKind;
  reason: string;   // short explanation for the UI
  role: string;     // "Job Title @ Company"
}

export interface AchievementDensityReport {
  score: number;              // 0–100 (= density %)
  band: 'excellent' | 'strong' | 'good' | 'weak';
  bandLabel: string;
  achievementCount: number;
  dutyCount: number;
  totalBullets: number;
  bullets: ClassifiedBullet[];  // all bullets, classified
  roleBreakdown: RoleBreakdown[];
}

export interface RoleBreakdown {
  role: string;
  achievementCount: number;
  dutyCount: number;
  total: number;
  density: number; // 0–100
}

// ── Detection patterns ────────────────────────────────────────────────────────

/** Concrete numeric metric — most reliable achievement signal */
const METRIC_RX = /\b\d[\d,.]*\s*(%|K|M|B|x|×|\+\s*(?:years?|hrs?|hours?|days?|months?)?)\b|\d[\d,.]*\s*percent/i;

/** Before/after and causal patterns */
const RESULT_PATTERN_RX = /\bfrom\s+\$?\d.*?\bto\s+\$?\d|\bby\s+\d[\d,.]*\s*%|\bresulting\s+in\b|\bsaving\s+\d|\bleading\s+to\b|\bdown\s+from\b|\bup\s+from\b/i;

/**
 * Strong impact openers — verbs that typically begin achievement bullets.
 * These alone are not enough; the bullet must also contain an outcome word.
 */
const IMPACT_OPENER_RX = /^(built|created|designed|developed|launched|delivered|drove|generated|secured|won|saved|reduced|increased|improved|led|deployed|released|shipped|achieved|exceeded|surpassed|grew|expanded|scaled|negotiated|closed|raised|recovered|rebuilt|re-engineered|re-designed|overhauled|transformed|automated|migrated|established|founded|pioneered|introduced|rolled\s+out|implemented|executed|completed|finished|produced|published|authored|wrote|presented|trained|hired|managed)\b/i;

/**
 * Outcome words that, combined with an impact opener, confirm an achievement.
 */
const OUTCOME_WORDS_RX = /\b(result|outcome|impact|success|revenue|cost|time|efficiency|performance|productivity|quality|growth|reduction|saving|improvement|increase|decrease|gain|loss|ROI|profit|churn|retention|conversion|engagement|adoption|throughput|latency|uptime|downtime|coverage|capacity|scale|reach|audience|team|client|customer|user|deal|contract|award|certification|record|target|goal|deadline|budget|headcount)\b/i;

/**
 * Duty / responsibility openers — strong signal that this is a job description,
 * not an achievement.
 */
const DUTY_OPENER_RX = /^(responsible\s+for|assist(?:ed|ing)?\s+(?:with|in|the)|help(?:ed|ing)?\s+(?:with|to)|maintain(?:ed|ing)?(?:\s+the|\s+and)?|support(?:ed|ing)?\s+(?:the|a)?|work(?:ed|ing)?\s+on|participat(?:ed|ing)?\s+in|contribut(?:ed|ing)?\s+to|involv(?:ed|ing)?\s+in|task(?:ed)?\s+with|part\s+of|member\s+of|ensur(?:ed|ing)?(?:\s+the)?|provid(?:ed|ing)?(?:\s+the)?|coordinat(?:ed|ing)?(?:\s+the)?)\b/i;

/** Passive voice opener — usually a duty indicator */
const PASSIVE_OPENER_RX = /^(was|were|been|being|is\s+responsible)\b/i;

// ── Classification ─────────────────────────────────────────────────────────────

function classifyBullet(text: string): { kind: BulletKind; reason: string } {
  const t = text.trim();
  if (!t) return { kind: 'duty', reason: 'Empty bullet' };

  // 1. Metric present — strongest achievement signal
  if (METRIC_RX.test(t)) {
    return { kind: 'achievement', reason: 'Contains a concrete metric' };
  }

  // 2. Before/after or causal result pattern
  if (RESULT_PATTERN_RX.test(t)) {
    return { kind: 'achievement', reason: 'Shows a before/after result' };
  }

  // 3. Duty opener — override any other signals
  if (DUTY_OPENER_RX.test(t)) {
    return { kind: 'duty', reason: 'Starts with a duty/responsibility phrase' };
  }

  // 4. Passive opener — duty
  if (PASSIVE_OPENER_RX.test(t)) {
    return { kind: 'duty', reason: 'Passive construction — describes a state, not an action' };
  }

  // 5. Impact opener + outcome word → achievement even without a number
  if (IMPACT_OPENER_RX.test(t) && OUTCOME_WORDS_RX.test(t)) {
    return { kind: 'achievement', reason: 'Strong action verb with outcome context' };
  }

  // Default: duty (needs a metric or result to be an achievement)
  return { kind: 'duty', reason: 'No metric or measurable outcome found' };
}

// ── Band helper ────────────────────────────────────────────────────────────────

function scoreToBand(score: number): AchievementDensityReport['band'] {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'strong';
  if (score >= 30) return 'good';
  return 'weak';
}

const BAND_LABELS: Record<AchievementDensityReport['band'], string> = {
  excellent: 'Excellent',
  strong:    'Strong',
  good:      'Good',
  weak:      'Weak',
};

// ── Main export ────────────────────────────────────────────────────────────────

export function scoreAchievementDensity(cv: CVData): AchievementDensityReport {
  const bullets: ClassifiedBullet[] = [];
  const roleBreakdown: RoleBreakdown[] = [];

  for (const role of cv.experience ?? []) {
    const roleLabel = [role.jobTitle, role.company].filter(Boolean).join(' @ ') || 'Unknown Role';
    const bs = role.responsibilities ?? [];
    let roleAchievements = 0;
    let roleDuties = 0;

    for (const b of bs) {
      if (typeof b !== 'string' || !b.trim()) continue;
      const { kind, reason } = classifyBullet(b);
      bullets.push({ text: b.trim(), kind, reason, role: roleLabel });
      if (kind === 'achievement') roleAchievements++;
      else roleDuties++;
    }

    if (roleAchievements + roleDuties > 0) {
      const total = roleAchievements + roleDuties;
      roleBreakdown.push({
        role: roleLabel,
        achievementCount: roleAchievements,
        dutyCount: roleDuties,
        total,
        density: Math.round((roleAchievements / total) * 100),
      });
    }
  }

  const achievementCount = bullets.filter(b => b.kind === 'achievement').length;
  const dutyCount        = bullets.filter(b => b.kind === 'duty').length;
  const totalBullets     = bullets.length;
  const score            = totalBullets > 0 ? Math.round((achievementCount / totalBullets) * 100) : 0;
  const band             = scoreToBand(score);

  return {
    score,
    band,
    bandLabel: BAND_LABELS[band],
    achievementCount,
    dutyCount,
    totalBullets,
    bullets,
    roleBreakdown,
  };
}
