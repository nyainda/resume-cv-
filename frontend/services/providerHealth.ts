/**
 * providerHealth.ts
 *
 * Single source of truth for "is provider X working right now?".
 *
 * Three providers only (matching Settings → AI Provider):
 *   cf-worker  — Cloudflare Workers AI (no user key needed)
 *   claude     — Anthropic Claude (user's key)
 *   gemini     — Google Gemini (user's key)
 *
 * No Groq, Cerebras, OpenRouter, or Together.ai.
 */

export type Provider = 'cf-worker' | 'claude' | 'gemini';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface ProviderStatus {
    provider: Provider;
    state: CircuitState;
    openedAt?: number;
    consecutiveFails: number;
    lastError?: string;
    lastSuccessAt?: number;
}

export interface ProviderHealthChange {
    provider: Provider;
    state: CircuitState;
    reason?: string;
}

export const PROVIDER_HEALTH_EVENT = 'procv:provider-health';

const PROBE_INTERVAL_MS = 3 * 60 * 1000;
const FAILS_TO_OPEN     = 1;

// ─── Per-task provider preference (single provider per task) ─────────────────
const TASK_PREFERENCE: Record<string, Provider[]> = {
    'cv-generate':       ['cf-worker'],
    'cv-improve':        ['cf-worker'],
    'cv-validate':       ['cf-worker'],
    'cv-audit':          ['cf-worker'],
    'cv-humanize':       ['cf-worker'],
    'cv-purify-rules':   [],
    'voice-consistency': ['cf-worker'],
    'jd-parse':          ['cf-worker'],
    'cover-letter':      ['cf-worker'],
    'profile-import':    ['gemini'],
    'vision-extract':    ['cf-worker', 'gemini'],
    'cache-lookup':      [],
};
const GENERAL: Provider[] = ['cf-worker'];

// ─── State ───────────────────────────────────────────────────────────────────
const status = new Map<Provider, ProviderStatus>();

function ensure(p: Provider): ProviderStatus {
    let s = status.get(p);
    if (!s) {
        s = { provider: p, state: 'closed', consecutiveFails: 0 };
        status.set(p, s);
    }
    return s;
}

function emit(change: ProviderHealthChange): void {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent<ProviderHealthChange>(PROVIDER_HEALTH_EVENT, { detail: change }));
    } catch { /* CustomEvent unsupported */ }
}

export function isHealthy(p: Provider): boolean {
    const s = ensure(p);
    return s.state !== 'open';
}

export function getAllStatus(): ProviderStatus[] {
    return Array.from(status.values()).map((s) => ({ ...s }));
}

export function getStatus(p: Provider): ProviderStatus {
    return { ...ensure(p) };
}

export function pickProvider(task: string): Provider[] {
    const order = TASK_PREFERENCE[task] ?? GENERAL;
    return order.filter(isHealthy);
}

export function markFailure(p: Provider, reason?: string): void {
    const s = ensure(p);
    s.consecutiveFails += 1;
    s.lastError = reason;
    if (s.state !== 'open' && s.consecutiveFails >= FAILS_TO_OPEN) {
        s.state = 'open';
        s.openedAt = Date.now();
        emit({ provider: p, state: 'open', reason });
        if (typeof console !== 'undefined' && import.meta.env.DEV) {
            console.warn(`[providerHealth] Opened circuit for ${p}: ${reason ?? 'unspecified'}`);
        }
    } else if (s.state === 'half-open') {
        s.state = 'open';
        s.openedAt = Date.now();
        emit({ provider: p, state: 'open', reason });
    }
}

export function markSuccess(p: Provider): void {
    const s = ensure(p);
    s.lastSuccessAt = Date.now();
    s.consecutiveFails = 0;
    s.lastError = undefined;
    if (s.state !== 'closed') {
        s.state = 'closed';
        s.openedAt = undefined;
        emit({ provider: p, state: 'closed' });
        if (typeof console !== 'undefined' && import.meta.env.DEV) {
            console.info(`[providerHealth] Recovered: ${p}`);
        }
    }
}

export function subscribe(listener: (change: ProviderHealthChange) => void): () => void {
    if (typeof window === 'undefined') return () => { /* noop */ };
    const handler = (e: Event) => {
        const ce = e as CustomEvent<ProviderHealthChange>;
        if (ce?.detail) listener(ce.detail);
    };
    window.addEventListener(PROVIDER_HEALTH_EVENT, handler);
    return () => window.removeEventListener(PROVIDER_HEALTH_EVENT, handler);
}

let probeTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoProbe(intervalMs: number = PROBE_INTERVAL_MS): () => void {
    if (probeTimer) return () => stopAutoProbe();
    probeTimer = setInterval(() => {
        const now = Date.now();
        for (const s of status.values()) {
            if (s.state !== 'open') continue;
            if (!s.openedAt || now - s.openedAt < intervalMs) continue;
            s.state = 'half-open';
            s.consecutiveFails = 0;
            emit({ provider: s.provider, state: 'half-open' });
            if (typeof console !== 'undefined' && import.meta.env.DEV) {
                console.info(`[providerHealth] Half-opening for trial: ${s.provider}`);
            }
        }
    }, Math.min(intervalMs, 60_000));
    return () => stopAutoProbe();
}

export function stopAutoProbe(): void {
    if (probeTimer) {
        clearInterval(probeTimer);
        probeTimer = null;
    }
}

export function _resetForTests(): void {
    status.clear();
    stopAutoProbe();
}
