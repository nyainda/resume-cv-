const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const GROQ_LARGE = 'llama-3.3-70b-versatile';
export const GROQ_FAST  = 'llama-3.1-8b-instant';

export function getGroqApiKey(): string {
    try {
        const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (settingsString) {
            const s = JSON.parse(settingsString);
            if (s.groqApiKey) return s.groqApiKey.replace(/^"|"$/g, '');
        }
        const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
        if (providerKeys.groq) return providerKeys.groq.replace(/^"|"$/g, '');
    } catch {}
    throw new Error('Groq API key not set. Please add it in Settings.');
}

export function hasGroqKey(): boolean {
    try { getGroqApiKey(); return true; } catch { return false; }
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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
            const err: any = new Error(`Groq ${res.status}: ${text}`);
            err.status = res.status;
            throw err;
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content ?? '';
    });
}
