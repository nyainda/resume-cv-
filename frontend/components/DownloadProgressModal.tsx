import React, { useEffect, useMemo, useRef, useState } from 'react';

// Maps the free-form status strings emitted by `cvDownloadService.downloadCV`
// (and the inner Cloudflare worker call) onto a small fixed step graph so the
// UI can render a deterministic progress bar + step list. Anything we don't
// recognise is treated as the "Rendering" step — that's by far the longest
// stage and the safest fallback for unknown messages.
type StepKey = 'preparing' | 'rendering' | 'finalizing' | 'done';

const STEPS: { key: StepKey; label: string; hint: string }[] = [
  { key: 'preparing',  label: 'Preparing',  hint: 'Locking in your edits' },
  { key: 'rendering',  label: 'Rendering',  hint: 'Painting your CV pixel-perfect' },
  { key: 'finalizing', label: 'Finalizing', hint: 'Wrapping it into a PDF' },
  { key: 'done',       label: 'Ready',      hint: 'Saved to your downloads' },
];

const statusToStep = (status: string | null): StepKey => {
  if (!status) return 'preparing';
  const s = status.toLowerCase();
  if (s.includes('ready')) return 'done';
  if (s.includes('downloading')) return 'finalizing';
  if (s.includes('rendering') || s.includes('cloudflare') || s.includes('sending')) return 'rendering';
  return 'preparing';
};

// Encouraging micro-copy that rotates while we wait — keeps the moment
// feeling alive when a render takes a few seconds. Pure cosmetic; no impact
// on the actual download flow.
const TIPS = [
  'Tip: hold Shift + click the preview to inspect any text inline.',
  'Did you know? Your CV is rendered with the exact same engine as the preview, so what you see is what you get.',
  'Pro move: tailor your CV for each role — recruiters notice.',
  'Tip: numbers ("grew revenue 32%") beat adjectives every time.',
  'Almost there — high-fidelity PDFs are worth the extra heartbeat.',
];

interface DownloadProgressModalProps {
  status: string | null;            // current status string (null = closed)
  totalMs?: number | null;          // populated when finished — drives "Ready in X.Xs"
  via?: 'playwright' | 'cloudflare' | null;
  onClose?: () => void;             // optional manual dismiss while running
}

const DownloadProgressModal: React.FC<DownloadProgressModalProps> = ({ status, totalMs, via, onClose }) => {
  const currentStep = statusToStep(status);
  const currentIdx = useMemo(() => STEPS.findIndex(s => s.key === currentStep), [currentStep]);
  const isDone = currentStep === 'done';

  // ── Smooth progress bar ──────────────────────────────────────────────────
  // Each known step has a target percentage. We tween toward the target using
  // a tiny rAF loop so the bar looks alive even when the underlying status
  // string doesn't change for a few seconds (the "rendering" stage is the
  // worst offender — Cloudflare can take 3-5s to respond).
  const targetPct = isDone ? 100 : Math.min(95, (currentIdx + 1) * 25 + 5);
  const [pct, setPct] = useState(8);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setPct(prev => {
        // Approach the target asymptotically — feels organic vs linear jumps.
        const delta = (targetPct - prev) * 0.08;
        const next = Math.abs(delta) < 0.2 ? targetPct : prev + delta;
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [targetPct]);

  // ── Rotating tip line ────────────────────────────────────────────────────
  const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    if (isDone) return;
    const id = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 3500);
    return () => clearInterval(id);
  }, [isDone]);

  // ── Elapsed timer ────────────────────────────────────────────────────────
  // Only relevant while the download is in flight. Once finished we display
  // the authoritative `totalMs` from the service instead.
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef<number>(performance.now());
  useEffect(() => {
    startRef.current = performance.now();
    setElapsedMs(0);
    if (isDone) return;
    const id = setInterval(() => {
      setElapsedMs(performance.now() - startRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [isDone]);

  if (!status) return null;

  const elapsedSeconds = ((isDone && totalMs ? totalMs : elapsedMs) / 1000).toFixed(1);
  const viaLabel = via === 'playwright' ? 'local renderer' : via === 'cloudflare' ? 'cloud renderer' : null;

  return (
    <>
      {/* Subtle backdrop — tinted, not opaque, so the user still sees the
          preview behind the card and feels like the download is *of* the
          thing they were just looking at. */}
      <div
        className="fixed inset-0 z-[100] bg-zinc-900/30 dark:bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
        style={{ animation: 'dlFadeIn 150ms ease-out' }}
        role="dialog"
        aria-modal="true"
        aria-label="Download progress"
        onClick={(e) => {
          // Allow click-outside to dismiss only after success — never during
          // an in-flight render, which could leave UI state stale.
          if (isDone && e.target === e.currentTarget) onClose?.();
        }}
      >
        <div
          className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden"
          style={{ animation: 'dlZoomIn 200ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          {/* ── Header with animated PDF icon ──────────────────────────── */}
          <div className="px-6 pt-6 pb-4 flex items-start gap-4">
            <div className={`relative w-12 h-12 flex-shrink-0 rounded-xl flex items-center justify-center transition-colors duration-300 ${
              isDone ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-[#C9A84C]/15 dark:bg-[#C9A84C]/20'
            }`}>
              {isDone ? (
                <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400 animate-in zoom-in-50 duration-300" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <>
                  <svg className="w-6 h-6 text-[#C9A84C]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
                  </svg>
                  {/* Soft pulsing ring */}
                  <span className="absolute inset-0 rounded-xl ring-2 ring-[#C9A84C]/30 animate-ping" style={{ animationDuration: '1.8s' }} />
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {isDone ? 'Your CV is ready' : 'Building your PDF'}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                {isDone
                  ? `Saved in ${elapsedSeconds}s${viaLabel ? ` · ${viaLabel}` : ''}`
                  : STEPS[Math.max(0, currentIdx)].hint}
              </p>
            </div>
            {isDone && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex-shrink-0 -mr-2 -mt-1 w-8 h-8 rounded-full hover:bg-zinc-100 dark:hover:bg-neutral-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* ── Smooth progress bar ────────────────────────────────────── */}
          <div className="px-6">
            <div className="relative h-1.5 bg-zinc-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-colors duration-300 ${
                  isDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#C9A84C] to-[#e0c068]'
                }`}
                style={{ width: `${pct}%`, transition: 'width 80ms linear' }}
              />
              {/* Shimmer sweep — only while in flight */}
              {!isDone && (
                <div
                  className="absolute inset-y-0 w-1/3 -translate-x-full opacity-60"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
                    animation: 'dlShimmer 1.6s infinite',
                  }}
                />
              )}
            </div>
            <div className="flex justify-between items-center mt-1.5">
              <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                {Math.round(pct)}%
              </span>
              <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                {elapsedSeconds}s
              </span>
            </div>
          </div>

          {/* ── Step list ──────────────────────────────────────────────── */}
          <div className="px-6 py-4">
            <ul className="space-y-2">
              {STEPS.map((step, i) => {
                const done = i < currentIdx || isDone;
                const active = i === currentIdx && !isDone;
                const pending = i > currentIdx;
                return (
                  <li key={step.key} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                      done
                        ? 'bg-emerald-500 text-white'
                        : active
                        ? 'bg-[#C9A84C]/20 dark:bg-[#C9A84C]/30 ring-2 ring-[#C9A84C]'
                        : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-400'
                    }`}>
                      {done ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : active ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-neutral-600" />
                      )}
                    </div>
                    <span className={`text-sm flex-1 transition-colors duration-200 ${
                      active
                        ? 'font-semibold text-zinc-900 dark:text-zinc-100'
                        : done
                        ? 'text-zinc-600 dark:text-zinc-400'
                        : pending
                        ? 'text-zinc-400 dark:text-zinc-500'
                        : 'text-zinc-700 dark:text-zinc-300'
                    }`}>
                      {step.label}
                    </span>
                    {active && (
                      <svg className="animate-spin h-3.5 w-3.5 text-[#C9A84C]" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── Footer: rotating tip OR success message ────────────────── */}
          <div className={`px-6 py-3 border-t border-zinc-100 dark:border-neutral-800 transition-colors duration-300 ${
            isDone ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-zinc-50 dark:bg-neutral-800/40'
          }`}>
            {isDone ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Check your downloads folder.
              </p>
            ) : (
              <p
                key={tipIdx}
                className="text-xs text-zinc-600 dark:text-zinc-400 italic leading-snug"
                style={{ animation: 'dlTipIn 300ms ease-out' }}
              >
                {TIPS[tipIdx]}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Local keyframes — scoped here so we don't pollute global CSS for a
          single one-off shimmer animation. */}
      <style>{`
        @keyframes dlShimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes dlFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes dlZoomIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        @keyframes dlTipIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>
    </>
  );
};

export default DownloadProgressModal;
