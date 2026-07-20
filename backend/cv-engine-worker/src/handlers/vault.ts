/// <reference types="@cloudflare/workers-types" />
/**
 * vault.ts — Job Vault CRUD routes
 *
 * All routes require a valid session cookie. Returns 401 if unauthenticated.
 *
 * Routes:
 *   GET    /api/vault/jobs          — list all vault jobs for the authenticated user
 *   POST   /api/vault/jobs          — create or upsert a vault job
 *   PATCH  /api/vault/jobs/:id      — update fields on an existing vault job
 *   DELETE /api/vault/jobs/:id      — delete a vault job
 */

import { Env } from '../types';
import { json, safeJson } from '../utils';
import { sessionTokenFromRequest } from './auth';
import { hashToken } from './auth';

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getUserId(request: Request, env: Env): Promise<number | null> {
    const token = sessionTokenFromRequest(request);
    if (!token) return null;
    const hash = await hashToken(token);
    const now = Math.floor(Date.now() / 1000);
    const row = await env.CV_DB.prepare(
        `SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > ?`
    ).bind(hash, now).first<{ user_id: number }>();
    return row?.user_id ?? null;
}

function unauthorized(request: Request, env: Env): Response {
    return json({ error: 'unauthorized' }, request, env, 401);
}

// ── Row type from D1 ──────────────────────────────────────────────────────────

interface VaultJobRow {
    id: string;
    user_id: number;
    room_id: string;
    title: string;
    company: string;
    raw_jd: string;
    input_type: string;
    source_url: string | null;
    match_score: number | null;
    room_reason: string | null;
    room_type: string;
    deadline: string | null;
    priority: string;
    status: string;
    built_cv_id: string | null;
    fingerprint: string;
    created_at: number;
    updated_at: number;
}

// ── GET /api/vault/jobs ───────────────────────────────────────────────────────

export async function handleVaultJobsGet(request: Request, env: Env, url: URL): Promise<Response> {
    const userId = await getUserId(request, env);
    if (!userId) return unauthorized(request, env);

    // Optional filters
    const roomId = url.searchParams.get('room_id') || null;
    const since  = parseInt(url.searchParams.get('since') || '0', 10); // unix ms

    let query = `SELECT * FROM vault_jobs WHERE user_id = ?`;
    const bindings: (number | string)[] = [userId];

    if (roomId) {
        query += ` AND room_id = ?`;
        bindings.push(roomId);
    }
    if (since > 0) {
        query += ` AND updated_at > ?`;
        bindings.push(since);
    }

    query += ` ORDER BY created_at DESC LIMIT 500`;

    const stmt = env.CV_DB.prepare(query);
    const result = await stmt.bind(...bindings).all<VaultJobRow>();
    return json({ ok: true, jobs: result.results ?? [] }, request, env);
}

// ── POST /api/vault/jobs ──────────────────────────────────────────────────────

export async function handleVaultJobsPost(request: Request, env: Env): Promise<Response> {
    const userId = await getUserId(request, env);
    if (!userId) return unauthorized(request, env);

    const body = await safeJson(request);
    if (!body) return json({ error: 'invalid_json' }, request, env, 400);

    const id          = typeof body.id          === 'string' ? body.id          : crypto.randomUUID();
    const roomId      = typeof body.room_id     === 'string' ? body.room_id     : '';
    const title       = typeof body.title       === 'string' ? body.title.slice(0, 200) : '';
    const company     = typeof body.company     === 'string' ? body.company.slice(0, 200) : '';
    const rawJd       = typeof body.raw_jd      === 'string' ? body.raw_jd.slice(0, 50000) : '';
    const inputType   = typeof body.input_type  === 'string' ? body.input_type  : 'text';
    const sourceUrl   = typeof body.source_url  === 'string' ? body.source_url.slice(0, 2048) : null;
    const matchScore  = typeof body.match_score === 'number' ? body.match_score : null;
    const roomReason  = typeof body.room_reason === 'string' ? body.room_reason.slice(0, 500) : null;
    const roomType    = typeof body.room_type   === 'string' ? body.room_type   : 'uncategorized';
    const deadline    = typeof body.deadline    === 'string' ? body.deadline    : null;
    const priority    = typeof body.priority    === 'string' ? body.priority    : 'medium';
    const status      = typeof body.status      === 'string' ? body.status      : 'saved';
    const builtCvId   = typeof body.built_cv_id === 'string' ? body.built_cv_id : null;
    const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : '';
    const now         = typeof body.created_at  === 'number' ? body.created_at  : Date.now();
    const updatedAt   = Date.now();

    if (!rawJd) return json({ error: 'missing_raw_jd' }, request, env, 400);

    // Upsert — fingerprint is unique per user; if same fp exists, update instead
    await env.CV_DB.prepare(`
        INSERT INTO vault_jobs
            (id, user_id, room_id, title, company, raw_jd, input_type, source_url,
             match_score, room_reason, room_type, deadline, priority, status,
             built_cv_id, fingerprint, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, fingerprint) DO UPDATE SET
            title       = excluded.title,
            company     = excluded.company,
            match_score = COALESCE(excluded.match_score, vault_jobs.match_score),
            room_type   = excluded.room_type,
            room_reason = excluded.room_reason,
            status      = excluded.status,
            deadline    = excluded.deadline,
            priority    = excluded.priority,
            built_cv_id = excluded.built_cv_id,
            updated_at  = excluded.updated_at
    `).bind(
        id, userId, roomId, title, company, rawJd, inputType, sourceUrl,
        matchScore, roomReason, roomType, deadline, priority, status,
        builtCvId, fingerprint, now, updatedAt
    ).run();

    const saved = await env.CV_DB.prepare(
        `SELECT * FROM vault_jobs WHERE user_id = ? AND fingerprint = ?`
    ).bind(userId, fingerprint).first<VaultJobRow>();

    return json({ ok: true, job: saved }, request, env);
}

// ── PATCH /api/vault/jobs/:id ─────────────────────────────────────────────────

export async function handleVaultJobPatch(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getUserId(request, env);
    if (!userId) return unauthorized(request, env);

    const existing = await env.CV_DB.prepare(
        `SELECT id FROM vault_jobs WHERE id = ? AND user_id = ?`
    ).bind(id, userId).first<{ id: string }>();
    if (!existing) return json({ error: 'not_found' }, request, env, 404);

    const body = await safeJson(request);
    if (!body) return json({ error: 'invalid_json' }, request, env, 400);

    // Build SET clause dynamically — only update provided fields
    const allowed: Record<string, unknown> = {};
    const PATCHABLE = ['title','company','match_score','room_type','room_reason',
                       'deadline','priority','status','built_cv_id','source_url'] as const;
    for (const key of PATCHABLE) {
        if (key in body) allowed[key] = body[key];
    }
    allowed['updated_at'] = Date.now();

    const keys   = Object.keys(allowed);
    const values = Object.values(allowed);

    const setClauses = keys.map(k => `${k} = ?`).join(', ');
    await env.CV_DB.prepare(
        `UPDATE vault_jobs SET ${setClauses} WHERE id = ? AND user_id = ?`
    ).bind(...values, id, userId).run();

    const updated = await env.CV_DB.prepare(
        `SELECT * FROM vault_jobs WHERE id = ?`
    ).bind(id).first<VaultJobRow>();

    return json({ ok: true, job: updated }, request, env);
}

// ── DELETE /api/vault/jobs/:id ────────────────────────────────────────────────

export async function handleVaultJobDelete(request: Request, env: Env, id: string): Promise<Response> {
    const userId = await getUserId(request, env);
    if (!userId) return unauthorized(request, env);

    const result = await env.CV_DB.prepare(
        `DELETE FROM vault_jobs WHERE id = ? AND user_id = ?`
    ).bind(id, userId).run();

    if ((result.meta?.changes ?? 0) === 0) {
        return json({ error: 'not_found' }, request, env, 404);
    }
    return json({ ok: true }, request, env);
}
