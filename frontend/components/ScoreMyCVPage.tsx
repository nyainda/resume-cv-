/**
 * ScoreMyCVPage.tsx
 *
 * Phase 2.1 — "Score My CV"
 *
 * Composite 4-dimension CV scoring.
 * Signal 1 (Human Voice) is augmented with live banned-phrase data from the
 * CF worker so it reflects the same rules used during generation.
 * Falls back to built-in lists when offline.
 *
 * Dimensions:
 *   1. Human Voice       — scoreHRDetection() + CF banned phrases  0–100
 *   2. Bullet Quality    — inline regex checks                      0–100
 *   3. Career Logic      — auditSeniorityCoherence()                0–100
 *   4. ATS Match         — scoreAtsCoverage() (requires JD)         0–100
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { CVData } from '../types';
import { scoreHRDetection } from '../services/hrDetectorSimulation';
import type { HRDetectionResult } from '../services/hrDetectorSimulation';
import { scoreAtsCoverage } from '../services/cvAtsKeywords';
import type { AtsKeywordReport } from '../services/cvAtsKeywords';
import { auditSeniorityCoherence } from '../services/cvSeniorityCoherence';
import type { SeniorityCoherenceReport } from '../services/cvSeniorityCoherence';
import { fetchCFBannedPhrases } from '../services/cvBannedPhrasesClient';

// Brand tokens
const NAV   = '#1B2B4B';
const GOLD  = '#C9A84C';
const CREAM = '#F8F7F4';

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

function compositeScore(humanVoice: number, bulletQuality: number, careerLogic: number, atsMatch: number | null): number {
  if (atsMatch !== null) return Math.round(humanVoice * 0.25 + bulletQuality * 0.25 + careerLogic * 0.25 + atsMatch * 0.25);
  return Math.round(humanVoice * 0.34 + bulletQuality * 0.33 + careerLogic * 0.33);
}

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
}

interface ScoreResults {
  humanVoice: HRDetectionResult;
  bulletQuality: BulletQualityResult;
  careerLogic: SeniorityCoherenceReport;
  atsMatch: AtsKeywordReport | null;
  composite: number;
  scoredAt: Date;
  cfEnriched: boolean;
}

const ScoreMyCVPage: React.FC<ScoreMyCVPageProps> = ({ currentCV, onGoToGenerator }) => {
  const [jd, setJd]                     = useState('');
  const [jdExpanded, setJdExpanded]     = useState(false);
  const [scoring, setScoring]           = useState(false);
  const [results, setResults]           = useState<ScoreResults | null>(null);
  const [cfPhrases, setCfPhrases]       = useState<{ openers: string[]; aiisms: string[] } | null>(null);
  const [cfStatus, setCfStatus]         = useState<'loading' | 'live' | 'offline'>('loading');

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

    const humanVoice    = scoreHRDetection(currentCV, extraOpeners, extraAiisms);
    const bulletQuality = scoreBulletQuality(currentCV);
    const careerLogic   = auditSeniorityCoherence(currentCV);
    const atsMatch      = jd.trim() ? scoreAtsCoverage(currentCV, jd.trim()) : null;

    const sScore = seniorityScore(careerLogic);
    const aScore = atsMatch ? atsEffectiveScore(atsMatch).displayScore : null;
    const comp   = compositeScore(humanVoice.humanScore, bulletQuality.score, sScore, aScore);

    setResults({ humanVoice, bulletQuality, careerLogic, atsMatch, composite: comp, scoredAt: new Date(), cfEnriched: cfStatus === 'live' });
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
                  { label: 'Human Voice',   score: results.humanVoice.humanScore },
                  { label: 'Bullet Quality', score: results.bulletQuality.score },
                  { label: 'Career Logic',  score: sScore },
                  { label: 'ATS Match',     score: results.atsMatch ? atsData!.displayScore : null },
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
              ? <span>Instant 4-dimension analysis · <span style={{ color: GOLD }} className="font-medium">⚡ Live engine data loaded</span></span>
              : cfStatus === 'offline'
              ? 'Instant 4-dimension analysis · Using built-in lists'
              : 'Instant 4-dimension analysis · Loading engine data…'
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

      {/* What we check */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { icon: '🗣️', label: 'Human Voice',    desc: '8 recruiter signals + live CF data' },
          { icon: '📌', label: 'Bullet Quality', desc: 'AI-tell & structure checks' },
          { icon: '📈', label: 'Career Logic',   desc: 'Seniority coherence' },
          { icon: '🔍', label: 'ATS Match',      desc: 'JD keyword gap (optional)' },
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
