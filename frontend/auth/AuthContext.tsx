/**
 * AuthContext — single source of truth for all authentication.
 *
 * One context. One provider. No parallel systems. No FNV hashing.
 * No IDB nuclear wipes on every sign-in. No split-brain guards.
 *
 * Boot flow:
 *   GET /api/auth/session (HttpOnly cookie sent automatically by browser)
 *     200 → signed in, cache user object for display
 *     401 → signed out
 *
 * Google sign-in:
 *   Popup → access_token → POST /api/auth/google
 *   CF verifies, creates HttpOnly cookie, returns user
 *
 * Magic link:
 *   ?magic=TOKEN in URL → GET /api/auth/magic-link/verify
 *   CF marks token used, creates HttpOnly cookie, returns user
 *
 * Sign out:
 *   POST /api/auth/signout → CF clears cookie
 *   Clear one localStorage key (display cache) → done
 *
 * Account switch (different email on same device):
 *   Wipe cv_builder:* and procv:* localStorage → reload once
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
import {
    WorkerUser,
    validateSession,
    linkGoogleSession,
    verifyMagicLink,
    signOutWorker,
    deleteAccountWorker,
    clearSessionFallback,
} from '../services/authService';
import { getDeviceId } from '../services/userDataCloudService';
import { clearQueueForAccount } from '../services/storage/syncQueue';

// ─── Constants ────────────────────────────────────────────────────────────────

export const USER_CACHE_KEY  = 'procv:worker_user';
const DRIVE_SCOPE_KEY        = 'procv:drive_scope_granted';
const OAUTH_CALLBACK_KEY     = 'procv:oauth_callback';

const IDENTITY_SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

const DRIVE_SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DriveToken {
    accessToken: string;
    expiresAt: number;
}

export interface AuthContextValue {
    /** Authenticated user — null if signed out. */
    user: WorkerUser | null;
    /** True until the boot session-check resolves. */
    isLoading: boolean;
    /** True when the user has a valid server session. */
    isAuthenticated: boolean;
    /** True immediately after account creation (show welcome). */
    isNewUser: boolean;
    clearNewUser: () => void;
    /** Whether the auth modal is visible. */
    authModalOpen: boolean;
    /** 'signup' | 'signin' — controls modal header copy. */
    authModalMode: 'signup' | 'signin';
    /** Open the auth modal programmatically. */
    showSignIn: (mode?: 'signup' | 'signin') => void;
    /** Close the auth modal without signing in. */
    dismissAuth: () => void;
    /**
     * Resolves true if the user is (or becomes) authenticated.
     * Shows the auth modal if needed. Resolves false if dismissed.
     */
    requireAuth: () => Promise<boolean>;
    /** Called by AuthModal when CF has confirmed sign-in (cookie already set). */
    onAuthSuccess: (user: WorkerUser, isNew?: boolean) => void;
    /** Sign out — clears CF cookie + local display cache. */
    signOut: () => Promise<void>;
    /** Delete account — wipes CF data. Caller must wipe local data. */
    deleteAccount: (deviceId?: string) => Promise<boolean>;
    googleRateLimited: { retryAfter?: number } | null;
    clearGoogleRateLimit: () => void;
    rememberDevice: boolean;
    setRememberDevice: (v: boolean) => void;
    // Drive (memory-only, independent of ProCV session)
    driveToken: DriveToken | null;
    driveConnected: boolean;
    /** Sign in with Google (identity only) — used by AuthModal. */
    googleSignIn: () => Promise<void>;
    /** Request Drive scope via consent popup. */
    requestDriveAccess: () => Promise<void>;
    /** Revoke local Drive token (session stays alive). */
    disconnectDrive: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}

// ─── OAuth popup ──────────────────────────────────────────────────────────────

function openOAuthPopup(
    scopes: string,
    prompt = 'select_account',
): Promise<{ accessToken: string; expiresIn: number }> {
    return new Promise((resolve, reject) => {
        const clientId = (import.meta as { env: Record<string, string> }).env.VITE_GOOGLE_CLIENT_ID;
        if (!clientId) {
            reject(new Error('VITE_GOOGLE_CLIENT_ID is not set'));
            return;
        }

        try { localStorage.removeItem(OAUTH_CALLBACK_KEY); } catch { /* ignore */ }

        const redirectUri = `${window.location.origin}/oauth-callback.html`;
        const url =
            `https://accounts.google.com/o/oauth2/v2/auth` +
            `?client_id=${encodeURIComponent(clientId)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=token` +
            `&scope=${encodeURIComponent(scopes)}` +
            `&prompt=${prompt}`;

        const popup = window.open(url, 'google_auth', 'width=520,height=640,left=200,top=100');
        if (!popup) {
            reject(new Error('Popup was blocked. Please allow popups for this site and try again.'));
            return;
        }

        let settled = false;

        function settle(accessToken: string, expiresIn: number): void {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearInterval(closedPoller);
            window.removeEventListener('message', messageHandler);
            window.removeEventListener('storage', storageHandler);
            try { localStorage.removeItem(OAUTH_CALLBACK_KEY); } catch { /* ignore */ }
            resolve({ accessToken, expiresIn });
        }

        function fail(msg: string): void {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearInterval(closedPoller);
            window.removeEventListener('message', messageHandler);
            window.removeEventListener('storage', storageHandler);
            reject(new Error(msg));
        }

        const closedPoller = setInterval(() => {
            try {
                if (popup.closed) fail('Sign-in cancelled. Please try again.');
            } catch { /* cross-origin read — ignore */ }
        }, 500);

        const timer = setTimeout(() => fail('Sign-in timed out. Please try again.'), 300_000);

        function messageHandler(event: MessageEvent) {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'gdrive_token') return;
            const { access_token, expires_in, error } = event.data;
            if (error || !access_token) fail(error ?? 'No access token received');
            else settle(access_token, Number(expires_in ?? 3600));
        }

        function storageHandler(event: StorageEvent) {
            if (event.key !== OAUTH_CALLBACK_KEY || !event.newValue) return;
            try {
                const d = JSON.parse(event.newValue) as {
                    type: string; access_token: string; expires_in: string; ts: number;
                };
                if (d.type !== 'gdrive_token') return;
                if (Date.now() - (d.ts ?? 0) > 60_000) return;
                if (!d.access_token) fail('No access token received');
                else settle(d.access_token, Number(d.expires_in ?? 3600));
            } catch { fail('Sign-in callback could not be parsed. Please try again.'); }
        }

        window.addEventListener('message', messageHandler);
        window.addEventListener('storage', storageHandler);
    });
}

// ─── Account-switch wipe ──────────────────────────────────────────────────────
// Simple prefix-based localStorage wipe. No FNV hashing. No sentinels.
// No IDB nuclear wipe. Just clears user-scoped keys and reloads.

export function wipeLocalAppData(): void {
    try {
        const allKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) allKeys.push(k);
        }
        const LEGACY = [
            'profiles', 'currentCV', 'savedCVs', 'savedCoverLetters',
            'trackedApps', 'starStories', 'template',
            'cv_gdrive_token', 'cv_gdrive_expiry', 'cv_gdrive_user', 'cv_drive_last_sync',
        ];
        allKeys.forEach(k => {
            if (
                (k.startsWith('cv_builder:') && k !== 'cv_builder:deviceId') ||
                (k.startsWith('procv:')      && k !== USER_CACHE_KEY)         ||
                k.startsWith('p:') ||
                k.startsWith('cv:') ||
                LEGACY.includes(k)
            ) {
                localStorage.removeItem(k);
            }
        });
    } catch { /* non-fatal */ }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    // Seed from localStorage so the UI shows the user immediately on boot
    // without waiting for the session-validation round-trip.
    const [user, setUser] = useState<WorkerUser | null>(() => {
        try {
            const raw = localStorage.getItem(USER_CACHE_KEY);
            return raw ? (JSON.parse(raw) as WorkerUser) : null;
        } catch { return null; }
    });

    const [isLoading, setIsLoading]           = useState(true);
    const [isNewUser, setIsNewUser]           = useState(false);
    const [authModalOpen, setAuthModalOpen]   = useState(false);
    const [authModalMode, setAuthModalMode]   = useState<'signup' | 'signin'>('signup');
    const [rememberDevice, setRememberDevice] = useState(true);
    const [googleRateLimited, setGoogleRateLimited] = useState<{ retryAfter?: number } | null>(null);

    // Drive token — memory-only, never persisted
    const [driveToken, setDriveToken]       = useState<DriveToken | null>(null);
    const [driveConnected, setDriveConnected] = useState<boolean>(
        () => localStorage.getItem(DRIVE_SCOPE_KEY) === '1',
    );

    const pendingResolvers  = useRef<Array<(ok: boolean) => void>>([]);
    const driveRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Persist / clear the display cache ────────────────────────────────────

    const _saveUser = useCallback((u: WorkerUser | null) => {
        setUser(u);
        try {
            if (u) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
            else   localStorage.removeItem(USER_CACHE_KEY);
        } catch { /* quota — non-fatal */ }
    }, []);

    // ── Core: apply a confirmed session ──────────────────────────────────────
    // Handles account-switch detection inline without any hashing or sentinels.

    const _applySession = useCallback((
        incoming: WorkerUser,
        isNew = false,
        currentEmail?: string | null,
    ) => {
        if (currentEmail && incoming.email && currentEmail !== incoming.email) {
            // Different user on the same device → wipe and reload.
            // Store the new user so we can restore after reload.
            wipeLocalAppData();
            try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(incoming)); } catch { /* non-fatal */ }
            if (isNew) { try { sessionStorage.setItem('procv:pending_new_user', '1'); } catch { /* non-fatal */ } }
            window.location.reload();
            return;
        }
        clearQueueForAccount().catch(() => {});
        _saveUser(incoming);
        if (isNew) setIsNewUser(true);
        setAuthModalOpen(false);
        const queue = pendingResolvers.current.splice(0);
        queue.forEach(r => r(true));
    }, [_saveUser]);

    // ── Boot: validate session via HttpOnly cookie ────────────────────────────

    useEffect(() => {
        let cancelled = false;

        async function boot() {
            // Restore the isNewUser flag after an account-switch reload
            try {
                if (sessionStorage.getItem('procv:pending_new_user') === '1') {
                    sessionStorage.removeItem('procv:pending_new_user');
                    setIsNewUser(true);
                }
            } catch { /* non-fatal */ }

            const params = new URLSearchParams(window.location.search);

            // 1. Magic link ?magic=TOKEN
            const magicToken = params.get('magic');
            if (magicToken) {
                const clean = new URL(window.location.href);
                clean.searchParams.delete('magic');
                window.history.replaceState({}, '', clean.toString());

                const result = await verifyMagicLink(magicToken);
                if (result && !cancelled) {
                    let currentEmail: string | null = null;
                    try { currentEmail = (JSON.parse(localStorage.getItem(USER_CACHE_KEY) ?? 'null') as WorkerUser | null)?.email ?? null; } catch { /* ignore */ }
                    _applySession(result.user, result.is_new_user, currentEmail);
                }
                if (!cancelled) setIsLoading(false);
                return;
            }

            // 2. ?auth=1 redirect from delete-account flow
            if (params.get('auth') === '1') {
                const clean = new URL(window.location.href);
                clean.searchParams.delete('auth');
                window.history.replaceState({}, '', clean.toString());
                if (!cancelled) { setIsLoading(false); setAuthModalOpen(true); }
                return;
            }

            // 3. Validate via HttpOnly cookie (browser sends it automatically)
            const result = await validateSession();
            if (cancelled) return;

            if (result.user) {
                _saveUser(result.user);
            } else if (result.invalid) {
                // Server says definitively signed out
                _saveUser(null);
            }
            // Network error: keep display cache → user not kicked to landing page on cold start

            setIsLoading(false);
        }

        boot();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Cross-tab account-switch guard ────────────────────────────────────────

    useEffect(() => {
        function onStorage(e: StorageEvent) {
            if (e.key !== USER_CACHE_KEY) return;
            if (!e.newValue) {
                // Another tab signed out
                setUser(null);
                return;
            }
            try {
                const incoming = JSON.parse(e.newValue) as WorkerUser;
                if (!incoming?.email) return;
                setUser(current => {
                    if (current?.email && incoming.email !== current.email) {
                        // Different user signed in on another tab
                        wipeLocalAppData();
                        window.location.reload();
                    }
                    return current;
                });
            } catch { /* malformed — ignore */ }
        }
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // ── Google sign-in (identity only) ────────────────────────────────────────

    const googleSignIn = useCallback(async () => {
        const { accessToken } = await openOAuthPopup(IDENTITY_SCOPES);
        const deviceId = getDeviceId();

        let result = await linkGoogleSession(accessToken, deviceId);
        if (!result) { await new Promise(r => setTimeout(r, 1800)); result = await linkGoogleSession(accessToken, deviceId); }
        if (!result) { await new Promise(r => setTimeout(r, 3500)); result = await linkGoogleSession(accessToken, deviceId); }

        if (!result) throw new Error('Could not connect to ProCV server. Please try again.');
        const linked = result; // narrow out null for TypeScript flow analysis
        if (!linked.ok) {
            const rateLimitedResult = linked as { ok: false; error: 'rate_limited'; retry_after?: number };
            setGoogleRateLimited({ retryAfter: rateLimitedResult.retry_after });
            throw new Error('Too many sign-in attempts. Please try again shortly.');
        }
        setGoogleRateLimited(null);
        setUser(current => {
            _applySession(linked.user, linked.is_new_user, current?.email ?? null);
            return current;
        });
    }, [_applySession]);

    // ── Drive ─────────────────────────────────────────────────────────────────

    const _scheduleDriveRefresh = useCallback((expiresAt: number) => {
        if (driveRefreshTimer.current) clearTimeout(driveRefreshTimer.current);
        const ms = expiresAt - Date.now() - 5 * 60 * 1000;
        if (ms <= 0) return;
        driveRefreshTimer.current = setTimeout(async () => {
            try {
                const { accessToken, expiresIn } = await openOAuthPopup(DRIVE_SCOPES, 'none');
                const newExpiry = Date.now() + expiresIn * 1000 - 60_000;
                setDriveToken({ accessToken, expiresAt: newExpiry });
                _scheduleDriveRefresh(newExpiry);
            } catch { /* silently expired — user will be prompted on next Drive action */ }
        }, Math.max(ms, 0));
    }, []);

    useEffect(() => () => {
        if (driveRefreshTimer.current) clearTimeout(driveRefreshTimer.current);
    }, []);

    const requestDriveAccess = useCallback(async () => {
        const { accessToken, expiresIn } = await openOAuthPopup(DRIVE_SCOPES, 'consent');
        const expiresAt = Date.now() + expiresIn * 1000 - 60_000;
        setDriveToken({ accessToken, expiresAt });
        localStorage.setItem(DRIVE_SCOPE_KEY, '1');
        setDriveConnected(true);
        _scheduleDriveRefresh(expiresAt);
    }, [_scheduleDriveRefresh]);

    const disconnectDrive = useCallback(() => {
        localStorage.removeItem(DRIVE_SCOPE_KEY);
        localStorage.removeItem('cv_gdrive_token');
        localStorage.removeItem('cv_gdrive_expiry');
        setDriveToken(null);
        setDriveConnected(false);
        if (driveRefreshTimer.current) clearTimeout(driveRefreshTimer.current);
    }, []);

    // ── Auth modal ────────────────────────────────────────────────────────────

    const onAuthSuccess = useCallback((incoming: WorkerUser, isNew = false) => {
        setUser(current => {
            _applySession(incoming, isNew, current?.email ?? null);
            return current;
        });
    }, [_applySession]);

    const showSignIn = useCallback((mode: 'signup' | 'signin' = 'signup') => {
        setAuthModalMode(mode);
        setAuthModalOpen(true);
    }, []);

    const dismissAuth = useCallback(() => {
        setAuthModalOpen(false);
        const queue = pendingResolvers.current.splice(0);
        queue.forEach(r => r(false));
    }, []);

    const requireAuth = useCallback((): Promise<boolean> => {
        if (user) return Promise.resolve(true);
        return new Promise<boolean>(resolve => {
            pendingResolvers.current.push(resolve);
            setAuthModalOpen(true);
        });
    }, [user]);

    // ── Sign out ──────────────────────────────────────────────────────────────

    const signOut = useCallback(async () => {
        await signOutWorker().catch(() => {}); // also clears the fallback token internally
        clearSessionFallback(); // belt-and-suspenders clear in case signOutWorker threw
        _saveUser(null);
        setDriveToken(null);
        setDriveConnected(false);
        localStorage.removeItem(DRIVE_SCOPE_KEY);
        if (driveRefreshTimer.current) clearTimeout(driveRefreshTimer.current);
        setIsNewUser(false);
    }, [_saveUser]);

    // ── Delete account ────────────────────────────────────────────────────────

    const deleteAccount = useCallback(async (deviceId?: string): Promise<boolean> => {
        // deleteAccountWorker now reads the localStorage fallback token internally,
        // so no sessionToken parameter is needed here.
        return deleteAccountWorker(deviceId);
    }, []);

    // ─────────────────────────────────────────────────────────────────────────

    const value: AuthContextValue = {
        user,
        isLoading,
        isAuthenticated: !!user,
        isNewUser,
        clearNewUser:         () => setIsNewUser(false),
        authModalOpen,
        authModalMode,
        showSignIn,
        dismissAuth,
        requireAuth,
        onAuthSuccess,
        signOut,
        deleteAccount,
        googleRateLimited,
        clearGoogleRateLimit: () => setGoogleRateLimited(null),
        rememberDevice,
        setRememberDevice,
        driveToken,
        driveConnected,
        googleSignIn,
        requestDriveAccess,
        disconnectDrive,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Compatibility shims ──────────────────────────────────────────────────────
// Components that still import useGoogleAuth / useWorkerAuth from the old files
// now re-export them from here, so only the import path needs to change — not the logic.

export function useGoogleAuth() {
    const auth = useAuth();
    return {
        user: auth.user ? {
            email:       auth.user.email,
            name:        auth.user.name,
            picture:     auth.user.picture,
            accessToken: auth.driveToken?.accessToken ?? '',
            expiresAt:   auth.driveToken?.expiresAt ?? 0,
        } : null,
        loading:            auth.isLoading,
        error:              null as string | null,
        signIn:             auth.googleSignIn,
        signOut:            auth.signOut,
        isAuthenticated:    auth.isAuthenticated,
        silentRefreshing:   false,
        driveConnected:     auth.driveConnected,
        requestDriveAccess: auth.requestDriveAccess,
        disconnectDrive:    auth.disconnectDrive,
    };
}

export function useWorkerAuth() {
    const auth = useAuth();
    return {
        workerUser:            auth.user,
        isWorkerAuthenticated: auth.isAuthenticated,
        sessionToken:          null as string | null,
        isLoading:             auth.isLoading,
        isNewUser:             auth.isNewUser,
        clearNewUser:          auth.clearNewUser,
        requireAuth:           auth.requireAuth,
        showSignIn:            () => auth.showSignIn(),
        authModalOpen:         auth.authModalOpen,
        onAuthSuccess:         (_token: string, u: WorkerUser, isNew?: boolean) => auth.onAuthSuccess(u, isNew),
        onAuthDismiss:         auth.dismissAuth,
        signOut:               auth.signOut,
        rememberDevice:        auth.rememberDevice,
        setRememberDevice:     auth.setRememberDevice,
        googleRateLimited:     auth.googleRateLimited,
        clearGoogleRateLimit:  auth.clearGoogleRateLimit,
    };
}
