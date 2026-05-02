import { useEffect, useState } from 'react';
import { WORKER_STATUS_EVENT, getLatestWorkerStatus, type WorkerStatusDetail } from '../services/workerStatusDiagnostic';
import { PROVIDER_HEALTH_EVENT, type ProviderHealthChange } from '../services/providerHealth';
import {
    PROVIDER_CHAIN_EVENT,
    getProviderChainStatus,
    type ProviderChainStatus,
    type ProviderChainEntry,
    type ProviderHealthState,
} from '../services/groqService';

const DISMISS_STORAGE_KEY = 'procv:worker-status-banner:dismissed-utc-day';

function currentUtcDay(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function minutesUntilUtcReset(): number {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    return Math.max(0, Math.round((next.getTime() - now.getTime()) / 60000));
}

function formatReset(mins: number): string {
    if (mins <= 0) return 'any moment';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Provider pill ───────────────────────────────────────────────────────────

const STATE_CONFIG: Record<ProviderHealthState, { dot: string; pill: string; label: string }> = {
    ok:              { dot: 'bg-emerald-500',               pill: 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-700 dark:text-emerald-200', label: '✓ ok' },
    quota_exhausted: { dot: 'bg-amber-500',                 pill: 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-200',           label: 'rate limited' },
    auth_failed:     { dot: 'bg-red-500',                   pill: 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/50 dark:border-red-700 dark:text-red-200',                       label: 'bad key' },
    failed:          { dot: 'bg-red-400',                   pill: 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/50 dark:border-red-700 dark:text-red-200',                       label: 'error' },
    no_key:          { dot: 'bg-zinc-300 dark:bg-zinc-600', pill: 'bg-zinc-50 border-zinc-200 text-zinc-400 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-zinc-500',                label: 'no key' },
    never_tried:     { dot: 'bg-zinc-300 dark:bg-zinc-600', pill: 'bg-zinc-50 border-zinc-200 text-zinc-500 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-zinc-400',                label: 'standby' },
};

function ProviderPill({ entry }: { entry: ProviderChainEntry }) {
    const cfg = STATE_CONFIG[entry.state];
    const shortName = entry.name === 'Workers AI' ? 'CF Workers' : entry.name;
    return (
        <span
            title={entry.lastError ? `${entry.name}: ${entry.lastError}` : entry.name}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${cfg.pill} ${entry.state === 'no_key' ? 'opacity-40' : ''}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} aria-hidden />
            <span>{shortName}</span>
            <span className="opacity-60">· {cfg.label}</span>
        </span>
    );
}

// ─── Banner ──────────────────────────────────────────────────────────────────

export default function WorkerStatusBanner() {
    // `detail` = latest result from the startup LLM diagnostic.
    // This is the *authoritative* source of truth for CF LLM health.
    // We intentionally do NOT rely on the circuit-breaker state alone because
    // non-LLM CF endpoints (e.g. /api/cv/banned D1 reads) can close the circuit
    // even when the LLM quota is still exhausted.
    const [detail, setDetail] = useState<WorkerStatusDetail | null>(() => getLatestWorkerStatus());

    // Provider fallback chain states (Groq, Cerebras, OpenRouter, …).
    const [chain, setChain] = useState<ProviderChainStatus>(() => getProviderChainStatus());

    const [dismissed, setDismissed] = useState<boolean>(() => {
        try { return localStorage.getItem(DISMISS_STORAGE_KEY) === currentUtcDay(); } catch { return false; }
    });

    const [resetMins, setResetMins] = useState(() => minutesUntilUtcReset());

    useEffect(() => {
        const id = setInterval(() => setResetMins(minutesUntilUtcReset()), 60_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const onStatus = (e: Event) => {
            const ce = e as CustomEvent<WorkerStatusDetail>;
            if (ce?.detail) setDetail(ce.detail);
        };

        const onHealth = (e: Event) => {
            const ce = e as CustomEvent<ProviderHealthChange>;
            if (ce?.detail?.provider !== 'cf-worker') return;
            if (ce.detail.state === 'closed') {
                // Circuit recovered — clear dismiss flag so the next outage surfaces the banner.
                try { localStorage.removeItem(DISMISS_STORAGE_KEY); } catch { /* ignore */ }
                setDismissed(false);
                // Re-run the startup diagnostic to confirm whether the LLM is actually healthy.
                // If it's still quota-exhausted, detail.healthy will remain false and the banner
                // will stay visible. If it genuinely recovered, detail.healthy → true and banner hides.
                if (typeof window !== 'undefined' && typeof (window as any).__workerStatus === 'function') {
                    setTimeout(() => void (window as any).__workerStatus(), 1500);
                }
            }
        };

        const onChain = (e: Event) => {
            const ce = e as CustomEvent<ProviderChainStatus>;
            if (ce?.detail) setChain(ce.detail);
        };

        window.addEventListener(WORKER_STATUS_EVENT, onStatus);
        window.addEventListener(PROVIDER_HEALTH_EVENT, onHealth);
        window.addEventListener(PROVIDER_CHAIN_EVENT, onChain);
        return () => {
            window.removeEventListener(WORKER_STATUS_EVENT, onStatus);
            window.removeEventListener(PROVIDER_HEALTH_EVENT, onHealth);
            window.removeEventListener(PROVIDER_CHAIN_EVENT, onChain);
        };
    }, []);

    // ── Visibility ──────────────────────────────────────────────────────────
    // Show if CF diagnostic says LLM is unhealthy (quota/unreachable), OR if
    // any fallback provider has been tried and returned a bad state.
    const cfDiagnosticBad = detail != null && !detail.healthy && detail.reason !== 'misconfigured';
    const anyProviderBad = chain.providers.some(
        p => p.state === 'quota_exhausted' || p.state === 'auth_failed' || p.state === 'failed',
    );

    if (!cfDiagnosticBad && !anyProviderBad) return null;
    if (dismissed) return null;

    // ── Styling ─────────────────────────────────────────────────────────────
    const isQuota = detail?.reason === 'quota_exhausted'
        || chain.providers.some(p => p.state === 'quota_exhausted');
    const isReachabilityIssue = detail?.reason === 'unreachable';

    const containerClass = isQuota
        ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100'
        : 'bg-zinc-50 border-zinc-200 text-zinc-800 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-200';
    const dotClass = isQuota ? 'bg-amber-500' : 'bg-zinc-400';

    const handleDismiss = () => {
        try { localStorage.setItem(DISMISS_STORAGE_KEY, currentUtcDay()); } catch { /* ignore */ }
        setDismissed(true);
    };

    // Show providers that have a key configured OR have been tried at least once.
    const pillProviders = chain.providers.filter(p => p.hasKey || p.attempts > 0);

    return (
        <div
            role="status"
            aria-live="polite"
            className={`w-full border-b ${containerClass} text-sm`}
        >
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-start gap-3">
                <span className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} aria-hidden />

                <div className="flex-1 min-w-0 space-y-1.5">
                    {/* CF Worker status line */}
                    {cfDiagnosticBad && (
                        <p className="leading-snug">
                            <span className="font-semibold">
                                {isQuota ? 'AI quota exceeded'
                                    : isReachabilityIssue ? 'AI worker unreachable'
                                    : 'AI worker issue'}
                            </span>
                            <span className="mx-1.5 opacity-40">·</span>
                            <span className="opacity-80">{detail!.message}</span>
                            {isQuota && resetMins > 0 && (
                                <span className="ml-1.5 opacity-60 text-xs">
                                    (resets in {formatReset(resetMins)})
                                </span>
                            )}
                        </p>
                    )}

                    {/* Provider fallback chain pills */}
                    {pillProviders.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-xs opacity-50 font-medium mr-0.5">Fallback chain:</span>
                            {pillProviders.map((entry, i) => (
                                <span key={entry.name} className="inline-flex items-center gap-1">
                                    <ProviderPill entry={entry} />
                                    {i < pillProviders.length - 1 && (
                                        <span className="opacity-25 text-xs select-none" aria-hidden>›</span>
                                    )}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Last successful engine */}
                    {chain.lastEngineUsed && chain.lastEngineUsed !== 'Workers AI' && anyProviderBad && (
                        <p className="text-xs opacity-50">
                            Currently using: <span className="font-medium">{chain.lastEngineUsed}</span>
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleDismiss}
                    className="flex-shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline opacity-60 hover:opacity-100 mt-0.5"
                    aria-label="Dismiss banner"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
