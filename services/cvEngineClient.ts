/**
 * cvEngineClient.ts
 *
 * Frontend client for the cv-engine-worker (Cloudflare Worker backed by D1+KV).
 *
 * Set VITE_CV_ENGINE_URL in `.env.local` (dev) and Vercel env vars (prod), e.g.:
 *   VITE_CV_ENGINE_URL=https://cv-engine-worker.<account>.workers.dev
 *
 * All calls are best-effort: if the worker is unavailable, callers should fall
 * back to the local pipeline. No call here ever throws into the UI path.
 */

// IMPORTANT: access `import.meta.env.X` directly. The `(import.meta as any)`
// cast pattern defeats Vite's static replacement at build time, leaving the
// value undefined in the production bundle — which silently disables the CV
// Engine on Vercel even when the env var is set.
const ENGINE_URL: string = import.meta.env.VITE_CV_ENGINE_URL ?? '';

const DEFAULT_TIMEOUT_MS = 6000;

// ─────────────────────────────────────────────────────────────────────────────
// PER-ENDPOINT CIRCUIT BREAKER — when a worker route returns 502/503/504 or
// times out, it almost always stays unhealthy for the rest of the session.
// Each retry costs 30–60s of wasted time (workerLLM has a 60s default timeout
// and tiered-llm 45s). After the first failure on a given endpoint, the
// circuit opens and all subsequent calls return null immediately.
//
// Keyed by endpoint path so the GET helper, POST helper, workerLLM, and
// workerTieredLLM each break independently.
// ─────────────────────────────────────────────────────────────────────────────
// Per-endpoint dead flags are now thin wrappers around the central
// providerHealth module. We keep the same `markDead` / `isDead` API so call
// sites don't need to change. The central module gives us:
//   - cross-client visibility (banner sees ALL CF failures)
//   - auto-recovery via half-open re-probing every 3 minutes
//   - one place to flip "use CF" on/off site-wide
import { markFailure, markSuccess, isHealthy } from './providerHealth';

// Track which endpoints we've already logged so the per-endpoint message
// only fires once per session even though the central circuit also logs.
const loggedEndpoints = new Set<string>();

function markDead(path: string, reason: string): void {
    if (!loggedEndpoints.has(path)) {
        loggedEndpoints.add(path);
        console.warn(`[cvEngineClient] Marking failure on ${path} (${reason}).`);
    }
    markFailure('cf-worker', `${path}: ${reason}`);
}

function markAlive(path: string): void {
    // Reset the per-endpoint logging flag and let the central module record
    // a successful call. If the circuit was open or half-open, this closes it.
    loggedEndpoints.delete(path);
    markSuccess('cf-worker');
}

function isDead(_path: string): boolean {
    // We track health at the provider level (cf-worker), not per endpoint.
    // If any endpoint is up the whole worker is considered up; the auto-probe
    // will close us when the next call succeeds.
    return !isHealthy('cf-worker');
}

export interface BannedEntry {
    phrase: string;
    replacement: string | null;
    severity?: 'critical' | 'high' | 'medium';
}

export interface VerbEntry {
    verb: string;
    verb_present: string;
    verb_past: string;
    energy_level: 'high' | 'medium' | 'low';
    human_score: number;
}

export interface ValidateIssue {
    bullet?: number;
    issue: string;
    severity: 'critical' | 'high' | 'medium';
    [k: string]: unknown;
}

export interface ValidateResult {
    passed: boolean;
    score: number;
    summary: { critical: number; high: number; medium: number };
    issues: ValidateIssue[];
}

export interface CleanResult {
    cleaned: string;
    changes: string[];
    change_count: number;
}

export function isCVEngineConfigured(): boolean {
    return Boolean(ENGINE_URL && /^https?:\/\//.test(ENGINE_URL));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(t);
    }
}

async function getJSON<T>(path: string, params?: Record<string, string>): Promise<T | null> {
    if (!isCVEngineConfigured()) return null;
    if (isDead(path)) return null;
    const u = new URL(path, ENGINE_URL);
    if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    try {
        const r = await fetchWithTimeout(u.toString());
        if (!r.ok) {
            if (r.status >= 500) markDead(path, `HTTP ${r.status}`);
            return null;
        }
        const data = (await r.json()) as T;
        markAlive(path);
        return data;
    } catch (e: any) {
        markDead(path, e?.name === 'AbortError' ? 'timeout' : 'network');
        if (import.meta.env.DEV) console.warn('[cvEngineClient] GET failed:', path, e);
        return null;
    }
}

async function postJSON<T>(path: string, body: unknown): Promise<T | null> {
    if (!isCVEngineConfigured()) return null;
    if (isDead(path)) return null;
    const u = new URL(path, ENGINE_URL);
    try {
        const r = await fetchWithTimeout(u.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body ?? {}),
        });
        if (!r.ok) {
            if (r.status >= 500) markDead(path, `HTTP ${r.status}`);
            return null;
        }
        const data = (await r.json()) as T;
        markAlive(path);
        return data;
    } catch (e: any) {
        markDead(path, e?.name === 'AbortError' ? 'timeout' : 'network');
        if (import.meta.env.DEV) console.warn('[cvEngineClient] POST failed:', path, e);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchBannedPhrases(): Promise<BannedEntry[] | null> {
    const r = await getJSON<{ banned: BannedEntry[] }>('/api/cv/banned');
    return r?.banned ?? null;
}

export async function fetchVerbs(opts: {
    category: 'technical' | 'management' | 'analysis' | 'communication' | 'financial' | 'creative';
    tense?: 'present' | 'past';
    count?: number;
    exclude?: string[];
}): Promise<VerbEntry[] | null> {
    const params: Record<string, string> = {
        category: opts.category,
        tense: opts.tense ?? 'present',
        count: String(opts.count ?? 20),
    };
    if (opts.exclude?.length) params.exclude = JSON.stringify(opts.exclude);
    const r = await getJSON<{ words: VerbEntry[] }>('/api/cv/words', params);
    return r?.words ?? null;
}

export async function fetchStructures(label: 'short' | 'medium' | 'long' | 'personality') {
    return getJSON<{ structures: any[] }>('/api/cv/structures', { label });
}

export async function fetchRhythm(section?: string) {
    const params = section ? { section } : undefined;
    return getJSON<{ patterns: any[] }>('/api/cv/rhythm', params);
}

export async function cleanText(rawText: string): Promise<CleanResult | null> {
    return postJSON<CleanResult>('/api/cv/clean', { rawText });
}

export async function validateBullets(bullets: string[]): Promise<ValidateResult | null> {
    return postJSON<ValidateResult>('/api/cv/validate', { bullets });
}

export interface ValidateVoiceResult {
    passed: boolean;
    score: number;
    summary: { critical: number; high: number; medium: number; low: number };
    issues: ValidateIssue[];
    rhythm_match_ratio: number;
    avg_word_count: number;
    metric_ratio: number;
    failing_bullets: number[];
}

export async function validateVoice(bullets: string[], brief: CVBrief): Promise<ValidateVoiceResult | null> {
    return postJSON<ValidateVoiceResult>('/api/cv/validate-voice', { bullets, brief });
}

export interface CVBrief {
    years: number;
    seniority: { level: string; bullet_style: string; metric_density: string; summary_tone: string } | null;
    field: { field: string; language_style: string; preferred_verbs: string[]; avoided_verbs: string[]; metric_types: string[] } | null;
    voice: {
        primary: { name: string; tone: string; verbosity_level: number; opener_frequency: number; metric_preference: string } | null;
        secondary: { name: string; tone: string } | null;
    };
    rhythm: { pattern_name: string; sequence: string[]; section: string; bullet_count: number } | null;
    verb_pool: VerbEntry[];
    forbidden_phrases: string[];
    banned_count: number;
    debug?: unknown;
}

export interface BuildBriefInput {
    jd?: string;
    profile?: unknown;
    yearsExperience?: number;
    field?: string;
    bulletCount?: number;
    section?: 'current_role' | 'past_role' | 'internship' | 'summary';
}

const MAX_BRIEF_JD_CHARS = 6000;
const MAX_BRIEF_STRING = 280;
const MAX_BRIEF_ARRAY = 20;
const MAX_BRIEF_OBJECT_KEYS = 24;
const MAX_BRIEF_DEPTH = 4;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function compactForBrief(value: unknown, depth = 0): unknown {
    if (value == null) return value;
    if (typeof value === 'string') {
        return value.replace(/\s+/g, ' ').trim().slice(0, MAX_BRIEF_STRING);
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth >= MAX_BRIEF_DEPTH) return undefined;
    if (Array.isArray(value)) {
        return value.slice(0, MAX_BRIEF_ARRAY)
            .map(v => compactForBrief(v, depth + 1))
            .filter(v => v !== undefined);
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_BRIEF_OBJECT_KEYS);
        const out: Record<string, unknown> = {};
        for (const [k, v] of entries) {
            const compacted = compactForBrief(v, depth + 1);
            if (compacted !== undefined) out[k] = compacted;
        }
        return out;
    }
    return undefined;
}

function looksLikeGoodBrief(brief: CVBrief | null): brief is CVBrief {
    if (!brief) return false;
    if (!Array.isArray(brief.verb_pool) || brief.verb_pool.length < 6) return false;
    if (!Array.isArray(brief.forbidden_phrases)) return false;
    return true;
}

export async function buildBrief(input: BuildBriefInput): Promise<CVBrief | null> {
    if (!isCVEngineConfigured()) return null;
    // Skip immediately when the CF worker circuit is open — avoids 2× ~3s
    // round-trips to a quota-exhausted worker before the caller can fall back.
    if (isDead('/api/cv/brief')) return null;

    const payload: BuildBriefInput = {
        ...input,
        jd: (input.jd || '').replace(/\s+/g, ' ').trim().slice(0, MAX_BRIEF_JD_CHARS),
        profile: compactForBrief(input.profile),
    };

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const u = new URL('/api/cv/brief', ENGINE_URL);
            const r = await fetchWithTimeout(u.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (r.status >= 500) {
                // 5xx on either attempt → mark dead immediately and bail.
                // Retrying a quota-exhausted or overloaded worker just wastes time.
                markDead('/api/cv/brief', `HTTP ${r.status}`);
                return null;
            }
            if (!r.ok) return null;

            const data = (await r.json()) as CVBrief | { brief?: CVBrief };
            const brief = (data as any)?.brief ?? data;
            if (looksLikeGoodBrief(brief as CVBrief)) {
                markAlive('/api/cv/brief');
                return brief as CVBrief;
            }
            return null;
        } catch (e: any) {
            if (attempt === 0) {
                await sleep(300);
                continue;
            }
            markDead('/api/cv/brief', e?.name === 'AbortError' ? 'timeout' : 'network');
            return null;
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache for banned phrases — refreshed on demand, never blocks UI.
// ─────────────────────────────────────────────────────────────────────────────

let bannedCache: BannedEntry[] | null = null;
let bannedCacheAt = 0;
const BANNED_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function getCachedBannedPhrases(): Promise<BannedEntry[] | null> {
    const now = Date.now();
    if (bannedCache && now - bannedCacheAt < BANNED_TTL_MS) return bannedCache;
    const fresh = await fetchBannedPhrases();
    if (fresh && fresh.length) {
        bannedCache = fresh;
        bannedCacheAt = now;
    }
    return bannedCache;
}

/** Pre-warm cache once at app boot — silent on failure. */
export function warmCVEngine(): void {
    if (!isCVEngineConfigured()) return;
    void getCachedBannedPhrases();
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM MODEL PRE-WARM — wakes the actual generation models so the first real
// CV request doesn't pay a cold-start penalty.
//
// Cloudflare Workers AI loads model weights per-region on demand. After a
// model has been idle, the next call can either time out internally or
// return empty text (this is exactly the "tiered call returned no text"
// symptom users see when the workers are "on but sleeping").
//
// The existing /health probe and the diagnostic LLM probe only touch the
// FREE Llama 3.1 8B model (`task: 'general'`). The real CV pipeline routes
// to other models that stay cold. We warm the four key ones (all now FREE):
//   - cvGenerate  → @cf/zai-org/glm-4.7-flash (FREE 131K, main generation)
//   - cvAudit     → @cf/mistralai/mistral-small-3.1-24b-instruct (FREE, humanizer)
//   - cvFallback  → @cf/zai-org/glm-4.7-flash (FREE, section fallback — same model)
//   - humanize    → @hf/nousresearch/hermes-2-pro-mistral-7b (FREE, cover-letter)
//
// May 2026: ALL generation, audit and validation tasks were moved to free
// models. Llama 4 Scout (PAID) is no longer in the hot path. This means
// pre-warming costs exactly $0 in Neurons.
//
// This function fires one tiny prompt against each (maxTokens: 16) so all
// models are hot when the user clicks "Generate CV". Total cost = $0.
//
// STRICT RULES PRESERVED — every call goes through the public tiered-llm
// endpoint, which enforces task-to-model mapping, prompt size caps,
// system prompt caps, token caps, and JSON-format injection server-side.
// We are not bypassing any worker validation; we're just keeping the
// models warm.
//
// Idempotent — only fires once per page load. Fire-and-forget.
// ─────────────────────────────────────────────────────────────────────────────

const PREWARM_TASKS = ['cvGenerate', 'cvAudit', 'humanize'] as const;
const PREWARM_TIMEOUT_MS = 15000;
let prewarmStarted = false;
let prewarmPromise: Promise<PrewarmResult[]> | null = null;

export interface PrewarmResult {
    task: string;
    ok: boolean;
    ms: number;
    model?: string;
    note?: string;
}

async function prewarmOne(task: string): Promise<PrewarmResult> {
    const t0 = Date.now();
    const u = new URL('/api/cv/tiered-llm', ENGINE_URL);
    try {
        const r = await fetchWithTimeout(
            u.toString(),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task,
                    system: 'You are a warm-up probe. Reply with a single short word.',
                    // GLM 4.7 Flash returns empty (worker → 502 llm_empty) on
                    // 1-token prompts like "ok". A short complete-the-sentence
                    // prompt forces every model to produce at least one token.
                    prompt: 'Complete with one word: hello, world, ',
                    temperature: 0,
                    maxTokens: 16,
                }),
            },
            PREWARM_TIMEOUT_MS,
        );
        const ms = Date.now() - t0;
        if (!r.ok) {
            if (r.status === 502) {
                // 502 means the worker itself responded — it is reachable.
                // tiered-llm returns 502 when the AI model produces empty text
                // (error: 'llm_empty') or throws internally (error: 'llm_failed').
                // Neither means the worker is down. Opening the cf-worker circuit
                // here would block ALL Workers AI calls for 3 min even though
                // the worker is healthy — e.g. a cold GLM 4.7 Flash would kill
                // cvAudit and humanize too. Call markAlive so the race between
                // parallel prewarm tasks doesn't leave the circuit open.
                markAlive('/api/cv/prewarm');
            } else if (r.status >= 500) {
                // 503 / 504 / 500 — the worker gateway itself is unhealthy.
                // Open the circuit so callers don't hammer a dead endpoint.
                markDead('/api/cv/tiered-llm', `HTTP ${r.status} (prewarm)`);
            }
            return { task, ok: false, ms, note: `HTTP ${r.status} (model cold or quota-empty)` };
        }
        // HTTP 200 → the worker endpoint is reachable. Close the circuit
        // breaker immediately so any parallel calls that were gated behind
        // isDead('cf-worker') can proceed. We do this BEFORE checking
        // whether the LLM actually produced text, because an empty body just
        // means the model is still loading — the WORKER itself is healthy.
        markAlive('/api/cv/prewarm');
        const data = await r.json().catch(() => null) as { text?: string; model?: string; error?: string } | null;
        const text = (data?.text || '').trim();
        if (!text) {
            return { task, ok: false, ms, model: data?.model, note: data?.error || 'empty text (model likely cold-loading or quota exhausted)' };
        }
        return { task, ok: true, ms, model: data?.model };
    } catch (e) {
        const ms = Date.now() - t0;
        const msg = e instanceof Error ? e.message : String(e);
        // Network failure / timeout → open the circuit so callers don't retry immediately.
        const reason = (e instanceof Error && e.name === 'AbortError') ? 'timeout (prewarm)' : 'network (prewarm)';
        markDead('/api/cv/tiered-llm', reason);
        return { task, ok: false, ms, note: msg.slice(0, 120) };
    }
}

/**
 * Fire tiny warm-up calls against the actual CV-generation models so the
 * first real generation doesn't hit a cold model. Idempotent — safe to call
 * multiple times. Returns the same Promise on subsequent calls during the
 * session (so a manual "wake up" button can `await` the in-flight warm-up).
 */
export function prewarmCVEngineModels(): Promise<PrewarmResult[]> {
    if (!isCVEngineConfigured()) return Promise.resolve([]);
    if (prewarmStarted && prewarmPromise) return prewarmPromise;
    prewarmStarted = true;
    prewarmPromise = Promise.all(PREWARM_TASKS.map(prewarmOne)).then((results) => {
        const okCount = results.filter((r) => r.ok).length;
        const slowest = results.reduce((max, r) => (r.ms > max ? r.ms : max), 0);
        if (typeof console !== 'undefined') {
            const tag = okCount === results.length ? '✓' : okCount === 0 ? '✗' : '~';
            const lines = results.map((r) => {
                const flag = r.ok ? '✓' : '✗';
                const detail = r.ok ? `${r.ms}ms ${r.model || ''}`.trim() : `${r.ms}ms — ${r.note || 'failed'}`;
                return `  ${flag} ${r.task.padEnd(15)} ${detail}`;
            }).join('\n');
            console.info(`[CV Engine] Pre-warm ${tag} ${okCount}/${results.length} models hot (slowest ${slowest}ms)\n${lines}`);
        }
        return results;
    }).catch((e) => {
        // Defence in depth — Promise.all of catches above can't reject, but
        // keep the promise resolution path total so callers never see a throw.
        if (typeof console !== 'undefined') {
            console.warn('[CV Engine] Pre-warm orchestration failed:', e);
        }
        return [];
    });
    return prewarmPromise;
}

/**
 * Manually re-fire the warm-up. Use this from a Settings "Wake workers"
 * button or after detecting a "no text" response so the user can recover
 * without a full page reload.
 */
export function rewarmCVEngineModels(): Promise<PrewarmResult[]> {
    prewarmStarted = false;
    prewarmPromise = null;
    return prewarmCVEngineModels();
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic JD ↔ Skills matching (Workers AI embeddings, stateless).
// Sends keywords + profile text chunks to the worker; worker embeds both
// with @cf/baai/bge-large-en-v1.5 and returns per-keyword best match + status.
// Privacy: nothing is persisted on the worker. Embeddings discarded post-call.
// ─────────────────────────────────────────────────────────────────────────────

export type SemanticMatchStatus = 'matched' | 'partial' | 'missing';

export interface SemanticMatchEntry {
    keyword: string;
    score: number;
    bestMatch: string | null;
    status: SemanticMatchStatus;
}

export interface SemanticMatchResult {
    results: SemanticMatchEntry[];
    model?: string;
    thresholds?: { matched: number; partial: number };
    counts?: { keywords: number; profileTexts: number };
    reason?: string;
}

const SEMANTIC_MATCH_TIMEOUT_MS = 18000;

export async function semanticMatch(
    keywords: string[],
    profileTexts: string[],
): Promise<SemanticMatchResult | null> {
    if (!isCVEngineConfigured()) return null;
    if (!keywords?.length || !profileTexts?.length) return null;
    const u = new URL('/api/cv/semantic-match', ENGINE_URL);
    try {
        const r = await fetchWithTimeout(
            u.toString(),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keywords, profileTexts }),
            },
            SEMANTIC_MATCH_TIMEOUT_MS,
        );
        if (!r.ok) return null;
        return (await r.json()) as SemanticMatchResult;
    } catch (e) {
        if (import.meta.env.DEV) console.warn('[cvEngineClient] semanticMatch failed:', e);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker LLM (Cloudflare Workers AI Llama) — used by the CV validator and
// humanizer audit passes so they don't burn the user's Groq quota.
// Returns the raw text response, or null if the worker is unavailable.
// Caller is responsible for parsing JSON when `json: true` was requested.
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerLLMOptions {
    json?: boolean;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiered LLM — routes tasks to the optimal free/paid Workers AI model.
// Uses /api/cv/tiered-llm which selects model based on task complexity.
// Tasks: bannedCheck, tenseCheck, voiceConsistency, jdParse, seniorityDetect,
//        jdKeywords (paid), voiceScoring (paid), jdDeepAnalysis (paid).
// Always falls back gracefully — returns null if worker unreachable.
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerTieredLLMResult {
    text: string;
    model: string;
    task: string;
    tier: number;
    free: boolean;
}

const WORKER_TIERED_LLM_DEFAULT_TIMEOUT_MS = 45000;

export async function workerTieredLLM(
    task: string,
    prompt: string,
    opts: WorkerLLMOptions & { system?: string } = {},
): Promise<string | null> {
    if (!isCVEngineConfigured()) return null;
    if (!prompt) return null;
    const ENDPOINT = '/api/cv/tiered-llm';
    // Circuit breaker is per-task: a 502 on cvValidate doesn't block cvGenerate/general.
    const deadKey = `${ENDPOINT}:${task}`;
    if (isDead(deadKey)) return null;
    const u = new URL(ENDPOINT, ENGINE_URL);
    try {
        const r = await fetchWithTimeout(
            u.toString(),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task,
                    system: opts.system ?? '',
                    prompt,
                    json: !!opts.json,
                    temperature: opts.temperature ?? 0.3,
                    maxTokens: opts.maxTokens ?? 2048,
                }),
            },
            opts.timeoutMs ?? WORKER_TIERED_LLM_DEFAULT_TIMEOUT_MS,
        );
        if (!r.ok) {
            if (r.status === 502) {
                // Worker responded → it is reachable. 502 from tiered-llm means
                // the AI model returned empty text ('llm_empty') or threw
                // ('llm_failed') — not that the worker itself is down. Don't
                // open the global cf-worker circuit; callers will fall back to
                // Groq for this request while the model warms up.
            } else if (r.status >= 500) {
                markDead(deadKey, `HTTP ${r.status} (task=${task})`);
            }
            return null;
        }
        const data = await r.json() as { text?: string; error?: string };
        if (data.error) return null;
        const text = typeof data?.text === 'string' && data.text.length > 0 ? data.text : null;
        if (text) markAlive(deadKey);
        return text;
    } catch (e: any) {
        markDead(deadKey, e?.name === 'AbortError' ? `timeout (task=${task})` : `network (task=${task})`);
        if (import.meta.env.DEV) console.warn('[cvEngineClient] workerTieredLLM failed:', task, e);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Race LLM — fire 2-3 tiered tasks in parallel server-side and return the
// first one that completes successfully. Used when latency matters more than
// predictability (e.g. main CV generation: race Llama 4 Scout vs GLM 4.7
// Flash 131K so the user gets whichever cluster is warm right now).
//
// COST: Workers AI cannot cancel in-flight calls, so all candidates run to
// completion server-side and Cloudflare bills any paid models in the race
// regardless of which one wins. Caller should only race pairs where at least
// one candidate is FREE, OR where the latency win justifies the duplicate
// spend.
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerRaceLLMResult {
    text: string;
    task: string;
    model: string;
    tier: number;
    free: boolean;
    raceMs: number;
}

const WORKER_RACE_LLM_DEFAULT_TIMEOUT_MS = 60000;

export async function workerRaceLLM(
    tasks: string[],
    prompt: string,
    opts: WorkerLLMOptions & { system?: string } = {},
): Promise<WorkerRaceLLMResult | null> {
    if (!isCVEngineConfigured()) return null;
    if (!prompt) return null;
    if (!Array.isArray(tasks) || tasks.length < 2) return null;
    const ENDPOINT = '/api/cv/race-llm';
    if (isDead(ENDPOINT)) return null;
    const u = new URL(ENDPOINT, ENGINE_URL);
    try {
        const r = await fetchWithTimeout(
            u.toString(),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tasks,
                    system: opts.system ?? '',
                    prompt,
                    json: !!opts.json,
                    temperature: opts.temperature ?? 0.3,
                    maxTokens: opts.maxTokens ?? 2048,
                }),
            },
            opts.timeoutMs ?? WORKER_RACE_LLM_DEFAULT_TIMEOUT_MS,
        );
        if (!r.ok) {
            if (r.status === 502) {
                // Worker responded — reachable. 502 = race candidates all failed
                // (model-level), not a worker outage. Don't open the circuit.
            } else if (r.status >= 500) {
                markDead(ENDPOINT, `HTTP ${r.status} (tasks=${tasks.join(',')})`);
            }
            return null;
        }
        const data = await r.json() as {
            text?: string; task?: string; model?: string; tier?: number; free?: boolean; raceMs?: number; error?: string;
        };
        if (data.error || typeof data?.text !== 'string' || data.text.length === 0) return null;
        return {
            text: data.text,
            task: String(data.task || ''),
            model: String(data.model || ''),
            tier: Number(data.tier ?? 0),
            free: Boolean(data.free),
            raceMs: Number(data.raceMs ?? 0),
        };
    } catch (e: any) {
        markDead(ENDPOINT, e?.name === 'AbortError' ? `timeout (tasks=${tasks.join(',')})` : `network (tasks=${tasks.join(',')})`);
        if (import.meta.env.DEV) console.warn('[cvEngineClient] workerRaceLLM failed:', tasks, e);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section-parallel CV generation — fan out N section-specific prompts to
// per-section models inside a single Worker request. Each section runs
// concurrently server-side; the worker picks a right-sized model per task
// and auto-retries any failed section via a free fallback model. Returns
// once every section either succeeds or exhausts its fallback.
//
// Caller pattern: build a shared `preamble` (profile + JD + market context),
// then a list of sections each with `name`, `task` (TIERED_MODEL_MAP key),
// and `instruction` (section-specific tail). Results come back keyed by name.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParallelSectionRequest {
    name: string;
    task: string;
    instruction: string;
    maxTokens?: number;
    temperature?: number;
    json?: boolean;
}

export interface ParallelSectionResult {
    text: string;
    model: string;
    task: string;
    ms: number;
    fellBack: boolean;
    error?: string;
}

export interface WorkerParallelSectionsResult {
    ok: true;
    totalMs: number;
    results: Record<string, ParallelSectionResult>;
    errors: Array<{ section: string; message: string }>;
}

const WORKER_PARALLEL_SECTIONS_DEFAULT_TIMEOUT_MS = 90000;

export async function workerParallelSections(
    sections: ParallelSectionRequest[],
    opts: {
        system?: string;
        preamble?: string;
        fallbackTask?: string;
        timeoutMs?: number;
        /** If the preamble contains {{PROFILE}}, the worker will substitute
         *  the cached compact profile JSON fetched from D1 by this hash. */
        profileHash?: string | null;
    } = {},
): Promise<WorkerParallelSectionsResult | null> {
    if (!isCVEngineConfigured()) return null;
    if (!Array.isArray(sections) || sections.length === 0) return null;
    const ENDPOINT = '/api/cv/parallel-sections';
    if (isDead(ENDPOINT)) return null;
    const u = new URL(ENDPOINT, ENGINE_URL);
    try {
        const bodyObj: Record<string, unknown> = {
            system: opts.system ?? '',
            preamble: opts.preamble ?? '',
            fallbackTask: opts.fallbackTask ?? 'cvFallback',
            sections,
        };
        if (opts.profileHash) bodyObj.profile_hash = opts.profileHash;
        const r = await fetchWithTimeout(
            u.toString(),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyObj),
            },
            opts.timeoutMs ?? WORKER_PARALLEL_SECTIONS_DEFAULT_TIMEOUT_MS,
        );
        if (!r.ok) {
            if (r.status === 502) {
                // Worker responded — reachable. 502 = all parallel sections
                // failed at model level ('all_sections_failed'), not a worker
                // outage. Don't open the circuit; fall back to Groq per-section.
            } else if (r.status >= 500) {
                markDead(ENDPOINT, `HTTP ${r.status}`);
            }
            return null;
        }
        const data = await r.json() as WorkerParallelSectionsResult & { error?: string };
        if (data.error || !data.results) return null;
        return data;
    } catch (e: any) {
        markDead(ENDPOINT, e?.name === 'AbortError' ? 'timeout' : 'network');
        if (import.meta.env.DEV) console.warn('[cvEngineClient] workerParallelSections failed:', e);
        return null;
    }
}

const WORKER_LLM_DEFAULT_TIMEOUT_MS = 60000;

export async function workerLLM(
    system: string,
    prompt: string,
    opts: WorkerLLMOptions = {},
): Promise<string | null> {
    if (!isCVEngineConfigured()) return null;
    if (!prompt) return null;
    const ENDPOINT = '/api/cv/llm';
    if (isDead(ENDPOINT)) return null;
    const u = new URL(ENDPOINT, ENGINE_URL);
    try {
        const r = await fetchWithTimeout(
            u.toString(),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system,
                    prompt,
                    json: !!opts.json,
                    temperature: opts.temperature ?? 0.2,
                    maxTokens: opts.maxTokens ?? 4096,
                }),
            },
            opts.timeoutMs ?? WORKER_LLM_DEFAULT_TIMEOUT_MS,
        );
        if (!r.ok) {
            if (r.status >= 500) markDead(ENDPOINT, `HTTP ${r.status}`);
            return null;
        }
        const data = await r.json() as { text?: string };
        const text = typeof data?.text === 'string' && data.text.length > 0 ? data.text : null;
        if (text) markAlive(ENDPOINT);
        return text;
    } catch (e: any) {
        markDead(ENDPOINT, e?.name === 'AbortError' ? 'timeout' : 'network');
        if (import.meta.env.DEV) console.warn('[cvEngineClient] workerLLM failed:', e);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Vision Extract — Cloudflare Workers AI Llama 3.2 11B Vision.
// Used for image CV uploads so they don't burn the user's Gemini quota.
// PDFs are NOT supported (caller must fall back to Gemini for application/pdf).
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerVisionOptions {
    maxTokens?: number;
    timeoutMs?: number;
}

const WORKER_VISION_DEFAULT_TIMEOUT_MS = 60000;

export async function workerVisionExtract(
    base64Image: string,
    mimeType: string,
    prompt: string,
    opts: WorkerVisionOptions = {},
): Promise<string | null> {
    if (!isCVEngineConfigured()) return null;
    if (!base64Image || !prompt) return null;
    if (mimeType && !/^image\//i.test(mimeType)) return null; // PDFs not supported
    const u = new URL('/api/cv/vision-extract', ENGINE_URL);
    try {
        const r = await fetchWithTimeout(
            u.toString(),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    mimeType,
                    prompt,
                    maxTokens: opts.maxTokens ?? 4096,
                }),
            },
            opts.timeoutMs ?? WORKER_VISION_DEFAULT_TIMEOUT_MS,
        );
        if (!r.ok) return null;
        const data = await r.json() as { text?: string };
        return typeof data?.text === 'string' && data.text.length > 0 ? data.text : null;
    } catch (e) {
        if (import.meta.env.DEV) console.warn('[cvEngineClient] workerVisionExtract failed:', e);
        return null;
    }
}

/**
 * Chunk a flat CV text blob into atomic phrases suitable for embedding.
 * Splits on lines, bullets, and sentence boundaries; dedups; caps length.
 */
export function chunkProfileText(cvText: string, maxChunks = 200): string[] {
    if (!cvText) return [];
    const lines = cvText
        .split(/\r?\n|•|●|·|\u2022|\u25E6|\u2023/g)
        .flatMap(line => line.split(/(?<=[.!?])\s+(?=[A-Z])/g))
        .map(s => s.replace(/\s+/g, ' ').trim())
        .filter(s => s.length >= 3 && s.length <= 600);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of lines) {
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(line);
        if (out.length >= maxChunks) break;
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin client — token kept in sessionStorage, never logged.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_TOKEN_KEY = 'cv_engine_admin_token';

export function getAdminToken(): string {
    try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; }
}
export function setAdminToken(t: string): void {
    try {
        if (t) sessionStorage.setItem(ADMIN_TOKEN_KEY, t);
        else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch { /* ignore */ }
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    if (!isCVEngineConfigured()) return null;
    const token = getAdminToken();
    if (!token) return null;
    const u = new URL(path, ENGINE_URL);
    try {
        const r = await fetchWithTimeout(u.toString(), {
            ...init,
            headers: { ...(init.headers || {}), 'X-Admin-Token': token },
        });
        if (!r.ok) return null;
        return (await r.json()) as T;
    } catch (e) {
        if (import.meta.env.DEV) console.warn('[adminFetch]', path, e);
        return null;
    }
}

export interface AdminStats {
    ok: boolean;
    counts: Record<string, number>;
    last_sync: number | null;
}

export interface BulkAddResult {
    ok: boolean;
    inserted: number;
    skipped: number;
    failed: number;
    errors: string[];
    synced: boolean;
}

export interface SyncResult {
    ok: boolean;
    written: Array<[string, number]>;
    total_keys: number;
    synced_at: number;
}

export async function fetchAdminStats(): Promise<AdminStats | null> {
    return adminFetch<AdminStats>('/api/cv/admin/stats');
}

export async function bulkAddRows(table: string, rows: any[]): Promise<BulkAddResult | null> {
    return adminFetch<BulkAddResult>('/api/cv/admin/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, rows }),
    });
}

export async function triggerSync(): Promise<SyncResult | null> {
    return adminFetch<SyncResult>('/api/cv/sync', { method: 'POST' });
}

export interface AdminListResult {
    ok: boolean;
    table: string;
    total: number;
    limit: number;
    offset: number;
    rows: Array<Record<string, any>>;
}

export async function listAdminRows(
    table: string,
    opts: { limit?: number; offset?: number; q?: string } = {},
): Promise<AdminListResult | null> {
    const params = new URLSearchParams({ table });
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.offset) params.set('offset', String(opts.offset));
    if (opts.q) params.set('q', opts.q);
    return adminFetch<AdminListResult>(`/api/cv/admin/list?${params.toString()}`);
}

export interface BulkUpdateResult {
    ok: boolean;
    updated: number;
    missing: number;
    failed: number;
    errors: string[];
    synced: boolean;
}

export async function bulkUpdateRows(
    table: string,
    updates: Array<{ id: string } & Record<string, any>>,
): Promise<BulkUpdateResult | null> {
    return adminFetch<BulkUpdateResult>('/api/cv/admin/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, updates }),
    });
}

export interface DeleteResult {
    ok: boolean;
    deleted: number;
    failed: number;
    errors: string[];
    synced: boolean;
}

export interface VoiceTestResult {
    ok: boolean;
    bullets: string[];
    brief: {
        voice: { primary: any; secondary: any };
        field: any;
        seniority: any;
        rhythm: any;
        forbidden_phrases: string[];
        verb_pool_sample: any[];
        debug: any;
    };
    validation: ValidateVoiceResult;
}

export async function testVoice(input: {
    bullets: string[];
    voice_name?: string;
    field?: string;
    yearsExperience?: number;
    section?: 'current_role' | 'past_role' | 'internship' | 'summary';
    jd?: string;
}): Promise<VoiceTestResult | null> {
    return adminFetch<VoiceTestResult>('/api/cv/admin/voice-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
}

export interface AiAuditFinding {
    phrase: string;
    severity: 'critical' | 'high' | 'medium';
    reason: string;
    replacement: string;
}

export interface AiAuditResult {
    ok: boolean;
    text_length: number;
    already_banned_count: number;
    new_findings: number;
    findings: AiAuditFinding[];
    model: string;
    raw_response: string;
}

export interface LeakCandidate {
    id: string;
    phrase: string;
    count: number;
    sample: string | null;
    first_seen: string;
    last_seen: string;
    status: 'pending' | 'promoted' | 'rejected';
    decided_at: string | null;
}

export interface LeakCandidatesList {
    ok: boolean;
    rows: LeakCandidate[];
    total: number;
    limit: number;
    offset: number;
    status: string;
    threshold: number;
}

export interface AdminTokenRow {
    id: string;
    label: string;
    role: 'viewer' | 'editor' | 'admin';
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
}

export async function listAdminTokens(): Promise<{ ok: boolean; rows: AdminTokenRow[] } | null> {
    return adminFetch('/api/cv/admin/tokens');
}

export async function createAdminToken(label: string, role: 'viewer' | 'editor' | 'admin'): Promise<{ ok: boolean; id: string; token: string; warning: string } | null> {
    return adminFetch('/api/cv/admin/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, role }),
    });
}

export async function revokeAdminTokens(ids: string[]): Promise<{ ok: boolean; revoked: number } | null> {
    return adminFetch('/api/cv/admin/tokens/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
    });
}

export async function reportLeaks(phrases: string[], sample = ''): Promise<{ ok: boolean; recorded: number } | null> {
    if (!phrases.length) return null;
    return postJSON('/api/cv/leak-report', { phrases, sample });
}

export async function listLeakCandidates(status: 'pending' | 'promoted' | 'rejected' = 'pending', limit = 100, offset = 0): Promise<LeakCandidatesList | null> {
    const qs = new URLSearchParams({ status, limit: String(limit), offset: String(offset) });
    return adminFetch<LeakCandidatesList>(`/api/cv/admin/leak-candidates?${qs}`);
}

export async function decideLeakCandidates(ids: string[], decision: 'promote' | 'reject', severity: 'critical' | 'high' | 'medium' = 'medium'): Promise<{ ok: boolean; promoted?: number; rejected?: number; skipped?: number } | null> {
    return adminFetch('/api/cv/admin/leak-candidates/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, decision, severity }),
    });
}

export async function aiAudit(text: string): Promise<AiAuditResult | null> {
    return adminFetch<AiAuditResult>('/api/cv/admin/ai-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
}

export async function deleteAdminRows(table: string, ids: string[]): Promise<DeleteResult | null> {
    return adminFetch<DeleteResult>('/api/cv/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, ids }),
    });
}
