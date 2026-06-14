/**
 * cvMetricStrength.ts
 *
 * Metric Strength Score — zero LLM, pure deterministic.
 *
 * Not all numbers are equal. "5 people" is not the same as
 * "reduced costs by $2M" or "cut turnaround from 3 days to 4 hours."
 *
 * For every metric-containing bullet, classifies the strongest metric
 * it contains on a 3-level ladder:
 *
 *   weak   (1 pt) — vague counts, trivial numbers, "100%" (all tasks)
 *   medium (2 pts) — meaningful scope/budget numbers without an outcome
 *   strong (3 pts) — before/after, directional %, revenue/cost/time saved
 *
 * Overall Metric Strength = (sum of pts / max possible) × 100
 * where max possible = total metric-containing bullets × 3.
 *
 * Bullets with no metric at all reduce the score by lowering the
 * "bullets with metrics" ratio, reported separately.
 */

import type { CVData } from '../types';

// ── Public types ──────────────────────────────────────────────────────────────

export type MetricLevel = 'strong' | 'medium' | 'weak';

export interface MetricInstance {
  level: MetricLevel;
  reason: string;
  bullet: string;     // full bullet (truncated to 120 chars)
  role: string;       // "Job Title @ Company"
}

export interface MetricStrengthReport {
  score: number;            // 0–100
  strongCount: number;
  mediumCount: number;
  weakCount: number;
  totalMetrics: number;     // metric-containing bullets
  totalBullets: number;
  metrics: MetricInstance[]; // one entry per metric-containing bullet
}

// ── Detection patterns ────────────────────────────────────────────────────────

/** Matches any numeric value — used to decide if a bullet has ANY metric */
const ANY_NUMBER_RX = /\b\d[\d,.]*/;

// ── STRONG metric patterns ────────────────────────────────────────────────────

/** Dollar amount with scale suffix: $2M, $500K, $1.2B */
const DOLLAR_SCALE_RX = /\$\s*\d[\d,.]*\s*[KMBkmb]\b/;

/** Revenue / profit / cost / savings keywords + any dollar amount */
const REVENUE_DOLLAR_RX = /\b(revenue|profit|ARR|MRR|GMV|cost|costs?|savings?|budget|funding|raised|invested|saved|ROI|EBITDA)\b.*?\$\s*\d|\$\s*\d.*?\b(revenue|profit|ARR|MRR|GMV|cost|savings?|budget|funding|raised|ROI)\b/i;

/** Before/after numeric comparison: "from 3 days to 4 hours", "from 50 to 500" */
const BEFORE_AFTER_RX = /\bfrom\s+\$?\d[\d,.]*\s*(?:days?|hours?|mins?|minutes?|weeks?|months?|years?|K|M|%|x)?\s+to\s+\$?\d/i;

/** Directional verb + % (direction implies improvement/worsening) */
const DIRECTIONAL_PCT_RX = /\b(reduced?|reduction|increased?|increase|improved?|improvement|grew|grown|cut|decreased?|eliminated?|saved?|boosted?|accelerated?|doubled?|tripled?|halved?|grew?|scaled?|raised?|lowered?|drove?|surpassed?|exceeded?)\b[^.]{0,50}\d[\d,.]*\s*%|\d[\d,.]*\s*%[^.]{0,30}\b(reduction|increase|improvement|growth|decrease|savings?|faster|less|more)\b/i;

/** Time efficiency: "X hours/days faster/saved/reduced/less" */
const TIME_EFFICIENCY_RX = /\d[\d,.]*\s*(?:hours?|days?|weeks?|months?)\s*(?:faster|saved|saved\s+per|less|reduction|per\s+(?:week|month|day|year))|saving\s+\d[\d,.]*\s*(?:hours?|days?|weeks?)/i;

/** Multiplier with impact word: "3x faster", "10x growth", "2x revenue" */
const MULTIPLIER_RX = /\d+(?:\.\d+)?\s*[xX×]\s*(?:faster|more|better|increase|growth|improvement|revenue|performance|efficiency|throughput)/i;

/** High-impact percentage ≥ 30% with any directional context */
const HIGH_PCT_RX = /\b([3-9]\d|[1-9]\d{2,})\s*%/;

// ── MEDIUM metric patterns ────────────────────────────────────────────────────

/** Team / headcount with size 5+ */
const TEAM_SIZE_RX = /\b(?:team\s+of|managed?|led?|mentored?|supervised?|hired?|grew\s+(?:a\s+)?team\s+to)\s+(?:[5-9]|\d{2,})\s*(?:engineers?|developers?|people|staff|employees?|members?|reports?|designers?|analysts?|contractors?|FTE|headcount)?/i;

/** Dollar amount without scale, or with scale K */
const DOLLAR_K_RX = /\$\s*\d[\d,.]*(?:K\b)?/;

/** Budget explicitly mentioned */
const BUDGET_RX = /\b(budget|spend|headcount|investment)\b.*?\$?\d[\d,.]*|\$?\d[\d,.]*.*?\b(budget|spend)\b/i;

/** Moderate percentage 10–29% (meaningful but not high-impact) */
const MODERATE_PCT_RX = /\b(1\d|2\d)\s*%/;

/** Count 10+ in a professional context (clients, users, projects, systems, deployments) */
const PRO_COUNT_RX = /\b([1-9]\d{1,})\s*(?:clients?|customers?|users?|accounts?|projects?|products?|features?|services?|deployments?|systems?|integrations?|markets?|countries?|regions?|sites?|locations?|offices?|stores?|partners?|vendors?|stakeholders?)\b/i;

/** Large pure number (1,000+) in any context */
const LARGE_NUMBER_RX = /\b\d{1,3}(?:,\d{3})+\b|\b[1-9]\d{3,}\b/;

// ── WEAK metric patterns ─────────────────────────────────────────────────────

/** 100% — often means "all tasks" not a real metric */
const HUNDRED_PCT_RX = /\b100\s*%/;

/** Time duration without improvement: "for 3 months", "over 2 years" */
const DURATION_ONLY_RX = /\b(?:for|over|across|during)\s+\d+\s*(?:months?|years?|weeks?)\b/i;

/** Very small counts 1–9 with vague nouns */
const SMALL_VAGUE_RX = /\b[1-9]\s*(?:people|persons?|team\s+members?|colleagues?|meetings?|sessions?|calls?|emails?|tickets?|requests?|tasks?|issues?)\b/i;

// ── Classification ─────────────────────────────────────────────────────────────

function classifyBullet(text: string): { level: MetricLevel; reason: string } | null {
  if (!ANY_NUMBER_RX.test(text)) return null;

  // ── STRONG checks ──────────────────────────────────────────────────────────
  if (BEFORE_AFTER_RX.test(text))
    return { level: 'strong', reason: 'Before/after comparison shows concrete transformation' };
  if (DOLLAR_SCALE_RX.test(text))
    return { level: 'strong', reason: 'Dollar amount with scale ($K/$M/$B) signals real business impact' };
  if (REVENUE_DOLLAR_RX.test(text))
    return { level: 'strong', reason: 'Revenue/cost/savings metric tied to a dollar figure' };
  if (DIRECTIONAL_PCT_RX.test(text))
    return { level: 'strong', reason: 'Directional % change (reduced/increased/grew…) proves an outcome' };
  if (TIME_EFFICIENCY_RX.test(text))
    return { level: 'strong', reason: 'Time saved/efficiency gain — shows you made things faster' };
  if (MULTIPLIER_RX.test(text))
    return { level: 'strong', reason: 'Multiplier metric (2x, 10x) shows order-of-magnitude impact' };
  if (HIGH_PCT_RX.test(text) && !HUNDRED_PCT_RX.test(text))
    return { level: 'strong', reason: 'High-impact % (≥30%) signals significant scale or improvement' };

  // ── MEDIUM checks ─────────────────────────────────────────────────────────
  if (TEAM_SIZE_RX.test(text))
    return { level: 'medium', reason: 'Team/headcount size shows scope of responsibility' };
  if (BUDGET_RX.test(text))
    return { level: 'medium', reason: 'Budget/spend mentioned — shows financial accountability' };
  if (DOLLAR_K_RX.test(text))
    return { level: 'medium', reason: 'Dollar amount shows financial relevance (add direction for a stronger signal)' };
  if (MODERATE_PCT_RX.test(text))
    return { level: 'medium', reason: '10–29% change is meaningful; add "reduced/grew" to make it strong' };
  if (PRO_COUNT_RX.test(text))
    return { level: 'medium', reason: 'Professional count (clients, users, projects) shows scope' };
  if (LARGE_NUMBER_RX.test(text))
    return { level: 'medium', reason: 'Large number shows scale; tie it to an outcome for stronger impact' };

  // ── WEAK ──────────────────────────────────────────────────────────────────
  if (HUNDRED_PCT_RX.test(text))
    return { level: 'weak', reason: '"100%" usually means all tasks — replace with a concrete result' };
  if (DURATION_ONLY_RX.test(text))
    return { level: 'weak', reason: 'Time duration ("for 3 months") is context, not an achievement metric' };
  if (SMALL_VAGUE_RX.test(text))
    return { level: 'weak', reason: 'Small count of vague items — add the business impact or scale' };

  // Has a number but no pattern matched → weak by default
  return { level: 'weak', reason: 'Number present but context is too vague to show business impact' };
}

// ── Points ─────────────────────────────────────────────────────────────────────

const LEVEL_POINTS: Record<MetricLevel, number> = { strong: 3, medium: 2, weak: 1 };

// ── Main export ────────────────────────────────────────────────────────────────

export function scoreMetricStrength(cv: CVData): MetricStrengthReport {
  const metrics: MetricInstance[] = [];
  let totalBullets = 0;

  for (const role of cv.experience ?? []) {
    const roleLabel = [role.jobTitle, role.company].filter(Boolean).join(' @ ') || 'Unknown Role';
    for (const b of role.responsibilities ?? []) {
      if (typeof b !== 'string' || !b.trim()) continue;
      totalBullets++;
      const result = classifyBullet(b.trim());
      if (result) {
        metrics.push({
          level: result.level,
          reason: result.reason,
          bullet: b.trim().length > 120 ? b.trim().slice(0, 117) + '…' : b.trim(),
          role: roleLabel,
        });
      }
    }
  }

  // Also check project bullets
  for (const proj of cv.projects ?? []) {
    const roleLabel = proj.name || 'Project';
    for (const b of proj.bullets ?? []) {
      if (typeof b !== 'string' || !b.trim()) continue;
      totalBullets++;
      const result = classifyBullet(b.trim());
      if (result) {
        metrics.push({
          level: result.level,
          reason: result.reason,
          bullet: b.trim().length > 120 ? b.trim().slice(0, 117) + '…' : b.trim(),
          role: roleLabel,
        });
      }
    }
  }

  // Sort: strong → medium → weak
  const ORDER: MetricLevel[] = ['strong', 'medium', 'weak'];
  metrics.sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));

  const strongCount = metrics.filter(m => m.level === 'strong').length;
  const mediumCount = metrics.filter(m => m.level === 'medium').length;
  const weakCount   = metrics.filter(m => m.level === 'weak').length;
  const totalMetrics = metrics.length;

  // Score based on quality of found metrics AND coverage (bullets with metrics vs total)
  let qualityScore = 0;
  if (totalMetrics > 0) {
    const pts = metrics.reduce((s, m) => s + LEVEL_POINTS[m.level], 0);
    qualityScore = Math.round((pts / (totalMetrics * 3)) * 100);
  }

  // Coverage factor: penalise CVs where most bullets have no metric at all
  const coverageRatio = totalBullets > 0 ? totalMetrics / totalBullets : 0;
  const coverageFactor = Math.min(1, coverageRatio / 0.6); // full weight at 60%+ coverage

  const score = Math.round(qualityScore * coverageFactor);

  return { score, strongCount, mediumCount, weakCount, totalMetrics, totalBullets, metrics };
}
