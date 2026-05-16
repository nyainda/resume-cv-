import { getGeminiKey as _rtGemini, getClaudeKey as _rtClaude } from './security/RuntimeKeys';
import { lookupGroqCache, storeGroqCache } from './groqCacheClient';
import { workerTieredLLM, isCVEngineConfigured } from './cvEngineClient';
import { GoogleGenAI } from '@google/genai';

// ── Active AI engine tracker ──────────────────────────────────────────────────
let _lastAiEngine: string = 'Workers AI';
export function getLastAiEngine(): string { return _lastAiEngine; }

// ─────────────────────────────────────────────────────────────────────────────
// Provider chain: Workers AI → Claude Haiku → Gemini Flash
//
// All text-generation throughout the codebase flows through groqChat().
// Priority order:
//   1. Cloudflare Workers AI via cv-engine-worker (free, no user key needed)
//   2. Claude Haiku / Sonnet (200 K context — needs user's Claude key)
//   3. Gemini 2.0 Flash  (1 M context  — needs user's Gemini key, last resort)
//
// Groq, Cerebras, OpenRouter and Together.ai have been removed.
// GROQ_LARGE / GROQ_FAST are kept as exported string constants so every
// existing call-site throughout the codebase compiles unchanged — they are
// capability-tier labels, not provider identifiers.
// ─────────────────────────────────────────────────────────────────────────────

function groqModelToWorkerTask(model: string): string {
    if (model === 'llama-3.3-70b-versatile') return 'cvGenerate';
    if (model === 'llama-3.1-8b-instant')    return 'general';
    return 'general';
}

export const GROQ_LARGE = 'llama-3.3-70b-versatile';
export const GROQ_FAST  = 'llama-3.1-8b-instant';

// ── Backward-compat stubs ─────────────────────────────────────────────────────
// hasGroqKey / getGroqApiKey are imported by wordImportService and
// cvCompareDiagnostic.  They must remain exported; Groq is simply gone.
export function hasGroqKey(): boolean { return false; }
export function getGroqApiKey(): string {
    throw new Error('Groq API has been removed. Use CV Engine (Workers AI), Claude, or Gemini.');
}

/** True when Claude or Gemini keys are present (Workers AI needs no key at all) */
export function hasAnyLlmKey(): boolean {
    return !!getClaudeApiKey() || !!getGeminiApiKey();
}

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
    /** Human-readable label, e.g. "Workers AI" or "Claude" */
    label: string;
    /** 'single' = one provider; 'race' = parallel race; 'retry' = short-wait retry */
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

// ── Preferred fallback provider ───────────────────────────────────────────────
// Read from localStorage (saved by SettingsModal). Defaults to 'claude' so
// existing users who have a Claude key keep the same behaviour automatically.
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

// ── Gemini key + chat ─────────────────────────────────────────────────────────
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

async function geminiChat(
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; maxTokens?: number; json?: boolean } = {},
): Promise<string> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error('No Gemini API key configured — please add one in Settings.');
    const ai = new GoogleGenAI({ apiKey });
    const config: Record<string, unknown> = {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxTokens ?? 4096,
    };
    if (opts.json) config.responseMimeType = 'application/json';
    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        config,
        contents: [{ role: 'user', parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt }] }],
    });
    const text = response.text ?? '';
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
}

// ── Claude key + chat ─────────────────────────────────────────────────────────
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

const CLAUDE_API_URL = '/api/claude';
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
        if (haikuErr?.status === 529 || haikuErr?.status === 503) {
            console.warn('[AI] Claude Haiku overloaded — retrying with Sonnet');
            return await callClaudeApi(apiKey, CLAUDE_SONNET, systemPrompt, userPrompt, opts);
        }
        throw haikuErr;
    }
}

/**
 * Test the Claude connection end-to-end with a tiny request.
 * Returns { ok: true, model } on success, or { ok: false, error } on failure.
 */
export async function testProviderConnection(
    provider: 'claude',
): Promise<{ ok: boolean; error?: string; model?: string }> {
    try {
        const key = getClaudeApiKey();
        if (!key) return { ok: false, error: 'No Claude API key configured.' };
        await callClaudeApi(
            key, CLAUDE_HAIKU,
            'You are a connection test.',
            'Reply with the single word OK.',
            { temperature: 0, maxTokens: 5 },
        );
        return { ok: true, model: CLAUDE_HAIKU };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Connection test failed.' };
    }
}

/**
 * Primary AI chat function.
 *
 * Provider chain (in order):
 *   1. Cloudflare Workers AI  — free, no user key needed
 *   2. Claude Haiku (+ Sonnet on overload)  — needs user's Claude API key
 *   3. Gemini 2.0 Flash  — needs user's Gemini API key (last resort)
 *
 * Function name is preserved as `groqChat` for backward compatibility —
 * every existing call-site in the codebase remains unchanged.
 */
export async function groqChat(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; json?: boolean; maxTokens?: number } = {}
): Promise<string> {
    const effectiveTemp = opts.temperature ?? 0.2;

    // ── Cache lookup ──────────────────────────────────────────────────────────
    const cached = await lookupGroqCache(model, systemPrompt, userPrompt, effectiveTemp);
    if (cached !== null) return cached;

    // ── PRIMARY: Cloudflare Workers AI ────────────────────────────────────────
    if (isCVEngineConfigured()) {
        const workerTask = groqModelToWorkerTask(model);
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
                message: 'Worker returned no text (likely daily quota exhausted)',
            });
            console.warn('[AI] Workers AI returned no text — falling back to Claude / Gemini.');
        } catch (workerErr: any) {
            _recordProviderResult('Workers AI', _classifyErrorState(workerErr), workerErr);
            console.warn('[AI] Workers AI threw — falling back to Claude / Gemini:', workerErr?.message);
        }
    } else {
        _recordProviderResult('Workers AI', 'no_key');
    }

    // ── FALLBACK: user's preferred provider, then the other one if no key set ──
    const preferred = getPreferredFallback();
    const clKey  = getClaudeApiKey();
    const gemKey = getGeminiApiKey();

    // Build the two-step fallback order based on preference.
    // If the preferred provider has no key, automatically try the other one.
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
            let r: string;
            if (step.name === 'Claude') {
                r = await claudeChat(systemPrompt, userPrompt, opts);
                _lastAiEngine = 'Claude';
            } else {
                r = await geminiChat(systemPrompt, userPrompt, opts);
                _lastAiEngine = 'Gemini';
            }
            _recordProviderResult(step.name, 'ok');
            storeGroqCache(model, systemPrompt, userPrompt, effectiveTemp, r);
            return r;
        } catch (provErr: any) {
            const errState = _classifyErrorState(provErr);
            _recordProviderResult(step.name, errState, provErr);
            console.warn(`[AI] ${step.name} failed:`, provErr?.message);
            // If this is the preferred provider and it has a key but failed with quota/auth,
            // only continue to the next provider if the next one has a key AND the preferred
            // was set explicitly (i.e. user hasn't locked in to one provider).
            // Either way we let the loop continue to the secondary provider.
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
// Run `window.__providerStatus()` in the browser console to see, for every
// provider: whether a key is configured, last attempt result, attempt count,
// and the last error message.
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
        console.info('Fallback order   : Workers AI → Claude → Gemini');
        console.groupEnd();
        return { lastEngineUsed: _lastAiEngine, providers: rows, fallbackOrder: 'Workers AI → Claude → Gemini' };
    };
}
