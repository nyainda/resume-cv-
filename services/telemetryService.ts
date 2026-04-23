/**
 * telemetryService.ts — fire-and-forget client for the purification feedback loop.
 *
 * This file is the only place in the front-end that talks to the telemetry
 * endpoints exposed by `server-pdf.cjs`. Every call:
 *   - Never throws (errors are swallowed and logged to console.debug).
 *   - Never blocks the calling code (returns void / Promise<void>).
 *   - Uses a short timeout via AbortController so a slow/down server can
 *     never hold up CV generation.
 *
 * Endpoint base URL is derived from the same env logic the rest of the app
 * uses — when running on Replit the PDF server is reached on port 3001 of the
 * same host; when running locally it's localhost:3001. Override with
 * `VITE_TELEMETRY_BASE` if you want to point to a remote telemetry server.
 */

const TELEMETRY_BASE: string = (() => {
    const fromEnv = (import.meta as any).env?.VITE_TELEMETRY_BASE;
    if (fromEnv) return String(fromEnv).replace(/\/$/, '');
    if (typeof window === 'undefined') return 'http://localhost:3001';
    const { protocol, hostname, port } = window.location;
    // Local dev — Vite on 5000, PDF + telemetry server on 3001.
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${protocol}//${hostname}:3001`;
    }
    // Replit dev domain — port 3001 is exposed as externalPort 3000 (see .replit).
    // The same-origin URL on a different port works for Replit's preview proxy.
    if (port && port !== '3001') {
        return `${protocol}//${hostname}:3001`;
    }
    return `${protocol}//${hostname}`;
})();

const DEFAULT_TIMEOUT_MS = 4000;

async function fireAndForget(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response | null> {
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(`${TELEMETRY_BASE}${path}`, {
            ...init,
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
        });
        clearTimeout(t);
        return res;
    } catch (err: any) {
        if (err?.name !== 'AbortError') {
            console.debug('[telemetry] request failed', path, err?.message || err);
        }
        return null;
    }
}

// ─── Hashing — stable, browser-only, no crypto polyfill needed ──────────────
/** djb2 hash → hex. Used only for grouping logs, not security. */
export function quickHash(input: string): string {
    let h = 5381;
    const s = String(input || '');
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
        h |= 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface LeakRecord {
    leakType: 'banned_phrase' | 'duplicate_word' | 'pursuing_phrase' | 'tense_mismatch' | 'round_number' | 'repeated_phrase';
    phrase: string;
    occurrences?: number;
    fieldLocation?: string;
    fixedBy?: 'substitution' | 'tense_flip' | 'jitter' | 'pursuing_strip' | 'duplicate_strip' | 'none';
    contextSnippet?: string;
}

export interface GenerationLogPayload {
    cvHash: string;
    userLabel?: string;
    model?: string;
    promptVersion?: string;
    generationMode?: string;
    outputWordCount?: number;
    roundNumberRatio?: number;
    repeatedPhraseCount?: number;
    tenseIssueCount?: number;
    bulletsTenseFlipped?: number;
    metricsJittered?: number;
    substitutionsMade?: number;
    leaks?: LeakRecord[];
}

/** Posts a generation telemetry record. Never throws, never blocks. */
export function logGeneration(payload: GenerationLogPayload): void {
    if (!payload || !payload.cvHash) return;
    void fireAndForget('/api/telemetry/log-generation', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

/** Posts a single user edit. Useful for mining replacement phrases. */
export function logUserEdit(args: { cvHash: string; field: string; originalText: string; editedText: string }): void {
    if (!args || !args.cvHash || !args.field) return;
    if (args.originalText === args.editedText) return;
    void fireAndForget('/api/telemetry/log-edit', {
        method: 'POST',
        body: JSON.stringify(args),
    });
}

// ─── Rules cache (for future dynamic-rules pull) ───────────────────────────
//
// We expose a fetcher so the purifier can — in a later step — start
// preferring the server-supplied rule set over its hardcoded fallback. The
// purifier still works fully offline if this fetch fails.

export interface ServerRules {
    bannedPhrases: Array<{ pattern: string; replacement: string; category: string; severity: number; flags: string }>;
    verbPairs: Array<{ present_form: string; past_form: string }>;
    pursuingPatterns: string[];
    fetchedAt: string;
}

let rulesCache: { rules: ServerRules; ts: number } | null = null;
const RULES_TTL_MS = 5 * 60 * 1000; // 5 min

export async function fetchServerRules(force = false): Promise<ServerRules | null> {
    if (!force && rulesCache && Date.now() - rulesCache.ts < RULES_TTL_MS) {
        return rulesCache.rules;
    }
    const res = await fireAndForget('/api/telemetry/rules', { method: 'GET' });
    if (!res || !res.ok) return rulesCache?.rules || null;
    try {
        const rules = (await res.json()) as ServerRules;
        rulesCache = { rules, ts: Date.now() };
        return rules;
    } catch {
        return rulesCache?.rules || null;
    }
}

// ─── Admin queries ─────────────────────────────────────────────────────────

export async function fetchLeaksSummary(days = 7): Promise<any> {
    const res = await fireAndForget(`/api/telemetry/leaks-summary?days=${days}`, { method: 'GET' }, 8000);
    if (!res || !res.ok) return null;
    try { return await res.json(); } catch { return null; }
}

export async function promoteToBannedList(args: {
    pattern: string;
    replacement?: string;
    category?: string;
    severity?: number;
}): Promise<boolean> {
    const res = await fireAndForget('/api/telemetry/banned-phrases', {
        method: 'POST',
        body: JSON.stringify(args),
    });
    return !!(res && res.ok);
}

export async function disableBannedPhrase(id: number): Promise<boolean> {
    const res = await fireAndForget(`/api/telemetry/banned-phrases/${id}`, { method: 'DELETE' });
    return !!(res && res.ok);
}
