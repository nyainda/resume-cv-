import { getGeminiKey as _rtGemini, getClaudeKey as _rtClaude } from './security/RuntimeKeys';
import { lookupGroqCache, storeGroqCache } from './groqCacheClient';
import { workerTieredLLM, workerProxyLLM, workerProxyStream, workerTieredLLMStream, isCVEngineConfigured } from './cvEngineClient';

// ── Active AI engine tracker ──────────────────────────────────────────────────
let _lastAiEngine: string = 'Workers AI';
export function getLastAiEngine(): string { return _lastAiEngine; }

// ── Session token usage tracker ───────────────────────────────────────────────
// Uses character-based estimation: 1 token ≈ 4 characters (GPT-4 average).
// Not exact — real counts vary by model and content — but good enough for
// budget awareness. Counts reset when the page is reloaded.

export interface SessionTokenUsage {
    inputTokensEst:  number;  // estimated prompt tokens this session
    outputTokensEst: number;  // estimated completion tokens this session
    callCount:       number;  // total groqChat calls this session
}

export const TOKEN_USAGE_EVENT = 'procv:token-usage';

const _usage: SessionTokenUsage = { inputTokensEst: 0, outputTokensEst: 0, callCount: 0 };

function _trackTokens(system: string, user: string, output: string): void {
    _usage.inputTokensEst  += Math.ceil((system.length + user.length) / 4);
    _usage.outputTokensEst += Math.ceil(output.length / 4);
    _usage.callCount       += 1;
    if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent<SessionTokenUsage>(TOKEN_USAGE_EVENT, { detail: { ..._usage } })); } catch { /* ignore */ }
    }
}

export function getSessionTokenUsage(): Readonly<SessionTokenUsage> { return { ..._usage }; }

export function resetSessionTokenUsage(): void {
    _usage.inputTokensEst = 0;
    _usage.outputTokensEst = 0;
    _usage.callCount = 0;
    if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent<SessionTokenUsage>(TOKEN_USAGE_EVENT, { detail: { ..._usage } })); } catch { /* ignore */ }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Three providers — exactly what is configured in Settings.
//
//   1. Workers AI  (Cloudflare) — no user key needed
//   2. Claude      — user's Claude API key from Settings → AI Keys
//   3. Gemini      — user's Gemini API key from Settings → AI Keys
//
// The selected provider is used exclusively.  If it fails, a clear error is
// thrown — there is no automatic fallback to another provider.
//
// GROQ_LARGE / GROQ_FAST are kept as string-constant stubs so existing
// call-sites compile unchanged.  They are not used for routing any more.
// ─────────────────────────────────────────────────────────────────────────────

function groqModelToWorkerTask(model: string): string {
    if (model === 'llama-3.3-70b-versatile') return 'cvGenerate';
    if (model === 'llama-3.1-8b-instant')    return 'general';
    return 'general';
}

export const GROQ_LARGE = 'llama-3.3-70b-versatile';
export const GROQ_FAST  = 'llama-3.1-8b-instant';

// ── Selected AI provider ──────────────────────────────────────────────────────
export type AiProvider = 'workers-ai' | 'claude' | 'gemini';

const _AI_PROVIDER_KEY = 'cv_builder:aiProvider';

export function getSelectedProvider(): AiProvider {
    try {
        const v = localStorage.getItem(_AI_PROVIDER_KEY);
        if (v === 'claude' || v === 'gemini' || v === 'workers-ai') return v;
        // Derive from which key is configured if never explicitly set
        if (getClaudeApiKey()) return 'claude';
        if (getGeminiApiKey()) return 'gemini';
    } catch { /* ignore */ }
    return 'workers-ai';
}

export function setSelectedProvider(p: AiProvider): void {
    try { localStorage.setItem(_AI_PROVIDER_KEY, p); } catch { /* ignore */ }
}

// ── Prompt Vault stubs (no-op — worker injects system prompts internally) ─────
export function registerSystemTemplate(_template: string, _key: string): void { /* no-op */ }
export function getSystemTemplateKey(_template: string): string | undefined { return undefined; }

// ── Per-provider health tracker ───────────────────────────────────────────────
export type ProviderHealthState =
    | 'never_tried'
    | 'ok'
    | 'no_key'
    | 'quota_exhausted'
    | 'auth_failed'
    | 'failed';

interface ProviderHealth {
    state: ProviderHealthState;
    lastError?: string;
    lastAttemptAt?: number;
    attempts: number;
}

// ── Provider events ───────────────────────────────────────────────────────────
export const PROVIDER_CHAIN_EVENT  = 'procv:provider-chain';
export const PROVIDER_TRYING_EVENT = 'procv:provider-trying';

export interface ProviderTryingPayload {
    label: string;
    type: 'single' | 'race' | 'retry';
    retryAfterSeconds?: number;
}

function _dispatchTrying(payload: ProviderTryingPayload): void {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent<ProviderTryingPayload>(PROVIDER_TRYING_EVENT, { detail: payload }));
    } catch { /* ignore */ }
}

export interface ProviderChainEntry {
    name: string;
    state: ProviderHealthState;
    hasKey: boolean;
    lastError?: string;
    attempts: number;
}

export interface ProviderChainStatus {
    providers: ProviderChainEntry[];
    lastEngineUsed: string;
    timestamp: number;
}

const PROVIDERS = ['Workers AI', 'Claude', 'Gemini'] as const;
type ProviderName = typeof PROVIDERS[number];

const _providerHealth: Record<ProviderName, ProviderHealth> = {
    'Workers AI': { state: 'never_tried', attempts: 0 },
    'Claude':     { state: 'never_tried', attempts: 0 },
    'Gemini':     { state: 'never_tried', attempts: 0 },
};

function _classifyErrorState(err: any): ProviderHealthState {
    const status = err?.status ?? err?.upstreamStatus;
    const msg = (err?.message || '').toLowerCase();
    if (status === 401 || status === 403 || /invalid.*key|unauthor|forbidden/.test(msg)) return 'auth_failed';
    if (status === 429 || status === 402 || /rate.?limit|quota|daily.*allocation|exhaust|neuron|too many/.test(msg)) return 'quota_exhausted';
    return 'failed';
}

function _buildChainStatus(): ProviderChainStatus {
    const haveKey: Record<ProviderName, boolean> = {
        'Workers AI': isCVEngineConfigured(),
        'Claude':     !!getClaudeApiKey(),
        'Gemini':     !!getGeminiApiKey(),
    };
    return {
        providers: PROVIDERS.map(name => {
            const h = _providerHealth[name];
            return {
                name,
                state: !haveKey[name] ? 'no_key' : h.state,
                hasKey: haveKey[name],
                lastError: h.lastError,
                attempts: h.attempts,
            };
        }),
        lastEngineUsed: _lastAiEngine,
        timestamp: Date.now(),
    };
}

export function getProviderChainStatus(): ProviderChainStatus {
    return _buildChainStatus();
}

function _recordProviderResult(name: ProviderName, state: ProviderHealthState, err?: any): void {
    const h = _providerHealth[name];
    h.state = state;
    h.lastAttemptAt = Date.now();
    if (state !== 'no_key' && state !== 'never_tried') h.attempts += 1;
    h.lastError = err?.message ? String(err.message).substring(0, 120) : undefined;
    if (typeof window !== 'undefined') {
        try {
            window.dispatchEvent(new CustomEvent<ProviderChainStatus>(
                PROVIDER_CHAIN_EVENT, { detail: _buildChainStatus() }
            ));
        } catch { /* ignore */ }
    }
}

// ── Key helpers ───────────────────────────────────────────────────────────────
export function getGeminiApiKey(): string | null {
    const rt = _rtGemini();
    if (rt) return rt;
    try {
        const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (s) {
            const p = JSON.parse(s);
            if (p.apiKey && !p.apiKey.startsWith('enc:v1:')) return p.apiKey.replace(/^"|"$/g, '');
        }
        const pk = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
        if (pk.gemini && !pk.gemini.startsWith('enc:v1:')) return pk.gemini.replace(/^"|"$/g, '');
    } catch { /* ignore */ }
    return null;
}

export function getClaudeApiKey(): string | null {
    const rt = _rtClaude();
    if (rt) return rt;
    try {
        const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (s) {
            const p = JSON.parse(s);
            if (p.claudeApiKey && !p.claudeApiKey.startsWith('enc:v1:')) return p.claudeApiKey.replace(/^"|"$/g, '');
        }
    } catch { /* ignore */ }
    return null;
}

/** True when at least one key-requiring provider is configured, or Workers AI is set up. */
export function hasAnyLlmKey(): boolean {
    return isCVEngineConfigured() || !!getClaudeApiKey() || !!getGeminiApiKey();
}

/**
 * Route a Claude or Gemini call through the CF Worker proxy.
 * Used by call-sites that need a direct proxy call without going through groqChat.
 */
export async function callProviderViaProxy(
    provider: 'claude' | 'gemini',
    apiKey: string,
    _systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; maxTokens?: number; json?: boolean; task?: string } = {},
): Promise<string> {
    const result = await workerProxyLLM(opts.task || 'general', userPrompt, {
        provider,
        apiKey,
        temperature: opts.temperature,
        maxTokens:   opts.maxTokens,
        json:        opts.json,
    });
    if (!result) throw new Error(`${provider} proxy returned no text`);
    return result;
}

/**
 * Route a Claude multimodal (image / PDF) call through the CF Worker proxy.
 */
export async function callProviderViaProxyMultimodal(
    apiKey: string,
    base64Data: string,
    mimeType: string,
    textPrompt: string,
    opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
    const { workerProxyMultimodal } = await import('./cvEngineClient');
    const result = await workerProxyMultimodal(apiKey, base64Data, mimeType, textPrompt, {
        temperature: opts.temperature ?? 0.1,
        maxTokens:   opts.maxTokens   ?? 4096,
    });
    if (!result) throw new Error('Claude multimodal proxy returned no text');
    return result;
}

/**
 * Test a provider connection end-to-end via the CF Worker proxy.
 */
export async function testProviderConnection(
    provider: 'claude' | 'gemini',
): Promise<{ ok: boolean; error?: string; model?: string }> {
    try {
        const key = provider === 'claude' ? getClaudeApiKey() : getGeminiApiKey();
        if (!key) return { ok: false, error: `No ${provider === 'claude' ? 'Claude' : 'Gemini'} API key configured.` };
        const result = await workerProxyLLM('general', 'Reply with the single word OK.', {
            provider,
            apiKey: key,
            temperature: 0,
            maxTokens: 10,
            timeoutMs: 12_000,
        });
        if (!result) return { ok: false, error: 'Worker proxy returned no text.' };
        return { ok: true, model: provider === 'claude' ? 'claude-haiku-4-5-20251001' : 'gemini-2.0-flash' };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Connection test failed.' };
    }
}

/**
 * Primary AI text generation function.
 *
 * Uses ONLY the provider selected in Settings — no automatic fallback.
 * If the selected provider fails, a clear user-facing error is thrown.
 *
 * Providers (configured in Settings → AI Provider):
 *   • Workers AI  — Cloudflare, free, no user key needed
 *   • Claude      — user's Anthropic key
 *   • Gemini      — user's Google key
 */
export async function groqChat(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; json?: boolean; maxTokens?: number; task?: string } = {}
): Promise<string> {
    const provider    = getSelectedProvider();
    const effectiveTemp = opts.temperature ?? 0.2;
    const proxyTask   = opts.task || groqModelToWorkerTask(model);

    // ── Cache lookup ──────────────────────────────────────────────────────────
    const cached = await lookupGroqCache(model, systemPrompt, userPrompt, effectiveTemp);
    if (cached !== null) return cached;

    // ── Workers AI ────────────────────────────────────────────────────────────
    if (provider === 'workers-ai') {
        if (!isCVEngineConfigured()) {
            const err: any = new Error(
                'Workers AI is not configured. Go to Settings → AI Provider and set your CV Engine URL, or switch to Claude or Gemini.'
            );
            err.isUserFacing = true;
            throw err;
        }
        _dispatchTrying({ label: 'Workers AI', type: 'single' });
        try {
            const text = await workerTieredLLM(proxyTask, userPrompt, {
                temperature: opts.temperature,
                json:        opts.json,
                maxTokens:   opts.maxTokens,
            });
            if (!text || text.length === 0) {
                _recordProviderResult('Workers AI', 'quota_exhausted', { message: 'Worker returned no text (daily quota may be exhausted)' });
                const err: any = new Error(
                    'Workers AI returned no response. The free daily quota may be exhausted — it resets at 00:00 UTC. ' +
                    'Switch to Claude or Gemini in Settings → AI Provider to continue.'
                );
                err.isUserFacing = true;
                throw err;
            }
            _lastAiEngine = 'Workers AI';
            _recordProviderResult('Workers AI', 'ok');
            _trackTokens(systemPrompt, userPrompt, text);
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, text);
            return text;
        } catch (e: any) {
            if (e?.isUserFacing) throw e;
            _recordProviderResult('Workers AI', _classifyErrorState(e), e);
            const err: any = new Error(
                `Workers AI failed: ${e?.message || 'unknown error'}. Check your CV Engine URL in Settings or switch to Claude/Gemini.`
            );
            err.isUserFacing = true;
            throw err;
        }
    }

    // ── Claude ────────────────────────────────────────────────────────────────
    if (provider === 'claude') {
        const key = getClaudeApiKey();
        if (!key) {
            const err: any = new Error('No Claude API key configured. Go to Settings → AI Keys to add your Anthropic API key.');
            err.isUserFacing = true;
            throw err;
        }
        _dispatchTrying({ label: 'Claude', type: 'single' });
        try {
            const r = await workerProxyLLM(proxyTask, userPrompt, {
                provider:    'claude',
                apiKey:      key,
                temperature: opts.temperature,
                maxTokens:   opts.maxTokens ?? 8192,
                json:        opts.json,
                timeoutMs:   90_000,
            });
            if (!r) {
                const err: any = new Error(
                    isCVEngineConfigured()
                        ? 'Claude did not return a response. The request may have timed out or your CV is very large — please try again, or reduce the number of roles.'
                        : 'Claude proxy requires a configured CV Engine URL. Go to Settings → AI Provider.'
                );
                err.isUserFacing = true;
                throw err;
            }
            _lastAiEngine = 'Claude';
            _recordProviderResult('Claude', 'ok');
            _trackTokens(systemPrompt, userPrompt, r);
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, r);
            return r;
        } catch (e: any) {
            if (e?.isUserFacing) throw e;
            const errState = _classifyErrorState(e);
            _recordProviderResult('Claude', errState, e);
            const hint = errState === 'auth_failed'
                ? 'Your Claude API key appears to be invalid. Update it in Settings → AI Keys.'
                : errState === 'quota_exhausted'
                ? 'Claude rate limit hit. Wait a moment or switch to a different provider in Settings → AI Provider.'
                : `Claude failed: ${e?.message || 'unknown error'}`;
            const err: any = new Error(hint);
            err.isUserFacing = true;
            throw err;
        }
    }

    // ── Gemini ────────────────────────────────────────────────────────────────
    if (provider === 'gemini') {
        const key = getGeminiApiKey();
        if (!key) {
            const err: any = new Error('No Gemini API key configured. Go to Settings → AI Keys to add your Google API key.');
            err.isUserFacing = true;
            throw err;
        }
        _dispatchTrying({ label: 'Gemini', type: 'single' });
        try {
            const r = await workerProxyLLM(proxyTask, userPrompt, {
                provider:    'gemini',
                apiKey:      key,
                temperature: opts.temperature,
                maxTokens:   opts.maxTokens ?? 8192,
                json:        opts.json,
                timeoutMs:   55_000,
            });
            if (!r) throw new Error('Gemini proxy returned no text');
            _lastAiEngine = 'Gemini';
            _recordProviderResult('Gemini', 'ok');
            _trackTokens(systemPrompt, userPrompt, r);
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, r);
            return r;
        } catch (e: any) {
            if (e?.isUserFacing) throw e;
            const errState = _classifyErrorState(e);
            _recordProviderResult('Gemini', errState, e);
            const hint = errState === 'auth_failed'
                ? 'Your Gemini API key appears to be invalid. Update it in Settings → AI Keys.'
                : errState === 'quota_exhausted'
                ? 'Gemini rate limit hit. Wait a moment or switch to a different provider in Settings → AI Provider.'
                : `Gemini failed: ${e?.message || 'unknown error'}`;
            const err: any = new Error(hint);
            err.isUserFacing = true;
            throw err;
        }
    }

    // Should never reach here — getSelectedProvider() always returns one of the three above
    const err: any = new Error('No AI provider selected. Go to Settings → AI Provider to configure one.');
    err.isUserFacing = true;
    throw err;
}

// ─────────────────────────────────────────────────────────────────────────────
// groqChatStream — streaming variant of groqChat.
//
// When the active provider is 'claude', opens a server-sent-events stream
// through the CF Worker proxy and calls onChunk for each text delta so the UI
// can display tokens as they arrive.  For 'workers-ai' and 'gemini' there is
// no streaming proxy yet — they fall back to the regular non-streaming call
// and call onChunk once with the full response.
//
// Returns the complete accumulated text (same contract as groqChat).
// ─────────────────────────────────────────────────────────────────────────────
export async function groqChatStream(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    onChunk: (delta: string) => void,
    opts: { temperature?: number; maxTokens?: number; task?: string } = {},
): Promise<string> {
    const provider    = getSelectedProvider();
    const effectiveTemp = opts.temperature ?? 0.2;
    const proxyTask   = opts.task || groqModelToWorkerTask(model);

    // ── Cache lookup (same as groqChat) ──────────────────────────────────────
    const cached = await lookupGroqCache(model, systemPrompt, userPrompt, effectiveTemp);
    if (cached !== null) {
        // Simulate streaming for cache hits so the caller's UI feels consistent.
        const chunkSize = 20;
        for (let i = 0; i < cached.length; i += chunkSize) {
            onChunk(cached.slice(i, i + chunkSize));
            await new Promise(r => setTimeout(r, 8));
        }
        return cached;
    }

    // ── Claude — real SSE stream ──────────────────────────────────────────────
    if (provider === 'claude') {
        const key = getClaudeApiKey();
        if (!key) {
            const err: any = new Error('No Claude API key configured. Go to Settings → AI Keys to add your Anthropic API key.');
            err.isUserFacing = true;
            throw err;
        }
        _dispatchTrying({ label: 'Claude (stream)', type: 'single' });
        try {
            const text = await workerProxyStream(proxyTask, userPrompt, {
                provider:    'claude',
                apiKey:      key,
                temperature: opts.temperature,
                maxTokens:   opts.maxTokens,
                timeoutMs:   60_000,
                onChunk,
            });
            if (!text) throw new Error('Claude stream returned no text');
            _lastAiEngine = 'Claude';
            _recordProviderResult('Claude', 'ok');
            _trackTokens(systemPrompt, userPrompt, text);
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, text);
            return text;
        } catch (e: any) {
            if (e?.isUserFacing) throw e;
            const errState = _classifyErrorState(e);
            _recordProviderResult('Claude', errState, e);
            const hint = errState === 'auth_failed'
                ? 'Your Claude API key appears to be invalid. Update it in Settings → AI Keys.'
                : errState === 'quota_exhausted'
                ? 'Claude rate limit hit. Wait a moment or switch to a different provider in Settings → AI Provider.'
                : `Claude stream failed: ${e?.message || 'unknown error'}`;
            const err: any = new Error(hint);
            err.isUserFacing = true;
            throw err;
        }
    }

    // ── Workers AI — real SSE streaming through /api/cv/tiered-llm ──────────
    if (provider === 'workers-ai') {
        if (!isCVEngineConfigured()) {
            const err: any = new Error('Workers AI is not configured. Check your CV Engine URL in Settings → AI Keys.');
            err.isUserFacing = true;
            throw err;
        }
        _dispatchTrying({ label: 'Workers AI (stream)', type: 'single' });
        try {
            const text = await workerTieredLLMStream(proxyTask, userPrompt, {
                temperature: opts.temperature,
                maxTokens:   opts.maxTokens,
                timeoutMs:   60_000,
                onChunk,
            });
            if (!text) throw new Error('Workers AI stream returned no text');
            _lastAiEngine = 'Workers AI';
            _recordProviderResult('Workers AI', 'ok');
            _trackTokens(systemPrompt, userPrompt, text);
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, text);
            return text;
        } catch (e: any) {
            if (e?.isUserFacing) throw e;
            _recordProviderResult('Workers AI', _classifyErrorState(e), e);
            // Fall through to groqChat fallback
        }
    }

    // ── Gemini — real SSE streaming through /api/cv/proxy-llm ───────────────
    if (provider === 'gemini') {
        const key = getGeminiApiKey();
        if (!key) {
            const err: any = new Error('No Gemini API key configured. Go to Settings → AI Keys.');
            err.isUserFacing = true;
            throw err;
        }
        _dispatchTrying({ label: 'Gemini (stream)', type: 'single' });
        try {
            const text = await workerProxyStream(proxyTask, userPrompt, {
                provider:    'gemini',
                apiKey:      key,
                temperature: opts.temperature,
                maxTokens:   opts.maxTokens,
                timeoutMs:   60_000,
                onChunk,
            });
            if (!text) throw new Error('Gemini stream returned no text');
            _lastAiEngine = 'Gemini';
            _recordProviderResult('Gemini', 'ok');
            _trackTokens(systemPrompt, userPrompt, text);
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, text);
            return text;
        } catch (e: any) {
            if (e?.isUserFacing) throw e;
            const errState = _classifyErrorState(e);
            _recordProviderResult('Gemini', errState, e);
            const hint = errState === 'auth_failed'
                ? 'Your Gemini API key appears to be invalid. Update it in Settings → AI Keys.'
                : errState === 'quota_exhausted'
                ? 'Gemini rate limit hit. Wait a moment or switch providers in Settings → AI Provider.'
                : `Gemini stream failed: ${e?.message || 'unknown error'}`;
            const err: any = new Error(hint);
            err.isUserFacing = true;
            throw err;
        }
    }

    // ── Fallback — groqChat (handles Groq + provider chain) ─────────────────
    const text = await groqChat(model, systemPrompt, userPrompt, opts);
    onChunk(text);
    return text;
}

// ── DevTools diagnostic ───────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    const STATE_LABEL: Record<ProviderHealthState, string> = {
        ok:              '✓ OK (last call succeeded)',
        never_tried:     '⏳ Not tried yet this session',
        no_key:          '— No key configured',
        quota_exhausted: '💸 Quota exhausted / rate-limited',
        auth_failed:     '🔒 Auth failed (bad key)',
        failed:          '⚠ Failed (other error)',
    };
    (window as any).__providerStatus = () => {
        const haveKey: Record<ProviderName, boolean> = {
            'Workers AI': isCVEngineConfigured(),
            'Claude':     !!getClaudeApiKey(),
            'Gemini':     !!getGeminiApiKey(),
        };
        const rows = PROVIDERS.map(name => {
            const h = _providerHealth[name];
            const effectiveState: ProviderHealthState = !haveKey[name] ? 'no_key' : h.state;
            return {
                provider:  name,
                key:       haveKey[name] ? '✓ configured' : '— missing',
                status:    STATE_LABEL[effectiveState],
                attempts:  h.attempts,
                lastError: h.lastError ?? '',
            };
        });
        console.group('%cAI provider status', 'font-weight:bold;color:#2563eb');
        console.table(rows);
        console.info('Selected provider :', getSelectedProvider());
        console.info('Last engine used  :', _lastAiEngine ?? '(none yet)');
        console.info('No automatic fallback — selected provider is used exclusively.');
        console.groupEnd();
        return { selectedProvider: getSelectedProvider(), lastEngineUsed: _lastAiEngine, providers: rows };
    };
}
