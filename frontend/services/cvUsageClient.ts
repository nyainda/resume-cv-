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

/** Shape returned by GET /api/cv/usage and POST /api/cv/usage/increment */
export interface UsageCounts {
    cv_gen_count: number;
    pdf_dl_count: number;
    /** Remaining CV generations today. null = unlimited (BYOK/Premium). */
    cv_gen_daily_remaining: number | null;
    /** Daily cap value (15 for free). null when unlimited. */
    cv_gen_daily_limit: number | null;
}

/**
 * Thrown by incrementUsageCount when the server returns 429 (cap hit).
 * Carries the server's authoritative counts so callers can sync localStorage.
 */
export class UsageLimitExceededError extends Error {
    constructor(
        public readonly counts: Pick<UsageCounts, 'cv_gen_count' | 'pdf_dl_count'>,
        public readonly errorCode: 'limit_exceeded' | 'daily_limit_exceeded' = 'limit_exceeded',
        public readonly dailyRemaining: number = 0,
    ) {
        super(errorCode);
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
        const data = await res.json() as {
            ok: boolean;
            cv_gen_count: number;
            pdf_dl_count: number;
            cv_gen_daily_remaining?: number;
            cv_gen_daily_limit?: number;
        };
        if (!data.ok) return null;
        return {
            cv_gen_count:           data.cv_gen_count,
            pdf_dl_count:           data.pdf_dl_count,
            cv_gen_daily_remaining: data.cv_gen_daily_remaining ?? null,
            cv_gen_daily_limit:     data.cv_gen_daily_limit ?? null,
        };
    } catch {
        return null;
    }
}

/**
 * Atomically check-and-increment a usage counter on the server.
 * Returns the updated counts on success.
 * Throws UsageLimitExceededError if the cap is hit (HTTP 429).
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
            let body: any = {};
            try { body = await res.json(); } catch { /* ignore */ }
            const errorCode: 'limit_exceeded' | 'daily_limit_exceeded' =
                body?.error === 'daily_limit_exceeded' ? 'daily_limit_exceeded' : 'limit_exceeded';
            throw new UsageLimitExceededError(
                { cv_gen_count: body?.cv_gen_count ?? 0, pdf_dl_count: body?.pdf_dl_count ?? 0 },
                errorCode,
                body?.cv_gen_daily_remaining ?? 0,
            );
        }
        if (!res.ok) return null;
        const data = await res.json() as {
            ok: boolean;
            cv_gen_count: number;
            pdf_dl_count: number;
            cv_gen_daily_remaining?: number | null;
            cv_gen_daily_limit?: number | null;
        };
        if (!data.ok) return null;
        return {
            cv_gen_count:           data.cv_gen_count,
            pdf_dl_count:           data.pdf_dl_count,
            cv_gen_daily_remaining: data.cv_gen_daily_remaining ?? null,
            cv_gen_daily_limit:     data.cv_gen_daily_limit ?? null,
        };
    } catch (e) {
        if (e instanceof UsageLimitExceededError) throw e;
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
            plan:         data.plan,
            byok_enabled: data.byok_enabled,
            cv_gen_count: data.cv_gen_count,
            pdf_dl_count: data.pdf_dl_count,
        };
    } catch {
        return null;
    }
}

/**
 * Mark (or unmark) the caller's account as BYOK.
 * Returns true on success, false on any error.
 */
export async function markByok(enabled = true): Promise<boolean> {
    try {
        const res = await fetch(engineURL('/api/cv/mark-byok'), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled }),
        });
        return res.ok;
    } catch {
        return false;
    }
}
