/**
 * S1 — Rule Registry client.
 *
 * Fetches the active rule configs from the cv-engine-worker and caches them
 * in localStorage (1h TTL). Provides an evaluator that picks the right
 * scenario for a given profile, optionally using A/B weights from the registry.
 *
 * The evaluator runs ENTIRELY client-side using cached data — zero added
 * latency on the generation critical path.
 *
 * Public API:
 *   prefetchRuleConfigs()                — fire-and-forget boot preload
 *   getRuleConfigs()                     — returns cached list (fetches if stale)
 *   evaluateScenario(stats)              — returns { scenario, ruleKey, ruleId, abGroup }
 *   invalidateRuleCache()                — clears localStorage entry
 */

const WORKER_URL = import.meta.env.VITE_CV_ENGINE_URL ?? '';
const CACHE_KEY  = 'procv:rule_registry';
const CACHE_TTL  = 60 * 60 * 1000; // 1 hour

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RuleConditions {
  hasExperience:  boolean | null;
  hasProjects:    boolean | null;
  totalMonthsMin: number  | null;
  totalMonthsMax: number  | null;
  pivotRequired:  boolean | null;
}

export interface RuleConfig {
  id: number;
  ruleKey: string;
  version: number;
  conditions: RuleConditions;
  abWeight: number;
  notes: string;
  createdAt: number;
}

export interface EvaluateResult {
  /** Scenario letter: 'A' | 'B' | 'C' | 'D' | 'standard' | 'pivot' */
  scenario: string;
  /** Full rule key e.g. 'scenario:B' */
  ruleKey: string;
  /** D1 row ID of the winning rule */
  ruleId: number | null;
  /** A/B group string e.g. 'scenario:B:v2' — recorded in the generation trace */
  abGroup: string;
  /** Source: 'registry' (config-driven) or 'fallback' (hardcoded logic) */
  source: 'registry' | 'fallback';
}

export interface ProfileStats {
  hasExperience: boolean;
  hasProjects: boolean;
  totalMonths: number;
  pivotDetected: boolean;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  rules: RuleConfig[];
  fetchedAt: number;
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(entry.rules) || !entry.fetchedAt) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(rules: RuleConfig[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rules, fetchedAt: Date.now() }));
  } catch { /* quota exceeded */ }
}

// ─── Network fetch ────────────────────────────────────────────────────────────

async function fetchFromWorker(): Promise<RuleConfig[]> {
  if (!WORKER_URL) return [];
  const res = await fetch(`${WORKER_URL}/api/cv/rule-registry`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`rule-registry HTTP ${res.status}`);
  const data = await res.json() as { rules: RuleConfig[] };
  return data.rules ?? [];
}

let _inFlight: Promise<RuleConfig[]> | null = null;

export async function getRuleConfigs(): Promise<RuleConfig[]> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.rules;

  if (!_inFlight) {
    _inFlight = fetchFromWorker()
      .then(rules => { writeCache(rules); return rules; })
      .catch(() => readCache()?.rules ?? [])
      .finally(() => { _inFlight = null; });
  }
  return _inFlight;
}

export function prefetchRuleConfigs(): void {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return;
  void getRuleConfigs();
}

export function invalidateRuleCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

/**
 * Synchronous read — returns whatever is in localStorage right now.
 * Returns [] if nothing is cached yet. Used on the generation critical
 * path so we never block with an await for rule selection.
 */
export function getCachedRuleConfigsSync(): RuleConfig[] {
  return readCache()?.rules ?? [];
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

/**
 * Evaluates the rule registry configs against the given profile stats.
 * Falls back to the hardcoded detectScenario() logic if the registry is
 * empty or unreachable.
 *
 * A/B selection: if multiple active variants of the same scenario exist
 * (each with a weight), a weighted random pick determines the winner.
 */
export function evaluateScenario(
  stats: ProfileStats,
  rules: RuleConfig[]
): EvaluateResult {
  if (rules.length === 0) {
    return fallback(stats);
  }

  // Filter rules whose conditions match the profile
  const candidates: Array<RuleConfig & { score: number }> = [];

  for (const rule of rules) {
    const c = rule.conditions;
    const expOk   = c.hasExperience  === null || c.hasExperience  === stats.hasExperience;
    const projOk  = c.hasProjects    === null || c.hasProjects    === stats.hasProjects;
    const pivotOk = c.pivotRequired  === null || c.pivotRequired  === stats.pivotDetected;
    const minOk   = c.totalMonthsMin === null || stats.totalMonths >= c.totalMonthsMin;
    const maxOk   = c.totalMonthsMax === null || stats.totalMonths <= c.totalMonthsMax;

    if (expOk && projOk && pivotOk && minOk && maxOk) {
      candidates.push({ ...rule, score: Math.random() * rule.abWeight });
    }
  }

  if (candidates.length === 0) return fallback(stats);

  // Pick highest score (weighted random A/B)
  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];

  // Extract the scenario letter from the key (e.g. 'scenario:B' → 'B')
  const scenario = winner.ruleKey.replace('scenario:', '');

  return {
    scenario,
    ruleKey: winner.ruleKey,
    ruleId: winner.id,
    abGroup: `${winner.ruleKey}:v${winner.version}`,
    source: 'registry',
  };
}

// ─── Hardcoded fallback (mirrors detectScenario v2.3) ────────────────────────

function fallback(stats: ProfileStats): EvaluateResult {
  let scenario: string;
  if (stats.pivotDetected) {
    scenario = 'pivot';
  } else if (!stats.hasExperience && !stats.hasProjects) {
    scenario = 'A';
  } else if (!stats.hasExperience && stats.hasProjects) {
    scenario = 'C';
  } else if (stats.hasExperience && stats.totalMonths < 6) {
    scenario = 'D';
  } else if (stats.hasExperience && !stats.hasProjects) {
    scenario = 'B';
  } else {
    scenario = 'standard';
  }
  return {
    scenario,
    ruleKey: `scenario:${scenario}`,
    ruleId: null,
    abGroup: `scenario:${scenario}:fallback`,
    source: 'fallback',
  };
}
