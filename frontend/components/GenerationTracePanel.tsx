/**
 * GenerationTracePanel — S5 Phase 2 (Trace Viewer UI)
 *
 * Answers: "Why did this CV look this way?"
 * Displayed as a collapsible debug panel below the CV preview in CVGenerator.
 * Only renders when the current CV has a _trace attached.
 *
 * Shows:
 *   • Scenario (A/B/C/D/standard) + evidence flags
 *   • Seniority, field, voice classification
 *   • Narrative angle picked + angle history LRU reason
 *   • Verb pool sample (the 12 verbs used in this generation)
 *   • ATS gap keywords that were pinned
 *   • Structural example hit/miss
 *   • Validation violations + whether auto-repair fired
 *   • Timing breakdown (brief / generation / validation / total)
 */

import React, { useState } from 'react';
import type { GenerationTrace, ValidationViolation } from '../services/generationTrace';
import type { FieldDetectionSource } from '../services/cvPromptHelpers';

interface GenerationTracePanelProps {
  trace: GenerationTrace;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ms(n?: number): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'zinc' | 'teal';
}) {
  const cls: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    zinc: 'bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-neutral-600',
    teal: 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${cls[color]}`}>
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-zinc-100 dark:border-neutral-700 last:border-0">
      <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 w-36 flex-shrink-0 pt-0.5">{label}</span>
      <div className="flex flex-wrap gap-1 items-center text-[11px] text-zinc-700 dark:text-zinc-300 min-w-0">{children}</div>
    </div>
  );
}

function TimingBar({ briefMs, generationMs, validationMs, totalMs }: {
  briefMs?: number; generationMs?: number; validationMs?: number; totalMs?: number;
}) {
  const total = totalMs ?? 1;
  const bar = (n: number | undefined, color: string, label: string) => {
    if (!n) return null;
    const pct = Math.round((n / total) * 100);
    return (
      <div className="flex items-center gap-1.5">
        <div className={`h-2.5 rounded-sm ${color} min-w-[4px]`} style={{ width: `${Math.max(pct, 2)}%` }} title={`${label}: ${ms(n)}`} />
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{label} {ms(n)}</span>
      </div>
    );
  };
  return (
    <div className="mt-2 space-y-1">
      {bar(briefMs, 'bg-blue-400', 'Brief')}
      {bar(generationMs, 'bg-violet-400', 'Generation')}
      {bar(validationMs, 'bg-teal-400', 'Validation')}
    </div>
  );
}

function FieldSourceBadge({ source }: { source: FieldDetectionSource | undefined }) {
  const [tip, setTip] = React.useState(false);

  if (!source) return <Badge color="zinc">—</Badge>;

  if (source.kind === 'user-pinned') {
    return (
      <span className="flex items-center gap-1">
        <Badge color="teal">📌 user-pinned</Badge>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">(S6 ontology — dropdown overrides scoring)</span>
      </span>
    );
  }

  const { score, evidence } = source;
  const confidenceColor: 'green' | 'amber' | 'zinc' =
    score >= 15 ? 'green' : score >= 5 ? 'amber' : 'zinc';
  const confidenceLabel =
    score >= 15 ? 'high confidence' : score >= 5 ? 'low confidence' : 'fallback';

  return (
    <span className="flex items-center gap-1.5 relative">
      <Badge color={confidenceColor}>🔍 auto-detected</Badge>
      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
        score: {score} — {confidenceLabel}
      </span>
      {evidence && evidence.length > 0 && (
        <span className="relative inline-block">
          <button
            type="button"
            onClick={() => setTip(t => !t)}
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-zinc-200 dark:bg-neutral-600 text-zinc-500 dark:text-zinc-400 text-[9px] font-bold hover:bg-zinc-300 dark:hover:bg-neutral-500 transition-colors cursor-pointer select-none leading-none"
            title="Why this field?"
            aria-label="Show field detection evidence"
          >
            ?
          </button>
          {tip && (
            <div className="absolute left-0 top-5 z-50 w-72 rounded-lg border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 shadow-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Why this field?</span>
                <button
                  type="button"
                  onClick={() => setTip(false)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 leading-none"
                  aria-label="Close"
                >✕</button>
              </div>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-2">
                Signals that contributed to the score (higher = stronger match):
              </p>
              <ul className="space-y-0.5">
                {evidence.slice(0, 12).map((line, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px]">
                    <span className="text-zinc-300 dark:text-zinc-600 flex-shrink-0 mt-0.5">›</span>
                    <span className="font-mono text-zinc-600 dark:text-zinc-300 break-all">{line}</span>
                  </li>
                ))}
                {evidence.length > 12 && (
                  <li className="text-[10px] text-zinc-400 dark:text-zinc-500 pl-3">
                    +{evidence.length - 12} more signals…
                  </li>
                )}
              </ul>
              <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-neutral-700 text-[10px] text-zinc-400 dark:text-zinc-500">
                Total score: <span className="font-semibold text-zinc-600 dark:text-zinc-300">{score}</span>
                {score >= 15 ? ' — strong match' : score >= 5 ? ' — weak match, consider pinning field' : ' — no signal, defaulted to "general"'}
              </div>
            </div>
          )}
        </span>
      )}
    </span>
  );
}

function ViolationList({ violations }: { violations: ValidationViolation[] }) {
  if (violations.length === 0) {
    return <span className="text-[11px] text-green-600 dark:text-green-400 font-medium">✓ All rules passed</span>;
  }
  return (
    <div className="space-y-0.5 w-full">
      {violations.map((v, i) => (
        <div key={i} className="flex items-start gap-1.5 text-[11px]">
          <span className={v.severity === 'block' ? 'text-rose-500' : 'text-amber-500'}>
            {v.severity === 'block' ? '⛔' : '⚠'}
          </span>
          <span className="text-zinc-600 dark:text-zinc-400">
            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">[{v.ruleId}]</span>{' '}
            {v.message}
            {v.repaired && <span className="ml-1 text-green-600 dark:text-green-400 font-medium">→ auto-repaired</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const GenerationTracePanel: React.FC<GenerationTracePanelProps> = ({ trace }) => {
  const [open, setOpen] = useState(false);

  const scenarioColor: Record<string, 'blue' | 'teal' | 'violet' | 'amber' | 'zinc'> = {
    A: 'amber', B: 'blue', C: 'teal', D: 'violet', standard: 'zinc',
  };
  const scenarioLabel: Record<string, string> = {
    A: 'A — No exp, no projects',
    B: 'B — Has experience',
    C: 'C — Projects only',
    D: 'D — Thin experience',
    standard: 'Standard',
  };
  const angleColor: Record<string, 'green' | 'blue' | 'teal' | 'violet'> = {
    impact: 'green', process: 'blue', people: 'teal', growth: 'violet',
  };

  const blockCount = trace.validationViolations.filter(v => v.severity === 'block').length;
  const warnCount = trace.validationViolations.filter(v => v.severity === 'warn').length;

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50/70 dark:bg-neutral-800/40 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-100 dark:hover:bg-neutral-700/50 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          {/* Tiny circuit icon */}
          <svg className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="6" height="6" rx="1"/>
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.34 6.34l2.12 2.12M15.54 15.54l2.12 2.12M6.34 17.66l2.12-2.12M15.54 8.46l2.12-2.12" strokeLinecap="round"/>
          </svg>
          <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">Generation Details</span>
          <div className="flex items-center gap-1">
            <Badge color={scenarioColor[trace.scenario] ?? 'zinc'}>
              {trace.scenario.toUpperCase()}
            </Badge>
            <Badge color={angleColor[trace.narrativeAngle] ?? 'zinc'}>
              {trace.narrativeAngle}
            </Badge>
            {trace.repairApplied && <Badge color="amber">repaired</Badge>}
            {blockCount > 0 && <Badge color="rose">{blockCount} block</Badge>}
            {warnCount > 0 && <Badge color="amber">{warnCount} warn</Badge>}
            {trace.validationPassed && blockCount === 0 && !trace.repairApplied && (
              <Badge color="green">✓ passed</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {trace.timings.totalMs != null && (
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">{ms(trace.timings.totalMs)} total</span>
          )}
          <svg
            className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Body — expandable */}
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-zinc-200 dark:border-neutral-700 space-y-0">

          {/* Section: Classification */}
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Classification</p>
            <Row label="Scenario">
              <Badge color={scenarioColor[trace.scenario] ?? 'zinc'}>
                {scenarioLabel[trace.scenario] ?? trace.scenario}
              </Badge>
              {trace.scenarioEvidence.hasExperience && <Badge color="zinc">has exp</Badge>}
              {trace.scenarioEvidence.hasProjects && <Badge color="zinc">has projects</Badge>}
              {trace.scenarioEvidence.pivotDetected && (
                <Badge color="amber">
                  pivot {trace.scenarioEvidence.pivotFrom?.join(',') ?? '?'} → {trace.scenarioEvidence.pivotTo?.join(',') ?? '?'}
                </Badge>
              )}
            </Row>
            <Row label="Seniority">
              <Badge color="blue">{trace.seniority || '—'}</Badge>
            </Row>
            <Row label="Field">
              <Badge color="teal">{trace.field || '—'}</Badge>
            </Row>
            <Row label="Field source">
              <FieldSourceBadge source={trace.fieldSource} />
            </Row>
            <Row label="Voice">
              <Badge color="violet">{trace.voice || '—'}</Badge>
            </Row>
          </div>

          {/* Section: Variance */}
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Variance</p>
            <Row label="Narrative Angle">
              <Badge color={angleColor[trace.narrativeAngle] ?? 'zinc'}>{trace.narrativeAngle}</Badge>
            </Row>
            {trace.verbPoolSample.length > 0 && (
              <Row label="Verb Pool (12)">
                <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400 break-words">
                  {trace.verbPoolSample.join(', ')}
                </span>
              </Row>
            )}
            <Row label="Blueprint">
              {trace.structuralExampleFound
                ? <Badge color="green">✓ D1 hit — calibration injected</Badge>
                : <Badge color="zinc">miss — free generation</Badge>}
            </Row>
          </div>

          {/* Section: ATS */}
          {(trace.gapKeywords.length > 0 || trace.pinnedKeywords.length > 0) && (
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">ATS Gap-Pin</p>
              {trace.pinnedKeywords.length > 0 && (
                <Row label={`Pinned (${trace.pinnedKeywords.length})`}>
                  <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400 break-words">
                    {trace.pinnedKeywords.join(', ')}
                  </span>
                </Row>
              )}
            </div>
          )}

          {/* Section: Rule Registry (S1) */}
          {trace.ruleKey && (
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Rule Registry (S1)</p>
              <Row label="Scenario rule">
                <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400">{trace.abGroup ?? trace.ruleKey}</span>
                {trace.ruleSource === 'registry'
                  ? <Badge color="green">registry</Badge>
                  : <Badge color="zinc">fallback</Badge>}
              </Row>
              {trace.ruleId != null && (
                <Row label="Rule ID">
                  <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">#{trace.ruleId}</span>
                </Row>
              )}
            </div>
          )}

          {/* Section: Prompt Versions (S4) */}
          {trace.promptVersions && Object.keys(trace.promptVersions).length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Prompt Registry (S4)</p>
              <Row label="Versions">
                <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400 break-words">
                  {Object.entries(trace.promptVersions)
                    .map(([k, v]) => `${k}:v${v}`)
                    .join('  ·  ')}
                </span>
              </Row>
            </div>
          )}

          {/* Section: Cache */}
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Cache</p>
            <Row label="LLM Cache">
              {trace.llmCacheHit
                ? <Badge color="green">✓ hit</Badge>
                : <Badge color="zinc">miss</Badge>}
            </Row>
          </div>

          {/* Section: Validation */}
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Validation</p>
            <Row label="Result">
              {trace.validationPassed
                ? <Badge color="green">✓ passed</Badge>
                : <Badge color="rose">failed</Badge>}
              {trace.repairApplied && <Badge color="amber">auto-repair applied</Badge>}
            </Row>
            <div className="mt-1.5 pl-[9.5rem]">
              <ViolationList violations={trace.validationViolations} />
            </div>
          </div>

          {/* Section: Timings */}
          <div className="mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Timings</p>
            <Row label={`Total: ${ms(trace.timings.totalMs)}`}>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                brief {ms(trace.timings.briefMs)} · gen {ms(trace.timings.generationMs)} · validate {ms(trace.timings.validationMs)}
              </span>
            </Row>
            <div className="pl-[9.5rem] mt-1">
              <TimingBar
                briefMs={trace.timings.briefMs}
                generationMs={trace.timings.generationMs}
                validationMs={trace.timings.validationMs}
                totalMs={trace.timings.totalMs}
              />
            </div>
          </div>

          {/* Footer: trace ID + rules version */}
          <div className="pt-2 mt-2 border-t border-zinc-100 dark:border-neutral-700 flex items-center gap-3 text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
            <span>v{trace.rulesVersion}</span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span>{trace.timestamp ? new Date(trace.timestamp).toLocaleString() : '—'}</span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span className="truncate">{trace.traceId}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerationTracePanel;
