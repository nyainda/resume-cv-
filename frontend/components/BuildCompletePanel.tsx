/**
 * BuildCompletePanel.tsx — Feature 1 UI: Build Complete Panel.
 *
 * Opens automatically after runAutoRepair() completes.
 * Four tabs: Repaired | Review | ATS | Skills
 * Manual flags shown as a persistent red banner at the bottom.
 *
 * Design: uses the project's own theme (navy/gold/green) — NOT the reference
 * image's colour scheme. Supports dark mode via dark: classes.
 */

import React, { useState, useCallback } from 'react';
import { CVData } from '../types';
import type { CVBuildReport, ReviewItem, ManualFlag } from '../types/buildReport';
import {
  CheckCircle, X, Wrench, Zap, Target, Layers,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCheck,
  Edit3, SkipForward, Info, TrendingUp, MinusCircle, PlusCircle,
  LayoutGrid,
} from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BuildCompletePanelProps {
  open: boolean;
  report: CVBuildReport;
  cv: CVData;
  jobDescription?: string;
  onClose: () => void;
  /** Called when user applies a Tier 3 suggestion. */
  onApplySuggestion: (item: ReviewItem, updatedCV: CVData) => void;
  /** Called when user dismisses / skips a Tier 3 item. */
  onSkipSuggestion: (itemId: string) => void;
  /** Called when user acts on a Tier 4 flag (e.g. navigate to edit). */
  onFlagAction: (flag: ManualFlag) => void;
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabId = 'repaired' | 'review' | 'ats' | 'skills';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CircularScore({ score }: { score: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const colour =
    score >= 80 ? '#2D6A4F' :
    score >= 60 ? '#C9A84C' :
    '#C0392B';

  return (
    <div className="relative inline-flex items-center justify-center w-24 h-24">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} stroke="currentColor" strokeWidth="8"
          className="text-border" fill="none" />
        <circle cx="48" cy="48" r={r} stroke={colour} strokeWidth="8"
          fill="none" strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-foreground" style={{ color: colour }}>{score}%</span>
        <span className="text-[10px] text-muted-foreground leading-tight">
          {score >= 80 ? 'Strong' : score >= 60 ? 'Good' : 'Weak'}
        </span>
      </div>
    </div>
  );
}

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  voice_tense: 'Voice & Tense',
  language: 'Language',
  verbs: 'Verbs',
  skills: 'Skills',
  metrics: 'Metrics',
  structure: 'Structure',
};

// ─── Repaired Tab ─────────────────────────────────────────────────────────────

function RepairedTab({ report }: { report: CVBuildReport }) {
  const grouped = report.events.reduce<Record<string, typeof report.events>>((acc, ev) => {
    const key = ev.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  const hasFixes = report.events.length > 0;

  return (
    <div className="space-y-3">
      {hasFixes ? (
        <>
          <p className="text-xs text-muted-foreground pb-1">
            These were fixed automatically — no action needed.
          </p>
          {Object.entries(grouped).map(([category, events]) => (
            <div key={category} className="rounded-lg border border-border bg-background/60 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 border-b border-border">
                <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                  {CATEGORY_LABELS[category] ?? category}
                </span>
              </div>
              <div className="divide-y divide-border">
                {events.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2">
                    <CheckCircle className="w-3.5 h-3.5 text-[#2D6A4F] flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground/80">{ev.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {report.appliedCount > 0 && (
            <p className="text-xs text-muted-foreground pt-1 text-center">
              {report.appliedCount} fix{report.appliedCount > 1 ? 'es' : ''} applied silently before you saw the CV.
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCheck className="w-10 h-10 text-[#2D6A4F]" />
          <div>
            <p className="font-semibold text-foreground">Already clean</p>
            <p className="text-sm text-muted-foreground mt-1">No automatic fixes were needed.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Review Tab ───────────────────────────────────────────────────────────────

function ReviewTab({
  items,
  cv,
  onApply,
  onSkip,
}: {
  items: ReviewItem[];
  cv: CVData;
  onApply: (item: ReviewItem, updatedCV: CVData) => void;
  onSkip: (id: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const pending = items.filter(i => !i.applied && !i.skipped);
  const item = pending[currentIndex];

  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCheck className="w-10 h-10 text-[#2D6A4F]" />
        <div>
          <p className="font-semibold text-foreground">All done!</p>
          <p className="text-sm text-muted-foreground mt-1">You've reviewed all suggestions.</p>
        </div>
      </div>
    );
  }

  const handleApply = useCallback(() => {
    if (!item) return;
    if (item.location.kind === 'bullet') {
      const { roleIndex, bulletIndex } = item.location;
      const newExp = cv.experience.map((role, rIdx) => {
        if (rIdx !== roleIndex) return role;
        return {
          ...role,
          responsibilities: role.responsibilities.map((b, bIdx) =>
            bIdx === bulletIndex ? item.suggested : b
          ),
        };
      });
      onApply(item, { ...cv, experience: newExp });
    } else {
      onApply(item, cv);
    }
    setCurrentIndex(Math.max(0, currentIndex - 1));
  }, [item, cv, onApply, currentIndex]);

  const handleSkip = useCallback(() => {
    if (!item) return;
    onSkip(item.id);
    setCurrentIndex(Math.max(0, Math.min(currentIndex, pending.length - 2)));
  }, [item, onSkip, currentIndex, pending.length]);

  const locationLabel =
    item.location.kind === 'bullet'
      ? `${item.location.roleTitle} · Bullet ${item.location.bulletIndex + 1}`
      : item.location.kind === 'summary' ? 'Summary rewrite'
      : 'Skills adjustment';

  return (
    <div className="space-y-3">
      {/* Progress */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} of {pending.length} suggestions
        </span>
        <div className="flex items-center gap-1">
          {pending.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIndex
                  ? 'bg-[#C9A84C]'
                  : 'bg-border hover:bg-muted-foreground/40'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Card */}
      <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/40 border-b border-border">
          <div className="flex items-center gap-2">
            <Edit3 className="w-3.5 h-3.5 text-[#C9A84C]" />
            <span className="text-sm font-medium text-foreground">{locationLabel}</span>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5">
            {item.issueType === 'no_metric' ? 'No metric' : item.issueType.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 font-medium">Current</p>
            <p className="text-sm text-foreground/70 italic leading-relaxed">"{item.original}"</p>
          </div>

          {item.suggested ? (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#C9A84C] mb-1 font-medium">Suggested</p>
              <p className="text-sm text-foreground leading-relaxed">"{item.suggested}"</p>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/40 border border-border">
              <Info className="w-4 h-4 text-[#C9A84C] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                Add a specific number, %, or scale to quantify the impact of this bullet.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-secondary/20">
          {item.suggested && (
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-sm font-medium hover:bg-[#1B2B4B]/90 transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Apply
            </button>
          )}
          <button
            onClick={handleSkip}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip
          </button>

          {/* Prev / Next navigation */}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="p-1.5 rounded-md border border-border disabled:opacity-30 hover:bg-secondary/60 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentIndex(Math.min(pending.length - 1, currentIndex + 1))}
              disabled={currentIndex >= pending.length - 1}
              className="p-1.5 rounded-md border border-border disabled:opacity-30 hover:bg-secondary/60 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ATS Tab ──────────────────────────────────────────────────────────────────

function ATSTab({ report }: { report: CVBuildReport }) {
  const ats = report.atsReport;

  if (!ats || !ats.hasJd) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Target className="w-10 h-10 text-muted-foreground/40" />
        <div>
          <p className="font-semibold text-foreground">No job description</p>
          <p className="text-sm text-muted-foreground mt-1">
            Paste a job description to see your ATS keyword match.
          </p>
        </div>
      </div>
    );
  }

  const score = ats.semanticScore ?? ats.score;
  const scoreColour =
    score >= 80 ? 'text-[#2D6A4F]' :
    score >= 60 ? 'text-[#C9A84C]' :
    'text-[#C0392B]';

  return (
    <div className="space-y-4">
      {/* Score + summary */}
      <div className="flex items-center gap-5 p-4 rounded-xl border border-border bg-background/60">
        <CircularScore score={score} />
        <div className="flex-1 min-w-0">
          <p className={`text-base font-bold ${scoreColour}`}>
            {score >= 80 ? 'Strong match' : score >= 60 ? 'Good match' : 'Needs work'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ats.matched.length} of {ats.keywords.length} keywords matched
          </p>
          {score >= 80 && (
            <p className="text-xs text-[#2D6A4F] mt-1">
              Your CV aligns well with the job requirements.
            </p>
          )}
        </div>
      </div>

      {/* Matched */}
      {ats.matched.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle className="w-3.5 h-3.5 text-[#2D6A4F]" />
            <span className="text-xs font-semibold text-foreground/80">
              Matched Keywords ({ats.matched.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ats.matched.slice(0, 20).map(kw => (
              <span key={kw}
                className="px-2 py-0.5 rounded-full text-xs bg-[#2D6A4F]/10 text-[#2D6A4F] border border-[#2D6A4F]/20 dark:bg-[#2D6A4F]/20 dark:text-emerald-300">
                {kw}
              </span>
            ))}
            {ats.matched.length > 20 && (
              <span className="px-2 py-0.5 text-xs text-muted-foreground">
                +{ats.matched.length - 20} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Missing */}
      {ats.missing.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <MinusCircle className="w-3.5 h-3.5 text-[#C0392B]" />
            <span className="text-xs font-semibold text-foreground/80">
              Missing Keywords ({ats.missing.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ats.missing.slice(0, 12).map(kw => (
              <span key={kw}
                className="px-2 py-0.5 rounded-full text-xs bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800">
                {kw}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Tip: Add these keywords where they apply to your experience.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Skills Tab ───────────────────────────────────────────────────────────────

function SkillsTab({ report }: { report: CVBuildReport }) {
  const skills = report.reconciledSkills;

  if (!skills) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Layers className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Paste a job description to see skills reconciliation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {skills.finalSkills.length} skills in your CV — reconciled against the job description.
      </p>

      {/* From your profile */}
      {skills.native.length > 0 && (
        <div className="rounded-lg border border-border bg-background/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 border-b border-border">
            <div className="w-2 h-2 rounded-full bg-[#2D6A4F]" />
            <span className="text-xs font-semibold text-foreground/80">
              From Your Profile ({skills.native.length})
            </span>
          </div>
          <div className="p-3">
            <p className="text-sm text-foreground/70 leading-relaxed">
              {skills.native.join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Added from JD */}
      {skills.addedFromJD.length > 0 && (
        <div className="rounded-lg border border-border bg-background/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 border-b border-border">
            <div className="w-2 h-2 rounded-full bg-[#C9A84C]" />
            <span className="text-xs font-semibold text-foreground/80">
              Added from JD ({skills.addedFromJD.length})
            </span>
          </div>
          <div className="p-3">
            <p className="text-sm text-foreground/70 leading-relaxed">
              {skills.addedFromJD.join(', ')}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              Evidenced in your experience bullets — safely added.
            </p>
          </div>
        </div>
      )}

      {/* Dropped */}
      {skills.dropped.length > 0 && (
        <div className="rounded-lg border border-border bg-background/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 border-b border-border">
            <div className="w-2 h-2 rounded-full bg-[#C0392B]" />
            <span className="text-xs font-semibold text-foreground/80">
              Dropped ({skills.dropped.length})
            </span>
          </div>
          <div className="p-3">
            <div className="space-y-1">
              {skills.dropped.slice(0, 6).map(skill => (
                <div key={skill} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-[#C0392B] flex-shrink-0">−</span>
                  <span>
                    {skill}
                    <span className="text-xs text-muted-foreground/60 ml-1">— not evidenced in your experience</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Manual Flags ─────────────────────────────────────────────────────────────

function ManualFlagsSection({
  flags,
  onAction,
}: {
  flags: ManualFlag[];
  onAction: (flag: ManualFlag) => void;
}) {
  if (flags.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {flags.map(flag => (
        <div
          key={flag.id}
          className="flex items-start gap-3 p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30"
        >
          <AlertTriangle className="w-4 h-4 text-[#C0392B] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground leading-snug">{flag.description}</p>
          </div>
          <button
            onClick={() => onAction(flag)}
            className="flex-shrink-0 text-xs font-medium text-[#C0392B] hover:text-[#C0392B]/80 whitespace-nowrap transition-colors"
          >
            {flag.ctaLabel}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function BuildCompletePanel({
  open,
  report,
  cv,
  onClose,
  onApplySuggestion,
  onSkipSuggestion,
  onFlagAction,
}: BuildCompletePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('repaired');
  const [localItems, setLocalItems] = useState<ReviewItem[]>(report.reviewItems);

  // Sync items if report changes (new generation)
  React.useEffect(() => {
    setLocalItems(report.reviewItems);
    setActiveTab('repaired');
  }, [report.generatedAt]);

  if (!open) return null;

  const pendingReviewCount = localItems.filter(i => !i.applied && !i.skipped).length;

  const tabs: Tab[] = [
    {
      id: 'repaired',
      label: 'Repaired',
      icon: <Wrench className="w-3.5 h-3.5" />,
    },
    {
      id: 'review',
      label: 'Review',
      icon: <Zap className="w-3.5 h-3.5" />,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
    {
      id: 'ats',
      label: 'ATS',
      icon: <Target className="w-3.5 h-3.5" />,
    },
    {
      id: 'skills',
      label: 'Skills',
      icon: <LayoutGrid className="w-3.5 h-3.5" />,
    },
  ];

  const handleApply = useCallback((item: ReviewItem, updatedCV: CVData) => {
    setLocalItems(prev =>
      prev.map(i => i.id === item.id ? { ...i, applied: true } : i)
    );
    onApplySuggestion({ ...item, applied: true }, updatedCV);
  }, [onApplySuggestion]);

  const handleSkip = useCallback((id: string) => {
    setLocalItems(prev =>
      prev.map(i => i.id === id ? { ...i, skipped: true } : i)
    );
    onSkipSuggestion(id);
  }, [onSkipSuggestion]);

  const isAllClear = report.appliedCount === 0 && pendingReviewCount === 0 && report.manualFlags.length === 0;

  return (
    <>
      {/* Backdrop — clicking outside closes */}
      <div
        className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md bg-background border-l border-border shadow-2xl animate-slide-in-right">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-background">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              isAllClear
                ? 'bg-[#2D6A4F]/15 text-[#2D6A4F]'
                : 'bg-[#2D6A4F]/15 text-[#2D6A4F]'
            }`}>
              <CheckCircle className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground leading-tight">CV Ready</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {report.appliedCount > 0
                  ? `Fixed ${report.appliedCount} automatically`
                  : 'No fixes needed'}
                {pendingReviewCount > 0
                  ? ` · ${pendingReviewCount} to review`
                  : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center border-b border-border px-4 bg-background">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-foreground border-b-2 border-[#C9A84C] -mb-px'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#C9A84C] text-[#1B2B4B] text-[9px] font-bold leading-none">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto thin-scrollbar px-5 py-4">
          {activeTab === 'repaired' && <RepairedTab report={report} />}
          {activeTab === 'review' && (
            <ReviewTab
              items={localItems}
              cv={cv}
              onApply={handleApply}
              onSkip={handleSkip}
            />
          )}
          {activeTab === 'ats' && <ATSTab report={report} />}
          {activeTab === 'skills' && <SkillsTab report={report} />}

          {/* Manual flags — always visible at the bottom of whatever tab is active */}
          <ManualFlagsSection flags={report.manualFlags} onAction={onFlagAction} />
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-border bg-background/80 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            All changes are saved to your CV automatically.
          </p>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-xs font-medium hover:bg-[#1B2B4B]/90 transition-colors dark:bg-white dark:text-[#1B2B4B] dark:hover:bg-white/90"
          >
            <TrendingUp className="w-3 h-3" />
            View Full CV
          </button>
        </div>
      </div>
    </>
  );
}
