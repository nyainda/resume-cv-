/**
 * requirePremium.ts
 *
 * Server-side tier enforcement for the cv-engine-worker.
 *
 * Uses the caller's session (cookie or Bearer token) to look up their plan in
 * D1 — the same join that handleAuthSession uses. The client-supplied
 * `paidUpgrade` flag in request bodies is intentionally ignored; plan is
 * always derived server-side here.
 */

import { Env } from '../types';
import { verifySession } from '../handlers/auth';

export type AccountTier = 'free' | 'premium';

// ─── Cookie helper ────────────────────────────────────────────────────────────
function sessionTokenFromRequest(request: Request): string {
    const cookieHeader = request.headers.get('Cookie') ?? '';
    const cookieMatch  = cookieHeader.match(/(?:^|;\s*)procv_session=([^;]+)/);
    if (cookieMatch) return cookieMatch[1].trim();
    const auth = request.headers.get('Authorization') ?? '';
    return auth.replace(/^Bearer\s+/i, '').trim();
}

/**
 * Validates the caller's session and returns their account tier.
 * Falls back to 'free' when there is no session or a D1 error.
 */
export async function validateTierClaim(
    request: Request,
    env: Env,
): Promise<AccountTier> {
    try {
        const token = sessionTokenFromRequest(request);
        if (!token) return 'free';
        const session = await verifySession(token, env);
        return session?.plan === 'premium' ? 'premium' : 'free';
    } catch {
        return 'free'; // fail-open: D1 error → treat as free
    }
}

/**
 * Middleware helper — call inside a handler that requires premium.
 * Returns a 403 Response if the caller is not premium, otherwise null.
 *
 * Usage in a handler:
 *   const denied = await requirePremium(request, env);
 *   if (denied) return denied;
 */
export async function requirePremium(
    request: Request,
    env: Env,
): Promise<Response | null> {
    const tier = await validateTierClaim(request, env);
    if (tier !== 'premium') {
        return new Response(
            JSON.stringify({
                error: 'premium_required',
                message: 'This feature requires a ProCV Premium account.',
            }),
            {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            },
        );
    }
    return null;
}
