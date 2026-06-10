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
    verifyMagicLink,
    validateSession,
    signOutWorker,
} from '../services/authService';

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
     * Ensures the user is signed in. Resolves immediately if already authed;
     * otherwise shows the AuthModal and resolves after sign-in completes.
     */
    requireAuth: () => Promise<void>;
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
    const { user: googleUser, isAuthenticated: isGoogleAuthed } = useGoogleAuth();

    const [workerUser,    setWorkerUser]    = useState<WorkerUser | null>(null);
    const [sessionToken,  setSessionToken]  = useState<string | null>(null);
    const [isLoading,     setIsLoading]     = useState(true);
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [isNewUser,     setIsNewUser]     = useState(false);

    // Queue of resolvers waiting for auth to complete
    const pendingResolvers = useRef<Array<() => void>>([]);
    // Track whether we've already tried to link the current Google user
    const linkedGoogleId = useRef<string | null>(null);

    // ── Internal helpers ──────────────────────────────────────────────────────

    const applySession = useCallback((token: string, user: WorkerUser) => {
        setStoredSession(token, user);
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
                    applySession(result.token, result.user);
                    if (result.is_new_user) setIsNewUser(true);
                    setIsLoading(false);
                    return;
                }
            }

            // 2. Restore stored session and re-validate with worker
            const stored = getStoredSession();
            if (stored?.token) {
                const freshUser = await validateSession(stored.token);
                if (freshUser && !cancelled) {
                    applySession(stored.token, freshUser);
                    setIsLoading(false);
                    return;
                }
                // Token is stale — clear it
                clearStoredSession();
            }

            if (!cancelled) setIsLoading(false);
        }

        init();
        return () => { cancelled = true; };
    }, [applySession]);

    // ── Auto-link Google token to worker when Google auth completes ───────────

    useEffect(() => {
        if (!isGoogleAuthed || !googleUser) return;
        // Only link once per unique Google user (avoids re-linking on every re-render)
        const googleSub = googleUser.email;
        if (linkedGoogleId.current === googleSub) return;
        linkedGoogleId.current = googleSub;

        const deviceId = localStorage.getItem('procv:device_id') || '';

        linkGoogleSession(googleUser.accessToken, deviceId).then(result => {
            if (result) {
                applySession(result.token, result.user);
                if (result.is_new_user) setIsNewUser(true);
            }
            // Always resolve pending requireAuth() promises when Google auth completes.
            // If worker linkage failed (worker not deployed), generation still
            // proceeds — graceful degradation until the worker is live.
            const queue = pendingResolvers.current.splice(0);
            queue.forEach(r => r());
            setAuthModalOpen(false);
        });
    }, [isGoogleAuthed, googleUser, applySession]);

    // ── Auth modal callbacks ──────────────────────────────────────────────────

    const onAuthSuccess = useCallback((token: string, user: WorkerUser, isNew = false) => {
        applySession(token, user);
        if (isNew) setIsNewUser(true);
        setAuthModalOpen(false);
        const queue = pendingResolvers.current.splice(0);
        queue.forEach(r => r());
    }, [applySession]);

    const onAuthDismiss = useCallback(() => {
        setAuthModalOpen(false);
        // Resolve (not reject) pending promises — the caller checks
        // isWorkerAuthenticated separately if it needs to gate something.
        const queue = pendingResolvers.current.splice(0);
        queue.forEach(r => r());
    }, []);

    // ── requireAuth ───────────────────────────────────────────────────────────

    const requireAuth = useCallback((): Promise<void> => {
        if (sessionToken && workerUser) return Promise.resolve();
        return new Promise<void>(resolve => {
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
    };

    return (
        <WorkerAuthContext.Provider value={value}>
            {children}
        </WorkerAuthContext.Provider>
    );
}
