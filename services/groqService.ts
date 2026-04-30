import { getGroqKey as _rtGroq, getCerebrasKey as _rtCerebras, getGeminiKey as _rtGemini, getClaudeKey as _rtClaude, getOpenRouterKey as _rtOpenRouter, getTogetherKey as _rtTogether } from './security/RuntimeKeys';
import { lookupGroqCache, storeGroqCache } from './groqCacheClient';
import { workerTieredLLM, isCVEngineConfigured, rewarmCVEngineModels } from './cvEngineClient';
import { GoogleGenAI } from '@google/genai';

// ── Active AI engine tracker ──────────────────────────────────────────────────
// Updated every time groqChat() successfully returns via a particular backend.
// Components can call getLastAiEngine() after generation to show which AI ran.
let _lastAiEngine: string = 'Workers AI';
export function getLastAiEngine(): string { return _lastAiEngine; }

// ─────────────────────────────────────────────────────────────────────────────
// Groq → Cloudflare Workers AI redirect (Apr 2026)
//
// `groqChat()` is the single chokepoint every text-gen call in the codebase
// flows through. We now route it through the cv-engine-worker's tiered LLM
// endpoint FIRST so every CV-creation step lands on Cloudflare Workers AI
// (Llama 4 Scout, GLM 4.7 Flash, Mistral Small 3.1, Hermes-2 Pro, etc.) by
// default — no API key needed from the user, no rate-limits, no quota walls.
//
// Mapping by model: GROQ_LARGE (Llama 3.3 70b versatile) → "cvGenerate" task
// (Llama 4 Scout 17B — equivalent quality, ~3× cheaper than the 70b paid
// model). GROQ_FAST (Llama 3.1 8b instant) → "general" task (Llama 3.1 8B
// FREE, direct equivalent).
//
// Groq + Cerebras keys remain as LAST-RESORT fallbacks: they only fire if
// the worker is fully unreachable AND the user happens to have configured
// a key. Default user flow never touches Groq.
// ─────────────────────────────────────────────────────────────────────────────
function groqModelToWorkerTask(groqModel: string): string {
    if (groqModel === 'llama-3.3-70b-versatile') return 'cvGenerate';
    if (groqModel === 'llama-3.1-8b-instant')   return 'general';
    return 'general';
}

const GROQ_API_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const CEREBRAS_API_URL   = 'https://api.cerebras.ai/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TOGETHER_API_URL   = 'https://api.together.xyz/v1/chat/completions';

export const GROQ_LARGE = 'llama-3.3-70b-versatile';
export const GROQ_FAST  = 'llama-3.1-8b-instant';

// Cerebras OpenAI-compatible models (catalog refreshed Apr 2026 — Cerebras
// retired the Llama 3.3 70b SKUs; current top-end picks are Qwen3 235B and
// GPT-OSS 120B). Each entry is a fallback chain tried in order on 404; if
// every entry 404s, callCerebrasWithFallback() probes /v1/models live.
const CEREBRAS_LARGE_CHAIN = ['qwen-3-235b-a22b-instruct-2507', 'gpt-oss-120b', 'zai-glm-4.7', 'llama3.1-8b'];
const CEREBRAS_FAST_CHAIN  = ['llama3.1-8b'];

function groqModelToCerebrasChain(groqModel: string): string[] {
    if (groqModel === GROQ_LARGE) return CEREBRAS_LARGE_CHAIN;
    if (groqModel === GROQ_FAST)  return CEREBRAS_FAST_CHAIN;
    return CEREBRAS_FAST_CHAIN;
}

// ── OpenRouter free-tier models (separate daily quota from CF Workers AI) ─
// Each entry is tried in order; "404 / no longer available" cycles to the next.
// All `:free` variants — no spend on the user's OpenRouter account.
// Verified live against https://openrouter.ai/api/v1/models on Apr 28 2026.
// If a model 404s in the wild, swap it for another from /api/v1/models filtered by `:free`.
const OPENROUTER_LARGE_CHAIN = [
    'nvidia/nemotron-3-super-120b-a12b:free',         // 120B MoE, 262K ctx — top quality free
    'qwen/qwen3-next-80b-a3b-instruct:free',          // 80B MoE, 262K ctx — fast & strong
    'meta-llama/llama-3.3-70b-instruct:free',         // 70B, 65K ctx — battle-tested
    'openai/gpt-oss-120b:free',                       // 120B, 131K ctx — OpenAI open model
    'nousresearch/hermes-3-llama-3.1-405b:free',      // 405B, 131K ctx — biggest free
    'google/gemma-3-27b-it:free',                     // 27B, 131K ctx — solid backup
];
const OPENROUTER_FAST_CHAIN = [
    'nvidia/nemotron-nano-9b-v2:free',                // 9B, 128K ctx — fast & long context
    'openai/gpt-oss-20b:free',                        // 20B, 131K ctx — fast OpenAI open
    'google/gemma-3-12b-it:free',                     // 12B, 32K ctx — fast Gemma
    'meta-llama/llama-3.2-3b-instruct:free',          // 3B, 131K ctx — tiny & fast
];
function groqModelToOpenRouterChain(groqModel: string): string[] {
    if (groqModel === GROQ_LARGE) return OPENROUTER_LARGE_CHAIN;
    if (groqModel === GROQ_FAST)  return OPENROUTER_FAST_CHAIN;
    return OPENROUTER_FAST_CHAIN;
}

// ── Together.ai free-tier models (Llama 3.3 70B Turbo Free is genuinely free) ─
const TOGETHER_LARGE_CHAIN = [
    'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
];
const TOGETHER_FAST_CHAIN = [
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    'meta-llama/Llama-3.2-3B-Instruct-Turbo',
];
function groqModelToTogetherChain(groqModel: string): string[] {
    if (groqModel === GROQ_LARGE) return TOGETHER_LARGE_CHAIN;
    if (groqModel === GROQ_FAST)  return TOGETHER_FAST_CHAIN;
    return TOGETHER_FAST_CHAIN;
}

export function getGroqApiKey(): string {
    // 1. In-memory decrypted key (primary — populated by KeyVault on app start)
    const rt = _rtGroq();
    if (rt) return rt;

    // 2. Legacy plaintext fallback (migration path — only works for old unencrypted data)
    try {
        const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (settingsString) {
            const s = JSON.parse(settingsString);
            if (s.groqApiKey && !s.groqApiKey.startsWith('enc:v1:')) return s.groqApiKey.replace(/^"|"$/g, '');
        }
        const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
        if (providerKeys.groq && !providerKeys.groq.startsWith('enc:v1:')) return providerKeys.groq.replace(/^"|"$/g, '');
    } catch {}
    throw new Error('Groq API key not set. Please add it in Settings.');
}

export function getCerebrasApiKey(): string | null {
    // 1. In-memory decrypted key
    const rt = _rtCerebras();
    if (rt) return rt;

    // 2. Legacy plaintext fallback
    try {
        const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (settingsString) {
            const s = JSON.parse(settingsString);
            if (s.cerebrasApiKey && !s.cerebrasApiKey.startsWith('enc:v1:')) return s.cerebrasApiKey.replace(/^"|"$/g, '');
        }
        // Also check provider_keys store
        const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
        if (providerKeys.cerebras && !providerKeys.cerebras.startsWith('enc:v1:')) return providerKeys.cerebras.replace(/^"|"$/g, '');
    } catch {}
    return null;
}

export function hasGroqKey(): boolean {
    try { getGroqApiKey(); return true; } catch { return false; }
}

export function hasCerebrasKey(): boolean {
    return !!getCerebrasApiKey();
}

// ── Per-provider health tracker (in-memory, this session only) ──────────────
// Records the most recent outcome of every fallback-chain attempt so the user
// can see, at a glance, *why* a provider was used or skipped — including which
// providers got rate-limited or have exhausted their daily quota.
type ProviderHealthState =
    | 'never_tried'      // not attempted yet this session
    | 'ok'               // last call returned a usable result
    | 'no_key'           // no API key configured (or runtime store empty)
    | 'quota_exhausted'  // 429 / quota / rate-limit / daily-allocation message
    | 'auth_failed'      // 401 / 403 / invalid key
    | 'failed';          // any other transient/unknown error

interface ProviderHealth {
    state: ProviderHealthState;
    lastError?: string;     // truncated reason
    lastAttemptAt?: number; // epoch ms
    attempts: number;
}

const PROVIDERS = [
    'Workers AI', 'Groq', 'Cerebras', 'OpenRouter', 'Together.ai', 'Claude', 'Gemini',
] as const;
type ProviderName = typeof PROVIDERS[number];

const _providerHealth: Record<ProviderName, ProviderHealth> = {
    'Workers AI':  { state: 'never_tried', attempts: 0 },
    'Groq':        { state: 'never_tried', attempts: 0 },
    'Cerebras':    { state: 'never_tried', attempts: 0 },
    'OpenRouter':  { state: 'never_tried', attempts: 0 },
    'Together.ai': { state: 'never_tried', attempts: 0 },
    'Claude':      { state: 'never_tried', attempts: 0 },
    'Gemini':      { state: 'never_tried', attempts: 0 },
};

function _classifyErrorState(err: any): ProviderHealthState {
    const status = err?.status;
    const msg = (err?.message || '').toLowerCase();
    if (status === 401 || status === 403 || /invalid.*key|unauthor|forbidden/.test(msg)) {
        return 'auth_failed';
    }
    if (status === 429 || status === 402 || /rate.?limit|quota|daily.*allocation|exhaust|neuron|too many/.test(msg)) {
        return 'quota_exhausted';
    }
    return 'failed';
}

function _recordProviderResult(
    name: ProviderName,
    state: ProviderHealthState,
    err?: any,
): void {
    const h = _providerHealth[name];
    h.state = state;
    h.lastAttemptAt = Date.now();
    if (state !== 'no_key' && state !== 'never_tried') h.attempts += 1;
    h.lastError = err?.message ? String(err.message).substring(0, 120) : undefined;
}

// One-shot warning so the user (and we) can see when an OpenRouter / Together
// key is sitting in localStorage in the encrypted form but the runtime
// decryption hasn't populated the in-memory store. Without this warning, a
// connected provider silently looks unconfigured to the fallback chain — the
// exact symptom the user reported when OpenRouter was never called even though
// Settings showed "✓ Connected".
const _encWarned: { [k: string]: boolean } = {};
function _warnEncryptedKeyOnce(provider: string): void {
    if (_encWarned[provider]) return;
    _encWarned[provider] = true;
    console.warn(
        `[AI] ${provider} key is stored encrypted (enc:v1:) but the runtime ` +
        `decrypted store is empty — the fallback chain will skip ${provider}. ` +
        `If you can see "${provider} ✓ Connected" in Settings but never see ` +
        `"[AI] Trying ${provider}" in this console, the runtime store wasn't ` +
        `loaded for this session. Re-saving the key in Settings will fix it.`,
    );
}

// ── OpenRouter key retrieval ─────────────────────────────────────────────────
export function getOpenRouterApiKey(): string | null {
    const rt = _rtOpenRouter();
    if (rt) return rt;
    try {
        const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (settingsString) {
            const s = JSON.parse(settingsString);
            if (s.openrouterApiKey) {
                if (s.openrouterApiKey.startsWith('enc:v1:')) _warnEncryptedKeyOnce('OpenRouter');
                else return s.openrouterApiKey.replace(/^"|"$/g, '');
            }
        }
        const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
        if (providerKeys.openrouter) {
            if (providerKeys.openrouter.startsWith('enc:v1:')) _warnEncryptedKeyOnce('OpenRouter');
            else return providerKeys.openrouter.replace(/^"|"$/g, '');
        }
    } catch {}
    return null;
}

export function hasOpenRouterKey(): boolean { return !!getOpenRouterApiKey(); }

// ── Together.ai key retrieval ────────────────────────────────────────────────
export function getTogetherApiKey(): string | null {
    const rt = _rtTogether();
    if (rt) return rt;
    try {
        const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (settingsString) {
            const s = JSON.parse(settingsString);
            if (s.togetherApiKey) {
                if (s.togetherApiKey.startsWith('enc:v1:')) _warnEncryptedKeyOnce('Together.ai');
                else return s.togetherApiKey.replace(/^"|"$/g, '');
            }
        }
        const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
        if (providerKeys.together) {
            if (providerKeys.together.startsWith('enc:v1:')) _warnEncryptedKeyOnce('Together.ai');
            else return providerKeys.together.replace(/^"|"$/g, '');
        }
    } catch {}
    return null;
}

export function hasTogetherKey(): boolean { return !!getTogetherApiKey(); }

/** True when at least one text-generation key is available */
export function hasAnyLlmKey(): boolean {
    return hasGroqKey() || hasCerebrasKey() || hasOpenRouterKey() || hasTogetherKey();
}

// ── Gemini key retrieval (last-resort fallback, no circular import) ──────────
function getGeminiApiKey(): string | null {
    const rt = _rtGemini();
    if (rt) return rt;
    try {
        const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (s) {
            const parsed = JSON.parse(s);
            if (parsed.apiKey && !parsed.apiKey.startsWith('enc:v1:')) return parsed.apiKey.replace(/^"|"$/g, '');
        }
        const pk = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
        if (pk.gemini && !pk.gemini.startsWith('enc:v1:')) return pk.gemini.replace(/^"|"$/g, '');
    } catch { /* ignore */ }
    return null;
}

async function geminiChat(
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; maxTokens?: number; json?: boolean } = {},
): Promise<string> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error('No Gemini API key configured — please add one in Settings.');
    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.0-flash';
    const config: Record<string, unknown> = {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxTokens ?? 4096,
    };
    if (opts.json) config.responseMimeType = 'application/json';
    const response = await ai.models.generateContent({
        model,
        config,
        contents: [
            { role: 'user', parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt }] },
        ],
    });
    const text = response.text ?? '';
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
}

// ── Claude key retrieval ──────────────────────────────────────────────────────
function getClaudeApiKey(): string | null {
    const rt = _rtClaude();
    if (rt) return rt;
    try {
        const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (s) {
            const parsed = JSON.parse(s);
            if (parsed.claudeApiKey && !parsed.claudeApiKey.startsWith('enc:v1:')) return parsed.claudeApiKey.replace(/^"|"$/g, '');
        }
    } catch { /* ignore */ }
    return null;
}

// ── Claude (Anthropic) chat — 200K token context window ──────────────────────
// Uses claude-3-5-haiku for speed/cost; falls back to claude-3-5-sonnet on
// overload so users who enter their key can always get a response.
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_HAIKU   = 'claude-3-5-haiku-20241022';
const CLAUDE_SONNET  = 'claude-3-5-sonnet-20241022';

async function callClaudeApi(
    apiKey: string,
    claudeModel: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
    const body: Record<string, unknown> = {
        model: claudeModel,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.3,
        messages: [{ role: 'user', content: userPrompt }],
    };
    if (systemPrompt) body.system = systemPrompt;
    const res = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const raw = await res.text().catch(() => '');
        let msg = '';
        try { msg = JSON.parse(raw)?.error?.message || ''; } catch {}
        const err: any = new Error(msg || `Claude API error (status ${res.status})`);
        err.status = res.status;
        throw err;
    }
    const data = await res.json();
    const text = (data?.content?.[0]?.text as string) ?? '';
    if (!text) throw new Error('Claude returned an empty response.');
    return text;
}

async function claudeChat(
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
    const apiKey = getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured — please add one in Settings.');
    try {
        return await callClaudeApi(apiKey, CLAUDE_HAIKU, systemPrompt, userPrompt, opts);
    } catch (haikuErr: any) {
        // On 529 (overloaded) or 503, try Sonnet before giving up
        if (haikuErr?.status === 529 || haikuErr?.status === 503 || haikuErr?.status === 529) {
            console.warn('[AI] Claude Haiku overloaded — retrying with Sonnet');
            return await callClaudeApi(apiKey, CLAUDE_SONNET, systemPrompt, userPrompt, opts);
        }
        throw haikuErr;
    }
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Converts a raw Groq API error response into a short, user-readable message.
 * Called whenever the HTTP response is not OK.
 */
function parseGroqError(status: number, rawBody: string): string {
    let code = '';
    let apiMsg = '';
    try {
        const parsed = JSON.parse(rawBody);
        code   = parsed?.error?.code    || parsed?.error?.type    || '';
        apiMsg = parsed?.error?.message || '';
    } catch { /* body wasn't JSON */ }

    const c = code.toLowerCase();
    const m = apiMsg.toLowerCase();

    // 413 = payload-too-large. Groq tags this with code `rate_limit_exceeded`
    // even though it's NOT a rate limit — it's a token-per-request overflow.
    // Detect it before the rate-limit branch so the user gets the right advice.
    const isTooLarge =
        status === 413 ||
        m.includes('too large') || m.includes('too long') ||
        m.includes('context length') || m.includes('maximum context') ||
        m.includes('tokens per request') ||
        (m.includes('request') && m.includes('exceed'));
    if (isTooLarge) {
        return 'Your input is too large for the AI model in a single request. Try shortening your CV (fewer roles/bullets) or the job description.';
    }

    if (status === 429 || c.includes('rate') || m.includes('rate limit')) {
        if (c.includes('daily') || c.includes('quota') || m.includes('daily') || m.includes('quota') || m.includes('exceeded your')) {
            return 'Daily AI limit reached on your Groq account. Usage resets at midnight UTC — or check console.groq.com to upgrade.';
        }
        // Extract retry-after hint if present
        const seconds = m.match(/try again in (\d+(?:\.\d+)?)\s*s/i)?.[1];
        const wait = seconds ? ` Wait about ${Math.ceil(Number(seconds))} seconds.` : ' Wait 30–60 seconds.';
        return `Rate limit reached on Groq.${wait} Then try again, or add a free Cerebras key in Settings for automatic fallback.`;
    }

    if (status === 401 || c.includes('invalid_api_key') || m.includes('invalid api key')) {
        return 'Invalid Groq API key — please check it in Settings.';
    }

    if (status === 503 || c.includes('overload') || m.includes('overload') || m.includes('unavailable')) {
        return 'The AI service is temporarily overloaded. Please try again in a few seconds.';
    }

    if (status === 400) {
        return `Bad request sent to the AI (${c || 'unknown'}). If this keeps happening, try regenerating.`;
    }

    // Fallback — show a short clean message, never the raw JSON
    return apiMsg
        ? apiMsg.length > 120 ? apiMsg.substring(0, 117) + '…' : apiMsg
        : `AI request failed (status ${status}). Please try again.`;
}

/**
 * Converts a raw Cerebras API error into a short, user-readable message.
 */
function parseCerebrasError(status: number, rawBody: string): string {
    let apiMsg = '';
    try {
        const parsed = JSON.parse(rawBody);
        apiMsg = parsed?.message || parsed?.error?.message || '';
    } catch {}
    const m = apiMsg.toLowerCase();
    if (status === 404 || m.includes('model') && (m.includes('not found') || m.includes('does not exist'))) {
        return 'Cerebras model not available (likely renamed by Cerebras). The app will retry with an alternative model automatically.';
    }
    if (status === 429 || m.includes('rate')) {
        return 'Rate limit reached on Cerebras. Please wait a moment and try again.';
    }
    if (status === 401 || m.includes('invalid') || m.includes('unauthorized')) {
        return 'Invalid Cerebras API key — please check it in Settings.';
    }
    if (status === 503 || m.includes('overload') || m.includes('unavailable')) {
        return 'Cerebras AI is temporarily overloaded. Please try again in a few seconds.';
    }
    return apiMsg ? apiMsg.substring(0, 120) : `Cerebras request failed (status ${status}). Please try again.`;
}

// ── OpenRouter / Together error parsers ───────────────────────────────────
function parseOpenRouterError(status: number, rawBody: string): string {
    let apiMsg = '';
    try {
        const parsed = JSON.parse(rawBody);
        apiMsg = parsed?.error?.message || parsed?.message || '';
    } catch {}
    const m = apiMsg.toLowerCase();
    if (status === 404 || m.includes('not a valid model') || m.includes('no endpoints found')) {
        return 'OpenRouter model not available right now — the app will retry with an alternative free model.';
    }
    if (status === 429 || m.includes('rate') || m.includes('quota')) {
        return 'OpenRouter free-tier daily limit reached. Resets at 00:00 UTC.';
    }
    if (status === 401 || status === 403 || m.includes('invalid') || m.includes('unauthorized')) {
        return 'Invalid OpenRouter API key — please check it in Settings.';
    }
    if (status === 402 || m.includes('insufficient') || m.includes('credit')) {
        return 'OpenRouter requires credits for this model — switching to a free alternative.';
    }
    if (status === 503 || m.includes('overload') || m.includes('unavailable')) {
        return 'OpenRouter upstream is temporarily overloaded. Please try again shortly.';
    }
    return apiMsg ? apiMsg.substring(0, 140) : `OpenRouter request failed (status ${status}).`;
}

function parseTogetherError(status: number, rawBody: string): string {
    let apiMsg = '';
    try {
        const parsed = JSON.parse(rawBody);
        apiMsg = parsed?.error?.message || parsed?.message || '';
    } catch {}
    const m = apiMsg.toLowerCase();
    if (status === 404 || m.includes('model') && m.includes('not found')) {
        return 'Together.ai model not available — the app will retry with an alternative.';
    }
    if (status === 429 || m.includes('rate') || m.includes('quota')) {
        return 'Together.ai free-tier rate limit reached. Please wait a moment.';
    }
    if (status === 401 || status === 403 || m.includes('invalid') || m.includes('unauthorized')) {
        return 'Invalid Together.ai API key — please check it in Settings.';
    }
    if (status === 402 || m.includes('insufficient') || m.includes('credit')) {
        return 'Together.ai free credit exhausted — switching to alternative provider.';
    }
    if (status === 503 || m.includes('overload') || m.includes('unavailable')) {
        return 'Together.ai is temporarily overloaded. Please try again shortly.';
    }
    return apiMsg ? apiMsg.substring(0, 140) : `Together.ai request failed (status ${status}).`;
}

/**
 * Generic OpenAI-compatible chain runner — tries each model in order, moving
 * on when the upstream returns a transient/per-model error so the next free
 * model in the chain gets a chance. Used by OpenRouter and Together.ai which
 * both rotate free models frequently AND share rate-limits across free users.
 *
 * Cyclable statuses (try next model):
 *   404 → model retired / not found
 *   402 → model went paid (free key can't use it)
 *   429 → model rate-limited (shared free pool exhausted for this model)
 *   408 → request timeout
 *   500/502/503/504 → upstream model unavailable
 *
 * Hard-stop statuses (throw immediately, don't waste retries):
 *   400 → bad request (prompt too long, malformed JSON mode, etc.)
 *   401/403 → invalid API key
 *   413 → payload too large
 */
async function callOpenAiCompatChain(
    providerLabel: string,
    url: string,
    apiKey: string,
    modelChain: string[],
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; json?: boolean; maxTokens?: number },
    errorParser: (status: number, body: string) => string,
): Promise<string> {
    const CYCLABLE_STATUSES = new Set([404, 402, 429, 408, 500, 502, 503, 504]);
    let lastErr: any = null;
    for (let i = 0; i < modelChain.length; i++) {
        const model = modelChain[i];
        try {
            const result = await openAiCompatChat(url, apiKey, model, systemPrompt, userPrompt, opts, errorParser);
            if (i > 0) console.info(`[AI] ${providerLabel} fell back to model "${model}" (earlier IDs in chain were unavailable / rate-limited).`);
            return result;
        } catch (err: any) {
            lastErr = err;
            const status = err?.status;
            // Hard-stop on auth / bad-request errors — retrying with another model won't help.
            if (!CYCLABLE_STATUSES.has(status)) {
                console.warn(`[AI] ${providerLabel} model "${model}" returned hard error ${status ?? 'unknown'} — stopping chain.`);
                throw err;
            }
            console.warn(`[AI] ${providerLabel} model "${model}" returned ${status} — trying next in chain.`);
        }
    }
    // Every model in the chain hit a transient/cyclable error.
    const summary = `All ${modelChain.length} ${providerLabel} free models in the chain were unavailable or rate-limited. Last error: ${lastErr?.message ?? 'unknown'}`;
    const wrapped: any = new Error(summary);
    wrapped.status = lastErr?.status;
    wrapped.isUserFacing = true;
    throw wrapped;
}

/**
 * Calls Cerebras with a model-fallback chain. If the configured model 404s
 * (Cerebras occasionally renames models), the next model in the chain is tried
 * automatically. Logs which model ultimately succeeded so users can see it.
 */
async function callCerebrasWithFallback(
    apiKey: string,
    modelChain: string[],
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; json?: boolean; maxTokens?: number }
): Promise<string> {
    let lastErr: any = null;
    for (let i = 0; i < modelChain.length; i++) {
        const model = modelChain[i];
        try {
            const result = await openAiCompatChat(
                CEREBRAS_API_URL, apiKey, model,
                systemPrompt, userPrompt, opts, parseCerebrasError
            );
            if (i > 0) console.info(`[AI] Cerebras fell back to model "${model}" (earlier IDs returned 404).`);
            return result;
        } catch (err: any) {
            lastErr = err;
            // Only try the next model on a 404. All other errors stop the chain.
            if (err?.status !== 404) throw err;
            console.warn(`[AI] Cerebras model "${model}" returned 404 — trying next in chain.`);
        }
    }

    // Every model in the chain 404'd. Probe /v1/models to figure out why:
    //  - 401/403 → the key is invalid (Cerebras returns 404 on chat/completions for bad keys)
    //  - 200    → the key works; pick a chat-capable model from the live list and retry once
    try {
        const probeRes = await fetch('https://api.cerebras.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (probeRes.status === 401 || probeRes.status === 403) {
            const err: any = new Error('Your Cerebras API key appears to be invalid or inactive. Please regenerate it at cloud.cerebras.ai and update Settings.');
            err.isUserFacing = true;
            err.status = probeRes.status;
            throw err;
        }
        if (probeRes.ok) {
            const data = await probeRes.json();
            const ids: string[] = (data?.data || []).map((m: any) => m?.id).filter(Boolean);
            // Prefer Llama chat models, then Qwen, then anything else.
            const pick =
                ids.find(id => /llama.*70b/i.test(id)) ||
                ids.find(id => /llama.*8b/i.test(id))  ||
                ids.find(id => /llama/i.test(id))       ||
                ids.find(id => /qwen/i.test(id))        ||
                ids[0];
            if (pick) {
                console.info(`[AI] Cerebras live model probe — retrying with discovered model "${pick}". Available: ${ids.join(', ')}`);
                return await openAiCompatChat(
                    CEREBRAS_API_URL, apiKey, pick,
                    systemPrompt, userPrompt, opts, parseCerebrasError
                );
            }
            const err: any = new Error('Your Cerebras account has no chat-capable models available. Check cloud.cerebras.ai.');
            err.isUserFacing = true;
            throw err;
        }
        // Non-401, non-OK probe → fall through to the original 404 error.
    } catch (probeErr: any) {
        if (probeErr?.isUserFacing) throw probeErr;
        // network failure on probe — keep original error
    }

    throw lastErr ?? new Error('No Cerebras model in the fallback chain succeeded.');
}

/**
 * Test a provider key end-to-end with a tiny chat request.
 * Returns { ok: true } on success, or { ok: false, error: string } on any failure.
 * Used by the Settings "Test connection" buttons.
 */
export async function testProviderConnection(provider: 'groq' | 'cerebras' | 'openrouter' | 'together'): Promise<{ ok: boolean; error?: string; model?: string }> {
    try {
        if (provider === 'groq') {
            const key = getGroqApiKey();
            await openAiCompatChat(
                GROQ_API_URL, key, GROQ_FAST,
                'You are a connection test.', 'Reply with the single word OK.',
                { temperature: 0, maxTokens: 5 }, parseGroqError
            );
            return { ok: true, model: GROQ_FAST };
        }

        if (provider === 'openrouter') {
            const orKey = getOpenRouterApiKey();
            if (!orKey) return { ok: false, error: 'No OpenRouter key set.' };
            const usedModel = await callOpenAiCompatChain(
                'OpenRouter', OPENROUTER_API_URL, orKey,
                OPENROUTER_FAST_CHAIN,
                'You are a connection test.', 'Reply with the single word OK.',
                { temperature: 0, maxTokens: 5 }, parseOpenRouterError
            ).then(() => OPENROUTER_FAST_CHAIN[0]);
            return { ok: true, model: usedModel };
        }

        if (provider === 'together') {
            const tgKey = getTogetherApiKey();
            if (!tgKey) return { ok: false, error: 'No Together.ai key set.' };
            const usedModel = await callOpenAiCompatChain(
                'Together.ai', TOGETHER_API_URL, tgKey,
                TOGETHER_FAST_CHAIN,
                'You are a connection test.', 'Reply with the single word OK.',
                { temperature: 0, maxTokens: 5 }, parseTogetherError
            ).then(() => TOGETHER_FAST_CHAIN[0]);
            return { ok: true, model: usedModel };
        }

        const cKey = getCerebrasApiKey();
        if (!cKey) return { ok: false, error: 'No Cerebras key set.' };

        // Step 1: probe /v1/models — definitively tells us if the key works at all
        // and gives us the exact list of model IDs this key can use.
        const probeRes = await fetch('https://api.cerebras.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${cKey}` },
        });
        if (probeRes.status === 401 || probeRes.status === 403) {
            return { ok: false, error: 'Key rejected by Cerebras (invalid or inactive). Regenerate it at cloud.cerebras.ai.' };
        }
        if (!probeRes.ok) {
            return { ok: false, error: `Cerebras /v1/models returned ${probeRes.status}. Check your key.` };
        }
        const data = await probeRes.json();
        const ids: string[] = (data?.data || []).map((m: any) => m?.id).filter(Boolean);
        if (!ids.length) {
            return { ok: false, error: 'Key works but your account has no available models. Check cloud.cerebras.ai.' };
        }

        // Step 2: pick a small chat model and verify the chat endpoint actually works.
        const pick =
            ids.find(id => /llama.*8b/i.test(id))  ||
            ids.find(id => /llama.*70b/i.test(id)) ||
            ids.find(id => /llama/i.test(id))      ||
            ids[0];
        await openAiCompatChat(
            CEREBRAS_API_URL, cKey, pick,
            'You are a connection test.', 'Reply with the single word OK.',
            { temperature: 0, maxTokens: 5 }, parseCerebrasError
        );
        return { ok: true, model: pick };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Connection test failed.' };
    }
}

async function retryGroq<T>(fn: () => Promise<T>, retries = 2, delay = 1500): Promise<T> {
    try {
        return await fn();
    } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        const status = e?.status;
        // Don't retry 429 rate-limits here — the UI layer handles those with a
        // proper countdown so the user sees what's happening.
        const isRetryable = (status === 503 || msg.includes('503') || msg.includes('overload') || msg.includes('unavailable'))
            && status !== 429;
        if (retries > 0 && isRetryable) {
            await sleep(delay);
            return retryGroq(fn, retries - 1, delay * 2);
        }
        throw e;
    }
}

/** Fire a single chat request to a generic OpenAI-compatible endpoint */
async function openAiCompatChat(
    url: string,
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; json?: boolean; maxTokens?: number },
    errorParser: (status: number, body: string) => string = parseGroqError
): Promise<string> {
    const body: any = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: opts.temperature ?? 0.5,
        max_tokens: opts.maxTokens ?? 8192,
    };
    if (opts.json) body.response_format = { type: 'json_object' };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        const friendly = errorParser(res.status, text);
        const err: any = new Error(friendly);
        err.status = res.status;
        err.isUserFacing = true;
        // Attach retry-after so the caller can auto-wait and retry
        if (res.status === 429) {
            const raHeader = res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset-requests');
            const raMatch = text.match(/try again in (\d+(?:\.\d+)?)\s*s/i);
            const seconds = raHeader ? parseInt(raHeader) : raMatch ? Math.ceil(Number(raMatch[1])) : null;
            if (seconds) err.retryAfterSeconds = seconds;
        }
        throw err;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Primary AI chat function.
 *
 * As of Apr 2026, the order of preference is:
 *   1. **Cloudflare Workers AI** via the cv-engine-worker tiered LLM endpoint
 *      — the default path. No user API key needed. Uses task-specific models
 *      (Llama 4 Scout, Mistral Small 3.1, etc.) selected by model→task map.
 *   2. **Groq** (only if the worker is unreachable AND the user has a key)
 *      — last-resort fallback for offline/edge-case use.
 *   3. **Cerebras** (only if Groq also fails AND the user has a key) —
 *      automatic fallback when Groq returns 429/503/overload.
 *   4. Friendly error if every path is exhausted.
 *
 * Function name is kept as `groqChat` for backwards compatibility — every
 * existing call site in the codebase flows through here unchanged.
 */
export async function groqChat(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; json?: boolean; maxTokens?: number } = {}
): Promise<string> {

    // ── Postgres response cache (best-effort) ────────────────────────────────
    // Identical low-temperature prompts return instantly without burning
    // any backend's quota. Cache misses fall through to the live calls below;
    // cache failures are silently ignored.
    const effectiveTemp = opts.temperature ?? 0.2;
    const cached = await lookupGroqCache(model, systemPrompt, userPrompt, effectiveTemp);
    if (cached !== null) return cached;

    // ── PRIMARY: Cloudflare Workers AI via cv-engine-worker tiered endpoint ──
    // The vast majority of calls land here. No API key needed. Free for the
    // 8B/Mistral/Hermes models; ~3× cheaper than Groq's paid 70b for Scout 17B.
    if (isCVEngineConfigured()) {
        const workerTask = groqModelToWorkerTask(model);
        try {
            const workerText = await workerTieredLLM(workerTask, userPrompt, {
                system: systemPrompt,
                temperature: opts.temperature,
                json: opts.json,
                maxTokens: opts.maxTokens,
            });
            if (workerText && workerText.length > 0) {
                _lastAiEngine = 'Workers AI';
                _recordProviderResult('Workers AI', 'ok');
                storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, workerText);
                return workerText;
            }
            // Worker returned null (network/timeout/circuit-breaker open) — fall through
            // to legacy Groq/Cerebras path so the user still gets a result if they
            // happen to have a key configured. Most often this is the daily neuron
            // quota being exhausted, so record it as such.
            _recordProviderResult('Workers AI', 'quota_exhausted', { message: 'Worker returned no text (likely daily neuron quota exhausted)' });
            console.warn('[AI] Cloudflare Workers AI tiered call returned no text — checking for legacy fallback keys.');
            // Fire-and-forget re-warm: if the empty text was a cold-model
            // symptom rather than a real quota exhaustion, the next
            // generation will succeed because the model is now loading.
            // Quota-exhausted warm-ups are also harmless (they just return
            // empty themselves and don't burn additional Neurons).
            void rewarmCVEngineModels();
        } catch (workerErr: any) {
            // workerTieredLLM never throws (returns null), but defend in depth.
            _recordProviderResult('Workers AI', _classifyErrorState(workerErr), workerErr);
            console.warn('[AI] Cloudflare Workers AI tiered call threw — checking for legacy fallback keys:', workerErr?.message);
        }
    } else {
        _recordProviderResult('Workers AI', 'no_key');
    }

    // ── FALLBACK: Groq (only when worker unreachable AND user has a key) ─────
    let groqKey: string | null = null;
    try { groqKey = getGroqApiKey(); } catch { /* no key configured */ }

    if (groqKey) {
        try {
            const groqResult = await retryGroq(() =>
                openAiCompatChat(GROQ_API_URL, groqKey!, model, systemPrompt, userPrompt, opts, parseGroqError)
            );
            _lastAiEngine = 'Groq';
            _recordProviderResult('Groq', 'ok');
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, groqResult);
            return groqResult;
        } catch (groqErr: any) {
            const status = groqErr?.status;
            const errMsg = (groqErr?.message || '').toLowerCase();
            _recordProviderResult('Groq', _classifyErrorState(groqErr), groqErr);
            // 413 / "too large" → only large-context providers (Claude 200K, Gemini 1M) can help.
            const isTooLarge = status === 413 || errMsg.includes('too large') || errMsg.includes('too long');
            // For non-retryable errors (400 bad request, 401 invalid key) AND non-too-large,
            // re-throw Groq's specific message immediately — we'd just spam the chain otherwise.
            const isFallbackCandidate = isTooLarge || (
                status === 429 || status === 503 || status == null ||
                !!errMsg.match(/rate|quota|overload|unavailable|limit/)
            );
            if (!isFallbackCandidate) throw groqErr;

            const reason = (groqErr?.message?.substring(0, 80)) ?? `status ${status ?? 'unknown'}`;
            console.warn(`[AI] Groq failed (${reason}) — walking flat fallback chain`);
            const fallback = await runFreeProviderChain(
                model, systemPrompt, userPrompt, opts, effectiveTemp,
                { skipCerebras: isTooLarge }, // Cerebras has Groq-class context limits
            );
            if (fallback !== null) return fallback;
            // Nothing in the chain worked; re-throw the original Groq error so the
            // user sees the most informative message (rate-limit reset time etc.).
            throw groqErr;
        }
    }

    // ── No Groq key (or Groq returned non-fallback error already re-thrown) ──
    // Walk the same flat chain. Cerebras is included here because we never
    // attempted Groq (so context limits aren't an issue we know about).
    const fallback = await runFreeProviderChain(
        model, systemPrompt, userPrompt, opts, effectiveTemp,
        { skipCerebras: false },
    );
    if (fallback !== null) return fallback;

    // ── Every path exhausted ─────────────────────────────────────────────────
    const err: any = new Error(
        'The CV Engine free quota is temporarily exhausted (resets daily). Add a Claude or Gemini key in Settings to keep generating CVs right now.'
    );
    err.isUserFacing = true;
    throw err;
}

/**
 * Flat fallback chain shared by both the "Groq failed" and "no Groq key" paths.
 * Walks Cerebras → OpenRouter → Together.ai → Claude → Gemini in order.
 *
 * For each provider:
 *   - Logs `[AI] Skipping <provider> (no key)` when no key is configured.
 *   - Logs `[AI] Trying <provider>…` before the call.
 *   - Logs `[AI] <provider> failed: <reason>` on error and continues.
 *
 * Returns the first successful result, or `null` if every configured provider
 * failed (the caller decides what error to surface).
 */
async function runFreeProviderChain(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; json?: boolean; maxTokens?: number },
    effectiveTemp: number,
    options: { skipCerebras: boolean },
): Promise<string | null> {
    // 1. Cerebras (skipped on prompt-too-large since context limits match Groq's)
    if (options.skipCerebras) {
        console.info('[AI] Skipping Cerebras (prompt too large — needs 200K+ context)');
    } else {
        const cerebrasKey = getCerebrasApiKey();
        if (!cerebrasKey) {
            console.info('[AI] Skipping Cerebras (no key)');
            _recordProviderResult('Cerebras', 'no_key');
        } else {
            console.info('[AI] Trying Cerebras…');
            try {
                const r = await callCerebrasWithFallback(
                    cerebrasKey, groqModelToCerebrasChain(model),
                    systemPrompt, userPrompt, opts,
                );
                _lastAiEngine = 'Cerebras';
                _recordProviderResult('Cerebras', 'ok');
                storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, r);
                return r;
            } catch (e: any) {
                _recordProviderResult('Cerebras', _classifyErrorState(e), e);
                console.warn('[AI] Cerebras failed:', e?.message ?? e);
            }
        }
    }

    // 2. OpenRouter (skipped on too-large — most free models have <32K context)
    if (options.skipCerebras) {
        console.info('[AI] Skipping OpenRouter (prompt too large — needs 200K+ context)');
    } else {
        const orKey = getOpenRouterApiKey();
        if (!orKey) {
            console.info('[AI] Skipping OpenRouter (no key)');
            _recordProviderResult('OpenRouter', 'no_key');
        } else {
            console.info('[AI] Trying OpenRouter (free tier, separate daily quota)…');
            try {
                const r = await callOpenAiCompatChain(
                    'OpenRouter', OPENROUTER_API_URL, orKey,
                    groqModelToOpenRouterChain(model),
                    systemPrompt, userPrompt, opts, parseOpenRouterError,
                );
                _lastAiEngine = 'OpenRouter';
                _recordProviderResult('OpenRouter', 'ok');
                storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, r);
                return r;
            } catch (e: any) {
                _recordProviderResult('OpenRouter', _classifyErrorState(e), e);
                console.warn('[AI] OpenRouter failed:', e?.message ?? e);
            }
        }
    }

    // 3. Together.ai (skipped on too-large — same reason as OpenRouter)
    if (options.skipCerebras) {
        console.info('[AI] Skipping Together.ai (prompt too large — needs 200K+ context)');
    } else {
        const tgKey = getTogetherApiKey();
        if (!tgKey) {
            console.info('[AI] Skipping Together.ai (no key)');
            _recordProviderResult('Together.ai', 'no_key');
        } else {
            console.info('[AI] Trying Together.ai (free tier, separate daily quota)…');
            try {
                const r = await callOpenAiCompatChain(
                    'Together.ai', TOGETHER_API_URL, tgKey,
                    groqModelToTogetherChain(model),
                    systemPrompt, userPrompt, opts, parseTogetherError,
                );
                _lastAiEngine = 'Together.ai';
                _recordProviderResult('Together.ai', 'ok');
                storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, r);
                return r;
            } catch (e: any) {
                _recordProviderResult('Together.ai', _classifyErrorState(e), e);
                console.warn('[AI] Together.ai failed:', e?.message ?? e);
            }
        }
    }

    // 4. Claude (200K context — handles too-large prompts)
    const clKey = getClaudeApiKey();
    if (!clKey) {
        console.info('[AI] Skipping Claude (no key)');
        _recordProviderResult('Claude', 'no_key');
    } else {
        console.info('[AI] Trying Claude (200K context)…');
        try {
            const r = await claudeChat(systemPrompt, userPrompt, opts);
            _lastAiEngine = 'Claude';
            _recordProviderResult('Claude', 'ok');
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, r);
            return r;
        } catch (e: any) {
            _recordProviderResult('Claude', _classifyErrorState(e), e);
            console.warn('[AI] Claude failed:', e?.message ?? e);
        }
    }

    // 5. Gemini (1M context — last resort)
    const gemKey = getGeminiApiKey();
    if (!gemKey) {
        console.info('[AI] Skipping Gemini (no key)');
        _recordProviderResult('Gemini', 'no_key');
    } else {
        console.info('[AI] Trying Gemini (1M context, last resort)…');
        try {
            const r = await geminiChat(systemPrompt, userPrompt, opts);
            _lastAiEngine = 'Gemini';
            _recordProviderResult('Gemini', 'ok');
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, r);
            return r;
        } catch (e: any) {
            _recordProviderResult('Gemini', _classifyErrorState(e), e);
            console.warn('[AI] Gemini failed:', e?.message ?? e);
        }
    }

    return null;
}

// ── Browser console diagnostic ──────────────────────────────────────────────
// Run `window.__providerStatus()` in DevTools to see, for every provider:
//   • whether a key is configured for this session,
//   • the most recent attempt result (✓ ok / ⏳ never tried / 💸 quota exhausted /
//     🔒 auth failed / ⚠ failed / — no key),
//   • how many times it was attempted, and the last error message if any.
// This is the fastest way to confirm "is OpenRouter actually being skipped, or
// did it fail with a quota error?"
if (typeof window !== 'undefined') {
    const STATE_LABEL: Record<ProviderHealthState, string> = {
        ok:               '✓ OK (last call succeeded)',
        never_tried:      '⏳ Not tried yet this session',
        no_key:           '— No key configured',
        quota_exhausted:  '💸 Quota exhausted / rate-limited',
        auth_failed:      '🔒 Auth failed (bad key)',
        failed:           '⚠ Failed (other error)',
    };
    (window as any).__providerStatus = () => {
        let groqHas = false; try { groqHas = !!getGroqApiKey(); } catch {}
        const haveKey: Record<ProviderName, boolean> = {
            'Workers AI':  isCVEngineConfigured(),
            'Groq':        groqHas,
            'Cerebras':    !!getCerebrasApiKey(),
            'OpenRouter':  !!getOpenRouterApiKey(),
            'Together.ai': !!getTogetherApiKey(),
            'Claude':      !!getClaudeApiKey(),
            'Gemini':      !!getGeminiApiKey(),
        };
        const rows = PROVIDERS.map(name => {
            const h = _providerHealth[name];
            // If a key was just removed but the cached state is stale, prefer 'no_key'.
            const effectiveState: ProviderHealthState =
                !haveKey[name] ? 'no_key' : h.state;
            return {
                provider: name,
                key: haveKey[name] ? '✓ configured' : '— missing',
                status: STATE_LABEL[effectiveState],
                attempts: h.attempts,
                lastError: h.lastError ?? '',
            };
        });
        console.group('%cAI provider health', 'font-weight:bold;color:#2563eb');
        console.table(rows);
        console.info('Last engine used:', _lastAiEngine ?? '(none yet this session)');
        console.info('Fallback order  : Workers AI → Groq → Cerebras → OpenRouter → Together.ai → Claude → Gemini');
        console.groupEnd();
        return {
            lastEngineUsed: _lastAiEngine,
            providers: rows,
            fallbackOrder: 'Workers AI → Groq → Cerebras → OpenRouter → Together.ai → Claude → Gemini',
        };
    };
}
