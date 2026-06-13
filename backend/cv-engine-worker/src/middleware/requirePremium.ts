/**
 * requirePremium.ts
 *
 * Phase 2 stub — server-side tier enforcement for the cv-engine-worker.
 *
 * Currently a no-op passthrough. Wire this into the tiered-llm handler
 * when the payment flow is live so free users can't bypass the UI gate
 * by calling the API directly.
 *
 * ── Phase 2 implementation checklist ────────────────────────────────────────
 *
 * 1. Add `account_tier TEXT NOT NULL DEFAULT 'free'` to the `users` D1 table
 *    (new migration: backend/cv-engine-worker/migrations/026_account_tier.sql).
 *
 * 2. Implement `validateTierClaim()` below:
 *    a. Extract the session token from the Authorization header.
 *    b. Look up the session in D1 → get user_id.
 *    c. Look up `account_tier` for that user_id.
 *    d. Return the tier ('free' | 'premium').
 *
 * 3. In `handleTieredLLM` (handlers/llm.ts), call `requirePremium(request, env)`
 *    when `task` is one of the workers-ai-only tasks:
 *       const tier = await requirePremium(request, env);
 *       if (tier !== 'premium') return tierError();
 *
 * 4. Add GET /api/account/tier endpoint (handlers/accountTier.ts) so the
 *    frontend can sync the tier after login.
 */

export type AccountTier = 'free' | 'premium';

export interface Env {
  CV_DB: D1Database;
  [key: string]: unknown;
}

/**
 * Validates the caller's session and returns their account tier.
 *
 * Phase 2: replace the stub body with real D1 lookup logic.
 */
export async function validateTierClaim(
  _request: Request,
  _env: Env,
): Promise<AccountTier> {
  // TODO Phase 2: implement real session → tier lookup
  // const authHeader = _request.headers.get('Authorization') ?? '';
  // const token = authHeader.replace(/^Bearer\s+/i, '');
  // if (!token) return 'free';
  //
  // const row = await _env.CV_DB
  //   .prepare(`
  //     SELECT u.account_tier
  //     FROM sessions s
  //     JOIN users u ON u.id = s.user_id
  //     WHERE s.token_hash = ?
  //       AND s.expires_at > unixepoch()
  //   `)
  //   .bind(await sha256hex(token))
  //   .first<{ account_tier: AccountTier }>();
  //
  // return row?.account_tier ?? 'free';

  return 'free'; // stub: treat everyone as free until Phase 2
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
