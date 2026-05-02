/**
 * providerHealth.ts
 *
 * Single source of truth for "is provider X working right now?". Every AI
 * provider client (cvEngineClient, groqCacheClient, geminiService, etc.)
 * reports failures and successes here, and asks here who to use next.
 *
 * Why this exists:
 *   The CV pipeline calls 4 different upstreams (CF Workers AI, Groq, Gemini,
 *   OpenRouter) from many places. Before this module each client kept its own
 *   "circuit open" flag — meaning a 502 on `/api/cv/llm` didn't tell the
 *   `/api/cv/tiered-llm` caller anything, and once a circuit was open it
 *   stayed open until full page reload. That made transient 502s feel
 *   permanent and made the user wait through dozens of doomed retries.
 *
 * Behaviour:
 *   - Each provider has a single circuit: closed (healthy) / open (skipped) /
 *     half-open (one trial call allowed).
 *   - First failure flips closed → open and stamps `openedAt`.
 *   - `startAutoProbe()` re-checks open circuits every PROBE_INTERVAL_MS by
 *     putting them into half-open. The next call is allowed through; if it
 *     succeeds the circuit closes, if it fails we re-open and try again later.
 *   - State changes dispatch a `procv:provider-health` CustomEvent so the UI
 *     (banner) can react in real time.
 *
 * This is NOT a router — it doesn't make network calls. It just answers
 * "should I bother trying provider X right now, and what should I try first
 * for task Y?". Each client decides how it actually invokes the upstream.
 */

export type Provider = 'cf-worker' | 'groq' | 'groq-cache' | 'gemini' | 'openrouter';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface ProviderStatus {
    provider: Provider;
    state: CircuitState;
    openedAt?: number;          // epoch ms when state flipped to 'open'
    consecutiveFails: number;
    lastError?: string;
    lastSuccessAt?: number;     // epoch ms of last successful call
}

export interface ProviderHealthChange {
    provider: Provider;
    state: CircuitState;
    reason?: string;
}

export const PROVIDER_HEALTH_EVENT = 'procv:provider-health';

// ─── Tunables ────────────────────────────────────────────────────────────────
const PROBE_INTERVAL_MS = 3 * 60 * 1000;   // re-probe open circuits every 3 min
const FAILS_TO_OPEN     = 1;               // first failure opens the circuit (fast-fail)

// ─── Per-task provider preference order ──────────────────────────────────────
// "First try X, if dead try Y, then Z". Tasks not listed fall back to GENERAL.
// This is advisory — call sites can ignore it; it just helps them ask
// `pickProvider('cv-generate')` instead of hardcoding chains everywhere.
const TASK_PREFERENCE: Record<string, Provider[]> = {
    'cv-generate':       ['groq', 'cf-worker', 'gemini'],
    'cv-improve':        ['groq', 'cf-worker', 'gemini'],
    'cv-validate':       ['cf-worker', 'groq'],          // small + free preferred
    'cv-audit':          ['cf-worker', 'groq'],
    'cv-humanize':       ['cf-worker', 'groq'],
    'cv-purify-rules':   [],                              // pure JS — no provider
    'voice-consistency': ['cf-worker', 'groq'],
    'jd-parse':          ['cf-worker', 'groq'],
    'cover-letter':      ['cf-worker', 'groq', 'gemini'],
    'profile-import':    ['gemini'],                      // Gemini is best at PDF/Word
    'vision-extract':    ['cf-worker', 'gemini'],
    'cache-lookup':      ['groq-cache'],
};
const GENERAL: Provider[] = ['groq', 'cf-worker', 'gemini'];

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
    } catch {
        /* CustomEvent unsupported — ignore */
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** True when the provider is closed OR half-open (= worth attempting). */
export function isHealthy(p: Provider): boolean {
    const s = ensure(p);
    return s.state !== 'open';
}

/** Full snapshot — useful for the banner / status diagnostic. */
export function getAllStatus(): ProviderStatus[] {
    return Array.from(status.values()).map((s) => ({ ...s }));
}

export function getStatus(p: Provider): ProviderStatus {
    return { ...ensure(p) };
}

/**
 * Returns the ordered list of providers worth trying for `task`.
 * Skips any provider whose circuit is currently 'open'.
 * Empty list → caller must use deterministic JS (or surrender).
 */
export function pickProvider(task: string): Provider[] {
    const order = TASK_PREFERENCE[task] ?? GENERAL;
    return order.filter(isHealthy);
}

/**
 * Report a failure. Bumps fail count; once it reaches FAILS_TO_OPEN, the
 * circuit opens and subsequent calls short-circuit until auto-probe recovers
 * it (or markSuccess is called).
 *
 * `reason` is a short string used in the banner (e.g. "HTTP 502 (neuron quota)").
 */
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
        // Probe failed — re-open and reset the timer.
        s.state = 'open';
        s.openedAt = Date.now();
        emit({ provider: p, state: 'open', reason });
    }
}

/**
 * Report a success. Closes the circuit if it was open or half-open and
 * resets the fail counter. Idempotent for already-closed circuits.
 */
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

/**
 * Subscribe to state changes. Returns an unsubscribe function.
 */
export function subscribe(listener: (change: ProviderHealthChange) => void): () => void {
    if (typeof window === 'undefined') return () => { /* noop */ };
    const handler = (e: Event) => {
        const ce = e as CustomEvent<ProviderHealthChange>;
        if (ce?.detail) listener(ce.detail);
    };
    window.addEventListener(PROVIDER_HEALTH_EVENT, handler);
    return () => window.removeEventListener(PROVIDER_HEALTH_EVENT, handler);
}

// ─── Auto-recovery ───────────────────────────────────────────────────────────
// Periodically nudges any open circuit into half-open. The next real call from
// a client will then be allowed through; success closes the circuit, failure
// re-opens it. We don't actively probe — that would waste neurons and tokens
// on a dead provider; we just let the natural traffic try once.

let probeTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoProbe(intervalMs: number = PROBE_INTERVAL_MS): () => void {
    if (probeTimer) return () => stopAutoProbe();
    probeTimer = setInterval(() => {
        const now = Date.now();
        for (const s of status.values()) {
            if (s.state !== 'open') continue;
            if (!s.openedAt || now - s.openedAt < intervalMs) continue;
            s.state = 'half-open';
            // Reset the fail counter so a single success closes us.
            s.consecutiveFails = 0;
            emit({ provider: s.provider, state: 'half-open' });
            if (typeof console !== 'undefined' && import.meta.env.DEV) {
                console.info(`[providerHealth] Half-opening for trial: ${s.provider}`);
            }
        }
    }, Math.min(intervalMs, 60_000)); // tick at most once per minute
    return () => stopAutoProbe();
}

export function stopAutoProbe(): void {
    if (probeTimer) {
        clearInterval(probeTimer);
        probeTimer = null;
    }
}

// ─── Test helper (NOT for production use) ───────────────────────────────────
export function _resetForTests(): void {
    status.clear();
    stopAutoProbe();
}
