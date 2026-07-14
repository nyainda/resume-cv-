/// <reference types="@cloudflare/workers-types" />
/**
 * usage.ts — per-user usage counters + BYOK flag
 *
 * Routes (all require a valid session):
 *   GET  /api/cv/usage            — return cv_gen_count, pdf_dl_count for the caller
 *   POST /api/cv/usage/increment  — atomically increment one counter
 *   GET  /api/cv/tier             — return plan + byok_enabled for the caller
 *   POST /api/cv/mark-byok        — set or clear byok_enabled
 */

import { Env } from '../types';
import { json } from '../utils';
import { verifySession, sessionCookieFromRequest } from './auth';

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireSession(request: Request, env: Env) {
    const fromCookie = sessionCookieFromRequest(request);
    const h = request.headers.get('Authorization') ?? '';
    const token = fromCookie || (h.startsWith('Bearer ') ? h.slice(7).trim() : '');
    if (!token) return { session: null, err: json({ error: 'unauthorized' }, request, env, 401) };
    const session = await verifySession(token, env);
    if (!session) return { session: null, err: json({ error: 'unauthorized' }, request, env, 401) };
    return { session, err: null };
}

// ─── GET /api/cv/usage ────────────────────────────────────────────────────────

export async function handleUsageGet(request: Request, env: Env): Promise<Response> {
    const { session, err } = await requireSession(request, env);
    if (!session) return err!;

    const row = await env.CV_DB.prepare(
        `SELECT cv_gen_count, pdf_dl_count FROM user_usage WHERE user_id = ?`
    ).bind(session.userId).first<{ cv_gen_count: number; pdf_dl_count: number }>();

    return json({
        ok: true,
        cv_gen_count: row?.cv_gen_count ?? 0,
        pdf_dl_count: row?.pdf_dl_count ?? 0,
    }, request, env);
}

// ─── POST /api/cv/usage/increment ────────────────────────────────────────────

export async function handleUsageIncrement(request: Request, env: Env): Promise<Response> {
    const { session, err } = await requireSession(request, env);
    if (!session) return err!;

    let body: any;
    try { body = await request.json(); } catch {
        return json({ error: 'invalid_json' }, request, env, 400);
    }

    const type = body?.type;
    if (type !== 'cv_gen' && type !== 'pdf_dl') {
        return json({ error: 'invalid_type', valid: ['cv_gen', 'pdf_dl'] }, request, env, 400);
    }

    const col = type === 'cv_gen' ? 'cv_gen_count' : 'pdf_dl_count';

    // Upsert: create row on first increment, otherwise bump the column.
    await env.CV_DB.prepare(`
        INSERT INTO user_usage (user_id, ${col}, updated_at)
        VALUES (?, 1, unixepoch())
        ON CONFLICT(user_id) DO UPDATE SET
            ${col}   = ${col} + 1,
            updated_at = unixepoch()
    `).bind(session.userId).run();

    const row = await env.CV_DB.prepare(
        `SELECT cv_gen_count, pdf_dl_count FROM user_usage WHERE user_id = ?`
    ).bind(session.userId).first<{ cv_gen_count: number; pdf_dl_count: number }>();

    return json({
        ok: true,
        cv_gen_count: row?.cv_gen_count ?? 1,
        pdf_dl_count: row?.pdf_dl_count ?? 0,
    }, request, env);
}

// ─── GET /api/cv/tier ─────────────────────────────────────────────────────────

export async function handleTierGet(request: Request, env: Env): Promise<Response> {
    const { session, err } = await requireSession(request, env);
    if (!session) return err!;

    // plan comes from user_identities (already in session); byok_enabled is also there.
    const row = await env.CV_DB.prepare(
        `SELECT plan, byok_enabled FROM user_identities WHERE id = ?`
    ).bind(session.userId).first<{ plan: string; byok_enabled: number }>();

    const usage = await env.CV_DB.prepare(
        `SELECT cv_gen_count, pdf_dl_count FROM user_usage WHERE user_id = ?`
    ).bind(session.userId).first<{ cv_gen_count: number; pdf_dl_count: number }>();

    return json({
        ok: true,
        plan: row?.plan ?? 'free',
        byok_enabled: (row?.byok_enabled ?? 0) === 1,
        cv_gen_count: usage?.cv_gen_count ?? 0,
        pdf_dl_count: usage?.pdf_dl_count ?? 0,
    }, request, env);
}

// ─── POST /api/cv/mark-byok ──────────────────────────────────────────────────

export async function handleMarkByok(request: Request, env: Env): Promise<Response> {
    const { session, err } = await requireSession(request, env);
    if (!session) return err!;

    let body: any;
    try { body = await request.json(); } catch {
        return json({ error: 'invalid_json' }, request, env, 400);
    }

    // enabled defaults to true if omitted (common call: "I just set a key")
    const enabled = body?.enabled !== false ? 1 : 0;

    await env.CV_DB.prepare(
        `UPDATE user_identities SET byok_enabled = ? WHERE id = ?`
    ).bind(enabled, session.userId).run();

    return json({ ok: true, byok_enabled: enabled === 1 }, request, env);
}
