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

    // ── Internal helpers ──────────────────────────────────────────────────────

    const rememberDeviceRef = useRef(rememberDevice);
    useEffect(() => { rememberDeviceRef.current = rememberDevice; }, [rememberDevice]);

    const applySession = useCallback((token: string, user: WorkerUser) => {
        setStoredSession(token, user, rememberDeviceRef.current);
        setSessionToken(token);
        setWorkerUser(user);
    }, []);

    const clearSession = useCallback(() => {
        clearStoredSession();
        setSessionToken(null);
        setWorkerUser(null);
        setIsNewUser(false);
    }, []);

    // ── Mount: restore / verify stored session + magic link ───────────────────

    useEffect(() => {
        let cancelled = false;

        async function init() {
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
                    // Fresh sign-in via magic link — wipe any stale queue items
                    // that may have been left by a previous account on this device.
                    await clearQueueForAccount();
                    applySession(result.token, result.user);
                    if (result.is_new_user) setIsNewUser(true);
                    setIsLoading(false);
                    return;
                }
            }

            // 2. Restore stored session and re-validate with worker
            const stored = getStoredSession();
            if (stored?.token) {
                const result = await validateSession(stored.token);
                if (result.user && !cancelled) {
                    // Happy path: server returned fresh user data.
                    applySession(stored.token, result.user);
                    setIsLoading(false);
                    return;
                }
                if (result.invalid) {
                    // Server definitively rejected the token (HTTP 401).
                    // Clear and fall through to show the landing page.
                    clearStoredSession();
                } else if (stored.user && !cancelled) {
                    // Network error / cold CF worker / mobile signal drop —
                    // the token is not confirmed bad, just unreachable right now.
                    // Apply the session OPTIMISTICALLY from localStorage so the
                    // user is not kicked to the landing page on every PWA cold open.
                    // The token will be re-validated on the next real API call.
                    applySession(stored.token, stored.user);
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
    useEffect(() => {
        // Guard both loading states: Worker context's own isLoading AND Google
        // context's googleLoading. Google auth rehydrates from IndexedDB async —
        // if we run before it resolves, isGoogleAuthed=false even for a valid
        // returning user, causing a spurious sign-in popup on every page load.
        if (isLoading || googleLoading) return;
        if (!isGoogleAuthed && sessionToken) {
            clearSession();
            linkedGoogleId.current = null;
        }
    }, [isGoogleAuthed, isLoading, googleLoading, sessionToken, clearSession]);

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
                applySession(result.token, result.user);
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
        if (sessionToken && workerUser) return Promise.resolve(true);
        return new Promise<boolean>(resolve => {
            pendingResolvers.current.push(resolve);
            setAuthModalOpen(true);
        });
    }, [sessionToken, workerUser]);

    const showSignIn = useCallback(() => setAuthModalOpen(true), []);

    const clearNewUser = useCallback(() => setIsNewUser(false), []);

    // ── Sign out ──────────────────────────────────────────────────────────────

    const signOut = useCallback(async () => {
        if (sessionToken) await signOutWorker(sessionToken);
        clearSession();
        linkedGoogleId.current = null;
    }, [sessionToken, clearSession]);

    const clearGoogleRateLimit = useCallback(() => setGoogleRateLimited(null), []);

    const value: WorkerAuthContextValue = {
        workerUser,
        isWorkerAuthenticated: !!sessionToken && !!workerUser,
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
