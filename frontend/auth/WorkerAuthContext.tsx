// @refresh reset
/**
 * WorkerAuthContext — manages the server-backed session token.
 *
 * Responsibilities:
 *  1. On mount — restore session from localStorage and validate it with the worker.
 *  2. On mount — check URL for ?magic=TOKEN and verify it automatically.
 *  3. When Google OAuth completes — link the Google token to the worker session.
 *  4. Expose requireAuth() — returns a Promise that resolves once the user is
 *     signed in (shows <AuthModal> if needed).
 *  5. Track isNewUser — true after the first ever sign-in so the app can show
 *     a welcome screen.
 */

import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef,
    ReactNode,
} from 'react';
import { useGoogleAuth } from './GoogleAuthContext';
import {
    WorkerUser,
    getStoredSession,
    setStoredSession,
    clearStoredSession,
    linkGoogleSession,
    type LinkGoogleResult,
    verifyMagicLink,
    validateSession,
    signOutWorker,
} from '../services/authService';
import { clearQueueForAccount } from '../services/storage/syncQueue';
import { getDeviceId } from '../services/userDataCloudService';
import {
    clearUserScopedStorage,
    ACCOUNT_HASH_KEY,
    LAST_REAL_HASH_KEY,
    SIGNED_OUT_SENTINEL,
    DELETED_CLEAN_SENTINEL,
} from '../utils/clearUserStorage';

// ─── Account switch helpers ───────────────────────────────────────────────────
// These run BEFORE applySession so the new user's data is never mixed with
// the previous user's data in React state.

const _PENDING_SESSION_KEY = 'procv:pending_session';

/** FNV-32 hash of an email address (must match the version in App.tsx). */
function _hashEmail(email: string): string {
    let h = 2166136261;
    for (let i = 0; i < email.length; i++) {
        h ^= email.charCodeAt(i);
        h = (h * 16777619) >>> 0;
    }
    return h.toString(16);
}

/**
 * Returns true when signing in as `email` would require wiping the previous
 * user's data — i.e. a genuinely different account is taking over this device.
 */
function _needsAccountWipe(email: string): boolean {
    const newHash    = _hashEmail(email);
    const storedHash = localStorage.getItem(ACCOUNT_HASH_KEY);
    if (!storedHash || storedHash === newHash) return false;
    if (storedHash === DELETED_CLEAN_SENTINEL)  return false; // already wiped cleanly
    if (storedHash === SIGNED_OUT_SENTINEL) {
        // Same user returning after sign-out → no wipe
        const lastRealHash = localStorage.getItem(LAST_REAL_HASH_KEY);
        if (lastRealHash && lastRealHash === newHash) return false;
    }
    return true;
}

/**
 * Wipe the previous user's data and save the new user's session in
 * sessionStorage so it can be restored after the reload — no second sign-in.
 */
function _wipeAndHandoff(token: string, user: WorkerUser): void {
    try {
        sessionStorage.setItem(_PENDING_SESSION_KEY, JSON.stringify({ token, user }));
    } catch { /* storage full — non-fatal, user will just need to sign in again */ }
    clearUserScopedStorage({ clearAppData: true });
    localStorage.setItem(ACCOUNT_HASH_KEY, _hashEmail(user.email));
    window.location.reload();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkerAuthContextValue {
    /** Authenticated worker user (null if anonymous). */
    workerUser: WorkerUser | null;
    /** True once we have a valid server session token. */
    isWorkerAuthenticated: boolean;
    /** The session token stored in localStorage. */
    sessionToken: string | null;
    /** True while validating a stored or magic-link token on mount. */
    isLoading: boolean;
    /**
     * True immediately after the very first sign-in (brand-new account).
     * Reset to false once the welcome screen is dismissed.
     */
    isNewUser: boolean;
    /** Clear the new-user flag (called after the welcome modal is closed). */
    clearNewUser: () => void;
    /**
     * Ensures the user is signed in. Resolves true if authenticated,
     * false if the user dismissed the modal without signing in.
     */
    requireAuth: () => Promise<boolean>;
    /** Call this to show the sign-in modal voluntarily. */
    showSignIn: () => void;
    /** True when the AuthModal should be visible. */
    authModalOpen: boolean;
    /** Called by <AuthModal> when the user successfully signs in. */
    onAuthSuccess: (token: string, user: WorkerUser, isNew?: boolean) => void;
    /** Called by <AuthModal> when it is dismissed without signing in. */
    onAuthDismiss: () => void;
    /** Sign out — clears session locally and on the worker. */
    signOut: () => Promise<void>;
    /** Whether to remember this device (persist session across browser closes). */
    rememberDevice: boolean;
    setRememberDevice: (v: boolean) => void;
    /** Set when Google sign-in is blocked by the IP rate limit (20/hr). */
    googleRateLimited: { retryAfter?: number } | null;
    /** Clear the rate-limit notice (e.g. when modal closes). */
    clearGoogleRateLimit: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WorkerAuthContext = createContext<WorkerAuthContextValue | null>(null);

export function useWorkerAuth(): WorkerAuthContextValue {
    const ctx = useContext(WorkerAuthContext);
    if (!ctx) throw new Error('useWorkerAuth must be used inside <WorkerAuthProvider>');
    return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WorkerAuthProvider({ children }: { children: ReactNode }) {
    const { user: googleUser, isAuthenticated: isGoogleAuthed, loading: googleLoading } = useGoogleAuth();

    const [workerUser,    setWorkerUser]    = useState<WorkerUser | null>(null);
    const [sessionToken,  setSessionToken]  = useState<string | null>(null);
    const [isLoading,     setIsLoading]     = useState(true);
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [isNewUser,     setIsNewUser]     = useState(false);
    const [rememberDevice, setRememberDevice] = useState(true);
    const [googleRateLimited, setGoogleRateLimited] = useState<{ retryAfter?: number } | null>(null);

    // Queue of resolvers waiting for auth to complete.
    // Resolves with true on success, false if dismissed without signing in.
    const pendingResolvers = useRef<Array<(success: boolean) => void>>([]);
    // Track whether we've already tried to link the current Google user
    const linkedGoogleId = useRef<string | null>(null);

    // Tracks whether the CURRENT session was established via Google OAuth.
    // Persisted in localStorage so it survives page reloads.
    // This is the key that guards the "Bug 5 fix" effect — we only clear the
    // worker session if Google auth dies AND the session was linked via Google.
    // Magic-link sessions are independent of Google and must NOT be cleared
    // when Google auth is unavailable (e.g. VITE_GOOGLE_CLIENT_ID not set).
    const SESSION_VIA_GOOGLE_KEY = 'procv:session_via_google';
    const [sessionViaGoogle, setSessionViaGoogle] = useState<boolean>(
        () => localStorage.getItem(SESSION_VIA_GOOGLE_KEY) === '1'
    );

    // ── Internal helpers ──────────────────────────────────────────────────────

    const rememberDeviceRef = useRef(rememberDevice);
    useEffect(() => { rememberDeviceRef.current = rememberDevice; }, [rememberDevice]);

    const applySession = useCallback((token: string, user: WorkerUser, viaGoogle = false) => {
        setStoredSession(token, user, rememberDeviceRef.current);
        setSessionToken(token);
        setWorkerUser(user);
        if (viaGoogle) {
            try { localStorage.setItem(SESSION_VIA_GOOGLE_KEY, '1'); } catch { /* non-fatal */ }
            setSessionViaGoogle(true);
        } else {
            try { localStorage.removeItem(SESSION_VIA_GOOGLE_KEY); } catch { /* non-fatal */ }
            setSessionViaGoogle(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const clearSession = useCallback(() => {
        clearStoredSession();
        try { localStorage.removeItem(SESSION_VIA_GOOGLE_KEY); } catch { /* non-fatal */ }
        setSessionToken(null);
        setWorkerUser(null);
        setIsNewUser(false);
        setSessionViaGoogle(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Mount: restore / verify stored session + magic link ───────────────────

    useEffect(() => {
        let cancelled = false;

        async function init() {
            // 0. Restore a pending session saved before a wipe+reload.
            //    This happens when a different user signs in: we wipe the previous
            //    user's data, save the new session to sessionStorage, reload, then
            //    pick it up here — so the user is signed in immediately without a
            //    second sign-in attempt.
            const pendingRaw = sessionStorage.getItem(_PENDING_SESSION_KEY);
            if (pendingRaw) {
                sessionStorage.removeItem(_PENDING_SESSION_KEY);
                try {
                    const pending = JSON.parse(pendingRaw) as { token: string; user: WorkerUser };
                    if (pending?.token && pending?.user?.email && !cancelled) {
                        await clearQueueForAccount();
                        applySession(pending.token, pending.user);
                        setIsLoading(false);
                        return;
                    }
                } catch { /* malformed — fall through to normal init */ }
            }

            // 1. Check for ?magic=TOKEN in URL first
            const params = new URLSearchParams(window.location.search);
            const magicToken = params.get('magic');

            if (magicToken) {
                // Remove from URL immediately (before async work) so a refresh
                // doesn't re-submit the token
                const clean = new URL(window.location.href);
                clean.searchParams.delete('magic');
                window.history.replaceState({}, '', clean.toString());

                const result = await verifyMagicLink(magicToken);
                if (result && !cancelled) {
                    // If a DIFFERENT user's data is in localStorage, wipe it
                    // BEFORE applying the new session so they never see each
                    // other's data. The new session is handed off via sessionStorage
                    // and restored at the top of the next init() call.
                    if (_needsAccountWipe(result.user.email)) {
                        _wipeAndHandoff(result.token, result.user);
                        return; // page is reloading — don't do anything else
                    }
                    // Fresh sign-in via magic link — wipe any stale queue items
                    // that may have been left by a previous account on this device.
                    await clearQueueForAccount();
                    applySession(result.token, result.user);
                    if (result.is_new_user) setIsNewUser(true);
                    setIsLoading(false);
                    return;
                }
            }

            // 1b. Check for ?auth=1 — written by handleDeleteAccount before reload
            //     so we land directly on the sign-in modal instead of a blank landing page.
            const openAuthParam = params.get('auth');
            if (openAuthParam === '1') {
                const clean = new URL(window.location.href);
                clean.searchParams.delete('auth');
                window.history.replaceState({}, '', clean.toString());
                if (!cancelled) {
                    setIsLoading(false);
                    setAuthModalOpen(true);
                }
                return;
            }

            // 2. Restore stored session and re-validate with worker.
            //    Rule 6: the raw token is no longer persisted to localStorage.
            //    We check for a stored WorkerUser object instead and validate via
            //    the HttpOnly cookie (credentials: 'include').  If the user also
            //    has an in-memory legacy token (stored.token non-empty) it is
            //    forwarded as a Bearer fallback during the migration period.
            const stored = getStoredSession();
            if (stored?.user?.email) {
                // Preserve the Google-session flag that was written at sign-in time.
                const wasViaGoogle = localStorage.getItem(SESSION_VIA_GOOGLE_KEY) === '1';

                // Pass the legacy token only when it is non-empty (migration fallback).
                const result = await validateSession(stored.token || undefined);
                if (result.user && !cancelled) {
                    // Happy path: server confirmed session via cookie (or Bearer fallback).
                    applySession(stored.token || '', result.user, wasViaGoogle);
                    setIsLoading(false);
                    return;
                }
                if (result.invalid) {
                    // Server definitively rejected the session (HTTP 401).
                    // Clear and fall through to show the landing page.
                    clearStoredSession();
                } else if (!cancelled) {
                    // Network error / cold CF worker / mobile signal drop —
                    // session is not confirmed bad, just unreachable right now.
                    // Apply OPTIMISTICALLY from localStorage so the user is not
                    // kicked to the landing page on every PWA cold open.
                    applySession(stored.token || '', stored.user, wasViaGoogle);
                    setIsLoading(false);
                    return;
                }
            }

            if (!cancelled) setIsLoading(false);
        }

        init();
        return () => { cancelled = true; };
    }, [applySession]);

    // ── Bug 5 fix: Clean up worker session when Google auth dies ─────────────
    // If Google's silent-refresh fails (session truly expired), GoogleAuthContext
    // sets user=null. Worker session would otherwise remain alive (split-brain).
    // authLoading guard prevents false-positive on first render before IDB rehydrates.
    //
    // IMPORTANT: Only clear the session if it was ESTABLISHED VIA GOOGLE.
    // Magic-link sessions are fully independent of Google auth — we must NOT
    // wipe them when Google is unavailable (e.g. VITE_GOOGLE_CLIENT_ID not set,
    // silent refresh failed, or user never granted Google access).
    useEffect(() => {
        // Guard both loading states: Worker context's own isLoading AND Google
        // context's googleLoading. Google auth rehydrates from IndexedDB async —
        // if we run before it resolves, isGoogleAuthed=false even for a valid
        // returning user, causing a spurious sign-in popup on every page load.
        if (isLoading || googleLoading) return;
        if (!isGoogleAuthed && sessionToken && sessionViaGoogle) {
            clearSession();
            linkedGoogleId.current = null;
        }
    }, [isGoogleAuthed, isLoading, googleLoading, sessionToken, sessionViaGoogle, clearSession]);

    // ── Auto-link Google token to worker when Google auth completes ───────────

    useEffect(() => {
        if (!isGoogleAuthed || !googleUser) return;
        // Only link once per unique Google user (avoids re-linking on every re-render)
        const googleSub = googleUser.email;
        if (linkedGoogleId.current === googleSub) return;
        linkedGoogleId.current = googleSub;

        const deviceId = getDeviceId();

        // Keep the Google access token in a local variable so the retry closure
        // can reference it even if googleUser has changed by the time it fires.
        const accessToken = googleUser.accessToken;

        (async () => {
            let result = await linkGoogleSession(accessToken, deviceId);

            // Auto-retry up to 2 more times with short backoff.
            // Handles cold Cloudflare Workers (first request after inactivity can
            // take 3-5 s) and transient network blips that cause the first attempt
            // to time out or return a 502.  The Google access token stays valid for
            // ~1 h, so reusing it is safe.
            if (!result) {
                await new Promise(r => setTimeout(r, 1800));
                result = await linkGoogleSession(accessToken, deviceId);
            }
            if (!result) {
                await new Promise(r => setTimeout(r, 3500));
                result = await linkGoogleSession(accessToken, deviceId);
            }

            if (result && result.ok) {
                // Fresh Google sign-in — wipe any stale queue items left by
                // a previous account on this device before starting the session.
                await clearQueueForAccount();
                applySession(result.token, result.user, true); // viaGoogle = true
                if (result.is_new_user) setIsNewUser(true);
                setGoogleRateLimited(null);
            } else if (result && !result.ok && result.error === 'rate_limited') {
                // IP rate-limited (20 sign-in attempts/IP/hour) — surface to UI.
                linkedGoogleId.current = null;
                setGoogleRateLimited({ retryAfter: result.retry_after });
                console.warn('[WorkerAuth] Google sign-in rate-limited.');
            } else {
                // null = network failure / timeout — reset so the user can retry.
                linkedGoogleId.current = null;
                console.warn('[WorkerAuth] Google session linkage failed after 3 attempts.');
            }

            // Resolve pending requireAuth() promises — true because Google auth
            // succeeded even if worker linkage failed (Google session is live).
            const queue = pendingResolvers.current.splice(0);
            queue.forEach(r => r(true));
            setAuthModalOpen(false);
        })();
    }, [isGoogleAuthed, googleUser, applySession]);

    // ── Auth modal callbacks ──────────────────────────────────────────────────

    const onAuthSuccess = useCallback((token: string, user: WorkerUser, isNew = false) => {
        // If a DIFFERENT user's data is in localStorage, wipe it BEFORE applying
        // the new session so accounts never see each other's data.
        // The new session is saved to sessionStorage and restored after the reload.
        if (_needsAccountWipe(user.email)) {
            _wipeAndHandoff(token, user);
            return; // page is reloading
        }
        // Fresh sign-in from the auth modal — clear any stale queue items
        // that may have been left by a previous account on this device.
        clearQueueForAccount().catch(() => {});
        applySession(token, user);
        if (isNew) setIsNewUser(true);
        setAuthModalOpen(false);
        const queue = pendingResolvers.current.splice(0);
        queue.forEach(r => r(true));
    }, [applySession]);

    const onAuthDismiss = useCallback(() => {
        setAuthModalOpen(false);
        // Resolve with false — user dismissed without signing in.
        const queue = pendingResolvers.current.splice(0);
        queue.forEach(r => r(false));
    }, []);

    // ── requireAuth ───────────────────────────────────────────────────────────

    const requireAuth = useCallback((): Promise<boolean> => {
        // Cookie-based sessions: authenticated when workerUser exists,
        // regardless of whether an in-memory token is present.
        if (workerUser) return Promise.resolve(true);
        return new Promise<boolean>(resolve => {
            pendingResolvers.current.push(resolve);
            setAuthModalOpen(true);
        });
    }, [workerUser]);

    const showSignIn = useCallback(() => setAuthModalOpen(true), []);

    const clearNewUser = useCallback(() => setIsNewUser(false), []);

    // ── Sign out ──────────────────────────────────────────────────────────────

    const signOut = useCallback(async () => {
        // Always attempt sign-out; the HttpOnly cookie is the primary credential.
        // Pass the in-memory token as a Bearer fallback during migration.
        await signOutWorker(sessionToken || undefined);
        clearSession();
        linkedGoogleId.current = null;
    }, [sessionToken, clearSession]);

    const clearGoogleRateLimit = useCallback(() => setGoogleRateLimited(null), []);

    const value: WorkerAuthContextValue = {
        workerUser,
        isWorkerAuthenticated: !!workerUser,
        sessionToken,
        isLoading,
        isNewUser,
        clearNewUser,
        requireAuth,
        showSignIn,
        authModalOpen,
        onAuthSuccess,
        onAuthDismiss,
        signOut,
        rememberDevice,
        setRememberDevice,
        googleRateLimited,
        clearGoogleRateLimit,
    };

    return (
        <WorkerAuthContext.Provider value={value}>
            {children}
        </WorkerAuthContext.Provider>
    );
}
