/**
 * BuildReportPage.tsx — Standalone "Build" view.
 *
 * Shows the last CVBuildReport in a full-page layout.
 * Tabs: Fixed | Review | ATS | Skills | Doctor | Score | Coach
 *
 * New in this version:
 *  — Doctor tab  : instant colour-coded bullet inspector (classifyBullets, zero AI)
 *  — Score tab   : composite quality score across 4 dimensions
 *  — Coach tab   : actionable coaching advice + Auto-Optimize one-click fix
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { CVData } from '../types';
import type { CVBuildReport, ReviewItem, ManualFlag } from '../types/buildReport';
import {
  RepairedTab,
  ReviewTab,
  ATSTab,
  SkillsTab,
  ManualFlagsSection,
  CircularScore,
} from './BuildCompletePanel';
import {
  classifyBullets,
  ISSUE_META,
  type BulletAnnotation,
  type BulletIssueType,
} from '../services/cvDoctorService';
import { scoreHRDetection } from '../services/hrDetectorSimulation';
import { scoreEvidenceStrength } from '../services/cvEvidenceScore';
import { scoreAchievementDensity } from '../services/cvAchievementDensity';
import { scoreVerbVariety } from '../services/cvVerbVariety';
import { fixVerbVariety, fixAiIsms } from '../services/cvAutoFixer';
import {
  Wrench, Zap, Target, LayoutGrid, Cpu, ArrowRight,
  Stethoscope, BarChart3, GraduationCap, CheckCircle,
  Sparkles, ChevronDown, ChevronUp, AlertTriangle,
  TrendingUp, Shield, Award, Lightbulb,
} from 'lucide-react';

// ── Props ──────────────────────────────────────────────────────────────────────

interface BuildReportPageProps {
  report: CVBuildReport | null;
  cv: CVData | null;
  jobDescription?: string;
  onGoToGenerator: () => void;
  onApplySuggestion: (item: ReviewItem, updatedCV: CVData) => void;
  onSkipSuggestion: (itemId: string) => void;
  onFlagAction: (flag: ManualFlag) => void;
  onUpdateCV?: (cv: CVData) => void;
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type TabId = 'repaired' | 'review' | 'ats' | 'skills' | 'doctor' | 'score' | 'coach';

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onGoToGenerator }: { onGoToGenerator: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-6">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(201,168,76,0.12)' }}
      >
        <Cpu className="w-9 h-9" style={{ color: '#C9A84C' }} />
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-bold text-foreground">No build report yet</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Generate a CV and the Autonomous Repair Engine will automatically fix issues,
          score your ATS match, and reconcile your skills. The full report appears here.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-lg text-xs">
        {[
          { icon: <Wrench className="w-4 h-4" />, label: 'Auto-fixes weak language' },
          { icon: <Zap className="w-4 h-4" />,   label: 'One-click suggestions' },
          { icon: <Target className="w-4 h-4" />, label: 'ATS keyword score' },
          { icon: <BarChart3 className="w-4 h-4" />, label: 'Quality score' },
        ].map(({ icon, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border bg-background/60 text-muted-foreground"
          >
            {icon}
            <span className="text-center leading-tight">{label}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onGoToGenerator}
        className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: '#1B2B4B' }}
      >
        Generate a CV
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ value, label, colour }: { value: number | string; label: string; colour: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl border border-border bg-background/60">
      <span className="text-lg font-bold" style={{ color: colour }}>{value}</span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────

const ScoreBar: React.FC<{ label: string; score: number; icon: React.ReactNode }> = ({ label, score, icon }) => {
  const colour = score >= 80 ? '#2D6A4F' : score >= 60 ? '#C9A84C' : '#C0392B';
  const bg     = score >= 80 ? 'bg-[#2D6A4F]' : score >= 60 ? 'bg-[#C9A84C]' : 'bg-[#C0392B]';
  return (
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 flex-shrink-0 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-foreground/80 font-medium">{label}</span>
          <span className="text-xs font-bold" style={{ color: colour }}>{score}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${bg}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Doctor Tab ─────────────────────────────────────────────────────────────────

const ISSUE_ORDER: BulletIssueType[] = [
  'pronoun', 'ai_language', 'third_person', 'passive_voice',
  'tense_mismatch', 'weak_verb', 'ensuring_virus', 'no_metric',
  'bare_metric_opener', 'duplicate_word', 'too_short', 'too_long', 'good',
];

const DoctorBulletRow: React.FC<{ ann: BulletAnnotation }> = ({ ann }) => {
  const [open, setOpen] = useState(false);
  const meta = ISSUE_META[ann.primaryIssue];
  const isGood = ann.primaryIssue === 'good';

  return (
    <div className={`rounded-lg border-l-4 ${meta.colour} ${meta.border} mb-1.5 overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left px-3 py-2 flex items-start gap-2 group"
      >
        <span className={`flex-shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${meta.badge}`}>
          {meta.label}
        </span>
        <span className="text-xs text-foreground/80 leading-relaxed flex-1 min-w-0 line-clamp-2">
          {ann.text}
        </span>
        <span className="flex-shrink-0 text-muted-foreground/60 mt-0.5">
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-muted-foreground italic leading-relaxed">{meta.tip}</p>
          {!isGood && ann.issues.length > 1 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ann.issues.slice(1).map(issue => (
                <span key={issue} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${ISSUE_META[issue].badge}`}>
                  +{ISSUE_META[issue].label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DoctorTab({ cv }: { cv: CVData }) {
  const annotations = useMemo(() => classifyBullets(cv), [cv]);

  // Group by issue severity: flagged first, then good
  const flagged = annotations.filter(a => a.primaryIssue !== 'good');
  const clean   = annotations.filter(a => a.primaryIssue === 'good');

  // Issue frequency summary
  const issueCounts = flagged.reduce<Record<string, number>>((acc, a) => {
    acc[a.primaryIssue] = (acc[a.primaryIssue] ?? 0) + 1;
    return acc;
  }, {});

  const topIssues = ISSUE_ORDER
    .filter(t => issueCounts[t])
    .map(t => ({ type: t, count: issueCounts[t] }))
    .slice(0, 5);

  if (annotations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Stethoscope className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No bullets found to analyse.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-background/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: flagged.length === 0 ? 'rgba(45,106,79,0.12)' : 'rgba(201,168,76,0.12)' }}>
            <Stethoscope className="w-5 h-5" style={{ color: flagged.length === 0 ? '#2D6A4F' : '#C9A84C' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {flagged.length === 0
                ? 'All bullets look strong'
                : `${flagged.length} bullet${flagged.length !== 1 ? 's' : ''} need attention`}
            </p>
            <p className="text-xs text-muted-foreground">
              {clean.length} of {annotations.length} bullets pass all checks
            </p>
          </div>
        </div>
        {flagged.length > 0 && (
          <div className="text-right">
            <span className="text-2xl font-bold" style={{ color: '#C9A84C' }}>
              {Math.round((clean.length / annotations.length) * 100)}%
            </span>
            <p className="text-[10px] text-muted-foreground">pass rate</p>
          </div>
        )}
      </div>

      {/* Issue type breakdown pills */}
      {topIssues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topIssues.map(({ type, count }) => {
            const meta = ISSUE_META[type];
            return (
              <span key={type} className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${meta.badge}`}>
                {count}× {meta.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Flagged bullets */}
      {flagged.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            Issues to fix
          </p>
          {flagged.map((ann, i) => (
            <DoctorBulletRow key={i} ann={ann} />
          ))}
        </div>
      )}

      {/* Clean bullets (collapsed by default) */}
      {clean.length > 0 && flagged.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 select-none list-none py-1">
            <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
            Show {clean.length} passing bullet{clean.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2">
            {clean.map((ann, i) => <DoctorBulletRow key={i} ann={ann} />)}
          </div>
        </details>
      )}

      {clean.length > 0 && flagged.length === 0 && (
        <div>
          {clean.map((ann, i) => <DoctorBulletRow key={i} ann={ann} />)}
        </div>
      )}
    </div>
  );
}

// ── Score Tab ──────────────────────────────────────────────────────────────────

interface ScoreResults {
  humanVoice: number;
  evidence: number;
  achievement: number;
  verbVariety: number;
  composite: number;
}

function computeScores(cv: CVData): ScoreResults {
  const hrResult   = scoreHRDetection(cv);
  const evResult   = scoreEvidenceStrength(cv);
  const achResult  = scoreAchievementDensity(cv);
  const verbResult = scoreVerbVariety(cv);

  const humanVoice  = hrResult.humanScore;
  const evidence    = evResult.score;
  const achievement = achResult.score;
  const verbVariety = verbResult.score;
  const composite   = Math.round((humanVoice + evidence + achievement + verbVariety) / 4);

  return { humanVoice, evidence, achievement, verbVariety, composite };
}

function gradeLabel(score: number) {
  if (score >= 85) return { grade: 'A', label: 'Excellent', colour: '#2D6A4F' };
  if (score >= 75) return { grade: 'B', label: 'Good',      colour: '#2D6A4F' };
  if (score >= 60) return { grade: 'C', label: 'Fair',      colour: '#C9A84C' };
  if (score >= 40) return { grade: 'D', label: 'Weak',      colour: '#C0392B' };
  return { grade: 'F', label: 'Poor', colour: '#C0392B' };
}

function ScoreTab({ cv, atsScore }: { cv: CVData; atsScore?: number }) {
  const scores = useMemo(() => computeScores(cv), [cv]);
  const { grade, label, colour } = gradeLabel(scores.composite);

  const dims = [
    { label: 'Human Voice',      score: scores.humanVoice,  icon: <Shield className="w-4 h-4" /> },
    { label: 'Evidence & Impact', score: scores.evidence,   icon: <Award className="w-4 h-4" /> },
    { label: 'Achievement Density', score: scores.achievement, icon: <TrendingUp className="w-4 h-4" /> },
    { label: 'Verb Variety',     score: scores.verbVariety, icon: <Sparkles className="w-4 h-4" /> },
    ...(atsScore !== undefined
      ? [{ label: 'ATS Match', score: atsScore, icon: <Target className="w-4 h-4" /> }]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* Composite score hero */}
      <div className="flex items-center gap-5 p-4 rounded-xl border border-border bg-background/60">
        <CircularScore score={scores.composite} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black" style={{ color: colour }}>{grade}</span>
            <span className="text-base font-bold text-foreground">{label}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Composite CV quality score
          </p>
          <p className="text-xs text-foreground/60 mt-1.5 leading-relaxed">
            {scores.composite >= 75
              ? 'Your CV is in strong shape. Small refinements in the Coach tab will polish it further.'
              : scores.composite >= 55
              ? 'Solid foundation — focus on the highlighted dimensions below to push above 75.'
              : 'Several dimensions need attention. Use Auto-Optimize and the Coach tab to improve quickly.'}
          </p>
        </div>
      </div>

      {/* Dimension bars */}
      <div className="rounded-xl border border-border bg-background/60 p-4 space-y-4">
        <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">Score Breakdown</p>
        {dims.map(d => <ScoreBar key={d.label} {...d} />)}
      </div>

      {/* What each dimension means */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          { label: 'Human Voice',       desc: 'Absence of AI buzzwords, passive voice & pronoun leaks.' },
          { label: 'Evidence & Impact', desc: 'How many bullets include a measurable result or number.' },
          { label: 'Achievement Density', desc: 'Ratio of achievement bullets vs. plain duty descriptions.' },
          { label: 'Verb Variety',      desc: 'Diversity of strong action verbs — no overused openers.' },
        ].map(({ label, desc }) => (
          <div key={label} className="p-3 rounded-lg border border-border bg-background/40">
            <p className="text-[11px] font-semibold text-foreground/80">{label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Coach Tab ──────────────────────────────────────────────────────────────────

interface CoachTip {
  priority: 'high' | 'medium' | 'low';
  icon: React.ReactNode;
  title: string;
  detail: string;
}

function buildCoachingTips(cv: CVData, report: CVBuildReport): CoachTip[] {
  const tips: CoachTip[] = [];

  const annotations = classifyBullets(cv);
  const flagged = annotations.filter(a => a.primaryIssue !== 'good');
  const scores  = computeScores(cv);

  // Issue-specific tips
  const issueMap = flagged.reduce<Record<string, number>>((acc, a) => {
    acc[a.primaryIssue] = (acc[a.primaryIssue] ?? 0) + 1;
    return acc;
  }, {});

  if ((issueMap['ai_language'] ?? 0) + (issueMap['pronoun'] ?? 0) > 2) {
    tips.push({
      priority: 'high',
      icon: <Shield className="w-4 h-4" />,
      title: 'Remove AI-sounding language',
      detail: `${(issueMap['ai_language'] ?? 0) + (issueMap['pronoun'] ?? 0)} bullets use AI buzzwords or first-person pronouns. Auto-Optimize can fix these in one click.`,
    });
  }

  if ((issueMap['no_metric'] ?? 0) >= 3) {
    tips.push({
      priority: 'high',
      icon: <Award className="w-4 h-4" />,
      title: 'Add numbers to your bullets',
      detail: `${issueMap['no_metric']} bullets have no metric. Add a %, £/$, headcount, or timeframe to each — even rough estimates are far stronger than no number.`,
    });
  }

  if ((issueMap['passive_voice'] ?? 0) >= 2) {
    tips.push({
      priority: 'high',
      icon: <Zap className="w-4 h-4" />,
      title: 'Fix passive voice',
      detail: `${issueMap['passive_voice']} bullets use passive voice ("was responsible for", "was tasked with"). Start each with a strong action verb instead.`,
    });
  }

  if ((issueMap['weak_verb'] ?? 0) >= 2) {
    tips.push({
      priority: 'medium',
      icon: <TrendingUp className="w-4 h-4" />,
      title: 'Upgrade weak opening verbs',
      detail: `${issueMap['weak_verb']} bullets start with weak verbs. Replace "helped", "worked on", or "assisted" with specific, ownership-showing verbs like "Architected", "Delivered", or "Scaled".`,
    });
  }

  if ((issueMap['tense_mismatch'] ?? 0) >= 1) {
    tips.push({
      priority: 'medium',
      icon: <Lightbulb className="w-4 h-4" />,
      title: 'Fix tense consistency',
      detail: `${issueMap['tense_mismatch']} bullet${issueMap['tense_mismatch'] !== 1 ? 's have' : ' has'} the wrong tense. Current roles → present tense. Past roles → past tense.`,
    });
  }

  // Score-based tips
  if (scores.verbVariety < 65) {
    tips.push({
      priority: 'medium',
      icon: <Sparkles className="w-4 h-4" />,
      title: 'Diversify your action verbs',
      detail: 'Several verbs are repeated too many times across roles. Auto-Optimize will rotate synonyms automatically, or you can manually vary them in the CV editor.',
    });
  }

  if (scores.achievement < 55) {
    tips.push({
      priority: 'high',
      icon: <BarChart3 className="w-4 h-4" />,
      title: 'Convert duty bullets into achievements',
      detail: 'More than half your bullets describe what you did (duties) rather than what you achieved. Reframe using "Result + Action + Context" — e.g. "Cut deploy time 40% by rewriting the CI pipeline."',
    });
  }

  // ATS tips
  const missing = report.atsReport?.missing ?? [];
  if (missing.length >= 4) {
    tips.push({
      priority: 'high',
      icon: <Target className="w-4 h-4" />,
      title: `Add ${Math.min(missing.length, 5)} missing ATS keywords`,
      detail: `Top missing: ${missing.slice(0, 5).join(', ')}. Weave these naturally into your bullets or skills — don't just list them.`,
    });
  }

  // Manual flags
  for (const flag of report.manualFlags.slice(0, 2)) {
    tips.push({
      priority: 'high',
      icon: <AlertTriangle className="w-4 h-4" />,
      title: flag.description.slice(0, 60) + (flag.description.length > 60 ? '…' : ''),
      detail: flag.description,
    });
  }

  // Summary tip
  const summaryLen = (cv.summary ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (summaryLen < 40) {
    tips.push({
      priority: 'medium',
      icon: <Lightbulb className="w-4 h-4" />,
      title: 'Expand your professional summary',
      detail: `Your summary is only ${summaryLen} words. Aim for 60–90: who you are, your strongest skill, and one concrete achievement. Recruiters read this first.`,
    });
  } else if (summaryLen > 120) {
    tips.push({
      priority: 'low',
      icon: <Lightbulb className="w-4 h-4" />,
      title: 'Tighten your summary',
      detail: `Your summary is ${summaryLen} words — aim for 90 max. Every sentence should carry new information.`,
    });
  }

  if (tips.length === 0) {
    tips.push({
      priority: 'low',
      icon: <CheckCircle className="w-4 h-4" />,
      title: 'Your CV is in strong shape',
      detail: 'No major coaching recommendations. Keep generating role-specific versions and monitor ATS score for each job description.',
    });
  }

  // Sort: high → medium → low
  const ORDER = { high: 0, medium: 1, low: 2 };
  return tips.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]).slice(0, 8);
}

const PRIORITY_STYLES = {
  high:   { dot: 'bg-[#C0392B]', badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300', label: 'High priority' },
  medium: { dot: 'bg-[#C9A84C]', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300', label: 'Medium' },
  low:    { dot: 'bg-[#2D6A4F]', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300', label: 'Low' },
};

function CoachTab({
  cv,
  report,
  onAutoOptimize,
  optimizing,
  optimizeResult,
}: {
  cv: CVData;
  report: CVBuildReport;
  onAutoOptimize: () => void;
  optimizing: boolean;
  optimizeResult: { fixCount: number; done: boolean } | null;
}) {
  const tips = useMemo(() => buildCoachingTips(cv, report), [cv, report]);
  const highCount = tips.filter(t => t.priority === 'high').length;

  return (
    <div className="space-y-5">
      {/* Auto-Optimize hero card */}
      <div
        className="relative overflow-hidden rounded-2xl border p-5"
        style={{ borderColor: 'rgba(201,168,76,0.4)', background: 'linear-gradient(135deg, rgba(27,43,75,0.06) 0%, rgba(201,168,76,0.06) 100%)' }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(201,168,76,0.15)' }}
          >
            <Sparkles className="w-6 h-6" style={{ color: '#C9A84C' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground text-base">Auto-Optimize CV</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Fixes AI-isms, rotating overused verbs, and language issues in one click —
              no AI calls, instant and deterministic.
            </p>

            {optimizeResult?.done ? (
              <div className="mt-3 flex items-center gap-2 text-sm font-semibold" style={{ color: '#2D6A4F' }}>
                <CheckCircle className="w-4 h-4" />
                {optimizeResult.fixCount > 0
                  ? `${optimizeResult.fixCount} fix${optimizeResult.fixCount !== 1 ? 'es' : ''} applied to your CV`
                  : 'CV already clean — nothing to fix'}
              </div>
            ) : (
              <button
                onClick={onAutoOptimize}
                disabled={optimizing}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: '#1B2B4B' }}
              >
                {optimizing ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Optimizing…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto-Optimize Now
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* What it fixes */}
        <div className="mt-4 grid grid-cols-2 gap-1.5 text-[11px]">
          {[
            'Remove AI buzzwords', 'Fix verb repetition',
            'Clean AI-ism phrases', 'Preserve all your content',
          ].map(item => (
            <div key={item} className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle className="w-3 h-3 text-[#2D6A4F] flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Coaching tips */}
      <div>
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

        <div className="space-y-2">
          {tips.map((tip, i) => {
            const styles = PRIORITY_STYLES[tip.priority];
            return (
              <div
                key={i}
                className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-background/60"
              >
                <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground leading-snug">{tip.title}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${styles.badge}`}>
                      {styles.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tip.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BuildReportPage({
  report,
  cv,
  jobDescription,
  onGoToGenerator,
  onApplySuggestion,
  onSkipSuggestion,
  onFlagAction,
  onUpdateCV,
}: BuildReportPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('repaired');
  const [localItems, setLocalItems] = useState<ReviewItem[]>(report?.reviewItems ?? []);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<{ fixCount: number; done: boolean } | null>(null);

  // Sync items when a new report arrives
  useEffect(() => {
    setLocalItems(report?.reviewItems ?? []);
    setActiveTab('repaired');
    setOptimizeResult(null);
  }, [report?.generatedAt]);

  if (!report || !cv) {
    return <EmptyState onGoToGenerator={onGoToGenerator} />;
  }

  const pendingReviewCount = localItems.filter(i => !i.applied && !i.skipped).length;
  const atsScore = report.atsReport?.semanticScore ?? report.atsReport?.score;
  const builtAt  = new Date(report.generatedAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'repaired', label: 'Fixed',   icon: <Wrench className="w-4 h-4" /> },
    { id: 'review',   label: 'Review',  icon: <Zap className="w-4 h-4" />,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined },
    { id: 'ats',      label: 'ATS',     icon: <Target className="w-4 h-4" /> },
    { id: 'skills',   label: 'Skills',  icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'doctor',   label: 'Doctor',  icon: <Stethoscope className="w-4 h-4" /> },
    { id: 'score',    label: 'Score',   icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'coach',    label: 'Coach',   icon: <GraduationCap className="w-4 h-4" /> },
  ];

  const handleApply = useCallback((item: ReviewItem, updatedCV: CVData) => {
    setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, applied: true } : i));
    onApplySuggestion(item, updatedCV);
  }, [onApplySuggestion]);

  const handleSkip = useCallback((id: string) => {
    setLocalItems(prev => prev.map(i => i.id === id ? { ...i, skipped: true } : i));
    onSkipSuggestion(id);
  }, [onSkipSuggestion]);

  const handleAutoOptimize = useCallback(async () => {
    if (!onUpdateCV || optimizing) return;
    setOptimizing(true);
    try {
      // 1. Fix AI-isms (deterministic, instant)
      const aiismResult  = fixAiIsms(cv);
      let   workingCV    = aiismResult.updatedCV;
      let   totalFixes   = aiismResult.fixCount;

      // 2. Fix verb variety (deterministic, instant)
      const verbReport   = scoreVerbVariety(workingCV);
      const verbResult   = fixVerbVariety(workingCV, verbReport.overusedVerbs);
      workingCV          = verbResult.updatedCV;
      totalFixes        += verbResult.fixCount;

      // 3. Apply all pending one-click review items
      const pendingItems = localItems.filter(i => !i.applied && !i.skipped && i.suggested);
      for (const item of pendingItems) {
        if (item.location.kind === 'bullet') {
          const { roleIndex, bulletIndex } = item.location;
          workingCV = {
            ...workingCV,
            experience: workingCV.experience.map((role, rIdx) =>
              rIdx !== roleIndex ? role : {
                ...role,
                responsibilities: role.responsibilities.map((b, bIdx) =>
                  bIdx === bulletIndex ? item.suggested! : b
                ),
              }
            ),
          };
          totalFixes++;
        }
      }

      // Mark all pending items as applied locally
      if (pendingItems.length > 0) {
        setLocalItems(prev =>
          prev.map(i => pendingItems.some(p => p.id === i.id) ? { ...i, applied: true } : i)
        );
      }

      onUpdateCV(workingCV);
      setOptimizeResult({ fixCount: totalFixes, done: true });
    } finally {
      setOptimizing(false);
    }
  }, [cv, localItems, onUpdateCV, optimizing]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Cpu className="w-6 h-6" style={{ color: '#C9A84C' }} />
            Build Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Last generated {builtAt}</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Quick-access Coach button */}
          <button
            onClick={() => setActiveTab('coach')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors"
            style={{ borderColor: 'rgba(201,168,76,0.5)', color: '#C9A84C', background: 'rgba(201,168,76,0.06)' }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto-Optimize
          </button>
          <button
            onClick={onGoToGenerator}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: '#1B2B4B' }}
          >
            New CV
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Quality check banner ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Score pill — clickable to open Score tab */}
        <button
          onClick={() => setActiveTab('score')}
          className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border border-border bg-background/60 hover:bg-background transition-colors cursor-pointer"
        >
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Quality Score</span>
          <span className="text-sm font-bold" style={{ color: '#C9A84C' }}>→ Check</span>
        </button>
        <StatPill value={report.appliedCount} label="auto-fixed" colour="#2D6A4F" />
        <StatPill
          value={pendingReviewCount}
          label="to review"
          colour={pendingReviewCount > 0 ? '#C9A84C' : '#2D6A4F'}
        />
        {atsScore !== undefined ? (
          <StatPill
            value={`${atsScore}%`}
            label="ATS match"
            colour={atsScore >= 80 ? '#2D6A4F' : atsScore >= 60 ? '#C9A84C' : '#C0392B'}
          />
        ) : (
          <StatPill
            value={report.manualFlags.length}
            label={report.manualFlags.length === 1 ? 'manual flag' : 'manual flags'}
            colour={report.manualFlags.length > 0 ? '#C0392B' : '#2D6A4F'}
          />
        )}
      </div>

      {/* ── Tab panel ── */}
      <div className="bg-white dark:bg-neutral-800/50 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">

        {/* Tab bar */}
        <div className="flex items-center border-b border-border bg-background overflow-x-auto no-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-1.5 px-3 sm:px-4 py-3.5 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors',
                'flex-1 sm:flex-none justify-center sm:justify-start',
                activeTab === tab.id
                  ? 'text-foreground border-b-2 border-[#C9A84C] -mb-px bg-background'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#C9A84C] text-[#1B2B4B] text-[9px] font-bold">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5 sm:p-6">
          {activeTab === 'repaired' && <RepairedTab report={report} />}
          {activeTab === 'review' && (
            <ReviewTab
              items={localItems}
              cv={cv}
              onApply={handleApply}
              onSkip={handleSkip}
            />
          )}
          {activeTab === 'ats'    && <ATSTab report={report} />}
          {activeTab === 'skills' && <SkillsTab report={report} />}
          {activeTab === 'doctor' && <DoctorTab cv={cv} />}
          {activeTab === 'score'  && <ScoreTab cv={cv} atsScore={atsScore} />}
          {activeTab === 'coach'  && (
            <CoachTab
              cv={cv}
              report={report}
              onAutoOptimize={handleAutoOptimize}
              optimizing={optimizing}
              optimizeResult={optimizeResult}
            />
          )}

          {/* Manual flags — always shown at the bottom */}
          <ManualFlagsSection flags={report.manualFlags} onAction={onFlagAction} />
        </div>
      </div>
    </div>
  );
}
