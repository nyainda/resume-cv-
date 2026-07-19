/**
 * BuildReportPage.tsx — Standalone "Build" view.
 *
 * Shows the last CVBuildReport in a full-page layout so the user can revisit
 * their repair history any time — not just immediately after generation.
 * Uses the same tab content components as BuildCompletePanel.
 */

import React, { useState, useCallback } from 'react';
import { CVData } from '../types';
import type { CVBuildReport, ReviewItem, ManualFlag } from '../types/buildReport';
import {
  RepairedTab,
  ReviewTab,
  ATSTab,
  SkillsTab,
  ManualFlagsSection,
} from './BuildCompletePanel';
import { Wrench, Zap, Target, LayoutGrid, Cpu, ArrowRight } from 'lucide-react';

// ── Props ──────────────────────────────────────────────────────────────────────

interface BuildReportPageProps {
  report: CVBuildReport | null;
  cv: CVData | null;
  onGoToGenerator: () => void;
  onApplySuggestion: (item: ReviewItem, updatedCV: CVData) => void;
  onSkipSuggestion: (itemId: string) => void;
  onFlagAction: (flag: ManualFlag) => void;
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type TabId = 'repaired' | 'review' | 'ats' | 'skills';

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
          Generate a CV and the Autonomous Repair Engine will automatically fix issues, score your ATS match, and reconcile your skills. The full report appears here.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-lg text-xs">
        {[
          { icon: <Wrench className="w-4 h-4" />, label: 'Auto-fixes weak language' },
          { icon: <Zap className="w-4 h-4" />,   label: 'One-click suggestions' },
          { icon: <Target className="w-4 h-4" />, label: 'ATS keyword score' },
          { icon: <LayoutGrid className="w-4 h-4" />, label: 'Skills reconciliation' },
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

function StatPill({
  value,
  label,
  colour,
}: {
  value: number | string;
  label: string;
  colour: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl border border-border bg-background/60">
      <span className="text-lg font-bold" style={{ color: colour }}>{value}</span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BuildReportPage({
  report,
  cv,
  onGoToGenerator,
  onApplySuggestion,
  onSkipSuggestion,
  onFlagAction,
}: BuildReportPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('repaired');
  const [localItems, setLocalItems] = useState<ReviewItem[]>(report?.reviewItems ?? []);

  // Sync items when a new report arrives
  React.useEffect(() => {
    setLocalItems(report?.reviewItems ?? []);
    setActiveTab('repaired');
  }, [report?.generatedAt]);

  if (!report || !cv) {
    return <EmptyState onGoToGenerator={onGoToGenerator} />;
  }

  const pendingReviewCount = localItems.filter(i => !i.applied && !i.skipped).length;

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'repaired', label: 'Fixed',  icon: <Wrench className="w-4 h-4" /> },
    { id: 'review',   label: 'Review', icon: <Zap className="w-4 h-4" />,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined },
    { id: 'ats',      label: 'ATS',    icon: <Target className="w-4 h-4" /> },
    { id: 'skills',   label: 'Skills', icon: <LayoutGrid className="w-4 h-4" /> },
  ];

  const handleApply = useCallback((item: ReviewItem, updatedCV: CVData) => {
    setLocalItems(prev => prev.map(i => i.id === item.id ? { ...i, applied: true } : i));
    onApplySuggestion(item, updatedCV);
  }, [onApplySuggestion]);

  const handleSkip = useCallback((id: string) => {
    setLocalItems(prev => prev.map(i => i.id === id ? { ...i, skipped: true } : i));
    onSkipSuggestion(id);
  }, [onSkipSuggestion]);

  const atsScore = report.atsReport?.semanticScore ?? report.atsReport?.score;
  const builtAt = new Date(report.generatedAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Cpu className="w-6 h-6" style={{ color: '#C9A84C' }} />
            Build Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last generated {builtAt}
          </p>
        </div>
        <button
          onClick={onGoToGenerator}
          className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 self-start sm:self-auto"
          style={{ background: '#1B2B4B' }}
        >
          Generate new CV
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Summary stats ── */}
      <div className="flex flex-wrap gap-3">
        <StatPill
          value={report.appliedCount}
          label="auto-fixed"
          colour="#2D6A4F"
        />
        <StatPill
          value={pendingReviewCount}
          label="to review"
          colour={pendingReviewCount > 0 ? '#C9A84C' : '#2D6A4F'}
        />
        <StatPill
          value={report.manualFlags.length}
          label={report.manualFlags.length === 1 ? 'manual flag' : 'manual flags'}
          colour={report.manualFlags.length > 0 ? '#C0392B' : '#2D6A4F'}
        />
        {atsScore !== undefined && (
          <StatPill
            value={`${atsScore}%`}
            label="ATS match"
            colour={atsScore >= 80 ? '#2D6A4F' : atsScore >= 60 ? '#C9A84C' : '#C0392B'}
          />
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white dark:bg-neutral-800/50 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">

        {/* Tab bar */}
        <div className="flex items-center border-b border-border bg-background overflow-x-auto no-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors',
                'flex-1 sm:flex-none justify-center sm:justify-start',
                activeTab === tab.id
                  ? 'text-foreground border-b-2 border-[#C9A84C] -mb-px bg-background'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#C9A84C] text-[#1B2B4B] text-[10px] font-bold">
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
          {activeTab === 'ats' && <ATSTab report={report} />}
          {activeTab === 'skills' && <SkillsTab report={report} />}

          {/* Manual flags — always shown at the bottom */}
          <ManualFlagsSection flags={report.manualFlags} onAction={onFlagAction} />
        </div>
      </div>
    </div>
  );
}
