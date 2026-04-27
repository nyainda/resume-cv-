import { getGroqKey as _rtGroq, getCerebrasKey as _rtCerebras, getGeminiKey as _rtGemini } from './security/RuntimeKeys';
import { lookupGroqCache, storeGroqCache } from './groqCacheClient';
import { workerTieredLLM, isCVEngineConfigured } from './cvEngineClient';
import { GoogleGenAI } from '@google/genai';

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

const GROQ_API_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';

export const GROQ_LARGE = 'llama-3.3-70b-versatile';
export const GROQ_FAST  = 'llama-3.1-8b-instant';

// Cerebras model equivalents (same Llama family, OpenAI-compatible format).
// Each entry is a fallback chain — Cerebras occasionally renames models, so we
// try the most current ID first and fall back to older aliases on 404.
const CEREBRAS_LARGE_CHAIN = ['llama-3.3-70b', 'llama3.3-70b', 'llama-4-scout-17b-16e-instruct'];
const CEREBRAS_FAST_CHAIN  = ['llama3.1-8b', 'llama-3.1-8b'];

function groqModelToCerebrasChain(groqModel: string): string[] {
    if (groqModel === GROQ_LARGE) return CEREBRAS_LARGE_CHAIN;
    if (groqModel === GROQ_FAST)  return CEREBRAS_FAST_CHAIN;
    return CEREBRAS_FAST_CHAIN;
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

/** True when at least one text-generation key is available */
export function hasAnyLlmKey(): boolean {
    return hasGroqKey() || hasCerebrasKey();
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
export async function testProviderConnection(provider: 'groq' | 'cerebras'): Promise<{ ok: boolean; error?: string; model?: string }> {
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
                storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, workerText);
                return workerText;
            }
            // Worker returned null (network/timeout/circuit-breaker open) — fall through
            // to legacy Groq/Cerebras path so the user still gets a result if they
            // happen to have a key configured.
            console.warn('[AI] Cloudflare Workers AI tiered call returned no text — checking for legacy fallback keys.');
        } catch (workerErr: any) {
            // workerTieredLLM never throws (returns null), but defend in depth.
            console.warn('[AI] Cloudflare Workers AI tiered call threw — checking for legacy fallback keys:', workerErr?.message);
        }
    }

    // ── FALLBACK: Groq (only when worker unreachable AND user has a key) ─────
    let groqKey: string | null = null;
    try { groqKey = getGroqApiKey(); } catch { /* no key configured */ }

    if (groqKey) {
        try {
            const groqResult = await retryGroq(() =>
                openAiCompatChat(GROQ_API_URL, groqKey!, model, systemPrompt, userPrompt, opts, parseGroqError)
            );
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, groqResult);
            return groqResult;
        } catch (groqErr: any) {
            const status = groqErr?.status;
            // Only fall back to Cerebras for transient errors (rate limits, quota, overload).
            // For 400 (bad request) or 401 (invalid key) keep the specific Groq error message.
            const errMsg = (groqErr?.message || '').toLowerCase();
            // 413 / "too large" → Cerebras can't help (same context limits). Don't fall back.
            const isTooLarge = status === 413 || errMsg.includes('too large') || errMsg.includes('too long');
            const isFallbackCandidate = !isTooLarge && (
                status === 429 || status === 503 || status == null ||
                errMsg.match(/rate|quota|overload|unavailable|limit/)
            );

            const cerebrasKey = isFallbackCandidate ? getCerebrasApiKey() : null;
            if (cerebrasKey) {
                const reason = groqErr?.message?.substring(0, 80) ?? `status ${status ?? 'unknown'}`;
                console.warn(`[AI] Groq failed (${reason}) — falling back to Cerebras`);
                try {
                    const cbResult = await callCerebrasWithFallback(
                        cerebrasKey, groqModelToCerebrasChain(model),
                        systemPrompt, userPrompt, opts
                    );
                    storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, cbResult);
                    return cbResult;
                } catch (cerebrasErr: any) {
                    // Both providers failed — surface a clear combined error
                    const err: any = new Error(
                        'Both Groq and Cerebras are currently unavailable. Please try again in a minute.'
                    );
                    err.isUserFacing = true;
                    throw err;
                }
            }
            // For 413 (prompt too large for Groq), try Gemini — it handles up to 1M tokens
            if (isTooLarge) {
                const gemKey = getGeminiApiKey();
                if (gemKey) {
                    console.info('[AI] Groq 413 (content too large) — falling back to Gemini (1M token context)');
                    try {
                        const gemResult = await geminiChat(systemPrompt, userPrompt, opts);
                        storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, gemResult);
                        return gemResult;
                    } catch { /* fall through to re-throw Groq error */ }
                }
            }
            // No Cerebras key and no viable fallback — re-throw the Groq error
            throw groqErr;
        }
    }

    // ── No Groq key — try Cerebras as primary ────────────────────────────────
    const cerebrasKey = getCerebrasApiKey();
    if (cerebrasKey) {
        console.info('[AI] No Groq key configured — using Cerebras as primary provider');
        try {
            const cbResult = await callCerebrasWithFallback(
                cerebrasKey, groqModelToCerebrasChain(model),
                systemPrompt, userPrompt, opts
            );
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, cbResult);
            return cbResult;
        } catch (cerebrasErr: any) {
            if (cerebrasErr?.isUserFacing) throw cerebrasErr;
            const err: any = new Error('Cerebras AI request failed. Please check your key in Settings.');
            err.isUserFacing = true;
            throw err;
        }
    }

    // ── Gemini fallback (Workers AI quota exhausted, no Groq/Cerebras key) ───
    // Gemini is already used for profile import, so the user very likely has
    // a key configured. Use it as the last-resort backend so CV generation
    // still works even when the Workers AI free tier runs out for the day.
    const geminiKey = getGeminiApiKey();
    if (geminiKey) {
        console.info('[AI] Workers AI quota exhausted & no Groq key — falling back to Gemini');
        try {
            const geminiResult = await geminiChat(systemPrompt, userPrompt, opts);
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, geminiResult);
            return geminiResult;
        } catch (geminiErr: any) {
            if (geminiErr?.isUserFacing) throw geminiErr;
            const err: any = new Error(
                `Gemini fallback failed: ${geminiErr?.message ?? 'unknown error'}. Please check your Gemini key in Settings.`
            );
            err.isUserFacing = true;
            throw err;
        }
    }

    // ── Every path exhausted ─────────────────────────────────────────────────
    const err: any = new Error(
        'The CV Engine is temporarily over its daily free quota. It resets each day — or add a Gemini key in Settings to continue generating CVs right now.'
    );
    err.isUserFacing = true;
    throw err;
}
