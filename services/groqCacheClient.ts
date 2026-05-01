/**
 * Cloudflare D1-backed LLM response cache.
 *
 * Identical (model + temperature + system + user) prompts return instantly
 * without burning any AI provider quota. The browser hits the cv-engine-worker
 * at `/api/cv/llm-cache` which reads/writes the `llm_cache` D1 table.
 *
 * We only cache when temperature <= 0.5 — creative outputs should vary.
 *
 * Behaviour is "best-effort": any cache failure (network, worker down, etc.)
 * is swallowed silently and the caller falls through to the live AI call.
 */

// IMPORTANT: access import.meta.env.X directly — the (import.meta as any) cast
// pattern defeats Vite's static replacement at build time.
const ENGINE_URL: string = import.meta.env.VITE_CV_ENGINE_URL ?? '';
const CACHE_ENDPOINT = ENGINE_URL ? `${ENGINE_URL}/api/cv/llm-cache` : '';

const CACHE_MAX_TEMPERATURE = 0.5;
const CACHE_MAX_PROMPT_SIZE = 100_000;

// ─────────────────────────────────────────────────────────────────────────────
// CIRCUIT BREAKER — when the worker cache route fails, skip it temporarily.
// Delegated to the central providerHealth module so the banner can display it.
// ─────────────────────────────────────────────────────────────────────────────
import { markFailure, markSuccess, isHealthy } from './providerHealth';

let logged = false;

function openCircuit(reason: string): void {
    if (!logged) {
        logged = true;
        console.warn(`[LLM Cache] Marking failure (${reason}) — cache calls will skip until auto-probe recovers.`);
    }
    markFailure('groq-cache', reason);
}

function closeCircuit(): void {
    logged = false;
    markSuccess('groq-cache');
}

function circuitIsOpen(): boolean {
    return !isHealthy('groq-cache');
}

/** SHA-256 hex of the joined cache inputs. */
async function cacheKey(
    model: string,
    temperature: number,
    systemPrompt: string,
    userPrompt: string,
): Promise<string> {
    const data = JSON.stringify({ model, temperature, systemPrompt, userPrompt });
    const buf = new TextEncoder().encode(data);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function isCacheable(temperature: number, systemPrompt: string, userPrompt: string): boolean {
    if (!CACHE_ENDPOINT) return false; // no engine configured
    if (!Number.isFinite(temperature) || temperature > CACHE_MAX_TEMPERATURE) return false;
    if ((systemPrompt.length + userPrompt.length) > CACHE_MAX_PROMPT_SIZE) return false;
    return true;
}

/**
 * Look up a cached response. Returns null on miss / error / non-cacheable.
 */
export async function lookupGroqCache(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
): Promise<string | null> {
    if (circuitIsOpen()) return null;
    if (!isCacheable(temperature, systemPrompt, userPrompt)) return null;

    try {
        const key = await cacheKey(model, temperature, systemPrompt, userPrompt);
        const res = await fetch(`${CACHE_ENDPOINT}?key=${key}`, {
            method: 'GET',
            signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) {
            if (res.status >= 500) openCircuit(`HTTP ${res.status}`);
            return null;
        }
        closeCircuit();
        const body = await res.json().catch(() => null);
        if (body && body.hit && typeof body.response === 'string') {
            console.log(`[LLM Cache] HIT (${model}, hits=${body.hitCount})`);
            return body.response;
        }
        return null;
    } catch (e: any) {
        openCircuit(e?.name === 'AbortError' ? 'timeout' : 'network');
        return null;
    }
}

/**
 * Store a successful response. Fire-and-forget; never throws.
 */
export function storeGroqCache(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    response: string,
): void {
    if (circuitIsOpen()) return;
    if (!isCacheable(temperature, systemPrompt, userPrompt)) return;
    if (!response || response.length > 200_000) return;

    void (async () => {
        try {
            const key = await cacheKey(model, temperature, systemPrompt, userPrompt);
            const res = await fetch(CACHE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key,
                    model,
                    temperature,
                    response,
                    promptSize: systemPrompt.length + userPrompt.length,
                }),
                signal: AbortSignal.timeout(3000),
            });
            if (!res.ok && res.status >= 500) openCircuit(`POST HTTP ${res.status}`);
        } catch (e: any) {
            openCircuit(e?.name === 'AbortError' ? 'POST timeout' : 'POST network');
        }
    })();
}
