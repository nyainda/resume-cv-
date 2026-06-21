/**
 * authService.ts — client for the cv-engine-worker /api/auth/* endpoints.
 *
 * Session management — Rule 6 (HttpOnly cookie):
 *   The raw session token is NEVER persisted to localStorage or sessionStorage.
 *   On sign-in the worker sets an HttpOnly; Secure; SameSite=None cookie that
 *   the browser attaches automatically to every cross-origin fetch made with
 *   `credentials: 'include'`.  Only the non-sensitive WorkerUser object (email,
 *   name, picture, plan) is stored locally so the UI can restore the signed-in
 *   state without an extra network round-trip on page reload.
 *   The raw token may exist briefly in React state (in-memory only) to support
 *   the Bearer-header migration fallback during the transition period.
 *
 * All network calls fail gracefully — the app continues working in offline/
 * anonymous mode if the worker is unreachable.
 */

const ENGINE = import.meta.env.VITE_CV_ENGINE_URL as string;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkerUser {
    id: number;
    email: string;
    name: string;
    picture: string;
    plan: 'free' | 'byok' | 'pro';
}

// One-time migration: remove legacy session keys that stored the raw token.
// Idempotent — safe to run on every import.
try {
    ['procv:worker_session', 'procv:worker_session_temp'].forEach(k => {
        const raw = localStorage.getItem(k) ?? sessionStorage.getItem(k);
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as { user?: WorkerUser };
                if (parsed?.user?.email) localStorage.setItem('procv:worker_user', JSON.stringify(parsed.user));
            } catch { /* ignore */ }
            localStorage.removeItem(k);
            sessionStorage.removeItem(k);
        }
    });
} catch { /* non-fatal */ }

// ─── Network calls ────────────────────────────────────────────────────────────

export type LinkGoogleResult =
    | { ok: true;  token: string; user: WorkerUser; is_new_user: boolean }
    | { ok: false; error: 'rate_limited'; retry_after?: number }
    | null; // network failure / timeout

/** Link a Google access token to the worker — creates or updates the identity row. */
export async function linkGoogleSession(
    accessToken: string,
    deviceId: string,
): Promise<LinkGoogleResult> {
    console.log('[AuthService] linkGoogleSession → POST', `${ENGINE}/api/auth/google`);
    try {
        const res = await fetch(`${ENGINE}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken, device_id: deviceId }),
            credentials: 'include', // worker sets HttpOnly cookie in the response
            signal: AbortSignal.timeout(18_000),
        });
        console.log('[AuthService] linkGoogleSession HTTP', res.status);
        if (res.status === 429) {
            const data = await res.json().catch(() => ({})) as any;
            console.warn('[AuthService] linkGoogleSession — rate limited, retry_after:', data?.retry_after);
            return { ok: false, error: 'rate_limited', retry_after: data?.retry_after };
        }
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error('[AuthService] linkGoogleSession — non-OK response:', res.status, body);
            return null;
        }
        const data = await res.json() as any;
        console.log('[AuthService] linkGoogleSession response body:', JSON.stringify(data));
        if (!data.ok) {
            console.warn('[AuthService] linkGoogleSession — server returned ok:false', data);
            return null;
        }
        console.log('[AuthService] linkGoogleSession ✓ — user:', data.user?.email, '| is_new_user:', data.is_new_user);
        return { ok: true, token: data.session_token, user: data.user as WorkerUser, is_new_user: !!data.is_new_user };
    } catch (e) {
        console.error('[AuthService] linkGoogleSession threw:', (e as Error).message ?? e);
        return null;
    }
}

/**
 * Send a magic-link email. Pass the current app origin so the link
 * redirects back to the right domain (dev vs prod).
 */
export async function sendMagicLink(email: string, appUrl: string): Promise<{ ok: boolean; error?: string; retry_after?: number }> {
    try {
        const res = await fetch(`${ENGINE}/api/auth/magic-link/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, app_url: appUrl }),
            signal: AbortSignal.timeout(15_000),
        });
        const data = await res.json() as any;
        if (!res.ok) return { ok: false, error: data?.error || 'send_failed', retry_after: data?.retry_after };
        return { ok: true };
    } catch (e) {
        console.warn('[AuthService] sendMagicLink failed:', e);
        return { ok: false, error: 'network_error' };
    }
}

/** Verify a magic-link token (from the ?magic= URL param). */
export async function verifyMagicLink(
    token: string,
): Promise<{ token: string; user: WorkerUser; is_new_user: boolean } | null> {
    try {
        const res = await fetch(
            `${ENGINE}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`,
            {
                credentials: 'include', // receive the HttpOnly session cookie in the response
                signal: AbortSignal.timeout(10_000),
            },
        );
        if (!res.ok) return null;
        const data = await res.json() as any;
        if (!data.ok) return null;
        return { token: data.session_token, user: data.user as WorkerUser, is_new_user: !!data.is_new_user };
    } catch (e) {
        console.warn('[AuthService] verifyMagicLink failed:', e);
        return null;
    }
}

/**
 * Validate an existing session and return fresh user data.
 *
 * The primary authentication mechanism is the HttpOnly cookie (sent automatically
 * by the browser via `credentials: 'include'`).  An optional Bearer token may
 * also be passed as a migration fallback for clients that still have an in-memory
 * token but have not yet received the cookie.
 *
 * Returns:
 *  { user: WorkerUser, invalid: false } — session is valid
 *  { user: null, invalid: true }        — server says 401: session definitively bad
 *  { user: null, invalid: false }       — network/502 error: keep local state, retry later
 */
export async function validateSession(
    sessionToken?: string,
): Promise<{ user: WorkerUser | null; invalid: boolean }> {
    try {
        const headers: Record<string, string> = {};
        if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
        const res = await fetch(`${ENGINE}/api/auth/session`, {
            headers,
            credentials: 'include', // browser sends HttpOnly cookie automatically
            signal: AbortSignal.timeout(8_000),
        });
        if (res.status === 401) return { user: null, invalid: true };
        if (!res.ok) return { user: null, invalid: false }; // 502 / server down — keep session
        const data = await res.json() as any;
        const user = data.ok ? (data.user as WorkerUser) : null;
        return { user, invalid: !user };
    } catch {
        // Network error or timeout — do not invalidate the stored session
        return { user: null, invalid: false };
    }
}

/**
 * Sign out — invalidates the session on the worker and clears the HttpOnly cookie.
 * An optional Bearer token may be passed for the migration fallback period.
 */
export async function signOutWorker(sessionToken?: string): Promise<void> {
    try {
        const headers: Record<string, string> = {};
        if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
        await fetch(`${ENGINE}/api/auth/signout`, {
            method: 'POST',
            headers,
            credentials: 'include', // browser sends cookie; worker clears it with Max-Age=0
            signal: AbortSignal.timeout(5_000),
        });
    } catch { /* fire-and-forget */ }
}

/**
 * Delete account — removes the user's session and all server-side data.
 * Sends device_id in the request body so the worker can wipe ALL legacy
 * device_id-keyed tables (saved_cvs, tracked_applications, star_stories,
 * saved_cover_letters, user_preferences, custom_templates) in addition to
 * the user_id-scoped tables.  Without this, those rows survive deletion and
 * reappear when the same device re-registers with the same Google account.
 * Returns true on success, false on any error (caller should still clear local data).
 */
export async function deleteAccountWorker(sessionToken: string, deviceId?: string): Promise<boolean> {
    try {
        const body: Record<string, string> = {};
        if (deviceId) body.device_id = deviceId;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
        const res = await fetch(`${ENGINE}/api/auth/account`, {
            method: 'DELETE',
            headers,
            credentials: 'include',
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
