/**
 * Gemini / Claude multimodal clients for PDF/image parsing.
 */

import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { getGeminiKey as _rtGemini, getClaudeKey as _rtClaude } from '../security/RuntimeKeys';
import { getSelectedProvider, getClaudeModel } from '../groqService';

// --- Gemini Client (multimodal only — PDF/image parsing) ---
export function getGeminiClient(): GoogleGenAI {
    // 1. In-memory decrypted key (primary — populated by KeyVault on app start)
    let apiKey: string | undefined = _rtGemini() ?? undefined;

    // 2. Legacy plaintext fallback (migration path)
    if (!apiKey) {
        const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (settingsString) {
            try {
                const settings = JSON.parse(settingsString);
                if (settings.apiKey && !settings.apiKey.startsWith('enc:v1:')) {
                    apiKey = settings.apiKey.replace(/^"|"$/g, '');
                }
            } catch { /* ignore */ }
        }
    }

    if (!apiKey) {
        try {
            const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
            if (providerKeys.gemini && !providerKeys.gemini.startsWith('enc:v1:')) {
                apiKey = providerKeys.gemini.replace(/^"|"$/g, '');
            }
        } catch { /* ignore */ }
    }

    if (!apiKey) throw new Error('Gemini API key not set. Please add it in Settings to enable file/image upload.');
    return new GoogleGenAI({ apiKey });
}

// ── Claude helpers for client-side CV import ─────────────────────────────────
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
 * Call Claude for text-only CV parsing / structuring tasks via the CF Worker
 * proxy. Prompt Vault applies automatically: if `system` matches a registered
 * template only the key is sent. The `apiKey` param is kept for call-site
 * backward compatibility but routing is now fully server-side via proxy-llm.
 * Returns the raw response string.
 */
/**
 * Call Claude with a file (image or PDF base64) + text prompt.
 * Routes through the CF Worker proxy to avoid the CORS block that occurs
 * when the browser calls api.anthropic.com directly.
 * Falls back to a direct browser call only when the worker is unreachable.
 */
export async function claudeMultimodalCall(
    apiKey: string,
    base64Data: string,
    mimeType: string,
    textPrompt: string,
    opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
    // ── Primary path: CF Worker proxy (no CORS issues) ────────────────────────
    try {
        const { callProviderViaProxyMultimodal } = await import('../groqService');
        const result = await callProviderViaProxyMultimodal(apiKey, base64Data, mimeType, textPrompt, opts);
        if (result && result.trim().length > 0) return result;
    } catch (proxyErr: any) {
        // Re-throw auth / quota errors — no point hitting Anthropic directly with a bad key
        if (proxyErr?.status === 401 || proxyErr?.status === 403) throw proxyErr;
        console.warn('[claudeMultimodalCall] Worker proxy failed, falling back to direct call:', proxyErr?.message);
    }

    // ── Fallback: direct browser→Claude (only when worker unreachable) ────────
    const isPdf = mimeType === 'application/pdf';
    const filePart = isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
        : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } };

    const headers: Record<string, string> = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
    };
    if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: getClaudeModel(),
            max_tokens: opts.maxTokens ?? 4096,
            temperature: opts.temperature ?? 0.1,
            messages: [{ role: 'user', content: [filePart, { type: 'text', text: textPrompt }] }],
        }),
    });
    if (!res.ok) {
        const raw = await res.text().catch(() => '');
        let msg = '';
        try { msg = JSON.parse(raw)?.error?.message || ''; } catch {}
        const err: any = new Error(msg || `Claude multimodal error ${res.status}`);
        err.status = res.status;
        throw err;
    }
    const data = await res.json();
    return (data?.content?.[0]?.text as string) || '';
}

// --- Gemini Retry Logic (for multimodal calls) ---
export async function retryGemini<T>(operation: () => Promise<T>, retries = 4, delayMs = 1500): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        const msg = error?.message || '';
        const status = error?.status;
        const isTransient = status === 503 || status === 429 ||
            msg.includes('503') || msg.includes('Overloaded') ||
            msg.includes('429') || msg.includes('Rate Limit');
        if (retries > 0 && isTransient) {
            await new Promise(r => setTimeout(r, delayMs));
            return retryGemini(operation, retries - 1, delayMs * 2);
        }
        throw error;
    }
}

