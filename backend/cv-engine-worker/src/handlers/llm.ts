/// <reference types="@cloudflare/workers-types" />
import { Env } from '../types';
import { json, safeJson, clamp } from '../utils';
import {
    _CV_SYSTEM_PROFESSIONAL,
    _CV_SYSTEM_HUMANIZER,
    _CV_SYSTEM_PARSER,
    _CV_SYSTEM_VALIDATOR,
    _CV_SYSTEM_AUDIT,
} from './purify';
import { getSessionUserId } from './cache';
import { verifySession } from './auth';

// ─── Session-based plan resolution ───────────────────────────────────────────
// Derive paidUpgrade server-side from the caller's D1 session — never trust
// a client-supplied flag for this, as anyone could pass paidUpgrade:true.
// Falls back gracefully when there is no session or a D1 error.

interface SessionContext {
    isPremium: boolean;
    userId: number | null;
}

async function resolveSessionContext(request: Request, env: Env): Promise<SessionContext> {
    try {
        // Mirror auth.ts sessionTokenFromRequest: cookie first, then Bearer header.
        const cookieHeader = request.headers.get('Cookie') ?? '';
        const cookieMatch  = cookieHeader.match(/(?:^|;\s*)procv_session=([^;]+)/);
        const token = cookieMatch
            ? cookieMatch[1].trim()
            : (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
        if (!token) return { isPremium: false, userId: null };
        const session = await verifySession(token, env);
        return {
            isPremium: session?.plan === 'premium',
            userId: session?.userId ?? null,
        };
    } catch {
        return { isPremium: false, userId: null }; // fail-open: D1 error → treat as free
    }
}

// Thin wrapper for handlers that only need the boolean (handleRaceLLM etc.)
async function resolveIsPremium(request: Request, env: Env): Promise<boolean> {
    return (await resolveSessionContext(request, env)).isPremium;
}

// Daily premium LLM cap — prevents a $19/mo subscriber from hammering 70B/DeepSeek
// 24/7 at a loss. 300 tiered-llm calls/day ≈ 30 full CV generations (each uses ~10
// calls). No real job-seeker hits this; abuse does.
const DAILY_PREMIUM_LLM_CAP = 300;

async function checkAndIncrementDailyCap(
    userId: number,
    env: Env,
): Promise<boolean> {
    // Returns true if the request is allowed, false if the daily cap is exceeded.
    try {
        const today   = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
        const capKey  = `daily:llm:${userId}:${today}`;
        const raw     = await env.CV_KV.get(capKey);
        const count   = parseInt(raw ?? '0', 10);
        if (count >= DAILY_PREMIUM_LLM_CAP) return false;
        // Increment asynchronously — don't block the response on a write.
        // TTL of 2 days ensures the key expires naturally without manual cleanup.
        env.CV_KV.put(capKey, String(count + 1), { expirationTtl: 172800 }).catch(() => {});
        return true;
    } catch {
        return true; // KV unavailable → fail-open, never block generation
    }
}

// ─── BYOK model catalogs + fallback chains ───────────────────────────────────
// Providers routinely retire or rename models (e.g. Anthropic sunsetting a
// Claude snapshot, Google bumping a Gemini alias). Both the catalog (surfaced
// to the Settings UI so users can pick a specific model) and the fallback
// chain (tried automatically server-side when the requested model 404s or is
// otherwise rejected) live here so a provider's model shuffle never produces
// a hard failure for the user — worst case we silently step down to the next
// entry in the chain and tell the frontend which model actually served the
// request via `fallback: true`.
export const CLAUDE_MODEL_CATALOG = [
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (best quality)' },
    { id: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5 (fast, default)' },
    { id: 'claude-opus-4-1-20250805',   label: 'Claude Opus 4.1 (most capable, slowest)' },
    { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet (legacy)' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (legacy)' },
];

export const GEMINI_MODEL_CATALOG = [
    { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash (default)' },
    { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro (best quality)' },
    { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash (legacy, fast)' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite (cheapest)' },
];

// Ordered same-capability alternates tried automatically if the requested (or
// default) model returns 404 / "not found" / "deprecated" / empty response.
const CLAUDE_FALLBACK_CHAIN: string[] = [
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-5-20250929',
    'claude-3-5-sonnet-20241022',
    'claude-3-haiku-20240307',
];

const GEMINI_FALLBACK_CHAIN: string[] = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
];

/** True when a provider error looks like "this model id no longer exists" rather than a transient/auth/quota failure. */
function isModelNotFoundError(status: number, message: string): boolean {
    const m = message.toLowerCase();
    if (status === 404) return true;
    return /model.*(not found|not_found|does not exist|unknown|deprecated|retired|no longer|invalid model)/i.test(m)
        || /(not found|not_found|does not exist|unknown|deprecated|retired|no longer|invalid model).*model/i.test(m);
}

// ─── Legacy LLM proxy (Llama 70B) ────────────────────────────────────────────
const WORKER_LLM_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const WORKER_LLM_MAX_PROMPT_CHARS = 60000;
const WORKER_LLM_MAX_SYSTEM_CHARS = 4000;
const WORKER_LLM_DEFAULT_MAX_TOKENS = 4096;
const WORKER_LLM_HARD_MAX_TOKENS = 12000;

export async function handleLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const system = typeof body?.system === 'string' ? body.system.slice(0, WORKER_LLM_MAX_SYSTEM_CHARS) : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, WORKER_LLM_MAX_PROMPT_CHARS) : '';
    if (!prompt) return json({ error: 'missing_prompt' }, request, env, 400);

    const wantsJson = body?.json === true;
    const temperature = clamp(Number(body?.temperature ?? 0.2), 0, 1);
    const maxTokens = clamp(
        Number(body?.maxTokens ?? WORKER_LLM_DEFAULT_MAX_TOKENS),
        64,
        WORKER_LLM_HARD_MAX_TOKENS,
    );

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    try {
        const payload: Record<string, unknown> = { messages, temperature, max_tokens: maxTokens };
        if (wantsJson) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(WORKER_LLM_MODEL as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (!text) return json({ error: 'llm_empty', model: WORKER_LLM_MODEL }, request, env, 502);
        return json({ text, model: WORKER_LLM_MODEL }, request, env);
    } catch (e: any) {
        return json({ error: 'llm_failed', message: String(e?.message || e) }, request, env, 502);
    }
}

// ─── Vision extract ───────────────────────────────────────────────────────────
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const VISION_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const VISION_MAX_PROMPT_CHARS = 4000;
const VISION_DEFAULT_MAX_TOKENS = 4096;
const VISION_HARD_MAX_TOKENS = 8192;

export async function handleVisionExtract(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const base64 = typeof body?.image === 'string' ? body.image : '';
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, VISION_MAX_PROMPT_CHARS) : '';

    if (!base64 || !prompt) return json({ error: 'missing_image_or_prompt' }, request, env, 400);
    if (mimeType && !/^image\//i.test(mimeType)) {
        return json({ error: 'unsupported_mime', mimeType, hint: 'Llama Vision accepts images only. PDFs must be rasterized first or routed to Gemini.' }, request, env, 415);
    }

    let bytes: Uint8Array;
    try {
        const clean = base64.replace(/^data:[^;]+;base64,/, '');
        const bin = atob(clean);
        if (bin.length > VISION_MAX_IMAGE_BYTES) {
            return json({ error: 'image_too_large', maxBytes: VISION_MAX_IMAGE_BYTES }, request, env, 413);
        }
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
        return json({ error: 'invalid_base64' }, request, env, 400);
    }

    const maxTokens = clamp(Number(body?.maxTokens ?? VISION_DEFAULT_MAX_TOKENS), 64, VISION_HARD_MAX_TOKENS);

    try {
        const res: any = await env.AI.run(VISION_MODEL as any, {
            prompt,
            image: Array.from(bytes),
            max_tokens: maxTokens,
        } as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.description === 'string') text = res.description;
        else if (typeof res?.result?.response === 'string') text = res.result.response;

        if (!text) return json({ error: 'vision_empty', model: VISION_MODEL }, request, env, 502);
        return json({ text, model: VISION_MODEL }, request, env);
    } catch (e: any) {
        return json({ error: 'vision_failed', message: String(e?.message || e) }, request, env, 502);
    }
}

// ─── Tiered LLM ───────────────────────────────────────────────────────────────

export const TIERED_MODEL_MAP: Record<string, { model: string; tier: number; free: boolean; description: string }> = {
    jdDeepAnalysis:       { model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', tier: 1, free: false, description: 'Deep JD intelligence + gap analysis — DeepSeek-R1 32B' },
    gapAnalysis:          { model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', tier: 1, free: false, description: 'Candidate ↔ JD gap analysis — DeepSeek-R1 32B' },
    corpusConfidence:     { model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', tier: 1, free: false, description: 'Corpus candidate confidence scoring — DeepSeek-R1 32B' },
    voiceScoring:         { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',     tier: 1, free: false, description: 'Voice scoring vs JD + field + seniority — Llama 70B' },
    jdKeywords:           { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',     tier: 1, free: false, description: 'JD keyword extraction, tier 1/2/3 classification — Llama 70B' },
    cvGenerate:           { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Main CV JSON generation — Mistral Small 3.1 24B (FREE)' },
    cvGenerateLong:       { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Long-context CV generation — Mistral Small 3.1 24B (FREE)' },
    cvExperience:         { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'CV experience bullets — Mistral Small 3.1 24B (FREE)' },
    cvProjects:           { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'CV projects section — Mistral Small 3.1 24B (FREE)' },
    cvAudit:              { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Post-generation humanizer audit — Mistral Small 3.1 24B (FREE)' },
    cvValidate:           { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 2, free: true,  description: 'Strict CV quality validator — Llama 3.2 3B (FREE)' },
    parser:               { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Word/GitHub profile JSON parser — Mistral Small 3.1 24B (FREE)' },
    cvSummary:            { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'CV professional summary — Mistral Small 3.1 24B (FREE)' },
    cvSkills:             { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 2, free: true,  description: 'CV skills list — IBM Granite 4.0 Micro (FREE)' },
    cvEducation:          { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 2, free: true,  description: 'CV education section — IBM Granite 4.0 Micro (FREE)' },
    cvFallback:           { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Section-parallel fallback — Mistral Small 3.1 24B (FREE)' },
    rhythmSelection:      { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Rhythm pattern selection — Mistral Small 3.1 24B (FREE)' },
    seniorityDetect:      { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 2, free: true,  description: 'Seniority + field detection from JD — Llama 3.2 3B (FREE)' },
    multilingualGenerate: { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Multilingual CV text generation — Mistral Small 3.1 24B (FREE)' },
    bannedCheck:          { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Banned phrase check — Llama 3.2 3B (FREE)' },
    tenseCheck:           { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Tense consistency enforcement — Llama 3.2 3B (FREE)' },
    voiceConsistency:     { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Voice consistency per bullet — Llama 3.2 3B (FREE)' },
    verbRepeatCheck:      { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 3, free: true,  description: 'Verb repetition check — Granite 4.0 Micro (FREE)' },
    rhythmCheck:          { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 3, free: true,  description: 'Rhythm compliance check — Granite 4.0 Micro (FREE)' },
    candidateDedup:       { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Dedup check for corpus candidates — Llama 3.2 3B (FREE)' },
    corpusCrawl:          { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 3, free: true,  description: 'Source page crawling + extraction — Mistral Small 3.1 24B (FREE)' },
    jdParse:              { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 3, free: true,  description: 'JD keyword + company + title extraction — Granite 4.0 Micro (FREE)' },
    humanize:             { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 3, free: true,  description: 'Plain-text humanizer — Mistral Small 3.1 24B (FREE)' },
    coverLetter:          { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 3, free: true,  description: 'Cover letter generation — Mistral Small 3.1 24B (FREE)' },
    coaching:             { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 3, free: true,  description: 'Career coaching (negotiation, interview, pivot) — Mistral Small 3.1 24B (FREE)' },
    general:              { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'General purpose fallback — Llama 3.2 3B (FREE)' },
};

const PAID_UPGRADE_MAP: Record<string, string> = {
    cvGenerate:     '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvGenerateLong: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvExperience:   '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvProjects:     '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvSummary:      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
};

// ── Model deprecation fallback chains ────────────────────────────────────────
// When a model is retired or returns empty (HTTP 200 + no text, or throws),
// the worker automatically tries the next model in the chain — zero redeploy.
// Rules: first entry should match TIERED_MODEL_MAP; subsequent entries are
// same-capability alternatives ordered by preference.
// KV override (see resolveModel below) takes precedence over everything.
const MODEL_FALLBACK_CHAIN: Record<string, string[]> = {
    // Tier 2 — Mistral Small 3.1 24B → fallback to Llama 3.1 8B → Llama 3.2 3B
    cvGenerate:           ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.2-3b-instruct'],
    cvGenerateLong:       ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.2-3b-instruct'],
    cvExperience:         ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.2-3b-instruct'],
    cvProjects:           ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.2-3b-instruct'],
    cvAudit:              ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.2-3b-instruct'],
    cvSummary:            ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.2-3b-instruct'],
    parser:               ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct'],
    humanize:             ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct'],
    coverLetter:          ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct'],
    coaching:             ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct'],
    multilingualGenerate: ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct'],
    rhythmSelection:      ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct'],
    corpusCrawl:          ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct'],
    cvFallback:           ['@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-3.1-8b-instruct'],
    // IBM Granite tasks → fallback to Llama 3.2 3B
    cvSkills:             ['@cf/ibm-granite/granite-4.0-h-micro',          '@cf/meta/llama-3.2-3b-instruct'],
    cvEducation:          ['@cf/ibm-granite/granite-4.0-h-micro',          '@cf/meta/llama-3.2-3b-instruct'],
    verbRepeatCheck:      ['@cf/ibm-granite/granite-4.0-h-micro',          '@cf/meta/llama-3.2-3b-instruct'],
    rhythmCheck:          ['@cf/ibm-granite/granite-4.0-h-micro',          '@cf/meta/llama-3.2-3b-instruct'],
    jdParse:              ['@cf/ibm-granite/granite-4.0-h-micro',          '@cf/meta/llama-3.2-3b-instruct'],
    // Llama 3.3 70B (tier 1) → fallback to Mistral Small
    voiceScoring:         ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/mistralai/mistral-small-3.1-24b-instruct'],
    jdKeywords:           ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/mistralai/mistral-small-3.1-24b-instruct'],
    // DeepSeek R1 (tier 1) → fallback to Llama 70B → Mistral
    jdDeepAnalysis:       ['@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/mistralai/mistral-small-3.1-24b-instruct'],
    gapAnalysis:          ['@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/mistralai/mistral-small-3.1-24b-instruct'],
    corpusConfidence:     ['@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/mistralai/mistral-small-3.1-24b-instruct'],
};

/**
 * Resolve the model to use for a task, applying (in priority order):
 *   1. KV override key  `model:override:{taskKey}`  — set via admin to hotfix a retired model
 *   2. paidUpgrade model from PAID_UPGRADE_MAP
 *   3. Primary model from TIERED_MODEL_MAP
 *
 * Returns the resolved primary model AND the remaining fallback chain for
 * that task (excluding the resolved primary so we don't retry it first).
 */
// ── Model override mem-cache ─────────────────────────────────────────────────
// resolveModel is called on every LLM request (can be 5–8 times per generation).
// Caching the KV override for 5 minutes per task key keeps the hot path free
// while still picking up a manual hotfix within 5 minutes of it being written.
const _modelOverrideCache = new Map<string, { value: string | null; expiresAt: number }>();
const MODEL_OVERRIDE_TTL_MS = 5 * 60 * 1000;

async function resolveModel(
    taskKey: string,
    paidUpgrade: boolean,
    env: Env,
): Promise<{ primary: string; chain: string[] }> {
    // Check KV for a live override (allows hotfix without redeploy).
    // Use a short module-level cache so we don't hit KV on every LLM call.
    let kvOverride: string | null = null;
    try {
        const now = Date.now();
        const cached = _modelOverrideCache.get(taskKey);
        if (cached && now < cached.expiresAt) {
            kvOverride = cached.value;
        } else {
            kvOverride = await env.CV_KV.get(`model:override:${taskKey}`);
            _modelOverrideCache.set(taskKey, { value: kvOverride, expiresAt: now + MODEL_OVERRIDE_TTL_MS });
        }
    } catch { /* KV miss or unavailable — continue */ }

    if (kvOverride?.trim()) {
        // KV override wins — use it as the only model (admin has explicit control)
        return { primary: kvOverride.trim(), chain: [] };
    }

    const baseMapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
    const upgradedModel = paidUpgrade ? PAID_UPGRADE_MAP[taskKey] : undefined;
    const primary = upgradedModel ?? baseMapping.model;

    // Build fallback chain: skip the primary model (already being tried)
    const rawChain = MODEL_FALLBACK_CHAIN[taskKey] ?? [];
    // For paid upgrade, the upgrade model is primary so fallback through the base chain
    const chain = rawChain.filter(m => m !== primary);

    return { primary, chain };
}

/**
 * Run a single non-streaming AI.run call, returning the text or throwing.
 * Extracted so the retry loop in handleTieredLLM can call it per model.
 */
async function runAIModel(
    model: string,
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    temperature: number,
    maxTokens: number,
    wantsJson: boolean,
    env: Env,
): Promise<string> {
    const payload: Record<string, unknown> = { messages, temperature, max_tokens: maxTokens };
    const supports70bJsonFormat = model.includes('llama-3.3-70b') || model.includes('llama-3.1-70b');
    if (wantsJson && supports70bJsonFormat) payload.response_format = { type: 'json_object' };

    const res: any = await env.AI.run(model as any, payload as any);

    let text = '';
    if (typeof res === 'string') text = res;
    else if (typeof res?.response === 'string') text = res.response;
    else if (typeof res?.result?.response === 'string') text = res.result.response;
    else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

    if (text) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (!text) throw new Error(`llm_empty:${model}`);
    return text;
}

export const TIERED_LLM_MAX_PROMPT_CHARS  = 100000;
export const TIERED_LLM_MAX_SYSTEM_CHARS  = 6000;
export const TIERED_LLM_DEFAULT_MAX_TOKENS = 2048;
export const TIERED_LLM_HARD_MAX_TOKENS   = 8192;

export async function handleTieredLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);

    const taskKey = typeof body?.task === 'string' ? body.task.trim() : 'general';

    // Server-side plan check — ignores any client-supplied paidUpgrade flag.
    const { isPremium: paidUpgrade, userId } = await resolveSessionContext(request, env);

    // Daily abuse cap for premium users. 300 calls/day ≈ 30 full generations.
    // Fails open so a KV outage never blocks a paying user.
    if (paidUpgrade && userId !== null) {
        const allowed = await checkAndIncrementDailyCap(userId, env);
        if (!allowed) {
            return json({
                error: 'daily_limit_reached',
                limit: DAILY_PREMIUM_LLM_CAP,
                message: 'Daily AI generation limit reached. Resets at midnight UTC.',
            }, request, env, 429);
        }
    }
    const _internalSystemMap: Record<string, string> = {
        cvGenerate:       _CV_SYSTEM_PROFESSIONAL,
        cvGenerateLong:   _CV_SYSTEM_PROFESSIONAL,
        cvExperience:     _CV_SYSTEM_PROFESSIONAL,
        cvProjects:       _CV_SYSTEM_PROFESSIONAL,
        cvAudit:          _CV_SYSTEM_AUDIT,
        cvValidate:       _CV_SYSTEM_VALIDATOR,
        humanize:         _CV_SYSTEM_HUMANIZER,
        coverLetter:      _CV_SYSTEM_PROFESSIONAL,
        voiceConsistency: _CV_SYSTEM_HUMANIZER,
        jdParse:          _CV_SYSTEM_PARSER,
        parser:           _CV_SYSTEM_PARSER,
    };
    // For tasks without a built-in system prompt (e.g. 'coaching', 'general'),
    // honour the client-provided system so callers can inject their own context.
    const clientSystem = typeof body?.system === 'string'
        ? body.system.slice(0, TIERED_LLM_MAX_SYSTEM_CHARS)
        : '';
    const system = _internalSystemMap[taskKey] ?? clientSystem;
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, TIERED_LLM_MAX_PROMPT_CHARS) : '';
    if (!prompt) return json({ error: 'missing_prompt' }, request, env, 400);

    const { primary: model, chain: fallbackChain } = await resolveModel(taskKey, paidUpgrade, env);
    const baseMapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
    const upgradedModel = paidUpgrade ? PAID_UPGRADE_MAP[taskKey] : undefined;
    const { tier, free: baseFree, description } = baseMapping;
    const free = upgradedModel ? false : baseFree;

    const wantsJson  = body?.json === true;
    const wantStream = body?.stream === true;
    const temperature = clamp(Number(body?.temperature ?? 0.3), 0, 1);
    const maxTokens   = clamp(
        Number(body?.maxTokens ?? TIERED_LLM_DEFAULT_MAX_TOKENS),
        64,
        TIERED_LLM_HARD_MAX_TOKENS,
    );

    const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
    const effectiveSystem = wantsJson
        ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction)
        : system;

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (effectiveSystem) messages.push({ role: 'system', content: effectiveSystem });
    messages.push({ role: 'user', content: prompt });

    // ── Streaming path (no fallback — streams can't be retried mid-flight) ───
    if (wantStream) {
        try {
            const payload: Record<string, unknown> = { messages, temperature, max_tokens: maxTokens, stream: true };
            const streamRes: any = await env.AI.run(model as any, payload as any);
            if (!streamRes || typeof streamRes[Symbol.asyncIterator] !== 'function') {
                throw new Error('model did not return an async iterator');
            }

            const { readable, writable } = new TransformStream();
            const writer  = writable.getWriter();
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            void (async () => {
                try {
                    let buf = '';
                    for await (const chunk of streamRes as AsyncIterable<Uint8Array>) {
                        buf += decoder.decode(chunk, { stream: true });
                        const lines = buf.split('\n');
                        buf = lines.pop() ?? '';
                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            const raw = line.slice(6).trim();
                            if (!raw || raw === '[DONE]') continue;
                            try {
                                const evt = JSON.parse(raw) as any;
                                const text: string =
                                    evt?.response ??
                                    evt?.choices?.[0]?.delta?.content ??
                                    '';
                                if (text) {
                                    const norm = JSON.stringify({
                                        type:  'content_block_delta',
                                        delta: { type: 'text_delta', text },
                                    });
                                    await writer.write(encoder.encode(`data: ${norm}\n\n`));
                                }
                            } catch { /* ignore */ }
                        }
                    }
                } finally {
                    await writer.close().catch(() => {});
                }
            })();

            return new Response(readable, {
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
            });
        } catch (e: any) {
            return json({ error: 'stream_failed', message: String(e?.message || e), model, task: taskKey }, request, env, 502);
        }
    }

    // ── Non-streaming path — with automatic model fallback chain ─────────────
    // Try primary model first, then each fallback in order.
    // A model is skipped (and the next tried) when it:
    //   • throws any exception (network error, "model not found", quota exceeded)
    //   • returns HTTP 200 but produces empty text (retired model cold-returns nothing)
    const modelsToTry = [model, ...fallbackChain];
    let lastError = '';
    const attempted: string[] = [];

    for (const candidate of modelsToTry) {
        try {
            const text = await runAIModel(candidate, messages, temperature, maxTokens, wantsJson, env);
            const usedFallback = candidate !== model;
            return json({
                text,
                model: candidate,
                task: taskKey,
                tier,
                free,
                description,
                ...(usedFallback ? { fallback: true, primaryModel: model, attempted } : {}),
            }, request, env);
        } catch (e: any) {
            lastError = String(e?.message || e);
            attempted.push(candidate);
            // Continue to next model in chain
        }
    }

    // All models exhausted
    return json({
        error: 'llm_all_failed',
        task: taskKey,
        attempted,
        lastError,
        tier,
        free,
    }, request, env, 502);
}

// ─── Race LLM ─────────────────────────────────────────────────────────────────
const RACE_LLM_MAX_CANDIDATES = 3;

export async function handleRaceLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);

    const tasks: string[] = Array.isArray(body?.tasks)
        ? body.tasks.map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, RACE_LLM_MAX_CANDIDATES)
        : [];
    if (tasks.length < 2) return json({ error: 'need_at_least_two_tasks' }, request, env, 400);

    // Server-side plan check — same as handleTieredLLM, never trust client flag.
    const paidUpgrade = await resolveIsPremium(request, env);
    const system = typeof body?.system === 'string' ? body.system.slice(0, TIERED_LLM_MAX_SYSTEM_CHARS) : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, TIERED_LLM_MAX_PROMPT_CHARS) : '';
    if (!prompt) return json({ error: 'missing_prompt' }, request, env, 400);

    const wantsJson  = body?.json === true;
    const temperature = clamp(Number(body?.temperature ?? 0.3), 0, 1);
    const maxTokens   = clamp(Number(body?.maxTokens ?? TIERED_LLM_DEFAULT_MAX_TOKENS), 64, TIERED_LLM_HARD_MAX_TOKENS);

    const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
    const effectiveSystem = wantsJson ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction) : system;

    const baseMessages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (effectiveSystem) baseMessages.push({ role: 'system', content: effectiveSystem });
    baseMessages.push({ role: 'user', content: prompt });

    const t0 = Date.now();

    const runOne = async (taskKey: string) => {
        const baseMapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
        const upgradedModel = paidUpgrade ? PAID_UPGRADE_MAP[taskKey] : undefined;
        const model = upgradedModel ?? baseMapping.model;
        const { tier, free: baseFree, description } = baseMapping;
        const free = upgradedModel ? false : baseFree;

        const payload: Record<string, unknown> = { messages: baseMessages, temperature, max_tokens: maxTokens };
        const supports70bJsonFormat = model.includes('llama-3.3-70b') || model.includes('llama-3.1-70b');
        if (wantsJson && supports70bJsonFormat) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(model as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (text) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (!text) throw new Error(`empty:${taskKey}`);

        return { text, task: taskKey, model, tier, free, description };
    };

    const candidates = tasks.map(runOne);
    try {
        const winner = await Promise.any(candidates);
        const raceMs = Date.now() - t0;
        return json({ ...winner, raceMs, candidates: tasks.length }, request, env);
    } catch (e: any) {
        const reasons = e?.errors?.map((x: any) => String(x?.message || x)) ?? [String(e?.message || e)];
        return json({ error: 'all_candidates_failed', tasks, reasons }, request, env, 502);
    }
}

// ─── Parallel sections ────────────────────────────────────────────────────────
const PARALLEL_SECTIONS_MAX_COUNT       = 8;
const PARALLEL_SECTIONS_DEFAULT_FALLBACK = 'cvFallback';
const PARALLEL_SECTIONS_INSTRUCTION_MAX  = 6000;
const PARALLEL_SECTIONS_PREAMBLE_MAX     = TIERED_LLM_MAX_PROMPT_CHARS;

interface ParallelSectionInput {
    name: string;
    task: string;
    instruction: string;
    maxTokens?: number;
    temperature?: number;
    json?: boolean;
}

interface ParallelSectionResult {
    text: string;
    model: string;
    task: string;
    ms: number;
    fellBack: boolean;
    error?: string;
}

export async function handleParallelSections(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);

    const system      = _CV_SYSTEM_PROFESSIONAL;
    const profileHash = typeof body?.profile_hash === 'string' ? body.profile_hash.trim() : '';
    const rawPreamble = typeof body?.preamble === 'string' ? body.preamble.slice(0, PARALLEL_SECTIONS_PREAMBLE_MAX) : '';
    const fallbackTask: string = typeof body?.fallbackTask === 'string' && body.fallbackTask.trim()
        ? body.fallbackTask.trim()
        : PARALLEL_SECTIONS_DEFAULT_FALLBACK;

    let preamble = rawPreamble;
    const PROFILE_PLACEHOLDER = '{{PROFILE}}';
    if (profileHash && preamble.includes(PROFILE_PLACEHOLDER)) {
        // SECURITY: profile_cache is scoped by (user_id, hash) — see migration 035
        // and handlers/cache.ts. This lookup used to be `WHERE hash = ?` with no
        // user scoping at all, which was the same cross-account leak vector as
        // the one fixed in cache.ts, just reachable through the generation path
        // instead of the cache endpoints directly. A profile can only ever be
        // cached by an authenticated owner (handleProfileCachePost requires a
        // session), so an unauthenticated or session-less request here has no
        // legitimate cached profile to read — treat it as a cache miss, never
        // fall back to a hash-only global lookup.
        const sessionUserId = await getSessionUserId(request, env);
        if (sessionUserId) {
            try {
                const row = await env.CV_DB.prepare(
                    `SELECT compact_json FROM profile_cache WHERE user_id = ? AND hash = ?`
                ).bind(sessionUserId, profileHash).first<{ compact_json: string }>();

                if (row?.compact_json) {
                    preamble = preamble.replaceAll(PROFILE_PLACEHOLDER, row.compact_json);
                    const now = Math.floor(Date.now() / 1000);
                    env.CV_DB.prepare(
                        `UPDATE profile_cache SET last_used_at = ?, use_count = use_count + 1 WHERE user_id = ? AND hash = ?`
                    ).bind(now, sessionUserId, profileHash).run().catch(() => {});
                }
            } catch {
                // D1 read failure — leave preamble as-is
            }
        }
    }

    const rawSections: any[] = Array.isArray(body?.sections) ? body.sections : [];
    if (rawSections.length === 0) return json({ error: 'missing_sections' }, request, env, 400);

    const sections: ParallelSectionInput[] = rawSections
        .slice(0, PARALLEL_SECTIONS_MAX_COUNT)
        .map((s: any) => ({
            name:        String(s?.name || '').trim(),
            task:        String(s?.task || 'general').trim(),
            instruction: String(s?.instruction || '').slice(0, PARALLEL_SECTIONS_INSTRUCTION_MAX),
            maxTokens:   Number.isFinite(s?.maxTokens) ? clamp(Number(s.maxTokens), 64, TIERED_LLM_HARD_MAX_TOKENS) : 1024,
            temperature: Number.isFinite(s?.temperature) ? clamp(Number(s.temperature), 0, 1) : 0.4,
            json:        s?.json === true,
        }))
        .filter(s => s.name && s.instruction);

    if (sections.length === 0) return json({ error: 'no_valid_sections' }, request, env, 400);

    const names = new Set<string>();
    for (const s of sections) {
        if (names.has(s.name)) return json({ error: 'duplicate_section_name', name: s.name }, request, env, 400);
        names.add(s.name);
    }

    const t0 = Date.now();

    const callOnce = async (
        sec: ParallelSectionInput,
        taskKey: string,
    ): Promise<{ text: string; model: string }> => {
        const mapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
        const { model } = mapping;

        const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
        const wantsJson = sec.json === true;
        const effectiveSystem = wantsJson
            ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction)
            : system;

        const userContent = preamble
            ? preamble + '\n\n──── SECTION: ' + sec.name.toUpperCase() + ' ────\n' + sec.instruction
            : sec.instruction;

        const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
        if (effectiveSystem) messages.push({ role: 'system', content: effectiveSystem });
        messages.push({ role: 'user', content: userContent });

        const payload: Record<string, unknown> = {
            messages,
            temperature: sec.temperature ?? 0.4,
            max_tokens:  sec.maxTokens ?? 1024,
        };
        const supports70bJsonFormat = model.includes('llama-3.3-70b') || model.includes('llama-3.1-70b');
        if (wantsJson && supports70bJsonFormat) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(model as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (text) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (!text) throw new Error(`empty:${sec.name}`);

        return { text, model };
    };

    const runSection = async (sec: ParallelSectionInput): Promise<[string, ParallelSectionResult]> => {
        const sectionStart = Date.now();
        try {
            const out = await callOnce(sec, sec.task);
            return [sec.name, { text: out.text, model: out.model, task: sec.task, ms: Date.now() - sectionStart, fellBack: false }];
        } catch (primaryErr: any) {
            try {
                const out = await callOnce(sec, fallbackTask);
                return [sec.name, { text: out.text, model: out.model, task: fallbackTask, ms: Date.now() - sectionStart, fellBack: true }];
            } catch (fallbackErr: any) {
                return [sec.name, {
                    text: '', model: '', task: sec.task, ms: Date.now() - sectionStart, fellBack: false,
                    error: `primary=${String(primaryErr?.message || primaryErr).slice(0, 120)}; fallback=${String(fallbackErr?.message || fallbackErr).slice(0, 120)}`,
                }];
            }
        }
    };

    const settled = await Promise.all(sections.map(runSection));
    const results: Record<string, ParallelSectionResult> = {};
    const errors: Array<{ section: string; message: string }> = [];
    for (const [name, r] of settled) {
        results[name] = r;
        if (r.error) errors.push({ section: name, message: r.error });
    }

    const allFailed = settled.every(([, r]) => !r.text);
    if (allFailed) return json({ error: 'all_sections_failed', errors, totalMs: Date.now() - t0 }, request, env, 502);

    return json({ ok: true, totalMs: Date.now() - t0, results, errors }, request, env);
}

// ─── Proxy LLM (Claude / Gemini / OpenRouter) ─────────────────────────────────

const PROXY_MAX_PROMPT_CHARS  = 100000;
const PROXY_MAX_SYSTEM_CHARS  = 8000;
const PROXY_DEFAULT_MAX_TOKENS = 4096;
const PROXY_HARD_MAX_TOKENS   = 16000;

export async function handleProxyLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const provider   = typeof body?.provider   === 'string' ? body.provider.toLowerCase().trim()        : '';
    const apiKey     = typeof body?.apiKey     === 'string' ? body.apiKey.trim()                        : '';
    const model      = typeof body?.model      === 'string' ? body.model.trim()                         : '';
    const prompt     = typeof body?.prompt     === 'string' ? body.prompt.slice(0, PROXY_MAX_PROMPT_CHARS) : '';
    const task       = typeof body?.task       === 'string' ? body.task.trim()                          : '';
    const base64Data = typeof body?.base64Data === 'string' ? body.base64Data                           : '';
    const mimeType   = typeof body?.mimeType   === 'string' ? body.mimeType.trim()                      : '';
    const wantJson   = body?.json === true;
    const wantStream = body?.stream === true;
    const useSearch  = body?.useSearch === true;

    if (!provider || !apiKey || !prompt) {
        return json({ error: 'missing_fields', required: ['provider', 'apiKey', 'prompt'] }, request, env, 400);
    }
    if (!['claude', 'gemini', 'groq', 'openrouter', 'together', 'cerebras'].includes(provider)) {
        return json({ error: 'unsupported_provider', allowed: ['claude', 'gemini', 'groq', 'openrouter', 'together', 'cerebras'] }, request, env, 400);
    }

    const temperature = clamp(Number(body?.temperature ?? 0.4), 0, 1);
    const maxTokens   = clamp(Number(body?.maxTokens ?? PROXY_DEFAULT_MAX_TOKENS), 64, PROXY_HARD_MAX_TOKENS);

    const _internalSystemMap: Record<string, string> = {
        cvGenerate:       _CV_SYSTEM_PROFESSIONAL,
        cvGenerateLong:   _CV_SYSTEM_PROFESSIONAL,
        cvExperience:     _CV_SYSTEM_PROFESSIONAL,
        cvProjects:       _CV_SYSTEM_PROFESSIONAL,
        cvAudit:          _CV_SYSTEM_AUDIT,
        cvValidate:       _CV_SYSTEM_VALIDATOR,
        humanize:         _CV_SYSTEM_HUMANIZER,
        coverLetter:      _CV_SYSTEM_PROFESSIONAL,
        voiceConsistency: _CV_SYSTEM_HUMANIZER,
        jdParse:          _CV_SYSTEM_PARSER,
        parser:           _CV_SYSTEM_PARSER,
        cvSummary:        _CV_SYSTEM_PROFESSIONAL,
    };
    const system = task && _internalSystemMap[task]
        ? _internalSystemMap[task]
        : typeof body?.system === 'string'
            ? body.system.slice(0, PROXY_MAX_SYSTEM_CHARS)
            : '';

    const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
    const effectiveSystem = wantJson && !useSearch
        ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction)
        : system;

    try {
        // ── Claude ────────────────────────────────────────────────────────────
        if (provider === 'claude') {
            const claudeModel = model || 'claude-haiku-4-5-20251001';
            const isPdf = mimeType === 'application/pdf';

            // Build message content — multimodal (file + text) when a file is attached,
            // plain text otherwise.
            let claudeContent: unknown;
            if (base64Data && mimeType) {
                const filePart = isPdf
                    ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64Data } }
                    : { type: 'image',    source: { type: 'base64', media_type: mimeType, data: base64Data } };
                claudeContent = [filePart, { type: 'text', text: prompt }];
            } else {
                claudeContent = prompt;
            }

            const claudeBody: Record<string, unknown> = {
                model: claudeModel,
                max_tokens: maxTokens,
                temperature,
                messages: [{ role: 'user', content: claudeContent }],
            };
            if (effectiveSystem) claudeBody.system = effectiveSystem;

            // PDF extraction requires the Anthropic beta feature flag
            const claudeHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            };
            if (base64Data && isPdf) claudeHeaders['anthropic-beta'] = 'pdfs-2024-09-25';

            if (wantStream) {
                claudeBody.stream = true;
                const sRes = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: claudeHeaders,
                    body: JSON.stringify(claudeBody),
                });
                if (!sRes.ok || !sRes.body) {
                    const errText = await sRes.text().catch(() => '');
                    return json({ error: 'claude_stream_failed', status: sRes.status, message: errText.slice(0, 200) }, request, env, 502);
                }
                return new Response(sRes.body, {
                    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
                });
            }

            // Try the requested model, then step through the fallback chain if the
            // model itself is the problem (retired/renamed) rather than a genuine
            // auth/quota/content error — those should surface immediately.
            const claudeCandidates = [claudeModel, ...CLAUDE_FALLBACK_CHAIN.filter(m => m !== claudeModel)];
            let claudeLastErr: { status: number; message: string } | null = null;
            const claudeAttempted: string[] = [];

            for (let i = 0; i < claudeCandidates.length; i++) {
                const candidate = claudeCandidates[i];
                const attemptBody = { ...claudeBody, model: candidate };
                const res = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: claudeHeaders,
                    body: JSON.stringify(attemptBody),
                });
                claudeAttempted.push(candidate);

                if (!res.ok) {
                    const raw = await res.text().catch(() => '');
                    claudeLastErr = { status: res.status, message: raw.slice(0, 300) };
                    // Model-not-found: try the next candidate. Anything else
                    // (auth, quota, content policy) is not fixed by switching
                    // models — fail fast with the real error.
                    if (isModelNotFoundError(res.status, raw) && i < claudeCandidates.length - 1) continue;
                    const errStatus = (res.status >= 400 && res.status < 500) ? res.status : 502;
                    return json({
                        error: 'upstream_error',
                        message: raw.slice(0, 200),
                        status: res.status,
                        ...(claudeAttempted.length > 1 ? { attempted: claudeAttempted } : {}),
                    }, request, env, errStatus);
                }

                let data = await res.json() as any;
                let text: string = data?.content?.[0]?.text ?? '';
                let stopReason: string = data?.stop_reason ?? '';
                if (!text) {
                    claudeLastErr = { status: 502, message: 'empty_response' };
                    if (i < claudeCandidates.length - 1) continue;
                    return json({ error: 'empty_response', ...(claudeAttempted.length > 1 ? { attempted: claudeAttempted } : {}) }, request, env, 502);
                }

                // Confirmed truncation (provider explicitly says it hit the token
                // ceiling) — retry the SAME model once with a bumped budget instead
                // of returning a known-incomplete answer. Root-cause fix rather than
                // patching the cut-off sentence after the fact.
                if (stopReason === 'max_tokens' && maxTokens < PROXY_HARD_MAX_TOKENS) {
                    const bumpedTokens = Math.min(maxTokens * 2, PROXY_HARD_MAX_TOKENS);
                    const bumpRes = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: claudeHeaders,
                        body: JSON.stringify({ ...attemptBody, max_tokens: bumpedTokens }),
                    });
                    if (bumpRes.ok) {
                        const bumpData = await bumpRes.json().catch(() => null) as any;
                        const bumpText: string = bumpData?.content?.[0]?.text ?? '';
                        if (bumpText) { data = bumpData; text = bumpText; stopReason = bumpData?.stop_reason ?? stopReason; }
                    }
                }

                const usedFallback = candidate !== claudeModel;
                return json({
                    text,
                    model: candidate,
                    provider: 'claude',
                    finishReason: stopReason,
                    truncated: stopReason === 'max_tokens',
                    ...(usedFallback ? { fallback: true, requestedModel: claudeModel, attempted: claudeAttempted } : {}),
                }, request, env);
            }

            // Exhausted the whole chain (should be unreachable given the loop's own
            // return paths, but keep a safe exit).
            return json({
                error: 'upstream_error',
                message: claudeLastErr?.message || 'All Claude models failed',
                status: claudeLastErr?.status ?? 502,
                attempted: claudeAttempted,
            }, request, env, 502);
        }

        // ── Groq (OpenAI-compatible) ──────────────────────────────────────────
        if (provider === 'groq') {
            const groqModel = model || 'llama-3.3-70b-versatile';
            const groqUrl   = 'https://api.groq.com/openai/v1/chat/completions';

            const msgs: Array<{ role: string; content: string }> = [];
            if (effectiveSystem) msgs.push({ role: 'system', content: effectiveSystem });
            msgs.push({ role: 'user', content: prompt });

            const groqBody: Record<string, unknown> = {
                model:       groqModel,
                messages:    msgs,
                max_tokens:  maxTokens,
                temperature,
            };
            // Groq supports response_format for json_object on most models
            if (wantJson) groqBody.response_format = { type: 'json_object' };

            const groqHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            };

            if (wantStream) {
                groqBody.stream = true;
                const sRes = await fetch(groqUrl, { method: 'POST', headers: groqHeaders, body: JSON.stringify(groqBody) });
                if (!sRes.ok || !sRes.body) {
                    const errText = await sRes.text().catch(() => '');
                    return json({ error: 'groq_stream_failed', status: sRes.status, message: errText.slice(0, 200) }, request, env, 502);
                }
                const { readable, writable } = new TransformStream();
                const writer  = writable.getWriter();
                const encoder = new TextEncoder();
                const decoder = new TextDecoder();

                void (async () => {
                    let buf = '';
                    try {
                        const reader = sRes.body!.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buf += decoder.decode(value, { stream: true });
                            const lines = buf.split('\n');
                            buf = lines.pop() ?? '';
                            for (const line of lines) {
                                if (!line.startsWith('data: ')) continue;
                                const raw = line.slice(6).trim();
                                if (!raw || raw === '[DONE]') continue;
                                try {
                                    const evt = JSON.parse(raw) as any;
                                    const text: string = evt?.choices?.[0]?.delta?.content ?? '';
                                    if (text) {
                                        const norm = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } });
                                        await writer.write(encoder.encode(`data: ${norm}\n\n`));
                                    }
                                } catch { /* ignore */ }
                            }
                        }
                    } finally {
                        await writer.close().catch(() => {});
                    }
                })();

                return new Response(readable, {
                    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
                });
            }

            const res = await fetch(groqUrl, { method: 'POST', headers: groqHeaders, body: JSON.stringify(groqBody) });
            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                const errStatus = (res.status >= 400 && res.status < 500) ? res.status : 502;
                return json({ error: 'upstream_error', message: raw.slice(0, 200), status: res.status }, request, env, errStatus);
            }
            const data = await res.json() as any;
            let text: string = data?.choices?.[0]?.message?.content ?? '';
            const stopReason: string = data?.choices?.[0]?.finish_reason ?? '';
            if (!text) return json({ error: 'empty_response' }, request, env, 502);

            // Bump token budget once on truncation (same pattern as Claude)
            if (stopReason === 'length' && maxTokens < PROXY_HARD_MAX_TOKENS) {
                const bumpedTokens = Math.min(maxTokens * 2, PROXY_HARD_MAX_TOKENS);
                const bumpRes = await fetch(groqUrl, {
                    method: 'POST', headers: groqHeaders,
                    body: JSON.stringify({ ...groqBody, max_tokens: bumpedTokens }),
                });
                if (bumpRes.ok) {
                    const bumpData = await bumpRes.json().catch(() => null) as any;
                    const bumpText: string = bumpData?.choices?.[0]?.message?.content ?? '';
                    if (bumpText) text = bumpText;
                }
            }

            return json({ text, model: groqModel, provider: 'groq', finishReason: stopReason, truncated: stopReason === 'length' }, request, env);
        }

        // ── OpenRouter / Together / Cerebras ─────────────────────────────────
        if (['openrouter', 'together', 'cerebras'].includes(provider)) {
            const baseUrls: Record<string, string> = {
                openrouter: 'https://openrouter.ai/api/v1/chat/completions',
                together:   'https://api.together.xyz/v1/chat/completions',
                cerebras:   'https://api.cerebras.ai/v1/chat/completions',
            };
            const baseUrl = baseUrls[provider];
            const resolvedModel = model || (provider === 'openrouter' ? 'meta-llama/llama-3.3-70b-instruct:free' : 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free');

            const msgs: Array<{ role: string; content: string }> = [];
            if (effectiveSystem) msgs.push({ role: 'system', content: effectiveSystem });
            msgs.push({ role: 'user', content: prompt });

            const oaiBody: Record<string, unknown> = {
                model: resolvedModel,
                messages: msgs,
                max_tokens: maxTokens,
                temperature,
            };
            if (wantJson) oaiBody.response_format = { type: 'json_object' };

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            };
            if (provider === 'openrouter') {
                headers['HTTP-Referer'] = 'https://procv.app';
                headers['X-Title'] = 'ProCV';
            }

            if (wantStream) {
                oaiBody.stream = true;
                const sRes = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(oaiBody) });
                if (!sRes.ok || !sRes.body) {
                    const errText = await sRes.text().catch(() => '');
                    return json({ error: `${provider}_stream_failed`, status: sRes.status, message: errText.slice(0, 200) }, request, env, 502);
                }
                const { readable, writable } = new TransformStream();
                const writer  = writable.getWriter();
                const encoder = new TextEncoder();
                const decoder = new TextDecoder();

                void (async () => {
                    let buf = '';
                    try {
                        const reader = sRes.body!.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buf += decoder.decode(value, { stream: true });
                            const lines = buf.split('\n');
                            buf = lines.pop() ?? '';
                            for (const line of lines) {
                                if (!line.startsWith('data: ')) continue;
                                const raw = line.slice(6).trim();
                                if (!raw || raw === '[DONE]') continue;
                                try {
                                    const evt = JSON.parse(raw) as any;
                                    const text: string = evt?.choices?.[0]?.delta?.content ?? '';
                                    if (text) {
                                        const norm = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } });
                                        await writer.write(encoder.encode(`data: ${norm}\n\n`));
                                    }
                                } catch { /* ignore */ }
                            }
                        }
                    } finally {
                        await writer.close().catch(() => {});
                    }
                })();

                return new Response(readable, {
                    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
                });
            }

            const res = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(oaiBody) });
            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                const errStatus = (res.status >= 400 && res.status < 500) ? res.status : 502;
                return json({ error: 'upstream_error', message: raw.slice(0, 200), status: res.status }, request, env, errStatus);
            }
            const data = await res.json() as any;
            const text: string = data?.choices?.[0]?.message?.content ?? '';
            if (!text) return json({ error: 'empty_response' }, request, env, 502);
            return json({ text, model: resolvedModel, provider }, request, env);
        }

        // ── Gemini ────────────────────────────────────────────────────────────
        const geminiModel = model || 'gemini-2.0-flash';
        const geminiBody: Record<string, unknown> = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
                ...(wantJson && !useSearch ? { responseMimeType: 'application/json' } : {}),
            },
        };
        if (effectiveSystem) geminiBody.systemInstruction = { parts: [{ text: effectiveSystem }] };
        if (useSearch) geminiBody.tools = [{ googleSearch: {} }];

        if (wantStream && !useSearch) {
            const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
            const sRes = await fetch(streamUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(geminiBody),
            });
            if (!sRes.ok || !sRes.body) {
                const errText = await sRes.text().catch(() => '');
                return json({ error: 'gemini_stream_failed', status: sRes.status, message: errText.slice(0, 200) }, request, env, 502);
            }
            const { readable, writable } = new TransformStream();
            const writer  = writable.getWriter();
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            void (async () => {
                let buf = '';
                try {
                    const reader = sRes.body!.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buf += decoder.decode(value, { stream: true });
                        const lines = buf.split('\n');
                        buf = lines.pop() ?? '';
                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            const raw = line.slice(6).trim();
                            if (!raw || raw === '[DONE]') continue;
                            try {
                                const evt = JSON.parse(raw) as any;
                                const text: string = evt?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                                if (text) {
                                    const norm = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } });
                                    await writer.write(encoder.encode(`data: ${norm}\n\n`));
                                }
                            } catch { /* ignore */ }
                        }
                    }
                } finally {
                    await writer.close().catch(() => {});
                }
            })();

            return new Response(readable, {
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
            });
        }

        const geminiCandidates = [geminiModel, ...GEMINI_FALLBACK_CHAIN.filter(m => m !== geminiModel)];
        let geminiLastErr: { status: number; message: string } | null = null;
        const geminiAttempted: string[] = [];

        for (let i = 0; i < geminiCandidates.length; i++) {
            const candidate = geminiCandidates[i];
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`;
            const res = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(geminiBody),
            });
            geminiAttempted.push(candidate);

            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                let msg = '';
                try { msg = (JSON.parse(raw) as any)?.error?.message || ''; } catch { /**/ }
                geminiLastErr = { status: res.status, message: msg || `Gemini error ${res.status}` };
                if (isModelNotFoundError(res.status, msg || raw) && i < geminiCandidates.length - 1) continue;
                const errStatus = (res.status >= 400 && res.status < 500) ? res.status : 502;
                return json({
                    error: 'upstream_error',
                    message: msg || `Gemini error ${res.status}`,
                    status: res.status,
                    ...(geminiAttempted.length > 1 ? { attempted: geminiAttempted } : {}),
                }, request, env, errStatus);
            }

            let data = await res.json() as any;
            let text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            let finishReason: string = data?.candidates?.[0]?.finishReason ?? '';
            if (!text) {
                geminiLastErr = { status: 502, message: 'empty_response' };
                if (i < geminiCandidates.length - 1) continue;
                return json({ error: 'empty_response', ...(geminiAttempted.length > 1 ? { attempted: geminiAttempted } : {}) }, request, env, 502);
            }

            // Confirmed truncation — retry the SAME model once with a bumped token
            // budget rather than returning a known-incomplete answer.
            if (finishReason === 'MAX_TOKENS' && maxTokens < PROXY_HARD_MAX_TOKENS) {
                const bumpedTokens = Math.min(maxTokens * 2, PROXY_HARD_MAX_TOKENS);
                const bumpBody = { ...geminiBody, generationConfig: { ...(geminiBody as any).generationConfig, maxOutputTokens: bumpedTokens } };
                const bumpRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(bumpBody),
                });
                if (bumpRes.ok) {
                    const bumpData = await bumpRes.json().catch(() => null) as any;
                    const bumpText: string = bumpData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                    if (bumpText) { data = bumpData; text = bumpText; finishReason = bumpData?.candidates?.[0]?.finishReason ?? finishReason; }
                }
            }

            const usedFallback = candidate !== geminiModel;
            return json({
                text,
                model: candidate,
                provider: 'gemini',
                finishReason,
                truncated: finishReason === 'MAX_TOKENS',
                ...(usedFallback ? { fallback: true, requestedModel: geminiModel, attempted: geminiAttempted } : {}),
            }, request, env);
        }

        return json({
            error: 'upstream_error',
            message: geminiLastErr?.message || 'All Gemini models failed',
            status: geminiLastErr?.status ?? 502,
            attempted: geminiAttempted,
        }, request, env, 502);

    } catch (err: any) {
        return json({ error: 'proxy_error', message: String(err?.message || err) }, request, env, 502);
    }
}

// ─── Job title ontology classifier ───────────────────────────────────────────

/**
 * POST /api/ontology/classify-titles
 *
 * Body: { titles: string[], source?: TitleSource, force_confidence?: 'user_confirmed', force_field?: string }
 *
 * Step 1: bulk D1 lookup for all titles
 * Step 2: for any miss, batch LLM classify with Llama 3.2 3B (free tier)
 * Step 3: upsert LLM results to D1 fire-and-forget
 *
 * Returns: { results: Array<{ title, field_slug, confidence, from_cache }> }
 */
export async function handleClassifyTitles(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const titles: string[] = Array.isArray(body?.titles) ? body.titles.filter((t: any) => typeof t === 'string' && t.trim()) : [];
    if (titles.length === 0) return json({ results: [] }, request, env);
    if (titles.length > 50) return json({ error: 'too_many_titles', max: 50 }, request, env, 400);

    const source: string = ['pdf_import', 'jd_upload', 'manual_form', 'deep_analysis'].includes(body?.source)
        ? body.source : 'manual_form';

    const { bulkLookupTitles, upsertTitle, parseFieldSlugFromLLM, normalizeTitle, VALID_FIELD_SLUGS } =
        await import('../services/titleOntologyService');

    // Force-upsert path (user_confirmed from ProfileForm field dropdown)
    if (body?.force_confidence === 'user_confirmed' && body?.force_field) {
        const validSlug = parseFieldSlugFromLLM(body.force_field);
        if (validSlug && titles.length === 1) {
            ctx.waitUntil(upsertTitle(env, titles[0], validSlug, 'user_confirmed', source as any));
            return json({ results: [{ title: titles[0], field_slug: validSlug, confidence: 'user_confirmed', from_cache: false }] }, request, env);
        }
    }

    // Step 1: D1 bulk lookup
    const cached = await bulkLookupTitles(env, titles);
    const results: Array<{ title: string; field_slug: string | null; confidence: string; from_cache: boolean }> =
        titles.map(t => {
            const row = cached.get(normalizeTitle(t));
            return row
                ? { title: t, field_slug: row.field_slug, confidence: row.confidence, from_cache: true }
                : { title: t, field_slug: null, confidence: 'unclassified', from_cache: false };
        });

    // Step 2: LLM classify misses
    const missedIndices = results.map((r, i) => (r.field_slug === null ? i : -1)).filter(i => i >= 0);
    if (missedIndices.length > 0) {
        const missedTitles = missedIndices.map(i => titles[i]);
        const validSlugs = [...VALID_FIELD_SLUGS].join(', ');
        const prompt = `You are a job title classifier. Classify each job title into exactly one field slug.

Valid field slugs: ${validSlugs}

Rules:
- Return ONLY a JSON object, no explanation, no markdown.
- For each title, return the single best matching field slug.
- If genuinely unclear, return "general".
- Engineering titles need careful distinction:
  civil/structural/road/drainage → civil_engineering
  irrigation/water resource/agricultural → irrigation
  manufacturing/production/process → manufacturing
  software/developer/devops → tech
  data/analytics/ml → data_analytics

Job titles to classify:
${missedTitles.map((t, i) => `${i + 1}. "${t}"`).join('\n')}

Respond with ONLY this JSON (no backticks, no explanation):
{
  "classifications": [
    { "title": "exact title here", "field_slug": "slug_here" }
  ]
}`;

        try {
            const llmRes: any = await env.AI.run(
                '@cf/meta/llama-3.2-3b-instruct' as any,
                { prompt, max_tokens: 512 } as any,
            );
            const raw = typeof llmRes?.response === 'string' ? llmRes.response : '';
            const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
            const classifications: Array<{ title: string; field_slug: string }> = parsed?.classifications ?? [];
            const now = Math.floor(Date.now() / 1000);

            for (const cls of classifications) {
                const slug = parseFieldSlugFromLLM(cls.field_slug);
                if (!slug || !cls.title) continue;

                const idx = results.findIndex(r => normalizeTitle(r.title) === normalizeTitle(cls.title));
                if (idx !== -1) {
                    results[idx].field_slug = slug;
                    results[idx].confidence = 'llm';
                }

                ctx.waitUntil(upsertTitle(env, cls.title, slug, 'llm', source as any));
            }
        } catch { /* LLM failed — results stay null for missed titles */ }
    }

    return json({ results }, request, env);
}

// ─── Account tier probe ───────────────────────────────────────────────────────

export async function handleAccountTier(request: Request, env: Env): Promise<Response> {
    const PAID_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    try {
        const res: any = await env.AI.run(PAID_MODEL as any, {
            messages: [
                { role: 'system', content: 'Reply with the single word: ok' },
                { role: 'user',   content: 'ping' },
            ],
            temperature: 0,
            max_tokens: 4,
        });
        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (text.trim()) return json({ tier: 'paid', model: PAID_MODEL }, request, env);
        return json({ tier: 'free', model: PAID_MODEL, note: 'paid model returned empty — likely free tier' }, request, env);
    } catch (e: any) {
        const msg = String(e?.message || e || '');
        const isQuota = msg.includes('4006') || msg.toLowerCase().includes('neuron') || msg.toLowerCase().includes('quota');
        return json({ tier: 'free', model: PAID_MODEL, note: isQuota ? 'neuron quota exhausted' : msg.slice(0, 120) }, request, env);
    }
}

// ─── Document → Markdown extraction (toMarkdown) ─────────────────────────────
//
// Accepts any supported file (PDF, DOCX, XLSX, images, etc.) as multipart
// form-data and returns the extracted text as Markdown via env.AI.toMarkdown.
//
// Text-layer PDFs and DOCX are parsed without AI inference (zero token cost).
// Scanned / image-only files use Workers AI vision (counts against daily quota).
//
// Rate-limited to the "medium" bucket (40 req/60 s) to cover the worst case
// where every request triggers a vision inference.

export async function handleExtractDoc(request: Request, env: Env): Promise<Response> {
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return json({ error: 'invalid_form_data', hint: 'POST multipart/form-data with a "file" field.' }, request, env, 400);
    }

    const file = formData.get('file') as File | null;
    if (!file || typeof file.name !== 'string') {
        return json({ error: 'missing_file', hint: 'Include a "file" field in the form data.' }, request, env, 400);
    }

    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — generous for any CV
    if (file.size > MAX_BYTES) {
        return json({ error: 'file_too_large', maxBytes: MAX_BYTES }, request, env, 413);
    }

    try {
        // CF binding returns Array<{ id, name, mimeType, format, tokens, data } | { format:'error', error:string }>
        const results: Array<{ name: string; format: string; data?: string; error?: string }> =
            await (env.AI as any).toMarkdown([{ name: file.name, blob: file }]);

        const first = results?.[0];
        if (!first || first.format === 'error') {
            return json({
                error: 'extraction_failed',
                hint: first?.error ?? 'File could not be converted — check format or content.',
            }, request, env, 502);
        }

        const text = first.data?.trim() ?? '';
        if (text.length < 10) {
            return json({
                error: 'extraction_empty',
                hint: 'File may be image-only, password-protected, or an unsupported format.',
            }, request, env, 502);
        }

        return json({ text }, request, env);
    } catch (e: any) {
        return json({ error: 'extraction_failed', message: String(e?.message || e) }, request, env, 502);
    }
}
