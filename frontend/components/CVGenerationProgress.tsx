import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Sparkles, RefreshCw } from './icons';
import { PROVIDER_TRYING_EVENT, PROVIDER_CHAIN_EVENT } from '../services/groqService';
import type { ProviderTryingPayload, ProviderChainStatus } from '../services/groqService';
import { POLISH_STAGE_EVENT } from '../services/geminiService';
import type { PolishStageId, PolishStagePayload } from '../services/geminiService';

const POLISH_SUB_STAGES: { id: PolishStageId; label: string }[] = [
  { id: 'humanizing', label: 'Humanising tone & fixing weak bullets' },
  { id: 'purifying',  label: 'Enforcing tense & phrase rules' },
  { id: 'voice',      label: 'Checking voice consistency' },
  { id: 'finalizing', label: 'Finalising & locking output' },
];

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
  { id: 'profile',   label: 'Reading your profile',              weight: 5  },
  { id: 'research',  label: 'Researching role & market context', weight: 10 },
  { id: 'jd',        label: 'Analysing the job description',     weight: 10 },
  { id: 'drafting',  label: 'Drafting your tailored CV',         weight: 50 },
  { id: 'polishing', label: 'Polishing & cleaning every line',   weight: 15 },
  { id: 'scoring',   label: 'Scoring against the job description', weight: 10 },
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

interface ProviderAttempt {
  label: string;
  state: 'trying' | 'ok' | 'failed' | 'retry';
  type: 'single' | 'race' | 'retry';
  retryAfterSeconds?: number;
}

interface Props {
  isOpen: boolean;
  currentStage: GenerationStageId | null;
  completedStages: GenerationStageId[];
  activeStageIds: GenerationStageId[];
  statusMessage?: string;
  retryNotice?: string | null;
  hasDraft?: boolean;
}

const CVGenerationProgress: React.FC<Props> = ({
  isOpen,
  currentStage,
  completedStages,
  activeStageIds,
  statusMessage,
  retryNotice,
  hasDraft,
}) => {
  const [elapsed, setElapsed]               = useState(0);
  const [tipIndex, setTipIndex]             = useState(0);
  const [providerAttempts, setProviderAttempts] = useState<ProviderAttempt[]>([]);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [minimised, setMinimised]           = useState(false);
  const [polishSubStage, setPolishSubStage] = useState<PolishStageId | null>(null);

  // Reset & start elapsed counter whenever modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setElapsed(0);
    setProviderAttempts([]);
    setRetryCountdown(null);
    setMinimised(false);
    setPolishSubStage(null);
    const startedAt = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(tick);
  }, [isOpen]);

  // Rotate encouragement tip every 5 s.
  useEffect(() => {
    if (!isOpen) return;
    const rotate = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 5000);
    return () => clearInterval(rotate);
  }, [isOpen]);

  // Auto-expand when a draft arrives so user notices the preview is live.
  useEffect(() => {
    if (hasDraft && minimised) setMinimised(false);
  }, [hasDraft]);

  // Provider "now trying" events.
  useEffect(() => {
    if (!isOpen) return;
    const onTrying = (e: Event) => {
      const { label, type, retryAfterSeconds } = (e as CustomEvent<ProviderTryingPayload>).detail;
      setProviderAttempts(prev => {
        const updated = prev.map(p => p.state === 'trying' ? { ...p, state: 'failed' as const } : p);
        if (type === 'retry') {
          setRetryCountdown(retryAfterSeconds ?? null);
          return [...updated, { label, state: 'retry', type, retryAfterSeconds }];
        }
        setRetryCountdown(null);
        return [...updated, { label, state: 'trying', type }];
      });
    };
    window.addEventListener(PROVIDER_TRYING_EVENT, onTrying);
    return () => window.removeEventListener(PROVIDER_TRYING_EVENT, onTrying);
  }, [isOpen]);

  // Provider result events.
  useEffect(() => {
    if (!isOpen) return;
    const onChain = (e: Event) => {
      const status = (e as CustomEvent<ProviderChainStatus>).detail;
      const lastEngine = status.lastEngineUsed;
      const lastProvider = status.providers.find(p => p.name === lastEngine);
      if (lastProvider?.state === 'ok') {
        setRetryCountdown(null);
        setProviderAttempts(prev => prev.map(p => p.state === 'trying' ? { ...p, state: 'ok' } : p));
      } else {
        setProviderAttempts(prev => prev.map(p => p.state === 'trying' ? { ...p, state: 'failed' } : p));
      }
    };
    window.addEventListener(PROVIDER_CHAIN_EVENT, onChain);
    return () => window.removeEventListener(PROVIDER_CHAIN_EVENT, onChain);
  }, [isOpen]);

  // Retry countdown ticker.
  useEffect(() => {
    if (retryCountdown === null || retryCountdown <= 0) return;
    const timer = setTimeout(() => setRetryCountdown(c => (c !== null && c > 0 ? c - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [retryCountdown]);

  // Polish sub-stage events — update which sub-step is active inside 'polishing'.
  useEffect(() => {
    if (!isOpen) return;
    const onPolish = (e: Event) => {
      const { stage } = (e as CustomEvent<PolishStagePayload>).detail;
      setPolishSubStage(stage);
    };
    window.addEventListener(POLISH_STAGE_EVENT, onPolish);
    return () => window.removeEventListener(POLISH_STAGE_EVENT, onPolish);
  }, [isOpen]);

  const visibleStages = useMemo(
    () => ALL_STAGES.filter(s => activeStageIds.includes(s.id)),
    [activeStageIds],
  );

  const progressPct = useMemo(() => {
    const totalWeight = visibleStages.reduce((sum, s) => sum + s.weight, 0) || 1;
    const doneWeight  = visibleStages
      .filter(s => completedStages.includes(s.id))
      .reduce((sum, s) => sum + s.weight, 0);
    const activeStage = visibleStages.find(s => s.id === currentStage);
    const activeBump  = activeStage ? Math.min(0.8, elapsed / 15) * activeStage.weight : 0;
    return Math.min(99, Math.round(((doneWeight + activeBump) / totalWeight) * 100));
  }, [visibleStages, completedStages, currentStage, elapsed]);

  if (!isOpen) return null;

  const fmtTime = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  const visibleAttempts = providerAttempts.slice(-4);

  return (
    <div
      className={`
        fixed bottom-5 right-5 z-50 w-72 sm:w-80
        bg-white dark:bg-neutral-800
        rounded-2xl shadow-2xl shadow-zinc-900/25
        border border-zinc-200 dark:border-neutral-700
        overflow-hidden
        animate-in slide-in-from-bottom-4 fade-in duration-300
      `}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/50 dark:to-blue-950/50 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex-shrink-0">
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-violet-500 animate-ping" />
            </div>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              Crafting your CV
            </span>
            {hasDraft && (
              <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 animate-in fade-in duration-500">
                ✓ draft visible
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">{fmtTime(elapsed)}</span>
            <button
              onClick={() => setMinimised(m => !m)}
              className="w-5 h-5 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-xs font-bold"
              title={minimised ? 'Expand' : 'Minimise'}
            >
              {minimised ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* Progress bar — always visible even when minimised */}
        <div className="mt-2.5 h-1.5 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 via-blue-500 to-teal-400 rounded-full transition-all duration-500 ease-out relative"
            style={{ width: `${progressPct}%` }}
          >
            <div className="absolute inset-0 bg-white/25 animate-pulse" />
          </div>
        </div>
        {!minimised && (
          <p className="mt-1 text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate">{statusMessage || 'Working on it…'}</p>
        )}
      </div>

      {/* ── Body — collapsible ───────────────────────────────────────────── */}
      {!minimised && (
        <>
          {/* Stage list */}
          <ul className="px-4 py-3 space-y-1.5">
            {visibleStages.map(stage => {
              const isDone   = completedStages.includes(stage.id);
              const isActive = currentStage === stage.id && !isDone;
              const showSubs = stage.id === 'polishing' && isActive && polishSubStage !== null;
              return (
                <li key={stage.id}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                      {isDone ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : isActive ? (
                        <RefreshCw className="w-3 h-3 text-violet-500 animate-spin" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                      )}
                    </span>
                    <span className={
                      isDone   ? 'text-zinc-400 dark:text-zinc-500 line-through decoration-zinc-300 decoration-1' :
                      isActive ? 'text-zinc-900 dark:text-zinc-100 font-medium' :
                                 'text-zinc-400 dark:text-zinc-500'
                    }>
                      {stage.label}
                    </span>
                  </div>
                  {/* Polish sub-stages — shown only while polishing is active */}
                  {showSubs && (
                    <ul className="mt-1 ml-6 space-y-0.5">
                      {POLISH_SUB_STAGES.map(sub => {
                        const ORDER = POLISH_SUB_STAGES.map(s => s.id);
                        const cur   = ORDER.indexOf(polishSubStage ?? '');
                        const mine  = ORDER.indexOf(sub.id);
                        const subDone    = mine < cur;
                        const subActive  = mine === cur;
                        return (
                          <li key={sub.id} className={`flex items-center gap-1.5 text-[10px] transition-colors ${
                            subDone   ? 'text-emerald-500 dark:text-emerald-400' :
                            subActive ? 'text-violet-600 dark:text-violet-400 font-medium' :
                                        'text-zinc-400 dark:text-zinc-600'
                          }`}>
                            <span className="flex-shrink-0">
                              {subDone   ? '✓' :
                               subActive ? <RefreshCw className="w-2 h-2 animate-spin inline" /> :
                                           '·'}
                            </span>
                            {sub.label}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Live AI provider panel */}
          {visibleAttempts.length > 0 && (
            <div className="mx-3 mb-2 px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">AI Provider</p>
              <div className="flex flex-col gap-0.5">
                {visibleAttempts.map((attempt, i) => {
                  const isLast = i === visibleAttempts.length - 1;
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                        {attempt.state === 'ok'    ? <span className="text-emerald-500 text-[10px]">✓</span>
                        : attempt.state === 'failed' ? <span className="text-zinc-400 text-[10px]">✕</span>
                        : attempt.state === 'retry'  ? <span className="text-amber-500 text-[10px]">↩</span>
                        : <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />}
                      </span>
                      <span className={[
                        'text-[10.5px] font-medium',
                        attempt.state === 'ok'     ? 'text-emerald-600 dark:text-emerald-400' :
                        attempt.state === 'failed'  ? 'text-zinc-400 line-through decoration-1' :
                        attempt.state === 'retry'   ? 'text-amber-600 dark:text-amber-400' :
                                                       'text-zinc-700 dark:text-zinc-300',
                      ].join(' ')}>
                        {attempt.type === 'race' && attempt.state === 'trying'
                          ? `Racing: ${attempt.label}`
                          : attempt.type === 'retry'
                          ? `${attempt.label} retry${retryCountdown !== null && isLast ? ` in ${retryCountdown}s` : '…'}`
                          : attempt.label}
                      </span>
                      {attempt.state === 'trying' && attempt.type !== 'race' && (
                        <span className="text-[9px] text-zinc-400">contacting…</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Retry notice */}
          {retryNotice && (
            <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[10.5px] text-amber-800 dark:text-amber-200">
              {retryNotice}
            </div>
          )}

          {/* Tip */}
          <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/30">
            <div className="flex items-start gap-1.5">
              <span className="text-sm leading-none mt-0.5 flex-shrink-0">💡</span>
              <p
                key={tipIndex}
                className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed animate-in fade-in slide-in-from-bottom-1 duration-300"
              >
                {TIPS[tipIndex]}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CVGenerationProgress;
