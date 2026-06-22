/**
 * FreePlanNudge.tsx
 *
 * A slim, dismissible banner that appears between the header and main content
 * for pure free-tier users (no BYOK keys, not premium). It shows how many of
 * their 5 lifetime PDF downloads they have left, with an upgrade CTA.
 *
 * Visibility rules:
 *  - Hidden for BYOK and premium users.
 *  - Hidden if 0 downloads used (no point showing "0 of 5 used" on first visit).
 *  - Dimissible — pressing × writes a sessionStorage key so the banner stays
 *    hidden for the rest of the browser session, but reappears next visit.
 *    Exception: if they've hit the hard limit the banner is NOT dismissible
 *    (they must upgrade or know they can no longer download).
 */

import { useEffect, useState } from 'react';
import { X, Download, Zap } from 'lucide-react';
import {
  isPureFreeTier,
  FREE_PDF_LIMIT,
  getPdfDownloadCount,
} from '../services/accountTierService';

const DISMISS_KEY = 'procv:free-nudge:dismissed-session';

function openPricing() {
  window.dispatchEvent(new CustomEvent('procv:openPricing'));
}

export default function FreePlanNudge() {
  const [used, setUsed] = useState(0);
  const [isPure, setIsPure] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Read counts on mount and re-read whenever a download finishes or tier changes.
  function refresh() {
    setIsPure(isPureFreeTier());
    setUsed(getPdfDownloadCount());
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }

  useEffect(() => {
    refresh();
    // Re-read after every tier change event (e.g. user adds BYOK key in settings).
    const onTier = () => refresh();
    window.addEventListener('procv:tierChanged', onTier);
    // Re-read after a download counter changes (storage event from this or other tabs).
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'procv:pdfDownloadCount') refresh();
    };
    window.addEventListener('storage', onStorage);
    // Also re-check periodically in case the counter was incremented in this tab
    // (same-tab localStorage changes don't fire storage events).
    const id = setInterval(refresh, 5_000);
    return () => {
      window.removeEventListener('procv:tierChanged', onTier);
      window.removeEventListener('storage', onStorage);
      clearInterval(id);
    };
  }, []);

  const remaining = Math.max(0, FREE_PDF_LIMIT - used);
  const atLimit = remaining === 0;

  // Only show for pure-free users who have used at least one download.
  if (!isPure || used === 0) return null;
  // Dismissed (and not at hard limit) → hidden for this session.
  if (dismissed && !atLimit) return null;

  const pct = Math.min(100, Math.round((used / FREE_PDF_LIMIT) * 100));

  // Colour ramp: green → amber → red
  const barColour =
    pct < 60 ? 'bg-emerald-500' : pct < 100 ? 'bg-amber-500' : 'bg-red-500';
  const bgColour = atLimit
    ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
    : pct >= 60
    ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
    : 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800';
  const textColour = atLimit
    ? 'text-red-800 dark:text-red-200'
    : pct >= 60
    ? 'text-amber-800 dark:text-amber-200'
    : 'text-blue-800 dark:text-blue-200';
  const subColour = atLimit
    ? 'text-red-600 dark:text-red-400'
    : pct >= 60
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-blue-600 dark:text-blue-400';

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className={`border-b ${bgColour} transition-colors`} role="status" aria-live="polite">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-2.5">

          {/* Icon */}
          <Download className={`h-4 w-4 flex-shrink-0 ${subColour}`} aria-hidden />

          {/* Message */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className={`text-sm font-semibold ${textColour}`}>
                {atLimit
                  ? 'Free PDF limit reached'
                  : `${remaining} free PDF download${remaining === 1 ? '' : 's'} remaining`}
              </span>
              <span className={`text-xs ${subColour} hidden sm:inline`}>
                {atLimit
                  ? `You've used all ${FREE_PDF_LIMIT} lifetime downloads on the free plan.`
                  : `${used} of ${FREE_PDF_LIMIT} lifetime downloads used.`}
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-1 h-1 w-full max-w-xs rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColour}`}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            </div>
          </div>

          {/* Upgrade CTA */}
          <button
            onClick={openPricing}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B2B4B] hover:bg-[#243a63] text-white text-xs font-bold transition-colors shadow-sm"
          >
            <Zap className="h-3 w-3" aria-hidden />
            Upgrade
          </button>

          {/* Dismiss — hidden at hard limit */}
          {!atLimit && (
            <button
              onClick={dismiss}
              title="Dismiss"
              className={`flex-shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${subColour}`}
              aria-label="Dismiss banner"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
