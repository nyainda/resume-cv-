import React, { useEffect, useState } from 'react';

interface InactivityWarningModalProps {
  isOpen: boolean;
  onStay: () => void;
  onSignOut: () => void;
  warningSeconds?: number;
}

const InactivityWarningModal: React.FC<InactivityWarningModalProps> = ({
  isOpen,
  onStay,
  onSignOut,
  warningSeconds = 120,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(warningSeconds);

  useEffect(() => {
    if (!isOpen) {
      setSecondsLeft(warningSeconds);
      return;
    }
    setSecondsLeft(warningSeconds);
    const timer = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(timer);
          onSignOut();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, warningSeconds, onSignOut]);

  if (!isOpen) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeStr = mins > 0
    ? `${mins}:${String(secs).padStart(2, '0')}`
    : `${secs}s`;

  const pct = (secondsLeft / warningSeconds) * 100;

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
      <div
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-5"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inactivity-title"
      >
        {/* Icon + heading */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: '#FEF3C7' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="inactivity-title"
                className="text-base font-black text-zinc-900 dark:text-zinc-50 leading-snug"
                style={{ fontFamily: "'Playfair Display', serif" }}>
              Still there?
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
              You've been inactive for a while. For your security, we'll sign you out automatically.
            </p>
          </div>
        </div>

        {/* Countdown bar */}
        <div className="space-y-1.5">
          <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-neutral-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${pct}%`,
                background: pct > 40 ? '#C9A84C' : pct > 15 ? '#F97316' : '#DC2626',
              }}
            />
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 text-right font-mono">
            Signing out in {timeStr}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onSignOut}
            className="flex-1 py-2.5 rounded-xl border-2 border-zinc-200 dark:border-neutral-700 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-all"
          >
            Sign out
          </button>
          <button
            onClick={onStay}
            className="flex-1 py-2.5 rounded-xl text-sm font-black text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: '#1B2B4B' }}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
};

export default InactivityWarningModal;
