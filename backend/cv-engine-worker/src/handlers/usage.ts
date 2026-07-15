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
import { isSuperAdmin } from '../middleware/requirePremium';

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
        `SELECT cv_gen_count, pdf_dl_count, pdf_dl_month_count, pdf_dl_month_reset FROM user_usage WHERE user_id = ?`
    ).bind(session.userId).first<{
        cv_gen_count: number; pdf_dl_count: number;
        pdf_dl_month_count: number; pdf_dl_month_reset: string;
    }>();

    const month = currentMonthKey();
    const monthCount = row?.pdf_dl_month_reset === month ? (row?.pdf_dl_month_count ?? 0) : 0;

    return json({
        ok: true,
        cv_gen_count: row?.cv_gen_count ?? 0,
        pdf_dl_count: row?.pdf_dl_count ?? 0,
        pdf_dl_month_count: monthCount,
        pdf_dl_month_limit: BYOK_PDF_MONTHLY_LIMIT,
    }, request, env);
}

// ─── Free-tier hard limit (PDF downloads only — generation is unlimited for all tiers) ──
// CV generation is never blocked server-side: free users generate freely, PDFs are the gate.
const FREE_PDF_LIMIT = 2;

// ─── BYOK monthly PDF cap ──────────────────────────────────────────────────────
// BYOK has no lifetime cap (their AI usage runs on their own key/quota), but PDF
// rendering still runs on our own Playwright server — a generous rolling cap
// protects against scripted abuse without affecting any real user's workflow.
const BYOK_PDF_MONTHLY_LIMIT = 10;

function currentMonthKey(): string {
    // e.g. "2026-07" — UTC, matches unixepoch()-based timestamps elsewhere.
    return new Date().toISOString().slice(0, 7);
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

    // Super-admin test accounts (SUPER_ADMIN_EMAILS) are always effectively
    // premium and must never be blocked by the free or BYOK download caps.
    const admin = isSuperAdmin(session.email, env);

    // ── PDF download limit enforcement ─────────────────────────────────────────
    // CV generation is unlimited for all tiers — it costs almost nothing and
    // blocking generation hurts retention without protecting revenue.
    // The PDF download is the deliverable users pay for / the cost we absorb.
    let isByok = false;
    if (type === 'pdf_dl' && !admin) {
        const identity = await env.CV_DB.prepare(
            `SELECT plan, byok_enabled FROM user_identities WHERE id = ?`
        ).bind(session.userId).first<{ plan: string; byok_enabled: number }>();

        const plan = identity?.plan ?? 'free';
        isByok = plan !== 'premium' && !!identity?.byok_enabled;
        const isFree = plan === 'free' && !identity?.byok_enabled;

        if (isFree) {
            const current = await env.CV_DB.prepare(
                `SELECT cv_gen_count, pdf_dl_count FROM user_usage WHERE user_id = ?`
            ).bind(session.userId).first<{ cv_gen_count: number; pdf_dl_count: number }>();

            if ((current?.pdf_dl_count ?? 0) >= FREE_PDF_LIMIT) {
                return json({
                    error: 'limit_exceeded',
                    cv_gen_count: current?.cv_gen_count ?? 0,
                    pdf_dl_count: current?.pdf_dl_count ?? 0,
                }, request, env, 429);
            }
        } else if (isByok) {
            // Rolling calendar-month cap — no lifetime limit for BYOK, just an
            // abuse/cost safety net on our own PDF render server.
            const month = currentMonthKey();
            const current = await env.CV_DB.prepare(
                `SELECT cv_gen_count, pdf_dl_count, pdf_dl_month_count, pdf_dl_month_reset
                 FROM user_usage WHERE user_id = ?`
            ).bind(session.userId).first<{
                cv_gen_count: number; pdf_dl_count: number;
                pdf_dl_month_count: number; pdf_dl_month_reset: string;
            }>();

            const monthCount = current?.pdf_dl_month_reset === month ? (current?.pdf_dl_month_count ?? 0) : 0;

            if (monthCount >= BYOK_PDF_MONTHLY_LIMIT) {
                return json({
                    error: 'byok_monthly_limit_exceeded',
                    cv_gen_count: current?.cv_gen_count ?? 0,
                    pdf_dl_count: current?.pdf_dl_count ?? 0,
                    pdf_dl_month_count: monthCount,
                    pdf_dl_month_limit: BYOK_PDF_MONTHLY_LIMIT,
                }, request, env, 429);
            }
        }
    }

    if (type === 'pdf_dl' && isByok) {
        // Reset-aware upsert: if the stored reset month differs from the current
        // one, start the monthly counter fresh at 1 instead of carrying it over.
        const month = currentMonthKey();
        await env.CV_DB.prepare(`
            INSERT INTO user_usage (user_id, pdf_dl_count, pdf_dl_month_count, pdf_dl_month_reset, updated_at)
            VALUES (?, 1, 1, ?, unixepoch())
            ON CONFLICT(user_id) DO UPDATE SET
                pdf_dl_count       = pdf_dl_count + 1,
                pdf_dl_month_count = CASE WHEN pdf_dl_month_reset = ? THEN pdf_dl_month_count + 1 ELSE 1 END,
                pdf_dl_month_reset = ?,
                updated_at         = unixepoch()
        `).bind(session.userId, month, month, month).run();
    } else {
        // Upsert: create row on first increment, otherwise bump the column.
        await env.CV_DB.prepare(`
            INSERT INTO user_usage (user_id, ${col}, updated_at)
            VALUES (?, 1, unixepoch())
            ON CONFLICT(user_id) DO UPDATE SET
                ${col}     = ${col} + 1,
                updated_at = unixepoch()
        `).bind(session.userId).run();
    }

    const row = await env.CV_DB.prepare(
        `SELECT cv_gen_count, pdf_dl_count, pdf_dl_month_count FROM user_usage WHERE user_id = ?`
    ).bind(session.userId).first<{ cv_gen_count: number; pdf_dl_count: number; pdf_dl_month_count: number }>();

    return json({
        ok: true,
        cv_gen_count: row?.cv_gen_count ?? 1,
        pdf_dl_count: row?.pdf_dl_count ?? 0,
        pdf_dl_month_count: row?.pdf_dl_month_count ?? undefined,
    }, request, env);
}

// ─── GET /api/cv/tier ─────────────────────────────────────────────────────────

export async function handleTierGet(request: Request, env: Env): Promise<Response> {
    const { session, err } = await requireSession(request, env);
    if (!session) return err!;

    // plan comes from user_identities; super-admin emails are always elevated.
    const row = await env.CV_DB.prepare(
        `SELECT plan, byok_enabled FROM user_identities WHERE id = ?`
    ).bind(session.userId).first<{ plan: string; byok_enabled: number }>();

    const effectivePlan = isSuperAdmin(session.email, env)
        ? 'premium'
        : (row?.plan ?? 'free');

    const usage = await env.CV_DB.prepare(
        `SELECT cv_gen_count, pdf_dl_count, pdf_dl_month_count, pdf_dl_month_reset FROM user_usage WHERE user_id = ?`
    ).bind(session.userId).first<{
        cv_gen_count: number; pdf_dl_count: number;
        pdf_dl_month_count: number; pdf_dl_month_reset: string;
    }>();

    const month = currentMonthKey();
    const monthCount = usage?.pdf_dl_month_reset === month ? (usage?.pdf_dl_month_count ?? 0) : 0;
    const isByok = effectivePlan !== 'premium' && (row?.byok_enabled ?? 0) === 1;

    return json({
        ok: true,
        plan: effectivePlan,
        byok_enabled: (row?.byok_enabled ?? 0) === 1,
        cv_gen_count: usage?.cv_gen_count ?? 0,
        pdf_dl_count: usage?.pdf_dl_count ?? 0,
        pdf_dl_month_count: isByok ? monthCount : undefined,
        pdf_dl_month_limit: isByok ? BYOK_PDF_MONTHLY_LIMIT : undefined,
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
