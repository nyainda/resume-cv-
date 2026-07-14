/**
 * cvUsageClient.ts
 *
 * Client for the cv-engine-worker's usage counter and tier endpoints.
 *
 *   GET  /api/cv/usage            — fetch current counts (requires session)
 *   POST /api/cv/usage/increment  — increment a counter   (requires session)
 *   GET  /api/cv/tier             — fetch plan + byok flag (requires session)
 *   POST /api/cv/mark-byok        — set or clear byok flag (requires session)
 *
 * All calls are fire-and-forget safe: if the server is unreachable the
 * caller falls back to localStorage values already seeded during syncTierFromServer.
 */

const ENGINE_URL: string = (import.meta as { env: Record<string, string> }).env.VITE_CV_ENGINE_URL ?? '';

function engineURL(path: string): string {
    if (!ENGINE_URL) return path;
    try { return new URL(path, ENGINE_URL).toString(); } catch { return path; }
}

/** Shape returned by GET /api/cv/usage */
export interface UsageCounts {
    cv_gen_count: number;
    pdf_dl_count: number;
}

/**
 * Thrown by incrementUsageCount when the server returns 429 (free-tier cap hit).
 * Carries the server's authoritative current counts so callers can sync localStorage.
 */
export class UsageLimitExceededError extends Error {
    constructor(public readonly counts: UsageCounts) {
        super('limit_exceeded');
        this.name = 'UsageLimitExceededError';
    }
}

/** Shape returned by GET /api/cv/tier */
export interface TierInfo {
    plan: 'free' | 'premium';
    byok_enabled: boolean;
    cv_gen_count: number;
    pdf_dl_count: number;
}

/**
 * Fetch the caller's usage counts from the server.
 * Returns null on any network/auth error.
 */
export async function fetchUsageCounts(): Promise<UsageCounts | null> {
    try {
        const res = await fetch(engineURL('/api/cv/usage'), { credentials: 'include' });
        if (!res.ok) return null;
        const data = await res.json() as { ok: boolean; cv_gen_count: number; pdf_dl_count: number };
        if (!data.ok) return null;
        return { cv_gen_count: data.cv_gen_count, pdf_dl_count: data.pdf_dl_count };
    } catch {
        return null;
    }
}

/**
 * Atomically check-and-increment a usage counter on the server.
 * Returns the updated counts on success.
 * Throws UsageLimitExceededError (with current counts) if the free-tier cap is hit (HTTP 429).
 * Returns null on any other network/server error (caller should fail-open).
 */
export async function incrementUsageCount(
    type: 'cv_gen' | 'pdf_dl',
): Promise<UsageCounts | null> {
    try {
        const res = await fetch(engineURL('/api/cv/usage/increment'), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type }),
        });
        if (res.status === 429) {
            // Server says free-tier limit exceeded. Parse the counts it echoes back
            // so we can sync localStorage to the authoritative value.
            let counts: UsageCounts = { cv_gen_count: 0, pdf_dl_count: 0 };
            try {
                const data = await res.json() as { cv_gen_count?: number; pdf_dl_count?: number };
                counts = {
                    cv_gen_count: data.cv_gen_count ?? 0,
                    pdf_dl_count: data.pdf_dl_count ?? 0,
                };
            } catch { /* ignore parse errors — zero counts is a safe fallback */ }
            throw new UsageLimitExceededError(counts);
        }
        if (!res.ok) return null;
        const data = await res.json() as { ok: boolean; cv_gen_count: number; pdf_dl_count: number };
        if (!data.ok) return null;
        return { cv_gen_count: data.cv_gen_count, pdf_dl_count: data.pdf_dl_count };
    } catch (e) {
        if (e instanceof UsageLimitExceededError) throw e; // re-throw; don't swallow
        return null;
    }
}

/**
 * Fetch the caller's plan, BYOK flag, and usage counts in one round-trip.
 * Returns null on any network/auth error.
 */
export async function fetchTierInfo(): Promise<TierInfo | null> {
    try {
        const res = await fetch(engineURL('/api/cv/tier'), { credentials: 'include' });
        if (!res.ok) return null;
        const data = await res.json() as TierInfo & { ok: boolean };
        if (!data.ok) return null;
        return {
            plan: data.plan === 'premium' ? 'premium' : 'free',
            byok_enabled: !!data.byok_enabled,
            cv_gen_count: data.cv_gen_count ?? 0,
            pdf_dl_count: data.pdf_dl_count ?? 0,
        };
    } catch {
        return null;
    }
}

/**
 * Notify the server that the user has (or no longer has) a BYOK key.
 * Fire-and-forget: returns void; failure is silently ignored.
 */
export async function markByok(enabled: boolean): Promise<void> {
    try {
        await fetch(engineURL('/api/cv/mark-byok'), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled }),
        });
    } catch {
        // non-fatal
    }
}
