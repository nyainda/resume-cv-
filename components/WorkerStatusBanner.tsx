import { useEffect, useState } from 'react';
import { WORKER_STATUS_EVENT, getLatestWorkerStatus, type WorkerStatusDetail } from '../services/workerStatusDiagnostic';
import { PROVIDER_HEALTH_EVENT, getAllStatus, type ProviderHealthChange } from '../services/providerHealth';

const DISMISS_STORAGE_KEY = 'procv:worker-status-banner:dismissed-utc-day';

function currentUtcDay(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function hoursUntilUtcReset(): number {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    return Math.max(0, Math.ceil((next.getTime() - now.getTime()) / (60 * 60 * 1000)));
}

export default function WorkerStatusBanner() {
    // Seed with the cached status so we still show even if the diagnostic
    // event already fired before this component mounted (e.g. user spent
    // time on the landing page first).
    const [detail, setDetail] = useState<WorkerStatusDetail | null>(() => getLatestWorkerStatus());

    // Track whether the central providerHealth circuit for the CV worker is
    // currently open. When the auto-probe recovers it we hide the banner
    // automatically — no need to make the user click Dismiss.
    const [cfWorkerHealthy, setCfWorkerHealthy] = useState<boolean>(() => {
        const cf = getAllStatus().find((s) => s.provider === 'cf-worker');
        return !cf || cf.state === 'closed';
    });

    const [dismissed, setDismissed] = useState<boolean>(() => {
        try {
            return localStorage.getItem(DISMISS_STORAGE_KEY) === currentUtcDay();
        } catch {
            return false;
        }
    });

    useEffect(() => {
        const onStatus = (e: Event) => {
            const ce = e as CustomEvent<WorkerStatusDetail>;
            if (ce?.detail) setDetail(ce.detail);
        };
        const onHealth = (e: Event) => {
            const ce = e as CustomEvent<ProviderHealthChange>;
            if (ce?.detail?.provider !== 'cf-worker') return;
            const healthy = ce.detail.state === 'closed';
            setCfWorkerHealthy(healthy);
            // Recovery clears the per-day dismiss flag so the next outage
            // (later today) will surface the banner again.
            if (healthy) {
                try { localStorage.removeItem(DISMISS_STORAGE_KEY); } catch { /* ignore */ }
                setDismissed(false);
            }
        };
        window.addEventListener(WORKER_STATUS_EVENT, onStatus);
        window.addEventListener(PROVIDER_HEALTH_EVENT, onHealth);
        return () => {
            window.removeEventListener(WORKER_STATUS_EVENT, onStatus);
            window.removeEventListener(PROVIDER_HEALTH_EVENT, onHealth);
        };
    }, []);

    if (!detail || detail.healthy) return null;
    if (detail.reason === 'misconfigured') return null;
    if (dismissed) return null;
    // Auto-recovered? Don't show even if the last diagnostic detail was bad.
    if (cfWorkerHealthy) return null;

    const isQuota = detail.reason === 'quota_exhausted';
    const hours = isQuota ? hoursUntilUtcReset() : 0;

    const containerClass = isQuota
        ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-100'
        : 'bg-zinc-50 border-zinc-300 text-zinc-800 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-200';

    const dotClass = isQuota ? 'bg-amber-500' : 'bg-zinc-500';

    const handleDismiss = () => {
        try { localStorage.setItem(DISMISS_STORAGE_KEY, currentUtcDay()); } catch { /* ignore */ }
        setDismissed(true);
    };

    return (
        <div
            role="status"
            aria-live="polite"
            className={`w-full border-b ${containerClass} text-sm`}
        >
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-start gap-3">
                <span className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} aria-hidden />
                <div className="flex-1 min-w-0">
                    <p className="leading-snug">
                        <span className="font-semibold">
                            {isQuota ? 'AI quota exceeded' : 'AI worker unreachable'}
                        </span>
                        <span className="mx-1.5 opacity-50">•</span>
                        <span>{detail.message}</span>
                        {isQuota && hours > 0 && (
                            <span className="ml-1 opacity-80">
                                (resets in ~{hours} {hours === 1 ? 'hour' : 'hours'})
                            </span>
                        )}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleDismiss}
                    className="flex-shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline opacity-80 hover:opacity-100"
                    aria-label="Dismiss for today"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
