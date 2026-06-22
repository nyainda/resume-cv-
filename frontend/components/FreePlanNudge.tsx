/**
 * FreePlanNudge.tsx
 *
 * Two slim, dismissible banners between the header and main content:
 *
 * 1. PDF-limit nudge  — for pure free-tier users who have used ≥1 download.
 *    Shows remaining count + progress bar + "Upgrade" CTA.
 *    Not dismissible at the hard limit.
 *
 * 2. Drive nudge — for signed-in users who haven't connected Google Drive.
 *    Shown once per device (localStorage dismiss key, not session).
 *    Fires procv:openSettings so the user lands directly on the backup panel.
 *    Never shown alongside the PDF-limit nudge at the hard limit (PDF takes
 *    priority) — otherwise both can show stacked.
 */

import { useEffect, useState } from 'react';
import { X, Download, Zap, CloudUpload } from 'lucide-react';
import {
  isPureFreeTier,
  FREE_PDF_LIMIT,
  getPdfDownloadCount,
} from '../services/accountTierService';
import { useAuth } from '../auth/AuthContext';

const PDF_DISMISS_KEY   = 'procv:free-nudge:dismissed-session';
const DRIVE_DISMISS_KEY = 'procv:drive-nudge:dismissed';

function openPricing()  { window.dispatchEvent(new CustomEvent('procv:openPricing')); }
function openSettings() { window.dispatchEvent(new CustomEvent('procv:openSettings')); }

// ─── PDF-limit nudge ─────────────────────────────────────────────────────────

function PdfLimitBanner() {
  const [used, setUsed]           = useState(0);
  const [isPure, setIsPure]       = useState(false);
  const [dismissed, setDismissed] = useState(false);

  function refresh() {
    setIsPure(isPureFreeTier());
    setUsed(getPdfDownloadCount());
    try { setDismissed(sessionStorage.getItem(PDF_DISMISS_KEY) === '1'); }
    catch { setDismissed(false); }
  }

  useEffect(() => {
    refresh();
    const onTier    = () => refresh();
    const onStorage = (e: StorageEvent) => { if (e.key === 'procv:pdfDownloadCount') refresh(); };
    window.addEventListener('procv:tierChanged', onTier);
    window.addEventListener('storage', onStorage);
    const id = setInterval(refresh, 5_000);
    return () => {
      window.removeEventListener('procv:tierChanged', onTier);
      window.removeEventListener('storage', onStorage);
      clearInterval(id);
    };
  }, []);

  const remaining = Math.max(0, FREE_PDF_LIMIT - used);
  const atLimit   = remaining === 0;

  if (!isPure || used === 0)       return null;
  if (dismissed && !atLimit)       return null;

  const pct = Math.min(100, Math.round((used / FREE_PDF_LIMIT) * 100));

  const barColour = pct < 60 ? 'bg-emerald-500' : pct < 100 ? 'bg-amber-500' : 'bg-red-500';
  const bgColour  = atLimit
    ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
    : pct >= 60
    ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
    : 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800';
  const textColour = atLimit
    ? 'text-red-800 dark:text-red-200'
    : pct >= 60 ? 'text-amber-800 dark:text-amber-200' : 'text-blue-800 dark:text-blue-200';
  const subColour = atLimit
    ? 'text-red-600 dark:text-red-400'
    : pct >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400';

  function dismiss() {
    try { sessionStorage.setItem(PDF_DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className={`border-b ${bgColour} transition-colors`} role="status" aria-live="polite">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-2.5">
          <Download className={`h-4 w-4 flex-shrink-0 ${subColour}`} aria-hidden />

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
            <div className="mt-1 h-1 w-full max-w-xs rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColour}`}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            </div>
          </div>

          <button
            onClick={openPricing}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B2B4B] hover:bg-[#243a63] text-white text-xs font-bold transition-colors shadow-sm"
          >
            <Zap className="h-3 w-3" aria-hidden />
            Upgrade
          </button>

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

// ─── Drive nudge ─────────────────────────────────────────────────────────────

function DriveNudgeBanner() {
  const { isAuthenticated, driveConnected } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DRIVE_DISMISS_KEY) === '1'); }
    catch { setDismissed(false); }
  }, []);

  // Only show when signed in, Drive NOT connected, and not dismissed.
  if (!isAuthenticated || driveConnected || dismissed) return null;

  function dismiss() {
    try { localStorage.setItem(DRIVE_DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div
      className="border-b bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800 transition-colors"
      role="status"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-2">
          <CloudUpload className="h-4 w-4 flex-shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden />

          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
              Back up your CVs to Google Drive
            </span>
            <span className="ml-2 text-xs text-indigo-600 dark:text-indigo-400 hidden sm:inline">
              Keep your work safe and access it from any browser.
            </span>
          </div>

          <button
            onClick={() => { dismiss(); openSettings(); }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-sm"
          >
            Connect Drive
          </button>

          <button
            onClick={dismiss}
            title="Dismiss"
            className="flex-shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-indigo-500 dark:text-indigo-400"
            aria-label="Dismiss Drive suggestion"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Exported wrapper ─────────────────────────────────────────────────────────

export default function FreePlanNudge() {
  return (
    <>
      <PdfLimitBanner />
      <DriveNudgeBanner />
    </>
  );
}
