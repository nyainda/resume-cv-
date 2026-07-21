/**
 * CoachingRecommendations.tsx
 *
 * Every tip has a full review-before-apply flow:
 *   1. User clicks "Fix with AI" (or "Fix Now" for instant fixes)
 *   2. AI runs — for LLM fixes a diff panel opens showing every changed line
 *   3. Each change shows BEFORE (read-only) and AFTER (editable — user can rewrite)
 *   4. Per-change accept/reject toggles + Accept All / Reject All
 *   5. "Apply N changes" commits only accepted edits to the live CV
 *
 * Instant fixes (aiisms / verb variety) apply immediately — no diff needed
 * because they're deterministic and fast to re-run.
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
  ChevronDown, ChevronUp, Check, X,
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

interface BulletChange {
  roleIdx:    number;
  roleTitle:  string;
  bulletIdx:  number;   // within that role's responsibilities[]
  globalIdx:  number;   // flat index across all roles
  before:     string;
  after:      string;   // AI suggestion
  custom:     string;   // user-editable — starts same as `after`
  accepted:   boolean;
}

interface SummaryChange {
  before:   string;
  after:    string;
  custom:   string;
  accepted: boolean;
}

type ReviewState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'review_bullets';  changes: BulletChange[] }
  | { phase: 'review_summary';  change:  SummaryChange }
  | { phase: 'applied';         count:   number }
  | { phase: 'error';           message: string };

// ── Tip builder ───────────────────────────────────────────────────────────────

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
      detail: `${(issueMap['ai_language'] ?? 0) + (issueMap['pronoun'] ?? 0)} bullets contain AI buzzwords or first-person pronouns that recruiters flag instantly.`,
      fix: { kind: 'auto', fixerId: 'aiisms' },
    });
  }

  if ((issueMap['no_metric'] ?? 0) >= 3) {
    tips.push({
      priority: 'high',
      icon: <Award className="w-4 h-4" />,
      title: 'Add numbers to your bullets',
      detail: `${issueMap['no_metric']} bullets have no measurable outcome. AI rewrites them with [placeholder] metrics showing exactly where a number belongs.`,
      fix: { kind: 'llm_bullets', signalId: 'no_metric' },
    });
  }

  if ((issueMap['passive_voice'] ?? 0) >= 2) {
    tips.push({
      priority: 'high',
      icon: <Zap className="w-4 h-4" />,
      title: 'Fix passive voice',
      detail: `${issueMap['passive_voice']} bullets use passive constructions ("was responsible for", "was tasked with"). AI converts them to active ownership bullets.`,
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
      detail: `${issueMap['tense_mismatch']} bullet${issueMap['tense_mismatch'] !== 1 ? 's have' : ' has'} the wrong tense. AI corrects them — current role in present tense, past roles in past tense.`,
      fix: { kind: 'llm_bullets', signalId: 'tense_mismatch' },
    });
  }

  if (scores.verbVariety < 65) {
    tips.push({
      priority: 'medium',
      icon: <Sparkles className="w-4 h-4" />,
      title: 'Diversify your action verbs',
      detail: 'Several verbs appear too many times across roles — a pattern that signals low effort to ATS and reviewers. Auto-Fix rotates overused verbs instantly.',
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
      detail: `Top missing: ${missing.slice(0, 5).join(', ')}. Generate a fresh tailored CV to weave these into the right places automatically.`,
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
      title: 'Tighten your professional summary',
      detail: `Your summary is ${summaryLen} words — aim for 90 max. AI strips filler phrases and repetition, keeping all real facts.`,
      fix: { kind: 'llm_summary', signalId: 'summary_too_long' },
    });
  }

  if (tips.length === 0) {
    tips.push({
      priority: 'low',
      icon: <CheckCircle className="w-4 h-4" />,
      title: 'CV is in strong shape',
      detail: 'No major coaching issues found. Keep generating role-specific versions for each job description to maximise ATS match.',
      fix: { kind: 'navigate', label: 'Generate Tailored CV' },
    });
  }

  const ORDER = { high: 0, medium: 1, low: 2 };
  return tips.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]).slice(0, 8);
}

// ── Priority styles ───────────────────────────────────────────────────────────

const PRIORITY_STYLES = {
  high:   { dot: 'bg-[#C0392B]', badge: 'bg-rose-50   text-rose-700   dark:bg-rose-950/30   dark:text-rose-300',   label: 'High priority' },
  medium: { dot: 'bg-[#C9A84C]', badge: 'bg-amber-50  text-amber-700  dark:bg-amber-950/30  dark:text-amber-300',  label: 'Medium' },
  low:    { dot: 'bg-[#2D6A4F]', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300', label: 'Low' },
};

// ── Diff panels ───────────────────────────────────────────────────────────────

interface BulletDiffPanelProps {
  changes:   BulletChange[];
  onUpdate:  (changes: BulletChange[]) => void;
  onApply:   () => void;
  onDiscard: () => void;
}

function BulletDiffPanel({ changes, onUpdate, onApply, onDiscard }: BulletDiffPanelProps) {
  const accepted = changes.filter(c => c.accepted);
  const [expanded, setExpanded] = useState<Set<number>>(new Set(changes.map((_, i) => i)));

  function toggle(idx: number, value: boolean) {
    onUpdate(changes.map((c, i) => i === idx ? { ...c, accepted: value } : c));
  }
  function acceptAll()  { onUpdate(changes.map(c => ({ ...c, accepted: true }))); }
  function rejectAll()  { onUpdate(changes.map(c => ({ ...c, accepted: false }))); }
  function setCustom(idx: number, value: string) {
    onUpdate(changes.map((c, i) => i === idx ? { ...c, custom: value } : c));
  }
  function toggleExpand(idx: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 dark:border-neutral-700 overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-neutral-800/60 border-b border-zinc-200 dark:border-neutral-700">
        <span className="text-xs font-bold text-foreground">
          AI found <span className="text-[#C9A84C]">{changes.length}</span> change{changes.length !== 1 ? 's' : ''} — review before applying
        </span>
        <div className="flex items-center gap-2">
          <button onClick={acceptAll}  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:opacity-80">Accept all</button>
          <button onClick={rejectAll}  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-100    dark:bg-rose-950/40    text-rose-700    dark:text-rose-400    hover:opacity-80">Reject all</button>
        </div>
      </div>

      {/* Change list */}
      <div className="divide-y divide-zinc-100 dark:divide-neutral-800 max-h-[420px] overflow-y-auto">
        {changes.map((ch, i) => {
          const open = expanded.has(i);
          return (
            <div key={i} className={`transition-colors ${ch.accepted ? 'bg-white dark:bg-neutral-900' : 'bg-zinc-50/80 dark:bg-neutral-800/40 opacity-60'}`}>
              {/* Row header */}
              <div className="flex items-center gap-2 px-3 py-2">
                {/* Accept toggle */}
                <button
                  onClick={() => toggle(i, !ch.accepted)}
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    ch.accepted
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-zinc-300 dark:border-neutral-600 bg-transparent'
                  }`}
                >
                  {ch.accepted && <Check className="w-3 h-3" />}
                </button>

                {/* Role badge */}
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                  {ch.roleTitle}
                </span>

                {/* Before text preview */}
                <span className="flex-1 text-xs text-zinc-400 dark:text-zinc-500 truncate line-through">
                  {ch.before}
                </span>

                {/* Expand toggle */}
                <button onClick={() => toggleExpand(i)} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                  {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Expanded detail — before + editable after */}
              {open && (
                <div className="px-3 pb-3 space-y-2">
                  {/* Before */}
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1">Before</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-neutral-800 rounded-lg px-3 py-2 leading-relaxed line-through">
                      {ch.before}
                    </p>
                  </div>
                  {/* After — editable */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">After (editable)</p>
                      {ch.custom !== ch.after && (
                        <button
                          onClick={() => setCustom(i, ch.after)}
                          className="text-[9px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline"
                        >
                          Reset to AI suggestion
                        </button>
                      )}
                    </div>
                    <textarea
                      value={ch.custom}
                      onChange={e => setCustom(i, e.target.value)}
                      rows={Math.max(2, Math.ceil(ch.custom.length / 80))}
                      className="w-full text-xs rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20 text-foreground px-3 py-2 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-neutral-800/60 border-t border-zinc-200 dark:border-neutral-700">
        <button onClick={onDiscard} className="text-xs text-muted-foreground hover:text-foreground underline">
          Discard all
        </button>
        <button
          onClick={onApply}
          disabled={accepted.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: '#2D6A4F' }}
        >
          <Check className="w-3 h-3" />
          Apply {accepted.length} change{accepted.length !== 1 ? 's' : ''} to CV
        </button>
      </div>
    </div>
  );
}

interface SummaryDiffPanelProps {
  change:    SummaryChange;
  onUpdate:  (change: SummaryChange) => void;
  onApply:   () => void;
  onDiscard: () => void;
}

function SummaryDiffPanel({ change, onUpdate, onApply, onDiscard }: SummaryDiffPanelProps) {
  return (
    <div className="mt-3 rounded-xl border border-zinc-200 dark:border-neutral-700 overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-neutral-800/60 border-b border-zinc-200 dark:border-neutral-700">
        <span className="text-xs font-bold text-foreground">
          AI rewrote your summary — review before applying
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate({ ...change, accepted: !change.accepted })}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
              change.accepted
                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-500'
            }`}
          >
            {change.accepted ? '✓ Accepted' : 'Rejected'}
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Before */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1">Before</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-neutral-800 rounded-lg px-3 py-2 leading-relaxed line-through">
            {change.before || '(no summary)'}
          </p>
        </div>

        {/* After — editable */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">After (editable)</p>
            {change.custom !== change.after && (
              <button
                onClick={() => onUpdate({ ...change, custom: change.after })}
                className="text-[9px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline"
              >
                Reset to AI suggestion
              </button>
            )}
          </div>
          <textarea
            value={change.custom}
            onChange={e => onUpdate({ ...change, custom: e.target.value })}
            rows={Math.max(3, Math.ceil(change.custom.length / 80))}
            className="w-full text-xs rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20 text-foreground px-3 py-2 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-emerald-400"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-neutral-800/60 border-t border-zinc-200 dark:border-neutral-700">
        <button onClick={onDiscard} className="text-xs text-muted-foreground hover:text-foreground underline">
          Discard
        </button>
        <button
          onClick={onApply}
          disabled={!change.accepted}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: '#2D6A4F' }}
        >
          <Check className="w-3 h-3" />
          Apply to CV
        </button>
      </div>
    </div>
  );
}

// ── TipCard ───────────────────────────────────────────────────────────────────

interface TipCardProps {
  tip:              CoachTip;
  cv:               CVData;
  onUpdateCV?:      (cv: CVData) => void;
  onGoToGenerator?: () => void;
}

function TipCard({ tip, cv, onUpdateCV, onGoToGenerator }: TipCardProps) {
  const [state, setState] = useState<ReviewState>({ phase: 'idle' });

  const styles = PRIORITY_STYLES[tip.priority];
  const isLLM  = tip.fix.kind === 'llm_bullets' || tip.fix.kind === 'llm_summary';

  // ── Run fix ────────────────────────────────────────────────────────────────
  async function runFix() {
    if (!onUpdateCV) return;
    setState({ phase: 'loading' });

    try {
      // ── Instant / deterministic ────────────────────────────────────────────
      if (tip.fix.kind === 'auto') {
        const r = tip.fix.fixerId === 'aiisms'
          ? fixAiIsms(cv)
          : (() => {
              const verbReport = scoreVerbVariety(cv);
              return fixVerbVarietyFn(cv, verbReport.overusedVerbs);
            })();
        onUpdateCV(r.updatedCV);
        setState({ phase: 'applied', count: r.fixCount });
        return;
      }

      // ── LLM bullets ────────────────────────────────────────────────────────
      if (tip.fix.kind === 'llm_bullets') {
        // Build flat bullet list with position metadata
        const allBullets: { roleIdx: number; roleTitle: string; bulletIdx: number; text: string }[] = [];
        cv.experience.forEach((role, ri) => {
          (role.responsibilities ?? []).forEach((b, bi) => {
            allBullets.push({
              roleIdx:   ri,
              roleTitle: role.jobTitle || `Role ${ri + 1}`,
              bulletIdx: bi,
              text:      b,
            });
          });
        });

        const flatTexts = allBullets.map(b => b.text);
        const fixed     = await fixBulletsForSignal(flatTexts, tip.fix.signalId);

        const changes: BulletChange[] = [];
        fixed.forEach((fixedText, globalIdx) => {
          const orig = allBullets[globalIdx];
          if (fixedText !== orig.text) {
            changes.push({
              roleIdx:   orig.roleIdx,
              roleTitle: orig.roleTitle,
              bulletIdx: orig.bulletIdx,
              globalIdx,
              before:    orig.text,
              after:     fixedText,
              custom:    fixedText,
              accepted:  true,
            });
          }
        });

        if (changes.length === 0) {
          setState({ phase: 'applied', count: 0 });
          return;
        }
        setState({ phase: 'review_bullets', changes });
        return;
      }

      // ── LLM summary ────────────────────────────────────────────────────────
      if (tip.fix.kind === 'llm_summary') {
        const before = cv.summary ?? '';
        const after  = await fixSummaryForSignal(before, tip.fix.signalId);

        if (!after || after === before) {
          setState({ phase: 'applied', count: 0 });
          return;
        }
        setState({
          phase: 'review_summary',
          change: { before, after, custom: after, accepted: true },
        });
      }
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'AI fix failed — check API key in Settings' });
    }
  }

  // ── Apply accepted bullet changes ──────────────────────────────────────────
  function applyBulletChanges() {
    if (state.phase !== 'review_bullets' || !onUpdateCV) return;
    const { changes } = state;

    // Map: "roleIdx:bulletIdx" → custom text (only accepted)
    const changeMap = new Map<string, string>();
    for (const c of changes) {
      if (c.accepted) changeMap.set(`${c.roleIdx}:${c.bulletIdx}`, c.custom.trim() || c.after);
    }

    const updatedCV: CVData = {
      ...cv,
      experience: cv.experience.map((role, ri) => ({
        ...role,
        responsibilities: (role.responsibilities ?? []).map((bullet, bi) =>
          changeMap.get(`${ri}:${bi}`) ?? bullet,
        ),
      })),
    };
    onUpdateCV(updatedCV);
    setState({ phase: 'applied', count: changeMap.size });
  }

  // ── Apply summary change ───────────────────────────────────────────────────
  function applySummaryChange() {
    if (state.phase !== 'review_summary' || !onUpdateCV) return;
    const { change } = state;
    if (!change.accepted) { setState({ phase: 'idle' }); return; }
    onUpdateCV({ ...cv, summary: change.custom.trim() || change.after });
    setState({ phase: 'applied', count: 1 });
  }

  const isDone = state.phase === 'applied';

  return (
    <div className={`rounded-xl border border-border overflow-hidden transition-opacity ${isDone ? 'opacity-60' : 'bg-background/60'}`}>
      <div className="flex items-start gap-3 p-3.5">
        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />

        <div className="flex-1 min-w-0">
          {/* Title + badge */}
          <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
            <p className={`text-sm font-semibold leading-snug ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {tip.title}
            </p>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${styles.badge}`}>
              {styles.label}
            </span>
          </div>

          {/* Detail */}
          <p className="text-xs text-muted-foreground leading-relaxed">{tip.detail}</p>

          {/* ── Status ── */}
          {isDone && state.phase === 'applied' && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
              {state.count > 0
                ? `${state.count} change${state.count !== 1 ? 's' : ''} applied to your CV`
                : 'Already clean — no changes needed'}
            </div>
          )}

          {state.phase === 'error' && (
            <p className="mt-1.5 text-[11px] text-rose-500 leading-snug">{state.message}</p>
          )}

          {/* ── Primary action button ── */}
          {state.phase === 'idle' && (
            <div className="mt-2.5">
              {tip.fix.kind === 'auto' && onUpdateCV && (
                <button
                  onClick={runFix}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#1B2B4B' }}
                >
                  <Wrench className="w-3 h-3" />
                  Fix Now
                </button>
              )}
              {(tip.fix.kind === 'llm_bullets' || tip.fix.kind === 'llm_summary') && onUpdateCV && (
                <button
                  onClick={runFix}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-90"
                  style={{ background: '#C9A84C', color: '#1B2B4B' }}
                >
                  <Sparkles className="w-3 h-3" />
                  Fix with AI
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
            </div>
          )}

          {/* Loading spinner */}
          {state.phase === 'loading' && (
            <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[#C9A84C] border-t-transparent animate-spin flex-shrink-0" />
              {isLLM ? 'AI is analysing and rewriting…' : 'Fixing…'}
            </div>
          )}

          {/* ── Diff review panels ── */}
          {state.phase === 'review_bullets' && (
            <BulletDiffPanel
              changes={state.changes}
              onUpdate={changes => setState({ phase: 'review_bullets', changes })}
              onApply={applyBulletChanges}
              onDiscard={() => setState({ phase: 'idle' })}
            />
          )}

          {state.phase === 'review_summary' && (
            <SummaryDiffPanel
              change={state.change}
              onUpdate={change => setState({ phase: 'review_summary', change })}
              onApply={applySummaryChange}
              onDiscard={() => setState({ phase: 'idle' })}
            />
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
