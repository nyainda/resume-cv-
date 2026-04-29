import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Sparkles, RefreshCw } from './icons';

export type GenerationStageId =
  | 'profile'
  | 'research'
  | 'jd'
  | 'drafting'
  | 'polishing'
  | 'scoring';

export interface GenerationStage {
  id: GenerationStageId;
  label: string;
  weight: number;
}

const ALL_STAGES: GenerationStage[] = [
  { id: 'profile',   label: 'Reading your profile',                 weight: 5  },
  { id: 'research',  label: 'Researching role & market context',    weight: 10 },
  { id: 'jd',        label: 'Analysing the job description',        weight: 10 },
  { id: 'drafting',  label: 'Drafting your tailored CV',            weight: 50 },
  { id: 'polishing', label: 'Polishing & cleaning every line',      weight: 15 },
  { id: 'scoring',   label: 'Scoring against the job description',  weight: 10 },
];

const TIPS: string[] = [
  'Numbers in your CV come straight from your profile — we never invent figures.',
  'You can edit any bullet after generation, then re-export the PDF.',
  'A strong summary is 2–3 sentences and mentions one concrete achievement.',
  'Try a different job description to see how the CV adapts automatically.',
  'The Quality Issues panel surfaces anything worth a second look.',
  'Bullets that lose their key number are quietly swapped back to your originals.',
  'Generated CVs are cached for 30 minutes — re-clicking Generate is instant.',
  'Cover letters reuse the same tone and keywords as your CV.',
];

interface Props {
  isOpen: boolean;
  currentStage: GenerationStageId | null;
  completedStages: GenerationStageId[];
  activeStageIds: GenerationStageId[];
  statusMessage?: string;
  retryNotice?: string | null;
}

const CVGenerationProgress: React.FC<Props> = ({
  isOpen,
  currentStage,
  completedStages,
  activeStageIds,
  statusMessage,
  retryNotice,
}) => {
  const [elapsed, setElapsed] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  // Reset & start the elapsed-time counter whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setElapsed(0);
    const startedAt = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(tick);
  }, [isOpen]);

  // Rotate the encouragement tip every 5 seconds.
  useEffect(() => {
    if (!isOpen) return;
    const rotate = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 5000);
    return () => clearInterval(rotate);
  }, [isOpen]);

  // Only show stages that are actually being executed for THIS run.
  const visibleStages = useMemo(
    () => ALL_STAGES.filter(s => activeStageIds.includes(s.id)),
    [activeStageIds],
  );

  // Progress percentage based on weighted, completed stages plus a small bump
  // for the currently-running stage so the bar visibly moves while the LLM is
  // still working (rather than freezing on the same number for 30 s).
  const progressPct = useMemo(() => {
    const totalWeight = visibleStages.reduce((sum, s) => sum + s.weight, 0) || 1;
    const doneWeight = visibleStages
      .filter(s => completedStages.includes(s.id))
      .reduce((sum, s) => sum + s.weight, 0);
    const activeStage = visibleStages.find(s => s.id === currentStage);
    // Add up to 80 % of the active stage's weight as time elapses inside it.
    // This is an estimate (we can't peek inside the LLM), but it keeps the bar
    // alive — typical drafting is ~12 s, so we lerp over ~15 s before holding.
    const activeBump = activeStage
      ? Math.min(0.8, elapsed / 15) * activeStage.weight
      : 0;
    return Math.min(99, Math.round(((doneWeight + activeBump) / totalWeight) * 100));
  }, [visibleStages, completedStages, currentStage, elapsed]);

  if (!isOpen) return null;

  const fmtTime = (s: number) => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${r}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/40 dark:to-blue-950/40 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-violet-500 animate-ping" />
              </div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Crafting your CV
              </h2>
            </div>
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
              {fmtTime(elapsed)}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            {statusMessage || 'Working on it…'}
          </p>
        </div>

        {/* Progress bar */}
        <div className="px-6 pt-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Progress
            </span>
            <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-300 tabular-nums">
              {progressPct}%
            </span>
          </div>
          <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 via-blue-500 to-teal-500 rounded-full transition-all duration-500 ease-out relative"
              style={{ width: `${progressPct}%` }}
            >
              <div className="absolute inset-0 bg-white/30 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Stage list */}
        <ul className="px-6 py-4 space-y-2.5">
          {visibleStages.map(stage => {
            const isDone = completedStages.includes(stage.id);
            const isActive = currentStage === stage.id && !isDone;
            return (
              <li key={stage.id} className="flex items-center gap-2.5 text-sm">
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {isDone ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  ) : isActive ? (
                    <RefreshCw className="w-4 h-4 text-violet-500 animate-spin" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  )}
                </span>
                <span
                  className={
                    isDone
                      ? 'text-zinc-500 dark:text-zinc-500 line-through decoration-zinc-300 dark:decoration-zinc-700 decoration-1'
                      : isActive
                      ? 'text-zinc-900 dark:text-zinc-100 font-medium'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Retry notice (only during rate-limit retry) */}
        {retryNotice && (
          <div className="mx-6 mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
            {retryNotice}
          </div>
        )}

        {/* Rotating tip */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40">
          <div className="flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">💡</span>
            <p
              key={tipIndex}
              className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed animate-in fade-in slide-in-from-bottom-1 duration-300"
            >
              {TIPS[tipIndex]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CVGenerationProgress;
