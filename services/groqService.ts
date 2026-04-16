import { getGroqKey as _rtGroq } from './security/RuntimeKeys';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const GROQ_LARGE = 'llama-3.3-70b-versatile';
export const GROQ_FAST  = 'llama-3.1-8b-instant';

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

export function hasGroqKey(): boolean {
    try { getGroqApiKey(); return true; } catch { return false; }
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

    if (status === 429 || c.includes('rate') || m.includes('rate limit')) {
        if (c.includes('daily') || c.includes('quota') || m.includes('daily') || m.includes('quota') || m.includes('exceeded your')) {
            return 'Daily AI limit reached on your Groq account. Usage resets at midnight UTC — or check console.groq.com to upgrade.';
        }
        // Extract retry-after hint if present
        const seconds = m.match(/try again in (\d+(?:\.\d+)?)\s*s/i)?.[1];
        const wait = seconds ? ` Wait about ${Math.ceil(Number(seconds))} seconds.` : ' Wait 30–60 seconds.';
        return `Rate limit reached on your Groq account.${wait} Then try again.`;
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

async function retryGroq<T>(fn: () => Promise<T>, retries = 3, delay = 1200): Promise<T> {
    try {
        return await fn();
    } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        const status = e?.status;
        const isTransient = status === 429 || status === 503 ||
            msg.includes('429') || msg.includes('503') ||
            msg.includes('rate') || msg.includes('overload');
        if (retries > 0 && isTransient) {
            await sleep(delay);
            return retryGroq(fn, retries - 1, delay * 2);
        }
        throw e;
    }
}

export async function groqChat(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { temperature?: number; json?: boolean; maxTokens?: number } = {}
): Promise<string> {
    const apiKey = getGroqApiKey();
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

    return retryGroq(async () => {
        const res = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text();
            const friendly = parseGroqError(res.status, text);
            const err: any = new Error(friendly);
            err.status = res.status;
            err.isUserFacing = true;
            throw err;
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content ?? '';
    });
}
