/// <reference types="@cloudflare/workers-types" />
/**
 * Public profile endpoints — permanent shareable CV page per user.
 *
 *   GET    /api/cv/public-profile?id=<userId>         — public read (no auth)
 *   POST   /api/cv/public-profile                     — publish / update (auth required)
 *   DELETE /api/cv/public-profile                     — unpublish (auth required)
 *   PATCH  /api/cv/public-profile/slug                — set custom slug (auth required)
 *   GET    /api/cv/public-profile/slug/check?slug=…   — availability check (no auth)
 */

import { Env } from '../types';
import { json, safeJson } from '../utils';
import { verifySession, resolvePlan, sessionTokenFromRequest } from './auth';

const MAX_PAYLOAD_BYTES = 200_000;

/** Generate a random 16-char URL-safe slug for profile share links. */
function randomSlug(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => chars[b % chars.length]).join('');
}

/**
 * GET /api/cv/public-profile?slug=<slug>   ← preferred (non-enumerable)
 * GET /api/cv/public-profile?id=<userId>   ← legacy (still supported)
 *
 * Slug-based URLs prevent enumeration of sequential integer user IDs.
 */
export async function handlePublicProfileGet(
    request: Request, env: Env, url: URL,
): Promise<Response> {
    const slug  = (url.searchParams.get('slug') ?? '').trim();
    const idStr = (url.searchParams.get('id')   ?? '').trim();

    let row: { payload: string; updated_at: number; view_count: number; user_id: number } | null = null;

    if (slug) {
        // Preferred: lookup by random slug — not enumerable
        row = await env.CV_DB.prepare(
            `SELECT payload, updated_at, view_count, user_id FROM public_profiles WHERE slug = ?`
        ).bind(slug).first<{ payload: string; updated_at: number; view_count: number; user_id: number }>();
    } else if (idStr) {
        // Legacy: lookup by integer user_id
        const userId = parseInt(idStr, 10);
        if (!userId || isNaN(userId)) return json({ error: 'missing_id' }, request, env, 400);
        row = await env.CV_DB.prepare(
            `SELECT payload, updated_at, view_count, user_id FROM public_profiles WHERE user_id = ?`
        ).bind(userId).first<{ payload: string; updated_at: number; view_count: number; user_id: number }>();
    } else {
        return json({ error: 'missing_id_or_slug' }, request, env, 400);
    }

    if (!row) return json({ error: 'not_found' }, request, env, 404);

    // Increment view count fire-and-forget
    env.CV_DB.prepare(
        `UPDATE public_profiles SET view_count = view_count + 1 WHERE user_id = ?`
    ).bind(row.user_id).run().catch(() => {});

    // Live tier check — never trust the branding flag baked into the payload
    // at share-time. If the owner has since upgraded to Premium (or a
    // super-admin test account), the public page must reflect that now,
    // not whatever tier they were on when they last clicked "Share".
    const owner = await env.CV_DB.prepare(
        `SELECT email, plan, byok_enabled FROM user_identities WHERE id = ?`
    ).bind(row.user_id).first<{ email: string; plan: string; byok_enabled: number }>();
    const effectivePlan = owner ? resolvePlan(owner.email, owner.plan, env) : 'free';
    const showBranding = effectivePlan !== 'premium';

    return json({
        ok: true,
        payload: row.payload,
        updated_at: row.updated_at,
        view_count: row.view_count,
        show_branding: showBranding,
        owner_plan: effectivePlan,
    }, request, env);
}

/**
 * GET /api/cv/public-profile/me  (Authorization: Bearer <token>)
 *
 * Returns the authenticated user's own published profile metadata —
 * specifically the slug and slot_id — without needing to know the slug first.
 * Used by the frontend on login/mount to restore per-slot localStorage state
 * across devices and sessions.
 */
export async function handlePublicProfileGetMe(
    request: Request, env: Env,
): Promise<Response> {
    const session = await verifySession(sessionTokenFromRequest(request), env);
    if (!session) return json({ error: 'unauthorized' }, request, env, 401);

    const row = await env.CV_DB.prepare(
        `SELECT slug, slot_id, updated_at FROM public_profiles WHERE user_id = ?`
    ).bind(session.userId).first<{ slug: string | null; slot_id: string | null; updated_at: number }>();

    if (!row || !row.slug) return json({ published: false }, request, env);

    return json({
        published: true,
        slug: row.slug,
        slot_id: row.slot_id ?? null,
        updated_at: row.updated_at,
        user_id: session.userId,
    }, request, env);
}

/** POST /api/cv/public-profile  (Authorization: Bearer <token>) */
export async function handlePublicProfilePost(
    request: Request, env: Env,
): Promise<Response> {
    const session = await verifySession(sessionTokenFromRequest(request), env);
    if (!session) return json({ error: 'unauthorized' }, request, env, 401);

    const body = await safeJson(request);
    const payload = typeof body?.payload === 'string' ? body.payload.trim() : '';
    if (!payload) return json({ error: 'missing_payload' }, request, env, 400);
    if (new TextEncoder().encode(payload).length > MAX_PAYLOAD_BYTES) {
        return json({ error: 'payload_too_large' }, request, env, 413);
    }

    // slot_id is optional — the column may be NULL for old records
    const slotId = typeof body?.slot_id === 'string' ? body.slot_id.trim() : null;

    const now = Math.floor(Date.now() / 1000);

    // Fetch existing slug so we can reuse it on updates (keep the URL stable).
    const existing = await env.CV_DB.prepare(
        `SELECT slug FROM public_profiles WHERE user_id = ?`
    ).bind(session.userId).first<{ slug: string | null }>();
    const slug = existing?.slug ?? randomSlug();

    await env.CV_DB.prepare(`
        INSERT INTO public_profiles (user_id, payload, updated_at, view_count, slug, slot_id)
        VALUES (?, ?, ?, 0, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            payload    = excluded.payload,
            updated_at = excluded.updated_at,
            slug       = COALESCE(public_profiles.slug, excluded.slug),
            slot_id    = excluded.slot_id
    `).bind(session.userId, payload, now, slug, slotId).run();

    return json({ ok: true, user_id: session.userId, slug }, request, env);
}

/** DELETE /api/cv/public-profile  (Authorization: Bearer <token>) */
export async function handlePublicProfileDelete(
    request: Request, env: Env,
): Promise<Response> {
    const session = await verifySession(sessionTokenFromRequest(request), env);
    if (!session) return json({ error: 'unauthorized' }, request, env, 401);

    await env.CV_DB.prepare(
        `DELETE FROM public_profiles WHERE user_id = ?`
    ).bind(session.userId).run();

    return json({ ok: true }, request, env);
}

/** Slug validation — mirrors the client-side SLUG_PATTERN in publicProfileService.ts. */
function isValidSlug(slug: string): boolean {
    if (slug.length < 3 || slug.length > 30) return false;
    const RESERVED = new Set([
        'api', 'admin', 'cv', 'profile', 'user', 'me', 'null', 'undefined',
        'help', 'about', 'support', 'blog', 'www', 'auth', 'login', 'signup',
    ]);
    if (RESERVED.has(slug)) return false;
    return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug) || /^[a-z0-9]{3}$/.test(slug);
}

/**
 * PATCH /api/cv/public-profile/slug  (Authorization: Bearer <token>)
 * Body: { slug: string }
 *
 * Sets a user-chosen custom slug on an already-published profile.
 * Validates format, checks uniqueness, and updates in place so the
 * old random slug stops working (one URL per profile at a time).
 */
export async function handlePublicProfileSlugPatch(
    request: Request, env: Env,
): Promise<Response> {
    const session = await verifySession(sessionTokenFromRequest(request), env);
    if (!session) return json({ error: 'unauthorized' }, request, env, 401);

    const body = await safeJson(request);
    const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';

    if (!isValidSlug(slug)) return json({ error: 'invalid_slug' }, request, env, 400);

    // Ensure the user has a published profile to attach the slug to.
    const existing = await env.CV_DB.prepare(
        `SELECT slug FROM public_profiles WHERE user_id = ?`
    ).bind(session.userId).first<{ slug: string | null }>();
    if (!existing) return json({ error: 'not_published' }, request, env, 404);

    // Check uniqueness — owned by a different user is a conflict.
    const owner = await env.CV_DB.prepare(
        `SELECT user_id FROM public_profiles WHERE slug = ?`
    ).bind(slug).first<{ user_id: number }>();
    if (owner && owner.user_id !== session.userId) {
        return json({ error: 'slug_taken' }, request, env, 409);
    }

    await env.CV_DB.prepare(
        `UPDATE public_profiles SET slug = ? WHERE user_id = ?`
    ).bind(slug, session.userId).run();

    return json({ ok: true, slug }, request, env);
}

/**
 * GET /api/cv/public-profile/slug/check?slug=<slug>  (no auth)
 *
 * Quick availability check used by the frontend slug editor for real-time
 * feedback before the user clicks Save.  Must never be edge-cached.
 */
export async function handlePublicProfileSlugCheck(
    request: Request, env: Env, url: URL,
): Promise<Response> {
    const slug = (url.searchParams.get('slug') ?? '').trim().toLowerCase();

    if (!isValidSlug(slug)) {
        return new Response(JSON.stringify({ available: false, valid: false }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const row = await env.CV_DB.prepare(
        `SELECT user_id FROM public_profiles WHERE slug = ?`
    ).bind(slug).first<{ user_id: number }>();

    return new Response(JSON.stringify({ available: !row, valid: true }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
