/**
 * Cloudflare D1-backed job search cache.
 *
 * Before every Tavily / JSearch API call the frontend checks this cache.
 * On a hit the call is skipped entirely — saving API quota.
 * On a miss the result is stored fire-and-forget so the next identical
 * search (same role + filters) is instant.
 *
 * Cache key: SHA-256 hex of JSON-serialised, normalised search params.
 * TTL: 6 hours (matching migration 014 default).
 *
 * All operations are best-effort — failures never block a search.
 */

const ENGINE_URL: string = import.meta.env.VITE_CV_ENGINE_URL ?? '';
const CACHE_ENDPOINT = ENGINE_URL ? `${ENGINE_URL}/api/cv/job-cache` : '';

const TTL_HOURS = 6;
const MAX_RESULTS_SIZE = 200_000;

// ─── SHA-256 key ──────────────────────────────────────────────────────────────

async function sha256(input: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function buildJobCacheKey(params: Record<string, unknown>): Promise<string> {
    const normalised = JSON.stringify(
        Object.fromEntries(
            Object.entries(params)
                .filter(([, v]) => v !== undefined && v !== null && v !== '')
                .map(([k, v]) => [k, typeof v === 'string' ? v.toLowerCase().trim() : v])
                .sort(([a], [b]) => (a as string).localeCompare(b as string))
        )
    );
    return sha256(normalised);
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

export interface JobCacheHit<T> {
    hit: true;
    data: T;
    source: string;
}
export interface JobCacheMiss {
    hit: false;
}
export type JobCacheResult<T> = JobCacheHit<T> | JobCacheMiss;

/**
 * Check D1 for a cached result. Returns the parsed data on hit, or
 * { hit: false } on miss / error / worker unavailable.
 */
export async function lookupJobCache<T>(key: string): Promise<JobCacheResult<T>> {
    if (!CACHE_ENDPOINT) return { hit: false };

    try {
        const res = await fetch(`${CACHE_ENDPOINT}?key=${key}`, {
            method: 'GET',
            signal: AbortSignal.timeout(2500),
        });

        if (res.status === 404) return { hit: false };
        if (!res.ok) return { hit: false };

        const body = await res.json().catch(() => null);
        if (!body?.hit || typeof body.results_json !== 'string') return { hit: false };

        const data = JSON.parse(body.results_json) as T;
        return { hit: true, data, source: body.source ?? 'unknown' };
    } catch {
        return { hit: false };
    }
}

// ─── Store (fire-and-forget) ──────────────────────────────────────────────────

/**
 * Store a result in D1. Never throws; always fire-and-forget.
 */
export function storeJobCache(
    key: string,
    data: unknown,
    queryText: string,
    source: 'tavily' | 'jsearch' | 'combined',
    ttlHours = TTL_HOURS,
): void {
    if (!CACHE_ENDPOINT) return;

    void (async () => {
        try {
            const resultsJson = JSON.stringify(data);
            if (resultsJson.length > MAX_RESULTS_SIZE) return;

            await fetch(CACHE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, results_json: resultsJson, query_text: queryText, source, ttl_hours: ttlHours }),
                signal: AbortSignal.timeout(4000),
            });
        } catch {
            // Silently swallow — cache failure must never block search
        }
    })();
}
