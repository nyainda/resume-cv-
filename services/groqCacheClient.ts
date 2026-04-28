/**
 * Postgres-backed Groq response cache.
 *
 * Identical (model + temperature + system + user) prompts return instantly
 * without burning Groq quota. The browser hits a same-origin Vercel function
 * (`/api/groq-cache`) which talks to the existing telemetry Postgres pool.
 *
 * We only cache when temperature <= 0.5 — creative outputs should vary.
 *
 * Behaviour is "best-effort": any cache failure (network, DB down, etc.) is
 * swallowed silently and the caller falls through to the live Groq call.
 */

const CACHE_ENDPOINT = '/api/groq-cache';
const CACHE_MAX_TEMPERATURE = 0.5;
const CACHE_MAX_PROMPT_SIZE = 100_000;

// ─────────────────────────────────────────────────────────────────────────────
// CIRCUIT BREAKER — when the Vercel cache function returns 503 (or fails to
// respond at all) it's almost always because the route is unhealthy. Each
// cache lookup costs ~2s of wasted timeout, so we skip them while open.
//
// Delegated to the central providerHealth module so:
//   - The banner sees groq-cache failures alongside cf-worker failures.
//   - Auto-probe re-opens the circuit (half-open) every 3 min instead of
//     keeping it dead until full page reload.
//   - The 'groq-cache' circuit is intentionally separate from 'groq' (the
//     main API) — the cache function on Vercel can be down while Groq itself
//     is fine, and vice versa.
// ─────────────────────────────────────────────────────────────────────────────
import { markFailure, markSuccess, isHealthy } from './providerHealth';

let logged = false;

function openCircuit(reason: string): void {
    if (!logged) {
        logged = true;
        console.warn(`[Groq Cache] Marking failure (${reason}) — subsequent cache calls will skip until auto-probe recovers.`);
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
            // 503 / 502 / 504 / 500 → upstream cache function is unhealthy.
            // Open the circuit so we don't waste 2s on every subsequent call.
            if (res.status >= 500) openCircuit(`HTTP ${res.status}`);
            return null;
        }
        // Reaching a 2xx (even on a miss) proves the cache route is alive.
        closeCircuit();
        const body = await res.json().catch(() => null);
        if (body && body.hit && typeof body.response === 'string') {
            console.log(`[Groq Cache] HIT (${model}, hits=${body.hitCount})`);
            return body.response;
        }
        return null;
    } catch (e: any) {
        // AbortError (timeout) or network error → cache route is unreachable.
        // Open the circuit on the first failure.
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
    if (!response || response.length > 500_000) return;

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
            // Best-effort — but on the first failure open the circuit so we
            // don't keep wasting 3s on the next dozen writes.
            openCircuit(e?.name === 'AbortError' ? 'POST timeout' : 'POST network');
        }
    })();
}
