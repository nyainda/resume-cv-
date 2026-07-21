/**
 * CoachingRecommendations.tsx
 *
 * Every coaching tip ships with an automatic fix:
 *   — Deterministic (instant, no LLM): AI-isms, verb variety
 *   — LLM bullet fix: passive voice, no metrics, weak verbs, duty→achievement, tense
 *   — LLM summary fix: too short, too long
 *   — Navigate: ATS keyword gaps → generate tailored CV
 */

import React, { useState, useMemo } from 'react';
import type { CVData } from '../types';
import type { CVBuildReport } from '../types/buildReport';
import { classifyBullets } from '../services/cvDoctorService';
import { scoreHRDetection } from '../services/hrDetectorSimulation';
import { scoreEvidenceStrength } from '../services/cvEvidenceScore';
import { scoreAchievementDensity } from '../services/cvAchievementDensity';
import { scoreVerbVariety } from '../services/cvVerbVariety';
import { fixAiIsms, fixVerbVariety as fixVerbVarietyFn } from '../services/cvAutoFixer';
import {
  fixBulletsForSignal,
  fixSummaryForSignal,
} from '../services/geminiService';
import {
  Shield, Award, Zap, TrendingUp, Lightbulb, Sparkles,
  BarChart3, Target, AlertTriangle, CheckCircle, ArrowRight, Wrench,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type FixAction =
  | { kind: 'auto';         fixerId: 'aiisms' | 'verbs' }
  | { kind: 'llm_bullets';  signalId: string }
  | { kind: 'llm_summary';  signalId: string }
  | { kind: 'navigate';     label: string };

export interface CoachTip {
  priority:  'high' | 'medium' | 'low';
  icon:       React.ReactNode;
  title:      string;
  detail:     string;
  fix:        FixAction;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildCoachingTips(cv: CVData, report: CVBuildReport | null): CoachTip[] {
  const tips: CoachTip[] = [];

  const annotations = classifyBullets(cv);
  const flagged     = annotations.filter(a => a.primaryIssue !== 'good');
  const scores = (() => {
    try {
      const hr   = scoreHRDetection(cv);
      const ev   = scoreEvidenceStrength(cv);
      const ach  = scoreAchievementDensity(cv);
      const verb = scoreVerbVariety(cv);
      return { humanVoice: hr.humanScore, evidence: ev.score, achievement: ach.score, verbVariety: verb.score };
    } catch {
      return { humanVoice: 50, evidence: 50, achievement: 50, verbVariety: 50 };
    }
  })();

  const issueMap = flagged.reduce<Record<string, number>>((acc, a) => {
    acc[a.primaryIssue] = (acc[a.primaryIssue] ?? 0) + 1;
    return acc;
  }, {});

  if ((issueMap['ai_language'] ?? 0) + (issueMap['pronoun'] ?? 0) > 2) {
    tips.push({
      priority: 'high',
      icon: <Shield className="w-4 h-4" />,
      title: 'Remove AI-sounding language',
      detail: `${(issueMap['ai_language'] ?? 0) + (issueMap['pronoun'] ?? 0)} bullets contain AI buzzwords or first-person pronouns. Auto-Fix removes them instantly.`,
      fix: { kind: 'auto', fixerId: 'aiisms' },
    });
  }

  if ((issueMap['no_metric'] ?? 0) >= 3) {
    tips.push({
      priority: 'high',
      icon: <Award className="w-4 h-4" />,
      title: 'Add numbers to your bullets',
      detail: `${issueMap['no_metric']} bullets have no measurable outcome. AI will rewrite them with [placeholder] metrics showing exactly where a number belongs.`,
      fix: { kind: 'llm_bullets', signalId: 'no_metric' },
    });
  }

  if ((issueMap['passive_voice'] ?? 0) >= 2) {
    tips.push({
      priority: 'high',
      icon: <Zap className="w-4 h-4" />,
      title: 'Fix passive voice',
      detail: `${issueMap['passive_voice']} bullets use passive voice ("was responsible for", "was tasked with"). AI rewrites them as active, ownership-showing bullets.`,
      fix: { kind: 'llm_bullets', signalId: 'passive_voice' },
    });
  }

  if ((issueMap['weak_verb'] ?? 0) >= 2) {
    tips.push({
      priority: 'medium',
      icon: <TrendingUp className="w-4 h-4" />,
      title: 'Upgrade weak opening verbs',
      detail: `${issueMap['weak_verb']} bullets start with "helped", "worked on", or "assisted". AI replaces them with strong ownership verbs.`,
      fix: { kind: 'llm_bullets', signalId: 'weak_verb' },
    });
  }

  if ((issueMap['tense_mismatch'] ?? 0) >= 1) {
    tips.push({
      priority: 'medium',
      icon: <Lightbulb className="w-4 h-4" />,
      title: 'Fix tense consistency',
      detail: `${issueMap['tense_mismatch']} bullet${issueMap['tense_mismatch'] !== 1 ? 's have' : ' has'} the wrong tense. AI corrects them — current role to present tense, past roles to past tense.`,
      fix: { kind: 'llm_bullets', signalId: 'tense_mismatch' },
    });
  }

  if (scores.verbVariety < 65) {
    tips.push({
      priority: 'medium',
      icon: <Sparkles className="w-4 h-4" />,
      title: 'Diversify your action verbs',
      detail: 'Several verbs repeat too many times across roles — a pattern that signals low effort. Auto-Fix rotates overused verbs to varied synonyms instantly.',
      fix: { kind: 'auto', fixerId: 'verbs' },
    });
  }

  if (scores.achievement < 55) {
    tips.push({
      priority: 'high',
      icon: <BarChart3 className="w-4 h-4" />,
      title: 'Convert duty bullets into achievements',
      detail: 'More than half your bullets describe what you did (duties) not what you achieved. AI rewrites them in Result → Action → Context format.',
      fix: { kind: 'llm_bullets', signalId: 'achievement_density' },
    });
  }

  const missing = report?.atsReport?.missing ?? [];
  if (missing.length >= 4) {
    tips.push({
      priority: 'high',
      icon: <Target className="w-4 h-4" />,
      title: `Add ${Math.min(missing.length, 5)} missing ATS keywords`,
      detail: `Top missing: ${missing.slice(0, 5).join(', ')}. Generate a fresh tailored CV to automatically weave these into the right places.`,
      fix: { kind: 'navigate', label: 'Generate Tailored CV' },
    });
  }

  for (const flag of (report?.manualFlags ?? []).slice(0, 2)) {
    tips.push({
      priority: 'high',
      icon: <AlertTriangle className="w-4 h-4" />,
      title: flag.description.slice(0, 60) + (flag.description.length > 60 ? '…' : ''),
      detail: flag.description,
      fix: { kind: 'navigate', label: 'Fix in Generator' },
    });
  }

  const summaryLen = (cv.summary ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (summaryLen < 40) {
    tips.push({
      priority: 'medium',
      icon: <Lightbulb className="w-4 h-4" />,
      title: 'Expand your professional summary',
      detail: `Your summary is only ${summaryLen} words. AI expands it to 60–90 words following the proven role + specialisation + achievement structure.`,
      fix: { kind: 'llm_summary', signalId: 'summary_too_short' },
    });
  } else if (summaryLen > 120) {
    tips.push({
      priority: 'low',
      icon: <Lightbulb className="w-4 h-4" />,
      title: 'Tighten your summary',
      detail: `Your summary is ${summaryLen} words — aim for 90 max. AI strips filler phrases and repetition, keeping all real facts.`,
      fix: { kind: 'llm_summary', signalId: 'summary_too_long' },
    });
  }

  if (tips.length === 0) {
    tips.push({
      priority: 'low',
      icon: <CheckCircle className="w-4 h-4" />,
      title: 'Your CV is in strong shape',
      detail: 'No major coaching issues found. Keep generating role-specific versions for each job description to maximise ATS match.',
      fix: { kind: 'navigate', label: 'Generate Tailored CV' },
    });
  }

  const ORDER = { high: 0, medium: 1, low: 2 };
  return tips.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]).slice(0, 8);
}

// ── Apply helpers ─────────────────────────────────────────────────────────────

async function applyLLMBulletFix(cv: CVData, signalId: string): Promise<{ cv: CVData; count: number }> {
  const allBullets = cv.experience.flatMap(r => r.responsibilities ?? []);
  if (allBullets.length === 0) return { cv, count: 0 };

  const fixed = await fixBulletsForSignal(allBullets, signalId);

  let idx = 0;
  const updatedExperience = cv.experience.map(role => ({
    ...role,
    responsibilities: (role.responsibilities ?? []).map(() => fixed[idx++]),
  }));

  const changed = fixed.filter((b, i) => b !== allBullets[i]).length;
  return { cv: { ...cv, experience: updatedExperience }, count: changed };
}

async function applyLLMSummaryFix(cv: CVData, signalId: string): Promise<{ cv: CVData; count: number }> {
  const fixed = await fixSummaryForSignal(cv.summary ?? '', signalId);
  const changed = fixed !== (cv.summary ?? '') ? 1 : 0;
  return { cv: { ...cv, summary: fixed }, count: changed };
}

// ── Priority styles ───────────────────────────────────────────────────────────

const PRIORITY_STYLES = {
  high:   { dot: 'bg-[#C0392B]', badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',   label: 'High priority' },
  medium: { dot: 'bg-[#C9A84C]', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300', label: 'Medium' },
  low:    { dot: 'bg-[#2D6A4F]', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300', label: 'Low' },
};

const FIX_LABELS: Record<FixAction['kind'], string> = {
  auto:        'Fix Now',
  llm_bullets: 'Auto-Fix with AI',
  llm_summary: 'Auto-Fix with AI',
  navigate:    '',  // label comes from tip
};

// ── TipCard ───────────────────────────────────────────────────────────────────

interface TipCardProps {
  tip:             CoachTip;
  cv:              CVData;
  onUpdateCV?:     (cv: CVData) => void;
  onGoToGenerator?: () => void;
}

function TipCard({ tip, cv, onUpdateCV, onGoToGenerator }: TipCardProps) {
  const [fixing,   setFixing]   = useState(false);
  const [fixed,    setFixed]    = useState(false);
  const [fixCount, setFixCount] = useState(0);
  const [error,    setError]    = useState<string | null>(null);

  const styles   = PRIORITY_STYLES[tip.priority];
  const canFix   = tip.fix.kind !== 'navigate' && !!onUpdateCV;
  const isLLM    = tip.fix.kind === 'llm_bullets' || tip.fix.kind === 'llm_summary';

  async function handleFix() {
    if (!onUpdateCV || fixing || fixed) return;
    setFixing(true);
    setError(null);
    try {
      let result: { cv: CVData; count: number };

      if (tip.fix.kind === 'auto') {
        if (tip.fix.fixerId === 'aiisms') {
          const r = fixAiIsms(cv);
          result = { cv: r.updatedCV, count: r.fixCount };
        } else {
          const verbReport = scoreVerbVariety(cv);
          const r = fixVerbVarietyFn(cv, verbReport.overusedVerbs);
          result = { cv: r.updatedCV, count: r.fixCount };
        }
      } else if (tip.fix.kind === 'llm_bullets') {
        result = await applyLLMBulletFix(cv, tip.fix.signalId);
      } else if (tip.fix.kind === 'llm_summary') {
        result = await applyLLMSummaryFix(cv, tip.fix.signalId);
      } else {
        return;
      }

      onUpdateCV(result.cv);
      setFixCount(result.count);
      setFixed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fix failed — check your API key in Settings');
    } finally {
      setFixing(false);
    }
  }

  return (
    <div className={`rounded-xl border border-border overflow-hidden transition-opacity ${fixed ? 'opacity-70' : 'bg-background/60'}`}>
      <div className="flex items-start gap-3 p-3.5">
        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />

        <div className="flex-1 min-w-0">
          {/* Title + badge */}
          <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
            <p className={`text-sm font-semibold leading-snug ${fixed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {tip.title}
            </p>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${styles.badge}`}>
              {styles.label}
            </span>
          </div>

          {/* Detail */}
          <p className="text-xs text-muted-foreground leading-relaxed">{tip.detail}</p>

          {/* Fixed confirmation */}
          {fixed && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
              {fixCount > 0
                ? `${fixCount} change${fixCount !== 1 ? 's' : ''} applied to your CV`
                : 'CV already clean — no changes needed'}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="mt-1.5 text-[11px] text-rose-500 leading-snug">{error}</p>
          )}

          {/* Action button */}
          {!fixed && (
            <div className="mt-2.5">
              {canFix ? (
                <button
                  onClick={handleFix}
                  disabled={fixing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: isLLM ? '#C9A84C' : '#1B2B4B', color: isLLM ? '#1B2B4B' : 'white' }}
                >
                  {fixing ? (
                    <>
                      <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      {isLLM ? 'AI fixing…' : 'Fixing…'}
                    </>
                  ) : (
                    <>
                      {isLLM ? <Sparkles className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                      {FIX_LABELS[tip.fix.kind]}
                    </>
                  )}
                </button>
              ) : tip.fix.kind === 'navigate' && onGoToGenerator ? (
                <button
                  onClick={onGoToGenerator}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#1B2B4B' }}
                >
                  {tip.fix.label}
                  <ArrowRight className="w-3 h-3" />
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────────

interface CoachingRecommendationsProps {
  cv:               CVData;
  report:           CVBuildReport | null;
  onUpdateCV?:      (cv: CVData) => void;
  onGoToGenerator?: () => void;
  showHeading?:     boolean;
}

export default function CoachingRecommendations({
  cv,
  report,
  onUpdateCV,
  onGoToGenerator,
  showHeading = true,
}: CoachingRecommendationsProps) {
  const tips      = useMemo(() => buildCoachingTips(cv, report), [cv, report]);
  const highCount = tips.filter(t => t.priority === 'high').length;

  return (
    <div className="space-y-2">
      {showHeading && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Coaching Recommendations
          </p>
          {highCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
              {highCount} high priority
            </span>
          )}
        </div>
      )}
      {tips.map((tip, i) => (
        <TipCard
          key={i}
          tip={tip}
          cv={cv}
          onUpdateCV={onUpdateCV}
          onGoToGenerator={onGoToGenerator}
        />
      ))}
    </div>
  );
}
