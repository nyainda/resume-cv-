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

// ─── Storage keys ─────────────────────────────────────────────────────────────

const SESSION_KEY      = 'procv:worker_session';      // localStorage (persistent)
const SESSION_TEMP_KEY = 'procv:worker_session_temp'; // sessionStorage (tab-only)
const USER_KEY         = 'procv:worker_user';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkerUser {
    id: number;
    email: string;
    name: string;
    picture: string;
    plan: 'free' | 'byok' | 'pro';
}

export interface StoredSession {
    token: string;
    user: WorkerUser;
}

// ─── One-time startup migration ───────────────────────────────────────────────
// Removes old `procv:worker_session` / `procv:worker_session_temp` entries
// that stored the raw session token.  After Rule 6 (HttpOnly cookie), only the
// non-sensitive WorkerUser object should live in local/session storage.
// This IIFE runs once when the module is first imported (app boot) and is
// idempotent — if the old key is absent it does nothing.
(function migrateSessionStorage() {
    try {
        const lsRaw = localStorage.getItem(SESSION_KEY);
        if (lsRaw) {
            const parsed = JSON.parse(lsRaw) as { token?: string; user?: { email?: string } };
            if (parsed?.user?.email) {
                // Preserve the user object; discard the raw token
                localStorage.setItem(USER_KEY, JSON.stringify(parsed.user));
            }
            localStorage.removeItem(SESSION_KEY);
        }
        const ssRaw = sessionStorage.getItem(SESSION_TEMP_KEY);
        if (ssRaw) {
            const parsed = JSON.parse(ssRaw) as { token?: string; user?: { email?: string } };
            if (parsed?.user?.email) {
                // Overwrite with a token-free copy
                sessionStorage.setItem(SESSION_TEMP_KEY, JSON.stringify({ user: parsed.user }));
            } else {
                sessionStorage.removeItem(SESSION_TEMP_KEY);
            }
        }
    } catch { /* non-fatal */ }
})();

// ─── Local storage ────────────────────────────────────────────────────────────

export function getStoredSession(): StoredSession | null {
    try {
        // Only the non-sensitive WorkerUser is stored locally — never the raw token.
        // Prefer persistent localStorage; fall back to tab-only sessionStorage.
        const userRaw = localStorage.getItem(USER_KEY);
        if (userRaw) {
            const user = JSON.parse(userRaw) as WorkerUser;
            if (user?.email) return { token: '', user };
        }
        // Legacy: some clients may still have the old combined SESSION_KEY object.
        // Read it once so they don't get kicked out, but don't write it again.
        const legacyRaw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_TEMP_KEY);
        if (legacyRaw) {
            const parsed = JSON.parse(legacyRaw) as StoredSession;
            if (parsed?.user?.email) return { token: parsed.token || '', user: parsed.user };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Persist a session.
 * Rule 6: the raw token is NEVER written to localStorage or sessionStorage.
 * Only the non-sensitive WorkerUser object is persisted so the UI can restore
 * the signed-in display state on reload.  The browser's HttpOnly cookie carries
 * the actual authentication credential automatically.
 *
 * @param persist true → localStorage (survives browser close)
 *                false → sessionStorage (cleared when the tab is closed)
 */
export function setStoredSession(token: string, user: WorkerUser, persist = true): void {
    if (persist) {
        // Store only the user object — not the token.
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        // Remove legacy combined-object keys so they can't be re-read as "old" sessions.
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_TEMP_KEY);
    } else {
        // Tab-only: still only the user object, not the token.
        sessionStorage.setItem(SESSION_TEMP_KEY, JSON.stringify({ user }));
        // Do not write to localStorage so the device isn't "remembered".
    }
}

export function clearStoredSession(): void {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(SESSION_TEMP_KEY);
}

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
    try {
        const res = await fetch(`${ENGINE}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken, device_id: deviceId }),
            credentials: 'include', // worker sets HttpOnly cookie in the response
            // 18 s — generous for cold CF Worker + Google userinfo round-trip.
            // The auto-retry in WorkerAuthContext fires at 1.8 s and 5.3 s, so
            // each individual attempt still completes well within the modal wait.
            signal: AbortSignal.timeout(18_000),
        });
        if (res.status === 429) {
            const data = await res.json().catch(() => ({})) as any;
            return { ok: false, error: 'rate_limited', retry_after: data?.retry_after };
        }
        if (!res.ok) return null;
        const data = await res.json() as any;
        if (!data.ok) return null;
        return { ok: true, token: data.session_token, user: data.user as WorkerUser, is_new_user: !!data.is_new_user };
    } catch (e) {
        console.warn('[AuthService] linkGoogleSession failed:', e);
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
