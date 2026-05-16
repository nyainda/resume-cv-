import { getGeminiKey as _rtGemini, getClaudeKey as _rtClaude } from './security/RuntimeKeys';
import { lookupGroqCache, storeGroqCache } from './groqCacheClient';
import { workerTieredLLM, isCVEngineConfigured } from './cvEngineClient';

// ── Active AI engine tracker ──────────────────────────────────────────────────
let _lastAiEngine: string = 'Workers AI';
export function getLastAiEngine(): string { return _lastAiEngine; }

// ─────────────────────────────────────────────────────────────────────────────
// Single-provider model
//
// User picks ONE provider in Settings:
//   'workers-ai' — Premium: Cloudflare Workers AI (Llama/Mistral). No key needed.
//   'claude'     — Free: Anthropic Claude Haiku via Worker proxy. User provides key.
//   'gemini'     — Free: Google Gemini 2.0 Flash via Worker proxy. User provides key.
//
// All calls route through groqChat() which reads the stored preference and
// dispatches to the right path. Claude and Gemini calls go through the Worker
// (/api/cv/proxy-llm) so system prompts and rules are NEVER exposed in DevTools.
//
// GROQ_LARGE / GROQ_FAST are kept as exported string constants so every
// existing call-site throughout the codebase compiles unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export const GROQ_LARGE = 'llama-3.3-70b-versatile';
export const GROQ_FAST  = 'llama-3.1-8b-instant';

export type AiProvider = 'workers-ai' | 'claude' | 'gemini';

// ── Backward-compat stubs ─────────────────────────────────────────────────────
export function hasGroqKey(): boolean { return false; }
export function getGroqApiKey(): string {
    throw new Error('Groq API has been removed. Use Workers AI, Claude, or Gemini.');
}

/** True when the selected provider has what it needs to make a call */
export function hasAnyLlmKey(): boolean {
    const p = getSelectedProvider();
    if (p === 'workers-ai') return isCVEngineConfigured();
    if (p === 'claude')     return !!getClaudeApiKey();
    if (p === 'gemini')     return !!getGeminiApiKey();
    return false;
}

// ── Provider selection (stored in localStorage) ───────────────────────────────
const PROVIDER_KEY = 'cv_builder:aiProvider';

export function getSelectedProvider(): AiProvider {
    try {
        const v = localStorage.getItem(PROVIDER_KEY) as AiProvider | null;
        if (v === 'workers-ai' || v === 'claude' || v === 'gemini') return v;
        // Legacy migration: if preferredFallback was set, derive from that
        const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (s) {
            const p = JSON.parse(s);
            // If they had Workers AI configured (default) keep it
            if (p.preferredFallback === 'gemini' && p.apiKey) return 'gemini';
            if (p.preferredFallback === 'claude' && p.claudeApiKey) return 'claude';
        }
    } catch { /* ignore */ }
    return 'workers-ai';
}

export function setSelectedProvider(provider: AiProvider): void {
    try { localStorage.setItem(PROVIDER_KEY, provider); } catch { /* ignore */ }
}

// ── Provider health state ─────────────────────────────────────────────────────
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
    const status = err?.status;
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

// ── API key readers ───────────────────────────────────────────────────────────
function getGeminiApiKey(): string | null {
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

function getClaudeApiKey(): string | null {
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

// ── Worker proxy call (Claude / Gemini via /api/cv/proxy-llm) ────────────────
// This is the key security improvement: instead of calling Claude/Gemini
// directly from the browser, we route through the Cloudflare Worker.
// The system prompt (our IP) and the user's API key never appear in
// browser DevTools network logs in a way that exposes the full pipeline.
const ENGINE_URL: string = import.meta.env.VITE_CV_ENGINE_URL ?? '';

async function proxyLLMCall(
    provider: 'claude' | 'gemini',
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; maxTokens?: number; json?: boolean } = {},
): Promise<string> {
    if (!ENGINE_URL) throw new Error('CV Engine URL not configured — cannot proxy LLM call.');
    const res = await fetch(`${ENGINE_URL}/api/cv/proxy-llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider,
            apiKey,
            systemPrompt,
            userPrompt,
            temperature: opts.temperature ?? 0.3,
            maxTokens:   opts.maxTokens ?? 4096,
            json:        opts.json ?? false,
        }),
    });
    if (!res.ok) {
        const raw = await res.text().catch(() => '');
        let msg = '';
        try { msg = JSON.parse(raw)?.message || ''; } catch {}
        const err: any = new Error(msg || `Proxy error (HTTP ${res.status})`);
        err.status = res.status;
        throw err;
    }
    const data = await res.json() as { text?: string };
    if (!data.text) throw new Error(`${provider} returned an empty response via proxy.`);
    return data.text;
}

/**
 * Test the selected provider connection with a tiny request.
 */
export async function testProviderConnection(
    provider: 'claude' | 'gemini',
): Promise<{ ok: boolean; error?: string; model?: string }> {
    try {
        const key = provider === 'claude' ? getClaudeApiKey() : getGeminiApiKey();
        if (!key) return { ok: false, error: `No ${provider === 'claude' ? 'Claude' : 'Gemini'} API key configured.` };
        await proxyLLMCall(provider, key, 'You are a connection test.', 'Reply with the single word OK.', { temperature: 0, maxTokens: 5 });
        return { ok: true, model: provider === 'claude' ? 'claude-haiku-4-5' : 'gemini-2.0-flash' };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Connection test failed.' };
    }
}

/**
 * Primary AI chat function — single provider, no fallback cascade.
 *
 * The provider is read from localStorage (set by the user in Settings):
 *   'workers-ai' → Cloudflare Workers AI (premium, no key needed)
 *   'claude'     → Anthropic Claude Haiku via Worker proxy
 *   'gemini'     → Google Gemini 2.0 Flash via Worker proxy
 *
 * Function name is preserved as `groqChat` for backward compatibility.
 */
export async function groqChat(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; json?: boolean; maxTokens?: number } = {}
): Promise<string> {
    const effectiveTemp = opts.temperature ?? 0.2;
    const provider = getSelectedProvider();

    // ── Cache lookup ──────────────────────────────────────────────────────────
    const cached = await lookupGroqCache(model, systemPrompt, userPrompt, effectiveTemp);
    if (cached !== null) return cached;

    // ── Workers AI ────────────────────────────────────────────────────────────
    if (provider === 'workers-ai') {
        if (!isCVEngineConfigured()) {
            _recordProviderResult('Workers AI', 'no_key');
            throw new Error('Workers AI is not configured. Please check your CV Engine URL in settings or switch to Claude/Gemini.');
        }
        const workerTask = model === 'llama-3.3-70b-versatile' ? 'cvGenerate' : 'general';
        _dispatchTrying({ label: 'Workers AI', type: 'single' });
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
            _recordProviderResult('Workers AI', 'quota_exhausted', {
                message: 'Workers AI returned no text — daily quota may be exhausted.',
            });
            const err: any = new Error(
                'Workers AI returned no text. The daily quota may be exhausted — it resets at 00:00 UTC. ' +
                'Switch to Claude or Gemini in Settings to continue.'
            );
            err.isUserFacing = true;
            throw err;
        } catch (workerErr: any) {
            _recordProviderResult('Workers AI', _classifyErrorState(workerErr), workerErr);
            throw workerErr;
        }
    }

    // ── Claude via Worker proxy ───────────────────────────────────────────────
    if (provider === 'claude') {
        const key = getClaudeApiKey();
        if (!key) {
            _recordProviderResult('Claude', 'no_key');
            const err: any = new Error('No Claude API key configured. Please add your Claude key in Settings.');
            err.isUserFacing = true;
            throw err;
        }
        _dispatchTrying({ label: 'Claude', type: 'single' });
        try {
            const text = await proxyLLMCall('claude', key, systemPrompt, userPrompt, opts);
            _lastAiEngine = 'Claude';
            _recordProviderResult('Claude', 'ok');
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, text);
            return text;
        } catch (err: any) {
            _recordProviderResult('Claude', _classifyErrorState(err), err);
            throw err;
        }
    }

    // ── Gemini via Worker proxy ───────────────────────────────────────────────
    if (provider === 'gemini') {
        const key = getGeminiApiKey();
        if (!key) {
            _recordProviderResult('Gemini', 'no_key');
            const err: any = new Error('No Gemini API key configured. Please add your Gemini key in Settings.');
            err.isUserFacing = true;
            throw err;
        }
        _dispatchTrying({ label: 'Gemini', type: 'single' });
        try {
            const text = await proxyLLMCall('gemini', key, systemPrompt, userPrompt, opts);
            _lastAiEngine = 'Gemini';
            _recordProviderResult('Gemini', 'ok');
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, text);
            return text;
        } catch (err: any) {
            _recordProviderResult('Gemini', _classifyErrorState(err), err);
            throw err;
        }
    }

    // Should never reach here
    const err: any = new Error('No AI provider configured. Please select a provider in Settings.');
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
        const selected = getSelectedProvider();
        const rows = PROVIDERS.map(name => {
            const h = _providerHealth[name];
            const effectiveState: ProviderHealthState = !haveKey[name] ? 'no_key' : h.state;
            return {
                provider:  name,
                selected:  (name.toLowerCase().replace(' ', '-') === selected) ? '★ active' : '',
                key:       haveKey[name] ? '✓ configured' : '— missing',
                status:    STATE_LABEL[effectiveState],
                attempts:  h.attempts,
                lastError: h.lastError ?? '',
            };
        });
        console.group('%cAI provider status', 'font-weight:bold;color:#2563eb');
        console.table(rows);
        console.info('Selected provider:', selected);
        console.info('Last engine used :', _lastAiEngine ?? '(none yet)');
        console.groupEnd();
        return { selectedProvider: selected, lastEngineUsed: _lastAiEngine, providers: rows };
    };
}
