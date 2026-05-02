// auth/GoogleAuthContext.tsx
// Single source of truth for Google auth state.
//
// Persistence strategy (most resilient first):
//   1. IndexedDB  — NOT cleared by "Clear cache". Cleared only by
//                   "Clear cookies + site data" (explicit user action).
//   2. localStorage — Quick boot mirror; also acts as fallback.
//
// Silent refresh:
//   On mount, if the stored token is expired (or missing from localStorage
//   due to a cache clear), we attempt a silent re-auth via a hidden iframe
//   using prompt=none.  This succeeds as long as the user's Google session
//   cookie is still alive (~2 weeks), making the login feel permanent.
//
// Popup flow (manual sign-in):
//   Uses the same implicit OAuth flow as before.

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
    saveAuthState,
    loadAuthState,
    clearAuthState,
    updateToken,
    PersistedAuthState,
} from './AuthPersistence';

import { silentRefresh } from './SilentRefresh';

// ── Types ─────────────────────────────────────────────────────────────────

export interface GoogleUser {
    email: string;
    name: string;
    picture: string; // avatar URL from Google
    accessToken: string;
    expiresAt: number; // Unix ms
}

interface AuthContextValue {
    user: GoogleUser | null;
    loading: boolean;
    error: string | null;
    signIn: () => Promise<void>;
    signOut: () => void;
    isAuthenticated: boolean;
    /** true while a silent token refresh is running in the background */
    silentRefreshing: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const SCOPES = [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

function openOAuthPopup(): Promise<{ accessToken: string; expiresIn: number }> {
    return new Promise((resolve, reject) => {
        const clientId = (import.meta as { env: Record<string, string> }).env.VITE_GOOGLE_CLIENT_ID;
        if (!clientId) {
            reject(new Error('VITE_GOOGLE_CLIENT_ID is not set in .env'));
            return;
        }

        const redirectUri = `${window.location.origin}/oauth-callback.html`;
        const url =
            `https://accounts.google.com/o/oauth2/v2/auth` +
            `?client_id=${encodeURIComponent(clientId)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=token` +
            `&scope=${encodeURIComponent(SCOPES)}` +
            `&prompt=select_account`;

        const popup = window.open(url, 'google_auth', 'width=520,height=640,left=200,top=100');
        if (!popup) {
            reject(new Error('Popup was blocked. Please allow popups for this site and try again.'));
            return;
        }

        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            window.removeEventListener('message', handler);
            reject(new Error('Sign-in timed out. Please try again.'));
        }, 300_000);

        function handler(event: MessageEvent) {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'gdrive_token') return;
            if (settled) return;
            settled = true;
            window.removeEventListener('message', handler);
            clearTimeout(timer);

            const { access_token, expires_in, error } = event.data;
            if (error || !access_token) {
                reject(new Error(error ?? 'No access token received'));
            } else {
                resolve({ accessToken: access_token, expiresIn: Number(expires_in ?? 3600) });
            }
        }

        window.addEventListener('message', handler);
    });
}

async function fetchGoogleProfile(
    token: string
): Promise<{ email: string; name: string; picture: string }> {
    const res = await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error('Could not fetch Google profile');
    const data = await res.json();
    return {
        email: data.email ?? '',
        name: data.name ?? data.email ?? '',
        picture: data.picture ?? '',
    };
}

function stateToUser(s: PersistedAuthState): GoogleUser {
    return {
        email: s.email,
        name: s.name,
        picture: s.picture,
        accessToken: s.accessToken,
        expiresAt: s.expiresAt,
    };
}

// ── Context ───────────────────────────────────────────────────────────────

const GoogleAuthContext = createContext<AuthContextValue>({
    user: null,
    loading: false,
    error: null,
    signIn: async () => { },
    signOut: () => { },
    isAuthenticated: false,
    silentRefreshing: false,
});

// ── Provider ──────────────────────────────────────────────────────────────

export const GoogleAuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<GoogleUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [silentRefreshing, setSilentRefreshing] = useState(false);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Schedule a proactive token refresh 5 min before expiry ──────────────
    const scheduleRefresh = useCallback((expiresAt: number, email: string) => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        const msUntilRefresh = expiresAt - Date.now() - 5 * 60 * 1000; // 5 min early
        if (msUntilRefresh <= 0) return; // already expired

        refreshTimerRef.current = setTimeout(async () => {
            try {
                const { accessToken, expiresIn } = await silentRefresh(email);
                const newExpiresAt = Date.now() + expiresIn * 1000 - 60_000;
                await updateToken(accessToken, newExpiresAt);
                setUser(prev => prev ? { ...prev, accessToken, expiresAt: newExpiresAt } : null);
                scheduleRefresh(newExpiresAt, email);
            } catch {
                // Google session gone — user must manually sign in again
            }
        }, Math.max(msUntilRefresh, 0));
    }, []);

    // ── Rehydrate on mount ───────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        async function rehydrate() {
            try {
                const stored = await loadAuthState();

                if (stored && Date.now() < stored.expiresAt) {
                    // Token still valid — restore immediately
                    if (!cancelled) {
                        setUser(stateToUser(stored));
                        scheduleRefresh(stored.expiresAt, stored.email);
                    }
                } else if (stored) {
                    // Token expired BUT we have the user profile stored.
                    // Show the user instantly (optimistic) while we silently refresh.
                    if (!cancelled) {
                        // Show stale user data so the UI doesn't flash to "logged out"
                        setUser(stateToUser({ ...stored, accessToken: '' }));
                        setSilentRefreshing(true);
                    }

                    try {
                        const { accessToken, expiresIn } = await silentRefresh(stored.email);
                        const expiresAt = Date.now() + expiresIn * 1000 - 60_000;
                        const refreshed: PersistedAuthState = {
                            ...stored,
                            accessToken,
                            expiresAt,
                        };
                        await saveAuthState(refreshed);
                        if (!cancelled) {
                            setUser(stateToUser(refreshed));
                            scheduleRefresh(expiresAt, stored.email);
                        }
                    } catch {
                        // Silent refresh failed (Google session gone)
                        // Keep showing the stale profile so user sees their name,
                        // but mark them as needing to re-authenticate.
                        // The DriveStorageService will fail with 401 which will
                        // surface a helpful error.
                        if (!cancelled) {
                            // Clear the bad token to force manual re-sign-in
                            await clearAuthState();
                            setUser(null);
                        }
                    } finally {
                        if (!cancelled) setSilentRefreshing(false);
                    }
                }
                // else: user was never signed in — nothing to do
            } catch {
                // IDB unavailable or corrupted — start fresh
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        rehydrate();
        return () => { cancelled = true; };
    }, [scheduleRefresh]);

    // Cleanup refresh timer on unmount
    useEffect(() => () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    }, []);

    // ── Sign in (manual popup flow) ──────────────────────────────────────────
    const signIn = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const { accessToken, expiresIn } = await openOAuthPopup();
            const profile = await fetchGoogleProfile(accessToken);
            const expiresAt = Date.now() + expiresIn * 1000 - 60_000;

            const state: PersistedAuthState = {
                accessToken,
                expiresAt,
                email: profile.email,
                name: profile.name,
                picture: profile.picture,
            };

            await saveAuthState(state); // saves to IDB + localStorage
            setUser(stateToUser(state));
            scheduleRefresh(expiresAt, profile.email);
        } catch (err) {
            setError((err as Error).message ?? 'Sign-in failed');
        } finally {
            setLoading(false);
        }
    }, [scheduleRefresh]);

    // ── Sign out ─────────────────────────────────────────────────────────────
    const signOut = useCallback(async () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        await clearAuthState(); // clears IDB + localStorage
        setUser(null);
        setError(null);
    }, []);

    return (
        <GoogleAuthContext.Provider value={{
            user,
            loading,
            error,
            signIn,
            signOut: () => void signOut(),
            isAuthenticated: !!(user?.accessToken),
            silentRefreshing,
        }}>
            {children}
        </GoogleAuthContext.Provider>
    );
};

// ── Hook ──────────────────────────────────────────────────────────────────

export const useGoogleAuth = () => useContext(GoogleAuthContext);