import React, { useEffect, useState } from 'react';
import { generateQuantifiedAchievements } from '../services/geminiService';
import { Sparkles, CheckCircle, X } from './icons';

interface BulletResult {
  original: string;
  quantified: string;
  hasMetric: boolean;
  accepted: boolean;
}

interface QuantifyPanelProps {
  responsibilities: string;
  jobTitle: string;
  company: string;
  onApply: (newResponsibilities: string) => void;
  onClose: () => void;
}

const SpinnerIcon = () => (
  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const QuantifyPanel: React.FC<QuantifyPanelProps> = ({ responsibilities, jobTitle, company, onApply, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bullets, setBullets] = useState<BulletResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    generateQuantifiedAchievements(responsibilities, jobTitle || 'Professional', company || 'Company')
      .then(results => {
        if (cancelled) return;
        setBullets(results.map(r => ({
          ...r,
          accepted: !r.hasMetric,
        })));
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const toggleAccepted = (i: number) => {
    setBullets(prev => prev.map((b, idx) => idx === i ? { ...b, accepted: !b.accepted } : b));
  };

  const acceptAll = () => setBullets(prev => prev.map(b => ({ ...b, accepted: true })));
  const resetAll  = () => setBullets(prev => prev.map(b => ({ ...b, accepted: !b.hasMetric })));

  const handleApply = () => {
    const lines = bullets.map(b => `• ${b.accepted ? b.quantified : b.original}`).join('\n');
    onApply(lines);
    onClose();
  };

  const acceptedCount = bullets.filter(b => b.accepted && !b.hasMetric).length;
  const hasChanges    = bullets.some(b => b.accepted && !b.hasMetric);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-2xl bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 flex flex-col max-h-[92dvh]"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F8F7F4]0 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Quantify Achievements</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                AI suggests numbers & metrics for each bullet point
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors ml-4 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
              <SpinnerIcon />
              <p className="text-sm font-medium">Analysing your bullet points…</p>
              <p className="text-xs text-zinc-400">This takes about 5–10 seconds</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-center">
              <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">{error}</p>
              <button
                onClick={onClose}
                className="text-xs text-red-500 underline"
              >
                Close
              </button>
            </div>
          )}

          {!loading && !error && bullets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-400">
              <p className="text-sm">No bullet points found in this entry.</p>
              <p className="text-xs mt-1">Add responsibilities first, then try quantifying.</p>
            </div>
          )}

          {!loading && !error && bullets.length > 0 && (
            <>
              {/* Summary banner */}
              <div className="flex items-center justify-between px-3 py-2 bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 border border-[#C9A84C]/20 dark:border-[#1B2B4B]/40/50 rounded-xl">
                <p className="text-xs text-[#1B2B4B] dark:text-[#C9A84C]/80">
                  <span className="font-bold">{bullets.filter(b => !b.hasMetric).length}</span> bullet{bullets.filter(b => !b.hasMetric).length !== 1 ? 's' : ''} can be improved ·{' '}
                  <span className="font-bold text-green-600 dark:text-green-400">{acceptedCount}</span> selected
                </p>
                <div className="flex gap-2">
                  <button onClick={acceptAll}  className="text-[11px] font-semibold text-[#1B2B4B] dark:text-[#C9A84C] hover:underline">All</button>
                  <button onClick={resetAll}   className="text-[11px] font-semibold text-zinc-400 hover:underline">Reset</button>
                </div>
              </div>

              {/* Bullet cards */}
              {bullets.map((bullet, i) => (
                <div
                  key={i}
                  className={`rounded-xl border overflow-hidden transition-all ${
                    bullet.hasMetric
                      ? 'border-zinc-100 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-800/40'
                      : bullet.accepted
                        ? 'border-green-200 dark:border-green-800/60 bg-green-50 dark:bg-green-900/10'
                        : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/60'
                  }`}
                >
                  {/* Card header */}
                  <div className={`flex items-center justify-between px-3 py-1.5 border-b ${
                    bullet.hasMetric
                      ? 'border-zinc-100 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-800'
                      : bullet.accepted
                        ? 'border-green-100 dark:border-green-800/40 bg-green-50 dark:bg-green-900/20'
                        : 'border-zinc-100 dark:border-neutral-700 bg-zinc-50/50 dark:bg-neutral-800'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-zinc-400 tabular-nums">#{i + 1}</span>
                      {bullet.hasMetric ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400">
                          Already quantified
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          Missing metric
                        </span>
                      )}
                    </div>
                    {!bullet.hasMetric && (
                      <button
                        onClick={() => toggleAccepted(i)}
                        className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-all ${
                          bullet.accepted
                            ? 'bg-green-500 text-white hover:bg-green-600'
                            : 'bg-zinc-200 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-neutral-600'
                        }`}
                      >
                        {bullet.accepted ? (
                          <><CheckCircle className="h-3 w-3" /> Use this</>
                        ) : (
                          <>Keep original</>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-3 space-y-2">
                    {/* Original */}
                    <div className="flex gap-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5 w-14 flex-shrink-0">Before</span>
                      <p className={`text-sm leading-relaxed ${
                        bullet.accepted && !bullet.hasMetric
                          ? 'line-through text-zinc-400 dark:text-zinc-500'
                          : 'text-zinc-700 dark:text-zinc-300'
                      }`}>
                        {bullet.original}
                      </p>
                    </div>

                    {/* Quantified — only show if not already metric */}
                    {!bullet.hasMetric && (
                      <div className="flex gap-2">
                        <span className="text-[10px] font-bold text-green-600 dark:text-green-500 uppercase tracking-wider mt-0.5 w-14 flex-shrink-0">After</span>
                        <p className={`text-sm leading-relaxed font-medium ${
                          bullet.accepted
                            ? 'text-green-800 dark:text-green-300'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {bullet.quantified}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!loading && !error && bullets.length > 0 && (
          <div className="px-5 py-4 border-t border-zinc-100 dark:border-neutral-800 flex items-center justify-between gap-3 flex-shrink-0 bg-white dark:bg-neutral-900 rounded-b-2xl">
            <p className="text-xs text-zinc-400 hidden sm:block">
              {hasChanges
                ? `Applying ${acceptedCount} AI suggestion${acceptedCount !== 1 ? 's' : ''}`
                : 'No changes selected — originals will be kept'
              }
            </p>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-[#1B2B4B] hover:bg-[#152238] text-white shadow-sm transition-colors flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Apply {hasChanges ? `${acceptedCount} Change${acceptedCount !== 1 ? 's' : ''}` : 'Originals'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuantifyPanel;
