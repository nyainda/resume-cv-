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
    notes: string | null;
    remote: string | null;
    location: string | null;
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
                       'deadline','priority','status','built_cv_id','source_url',
                       'notes','remote','location'] as const;
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

// ── POST /api/vault/remind ────────────────────────────────────────────────────

export async function handleVaultRemind(request: Request, env: Env): Promise<Response> {
    const userId = await getUserId(request, env);
    if (!userId) return unauthorized(request, env);

    const body = await safeJson(request);
    if (!body) return json({ error: 'invalid_json' }, request, env, 400);

    const jobTitle = typeof body.job_title === 'string' ? body.job_title : 'a saved role';
    const company  = typeof body.company   === 'string' ? body.company   : '';
    const deadline = typeof body.deadline  === 'string' ? body.deadline  : null;

    if (!env.RESEND_API_KEY && !env.SEND_EMAIL) {
        return json({ error: 'email_not_configured' }, request, env, 503);
    }

    // Look up user email from user_identities
    const userRow = await env.CV_DB.prepare(
        `SELECT email, name FROM user_identities WHERE id = ?`
    ).bind(userId).first<{ email: string; name: string | null }>();

    if (!userRow?.email) {
        return json({ error: 'no_email_on_file' }, request, env, 400);
    }

    const userEmail = userRow.email;
    const userName  = userRow.name ?? 'there';
    const fromAddr  = env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
    const base      = env.APP_URL ?? 'https://procv.app';

    const deadlineStr = deadline
        ? new Date(deadline).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : null;
    const daysLeft = deadline
        ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
        : null;

    const subject = deadline
        ? `⏰ Reminder: ${jobTitle}${company ? ` at ${company}` : ''} — ${daysLeft !== null && daysLeft >= 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left` : 'deadline passed'}`
        : `📌 Reminder: ${jobTitle}${company ? ` at ${company}` : ''}`;

    const html = buildReminderEmail({ userName, jobTitle, company, deadlineStr, daysLeft, base });
    const text = [
        `Hi ${userName},`,
        '',
        `This is a reminder about: ${jobTitle}${company ? ` at ${company}` : ''}.`,
        deadlineStr ? `Deadline: ${deadlineStr}${daysLeft !== null ? ` (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)` : ''}` : '',
        '',
        `Open your Job Vault: ${base}`,
        '',
        '— ProCV',
    ].filter(l => l !== undefined).join('\n');

    if (env.RESEND_API_KEY) {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({ from: `ProCV <${fromAddr}>`, to: [userEmail], subject, text, html }),
        });
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            return json({ error: 'send_failed', detail: err }, request, env, 502);
        }
    } else if (env.SEND_EMAIL) {
        const { EmailMessage } = await import('cloudflare:email') as { EmailMessage: any };
        const rawEmail = [`From: ProCV <noreply@procv.app>`, `To: ${userEmail}`, `Subject: ${subject}`,
            `MIME-Version: 1.0`, `Content-Type: text/plain; charset=utf-8`, '', text].join('\r\n');
        const msg = new EmailMessage('noreply@procv.app', userEmail, rawEmail);
        await env.SEND_EMAIL.send(msg);
    }

    return json({ ok: true, sent_to: userEmail }, request, env);
}

function buildReminderEmail({
    userName, jobTitle, company, deadlineStr, daysLeft, base,
}: {
    userName: string; jobTitle: string; company: string; deadlineStr: string | null;
    daysLeft: number | null; base: string;
}): string {
    const urgencyColor = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 ? '#ef4444' : '#f59e0b';
    const urgencyLabel = daysLeft === null ? '' : daysLeft <= 0 ? 'Deadline passed' : daysLeft === 0 ? 'Due today!' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`;

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;max-width:560px;width:100%">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1B2B4B 0%,#263c61 100%);padding:28px 32px">
          <p style="margin:0;color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase">Job Vault Reminder</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:800;line-height:1.3">${jobTitle}</h1>
          ${company ? `<p style="margin:6px 0 0;color:rgba(255,255,255,0.6);font-size:14px">${company}</p>` : ''}
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6">Hi ${userName},</p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6">
            You asked to be reminded about <strong>${jobTitle}${company ? ` at ${company}` : ''}</strong>.
            ${deadlineStr ? `The application deadline is approaching.` : 'Time to take action!'}
          </p>
          ${deadlineStr ? `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:0.05em">Deadline</p>
            <p style="margin:0;font-size:16px;font-weight:800;color:#111827">${deadlineStr}</p>
            ${urgencyLabel ? `<p style="margin:6px 0 0;font-size:13px;font-weight:700;color:${urgencyColor}">${urgencyLabel}</p>` : ''}
          </div>` : ''}
          <a href="${base}" style="display:inline-block;background:linear-gradient(135deg,#1B2B4B 0%,#263c61 100%);color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-size:14px;font-weight:700">
            Open Job Vault &rarr;
          </a>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9">
          <p style="margin:0;color:#94a3b8;font-size:12px">ProCV &mdash; Your Personal Career Consultant</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
