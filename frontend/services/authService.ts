/**
 * authService.ts — client for the cv-engine-worker /api/auth/* endpoints.
 *
 * Manages the worker-backed session token in localStorage.
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

// ─── Local storage ────────────────────────────────────────────────────────────

export function getStoredSession(): StoredSession | null {
    try {
        // Prefer persistent localStorage; fall back to tab-only sessionStorage.
        const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_TEMP_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as StoredSession;
    } catch {
        return null;
    }
}

/**
 * Persist a session.
 * @param persist true → localStorage (survives browser close, 30-day token)
 *                false → sessionStorage (cleared when the tab is closed)
 */
export function setStoredSession(token: string, user: WorkerUser, persist = true): void {
    if (persist) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        // Clean up any lingering tab-only copy from a previous session.
        sessionStorage.removeItem(SESSION_TEMP_KEY);
    } else {
        sessionStorage.setItem(SESSION_TEMP_KEY, JSON.stringify({ token, user }));
        // Do not write to localStorage so the device isn't "remembered".
    }
}

export function clearStoredSession(): void {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(SESSION_TEMP_KEY);
}

// ─── Network calls ────────────────────────────────────────────────────────────

/** Link a Google access token to the worker — creates or updates the identity row. */
export async function linkGoogleSession(
    accessToken: string,
    deviceId: string,
): Promise<{ token: string; user: WorkerUser; is_new_user: boolean } | null> {
    try {
        const res = await fetch(`${ENGINE}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken, device_id: deviceId }),
            // 18 s — generous for cold CF Worker + Google userinfo round-trip.
            // The auto-retry in WorkerAuthContext fires at 1.8 s and 5.3 s, so
            // each individual attempt still completes well within the modal wait.
            signal: AbortSignal.timeout(18_000),
        });
        if (!res.ok) return null;
        const data = await res.json() as any;
        if (!data.ok) return null;
        return { token: data.session_token, user: data.user as WorkerUser, is_new_user: !!data.is_new_user };
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
            { signal: AbortSignal.timeout(10_000) },
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
 * Validate an existing session token and return fresh user data.
 *
 * Returns:
 *  { user: WorkerUser, invalid: false } — token is valid
 *  { user: null, invalid: true }        — server says 401: token is definitively bad
 *  { user: null, invalid: false }       — network/502 error: keep session, retry later
 */
export async function validateSession(
    sessionToken: string,
): Promise<{ user: WorkerUser | null; invalid: boolean }> {
    try {
        const res = await fetch(`${ENGINE}/api/auth/session`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
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

/** Sign out — invalidates the session on the worker. */
export async function signOutWorker(sessionToken: string): Promise<void> {
    try {
        await fetch(`${ENGINE}/api/auth/signout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${sessionToken}` },
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
        const res = await fetch(`${ENGINE}/api/auth/account`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${sessionToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
