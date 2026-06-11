/// <reference types="@cloudflare/workers-types" />
/**
 * Auth handler — Google OAuth token link + Email magic link + Session management.
 *
 * Security features:
 *  - 256-bit random session tokens (crypto.getRandomValues)
 *  - Magic links: single-use, 15 min TTL, rate-limited to 3 per email per 15 min
 *  - Sessions: 30-day TTL, capped at 10 active per user (oldest deleted on overflow)
 *  - Google tokens: verified server-side via googleapis userinfo
 *  - Every sign-in / sign-out written to auth_audit_log
 *  - last_seen_at updated on every session validation
 *  - is_new_user flag returned so the frontend can show a welcome screen
 *
 * Endpoints:
 *   POST /api/auth/google           — verify Google access token, upsert identity, return session
 *   POST /api/auth/magic-link/send  — generate & email a one-use sign-in link
 *   GET  /api/auth/magic-link/verify?token=X — verify token, return session
 *   GET  /api/auth/session          — validate existing session (Authorization: Bearer <token>)
 *   POST /api/auth/signout          — invalidate session token
 */

import { Env } from '../types';
import { json, safeJson, ipRateLimit } from '../utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_TTL_S        = 30 * 24 * 60 * 60; // 30 days
const MAGIC_LINK_TTL_S     = 15 * 60;            // 15 minutes
const MAGIC_RATE_WINDOW_S  = 15 * 60;            // window to count sends
const MAGIC_RATE_MAX       = 3;                   // max sends per window per email
const SESSION_CAP          = 10;                  // max concurrent sessions per user

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomHex(bytes = 32): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function clientIp(request: Request): string {
    return (
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
        'unknown'
    );
}

function clientUa(request: Request): string {
    return (request.headers.get('User-Agent') || '').slice(0, 256);
}

interface GoogleUserInfo {
    sub: string;
    email: string;
    name: string;
    picture: string;
}

async function verifyGoogleToken(accessToken: string): Promise<GoogleUserInfo | null> {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const d: any = await res.json();
        if (!d.sub || !d.email) return null;
        return { sub: d.sub, email: d.email, name: d.name || '', picture: d.picture || '' };
    } catch {
        return null;
    }
}

/** Create a new session and enforce the per-user session cap. */
async function createSession(userId: number, env: Env): Promise<string> {
    const token = randomHex(32); // 64-char hex = 256-bit entropy
    const now   = Math.floor(Date.now() / 1000);

    await env.CV_DB.prepare(
        `INSERT INTO user_sessions (token, user_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
    ).bind(token, userId, now + SESSION_TTL_S, now).run();

    // Remove expired sessions for this user
    await env.CV_DB.prepare(
        `DELETE FROM user_sessions WHERE user_id = ? AND expires_at <= ?`
    ).bind(userId, now).run().catch(() => {});

    // Enforce the per-user active session cap (keep the 10 most recent)
    await env.CV_DB.prepare(`
        DELETE FROM user_sessions
        WHERE user_id = ?
          AND token NOT IN (
              SELECT token FROM user_sessions
              WHERE user_id = ?
              ORDER BY created_at DESC
              LIMIT ?
          )
    `).bind(userId, userId, SESSION_CAP).run().catch(() => {});

    return token;
}

/** Write an entry to the audit log (non-fatal — errors swallowed). */
async function auditLog(
    userId: number,
    event: string,
    method: string,
    request: Request,
    env: Env,
): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await env.CV_DB.prepare(
        `INSERT INTO auth_audit_log (user_id, event, method, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(userId, event, method, clientIp(request), clientUa(request), now)
        .run().catch(() => {});
}

/** Returns true if this user was created within the last 5 seconds (brand-new account). */
async function checkIsNewUser(userId: number, env: Env): Promise<boolean> {
    // Count sessions excluding the one we just inserted (if count == 1 they're new)
    const row = await env.CV_DB.prepare(
        `SELECT COUNT(*) as c FROM user_sessions WHERE user_id = ?`
    ).bind(userId).first<{ c: number }>();
    return (row?.c ?? 0) <= 1;
}

// ─── Exported session helper (used by other handlers to auth-gate routes) ─────

export interface SessionCtx {
    userId: number;
    email: string;
    name: string;
    plan: string;
}

export async function verifySession(token: string | null, env: Env): Promise<SessionCtx | null> {
    if (!token) return null;
    const now = Math.floor(Date.now() / 1000);
    const row = await env.CV_DB.prepare(`
        SELECT s.user_id, u.email, u.name, u.plan
        FROM user_sessions s
        JOIN user_identities u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?
    `).bind(token, now).first<{ user_id: number; email: string; name: string; plan: string }>();
    if (!row) return null;
    return { userId: row.user_id, email: row.email, name: row.name, plan: row.plan };
}

function sessionTokenFromRequest(request: Request): string {
    const h = request.headers.get('Authorization') || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/** POST /api/auth/google */
export async function handleAuthGoogle(request: Request, env: Env): Promise<Response> {
    // Rate-limit: 20 Google sign-in / sign-up attempts per IP per hour.
    // This blocks credential-stuffing and bot-signup floods while still
    // allowing normal users (who sign in far less than once a minute).
    const rl = await ipRateLimit(env, request, 'auth:google', 20, 3600);
    if (!rl.allowed) {
        return json({ error: 'rate_limited', retry_after: rl.retryAfter }, request, env, 429);
    }

    const body     = await safeJson(request);
    const token    = typeof body?.access_token === 'string' ? body.access_token.trim() : '';
    const deviceId = typeof body?.device_id    === 'string' ? body.device_id.trim()    : '';

    if (!token) return json({ error: 'missing_access_token' }, request, env, 400);

    const gUser = await verifyGoogleToken(token);
    if (!gUser) return json({ error: 'invalid_google_token' }, request, env, 401);

    const now = Math.floor(Date.now() / 1000);

    // Three-path identity resolution — avoids UNIQUE constraint collisions that
    // occur when the same email already exists (from a magic-link sign-up) and
    // we naively INSERT ... ON CONFLICT(google_id) — that conflict lands on the
    // email column, not google_id, so the ON CONFLICT clause never fires.
    //
    // Path 1: returning Google user (google_id already known)
    // Path 2: email-first user (magic-link account) — merge by linking google_id
    // Path 3: brand-new user — insert fresh row

    type UserRow = { id: number; email: string; name: string; picture: string; plan: string };

    let user: UserRow | null = await env.CV_DB.prepare(
        `SELECT id, email, name, picture, plan FROM user_identities WHERE google_id = ?`
    ).bind(gUser.sub).first<UserRow>();

    if (user) {
        // Path 1: refresh profile info for returning Google user
        await env.CV_DB.prepare(`
            UPDATE user_identities
            SET name = ?, picture = ?, email = ?, last_seen_at = ?
            WHERE google_id = ?
        `).bind(gUser.name, gUser.picture, gUser.email, now, gUser.sub).run();
        user = { ...user, name: gUser.name, picture: gUser.picture, email: gUser.email };
    } else {
        // Path 2: check for a magic-link account with the same email
        const byEmail = await env.CV_DB.prepare(
            `SELECT id, email, name, picture, plan FROM user_identities WHERE email = ?`
        ).bind(gUser.email).first<UserRow>();

        if (byEmail) {
            // Merge: link this Google identity onto the existing magic-link row
            await env.CV_DB.prepare(`
                UPDATE user_identities
                SET google_id = ?, name = ?, picture = ?, last_seen_at = ?
                WHERE id = ?
            `).bind(gUser.sub, gUser.name, gUser.picture, now, byEmail.id).run();
            user = { ...byEmail, name: gUser.name, picture: gUser.picture };
        } else {
            // Path 3: brand-new user — safe to insert (no conflicts possible)
            await env.CV_DB.prepare(`
                INSERT INTO user_identities
                  (google_id, email, name, picture, device_id, plan, created_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, 'free', ?, ?)
            `).bind(gUser.sub, gUser.email, gUser.name, gUser.picture, deviceId || null, now, now).run();
            user = await env.CV_DB.prepare(
                `SELECT id, email, name, picture, plan FROM user_identities WHERE google_id = ?`
            ).bind(gUser.sub).first<UserRow>();
        }
    }

    if (!user) return json({ error: 'db_error' }, request, env, 500);

    const sessionToken = await createSession(user.id, env);
    const is_new_user  = await checkIsNewUser(user.id, env);

    await auditLog(user.id, 'signin_google', 'google', request, env);

    return json({
        ok: true,
        session_token: sessionToken,
        is_new_user,
        user: { id: user.id, email: user.email, name: user.name, picture: user.picture, plan: user.plan },
    }, request, env);
}

/** POST /api/auth/magic-link/send */
export async function handleAuthMagicSend(request: Request, env: Env): Promise<Response> {
    const body   = await safeJson(request);
    const email  = typeof body?.email   === 'string' ? body.email.trim().toLowerCase()  : '';
    const appUrl = typeof body?.app_url === 'string' ? body.app_url.trim()              : '';

    if (!email || !email.includes('@') || email.length < 5) {
        return json({ error: 'invalid_email' }, request, env, 400);
    }
    if (!env.BREVO_API_KEY) {
        return json({ error: 'email_not_configured' }, request, env, 503);
    }

    // ── Rate limit: max MAGIC_RATE_MAX sends per email per MAGIC_RATE_WINDOW_S ─
    const now         = Math.floor(Date.now() / 1000);
    const windowStart = now - MAGIC_RATE_WINDOW_S;
    const recentRow   = await env.CV_DB.prepare(
        `SELECT COUNT(*) as c FROM magic_link_tokens WHERE email = ? AND created_at > ?`
    ).bind(email, windowStart).first<{ c: number }>();

    if ((recentRow?.c ?? 0) >= MAGIC_RATE_MAX) {
        return json({
            error: 'rate_limited',
            message: `Too many sign-in emails requested. Please wait ${MAGIC_RATE_WINDOW_S / 60} minutes and try again.`,
            retry_after: MAGIC_RATE_WINDOW_S,
        }, request, env, 429);
    }

    const linkToken = randomHex(32);

    await env.CV_DB.prepare(
        `INSERT INTO magic_link_tokens (token, email, expires_at, used, created_at)
         VALUES (?, ?, ?, 0, ?)`
    ).bind(linkToken, email, now + MAGIC_LINK_TTL_S, now).run();

    const base      = (appUrl || 'https://procv.app').replace(/\/$/, '');
    const magicLink = `${base}/?magic=${linkToken}`;

    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sender:      { name: 'ProCV', email: 'noreply@procv.app' },
            to:          [{ email }],
            subject:     'Your ProCV sign-in link',
            htmlContent: buildMagicEmail(magicLink),
        }),
    });

    if (!emailRes.ok) {
        const errTxt = await emailRes.text().catch(() => '');
        console.error('[Auth] Brevo error:', errTxt);
        return json({ error: 'email_send_failed' }, request, env, 502);
    }

    return json({ ok: true }, request, env);
}

/** GET /api/auth/magic-link/verify?token=X */
export async function handleAuthMagicVerify(request: Request, env: Env, url: URL): Promise<Response> {
    const linkToken = (url.searchParams.get('token') || '').trim();
    if (!linkToken) return json({ error: 'missing_token' }, request, env, 400);

    const now = Math.floor(Date.now() / 1000);
    const row = await env.CV_DB.prepare(
        `SELECT email, expires_at, used FROM magic_link_tokens WHERE token = ?`
    ).bind(linkToken).first<{ email: string; expires_at: number; used: number }>();

    if (!row)          return json({ error: 'invalid_token' }, request, env, 404);
    if (row.used)      return json({ error: 'token_already_used' }, request, env, 410);
    if (row.expires_at < now) return json({ error: 'token_expired' }, request, env, 410);

    // Mark token used atomically
    const updateResult = await env.CV_DB.prepare(
        `UPDATE magic_link_tokens SET used = 1 WHERE token = ? AND used = 0`
    ).bind(linkToken).run();

    // If no rows changed, another request already consumed it (race condition guard)
    if (!updateResult.meta?.changes || updateResult.meta.changes < 1) {
        return json({ error: 'token_already_used' }, request, env, 410);
    }

    // Upsert identity (create on first magic-link sign-in)
    await env.CV_DB.prepare(`
        INSERT INTO user_identities (email, plan, created_at, last_seen_at)
        VALUES (?, 'free', ?, ?)
        ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at
    `).bind(row.email, now, now).run();

    const user = await env.CV_DB.prepare(
        `SELECT id, email, name, picture, plan FROM user_identities WHERE email = ?`
    ).bind(row.email).first<{ id: number; email: string; name: string; picture: string; plan: string }>();
    if (!user) return json({ error: 'db_error' }, request, env, 500);

    const sessionToken = await createSession(user.id, env);
    const is_new_user  = await checkIsNewUser(user.id, env);

    await auditLog(user.id, 'signin_magic', 'magic_link', request, env);

    return json({
        ok: true,
        session_token: sessionToken,
        is_new_user,
        user: { id: user.id, email: user.email, name: user.name || '', picture: user.picture || '', plan: user.plan },
    }, request, env);
}

/** GET /api/auth/session  (Authorization: Bearer <token>) */
export async function handleAuthSession(request: Request, env: Env): Promise<Response> {
    const sessionToken = sessionTokenFromRequest(request);
    const session = await verifySession(sessionToken, env);
    if (!session) return json({ error: 'invalid_session' }, request, env, 401);

    const now = Math.floor(Date.now() / 1000);

    // Bump last_seen_at on the identity
    await env.CV_DB.prepare(
        `UPDATE user_identities SET last_seen_at = ? WHERE id = ?`
    ).bind(now, session.userId).run().catch(() => {});

    const user = await env.CV_DB.prepare(
        `SELECT id, email, name, picture, plan FROM user_identities WHERE id = ?`
    ).bind(session.userId).first<{ id: number; email: string; name: string; picture: string; plan: string }>();
    if (!user) return json({ error: 'user_not_found' }, request, env, 404);

    return json({ ok: true, user }, request, env);
}

/** POST /api/auth/signout  (Authorization: Bearer <token>) */
export async function handleAuthSignout(request: Request, env: Env): Promise<Response> {
    const sessionToken = sessionTokenFromRequest(request);
    if (sessionToken) {
        // Fetch user before deleting for the audit log
        const session = await verifySession(sessionToken, env);
        await env.CV_DB.prepare(`DELETE FROM user_sessions WHERE token = ?`)
            .bind(sessionToken).run().catch(() => {});
        if (session) {
            await auditLog(session.userId, 'signout', 'session', request, env);
        }
    }
    return json({ ok: true }, request, env);
}

/**
 * DELETE /api/auth/account  (Authorization: Bearer <token>)
 *
 * Permanently deletes the authenticated user's account:
 *  - All sessions
 *  - All user_slots (cloud-synced CV profiles)
 *  - All profile_cache entries
 *  - The user_identities row itself
 * Magic-link tokens and LLM cache entries are keyed by hash/content, not
 * by user, so they age out naturally and are not removed here.
 */
export async function handleAuthDeleteAccount(request: Request, env: Env): Promise<Response> {
    const token = sessionTokenFromRequest(request);
    const session = await verifySession(token, env);
    if (!session) return json({ error: 'unauthorized' }, request, env, 401);

    const uid = session.userId;

    // Audit log before deletion so we have a record even if later steps fail
    await auditLog(uid, 'account_deleted', 'delete_account', request, env);

    // Delete user-scoped data in dependency order.
    // profile_cache has no user_id; delete by slot_id matching the user's slots first.
    await env.CV_DB.prepare(
        `DELETE FROM profile_cache WHERE slot_id IN (SELECT slot_id FROM user_slots WHERE user_id = ?)`
    ).bind(uid).run().catch(() => {});
    await env.CV_DB.prepare(`DELETE FROM user_slots      WHERE user_id = ?`).bind(uid).run().catch(() => {});
    await env.CV_DB.prepare(`DELETE FROM user_sessions   WHERE user_id = ?`).bind(uid).run().catch(() => {});
    await env.CV_DB.prepare(`DELETE FROM user_identities WHERE id = ?`).bind(uid).run().catch(() => {});

    return json({ ok: true }, request, env);
}

// ─── Email template ───────────────────────────────────────────────────────────

function buildMagicEmail(magicLink: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to ProCV</title>
</head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="480" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#fff;border-radius:16px;box-shadow:0 2px 16px rgba(0,0,0,0.08);overflow:hidden;max-width:100%;">
        <!-- Header -->
        <tr><td style="background:#1B2B4B;padding:24px 32px;">
          <span style="color:#C9A84C;font-size:20px;font-weight:800;letter-spacing:-0.5px;">ProCV</span>
          <span style="color:rgba(255,255,255,0.5);font-size:13px;margin-left:10px;">Your Personal Career Consultant</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 32px 24px;">
          <h1 style="color:#1B2B4B;font-size:22px;font-weight:700;margin:0 0 12px;">Sign in to ProCV</h1>
          <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 28px;">
            Click the button below to sign in securely. This link expires in
            <strong>15 minutes</strong> and can only be used once.
          </p>
          <a href="${magicLink}"
            style="display:inline-block;background:#1B2B4B;color:#fff;padding:14px 32px;
                   border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;
                   letter-spacing:-0.01em;">
            Sign in to ProCV →
          </a>
          <p style="color:#999;font-size:12px;line-height:1.5;margin:28px 0 0;">
            If you didn't request this email, you can safely ignore it — your account
            won't be affected and this link will expire automatically.<br><br>
            For your security, never share this link with anyone.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8F7F4;padding:16px 32px;border-top:1px solid #e5e2d8;">
          <p style="color:#aaa;font-size:11px;margin:0;text-align:center;">
            ProCV · Your Personal Career Consultant<br>
            You're receiving this because a sign-in was requested for this email address.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
