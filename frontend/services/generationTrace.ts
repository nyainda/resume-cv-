/**
 * GenerationTrace — lightweight audit trail for every CV generation.
 *
 * Answers the question: "Why did this CV look this way?"
 * Attached to CVData as `_trace` (optional field, never sent to PDF renderer).
 * Stored in localStorage under 'procv:last_trace' for debug inspection.
 */

import type { CVData } from '../types';
import type { FieldDetectionSource } from './cvPromptHelpers';

// ─── Data model ──────────────────────────────────────────────────────────────

export interface ValidationViolation {
  ruleId: string;
  severity: 'block' | 'warn';
  location: string;
  message: string;
  repaired: boolean;
}

export interface GenerationTrace {
  traceId: string;
  timestamp: string;
  rulesVersion: string;
  /** S4: active prompt version numbers at time of generation, e.g. { summary: 14, experience: 9 } */
  promptVersions?: Record<string, number>;

  scenario: string;
  scenarioEvidence: {
    hasExperience: boolean;
    hasProjects: boolean;
    pivotDetected: boolean;
    pivotFrom?: string[];
    pivotTo?: string[];
  };

  seniority: string;
  field: string;
  voice: string;
  verbPoolSample: string[];

  narrativeAngle: string;
  structuralExampleFound: boolean;

  gapKeywords: string[];
  pinnedKeywords: string[];
  llmCacheHit: boolean;

  /**
   * S6: how the field was chosen for this generation run.
   * - 'user-pinned'   — user explicitly selected a field via the ontology dropdown
   * - 'auto-detected' — keyword scorer chose the field; score is the winning confidence
   */
  fieldSource?: FieldDetectionSource;

  /** S1: Rule Registry — which rule variant drove scenario selection */
  ruleKey?: string;        // e.g. 'scenario:B'
  ruleId?: number | null;  // D1 row ID of the winning rule
  abGroup?: string;        // e.g. 'scenario:B:v2' — for telemetry correlation
  ruleSource?: 'registry' | 'fallback'; // did registry serve or did we use the compiled default?

  validationViolations: ValidationViolation[];
  repairApplied: boolean;
  validationPassed: boolean;

  timings: {
    briefMs?: number;
    generationMs?: number;
    validationMs?: number;
    totalMs?: number;
    startedAt: number;
  };
}

// ─── Mutable builder used during generation ───────────────────────────────────

export type TraceBuilder = {
  record: (patch: Partial<GenerationTrace>) => void;
  recordTimingMark: (key: 'briefMs' | 'generationMs' | 'validationMs') => void;
  finalize: (violations: ValidationViolation[], repairApplied: boolean, validationPassed: boolean) => GenerationTrace;
};

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function startTrace(rulesVersion: string, narrativeAngle: string, pinnedKeywords: string[]): TraceBuilder {
  const startedAt = performance.now();
  const marks: Record<string, number> = {};

  const trace: GenerationTrace = {
    traceId: uuid(),
    timestamp: new Date().toISOString(),
    rulesVersion,
    scenario: 'standard',
    scenarioEvidence: { hasExperience: false, hasProjects: false, pivotDetected: false },
    seniority: '',
    field: '',
    voice: '',
    verbPoolSample: [],
    narrativeAngle,
    structuralExampleFound: false,
    gapKeywords: [],
    pinnedKeywords,
    llmCacheHit: false,
    validationViolations: [],
    repairApplied: false,
    validationPassed: true,
    timings: { startedAt },
  };

  return {
    record(patch) {
      Object.assign(trace, patch);
      if (patch.scenarioEvidence) {
        Object.assign(trace.scenarioEvidence, patch.scenarioEvidence);
      }
    },

    recordTimingMark(key) {
      const elapsed = Math.round(performance.now() - (marks[key + '_start'] ?? startedAt));
      marks[key] = elapsed;
      (trace.timings as Record<string, number>)[key] = elapsed;
      marks[key + '_start'] = performance.now();
    },

    finalize(violations, repairApplied, validationPassed) {
      trace.validationViolations = violations;
      trace.repairApplied = repairApplied;
      trace.validationPassed = validationPassed;
      trace.timings.totalMs = Math.round(performance.now() - startedAt);
      return { ...trace };
    },
  };
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

const TRACE_KEY = 'procv:last_trace';

export function storeTrace(trace: GenerationTrace): void {
  try {
    localStorage.setItem(TRACE_KEY, JSON.stringify(trace));
  } catch {
    // Ignore storage errors (quota exceeded, private mode)
  }
}

export function getLastTrace(): GenerationTrace | null {
  try {
    const raw = localStorage.getItem(TRACE_KEY);
    return raw ? (JSON.parse(raw) as GenerationTrace) : null;
  } catch {
    return null;
  }
}

// ─── Attach trace to CVData (strips _trace key before PDF export) ─────────────

export function attachTrace(cv: CVData, trace: GenerationTrace): CVData {
  return { ...cv, _trace: trace } as CVData & { _trace: GenerationTrace };
}

export function detachTrace(cv: CVData): { cv: CVData; trace: GenerationTrace | null } {
  const raw = cv as CVData & { _trace?: GenerationTrace };
  const trace = raw._trace ?? null;
  const { _trace: _removed, ...rest } = raw as CVData & { _trace?: GenerationTrace };
  return { cv: rest as CVData, trace };
}
