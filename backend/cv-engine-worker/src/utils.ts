/**
 * Shared utility functions for the cv-engine-worker.
 *
 * Pure helpers (no side-effects, no D1/KV calls) plus the CORS / JSON
 * response helpers and admin-auth logic that every handler needs.
 */

import { Env, AdminRole, AuthCtx, ROLE_RANK, VALID_ROLES } from './types';

// ─── CORS ─────────────────────────────────────────────────────────────────────

export function isAllowedOrigin(origin: string, env: Env): boolean {
    if (!origin) return false;
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.includes(origin)) return true;
    try {
        const u = new URL(origin);
        const host = u.hostname.toLowerCase();
        if (host.endsWith('.replit.dev') || host.endsWith('.replit.app') || host.endsWith('.repl.co')) return true;
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    } catch { /* not a URL — fall through */ }
    return false;
}

export function corsHeaders(request: Request, env: Env): HeadersInit {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    // With credentials:include the browser requires a specific origin, never '*'.
    const allow = isAllowedOrigin(origin, env) ? origin : (allowed[0] || '');
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, Authorization, X-Device-ID',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function json(body: unknown, request: Request, env: Env, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
    });
}

export async function safeJson(request: Request): Promise<any> {
    try { return await request.json(); } catch { return {}; }
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

export function safeParse(v: unknown): unknown {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
}

export function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function clamp(n: number, lo: number, hi: number): number {
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

export function shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

export function stringify(obj: any): string {
    if (typeof obj === 'string') return obj;
    try { return JSON.stringify(obj); } catch { return ''; }
}

export function dotSim(a: number[], b: number[]): number {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
}

export function sanitizeStringArray(arr: unknown[], maxLen: number, max: number): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of arr) {
        if (typeof v !== 'string') continue;
        const t = v.replace(/\s+/g, ' ').trim().slice(0, maxLen);
        if (t.length < 2) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
        if (out.length >= max) break;
    }
    return out;
}

// ─── Admin auth ───────────────────────────────────────────────────────────────

export async function sha256Hex(input: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyAdminAuth(
    request: Request, env: Env, required: AdminRole = 'admin'
): Promise<AuthCtx | null> {
    const token = request.headers.get('X-Admin-Token') || '';
    if (!token) return null;

    // 1) DB-backed token (preferred)
    try {
        const hash = await sha256Hex(token);
        const row = await env.CV_DB.prepare(
            `SELECT id, label, role FROM cv_admin_tokens WHERE token_hash = ? AND revoked_at IS NULL`
        ).bind(hash).first<{ id: string; label: string; role: AdminRole }>();
        if (row && VALID_ROLES.includes(row.role) && ROLE_RANK[row.role] >= ROLE_RANK[required]) {
            env.CV_DB.prepare(
                `UPDATE cv_admin_tokens SET last_used_at = datetime('now') WHERE id = ?`
            ).bind(row.id).run().catch(() => {/* swallow */});
            return { ok: true, role: row.role, label: row.label, tokenId: row.id };
        }
    } catch {/* table may not exist on first deploy */}

    // 2) Bootstrap env token
    if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) {
        return { ok: true, role: 'admin', label: 'env_bootstrap', tokenId: null };
    }
    return null;
}

export function unauthorized(request: Request, env: Env, required: AdminRole): Response {
    return json({ error: 'unauthorized', required_role: required }, request, env, 401);
}

// ─── Rate Limiting (KV-backed fixed windows) ──────────────────────────────────
//
// Uses a fixed window keyed by floor(now / windowSec).  One KV read + one
// fire-and-forget write per allowed request.  On any KV error the call is
// allowed through (fail open) so a KV outage never blocks the app.
//
// Identifier priority (most specific → least specific):
//   1. X-Device-ID header — a stable UUID the frontend mints at first load and
//      persists in localStorage.  Ties limits to the browser, not the network.
//   2. CF-Connecting-IP  — Cloudflare's authoritative client IP; present on
//      every production request but shares an address on NAT/corporate networks.
//   3. X-Forwarded-For   — fallback for dev/proxy environments.
//   4. "unknown"         — last-resort; still rate-limits but may be overly broad.
//
// Usage:
//   const rl = await rateLimitRequest(env, request, 'llm', 20, 60);
//   if (!rl.allowed) return rateLimitResponse(request, env, rl.retryAfter);

function _rateLimitId(request: Request): string {
    // Prefer device ID (browser-stable UUID), fall back to network IP
    const deviceId = request.headers.get('X-Device-ID')?.trim();
    if (deviceId && deviceId.length >= 8 && deviceId.length <= 128) return `d:${deviceId}`;
    return `ip:${
        request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0].trim()
        || 'unknown'
    }`;
}

export async function rateLimitRequest(
    env: Env,
    request: Request,
    prefix: string,
    limit: number,
    windowSec: number,
): Promise<{ allowed: boolean; retryAfter: number; remaining: number }> {
    try {
        const id    = _rateLimitId(request);
        const now   = Math.floor(Date.now() / 1000);
        const slot  = Math.floor(now / windowSec);
        const kvKey = `rl:${prefix}:${id}:${slot}`;

        const current = parseInt(await env.CV_KV.get(kvKey) ?? '0', 10);
        if (current >= limit) {
            const retryAfter = (slot + 1) * windowSec - now;
            return { allowed: false, retryAfter, remaining: 0 };
        }

        // Non-blocking increment — a race may allow a few extra requests;
        // correctness > strict precision for rate limiting.
        env.CV_KV.put(kvKey, String(current + 1), { expirationTtl: windowSec * 2 }).catch(() => {});
        return { allowed: true, retryAfter: 0, remaining: limit - current - 1 };
    } catch {
        // KV unavailable — fail open rather than blocking all traffic
        return { allowed: true, retryAfter: 0, remaining: limit };
    }
}

/** Build a standard 429 response with Retry-After HTTP header. */
export function rateLimitResponse(request: Request, env: Env, retryAfter: number): Response {
    return new Response(
        JSON.stringify({ error: 'rate_limited', retry_after: retryAfter }),
        {
            status: 429,
            headers: {
                ...corsHeaders(request, env) as Record<string, string>,
                'Content-Type': 'application/json',
                'Retry-After': String(retryAfter),
            },
        },
    );
}

/** @deprecated  Use rateLimitRequest instead.  Kept for back-compat. */
export async function ipRateLimit(
    env: Env,
    request: Request,
    prefix: string,
    limit: number,
    windowSec: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
    return rateLimitRequest(env, request, prefix, limit, windowSec);
}
