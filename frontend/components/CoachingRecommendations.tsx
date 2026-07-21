/**
 * CoachingRecommendations.tsx
 *
 * Shared coaching tips component used by BuildReportPage (Coach tab) and
 * ScoreMyCVPage (after score results). Every tip now ships with an action:
 *   — Auto-fixable tips  → "Fix Now" button (instant, no AI)
 *   — Manual tips        → expandable "How to Fix" panel with steps + example
 *   — ATS tips           → "Generate Tailored CV" button
 */

import React, { useState, useMemo } from 'react';
import type { CVData } from '../types';
import type { CVBuildReport } from '../types/buildReport';
import {
  classifyBullets,
} from '../services/cvDoctorService';
import { scoreHRDetection } from '../services/hrDetectorSimulation';
import { scoreEvidenceStrength } from '../services/cvEvidenceScore';
import { scoreAchievementDensity } from '../services/cvAchievementDensity';
import { scoreVerbVariety } from '../services/cvVerbVariety';
import { fixAiIsms, fixVerbVariety as fixVerbVarietyFn } from '../services/cvAutoFixer';
import {
  Shield, Award, Zap, TrendingUp, Lightbulb, Sparkles,
  BarChart3, Target, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, Wrench, ArrowRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type FixAction =
  | { kind: 'auto'; fixerId: 'aiisms' | 'verbs' }
  | { kind: 'navigate'; label: string }
  | { kind: 'guide'; steps: string[]; exampleBefore?: string; exampleAfter?: string };

export interface CoachTip {
  priority: 'high' | 'medium' | 'low';
  icon: React.ReactNode;
  title: string;
  detail: string;
  fix: FixAction;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildCoachingTips(cv: CVData, report: CVBuildReport | null): CoachTip[] {
  const tips: CoachTip[] = [];

  const annotations = classifyBullets(cv);
  const flagged     = annotations.filter(a => a.primaryIssue !== 'good');
  const scores      = (() => {
    try {
      const hrResult   = scoreHRDetection(cv);
      const evResult   = scoreEvidenceStrength(cv);
      const achResult  = scoreAchievementDensity(cv);
      const verbResult = scoreVerbVariety(cv);
      return {
        humanVoice:  hrResult.humanScore,
        evidence:    evResult.score,
        achievement: achResult.score,
        verbVariety: verbResult.score,
        composite:   Math.round((hrResult.humanScore + evResult.score + achResult.score + verbResult.score) / 4),
      };
    } catch {
      return { humanVoice: 50, evidence: 50, achievement: 50, verbVariety: 50, composite: 50 };
    }
  })();

  const issueMap = flagged.reduce<Record<string, number>>((acc, a) => {
    acc[a.primaryIssue] = (acc[a.primaryIssue] ?? 0) + 1;
    return acc;
  }, {});

  // ── AI / pronoun language ──
  if ((issueMap['ai_language'] ?? 0) + (issueMap['pronoun'] ?? 0) > 2) {
    tips.push({
      priority: 'high',
      icon: <Shield className="w-4 h-4" />,
      title: 'Remove AI-sounding language',
      detail: `${(issueMap['ai_language'] ?? 0) + (issueMap['pronoun'] ?? 0)} bullets use AI buzzwords or first-person pronouns. Auto-Fix removes them instantly.`,
      fix: { kind: 'auto', fixerId: 'aiisms' },
    });
  }

  // ── Missing metrics ──
  if ((issueMap['no_metric'] ?? 0) >= 3) {
    tips.push({
      priority: 'high',
      icon: <Award className="w-4 h-4" />,
      title: 'Add numbers to your bullets',
      detail: `${issueMap['no_metric']} bullets have no metric. Numbers instantly make bullets more credible — even rough estimates outperform no number.`,
      fix: {
        kind: 'guide',
        steps: [
          'Ask: "How many? How much? How fast? What % improvement?"',
          'Use ranges when exact numbers aren\'t available (e.g. "20–30%", "team of 5–8")',
          'Include £/$/€ values, headcount, timeframes, and scale indicators',
          'Even "one of three engineers" is stronger than "helped the engineering team"',
        ],
        exampleBefore: 'Managed relationships with key clients and improved satisfaction scores.',
        exampleAfter:  'Managed 12 enterprise accounts (£4M ARR) and lifted NPS from 42 to 71 over 6 months.',
      },
    });
  }

  // ── Passive voice ──
  if ((issueMap['passive_voice'] ?? 0) >= 2) {
    tips.push({
      priority: 'high',
      icon: <Zap className="w-4 h-4" />,
      title: 'Fix passive voice',
      detail: `${issueMap['passive_voice']} bullets use passive voice. Active, first-person-implied bullets show ownership and read much stronger.`,
      fix: {
        kind: 'guide',
        steps: [
          'Delete "was responsible for", "was tasked with", "helped to"',
          'Start with a strong past-tense verb that shows ownership',
          'You own the action — write it that way',
        ],
        exampleBefore: 'Was responsible for managing the deployment pipeline and was tasked with reducing failures.',
        exampleAfter:  'Rebuilt the deployment pipeline, cutting production failures by 73% across 4 environments.',
      },
    });
  }

  // ── Weak verbs ──
  if ((issueMap['weak_verb'] ?? 0) >= 2) {
    tips.push({
      priority: 'medium',
      icon: <TrendingUp className="w-4 h-4" />,
      title: 'Upgrade weak opening verbs',
      detail: `${issueMap['weak_verb']} bullets start with "helped", "worked on", or "assisted". Auto-Fix rotates them to stronger alternatives.`,
      fix: { kind: 'auto', fixerId: 'verbs' },
    });
  }

  // ── Tense mismatch ──
  if ((issueMap['tense_mismatch'] ?? 0) >= 1) {
    tips.push({
      priority: 'medium',
      icon: <Lightbulb className="w-4 h-4" />,
      title: 'Fix tense consistency',
      detail: `${issueMap['tense_mismatch']} bullet${issueMap['tense_mismatch'] !== 1 ? 's have' : ' has'} the wrong tense — recruiters notice this.`,
      fix: {
        kind: 'guide',
        steps: [
          'Current role → present tense ("Lead", "Manage", "Build")',
          'Past roles → past tense ("Led", "Managed", "Built")',
          'Don\'t mix tenses within the same role',
        ],
      },
    });
  }

  // ── Verb variety ──
  if (scores.verbVariety < 65) {
    tips.push({
      priority: 'medium',
      icon: <Sparkles className="w-4 h-4" />,
      title: 'Diversify your action verbs',
      detail: 'Several verbs are repeated across roles — a pattern ATS systems and recruiters both flag as templated. Auto-Fix rotates overused verbs to synonyms.',
      fix: { kind: 'auto', fixerId: 'verbs' },
    });
  }

  // ── Achievement density ──
  if (scores.achievement < 55) {
    tips.push({
      priority: 'high',
      icon: <BarChart3 className="w-4 h-4" />,
      title: 'Convert duty bullets into achievements',
      detail: 'More than half your bullets describe what you did (duties) rather than what you achieved. Achievements win interviews — duties get ignored.',
      fix: {
        kind: 'guide',
        steps: [
          'Use the Result + Action + Context formula: what changed, what you did, why it mattered',
          'Add a number to every converted bullet (see "Add numbers" tip)',
          'Focus on outcomes, not activities',
        ],
        exampleBefore: 'Responsible for running sprint planning meetings and coordinating with stakeholders.',
        exampleAfter:  'Cut time-to-delivery 35% by redesigning sprint planning — shipped 6 features per sprint vs 4 previously.',
      },
    });
  }

  // ── ATS keywords (only with a report) ──
  const missing = report?.atsReport?.missing ?? [];
  if (missing.length >= 4) {
    tips.push({
      priority: 'high',
      icon: <Target className="w-4 h-4" />,
      title: `Add ${Math.min(missing.length, 5)} missing ATS keywords`,
      detail: `Top missing: ${missing.slice(0, 5).join(', ')}. Generate a fresh tailored CV to automatically weave these into the right places.`,
      fix: {
        kind: 'navigate',
        label: 'Generate Tailored CV',
      },
    });
  }

  // ── Manual flags (only with a report) ──
  for (const flag of (report?.manualFlags ?? []).slice(0, 2)) {
    tips.push({
      priority: 'high',
      icon: <AlertTriangle className="w-4 h-4" />,
      title: flag.description.slice(0, 60) + (flag.description.length > 60 ? '…' : ''),
      detail: flag.description,
      fix: {
        kind: 'guide',
        steps: ['Review and manually rewrite the flagged section in your CV editor.'],
      },
    });
  }

  // ── Summary length ──
  const summaryLen = (cv.summary ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (summaryLen < 40) {
    tips.push({
      priority: 'medium',
      icon: <Lightbulb className="w-4 h-4" />,
      title: 'Expand your professional summary',
      detail: `Your summary is only ${summaryLen} words. Aim for 60–90: who you are, your strongest skill, and one concrete achievement.`,
      fix: {
        kind: 'guide',
        steps: [
          'Open your CV editor and expand the Summary / Profile section',
          'Include: [Role title] with [X years] in [domain], specialising in [top skill]',
          'Add one specific achievement: "including [outcome] at [company]"',
          'End with what you\'re targeting: "Currently seeking [role type] in [industry]"',
        ],
        exampleBefore: 'Experienced product manager looking for new opportunities.',
        exampleAfter:  'Product Manager with 7 years in B2B SaaS, specialising in growth and monetisation. Led a pricing redesign at Acme that lifted ARR 28% in Q3 2024. Seeking a Head of Product role in fintech or marketplace companies.',
      },
    });
  } else if (summaryLen > 120) {
    tips.push({
      priority: 'low',
      icon: <Lightbulb className="w-4 h-4" />,
      title: 'Tighten your summary',
      detail: `Your summary is ${summaryLen} words — aim for 90 max. Cut anything that doesn't add new information.`,
      fix: {
        kind: 'guide',
        steps: [
          'Remove filler phrases: "passionate", "team player", "results-driven"',
          'Delete anything that repeats what\'s already in your experience bullets',
          'Every sentence should answer: "so what?"',
        ],
      },
    });
  }

  if (tips.length === 0) {
    tips.push({
      priority: 'low',
      icon: <CheckCircle className="w-4 h-4" />,
      title: 'Your CV is in strong shape',
      detail: 'No major coaching recommendations. Keep generating role-specific versions for each job description to maximise your ATS match.',
      fix: {
        kind: 'guide',
        steps: ['Keep tailoring your CV per job description using the CV Generator.'],
      },
    });
  }

  const ORDER = { high: 0, medium: 1, low: 2 };
  return tips.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]).slice(0, 8);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const PRIORITY_STYLES = {
  high:   { dot: 'bg-[#C0392B]', badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300', label: 'High priority' },
  medium: { dot: 'bg-[#C9A84C]', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300', label: 'Medium' },
  low:    { dot: 'bg-[#2D6A4F]', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300', label: 'Low' },
};

interface TipCardProps {
  tip: CoachTip;
  cv: CVData;
  onUpdateCV?: (cv: CVData) => void;
  onGoToGenerator?: () => void;
}

function TipCard({ tip, cv, onUpdateCV, onGoToGenerator }: TipCardProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [fixCount, setFixCount] = useState(0);

  const styles = PRIORITY_STYLES[tip.priority];

  function handleAutoFix() {
    if (!onUpdateCV || fixing || fixed) return;
    setFixing(true);
    setTimeout(() => {
      try {
        let result: { updatedCV: CVData; fixCount: number };
        if (tip.fix.kind === 'auto') {
          if (tip.fix.fixerId === 'aiisms') {
            result = fixAiIsms(cv);
          } else {
            const verbReport = scoreVerbVariety(cv);
            result = fixVerbVarietyFn(cv, verbReport.overusedVerbs);
          }
          onUpdateCV(result.updatedCV);
          setFixCount(result.fixCount);
          setFixed(true);
        }
      } finally {
        setFixing(false);
      }
    }, 60);
  }

  return (
    <div className={`rounded-xl border border-border overflow-hidden transition-all ${fixed ? 'opacity-80' : 'bg-background/60'}`}>
      {/* Main row */}
      <div className="flex items-start gap-3 p-3.5">
        <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
            <p className={`text-sm font-semibold leading-snug ${fixed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {tip.title}
            </p>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${styles.badge}`}>
              {styles.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{tip.detail}</p>

          {/* Fixed confirmation */}
          {fixed && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
              {fixCount > 0 ? `${fixCount} fix${fixCount !== 1 ? 'es' : ''} applied` : 'CV already clean'}
            </div>
          )}

          {/* Action row */}
          {!fixed && (
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              {tip.fix.kind === 'auto' && onUpdateCV && (
                <button
                  onClick={handleAutoFix}
                  disabled={fixing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: '#1B2B4B' }}
                >
                  {fixing ? (
                    <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />Fixing…</>
                  ) : (
                    <><Wrench className="w-3 h-3" />Fix Now</>
                  )}
                </button>
              )}

              {tip.fix.kind === 'navigate' && onGoToGenerator && (
                <button
                  onClick={onGoToGenerator}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#1B2B4B' }}
                >
                  {tip.fix.label}
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}

              {tip.fix.kind === 'guide' && (
                <button
                  onClick={() => setGuideOpen(v => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
                >
                  How to Fix
                  {guideOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Guide panel */}
      {tip.fix.kind === 'guide' && guideOpen && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
          <ul className="space-y-1.5">
            {tip.fix.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#1B2B4B] text-white text-[9px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ul>
          {tip.fix.exampleBefore && tip.fix.exampleAfter && (
            <div className="space-y-1.5 mt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Example rewrite</p>
              <div className="rounded-lg p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30">
                <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 mb-0.5">Before</p>
                <p className="text-xs text-foreground/70 italic leading-relaxed">{tip.fix.exampleBefore}</p>
              </div>
              <div className="rounded-lg p-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mb-0.5">After</p>
                <p className="text-xs text-foreground/70 leading-relaxed">{tip.fix.exampleAfter}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main exported component ────────────────────────────────────────────────────

interface CoachingRecommendationsProps {
  cv: CVData;
  report: CVBuildReport | null;
  onUpdateCV?: (cv: CVData) => void;
  onGoToGenerator?: () => void;
  /** When true, shows "Coaching Recommendations" heading. Default: true */
  showHeading?: boolean;
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
