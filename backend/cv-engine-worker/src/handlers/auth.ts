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

import { Env } from "../types";
import { corsHeaders, json, safeJson, ipRateLimit } from "../utils";
import { sendAdminNotification, checkSigninSpike } from "./notifications";

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 days
const MAGIC_LINK_TTL_S = 15 * 60; // 15 minutes
const MAGIC_RATE_WINDOW_S = 15 * 60; // window to count sends
const MAGIC_RATE_MAX = 3; // max sends per window per email
const SESSION_CAP = 10; // max concurrent sessions per user

// ─── Cookie helpers ───────────────────────────────────────────────────────────
//
// The session token is delivered to the browser as an HttpOnly; Secure;
// SameSite=None cookie so it is invisible to JavaScript (XSS-safe).
// SameSite=None is required because the worker lives on a different origin
// than the React frontend.

const COOKIE_NAME = 'procv_session';

/** Build a Set-Cookie header value that stores the session token securely. */
function sessionCookieHeader(token: string, maxAge = SESSION_TTL_S): string {
    return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAge}`;
}

/** Build a Set-Cookie header value that immediately expires the cookie (sign-out). */
function clearSessionCookieHeader(): string {
    return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
}

/** Extract the session token from the Cookie header (returns '' if absent). */
function sessionCookieFromRequest(request: Request): string {
    const cookieHeader = request.headers.get('Cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    return match ? match[1].trim() : '';
}

/** Clone a Response and attach a single Set-Cookie header to it. */
function withCookie(base: Response, cookieValue: string): Response {
    const headers = new Headers(base.headers);
    headers.set('Set-Cookie', cookieValue);
    return new Response(base.body, { status: base.status, headers });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomHex(bytes = 32): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string): Promise<string> {
    const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
    );

    return Array.from(new Uint8Array(buf), (b) =>
        b.toString(16).padStart(2, "0"),
    ).join("");
}

function clientIp(request: Request): string {
    return (
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
        "unknown"
    );
}

function clientUa(request: Request): string {
    return (request.headers.get("User-Agent") || "").slice(0, 256);
}

/** Fetch the user's profile slots from D1 — included in every auth response so the
 *  client can restore profiles instantly without a second round trip. */
async function fetchUserSlots(userId: number, env: Env): Promise<Array<{
    slot_id: string; slot_name: string; color: string; profile_json: string;
}>> {
    try {
        const result = await env.CV_DB.prepare(
            `SELECT slot_id, slot_name, color, profile_json
             FROM user_slots WHERE user_id = ?
             ORDER BY created_at ASC LIMIT 20`,
        ).bind(userId).all<{ slot_id: string; slot_name: string; color: string; profile_json: string }>();
        return result.results ?? [];
    } catch {
        return [];
    }
}

interface GoogleUserInfo {
    sub: string;
    email: string;
    name: string;
    picture: string;
}

async function verifyGoogleToken(
    accessToken: string,
): Promise<GoogleUserInfo | null> {
    try {
        const res = await fetch(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(8000),
            },
        );
        if (!res.ok) return null;
        const d: any = await res.json();
        if (!d.sub || !d.email) return null;
        return {
            sub: d.sub,
            email: d.email,
            name: d.name || "",
            picture: d.picture || "",
        };
    } catch {
        return null;
    }
}

/** Create a new session and enforce the per-user session cap. */
async function createSession(userId: number, env: Env): Promise<string> {
    const token = randomHex(32); // 64-char hex = 256-bit entropy
    const hash = await hashToken(token); // store only the hash in D1 (Bug 8 fix)

    const now = Math.floor(Date.now() / 1000);

    await env.CV_DB.prepare(
        `INSERT INTO user_sessions (token, user_id, expires_at, created_at)
             VALUES (?, ?, ?, ?)`,
    )
        .bind(hash, userId, now + SESSION_TTL_S, now)
        .run();

    // Remove expired sessions for this user
    await env.CV_DB.prepare(
        `DELETE FROM user_sessions WHERE user_id = ? AND expires_at <= ?`,
    )
        .bind(userId, now)
        .run()
        .catch(() => {});

    // Enforce the per-user active session cap (keep the 10 most recent)
    await env.CV_DB.prepare(
        `
            DELETE FROM user_sessions
            WHERE user_id = ?
              AND token NOT IN (
                  SELECT token FROM user_sessions
                  WHERE user_id = ?
                  ORDER BY created_at DESC
                  LIMIT ?
              )
        `,
    )
        .bind(userId, userId, SESSION_CAP)
        .run()
        .catch(() => {});

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
         VALUES (?, ?, ?, ?, ?, ?)`,
    )
        .bind(userId, event, method, clientIp(request), clientUa(request), now)
        .run()
        .catch(() => {});
}

// ─── Exported session helper (used by other handlers to auth-gate routes) ─────

export interface SessionCtx {
    userId: number;
    email: string;
    name: string;
    picture: string;
    plan: string;
}

export async function verifySession(
    token: string | null,
    env: Env,
): Promise<SessionCtx | null> {
    if (!token) return null;

    const hash = await hashToken(token); // Bug fix: compare hash, not raw token

    const now = Math.floor(Date.now() / 1000);

    const row = await env.CV_DB.prepare(
        `
            SELECT s.user_id, u.email, u.name, u.picture, u.plan
            FROM user_sessions s
            JOIN user_identities u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > ?
        `,
    )
        .bind(hash, now)
        .first<{
            user_id: number;
            email: string;
            name: string;
            picture: string;
            plan: string;
        }>();

    if (!row) return null;

    return {
        userId: row.user_id,
        email: row.email,
        name: row.name,
        picture: row.picture ?? "",
        plan: row.plan,
    };
}

function sessionTokenFromRequest(request: Request): string {
    // Cookie first (HttpOnly — invisible to JS, XSS-safe).
    // Bearer header accepted as a migration fallback for existing in-memory tokens.
    const fromCookie = sessionCookieFromRequest(request);
    if (fromCookie) return fromCookie;
    const h = request.headers.get("Authorization") || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/** POST /api/auth/google */
export async function handleAuthGoogle(
    request: Request,
    env: Env,
    ctx?: ExecutionContext,
): Promise<Response> {
    // Rate-limit: 20 Google sign-in / sign-up attempts per IP per hour.
    const rl = await ipRateLimit(env, request, "auth:google", 20, 3600);
    if (!rl.allowed) {
        return json(
            { error: "rate_limited", retry_after: rl.retryAfter },
            request,
            env,
            429,
        );
    }

    const body = await safeJson(request);
    const token =
        typeof body?.access_token === "string" ? body.access_token.trim() : "";
    const deviceId =
        typeof body?.device_id === "string" ? body.device_id.trim() : "";

    if (!token)
        return json({ error: "missing_access_token" }, request, env, 400);

    const gUser = await verifyGoogleToken(token);
    if (!gUser)
        return json({ error: "invalid_google_token" }, request, env, 401);

    const now = Math.floor(Date.now() / 1000);

    // Three-path identity resolution — avoids UNIQUE constraint collisions that
    // occur when the same email already exists (from a magic-link sign-up) and
    // we naively INSERT ... ON CONFLICT(google_id) — that conflict lands on the
    // email column, not google_id, so the ON CONFLICT clause never fires.
    //
    // Path 1: returning Google user (google_id already known)
    // Path 2: email-first user (magic-link account) — merge by linking google_id
    // Path 3: brand-new user — insert fresh row

    type UserRow = {
        id: number;
        email: string;
        name: string;
        picture: string;
        plan: string;
    };

    let user: UserRow | null = await env.CV_DB.prepare(
        `SELECT id, email, name, picture, plan FROM user_identities WHERE google_id = ?`,
    )
        .bind(gUser.sub)
        .first<UserRow>();

    // Bug 6 fix: track new-ness at insert time instead of re-deriving from session count.
    // Session count is fragile (race with cap cleanup, merge edge case with c=2).
    let isNewInsert = false;

    if (user) {
        // Path 1: refresh profile info for returning Google user
        await env.CV_DB.prepare(
            `
            UPDATE user_identities
            SET name = ?, picture = ?, email = ?, last_seen_at = ?
            WHERE google_id = ?
        `,
        )
            .bind(gUser.name, gUser.picture, gUser.email, now, gUser.sub)
            .run();
        user = {
            ...user,
            name: gUser.name,
            picture: gUser.picture,
            email: gUser.email,
        };
    } else {
        // Path 2: check for a magic-link account with the same email
        const byEmail = await env.CV_DB.prepare(
            `SELECT id, email, name, picture, plan FROM user_identities WHERE email = ?`,
        )
            .bind(gUser.email)
            .first<UserRow>();

        if (byEmail) {
            // Merge: link this Google identity onto the existing magic-link row (not new)
            await env.CV_DB.prepare(
                `
                UPDATE user_identities
                SET google_id = ?, name = ?, picture = ?, last_seen_at = ?
                WHERE id = ?
            `,
            )
                .bind(gUser.sub, gUser.name, gUser.picture, now, byEmail.id)
                .run();
            user = { ...byEmail, name: gUser.name, picture: gUser.picture };
        } else {
            // Path 3: brand-new user — safe to insert (no conflicts possible)
            isNewInsert = true;
            await env.CV_DB.prepare(
                `
                INSERT INTO user_identities
                  (google_id, email, name, picture, device_id, plan, created_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, 'free', ?, ?)
            `,
            )
                .bind(
                    gUser.sub,
                    gUser.email,
                    gUser.name,
                    gUser.picture,
                    deviceId || null,
                    now,
                    now,
                )
                .run();
            user = await env.CV_DB.prepare(
                `SELECT id, email, name, picture, plan FROM user_identities WHERE google_id = ?`,
            )
                .bind(gUser.sub)
                .first<UserRow>();
        }
    }

    if (!user) return json({ error: "db_error" }, request, env, 500);

    const sessionToken = await createSession(user.id, env);
    await auditLog(user.id, "signin_google", "google", request, env);

    // Fire admin notifications server-side so delivery never depends on an
    // admin having the panel open — see handlers/notifications.ts header.
    const notify = isNewInsert
        ? sendAdminNotification(env, "new_signup", "New User Signed Up", `**${user.email}** just created an account via Google.`, "#22C55E")
        : sendAdminNotification(env, "new_signin", "User Signed In", `**${user.email}** signed in via Google.`, "#60A5FA");
    const spike = checkSigninSpike(env);
    if (ctx) { ctx.waitUntil(notify); ctx.waitUntil(spike); }
    else { await Promise.allSettled([notify, spike]); }

    const slots = await fetchUserSlots(user.id, env);
    return withCookie(
        json(
            {
                ok: true,
                session_token: sessionToken,
                is_new_user: isNewInsert,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    picture: user.picture,
                    plan: user.plan,
                },
                slots,
            },
            request,
            env,
        ),
        sessionCookieHeader(sessionToken),
    );
}

/** POST /api/auth/magic-link/send */
export async function handleAuthMagicSend(
    request: Request,
    env: Env,
): Promise<Response> {
    // Bug 3 fix: IP rate limit — 10 sends per IP per hour (prevents email-quota burn via rotating addresses)
    const ipRl = await ipRateLimit(env, request, "auth:magic:send", 10, 3600);
    if (!ipRl.allowed) {
        return json(
            { error: "rate_limited", retry_after: ipRl.retryAfter },
            request,
            env,
            429,
        );
    }

    const body = await safeJson(request);
    const email =
        typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const rawUrl = typeof body?.app_url === "string" ? body.app_url.trim() : "";

    if (!email || !email.includes("@") || email.length < 5) {
        return json({ error: "invalid_email" }, request, env, 400);
    }
    if (!env.BREVO_API_KEY) {
        return json({ error: "email_not_configured" }, request, env, 503);
    }

    // Bug 5 fix: validate app_url against allowlist — prevents open redirect phishing
    const allowedOrigins: string[] = [
        "https://procv.app",
        "https://www.procv.app",
        ...(env.ALLOWED_ORIGINS
            ? env.ALLOWED_ORIGINS.split(",").map((s: string) => s.trim())
            : []),
    ];
    const base = allowedOrigins.includes(rawUrl)
        ? rawUrl.replace(/\/$/, "")
        : "https://procv.app";

    // ── Rate limit: max MAGIC_RATE_MAX sends per email per MAGIC_RATE_WINDOW_S ─
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - MAGIC_RATE_WINDOW_S;
    const recentRow = await env.CV_DB.prepare(
        `SELECT COUNT(*) as c FROM magic_link_tokens WHERE email = ? AND created_at > ?`,
    )
        .bind(email, windowStart)
        .first<{ c: number }>();

    if ((recentRow?.c ?? 0) >= MAGIC_RATE_MAX) {
        return json(
            {
                error: "rate_limited",
                message: `Too many sign-in emails requested. Please wait ${MAGIC_RATE_WINDOW_S / 60} minutes and try again.`,
                retry_after: MAGIC_RATE_WINDOW_S,
            },
            request,
            env,
            429,
        );
    }

    const linkToken = randomHex(32);

    await env.CV_DB.prepare(
        `INSERT INTO magic_link_tokens (token, email, expires_at, used, created_at)
         VALUES (?, ?, ?, 0, ?)`,
    )
        .bind(linkToken, email, now + MAGIC_LINK_TTL_S, now)
        .run();

    const magicLink = `${base}/?magic=${linkToken}`;

    const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "api-key": env.BREVO_API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            sender: { name: "ProCV", email: "noreply@procv.app" },
            to: [{ email }],
            subject: "Your ProCV sign-in link",
            htmlContent: buildMagicEmail(magicLink),
        }),
    });

    if (!emailRes.ok) {
        const errTxt = await emailRes.text().catch(() => "");
        console.error("[Auth] Brevo error:", errTxt);
        return json({ error: "email_send_failed" }, request, env, 502);
    }

    return json({ ok: true }, request, env);
}

/** GET /api/auth/magic-link/verify?token=X */
export async function handleAuthMagicVerify(
    request: Request,
    env: Env,
    url: URL,
    ctx?: ExecutionContext,
): Promise<Response> {
    // Bug 4 fix: IP rate limit — 20 verify attempts per IP per hour (token enumeration guard)
    const ipRl = await ipRateLimit(env, request, "auth:magic:verify", 20, 3600);
    if (!ipRl.allowed) {
        return json(
            { error: "rate_limited", retry_after: ipRl.retryAfter },
            request,
            env,
            429,
        );
    }

    const linkToken = (url.searchParams.get("token") || "").trim();
    if (!linkToken) return json({ error: "missing_token" }, request, env, 400);

    const now = Math.floor(Date.now() / 1000);
    const row = await env.CV_DB.prepare(
        `SELECT email, expires_at, used FROM magic_link_tokens WHERE token = ?`,
    )
        .bind(linkToken)
        .first<{ email: string; expires_at: number; used: number }>();

    if (!row) return json({ error: "invalid_token" }, request, env, 404);
    if (row.used)
        return json({ error: "token_already_used" }, request, env, 410);
    if (row.expires_at < now)
        return json({ error: "token_expired" }, request, env, 410);

    // Mark token used atomically
    const updateResult = await env.CV_DB.prepare(
        `UPDATE magic_link_tokens SET used = 1 WHERE token = ? AND used = 0`,
    )
        .bind(linkToken)
        .run();

    // If no rows changed, another request already consumed it (race condition guard)
    if (!updateResult.meta?.changes || updateResult.meta.changes < 1) {
        return json({ error: "token_already_used" }, request, env, 410);
    }

    // Bug 6 fix: determine new-user status BEFORE the upsert — a pre-existing row
    // means returning user, no row means brand new. Avoids fragile session-count heuristic.
    const existing = await env.CV_DB.prepare(
        `SELECT id FROM user_identities WHERE email = ?`,
    )
        .bind(row.email)
        .first<{ id: number }>();
    const isNewInsert = !existing;

    // Upsert identity (create on first magic-link sign-in)
    await env.CV_DB.prepare(
        `
        INSERT INTO user_identities (email, plan, created_at, last_seen_at)
        VALUES (?, 'free', ?, ?)
        ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at
    `,
    )
        .bind(row.email, now, now)
        .run();

    const user = await env.CV_DB.prepare(
        `SELECT id, email, name, picture, plan FROM user_identities WHERE email = ?`,
    )
        .bind(row.email)
        .first<{
            id: number;
            email: string;
            name: string;
            picture: string;
            plan: string;
        }>();
    if (!user) return json({ error: "db_error" }, request, env, 500);

    const sessionToken = await createSession(user.id, env);
    await auditLog(user.id, "signin_magic", "magic_link", request, env);

    // See handlers/notifications.ts header — fired server-side so delivery
    // never depends on an admin having the panel open.
    const notify = isNewInsert
        ? sendAdminNotification(env, "new_signup", "New User Signed Up", `**${user.email}** just created an account via Magic Link.`, "#22C55E")
        : sendAdminNotification(env, "new_signin", "User Signed In", `**${user.email}** signed in via Magic Link.`, "#60A5FA");
    const spike = checkSigninSpike(env);
    if (ctx) { ctx.waitUntil(notify); ctx.waitUntil(spike); }
    else { await Promise.allSettled([notify, spike]); }

    const slots = await fetchUserSlots(user.id, env);
    return withCookie(
        json(
            {
                ok: true,
                session_token: sessionToken,
                is_new_user: isNewInsert,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name || "",
                    picture: user.picture || "",
                    plan: user.plan,
                },
                slots,
            },
            request,
            env,
        ),
        sessionCookieHeader(sessionToken),
    );
}

/** GET /api/auth/session  (Authorization: Bearer <token>) */
export async function handleAuthSession(
    request: Request,
    env: Env,
): Promise<Response> {
    const token = sessionTokenFromRequest(request);
    const session = await verifySession(token, env);
    if (!session) return json({ error: "invalid_session" }, request, env, 401);

    // Bug 9 fix: verifySession already JOINs user_identities and returns email/name/picture/plan.
    // No second query needed — just bump last_seen_at and return the data we already have.
    const now = Math.floor(Date.now() / 1000);
    await env.CV_DB.prepare(
        `UPDATE user_identities SET last_seen_at = ? WHERE id = ?`,
    )
        .bind(now, session.userId)
        .run()
        .catch(() => {});

    const slots = await fetchUserSlots(session.userId, env);
    return json(
        {
            ok: true,
            user: {
                id: session.userId,
                email: session.email,
                name: session.name,
                picture: session.picture,
                plan: session.plan,
            },
            slots,
        },
        request,
        env,
    );
}

/** POST /api/auth/signout  (Authorization: Bearer <token> OR cookie) */
export async function handleAuthSignout(
    request: Request,
    env: Env,
): Promise<Response> {
    const sessionToken = sessionTokenFromRequest(request);

    if (sessionToken) {
        // Fetch user before deleting for audit log
        const session = await verifySession(sessionToken, env);

        // Bug fix: D1 stores hashed tokens, not raw tokens
        const hash = await hashToken(sessionToken);

        await env.CV_DB.prepare(`DELETE FROM user_sessions WHERE token = ?`)
            .bind(hash)
            .run()
            .catch(() => {});

        if (session) {
            await auditLog(session.userId, "signout", "session", request, env);
        }
    }

    // Always clear the HttpOnly cookie regardless of whether a Bearer token was present.
    return withCookie(json({ ok: true }, request, env), clearSessionCookieHeader());
}
/**
 * DELETE /api/auth/account  (Authorization: Bearer <token>)
 *
 * Permanently deletes the authenticated user's account and ALL data
 * associated with their user_id AND their device_id:
 *  - All sessions
 *  - All user_slots (user_id-scoped AND orphan device_id-only rows)
 *  - All profile_cache entries
 *  - The user_identities row itself
 *
 * Note: the five legacy device_id-keyed tables (saved_cvs, tracked_applications,
 * star_stories, saved_cover_letters, custom_templates) were dropped in migration
 * 032 (2026-06-21) after being confirmed empty. Their DELETE statements have been
 * removed accordingly.
 *
 * Magic-link tokens and LLM cache entries are keyed by hash/content,
 * not by user, so they age out naturally and are not removed here.
 */
export async function handleAuthDeleteAccount(
    request: Request,
    env: Env,
): Promise<Response> {
    const token = sessionTokenFromRequest(request);
    const session = await verifySession(token, env);
    if (!session) return json({ error: "unauthorized" }, request, env, 401);

    const uid = session.userId;

    // ── Step 1: Fetch device_id BEFORE deleting user_identities ──────────────
    // Accept device_id from the request body as the primary source (always sent
    // by the client since v2026-06).  Fall back to user_identities.device_id
    // for accounts where it was stored at signup (Google sign-up only).
    let bodyDeviceId = '';
    try {
        const body: any = await request.clone().json().catch(() => ({}));
        bodyDeviceId = typeof body?.device_id === 'string' ? body.device_id.trim().substring(0, 64) : '';
    } catch { /* non-fatal */ }

    const identityRow = await env.CV_DB.prepare(
        `SELECT device_id FROM user_identities WHERE id = ?`
    ).bind(uid).first<{ device_id: string | null }>();
    // Prefer the body device_id (always the live browser value); fall back to
    // the one stored at signup in case the client didn't send it.
    const deviceId = bodyDeviceId || identityRow?.device_id || '';

    // ── Step 2: Non-FK tables — best-effort, never block the identity delete ──
    // profile_cache, saved_cvs, etc. have no FK to user_identities so these
    // cannot cause a FK violation on the identity row. Run them first and
    // individually so a partial failure here doesn't abort the critical chain.

    // profile_cache — scoped directly by user_id (migration 035). Deliberately
    // NOT `WHERE slot_id IN (...)`: a slot_id is a client-generated UUID, not a
    // guaranteed-unique key across accounts (that collision is exactly the bug
    // migration 035 fixed), so deleting by slot_id membership could remove
    // another user's rows if their slot_id ever collided with this one.
    // Deleting by this account's own user_id can only ever touch its own rows.
    await env.CV_DB.prepare(
        `DELETE FROM profile_cache WHERE user_id = ?`,
    ).bind(uid).run().catch(() => {});

    // ── Step 3: Atomic FK-chain deletion via D1 batch ─────────────────────────
    //
    // WHY BATCH: Cloudflare D1 enforces FK constraints by default.  The old
    // approach used individual `await ... .catch(() => {})` statements —
    // meaning if ANY step failed silently, the later `DELETE FROM user_identities`
    // also failed silently (FK violation from surviving child rows), leaving the
    // identity row alive in D1.  On the next sign-in with the same email,
    // handleAuthGoogle Path 2 (email match) would find the old row, reuse the
    // same user_id, and serve all the "deleted" profile data back.
    //
    // The batch executes all statements as a single atomic unit.  If any
    // statement fails the whole batch fails — we catch it, return ok:false, and
    // the frontend shows a visible warning instead of silently leaking data.
    //
    // ORDER within the batch MATTERS for FK safety:
    //   user_slots       → references user_identities(id)  [mig 026]
    //   user_preferences → references user_identities(id)  [mig 026]
    //   user_sessions    → references user_identities(id)  [mig 024]
    //   public_profiles  → references user_identities(id)  [mig 027]
    //   auth_audit_log   → references user_identities(id)  [mig 025]
    //   user_identities  → must be last (all FKs cleared above)
    //
    // The audit log row written at the START (before batch) is also deleted
    // here so that user_identities can be deleted without FK violation.

    // Write the audit log BEFORE the batch — we want a record even if the
    // batch fails, and the batch itself deletes all audit rows for this user.
    await auditLog(uid, "account_deleted", "delete_account", request, env);

    const fkBatch = [
        // user_slots (FK → user_identities)
        env.CV_DB.prepare(`DELETE FROM user_slots WHERE user_id = ?`).bind(uid),
        // user_preferences by user_id (FK → user_identities, mig 026 row)
        env.CV_DB.prepare(`DELETE FROM user_preferences WHERE user_id = ?`).bind(uid),
        // user_sessions (FK → user_identities)
        env.CV_DB.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).bind(uid),
        // public_profiles (FK → user_identities, mig 027)
        env.CV_DB.prepare(`DELETE FROM public_profiles WHERE user_id = ?`).bind(uid),
        // cv_shares attributed to this user (mig 037) — anonymous shares have no user_id and are unaffected
        env.CV_DB.prepare(`DELETE FROM cv_shares WHERE user_id = ?`).bind(uid),
        // auth_audit_log (FK → user_identities, mig 025) — includes the row
        // written above by auditLog(), so must come before user_identities.
        env.CV_DB.prepare(`DELETE FROM auth_audit_log WHERE user_id = ?`).bind(uid),
        // LAST: user_identities — only reachable once all FK children are gone.
        env.CV_DB.prepare(`DELETE FROM user_identities WHERE id = ?`).bind(uid),
    ];

    // Also wipe orphan device-only user_slots and legacy device-keyed prefs.
    if (deviceId) {
        fkBatch.unshift(
            env.CV_DB.prepare(`DELETE FROM user_slots WHERE device_id = ? AND user_id IS NULL`).bind(deviceId),
            env.CV_DB.prepare(`DELETE FROM user_preferences WHERE device_id = ?`).bind(deviceId),
        );
    }

    try {
        await env.CV_DB.batch(fkBatch);
    } catch (batchErr: any) {
        // The batch failed — user_identities may still exist in D1.
        // Log for diagnostics and return a real error so the frontend can warn
        // the user that server-side cleanup is incomplete.
        console.error('[DeleteAccount] FK-chain batch failed:', batchErr?.message ?? batchErr);

        // Last-resort: attempt to delete user_identities directly (e.g. if FK
        // enforcement is momentarily disabled or the batch error was transient).
        await env.CV_DB.prepare(`DELETE FROM user_identities WHERE id = ?`)
            .bind(uid).run().catch(() => {});

        // Verify whether the identity row is actually gone.
        const stillExists = await env.CV_DB.prepare(
            `SELECT id FROM user_identities WHERE id = ?`
        ).bind(uid).first<{ id: number }>();

        if (stillExists) {
            return json(
                { ok: false, error: 'deletion_incomplete', detail: batchErr?.message ?? 'batch_failed' },
                request, env, 500,
            );
        }
        // Identity gone despite batch error — return success (data IS cleaned).
    }

    // Expire the session cookie so the browser doesn't hold a stale HttpOnly
    // token after the account is gone from D1.  Without this, the browser keeps
    // sending the cookie on the next load; verifySession returns 401 (session
    // row deleted above) but the cookie persists until it naturally expires.
    return new Response(
        JSON.stringify({ ok: true, device_id_wiped: !!deviceId }),
        {
            status: 200,
            headers: {
                ...corsHeaders(request, env),
                'Content-Type': 'application/json',
                'Set-Cookie': clearSessionCookieHeader(),
            },
        },
    );
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
