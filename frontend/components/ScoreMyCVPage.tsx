/**
 * ScoreMyCVPage.tsx
 *
 * Phase 2.1 — "Score My CV"
 *
 * Composite 5-dimension CV scoring — zero LLM tokens, instant results.
 * Directly competitive with Resume Worded's free score feature.
 *
 * Dimensions:
 *   1. Human Voice       — scoreHRDetection()         0–100
 *   2. Bullet Quality    — inline regex checks        0–100
 *   3. Career Logic      — auditSeniorityCoherence()  0–100
 *   4. ATS Match         — scoreAtsCoverage()         0–100  (requires JD)
 *   5. Overall           — weighted average
 */

import React, { useState, useCallback } from 'react';
import type { CVData } from '../types';
import { scoreHRDetection } from '../services/hrDetectorSimulation';
import type { HRDetectionResult, HRSignal } from '../services/hrDetectorSimulation';
import { scoreAtsCoverage } from '../services/cvAtsKeywords';
import type { AtsKeywordReport } from '../services/cvAtsKeywords';
import { auditSeniorityCoherence } from '../services/cvSeniorityCoherence';
import type { SeniorityCoherenceReport } from '../services/cvSeniorityCoherence';

// ─────────────────────────────────────────────────────────────────────────────
// Bullet Quality — inline deterministic scorer (no LLM, no network)
// ─────────────────────────────────────────────────────────────────────────────

interface BulletQualityIssue {
  severity: 'critical' | 'moderate';
  text: string;
  fix: string;
}

interface BulletQualityResult {
  score: number;
  issues: BulletQualityIssue[];
}

const FAKE_VERB_RX = /\b(greenfielded?|greenfield(?:ing|s)?|scaffolded?|scaffold(?:ing|s)?|materialized?|materializ(?:es|ing)|actioned?|action(?:ing|s)?|ideated?|ideating|solutioned?|solution(?:ing|s)?|conceptualized?|operationalized?)\b/i;
const CHAINED_METRIC_RX = /\b\d+\s*%[^.]{0,60}(?:resulting in|leading to|which led to|driving)\s*\d+\s*%/i;
const METRIC_RX = /\b\d[\d,.]*\s*(%|K|M|B|x|×|\+\s*years?)\b/i;
const SEEKING_RX = /\b(seeking to|looking to|aiming to|hoping to|excited to contribute|seeking an opportunity|seeking a role|looking for an opportunity)\b/i;
const BUZZWORD_RX = /\b(highly motivated|results[‐-]?driven|results[‐-]?oriented|passionate about|detail[‐-]?oriented|team player|self[‐-]?starter|go[‐-]?getter|dynamic professional|hard[‐-]?working)\b/i;

function scoreBulletQuality(cv: CVData): BulletQualityResult {
  const issues: BulletQualityIssue[] = [];

  // Collect all bullets
  const allBullets: string[] = [];
  for (const role of cv.experience ?? []) {
    for (const b of role.responsibilities ?? []) allBullets.push(b);
  }

  if (allBullets.length === 0) {
    return {
      score: 20,
      issues: [{ severity: 'critical', text: 'No experience bullets found.', fix: 'Add bullet-point responsibilities for each role in your experience section.' }],
    };
  }

  // Summary checks
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

  // Per-role checks
  for (const role of cv.experience ?? []) {
    const bs = role.responsibilities ?? [];
    if (bs.length === 0) continue;
    const label = `"${role.jobTitle ?? '?'} @ ${role.company ?? '?'}"`;

    // All-metrics (AI fabrication tell)
    const withMetric = bs.filter(b => METRIC_RX.test(b)).length;
    if (bs.length >= 4 && withMetric === bs.length) {
      issues.push({ severity: 'critical', text: `${label}: every bullet has a metric — a strong AI-generation signal.`, fix: 'Rewrite 1–2 bullets as purely qualitative (action + context, no number).' });
    }

    // Fake verbs
    const fakeBullets = bs.filter(b => FAKE_VERB_RX.test(b));
    if (fakeBullets.length > 0) {
      issues.push({ severity: 'moderate', text: `${label}: ${fakeBullets.length} bullet(s) use invented AI verbs (Greenfielded, Actioned, Ideated…).`, fix: 'Replace with a real strong verb: Built, Delivered, Reduced, Launched, Negotiated.' });
    }

    // Chained causal metrics
    if (bs.some(b => CHAINED_METRIC_RX.test(b))) {
      issues.push({ severity: 'moderate', text: `${label}: chained-causal metric ("X% resulting in Y%") — a fabrication signal.`, fix: 'Use a single standalone metric per bullet. Delete the causal chain.' });
    }

    // Stub bullets (< 8 words)
    const stubs = bs.filter(b => b.trim().split(/\s+/).filter(Boolean).length < 8);
    if (stubs.length > 1) {
      issues.push({ severity: 'moderate', text: `${label}: ${stubs.length} bullets under 8 words — too short to show real impact.`, fix: 'Expand each short bullet: add the context, tool, scale, or outcome.' });
    }

    // Arrow-separator bullets
    const arrowBullets = bs.filter(b => b.includes('→'));
    if (arrowBullets.length > 0) {
      issues.push({ severity: 'moderate', text: `${label}: ${arrowBullets.length} bullet(s) use "→" to chain sentences — an AI output artefact.`, fix: 'Split into separate bullets or rewrite as one continuous achievement sentence.' });
    }

    // Duplicate opener verbs
    const openers = bs.map(b => b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '');
    const seen = new Set<string>();
    let hasDupOpener = false;
    for (const op of openers) {
      if (op && seen.has(op)) { hasDupOpener = true; break; }
      if (op) seen.add(op);
    }
    if (hasDupOpener) {
      issues.push({ severity: 'moderate', text: `${label}: multiple bullets start with the same verb.`, fix: 'Vary your openers — use Led, Built, Delivered, Negotiated, Designed, Reduced…' });
    }
  }

  // Score: 100 - (critical×18 + moderate×8), floor 0
  const critCount = issues.filter(i => i.severity === 'critical').length;
  const modCount  = issues.filter(i => i.severity === 'moderate').length;
  const score     = Math.max(0, Math.min(100, 100 - critCount * 18 - modCount * 8));
  return { score, issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// Career Progression score from SeniorityCoherenceReport
// ─────────────────────────────────────────────────────────────────────────────

function seniorityScore(report: SeniorityCoherenceReport): number {
  const overreach  = report.issues.filter(i => i.kind === 'seniority_overreach').length;
  const underreach = report.issues.filter(i => i.kind === 'seniority_underreach').length;
  return Math.max(0, Math.min(100, 100 - overreach * 15 - underreach * 8));
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite score helpers
// ─────────────────────────────────────────────────────────────────────────────

function compositeScore(
  humanVoice: number,
  bulletQuality: number,
  careerLogic: number,
  atsMatch: number | null,
): number {
  if (atsMatch !== null) {
    return Math.round(humanVoice * 0.25 + bulletQuality * 0.25 + careerLogic * 0.25 + atsMatch * 0.25);
  }
  return Math.round(humanVoice * 0.34 + bulletQuality * 0.33 + careerLogic * 0.33);
}

function scoreLabel(score: number): { label: string; color: string; ring: string; bg: string } {
  if (score >= 85) return { label: 'Excellent', color: 'text-emerald-600', ring: '#059669', bg: 'bg-emerald-50 dark:bg-emerald-900/20' };
  if (score >= 70) return { label: 'Good',      color: 'text-teal-600',    ring: '#0d9488', bg: 'bg-teal-50 dark:bg-teal-900/20' };
  if (score >= 55) return { label: 'Fair',       color: 'text-amber-600',   ring: '#d97706', bg: 'bg-amber-50 dark:bg-amber-900/20' };
  if (score >= 35) return { label: 'Weak',       color: 'text-orange-600',  ring: '#ea580c', bg: 'bg-orange-50 dark:bg-orange-900/20' };
  return             { label: 'Poor',        color: 'text-red-600',     ring: '#dc2626', bg: 'bg-red-50 dark:bg-red-900/20' };
}

function barColor(score: number): string {
  if (score >= 85) return 'bg-emerald-500';
  if (score >= 70) return 'bg-teal-500';
  if (score >= 55) return 'bg-amber-500';
  if (score >= 35) return 'bg-orange-500';
  return 'bg-red-500';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface DimensionCardProps {
  title: string;
  score: number;
  icon: string;
  locked?: boolean;
  lockMessage?: string;
  issues: { severity: string; text: string; fix?: string }[];
  passes?: string[];
}

const DimensionCard: React.FC<DimensionCardProps> = ({ title, score, icon, locked, lockMessage, issues, passes }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = scoreLabel(score);
  const hasIssues = issues.length > 0;
  const hasPasses = (passes ?? []).length > 0;

  return (
    <div className={`rounded-xl border ${locked ? 'border-zinc-200 dark:border-neutral-700 opacity-60' : 'border-zinc-200 dark:border-neutral-700'} bg-white dark:bg-neutral-800 overflow-hidden`}>
      {/* Header row */}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${!locked && (hasIssues || hasPasses) ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-neutral-750' : ''}`}
        onClick={() => !locked && (hasIssues || hasPasses) && setExpanded(e => !e)}
      >
        <span className="text-xl flex-shrink-0" aria-hidden="true">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">{title}</span>
            {!locked && <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>{meta.label}</span>}
          </div>
          {locked ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{lockMessage}</p>
          ) : (
            <div className="w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-700 ${barColor(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
          )}
        </div>
        {!locked && (
          <span className={`text-lg font-bold tabular-nums ${meta.color} flex-shrink-0`}>{score}</span>
        )}
        {!locked && (hasIssues || hasPasses) && (
          <span className="text-zinc-400 dark:text-zinc-500 flex-shrink-0 text-xs">
            {expanded ? '▲' : '▼'}
          </span>
        )}
      </div>

      {/* Expanded issues */}
      {!locked && expanded && (
        <div className="border-t border-zinc-100 dark:border-neutral-700 px-4 py-3 space-y-3">
          {issues.map((issue, i) => (
            <div key={i} className={`rounded-lg p-3 text-sm ${issue.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800'}`}>
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">{issue.severity === 'critical' ? '🔴' : '🟡'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-700 dark:text-zinc-300">{issue.text}</p>
                  {issue.fix && (
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400 text-xs">
                      <span className="font-medium">Fix: </span>{issue.fix}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {(passes ?? []).map((p, i) => (
            <div key={i} className="rounded-lg p-3 text-sm bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5">✅</span>
              <p className="text-zinc-700 dark:text-zinc-300">{p}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Score Gauge (SVG)
// ─────────────────────────────────────────────────────────────────────────────

const ScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const meta = scoreLabel(score);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="60" cy="60" r={r} fill="none"
            stroke={meta.ring}
            strokeWidth="10"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold ${meta.color}`}>{score}</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">/ 100</span>
        </div>
      </div>
      <span className={`mt-2 text-base font-semibold ${meta.color}`}>{meta.label}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ATS Match anti-gaming helper
// ─────────────────────────────────────────────────────────────────────────────

function atsEffectiveScore(report: AtsKeywordReport): { displayScore: number; warning: string | null } {
  const raw = report.score;
  if (raw > 88) {
    return {
      displayScore: raw,
      warning: `${raw}% match looks suspiciously high — ATS systems flag keyword-stuffed CVs. Aim for 65–80% for the most natural-sounding result.`,
    };
  }
  return { displayScore: raw, warning: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreMyCVPageProps {
  currentCV: CVData | null;
  onGoToGenerator: () => void;
}

interface ScoreResults {
  humanVoice: HRDetectionResult;
  bulletQuality: BulletQualityResult;
  careerLogic: SeniorityCoherenceReport;
  atsMatch: AtsKeywordReport | null;
  composite: number;
  scoredAt: Date;
}

const ScoreMyCVPage: React.FC<ScoreMyCVPageProps> = ({ currentCV, onGoToGenerator }) => {
  const [jd, setJd]             = useState('');
  const [jdExpanded, setJdExpanded] = useState(false);
  const [scoring, setScoring]   = useState(false);
  const [results, setResults]   = useState<ScoreResults | null>(null);

  const runScore = useCallback(async () => {
    if (!currentCV) return;
    setScoring(true);
    setResults(null);

    // All 3 pure-JS scorers run synchronously — just defer to next tick for UX
    await new Promise(r => setTimeout(r, 60));

    const humanVoice    = scoreHRDetection(currentCV);
    const bulletQuality = scoreBulletQuality(currentCV);
    const careerLogic   = auditSeniorityCoherence(currentCV);
    const atsMatch      = jd.trim() ? scoreAtsCoverage(currentCV, jd.trim()) : null;

    const sScore = seniorityScore(careerLogic);
    const aScore = atsMatch ? atsEffectiveScore(atsMatch).displayScore : null;
    const comp   = compositeScore(humanVoice.humanScore, bulletQuality.score, sScore, aScore);

    setResults({ humanVoice, bulletQuality, careerLogic, atsMatch, composite: comp, scoredAt: new Date() });
    setScoring(false);
  }, [currentCV, jd]);

  const reset = () => { setResults(null); setJd(''); setJdExpanded(false); };

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!currentCV || (!currentCV.summary && (currentCV.experience ?? []).length === 0)) {
    return (
      <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-10 text-center">
        <div className="text-5xl mb-4">📋</div>
        <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-2">No CV loaded yet</h2>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm mx-auto">Generate or load a CV first, then come back here to score it.</p>
        <button
          onClick={onGoToGenerator}
          className="px-5 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-semibold text-sm hover:bg-[#243561] transition-colors"
        >
          Go to CV Generator →
        </button>
      </div>
    );
  }

  // ── Results view ────────────────────────────────────────────────────────
  if (results) {
    const sScore    = seniorityScore(results.careerLogic);
    const atsData   = results.atsMatch ? atsEffectiveScore(results.atsMatch) : null;

    // Human Voice issues from signals
    const hvIssues = results.humanVoice.signals
      .filter(s => s.severity !== 'pass' && s.riskPts > 0)
      .map(s => ({ severity: s.riskPts >= 12 ? 'critical' as const : 'moderate' as const, text: s.detail, fix: s.fix }));
    const hvPasses = results.humanVoice.signals
      .filter(s => s.severity === 'pass')
      .map(s => s.label);

    // Career logic issues
    const clIssues = results.careerLogic.issues.map(i => ({
      severity: i.kind === 'seniority_overreach' ? 'critical' as const : 'moderate' as const,
      text: `${i.where}: ${i.detail} (flagged: "${i.flaggedPhrase}")`,
      fix: i.kind === 'seniority_overreach'
        ? 'Rephrase to match what an early-career role realistically does — execution, not strategy.'
        : 'Rewrite to show ownership: use "Led", "Delivered", "Drove" instead of "Helped", "Supported".',
    }));

    // ATS issues
    const atsIssues: { severity: 'critical' | 'moderate'; text: string; fix: string }[] = [];
    if (results.atsMatch) {
      const { missing, matched, keywords } = results.atsMatch;
      if (missing.length > 0) {
        atsIssues.push({
          severity: missing.length > keywords.length * 0.4 ? 'critical' : 'moderate',
          text: `${missing.length} JD keyword${missing.length > 1 ? 's' : ''} missing from your CV: ${missing.slice(0, 8).map(k => `"${k}"`).join(', ')}${missing.length > 8 ? '…' : ''}`,
          fix: 'Naturally weave missing keywords into your summary, skills, and bullet points.',
        });
      }
      if (atsData?.warning) {
        atsIssues.push({ severity: 'moderate', text: atsData.warning, fix: 'Remove keyword-heavy lists that read unnaturally. Focus on the 8–12 most important terms.' });
      }
      if (matched.length > 0 && atsIssues.length === 0) {
        // All good — no issues
      }
    }

    const atsPasses: string[] = [];
    if (results.atsMatch && results.atsMatch.matched.length > 0 && !atsData?.warning) {
      atsPasses.push(`${results.atsMatch.matched.length} of ${results.atsMatch.keywords.length} JD keywords found in your CV.`);
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">CV Score Report</h1>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              Scored {results.scoredAt.toLocaleTimeString()} · Zero AI tokens used
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="px-3 py-1.5 rounded-lg text-sm border border-zinc-300 dark:border-neutral-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
            >
              ↺ Re-score
            </button>
            <button
              onClick={onGoToGenerator}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-[#1B2B4B] text-white hover:bg-[#243561] transition-colors"
            >
              Fix My CV →
            </button>
          </div>
        </div>

        {/* Composite score + summary row */}
        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-6">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <ScoreGauge score={results.composite} />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 mb-1">Overall Score</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                {results.composite >= 85
                  ? 'Your CV is in excellent shape. Minor polishing may push it further.'
                  : results.composite >= 70
                  ? 'Solid CV with a few fixable gaps. Address the flagged issues to stand out.'
                  : results.composite >= 55
                  ? 'Several issues are hurting your chances. Work through the dimension cards below.'
                  : 'Significant improvements needed. Follow the fixes in each dimension card.'}
              </p>
              {/* Mini dimension bars */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  { label: 'Human Voice',     score: results.humanVoice.humanScore },
                  { label: 'Bullet Quality',  score: results.bulletQuality.score },
                  { label: 'Career Logic',    score: sScore },
                  { label: 'ATS Match',       score: results.atsMatch ? atsData!.displayScore : null },
                ].map(({ label, score }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">
                      <span>{label}</span>
                      <span className="font-medium">{score !== null ? score : '—'}</span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-1">
                      {score !== null && (
                        <div className={`h-1 rounded-full ${barColor(score)}`} style={{ width: `${score}%` }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!results.atsMatch && (
                <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500 italic">
                  💡 ATS Match not included — scroll down to paste a job description and re-score.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Dimension cards */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">Dimension Breakdown</h3>

          <DimensionCard
            title="Human Voice Score"
            icon="🗣️"
            score={results.humanVoice.humanScore}
            issues={hvIssues}
            passes={hvPasses}
          />

          <DimensionCard
            title="Bullet Quality"
            icon="📌"
            score={results.bulletQuality.score}
            issues={results.bulletQuality.issues}
          />

          <DimensionCard
            title="Career Logic"
            icon="📈"
            score={sScore}
            issues={clIssues}
            passes={clIssues.length === 0 ? ['No seniority mismatches detected — your level of responsibility matches your career stage.'] : []}
          />

          {results.atsMatch ? (
            <DimensionCard
              title="ATS Keyword Match"
              icon="🔍"
              score={atsData!.displayScore}
              issues={atsIssues}
              passes={atsPasses}
            />
          ) : (
            <DimensionCard
              title="ATS Keyword Match"
              icon="🔍"
              score={0}
              locked
              lockMessage="Paste a job description below and re-score to unlock this dimension."
              issues={[]}
            />
          )}
        </div>

        {/* Re-score with JD section */}
        {!results.atsMatch && (
          <div className="bg-zinc-50 dark:bg-neutral-800/50 rounded-xl border border-dashed border-zinc-300 dark:border-neutral-600 p-4">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Add a Job Description for ATS Match scoring</p>
            <textarea
              value={jd}
              onChange={e => setJd(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={5}
              className="w-full text-sm rounded-lg border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-800 dark:text-zinc-100 p-3 resize-y focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 placeholder-zinc-400"
            />
            <button
              onClick={runScore}
              disabled={!jd.trim()}
              className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#C9A84C] text-white hover:bg-[#b8973c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Re-score with ATS Match
            </button>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="bg-[#1B2B4B] rounded-2xl p-6 text-white flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div>
            <h3 className="font-bold text-base">Ready to fix these issues automatically?</h3>
            <p className="text-sm text-blue-200 mt-0.5">ProCV's AI will rewrite your CV addressing all the flagged issues above.</p>
          </div>
          <button
            onClick={onGoToGenerator}
            className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-[#C9A84C] hover:bg-[#b8973c] text-white font-bold text-sm transition-colors whitespace-nowrap"
          >
            Fix My CV with AI →
          </button>
        </div>
      </div>
    );
  }

  // ── Input view (idle / scoring) ─────────────────────────────────────────
  const cvName = currentCV.name || `${(currentCV.experience?.[0]?.jobTitle ?? 'CV')}`;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
          <span>📊</span> Score My CV
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Instant, zero-AI CV analysis across 4 dimensions. Compete with — and beat — Resume Worded.
        </p>
      </div>

      {/* CV being scored */}
      <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1B2B4B]/10 dark:bg-[#1B2B4B]/30 flex items-center justify-center text-xl">
            📄
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-zinc-800 dark:text-zinc-100 truncate">{cvName}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {(currentCV.experience ?? []).length} role{(currentCV.experience ?? []).length !== 1 ? 's' : ''} ·{' '}
              {(currentCV.experience ?? []).reduce((n, r) => n + (r.responsibilities ?? []).length, 0)} bullets ·{' '}
              {(currentCV.skills ?? []).length} skills
            </p>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">Ready to score</span>
        </div>
      </div>

      {/* What we check */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: '🗣️', label: 'Human Voice', desc: '8 recruiter-eye signals' },
          { icon: '📌', label: 'Bullet Quality', desc: 'Structure & AI-tell checks' },
          { icon: '📈', label: 'Career Logic', desc: 'Seniority coherence' },
          { icon: '🔍', label: 'ATS Match', desc: 'Keyword gap analysis' },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="bg-zinc-50 dark:bg-neutral-800/60 border border-zinc-100 dark:border-neutral-700 rounded-xl p-3 text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{desc}</p>
          </div>
        ))}
      </div>

      {/* Optional JD */}
      <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
        <button
          onClick={() => setJdExpanded(e => !e)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-750 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span>🔍</span>
            <span>Paste a job description <span className="text-zinc-400 dark:text-zinc-500 font-normal">(optional — unlocks ATS Match score)</span></span>
          </span>
          <span className="text-zinc-400">{jdExpanded ? '▲' : '▼'}</span>
        </button>
        {jdExpanded && (
          <div className="border-t border-zinc-100 dark:border-neutral-700 p-4">
            <textarea
              value={jd}
              onChange={e => setJd(e.target.value)}
              placeholder="Paste the full job description here — the more text, the more accurate the keyword analysis…"
              rows={7}
              className="w-full text-sm rounded-lg border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-750 text-zinc-800 dark:text-zinc-100 p-3 resize-y focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 placeholder-zinc-400"
            />
            {jd.trim() && (
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{jd.trim().split(/\s+/).length} words · ATS Match dimension will be included in your score</p>
            )}
          </div>
        )}
      </div>

      {/* Score button */}
      <button
        onClick={runScore}
        disabled={scoring}
        className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-[#1B2B4B] hover:bg-[#243561] disabled:opacity-60 transition-colors shadow-lg shadow-[#1B2B4B]/20 flex items-center justify-center gap-3"
      >
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
        Zero AI tokens · No data sent to servers · Results in under 1 second
      </p>
    </div>
  );
};

export default ScoreMyCVPage;
