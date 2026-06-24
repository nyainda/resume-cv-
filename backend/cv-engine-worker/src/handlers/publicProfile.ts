/// <reference types="@cloudflare/workers-types" />
/**
 * Public profile endpoints — permanent shareable CV page per user.
 *
 *   GET    /api/cv/public-profile?id=<userId>   — public read (no auth)
 *   POST   /api/cv/public-profile               — publish / update (auth required)
 *   DELETE /api/cv/public-profile               — unpublish (auth required)
 */

import { Env } from '../types';
import { json, safeJson } from '../utils';
import { verifySession } from './auth';

const MAX_PAYLOAD_BYTES = 200_000;

function sessionToken(request: Request): string {
    const h = request.headers.get('Authorization') || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

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

    return json({
        ok: true,
        payload: row.payload,
        updated_at: row.updated_at,
        view_count: row.view_count,
    }, request, env);
}

/** POST /api/cv/public-profile  (Authorization: Bearer <token>) */
export async function handlePublicProfilePost(
    request: Request, env: Env,
): Promise<Response> {
    const session = await verifySession(sessionToken(request), env);
    if (!session) return json({ error: 'unauthorized' }, request, env, 401);

    const body = await safeJson(request);
    const payload = typeof body?.payload === 'string' ? body.payload.trim() : '';
    if (!payload) return json({ error: 'missing_payload' }, request, env, 400);
    if (new TextEncoder().encode(payload).length > MAX_PAYLOAD_BYTES) {
        return json({ error: 'payload_too_large' }, request, env, 413);
    }

    const now = Math.floor(Date.now() / 1000);

    // Fetch existing slug so we can reuse it on updates (keep the URL stable).
    const existing = await env.CV_DB.prepare(
        `SELECT slug FROM public_profiles WHERE user_id = ?`
    ).bind(session.userId).first<{ slug: string | null }>();
    const slug = existing?.slug ?? randomSlug();

    await env.CV_DB.prepare(`
        INSERT INTO public_profiles (user_id, payload, updated_at, view_count, slug)
        VALUES (?, ?, ?, 0, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            payload    = excluded.payload,
            updated_at = excluded.updated_at,
            slug       = COALESCE(public_profiles.slug, excluded.slug)
    `).bind(session.userId, payload, now, slug).run();

    return json({ ok: true, user_id: session.userId, slug }, request, env);
}

/** DELETE /api/cv/public-profile  (Authorization: Bearer <token>) */
export async function handlePublicProfileDelete(
    request: Request, env: Env,
): Promise<Response> {
    const session = await verifySession(sessionToken(request), env);
    if (!session) return json({ error: 'unauthorized' }, request, env, 401);

    await env.CV_DB.prepare(
        `DELETE FROM public_profiles WHERE user_id = ?`
    ).bind(session.userId).run();

    return json({ ok: true }, request, env);
}
