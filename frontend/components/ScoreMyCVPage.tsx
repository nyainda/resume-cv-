/**
 * ScoreMyCVPage.tsx
 *
 * Phase 2.2 — "Score My CV"
 *
 * Composite 6-dimension CV scoring.
 * Signal 1 (Human Voice) is augmented with live banned-phrase data from the
 * CF worker so it reflects the same rules used during generation.
 * Falls back to built-in lists when offline.
 *
 * Dimensions:
 *   1. Human Voice          — scoreHRDetection() + CF banned phrases  0–100
 *   2. Bullet Quality       — inline regex checks                      0–100
 *   3. Career Logic         — auditSeniorityCoherence()                0–100
 *   4. Evidence Score       — scoreEvidenceStrength()                  0–100
 *   5. Achievement Density  — scoreAchievementDensity()                0–100
 *   6. ATS Match            — scoreAtsCoverage() (requires JD)         0–100
 *
 * Composite = simple average of all available dimensions (ATS excluded when
 * no JD is provided). This way adding/removing dimensions never creates
 * confusing score jumps — each is always weighted equally.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { CVData } from '../types';
import { scoreHRDetection } from '../services/hrDetectorSimulation';
import type { HRDetectionResult } from '../services/hrDetectorSimulation';
import { scoreAtsCoverage } from '../services/cvAtsKeywords';
import type { AtsKeywordReport } from '../services/cvAtsKeywords';
import { auditSeniorityCoherence } from '../services/cvSeniorityCoherence';
import type { SeniorityCoherenceReport } from '../services/cvSeniorityCoherence';
import { fetchCFBannedPhrases } from '../services/cvBannedPhrasesClient';
import { scoreEvidenceStrength } from '../services/cvEvidenceScore';
import type { EvidenceScoreReport, EvidenceLevel } from '../services/cvEvidenceScore';
import { scoreAchievementDensity } from '../services/cvAchievementDensity';
import type { AchievementDensityReport } from '../services/cvAchievementDensity';
import { scoreMetricStrength } from '../services/cvMetricStrength';
import type { MetricStrengthReport, MetricLevel } from '../services/cvMetricStrength';
import { scoreVerbVariety } from '../services/cvVerbVariety';
import type { VerbVarietyReport, OverusedVerb } from '../services/cvVerbVariety';
import { fixVerbVariety, fixAiIsms } from '../services/cvAutoFixer';
import type { FixChange } from '../services/cvAutoFixer';
import { fixBulletsForSignal, fixSummaryForSignal, fixVerbSaturation } from '../services/geminiService';

// Brand tokens
const NAV   = '#1B2B4B';
const GOLD  = '#C9A84C';
const CREAM = '#F8F7F4';

// ─────────────────────────────────────────────────────────────────────────────
// Score History — localStorage-backed snapshot store
// ─────────────────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'procv:scoreHistory';
const MAX_HISTORY = 10;

interface ScoreSnapshot {
  id: string;
  timestamp: string;       // ISO string
  cvName: string;
  beforeScore: number;
  afterScore: number;
  delta: number;
  fixesApplied: string[];  // signal labels
}

function loadHistory(): ScoreSnapshot[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}

function saveSnapshot(snap: ScoreSnapshot): ScoreSnapshot[] {
  const existing = loadHistory().filter(s => s.id !== snap.id);
  const updated = [snap, ...existing].slice(0, MAX_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch { /* storage full */ }
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bullet Quality — inline deterministic scorer
// ─────────────────────────────────────────────────────────────────────────────

interface BulletQualityIssue { severity: 'critical' | 'moderate'; text: string; fix: string; }
interface BulletQualityResult { score: number; issues: BulletQualityIssue[]; }

const FAKE_VERB_RX = /\b(greenfielded?|greenfield(?:ing|s)?|scaffolded?|scaffold(?:ing|s)?|materialized?|materializ(?:es|ing)|actioned?|action(?:ing|s)?|ideated?|ideating|solutioned?|solution(?:ing|s)?|conceptualized?|operationalized?)\b/i;
const CHAINED_METRIC_RX = /\b\d+\s*%[^.]{0,60}(?:resulting in|leading to|which led to|driving)\s*\d+\s*%/i;
const METRIC_RX = /\b\d[\d,.]*\s*(%|K|M|B|x|×|\+\s*years?)\b/i;
const SEEKING_RX = /\b(seeking to|looking to|aiming to|hoping to|excited to contribute|seeking an opportunity|seeking a role|looking for an opportunity)\b/i;
const BUZZWORD_RX = /\b(highly motivated|results[‐-]?driven|results[‐-]?oriented|passionate about|detail[‐-]?oriented|team player|self[‐-]?starter|go[‐-]?getter|dynamic professional|hard[‐-]?working)\b/i;

function scoreBulletQuality(cv: CVData): BulletQualityResult {
  const issues: BulletQualityIssue[] = [];
  const allBullets: string[] = [];
  for (const role of cv.experience ?? []) {
    for (const b of role.responsibilities ?? []) allBullets.push(b);
  }

  if (allBullets.length === 0) {
    return { score: 20, issues: [{ severity: 'critical', text: 'No experience bullets found.', fix: 'Add bullet-point responsibilities for each role in your experience section.' }] };
  }

  const summary = (cv.summary ?? '').trim();
  if (!summary) {
    issues.push({ severity: 'critical', text: 'No professional summary found.', fix: 'Write a 3–4 sentence summary: who you are, your strongest skill, and one concrete achievement.' });
  } else {
    const wc = summary.split(/\s+/).filter(Boolean).length;
    if (wc < 40) issues.push({ severity: 'critical', text: `Summary too short (${wc} words — aim for 60–90).`, fix: 'Expand your summary with a key achievement and a forward-looking value statement.' });
    else if (wc > 120) issues.push({ severity: 'moderate', text: `Summary too long (${wc} words — max 90).`, fix: 'Trim to 3–4 tight sentences. Every sentence should carry new information.' });
    if (SEEKING_RX.test(summary)) issues.push({ severity: 'critical', text: 'Summary says what you want ("Seeking to…") instead of what you deliver.', fix: 'Open with your value proposition: "Engineering leader with 8 years building…"' });
    if (BUZZWORD_RX.test(summary)) issues.push({ severity: 'moderate', text: 'Summary contains generic buzzwords ("highly motivated", "results-driven", etc.).', fix: 'Replace buzzwords with a concrete fact: a number, a scale, a specific tool.' });
  }

  for (const role of cv.experience ?? []) {
    const bs = role.responsibilities ?? [];
    if (bs.length === 0) continue;
    const label = `"${role.jobTitle ?? '?'} @ ${role.company ?? '?'}"`;
    const withMetric = bs.filter(b => METRIC_RX.test(b)).length;
    if (bs.length >= 4 && withMetric === bs.length) {
      issues.push({ severity: 'critical', text: `${label}: every bullet has a metric — a strong AI-generation signal.`, fix: 'Rewrite 1–2 bullets as purely qualitative (action + context, no number).' });
    }
    const fakeBullets = bs.filter(b => FAKE_VERB_RX.test(b));
    if (fakeBullets.length > 0) {
      issues.push({ severity: 'moderate', text: `${label}: ${fakeBullets.length} bullet(s) use invented AI verbs (Greenfielded, Actioned, Ideated…).`, fix: 'Replace with a real strong verb: Built, Delivered, Reduced, Launched, Negotiated.' });
    }
    if (bs.some(b => CHAINED_METRIC_RX.test(b))) {
      issues.push({ severity: 'moderate', text: `${label}: chained-causal metric ("X% resulting in Y%") — a fabrication signal.`, fix: 'Use a single standalone metric per bullet. Delete the causal chain.' });
    }
    const stubs = bs.filter(b => b.trim().split(/\s+/).filter(Boolean).length < 8);
    if (stubs.length > 1) {
      issues.push({ severity: 'moderate', text: `${label}: ${stubs.length} bullets under 8 words — too short to show real impact.`, fix: 'Expand each short bullet: add the context, tool, scale, or outcome.' });
    }
    const arrowBullets = bs.filter(b => b.includes('→'));
    if (arrowBullets.length > 0) {
      issues.push({ severity: 'moderate', text: `${label}: ${arrowBullets.length} bullet(s) use "→" to chain sentences — an AI output artefact.`, fix: 'Split into separate bullets or rewrite as one continuous achievement sentence.' });
    }
    const openers = bs.map(b => b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '');
    const seen = new Set<string>(); let hasDupOpener = false;
    for (const op of openers) { if (op && seen.has(op)) { hasDupOpener = true; break; } if (op) seen.add(op); }
    if (hasDupOpener) {
      issues.push({ severity: 'moderate', text: `${label}: multiple bullets start with the same verb.`, fix: 'Vary your openers — use Led, Built, Delivered, Negotiated, Designed, Reduced…' });
    }
  }

  const critCount = issues.filter(i => i.severity === 'critical').length;
  const modCount  = issues.filter(i => i.severity === 'moderate').length;
  return { score: Math.max(0, Math.min(100, 100 - critCount * 18 - modCount * 8)), issues };
}

function seniorityScore(report: SeniorityCoherenceReport): number {
  const overreach  = report.issues.filter(i => i.kind === 'seniority_overreach').length;
  const underreach = report.issues.filter(i => i.kind === 'seniority_underreach').length;
  return Math.max(0, Math.min(100, 100 - overreach * 15 - underreach * 8));
}

/** Simple equal-weight average of however many dimensions are available. */
function compositeScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Score Card — custom expandable card with skill breakdown table
// ─────────────────────────────────────────────────────────────────────────────

const EVIDENCE_COLORS: Record<EvidenceLevel, { bg: string; text: string; label: string; bar: string }> = {
  result:    { bg: 'bg-emerald-50 dark:bg-emerald-950/30',  text: 'text-emerald-700 dark:text-emerald-400', label: 'Result-Proven', bar: '#059669' },
  measured:  { bg: 'bg-blue-50 dark:bg-blue-950/30',        text: 'text-blue-700 dark:text-blue-400',       label: 'Measured',     bar: '#2563eb' },
  applied:   { bg: 'bg-amber-50 dark:bg-amber-950/30',      text: 'text-amber-700 dark:text-amber-400',     label: 'Applied',      bar: '#d97706' },
  mentioned: { bg: 'bg-zinc-100 dark:bg-neutral-700/50',    text: 'text-zinc-500 dark:text-zinc-400',       label: 'Mentioned Only', bar: '#a1a1aa' },
};

const EvidenceScoreCard: React.FC<{ report: EvidenceScoreReport }> = ({ report }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = scoreMeta(report.score);

  const issues: { severity: 'critical' | 'moderate'; text: string; fix: string }[] = [];
  if (report.mentionedCount > 0) {
    issues.push({
      severity: report.mentionedCount > report.totalSkills * 0.5 ? 'critical' : 'moderate',
      text: `${report.mentionedCount} skill${report.mentionedCount > 1 ? 's' : ''} listed but never used in a bullet — ATS sees them, recruiters don't believe them.`,
      fix: 'Add at least one bullet per skill showing how you used it: tool, context, and ideally a number.',
    });
  }
  const unquantified = report.appliedCount;
  if (unquantified > 0 && (report.measuredCount + report.resultCount) < report.totalSkills * 0.4) {
    issues.push({
      severity: 'moderate',
      text: `${unquantified} skill${unquantified > 1 ? 's' : ''} used in bullets but without any metric to back them up.`,
      fix: 'Add a scale, number, or % to bullets mentioning these skills — e.g. "Used Python to automate 12 reports, saving 8 hrs/week."',
    });
  }

  return (
    <div className="rounded-xl border overflow-hidden border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-neutral-800/60"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-xl flex-shrink-0">🔬</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">Evidence Score</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {report.resultCount + report.measuredCount} of {report.totalSkills} skills proven
            </span>
          </div>
          <div className="w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${report.score}%`, background: meta.bar }} />
          </div>
        </div>
        <span className={`text-lg font-bold tabular-nums ${meta.text} flex-shrink-0`}>{report.score}</span>
        <span className="text-zinc-400 dark:text-zinc-500 flex-shrink-0 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-neutral-800 px-4 py-3 space-y-3">
          {/* Summary stats row */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {([
              { label: 'Result-Proven', count: report.resultCount,   col: EVIDENCE_COLORS.result    },
              { label: 'Measured',      count: report.measuredCount,  col: EVIDENCE_COLORS.measured  },
              { label: 'Applied',       count: report.appliedCount,   col: EVIDENCE_COLORS.applied   },
              { label: 'Mentioned',     count: report.mentionedCount, col: EVIDENCE_COLORS.mentioned },
            ] as const).map(({ label, count, col }) => (
              <div key={label} className={`rounded-xl p-2.5 ${col.bg}`}>
                <div className={`text-xl font-black tabular-nums ${col.text}`}>{count}</div>
                <div className={`text-[10px] font-semibold leading-tight mt-0.5 ${col.text}`}>{label}</div>
              </div>
            ))}
          </div>

          {/* Issues */}
          {issues.map((issue, i) => (
            <div key={i} className={`rounded-xl p-3 text-sm ${issue.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40' : 'bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40'}`}>
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">{issue.severity === 'critical' ? '🔴' : '🟡'}</span>
                <div>
                  <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-snug">{issue.text}</p>
                  <p className="mt-1.5 text-zinc-500 dark:text-zinc-400 text-xs leading-snug">
                    <span className="font-semibold">Fix: </span>{issue.fix}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Per-skill breakdown table */}
          <div className="rounded-xl border border-zinc-100 dark:border-neutral-800 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-3 py-1.5 bg-zinc-50 dark:bg-neutral-800/60 border-b border-zinc-100 dark:border-neutral-800">
              <span>Skill</span>
              <span>Evidence Level</span>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-neutral-800 max-h-72 overflow-y-auto">
              {report.skills.map(({ skill, level, exampleBullet }) => {
                const col = EVIDENCE_COLORS[level];
                return (
                  <div key={skill} className="grid grid-cols-[1fr_auto] items-start gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{skill}</span>
                      {exampleBullet && (
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-snug line-clamp-1">{exampleBullet}</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 mt-0.5 ${col.bg} ${col.text}`}>
                      {col.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {report.resultCount > 0 && (
            <div className="rounded-xl p-3 text-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex items-start gap-2">
              <span className="flex-shrink-0">✅</span>
              <p className="text-zinc-700 dark:text-zinc-300 text-sm">
                {report.resultCount} skill{report.resultCount > 1 ? 's' : ''} backed by measurable results — exactly what recruiters want to see.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Achievement Density Card
// ─────────────────────────────────────────────────────────────────────────────

const DENSITY_BAND_COLORS = {
  excellent: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', bar: '#059669' },
  strong:    { bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-700 dark:text-blue-400',       bar: '#2563eb' },
  good:      { bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-700 dark:text-amber-400',     bar: '#d97706' },
  weak:      { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-700 dark:text-red-400',         bar: '#dc2626' },
};

const AchievementDensityCard: React.FC<{ report: AchievementDensityReport }> = ({ report }) => {
  const [expanded, setExpanded] = useState(false);
  const col = DENSITY_BAND_COLORS[report.band];
  const meta = scoreMeta(report.score);

  const issues: { severity: 'critical' | 'moderate'; text: string; fix: string }[] = [];
  if (report.band === 'weak') {
    issues.push({
      severity: 'critical',
      text: `Only ${report.achievementCount} of ${report.totalBullets} bullets show a concrete achievement — the rest just describe duties.`,
      fix: 'Rewrite at least 60% of your bullets to start with an impact verb and include a metric or outcome.',
    });
  } else if (report.band === 'good') {
    issues.push({
      severity: 'moderate',
      text: `${report.dutyCount} bullet${report.dutyCount > 1 ? 's' : ''} read${report.dutyCount === 1 ? 's' : ''} as duties. Recruiters skip these looking for proof.`,
      fix: 'Add a result or number to duty bullets: "Maintained X" → "Maintained X, reducing downtime by 40%."',
    });
  }

  return (
    <div className="rounded-xl border overflow-hidden border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-neutral-800/60"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-xl flex-shrink-0">🏆</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">Achievement Density</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.bg} ${col.text}`}>{report.bandLabel}</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {report.achievementCount}/{report.totalBullets} bullets are achievements
            </span>
          </div>
          <div className="w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${report.score}%`, background: meta.bar }} />
          </div>
        </div>
        <span className={`text-lg font-bold tabular-nums ${meta.text} flex-shrink-0`}>{report.score}%</span>
        <span className="text-zinc-400 dark:text-zinc-500 flex-shrink-0 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-neutral-800 px-4 py-3 space-y-3">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl p-2.5 bg-emerald-50 dark:bg-emerald-950/30">
              <div className="text-xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">{report.achievementCount}</div>
              <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">Achievements</div>
            </div>
            <div className="rounded-xl p-2.5 bg-red-50 dark:bg-red-950/30">
              <div className="text-xl font-black tabular-nums text-red-700 dark:text-red-400">{report.dutyCount}</div>
              <div className="text-[10px] font-semibold text-red-700 dark:text-red-400 mt-0.5">Duties</div>
            </div>
            <div className="rounded-xl p-2.5 bg-zinc-50 dark:bg-neutral-800">
              <div className="text-xl font-black tabular-nums text-zinc-700 dark:text-zinc-300">{report.totalBullets}</div>
              <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mt-0.5">Total Bullets</div>
            </div>
          </div>

          {/* Issues */}
          {issues.map((issue, i) => (
            <div key={i} className={`rounded-xl p-3 text-sm ${issue.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40' : 'bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40'}`}>
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">{issue.severity === 'critical' ? '🔴' : '🟡'}</span>
                <div>
                  <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-snug">{issue.text}</p>
                  <p className="mt-1.5 text-zinc-500 dark:text-zinc-400 text-xs"><span className="font-semibold">Fix: </span>{issue.fix}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Per-role breakdown */}
          {report.roleBreakdown.length > 0 && (
            <div className="rounded-xl border border-zinc-100 dark:border-neutral-800 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-3 py-1.5 bg-zinc-50 dark:bg-neutral-800/60 border-b border-zinc-100 dark:border-neutral-800 gap-3">
                <span>Role</span><span>Density</span><span>A/D</span>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-neutral-800">
                {report.roleBreakdown.map(r => {
                  const bandCol = r.density >= 80 ? DENSITY_BAND_COLORS.excellent
                    : r.density >= 60 ? DENSITY_BAND_COLORS.strong
                    : r.density >= 30 ? DENSITY_BAND_COLORS.good
                    : DENSITY_BAND_COLORS.weak;
                  return (
                    <div key={r.role} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2">
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{r.role}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${bandCol.bg} ${bandCol.text}`}>{r.density}%</span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">{r.achievementCount}/{r.total}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {report.band === 'excellent' && (
            <div className="rounded-xl p-3 text-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex items-start gap-2">
              <span>✅</span>
              <p className="text-zinc-700 dark:text-zinc-300 text-sm">
                {report.score}% of your bullets lead with a concrete achievement — top tier for recruiter impact.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MetricStrengthCard
// ─────────────────────────────────────────────────────────────────────────────

const METRIC_LEVEL_STYLE: Record<MetricLevel, { bg: string; text: string; label: string; dot: string }> = {
  strong: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'Strong',  dot: '🟢' },
  medium: { bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-700 dark:text-amber-400',     label: 'Medium',  dot: '🟡' },
  weak:   { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-700 dark:text-red-400',         label: 'Weak',    dot: '🔴' },
};

const MetricStrengthCard: React.FC<{ report: MetricStrengthReport }> = ({ report }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = scoreMeta(report.score);

  const coveragePct = report.totalBullets > 0
    ? Math.round((report.totalMetrics / report.totalBullets) * 100)
    : 0;

  const noMetricCount = report.totalBullets - report.totalMetrics;

  return (
    <div className="rounded-xl border overflow-hidden border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-neutral-800/60"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-xl flex-shrink-0">📊</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">Metric Strength</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
              {report.strongCount} strong
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400">
              {report.mediumCount} medium
            </span>
            {report.weakCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400">
                {report.weakCount} weak
              </span>
            )}
          </div>
          <div className="w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${report.score}%`, background: meta.bar }} />
          </div>
        </div>
        <span className={`text-lg font-bold tabular-nums ${meta.text} flex-shrink-0`}>{report.score}%</span>
        <span className="text-zinc-400 dark:text-zinc-500 flex-shrink-0 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-neutral-800 px-4 py-3 space-y-3">
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { val: report.strongCount, label: 'Strong',    col: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' },
              { val: report.mediumCount, label: 'Medium',    col: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' },
              { val: report.weakCount,   label: 'Weak',      col: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400' },
              { val: noMetricCount,      label: 'No metric', col: 'bg-zinc-50 dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400' },
            ].map(({ val, label, col }) => (
              <div key={label} className={`rounded-xl p-2.5 ${col.split(' ').slice(0, 2).join(' ')}`}>
                <div className={`text-xl font-black tabular-nums ${col.split(' ').slice(2).join(' ')}`}>{val}</div>
                <div className={`text-[10px] font-semibold ${col.split(' ').slice(2).join(' ')} mt-0.5`}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage note */}
          {noMetricCount > 0 && (
            <div className="rounded-xl p-3 bg-zinc-50 dark:bg-neutral-800 border border-zinc-100 dark:border-neutral-700">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold">{coveragePct}% metric coverage</span> — {noMetricCount} bullet{noMetricCount > 1 ? 's' : ''} contain no measurable number at all.{' '}
                {noMetricCount > 3 && 'Add at least one number to every experience bullet to make it scannable.'}
              </p>
            </div>
          )}

          {/* Weak metrics — upgrade suggestions */}
          {report.metrics.filter(m => m.level === 'weak').length > 0 && (
            <div className="rounded-xl border border-red-100 dark:border-red-900/40 overflow-hidden">
              <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/30 text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                Weak metrics — upgrade these first
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-neutral-800">
                {report.metrics.filter(m => m.level === 'weak').slice(0, 5).map((m, i) => (
                  <div key={i} className="px-3 py-2.5">
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug mb-1 italic">"{m.bullet}"</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{m.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strong metrics — reinforcement */}
          {report.strongCount > 0 && (
            <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/40 overflow-hidden">
              <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Strong metrics — keep this up
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-neutral-800">
                {report.metrics.filter(m => m.level === 'strong').slice(0, 4).map((m, i) => (
                  <div key={i} className="px-3 py-2.5 flex items-start gap-2">
                    <span className="text-xs flex-shrink-0 mt-0.5">✅</span>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug italic">"{m.bullet}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.score >= 85 && (
            <div className="rounded-xl p-3 text-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex items-start gap-2">
              <span>✅</span>
              <p className="text-zinc-700 dark:text-zinc-300 text-sm">
                Excellent metric quality — {report.strongCount} strong impact metrics show real business outcomes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// VerbVarietyCard
// ─────────────────────────────────────────────────────────────────────────────

interface VerbVarietyCardProps {
  report: VerbVarietyReport;
  currentCV: CVData;
  onCVUpdate?: (cv: CVData) => void;
}

const VerbVarietyCard: React.FC<VerbVarietyCardProps> = ({ report, currentCV, onCVUpdate }) => {
  const [expanded, setExpanded]       = useState(false);
  const [fixing, setFixing]           = useState(false);
  const [fixResult, setFixResult]     = useState<{ count: number; changes: FixChange[] } | null>(null);
  const [fixingAi, setFixingAi]       = useState(false);
  const [fixAiResult, setFixAiResult] = useState<{ count: number } | null>(null);
  const meta = scoreMeta(report.score);

  const canFix = !!onCVUpdate && report.fixableBulletCount > 0;
  const canFixAi = !!onCVUpdate;

  function handleFixVerbs() {
    if (!onCVUpdate) return;
    setFixing(true);
    setTimeout(() => {
      const result = fixVerbVariety(currentCV, report.overusedVerbs);
      onCVUpdate(result.updatedCV);
      setFixResult({ count: result.fixCount, changes: result.changes });
      setFixing(false);
    }, 60);
  }

  function handleFixAiIsms() {
    if (!onCVUpdate) return;
    setFixingAi(true);
    setTimeout(() => {
      const result = fixAiIsms(currentCV);
      onCVUpdate(result.updatedCV);
      setFixAiResult({ count: result.fixCount });
      setFixingAi(false);
    }, 60);
  }

  return (
    <div className="rounded-xl border overflow-hidden border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-neutral-800/60"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-xl flex-shrink-0">🔤</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">Verb Variety</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
            {report.overusedVerbs.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400">
                {report.overusedVerbs.length} overused verb{report.overusedVerbs.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-snug mb-1.5">
            Recruiters notice when every bullet starts with the same verb — it signals low effort.
          </p>
          <div className="w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${report.score}%`, background: meta.bar }} />
          </div>
        </div>
        <span className={`text-lg font-bold tabular-nums ${meta.text} flex-shrink-0`}>{report.score}%</span>
        <span className="text-zinc-400 dark:text-zinc-500 flex-shrink-0 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-neutral-800 px-4 py-3 space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl p-2.5 bg-zinc-50 dark:bg-neutral-800">
              <div className="text-xl font-black tabular-nums text-zinc-700 dark:text-zinc-300">{report.uniqueVerbCount}</div>
              <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mt-0.5">Unique verbs</div>
            </div>
            <div className="rounded-xl p-2.5 bg-red-50 dark:bg-red-950/30">
              <div className="text-xl font-black tabular-nums text-red-700 dark:text-red-400">{report.overusedVerbs.length}</div>
              <div className="text-[10px] font-semibold text-red-700 dark:text-red-400 mt-0.5">Overused</div>
            </div>
            <div className="rounded-xl p-2.5 bg-amber-50 dark:bg-amber-950/30">
              <div className="text-xl font-black tabular-nums text-amber-700 dark:text-amber-400">{report.weakVerbInstances.reduce((s, w) => s + w.count, 0)}</div>
              <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mt-0.5">Weak verbs</div>
            </div>
          </div>

          {/* Overused verbs list */}
          {report.overusedVerbs.length > 0 && (
            <div className="rounded-xl border border-red-100 dark:border-red-900/40 overflow-hidden">
              <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/30 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Overused starting verbs
                </span>
                <span className="text-[10px] text-red-500 dark:text-red-400">
                  Why: same verb = same impact level to a recruiter's eye
                </span>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-neutral-800">
                {report.overusedVerbs.map(ov => (
                  <div key={ov.verb} className="px-3 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 capitalize">{ov.verb}</span>
                      <span className="text-xs text-red-500 dark:text-red-400 ml-2">×{ov.count}</span>
                      {ov.synonyms.length > 0 && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Try: <span className="text-zinc-700 dark:text-zinc-300">{ov.synonyms.slice(0, 4).join(', ')}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Apply verb fix button */}
              {canFix && !fixResult && (
                <div className="px-3 py-2.5 bg-zinc-50 dark:bg-neutral-800/60 border-t border-zinc-100 dark:border-neutral-700">
                  <button
                    onClick={e => { e.stopPropagation(); handleFixVerbs(); }}
                    disabled={fixing}
                    className="w-full py-2 px-4 rounded-lg text-sm font-bold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: NAV }}
                  >
                    {fixing ? (
                      <><span className="animate-spin inline-block">⚙</span> Applying…</>
                    ) : (
                      <>✨ Auto-fix — replace overused verbs in CV ({report.fixableBulletCount} bullets)</>
                    )}
                  </button>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5 text-center">
                    Keeps the first occurrence of each verb; replaces repetitions with synonyms from the list above.
                  </p>
                </div>
              )}

              {fixResult && (
                <div className="px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border-t border-emerald-100 dark:border-emerald-900/40">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <span>✅</span>
                    {fixResult.count} verb{fixResult.count !== 1 ? 's' : ''} replaced in your CV
                  </p>
                  {fixResult.changes.slice(0, 3).map((c, i) => (
                    <p key={i} className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">
                      <span className="text-red-400 line-through">{c.original.slice(0, 60)}…</span>
                      <br />
                      <span className="text-emerald-600 dark:text-emerald-400">→ {c.fixed.slice(0, 60)}…</span>
                    </p>
                  ))}
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5">Re-score to see updated Verb Variety score.</p>
                </div>
              )}
            </div>
          )}

          {/* Weak verbs */}
          {report.weakVerbInstances.length > 0 && (
            <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1.5">Weak opening verbs (low impact)</p>
              <div className="flex flex-wrap gap-1.5">
                {report.weakVerbInstances.map(w => (
                  <span key={w.verb} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-medium">
                    {w.verb} ×{w.count}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                Replace with impact verbs: <span className="font-medium">drove, engineered, launched, reduced, delivered, built</span>
              </p>
            </div>
          )}

          {/* AI-ism quick fix */}
          {canFixAi && (
            <div className="rounded-xl border border-zinc-100 dark:border-neutral-700 overflow-hidden">
              <div className="px-3 py-2 bg-zinc-50 dark:bg-neutral-800/60">
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Bonus fix: strip AI-isms</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Replaces phrases like "delve into", "utilise", "harnessing the power of" that flag AI-written content.
                </p>
              </div>
              {!fixAiResult ? (
                <div className="px-3 py-2.5">
                  <button
                    onClick={e => { e.stopPropagation(); handleFixAiIsms(); }}
                    disabled={fixingAi}
                    className="w-full py-2 px-4 rounded-lg text-sm font-bold border-2 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ borderColor: GOLD, color: GOLD }}
                  >
                    {fixingAi ? (
                      <><span className="animate-spin inline-block">⚙</span> Scanning…</>
                    ) : (
                      <>🧹 Remove AI-isms from CV</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/30">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <span>✅</span>
                    {fixAiResult.count > 0
                      ? `${fixAiResult.count} AI-ism phrase${fixAiResult.count !== 1 ? 's' : ''} removed`
                      : 'No AI-isms found — your CV is clean!'}
                  </p>
                </div>
              )}
            </div>
          )}

          {report.score >= 85 && report.overusedVerbs.length === 0 && (
            <div className="rounded-xl p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex items-start gap-2">
              <span>✅</span>
              <p className="text-zinc-700 dark:text-zinc-300 text-sm">
                Strong verb variety — {report.uniqueVerbCount} distinct action verbs across {report.totalBullets} bullets.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Score theming — ProCV colors
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreMeta { label: string; ring: string; text: string; bg: string; bar: string; }

function scoreMeta(score: number): ScoreMeta {
  if (score >= 85) return { label: 'Excellent', ring: '#059669', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', bar: '#059669' };
  if (score >= 70) return { label: 'Good',      ring: GOLD,      text: 'text-amber-600 dark:text-amber-400',    bg: 'bg-amber-50 dark:bg-amber-900/20',    bar: GOLD };
  if (score >= 55) return { label: 'Fair',       ring: '#d97706', text: 'text-orange-500 dark:text-orange-400',  bg: 'bg-orange-50 dark:bg-orange-900/20',  bar: '#d97706' };
  if (score >= 35) return { label: 'Weak',       ring: '#ea580c', text: 'text-orange-600 dark:text-orange-500',  bg: 'bg-orange-100 dark:bg-orange-900/25', bar: '#ea580c' };
  return             { label: 'Poor',        ring: '#dc2626', text: 'text-red-600 dark:text-red-400',        bg: 'bg-red-50 dark:bg-red-900/20',        bar: '#dc2626' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Score Gauge
// ─────────────────────────────────────────────────────────────────────────────

const ScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const meta = scoreMeta(score);
  const r = 52; const circ = 2 * Math.PI * r; const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" className="dark:stroke-neutral-700" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={meta.ring} strokeWidth="10"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold ${meta.text}`}>{score}</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">/ 100</span>
        </div>
      </div>
      <span className={`mt-2 text-base font-semibold ${meta.text}`}>{meta.label}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Dimension Card
// ─────────────────────────────────────────────────────────────────────────────

interface DimensionCardProps {
  title: string; score: number; icon: string; locked?: boolean;
  lockMessage?: string; issues: { severity: string; text: string; fix?: string }[];
  passes?: string[]; cfEnriched?: boolean;
}

const DimensionCard: React.FC<DimensionCardProps> = ({ title, score, icon, locked, lockMessage, issues, passes, cfEnriched }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = scoreMeta(score);
  const hasContent = issues.length > 0 || (passes ?? []).length > 0;

  return (
    <div className={`rounded-xl border overflow-hidden ${locked ? 'border-zinc-200 dark:border-neutral-700 opacity-60' : 'border-zinc-200 dark:border-neutral-700'} bg-white dark:bg-neutral-900`}>
      <div
        className={`flex items-center gap-3 px-4 py-3.5 ${!locked && hasContent ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-neutral-800/60' : ''}`}
        onClick={() => !locked && hasContent && setExpanded(e => !e)}
      >
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">{title}</span>
            {!locked && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>}
            {cfEnriched && !locked && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                ⚡ CF live
              </span>
            )}
          </div>
          {locked ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{lockMessage}</p>
          ) : (
            <div className="w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-1.5">
              <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${score}%`, background: meta.bar }} />
            </div>
          )}
        </div>
        {!locked && <span className={`text-lg font-bold tabular-nums ${meta.text} flex-shrink-0`}>{score}</span>}
        {!locked && hasContent && (
          <span className="text-zinc-400 dark:text-zinc-500 flex-shrink-0 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {!locked && expanded && (
        <div className="border-t border-zinc-100 dark:border-neutral-800 px-4 py-3 space-y-2.5">
          {issues.map((issue, i) => (
            <div key={i} className={`rounded-xl p-3 text-sm ${issue.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40' : 'bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40'}`}>
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">{issue.severity === 'critical' ? '🔴' : '🟡'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-snug">{issue.text}</p>
                  {issue.fix && (
                    <p className="mt-1.5 text-zinc-500 dark:text-zinc-400 text-xs leading-snug">
                      <span className="font-semibold">Fix: </span>{issue.fix}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {(passes ?? []).map((p, i) => (
            <div key={i} className="rounded-xl p-3 text-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5">✅</span>
              <p className="text-zinc-700 dark:text-zinc-300 text-sm">{p}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ATS anti-gaming
// ─────────────────────────────────────────────────────────────────────────────

function atsEffectiveScore(report: AtsKeywordReport): { displayScore: number; warning: string | null } {
  const raw = report.score;
  if (raw > 88) return { displayScore: raw, warning: `${raw}% match looks suspiciously high — ATS systems flag keyword-stuffed CVs. Aim for 65–80% for natural-sounding output.` };
  return { displayScore: raw, warning: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreMyCVPageProps {
  currentCV: CVData | null;
  onGoToGenerator: () => void;
  onCVUpdate?: (cv: CVData) => void;
}

interface ScoreResults {
  humanVoice: HRDetectionResult;
  bulletQuality: BulletQualityResult;
  careerLogic: SeniorityCoherenceReport;
  atsMatch: AtsKeywordReport | null;
  evidenceScore: EvidenceScoreReport;
  densityScore: AchievementDensityReport;
  metricStrength: MetricStrengthReport;
  verbVariety: VerbVarietyReport;
  composite: number;
  scoredAt: Date;
  cfEnriched: boolean;
}

const BULLET_FIX_SIGNALS = new Set(['verb_saturation','banned_opener','repeated_opener','pronoun_leak','passive_voice','length_uniformity']);
const SUMMARY_FIX_SIGNALS = new Set(['summary_cliches','generic_opener']);

const ScoreMyCVPage: React.FC<ScoreMyCVPageProps> = ({ currentCV, onGoToGenerator, onCVUpdate }) => {
  const [jd, setJd]                     = useState('');
  const [jdExpanded, setJdExpanded]     = useState(false);
  const [scoring, setScoring]           = useState(false);
  const [results, setResults]           = useState<ScoreResults | null>(null);
  const [cfPhrases, setCfPhrases]       = useState<{ openers: string[]; aiisms: string[] } | null>(null);
  const [cfStatus, setCfStatus]         = useState<'loading' | 'live' | 'offline'>('loading');

  // ── One-click AI fixes inside Score My CV ──────────────────────────────
  const [fixingSignalId, setFixingSignalId] = useState<string | null>(null);
  const [fixedSignalIds, setFixedSignalIds] = useState<Set<string>>(new Set());
  const [fixErrors, setFixErrors]           = useState<Record<string, string>>({});
  const [isBoostingAll, setIsBoostingAll]   = useState(false);
  const [boostProgress, setBoostProgress]   = useState<{ current: number; total: number; label: string } | null>(null);
  const [boostDone, setBoostDone]           = useState(false);

  // ── Score History ──────────────────────────────────────────────────────────
  const [scoreHistory, setScoreHistory]     = useState<ScoreSnapshot[]>(() => loadHistory());
  const [historyExpanded, setHistoryExpanded] = useState(false);
  // Pending capture: filled just before boost auto-rescores, consumed by useEffect
  const pendingCapture = useRef<{ id: string; beforeScore: number; cvName: string; fixesApplied: string[] } | null>(null);

  // After every rescore, check whether we have a pending history capture to save
  useEffect(() => {
    if (!results || !pendingCapture.current) return;
    const { id, beforeScore, cvName, fixesApplied } = pendingCapture.current;
    pendingCapture.current = null;
    const snap: ScoreSnapshot = {
      id, timestamp: new Date().toISOString(), cvName,
      beforeScore, afterScore: results.composite,
      delta: results.composite - beforeScore,
      fixesApplied,
    };
    setScoreHistory(saveSnapshot(snap));
  }, [results]);

  /** Apply a single signal fix to `workingCV` in-place and return the updated copy. */
  const applyOneFix = useCallback(async (sigId: string, workingCV: CVData): Promise<CVData> => {
    if (BULLET_FIX_SIGNALS.has(sigId)) {
      const bullets = workingCV.experience.flatMap(exp => exp.responsibilities || []);
      if (bullets.length === 0) return workingCV;
      const fixed = sigId === 'verb_saturation'
        ? await fixVerbSaturation(bullets)
        : await fixBulletsForSignal(bullets, sigId);
      let cursor = 0;
      const updatedExp = workingCV.experience.map(exp => {
        const count = (exp.responsibilities || []).length;
        const slice = fixed.slice(cursor, cursor + count);
        cursor += count;
        return { ...exp, responsibilities: slice };
      });
      return { ...workingCV, experience: updatedExp };
    } else if (SUMMARY_FIX_SIGNALS.has(sigId)) {
      const fixed = await fixSummaryForSignal(workingCV.summary || '', sigId);
      return { ...workingCV, summary: fixed };
    }
    return workingCV;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScorePageFix = useCallback(async (sigId: string) => {
    if (!currentCV || !onCVUpdate) return;
    setFixingSignalId(sigId);
    setFixErrors(prev => { const n = { ...prev }; delete n[sigId]; return n; });
    try {
      const updated = await applyOneFix(sigId, currentCV);
      onCVUpdate(updated);
      setFixedSignalIds(prev => new Set([...prev, sigId]));
      setTimeout(() => setFixedSignalIds(prev => { const n = new Set(prev); n.delete(sigId); return n; }), 5000);
    } catch (e) {
      setFixErrors(prev => ({ ...prev, [sigId]: e instanceof Error ? e.message : 'Fix failed.' }));
    } finally {
      setFixingSignalId(null);
    }
  }, [currentCV, onCVUpdate, applyOneFix]);

  /** Run every unfixed action sequentially on a single working copy, update the CV live after each. */
  const handleBoostAll = useCallback(async (actions: { sigId: string; label: string }[]) => {
    if (!currentCV || !onCVUpdate || isBoostingAll) return;
    const pending = actions.filter(a => !fixedSignalIds.has(a.sigId));
    if (pending.length === 0) return;
    // Capture before-score for history (results must exist at this point)
    const beforeScore = results?.composite ?? 0;
    const cvName = currentCV.name || currentCV.experience?.[0]?.jobTitle || 'CV';
    setIsBoostingAll(true);
    setBoostDone(false);
    setBoostProgress({ current: 0, total: pending.length, label: pending[0].label });
    let working: CVData = { ...currentCV };
    const appliedLabels: string[] = [];
    for (let i = 0; i < pending.length; i++) {
      const { sigId, label } = pending[i];
      setBoostProgress({ current: i + 1, total: pending.length, label });
      try {
        working = await applyOneFix(sigId, working);
        onCVUpdate(working);
        appliedLabels.push(label);
        setFixedSignalIds(prev => new Set([...prev, sigId]));
      } catch {
        // skip failed signal, continue with next
      }
    }
    setIsBoostingAll(false);
    setBoostProgress(null);
    setBoostDone(true);
    // Register pending history capture — useEffect will save it after results update
    pendingCapture.current = {
      id: `boost-${Date.now()}`,
      beforeScore,
      cvName,
      fixesApplied: appliedLabels,
    };
    // Auto re-score after a short delay so the CV state has settled
    setTimeout(() => runScore(), 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCV, onCVUpdate, fixedSignalIds, isBoostingAll, applyOneFix, results]);

  // Fetch CF banned phrases on mount — Score My CV is now data-driven
  useEffect(() => {
    fetchCFBannedPhrases().then(result => {
      setCfPhrases(result);
      setCfStatus(result.openers.length + result.aiisms.length > 0 ? 'live' : 'offline');
    });
  }, []);

  const runScore = useCallback(async () => {
    if (!currentCV) return;
    setScoring(true);
    setResults(null);
    await new Promise(r => setTimeout(r, 60));

    const extraOpeners = cfPhrases?.openers ?? [];
    const extraAiisms  = cfPhrases?.aiisms  ?? [];

    const humanVoice     = scoreHRDetection(currentCV, extraOpeners, extraAiisms);
    const bulletQuality  = scoreBulletQuality(currentCV);
    const careerLogic    = auditSeniorityCoherence(currentCV);
    const atsMatch       = jd.trim() ? scoreAtsCoverage(currentCV, jd.trim()) : null;
    const evidenceScore  = scoreEvidenceStrength(currentCV);
    const densityScore   = scoreAchievementDensity(currentCV);
    const metricStrength = scoreMetricStrength(currentCV);
    const verbVariety    = scoreVerbVariety(currentCV);

    const sScore = seniorityScore(careerLogic);
    const aScore = atsMatch ? atsEffectiveScore(atsMatch).displayScore : null;
    const dimScores = [humanVoice.humanScore, bulletQuality.score, sScore, evidenceScore.score, densityScore.score, metricStrength.score, verbVariety.score];
    if (aScore !== null) dimScores.push(aScore);
    const comp = compositeScore(dimScores);

    setResults({ humanVoice, bulletQuality, careerLogic, atsMatch, evidenceScore, densityScore, metricStrength, verbVariety, composite: comp, scoredAt: new Date(), cfEnriched: cfStatus === 'live' });
    setScoring(false);
  }, [currentCV, jd, cfPhrases, cfStatus]);

  const reset = () => { setResults(null); setJd(''); setJdExpanded(false); };

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!currentCV || (!currentCV.summary && (currentCV.experience ?? []).length === 0)) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-neutral-800 p-10 text-center bg-[#F8F7F4] dark:bg-neutral-900">
        <div className="text-5xl mb-4">📋</div>
        <h2 className="text-xl font-black text-zinc-800 dark:text-zinc-100 mb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}>
          No CV loaded yet
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm mx-auto text-sm">
          Generate or load a CV first, then come back here to score it.
        </p>
        <button onClick={onGoToGenerator} className="px-5 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 transition-opacity" style={{ background: NAV }}>
          Go to CV Generator →
        </button>
      </div>
    );
  }

  // ── Results view ─────────────────────────────────────────────────────────
  if (results) {
    const sScore  = seniorityScore(results.careerLogic);
    const atsData = results.atsMatch ? atsEffectiveScore(results.atsMatch) : null;

    const hvIssues = results.humanVoice.signals
      .filter(s => s.severity !== 'pass' && s.riskPts > 0)
      .map(s => ({ severity: s.riskPts >= 12 ? 'critical' as const : 'moderate' as const, text: s.detail, fix: s.fix }));
    const hvPasses = results.humanVoice.signals.filter(s => s.severity === 'pass').map(s => s.label);

    const clIssues = results.careerLogic.issues.map(i => ({
      severity: i.kind === 'seniority_overreach' ? 'critical' as const : 'moderate' as const,
      text: `${i.where}: ${i.detail} (flagged: "${i.flaggedPhrase}")`,
      fix: i.kind === 'seniority_overreach'
        ? 'Rephrase to match what an early-career role realistically does — execution, not strategy.'
        : 'Rewrite to show ownership: use "Led", "Delivered", "Drove" instead of "Helped", "Supported".',
    }));

    const atsIssues: { severity: 'critical' | 'moderate'; text: string; fix: string }[] = [];
    if (results.atsMatch) {
      const { missing, keywords } = results.atsMatch;
      if (missing.length > 0) {
        atsIssues.push({
          severity: missing.length > keywords.length * 0.4 ? 'critical' : 'moderate',
          text: `${missing.length} JD keyword${missing.length > 1 ? 's' : ''} missing: ${missing.slice(0, 8).map(k => `"${k}"`).join(', ')}${missing.length > 8 ? '…' : ''}`,
          fix: 'Naturally weave missing keywords into your summary, skills, and bullet points.',
        });
      }
      if (atsData?.warning) {
        atsIssues.push({ severity: 'moderate', text: atsData.warning, fix: 'Remove keyword-heavy lists that read unnaturally. Focus on the 8–12 most important terms.' });
      }
    }
    const atsPasses = results.atsMatch && results.atsMatch.matched.length > 0 && !atsData?.warning
      ? [`${results.atsMatch.matched.length} of ${results.atsMatch.keywords.length} JD keywords found in your CV.`]
      : [];

    const compositeMeta = scoreMeta(results.composite);

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-black text-zinc-800 dark:text-zinc-100 flex items-center gap-2"
                style={{ fontFamily: "'Playfair Display', serif" }}>
              CV Score Report
              {results.cfEnriched && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                      style={{ background: GOLD + '18', borderColor: GOLD + '40', color: '#92400e' }}>
                  ⚡ Live data
                </span>
              )}
            </h1>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              Scored {results.scoredAt.toLocaleTimeString()} · {results.cfEnriched ? 'CF banned-phrases loaded' : 'Offline mode — built-in lists only'}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="px-3 py-1.5 rounded-xl text-sm border border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors font-medium">
              ↺ Re-score
            </button>
            <button onClick={onGoToGenerator} className="px-4 py-1.5 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity" style={{ background: NAV }}>
              Fix My CV →
            </button>
          </div>
        </div>

        {/* Composite score */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-6">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <ScoreGauge score={results.composite} />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 mb-1">Overall Score</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                {results.composite >= 85
                  ? 'Your CV is in excellent shape. Minor polishing may push it further.'
                  : results.composite >= 70
                  ? 'Good overall. Address the flagged issues below to push past 85.'
                  : results.composite >= 55
                  ? 'Fair — several patterns that trained recruiters and ATS systems flag. Fixable.'
                  : 'Significant issues found. The breakdown below shows exactly what to fix.'}
              </p>
              <div className="space-y-2.5">
                {[
                  { label: 'Human Voice',         score: results.humanVoice.humanScore },
                  { label: 'Bullet Quality',      score: results.bulletQuality.score },
                  { label: 'Career Logic',        score: sScore },
                  { label: 'Evidence Score',      score: results.evidenceScore.score },
                  { label: 'Achievement Density', score: results.densityScore.score },
                  { label: 'Metric Strength',     score: results.metricStrength.score },
                  { label: 'Verb Variety',         score: results.verbVariety.score },
                  { label: 'ATS Match',           score: results.atsMatch ? atsData!.displayScore : null },
                ].map(({ label, score }) => {
                  const m = score !== null ? scoreMeta(score) : null;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">
                        <span>{label}</span>
                        <span className="font-medium tabular-nums">{score !== null ? score : '—'}</span>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-1.5">
                        {score !== null && m && (
                          <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${score}%`, background: m.bar }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!results.atsMatch && (
                <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500 italic">
                  💡 ATS Match not scored — scroll down to paste a job description.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Boost Score — Fix All + individual fixes ── */}
        {onCVUpdate && (() => {
          // Build the fixable actions list
          const actions: { sigId: string; label: string; desc: string }[] = [];
          const hvSignals = results.humanVoice.signals.filter(s => s.severity !== 'pass' && s.riskPts > 0);
          hvSignals.forEach(s => {
            if ((SUMMARY_FIX_SIGNALS.has(s.id) || BULLET_FIX_SIGNALS.has(s.id)) && !actions.find(a => a.sigId === s.id))
              actions.push({ sigId: s.id, label: s.label, desc: s.fix || s.detail });
          });
          if (results.verbVariety.score < 70 && results.verbVariety.overusedVerbs.length > 0 && !actions.find(a => a.sigId === 'verb_saturation'))
            actions.push({ sigId: 'verb_saturation', label: 'Verb Saturation', desc: `Overused verbs (${results.verbVariety.overusedVerbs.map(v => v.verb).slice(0,3).join(', ')}) — rotate for variety.` });
          if (results.bulletQuality.score < 75) {
            const bqSigs = [
              { sigId: 'banned_opener',    label: 'Banned Opener Words',      desc: 'Rewrite "Spearheaded/Leveraged/Utilized" → direct action verbs.' },
              { sigId: 'repeated_opener',  label: 'Repeated Opener Verb',     desc: 'Multiple bullets start with the same verb — rotate for variety.' },
              { sigId: 'passive_voice',    label: 'Passive Voice Bullets',    desc: 'Convert "was managed by" → active "Led / Delivered".' },
              { sigId: 'pronoun_leak',     label: 'First-Person Pronouns',    desc: 'Remove I/my/we from bullets — implied subject is standard.' },
              { sigId: 'length_uniformity',label: 'Bullet Length Uniformity', desc: 'All bullets same length signals AI — mix short + detailed.' },
            ];
            bqSigs.forEach(s => { if (!actions.find(a => a.sigId === s.sigId)) actions.push(s); });
          }
          if (actions.length === 0) return null;
          const top = actions.slice(0, 6);
          const pendingCount = top.filter(a => !fixedSignalIds.has(a.sigId)).length;
          const allDone = pendingCount === 0;

          return (
            <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: GOLD + '50', background: GOLD + '06' }}>

              {/* ── Header with Boost Score button ── */}
              <div className="px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap" style={{ background: NAV }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🚀</span>
                  <div>
                    <p className="text-sm font-bold text-white">Boost Score — Fix All</p>
                    <p className="text-[11px]" style={{ color: '#94a8c4' }}>
                      {allDone ? `All ${top.length} fixes applied — re-score to see your new score.` : `${pendingCount} fix${pendingCount !== 1 ? 'es' : ''} queued · AI rewrites each section sequentially`}
                    </p>
                  </div>
                </div>
                {!allDone && (
                  <button
                    onClick={() => handleBoostAll(top)}
                    disabled={isBoostingAll || fixingSignalId !== null || scoring}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 transition-all"
                    style={{ background: GOLD, color: NAV }}
                  >
                    {isBoostingAll ? (
                      <><svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Fixing…</>
                    ) : (
                      <>⚡ Fix All & Re-score</>
                    )}
                  </button>
                )}
                {allDone && (
                  <button
                    onClick={runScore}
                    disabled={scoring}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 transition-all"
                    style={{ background: GOLD, color: NAV }}
                  >
                    {scoring ? (
                      <><svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Scoring…</>
                    ) : (
                      <>📊 Re-score Now</>
                    )}
                  </button>
                )}
              </div>

              {/* ── Live progress bar during Boost ── */}
              {isBoostingAll && boostProgress && (
                <div className="px-4 py-3 border-b border-zinc-100 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">
                      Fixing {boostProgress.current}/{boostProgress.total}: {boostProgress.label}
                    </p>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 flex-shrink-0 ml-2">
                      {Math.round((boostProgress.current / boostProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(boostProgress.current / boostProgress.total) * 100}%`, background: GOLD }}
                    />
                  </div>
                </div>
              )}

              {/* ── Completion banner ── */}
              {boostDone && !isBoostingAll && (
                <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/30 flex items-center gap-2">
                  <span className="text-base">✅</span>
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    All fixes applied — your CV template has been updated. Scoring now…
                  </p>
                </div>
              )}

              {/* ── Individual fix rows ── */}
              <div className="divide-y divide-zinc-100 dark:divide-neutral-800 bg-white dark:bg-neutral-900">
                {top.map((action, idx) => {
                  const isDone   = fixedSignalIds.has(action.sigId);
                  const isActive = fixingSignalId === action.sigId;
                  const isBoostActive = isBoostingAll && boostProgress && boostProgress.current === idx + 1;
                  return (
                    <div key={action.sigId} className={`px-4 py-3 flex items-start gap-3 transition-colors ${isDone ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`}>
                      {/* Status indicator */}
                      <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                           style={{ background: isDone ? '#059669' : isBoostActive ? GOLD : NAV + '18', color: isDone ? 'white' : isBoostActive ? NAV : NAV + '99' }}>
                        {isDone ? '✓' : isBoostActive ? '…' : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${isDone ? 'text-emerald-700 dark:text-emerald-400 line-through opacity-70' : 'text-zinc-700 dark:text-zinc-200'}`}>
                          {action.label}
                        </p>
                        {!isDone && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-snug">{action.desc}</p>}
                        {fixErrors[action.sigId] && <p className="text-[11px] text-rose-500 mt-1">{fixErrors[action.sigId]}</p>}
                      </div>
                      {/* Individual fix button (hidden while boost-all is running) */}
                      {!isBoostingAll && (
                        <button
                          onClick={() => handleScorePageFix(action.sigId)}
                          disabled={fixingSignalId !== null || isDone}
                          className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40"
                          style={isDone
                            ? { borderColor: '#059669', color: '#059669', background: 'transparent' }
                            : { borderColor: NAV + '40', color: NAV, background: 'transparent' }}
                        >
                          {isActive ? (
                            <><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg></>
                          ) : isDone ? '✓' : '✦'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Dimension cards */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-widest px-1" style={{ color: NAV + '99' }}>Dimension Breakdown</h3>

          <DimensionCard title="Human Voice" icon="🗣️" score={results.humanVoice.humanScore} issues={hvIssues} passes={hvPasses} cfEnriched={results.cfEnriched} />
          <DimensionCard title="Bullet Quality" icon="📌" score={results.bulletQuality.score} issues={results.bulletQuality.issues} />
          <DimensionCard title="Career Logic" icon="📈" score={sScore} issues={clIssues}
            passes={clIssues.length === 0 ? ['No seniority mismatches — your level of responsibility matches your career stage.'] : []} />
          {results.atsMatch ? (
            <DimensionCard title="ATS Keyword Match" icon="🔍" score={atsData!.displayScore} issues={atsIssues} passes={atsPasses} />
          ) : (
            <DimensionCard title="ATS Keyword Match" icon="🔍" score={0} locked lockMessage="Paste a job description below and re-score to unlock this dimension." issues={[]} />
          )}
          <EvidenceScoreCard report={results.evidenceScore} />
          <AchievementDensityCard report={results.densityScore} />
          <MetricStrengthCard report={results.metricStrength} />
          <VerbVarietyCard report={results.verbVariety} currentCV={currentCV!} onCVUpdate={onCVUpdate} />
        </div>

        {/* Re-score with JD */}
        {!results.atsMatch && (
          <div className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-neutral-700 p-4">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Add a Job Description to unlock ATS Match scoring</p>
            <textarea value={jd} onChange={e => setJd(e.target.value)} placeholder="Paste the full job description here…"
              rows={5} className="w-full text-sm rounded-xl border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-800 dark:text-zinc-100 p-3 resize-y focus:outline-none transition-all placeholder-zinc-400"
              style={{ '--tw-ring-color': GOLD + '60' } as React.CSSProperties}
            />
            <button onClick={runScore} disabled={!jd.trim()} className="mt-2 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              style={{ background: GOLD }}>
              Re-score with ATS Match
            </button>
          </div>
        )}

        {/* ── Score History Timeline ── */}
        {scoreHistory.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-900">
            <button
              onClick={() => setHistoryExpanded(e => !e)}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-neutral-800/60 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">📈</span>
                <div className="text-left">
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Score Improvement History</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{scoreHistory.length} boost session{scoreHistory.length !== 1 ? 's' : ''} recorded</p>
                </div>
              </div>
              <span className="text-zinc-400 text-xs">{historyExpanded ? '▲' : '▼'}</span>
            </button>
            {historyExpanded && (
              <div className="border-t border-zinc-100 dark:border-neutral-800">
                {/* Sparkline summary row */}
                <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto">
                  {[...scoreHistory].reverse().map((snap, i) => {
                    const m = scoreMeta(snap.afterScore);
                    return (
                      <React.Fragment key={snap.id}>
                        {i > 0 && <div className="flex-shrink-0 w-6 h-0.5 bg-zinc-200 dark:bg-neutral-700" />}
                        <div className="flex-shrink-0 flex flex-col items-center gap-1">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                               style={{ background: m.bar }}>
                            {snap.afterScore}
                          </div>
                          <p className="text-[9px] text-zinc-400 whitespace-nowrap">{new Date(snap.timestamp).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</p>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
                {/* Session detail cards */}
                <div className="divide-y divide-zinc-100 dark:divide-neutral-800">
                  {scoreHistory.map(snap => {
                    const delta = snap.delta;
                    const deltaMeta = delta > 0 ? { color: '#059669', prefix: '+' } : delta < 0 ? { color: '#dc2626', prefix: '' } : { color: '#a1a1aa', prefix: '±' };
                    return (
                      <div key={snap.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">{snap.cvName}</p>
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                              {new Date(snap.timestamp).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                            </p>
                            {snap.fixesApplied.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {snap.fixesApplied.map(f => (
                                  <span key={f} className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400">{f}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-2 text-right">
                            <div className="text-xs text-zinc-400">
                              <span className="line-through">{snap.beforeScore}</span>
                              <span className="mx-1 text-zinc-300">→</span>
                              <span className="font-bold text-zinc-700 dark:text-zinc-200">{snap.afterScore}</span>
                            </div>
                            <span className="text-sm font-black tabular-nums" style={{ color: deltaMeta.color }}>
                              {deltaMeta.prefix}{delta}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-800/40 flex justify-end">
                  <button
                    onClick={() => { localStorage.removeItem(HISTORY_KEY); setScoreHistory([]); }}
                    className="text-[11px] text-zinc-400 hover:text-rose-500 transition-colors"
                  >
                    Clear history
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4 justify-between" style={{ background: NAV }}>
          <div>
            <h3 className="font-bold text-base text-white">Ready to fix these issues automatically?</h3>
            <p className="text-sm mt-0.5" style={{ color: '#94a8c4' }}>ProCV's AI rewrites your CV addressing every flagged issue above.</p>
          </div>
          <button onClick={onGoToGenerator} className="flex-shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm text-white whitespace-nowrap transition-colors hover:opacity-90"
            style={{ background: GOLD }}>
            Fix My CV with AI →
          </button>
        </div>
      </div>
    );
  }

  // ── Input view ───────────────────────────────────────────────────────────
  const cvName = currentCV.name || `${(currentCV.experience?.[0]?.jobTitle ?? 'CV')}`;
  const bulletCount = (currentCV.experience ?? []).reduce((n, r) => n + (r.responsibilities ?? []).length, 0);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 shadow-sm"
             style={{ background: NAV }}>
          📊
        </div>
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-50 leading-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}>
            Score My CV
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {cfStatus === 'live'
              ? <span>Instant 8-dimension analysis · <span style={{ color: GOLD }} className="font-medium">⚡ Live engine data loaded</span></span>
              : cfStatus === 'offline'
              ? 'Instant 8-dimension analysis · Using built-in lists'
              : 'Instant 8-dimension analysis · Loading engine data…'
            }
          </p>
        </div>
      </div>

      {/* CV card */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
               style={{ background: NAV + '15' }}>
            📄
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-zinc-800 dark:text-zinc-100 truncate">{cvName}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {(currentCV.experience ?? []).length} role{(currentCV.experience ?? []).length !== 1 ? 's' : ''} · {bulletCount} bullets · {(currentCV.skills ?? []).length} skills
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
            Ready
          </span>
        </div>
      </div>

      {/* ── Past score history — visible even before scoring ── */}
      {scoreHistory.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-900">
          <button
            onClick={() => setHistoryExpanded(e => !e)}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-neutral-800/60 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base">📈</span>
              <div className="text-left">
                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Score Improvement History</p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  Best: <span className="font-semibold" style={{ color: GOLD }}>{Math.max(...scoreHistory.map(s => s.afterScore))}</span>
                  {' · '}Total improvement: <span className="font-semibold text-emerald-600">+{scoreHistory.reduce((a,s) => a + Math.max(0, s.delta), 0)}</span>
                  {' · '}{scoreHistory.length} session{scoreHistory.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <span className="text-zinc-400 text-xs">{historyExpanded ? '▲' : '▼'}</span>
          </button>
          {historyExpanded && (
            <div className="border-t border-zinc-100 dark:border-neutral-800">
              {/* Sparkline */}
              <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto">
                {[...scoreHistory].reverse().map((snap, i) => {
                  const m = scoreMeta(snap.afterScore);
                  return (
                    <React.Fragment key={snap.id}>
                      {i > 0 && <div className="flex-shrink-0 w-6 h-0.5 bg-zinc-200 dark:bg-neutral-700" />}
                      <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white" style={{ background: m.bar }}>
                          {snap.afterScore}
                        </div>
                        <p className="text-[9px] text-zinc-400 whitespace-nowrap">{new Date(snap.timestamp).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</p>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-neutral-800">
                {scoreHistory.map(snap => {
                  const delta = snap.delta;
                  const dc = delta > 0 ? '#059669' : delta < 0 ? '#dc2626' : '#a1a1aa';
                  const dp = delta > 0 ? '+' : '';
                  return (
                    <div key={snap.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">{snap.cvName}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{new Date(snap.timestamp).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</p>
                      </div>
                      <div className="text-xs text-zinc-400 text-right">
                        <span className="line-through">{snap.beforeScore}</span>
                        <span className="mx-1">→</span>
                        <span className="font-bold text-zinc-700 dark:text-zinc-200">{snap.afterScore}</span>
                      </div>
                      <span className="text-sm font-black tabular-nums w-8 text-right" style={{ color: dc }}>{dp}{delta}</span>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-800/40 flex justify-end">
                <button onClick={() => { localStorage.removeItem(HISTORY_KEY); setScoreHistory([]); }} className="text-[11px] text-zinc-400 hover:text-rose-500 transition-colors">
                  Clear history
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* What we check */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {[
          { icon: '🗣️', label: 'Human Voice',         desc: '8 recruiter signals + live CF data' },
          { icon: '📌', label: 'Bullet Quality',       desc: 'AI-tell & structure checks' },
          { icon: '📈', label: 'Career Logic',         desc: 'Seniority coherence' },
          { icon: '🔬', label: 'Evidence Score',       desc: 'Skill proof vs. just listing' },
          { icon: '🏆', label: 'Achievement Density',  desc: 'Achievements vs. duties ratio' },
          { icon: '📊', label: 'Metric Strength',      desc: 'Weak / medium / strong numbers' },
          { icon: '🔤', label: 'Verb Variety',         desc: 'Overused & weak openers + auto-fix' },
          { icon: '🔍', label: 'ATS Match',            desc: 'JD keyword gap (optional)' },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="rounded-xl border border-zinc-200 dark:border-neutral-700 p-3 text-center bg-[#F8F7F4] dark:bg-neutral-900">
            <div className="text-2xl mb-1">{icon}</div>
            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{label}</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-snug">{desc}</p>
          </div>
        ))}
      </div>

      {/* Optional JD */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
        <button onClick={() => setJdExpanded(e => !e)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors">
          <span className="flex items-center gap-2">
            <span>🔍</span>
            <span>Paste a job description <span className="text-zinc-400 dark:text-zinc-500 font-normal">(optional — unlocks ATS Match score)</span></span>
          </span>
          <span className="text-zinc-400">{jdExpanded ? '▲' : '▼'}</span>
        </button>
        {jdExpanded && (
          <div className="border-t border-zinc-100 dark:border-neutral-700 p-4">
            <textarea value={jd} onChange={e => setJd(e.target.value)}
              placeholder="Paste the full job description here — the more text, the more accurate the keyword analysis…"
              rows={7} className="w-full text-sm rounded-xl border border-zinc-200 dark:border-neutral-600 bg-zinc-50 dark:bg-neutral-800 text-zinc-800 dark:text-zinc-100 p-3 resize-y focus:outline-none placeholder-zinc-400"
            />
            {jd.trim() && (
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{jd.trim().split(/\s+/).length} words · ATS Match will be included</p>
            )}
          </div>
        )}
      </div>

      {/* Score button */}
      <button onClick={runScore} disabled={scoring || cfStatus === 'loading'}
        className="w-full py-4 rounded-2xl font-bold text-lg text-white flex items-center justify-center gap-3 transition-opacity disabled:opacity-60"
        style={{ background: NAV, boxShadow: `0 8px 32px ${NAV}30` }}>
        {scoring ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Analysing your CV…
          </>
        ) : (
          <>
            <span>📊</span>
            Score My CV — Free &amp; Instant
          </>
        )}
      </button>

      <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
        {cfStatus === 'live'
          ? '⚡ Using live banned-phrase data from ProCV engine · Results in under 1 second'
          : 'Zero AI tokens · Results in under 1 second'}
      </p>
    </div>
  );
};

export default ScoreMyCVPage;
