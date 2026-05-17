import { getGeminiKey as _rtGemini, getClaudeKey as _rtClaude } from './security/RuntimeKeys';
import { lookupGroqCache, storeGroqCache } from './groqCacheClient';
import { workerTieredLLM, workerProxyLLM, isCVEngineConfigured } from './cvEngineClient';

// ── Active AI engine tracker ──────────────────────────────────────────────────
let _lastAiEngine: string = 'Workers AI';
export function getLastAiEngine(): string { return _lastAiEngine; }

// ─────────────────────────────────────────────────────────────────────────────
// Provider chain: Workers AI → Claude (proxy) → Gemini (proxy)
//
// All text-generation throughout the codebase flows through groqChat().
// Priority order:
//   1. Cloudflare Workers AI  — free, no user key needed, rules injected internally
//   2. Claude (via CF Worker proxy) — user's key, rules injected server-side
//   3. Gemini (via CF Worker proxy) — user's key, rules injected server-side
//
// Neither Claude nor Gemini are called directly from the browser any more.
// GROQ_LARGE / GROQ_FAST are kept as exported string constants so every
// existing call-site compiles unchanged — they are capability-tier labels.
// ─────────────────────────────────────────────────────────────────────────────

function groqModelToWorkerTask(model: string): string {
    if (model === 'llama-3.3-70b-versatile') return 'cvGenerate';
    if (model === 'llama-3.1-8b-instant')    return 'general';
    return 'general';
}

export const GROQ_LARGE = 'llama-3.3-70b-versatile';
export const GROQ_FAST  = 'llama-3.1-8b-instant';

// ── Backward-compat stubs ─────────────────────────────────────────────────────
export function hasGroqKey(): boolean { return false; }
export function getGroqApiKey(): string {
    throw new Error('Groq API has been removed. Use CV Engine (Workers AI), Claude, or Gemini.');
}

/** True when Claude or Gemini keys are present (Workers AI needs no key at all) */
export function hasAnyLlmKey(): boolean {
    return !!getClaudeApiKey() || !!getGeminiApiKey();
}

// ── Selected AI provider ──────────────────────────────────────────────────────
// Persisted in localStorage so Settings and generation code share one source.
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

// ── Prompt Vault ──────────────────────────────────────────────────────────────
// No-op stubs kept for backward compatibility.  Now that the worker injects
// system prompts internally, templates no longer need to be registered on the
// client side.
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

// ── Preferred fallback provider ───────────────────────────────────────────────
function getPreferredFallback(): 'claude' | 'gemini' {
    try {
        const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (s) {
            const p = JSON.parse(s);
            if (p.preferredFallback === 'gemini') return 'gemini';
        }
    } catch { /* ignore */ }
    return 'claude';
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

/**
 * Route a single Claude or Gemini call through the CF Worker proxy.
 * The worker injects the correct system prompt for the given task internally.
 * Used directly by geminiService.ts call-sites that need a one-shot proxy call
 * without going through the full Workers-AI→proxy fallback chain.
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
 * Route a Claude multimodal (image / PDF base64) call through the CF Worker proxy.
 * Avoids the CORS block that occurs when the browser calls Anthropic's API directly.
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
 * Returns { ok: true, model } on success, or { ok: false, error } on failure.
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
        return { ok: true, model: provider === 'claude' ? 'claude-haiku-4-5' : 'gemini-2.0-flash' };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Connection test failed.' };
    }
}

/**
 * Primary AI chat function.
 *
 * Provider chain (in order):
 *   1. Cloudflare Workers AI  — free, no user key needed
 *   2. Claude via CF Worker proxy — user's Claude key, system injected server-side
 *   3. Gemini via CF Worker proxy — user's Gemini key, system injected server-side
 *
 * Function name preserved as `groqChat` for backward compatibility.
 * The optional `opts.task` tells the proxy which internal system prompt to use.
 */
export async function groqChat(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; json?: boolean; maxTokens?: number; task?: string } = {}
): Promise<string> {
    const effectiveTemp = opts.temperature ?? 0.2;

    // ── Cache lookup ──────────────────────────────────────────────────────────
    const cached = await lookupGroqCache(model, systemPrompt, userPrompt, effectiveTemp);
    if (cached !== null) return cached;

    // ── PRIMARY: Cloudflare Workers AI ────────────────────────────────────────
    if (isCVEngineConfigured()) {
        const workerTask = opts.task || groqModelToWorkerTask(model);
        _dispatchTrying({ label: 'Workers AI', type: 'single' });
        try {
            const workerText = await workerTieredLLM(workerTask, userPrompt, {
                temperature: opts.temperature,
                json:        opts.json,
                maxTokens:   opts.maxTokens,
            });
            if (workerText && workerText.length > 0) {
                _lastAiEngine = 'Workers AI';
                _recordProviderResult('Workers AI', 'ok');
                storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, workerText);
                return workerText;
            }
            _recordProviderResult('Workers AI', 'quota_exhausted', {
                message: 'Worker returned no text (likely daily quota exhausted)',
            });
            console.warn('[AI] Workers AI returned no text — falling back to Claude / Gemini proxy.');
        } catch (workerErr: any) {
            _recordProviderResult('Workers AI', _classifyErrorState(workerErr), workerErr);
            console.warn('[AI] Workers AI threw — falling back to Claude / Gemini proxy:', workerErr?.message);
        }
    } else {
        _recordProviderResult('Workers AI', 'no_key');
    }

    // ── FALLBACK: Claude / Gemini via CF Worker proxy ─────────────────────────
    const preferred = getPreferredFallback();
    const clKey     = getClaudeApiKey();
    const gemKey    = getGeminiApiKey();
    const proxyTask = opts.task || groqModelToWorkerTask(model);

    type FallbackStep = { name: ProviderName; hasKey: boolean };
    const fallbackOrder: FallbackStep[] =
        preferred === 'claude'
            ? [{ name: 'Claude', hasKey: !!clKey }, { name: 'Gemini', hasKey: !!gemKey }]
            : [{ name: 'Gemini', hasKey: !!gemKey }, { name: 'Claude', hasKey: !!clKey }];

    for (const step of fallbackOrder) {
        if (!step.hasKey) {
            _recordProviderResult(step.name, 'no_key');
            console.info(`[AI] Skipping ${step.name} (no key)`);
            continue;
        }
        _dispatchTrying({ label: step.name, type: 'single' });
        try {
            const r = await workerProxyLLM(proxyTask, userPrompt, {
                provider:    step.name === 'Claude' ? 'claude' : 'gemini',
                apiKey:      step.name === 'Claude' ? clKey!   : gemKey!,
                temperature: opts.temperature,
                maxTokens:   opts.maxTokens,
                json:        opts.json,
                timeoutMs:   55_000,
            });
            if (!r) throw new Error(`${step.name} proxy returned no text`);
            _lastAiEngine = step.name;
            _recordProviderResult(step.name, 'ok');
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, r);
            return r;
        } catch (provErr: any) {
            const errState = _classifyErrorState(provErr);
            _recordProviderResult(step.name, errState, provErr);
            console.warn(`[AI] ${step.name} proxy failed:`, provErr?.message);
        }
    }

    // ── All paths exhausted ───────────────────────────────────────────────────
    const preferredName = preferred === 'claude' ? 'Claude' : 'Gemini';
    const err: any = new Error(
        `All AI providers are currently unavailable. The CV Engine free quota resets daily at 00:00 UTC. ` +
        `Your preferred fallback (${preferredName}) also failed — check your API key in Settings or switch providers.`
    );
    err.isUserFacing = true;
    throw err;
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
        console.group('%cAI provider health', 'font-weight:bold;color:#2563eb');
        console.table(rows);
        console.info('Last engine used :', _lastAiEngine ?? '(none yet)');
        console.info('Fallback order   : Workers AI → Claude (proxy) → Gemini (proxy)');
        console.groupEnd();
        return { lastEngineUsed: _lastAiEngine, providers: rows };
    };
}
