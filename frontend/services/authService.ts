/**
 * authService.ts — client for the cv-engine-worker /api/auth/* endpoints.
 *
 * Session management:
 *   The HttpOnly SameSite=None cookie set by the CF worker is the PRIMARY auth
 *   mechanism — it is XSS-safe and invisible to JS. However, since the worker
 *   lives on cv-engine-worker.dripstech.workers.dev (a different origin from the
 *   app), it is a *third-party* cookie. Safari ITP, Chrome in Incognito, and
 *   browsers with strict privacy settings silently block third-party cookies,
 *   causing the session validation to return 401 and logging the user out on
 *   every page refresh.
 *
 *   To fix this without compromising the cookie-first architecture, a session
 *   token fallback is stored in localStorage under SESSION_FALLBACK_KEY.
 *   - On sign-in the raw token is saved to localStorage.
 *   - validateSession / deleteAccountWorker send it as 'Authorization: Bearer'
 *     ONLY when the cookie-only call returns 401 (i.e. the cookie isn't working).
 *   - On sign-out / account-delete the token is cleared.
 *   - The CF worker already accepts both Cookie and Bearer — no server change needed.
 *
 * All network calls fail gracefully — the app continues in offline/anonymous mode
 * if the worker is unreachable.
 */

const ENGINE = import.meta.env.VITE_CV_ENGINE_URL as string;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkerUser {
    id: number;
    email: string;
    name: string;
    picture: string;
    // Mirrors the D1 `user_identities.plan` column, which only ever holds
    // 'free' or 'premium'. BYOK is a separate, client-detected runtime state
    // (key presence) — never a stored plan value — see accountTierService.ts.
    plan: 'free' | 'premium';
}

/** Lightweight slot shape returned alongside every auth response. */
export interface RawSlot {
    slot_id: string;
    slot_name: string;
    color: string;
    profile_json: string;
}

// Slots returned with the most recent auth/session response.
// Drained once by App.tsx on the first isAuthenticated=true render so
// profiles load instantly with no extra round trip.
let _pendingSlots: RawSlot[] | null = null;

/** Drain and return the slots that arrived with the last auth response.
 *  Returns null if none were present. Clears the buffer on read. */
export function drainPendingSlots(): RawSlot[] | null {
    const s = _pendingSlots;
    _pendingSlots = null;
    return s;
}

// ─── Session token fallback ───────────────────────────────────────────────────
// Used when SameSite=None HttpOnly cookies are blocked by browser privacy settings.
// Not a security regression: the server still validates the token against D1, and
// the token is cleared on every sign-out / account deletion.
//
// Security hardening: tokens are stored with a `savedAt` timestamp and
// auto-expired client-side after 7 days, reducing the XSS exposure window
// from the server's full 30-day TTL down to 7 days.

const SESSION_FALLBACK_KEY  = 'procv:stf';
const TOKEN_MAX_AGE_MS       = 7 * 24 * 60 * 60 * 1000; // 7 days

export function saveSessionFallback(token: string): void {
    try {
        if (token) {
            const payload = JSON.stringify({ token, savedAt: Date.now() });
            localStorage.setItem(SESSION_FALLBACK_KEY, payload);
        }
    } catch { /* quota — ignore */ }
}

export function loadSessionFallback(): string {
    try {
        const raw = localStorage.getItem(SESSION_FALLBACK_KEY);
        if (!raw) return '';

        // New JSON format: { token, savedAt }
        try {
            const parsed = JSON.parse(raw) as { token?: string; savedAt?: number };
            if (typeof parsed?.token === 'string') {
                if (parsed.savedAt && Date.now() - parsed.savedAt > TOKEN_MAX_AGE_MS) {
                    // Token too old — clear it and force re-authentication
                    localStorage.removeItem(SESSION_FALLBACK_KEY);
                    return '';
                }
                return parsed.token;
            }
        } catch { /* not JSON — must be a legacy plain hex string */ }

        // Legacy format: plain hex string written by older code.
        // Migrate it to the new timestamped format immediately so it will
        // expire correctly on a future page load.
        saveSessionFallback(raw);
        return raw;
    } catch { return ''; }
}

export function clearSessionFallback(): void {
    try { localStorage.removeItem(SESSION_FALLBACK_KEY); } catch { /* ignore */ }
}

// ─── One-time migration: remove legacy session keys ───────────────────────────
// Idempotent — safe to run on every import.
try {
    ['procv:worker_session', 'procv:worker_session_temp'].forEach(k => {
        const raw = localStorage.getItem(k) ?? sessionStorage.getItem(k);
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as { user?: WorkerUser; token?: string };
                if (parsed?.user?.email) localStorage.setItem('procv:worker_user', JSON.stringify(parsed.user));
                if (parsed?.token) saveSessionFallback(parsed.token);
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
        // Store the session token as a fallback for browsers that block
        // third-party SameSite=None cookies (Safari ITP, Chrome Incognito, etc.).
        if (data.session_token) saveSessionFallback(data.session_token);
        // Cache slots so App.tsx can restore profiles instantly with no extra round trip.
        if (Array.isArray(data.slots) && data.slots.length > 0) _pendingSlots = data.slots as RawSlot[];
        console.log('[AuthService] linkGoogleSession ✓ — user:', data.user?.email, '| is_new_user:', data.is_new_user, '| slots:', data.slots?.length ?? 0);
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
        // Store fallback token so the session survives if the cookie is blocked
        if (data.session_token) saveSessionFallback(data.session_token);
        if (Array.isArray(data.slots) && data.slots.length > 0) _pendingSlots = data.slots as RawSlot[];
        return { token: data.session_token, user: data.user as WorkerUser, is_new_user: !!data.is_new_user };
    } catch (e) {
        console.warn('[AuthService] verifyMagicLink failed:', e);
        return null;
    }
}

/**
 * Validate an existing session and return fresh user data.
 *
 * Strategy (two-pass):
 *  Pass 1 — send ONLY the cookie (credentials: 'include'), no Bearer header.
 *            If the browser has a working HttpOnly cookie this succeeds here.
 *  Pass 2 — if pass 1 returns 401, the cookie is blocked by the browser.
 *            Retry with the localStorage fallback token as Authorization: Bearer.
 *
 * Returns:
 *  { user: WorkerUser, invalid: false } — session is valid
 *  { user: null, invalid: true }        — both passes returned 401: definitively signed out
 *  { user: null, invalid: false }       — network/502 error: keep local state, retry later
 */
export async function validateSession(): Promise<{ user: WorkerUser | null; invalid: boolean }> {
    // ── Pass 1: cookie-only (preferred — XSS-safe) ───────────────────────────
    try {
        const res1 = await fetch(`${ENGINE}/api/auth/session`, {
            credentials: 'include',
            signal: AbortSignal.timeout(8_000),
        });
        if (res1.ok) {
            const data = await res1.json() as any;
            const user = data.ok ? (data.user as WorkerUser) : null;
            if (user) {
                if (Array.isArray(data.slots) && data.slots.length > 0) _pendingSlots = data.slots as RawSlot[];
                return { user, invalid: false };
            }
        }
        if (res1.status !== 401) {
            // 502 / server down — keep display cache, don't log out
            return { user: null, invalid: false };
        }
        // 401 → cookie not working → try fallback
    } catch {
        return { user: null, invalid: false };
    }

    // ── Pass 2: Bearer token fallback (for browsers blocking 3rd-party cookies) ──
    const fallback = loadSessionFallback();
    if (!fallback) {
        // No fallback token stored — definitively signed out
        return { user: null, invalid: true };
    }
    try {
        const res2 = await fetch(`${ENGINE}/api/auth/session`, {
            headers: { 'Authorization': `Bearer ${fallback}` },
            credentials: 'include',
            signal: AbortSignal.timeout(8_000),
        });
        if (res2.status === 401) {
            // Fallback token also invalid — clear it so we don't retry forever
            clearSessionFallback();
            return { user: null, invalid: true };
        }
        if (!res2.ok) return { user: null, invalid: false }; // server error — keep cache
        const data = await res2.json() as any;
        const user = data.ok ? (data.user as WorkerUser) : null;
        if (user && Array.isArray(data.slots) && data.slots.length > 0) _pendingSlots = data.slots as RawSlot[];
        return { user, invalid: !user };
    } catch {
        return { user: null, invalid: false };
    }
}

/**
 * Sign out — invalidates the session on the worker and clears the HttpOnly cookie.
 */
export async function signOutWorker(): Promise<void> {
    const fallback = loadSessionFallback();
    clearSessionFallback(); // clear immediately, before the network call
    try {
        const headers: Record<string, string> = {};
        if (fallback) headers['Authorization'] = `Bearer ${fallback}`;
        await fetch(`${ENGINE}/api/auth/signout`, {
            method: 'POST',
            headers,
            credentials: 'include',
            signal: AbortSignal.timeout(5_000),
        });
    } catch { /* fire-and-forget */ }
}

/**
 * Delete account — removes the user's session and all server-side data.
 * Sends device_id in the request body so the worker can wipe ALL legacy
 * device_id-keyed tables in addition to the user_id-scoped tables.
 * Uses the localStorage fallback token as a Bearer header if the HttpOnly
 * cookie is unavailable (e.g. blocked by browser privacy settings).
 * Returns true on success, false on any error.
 */
export async function deleteAccountWorker(deviceId?: string): Promise<boolean> {
    const fallback = loadSessionFallback();
    try {
        const body: Record<string, string> = {};
        if (deviceId) body.device_id = deviceId;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (fallback) headers['Authorization'] = `Bearer ${fallback}`;
        const res = await fetch(`${ENGINE}/api/auth/account`, {
            method: 'DELETE',
            headers,
            credentials: 'include',
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
            clearSessionFallback(); // account gone — token is useless
            return true;
        }
        return false;
    } catch {
        return false;
    }
}
