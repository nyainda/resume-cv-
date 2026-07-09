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
import {
    setStorageUser,
    clearStorageUser,
    migrateToUserNamespace,
} from '../services/storage/userStorageNamespace';
import {
    stampSignedOut,
    ACCOUNT_HASH_KEY,
    SIGNED_OUT_SENTINEL,
} from '../utils/clearUserStorage';
import { migrateDriveFilesToUserScope } from '../services/storage/DriveStorageService';

// ─── Constants ────────────────────────────────────────────────────────────────

export const USER_CACHE_KEY  = 'procv:worker_user';
const DRIVE_SCOPE_KEY        = 'procv:drive_scope_granted';
// StorageRouter reads these to decide whether Drive sync is active.
// Must stay in sync with StorageRouter.ts TOKEN_KEY / EXPIRY_KEY.
const DRIVE_TOKEN_KEY        = 'cv_gdrive_token';
const DRIVE_EXPIRY_KEY       = 'cv_gdrive_expiry';
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

// ─── Google account verification ──────────────────────────────────────────────
// Fetch the email address the access token belongs to via the tokeninfo endpoint.
// Used to verify Drive OAuth grants match the signed-in ProCV account so a
// different Google account's appDataFolder can't silently overwrite local data.

/**
 * Fetch the email address associated with a Google OAuth access token.
 * Throws if the email cannot be determined so callers can fail-closed
 * rather than silently accepting a token whose owner is unknown.
 */
async function fetchGoogleAccountEmail(accessToken: string): Promise<string> {
    let res: Response;
    try {
        res = await fetch(
            `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
            { signal: AbortSignal.timeout(8_000) },
        );
    } catch {
        throw new Error(
            'Unable to verify your Google account — please check your connection and try again.',
        );
    }
    if (!res.ok) {
        throw new Error(
            'Unable to verify your Google account — the verification request failed. Please try again.',
        );
    }
    const data = await res.json() as { email?: string };
    if (!data.email) {
        throw new Error(
            'Unable to verify your Google account — no email was returned. Please try again.',
        );
    }
    return data.email;
}

// ─── OAuth popup ──────────────────────────────────────────────────────────────

function openOAuthPopup(
    scopes: string,
    prompt = 'select_account',
    loginHint?: string,
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
            `&prompt=${prompt}` +
            (loginHint ? `&login_hint=${encodeURIComponent(loginHint)}` : '');

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
// Called whenever a different email signs in on the same device.
// Clears ALL user-scoped localStorage keys, sets IDB-skip sentinels (so
// restoreLocalStorageFromIDB cannot re-inject the old user's data on next
// boot), and fires fire-and-forget IDB deletes for belt-and-suspenders safety.

export function wipeLocalAppData(): void {
    try {
        // ── 1. IDB-skip sentinels — written SYNCHRONOUSLY before any async work ──
        // restoreLocalStorageFromIDB() checks 'cv_appdata_cleared' on boot and
        // skips the restore if set, preventing old IDB data from coming back.
        // loadAuthState() checks 'procv:google_auth_cleared' and skips the
        // stale Google auth token, preventing silent re-auth as the old user.
        try { localStorage.setItem('cv_appdata_cleared', '1'); }       catch { /* non-fatal */ }
        try { localStorage.setItem('procv:google_auth_cleared', '1'); } catch { /* non-fatal */ }

        // ── 2. Clear user-scoped localStorage keys ────────────────────────────────
        // Collect all keys first — mutating localStorage while iterating its numeric
        // indices shifts subsequent indices and silently skips keys.
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
                // Unprefixed legacy keys (old namespace)
                (k.startsWith('cv_builder:') && k !== 'cv_builder:deviceId') ||
                (k.startsWith('procv:')      && k !== USER_CACHE_KEY)         ||
                k.startsWith('p:') ||
                k.startsWith('cv:') ||
                // New user-scoped keys (u_<uid>:* and anon:*)
                k.startsWith('u_') ||
                k.startsWith('anon:') ||
                LEGACY.includes(k)
            ) {
                localStorage.removeItem(k);
            }
        });

        // ── 3. Fire-and-forget IDB deletes ────────────────────────────────────────
        // Delete base DB names AND all known user-scoped variants.
        // Since we don't know all user IDs, we enumerate the existing databases
        // and delete any that match our naming pattern.
        const BASE_IDB = [
            'cv_builder_auth',
            'cv_builder_cvdata',
            'cv_builder_appdata',
            'cv_builder_sync',
            'cv_builder_keyvault',
        ];
        BASE_IDB.forEach(name => {
            try { indexedDB.deleteDatabase(name); } catch { /* non-fatal */ }
        });
        // Also delete user-scoped databases by enumerating all IDB databases
        if (typeof indexedDB.databases === 'function') {
            indexedDB.databases().then(dbs => {
                dbs.forEach(db => {
                    if (!db.name) return;
                    const isOurs = BASE_IDB.some(base =>
                        db.name === base ||
                        db.name!.startsWith(base + '_u_') ||
                        db.name!.startsWith(base + '_anon'),
                    );
                    if (isOurs) {
                        try { indexedDB.deleteDatabase(db.name!); } catch { /* non-fatal */ }
                    }
                });
            }).catch(() => { /* browsers without indexedDB.databases() — already handled above */ });
        }
    } catch { /* non-fatal */ }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    // Seed from localStorage so the UI shows the user immediately on boot
    // without waiting for the session-validation round-trip.
    // Security: always force plan to 'free' from the cache — the real plan
    // is confirmed by the server during session validation (~8s). This prevents
    // a DevTools localStorage edit from permanently unlocking premium features.
    const [user, setUser] = useState<WorkerUser | null>(() => {
        try {
            const raw = localStorage.getItem(USER_CACHE_KEY);
            if (!raw) return null;
            const cached = JSON.parse(raw) as WorkerUser;
            return { ...cached, plan: 'free' };
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

    // Tracks the most recently authenticated email — even after sign-out.
    // Unlike userRef (which becomes null on sign-out), this ref retains the
    // last real email so _applySession can detect "User A signed out, User B
    // is now signing in" and trigger the account-switch wipe.
    // Seeded at mount from the localStorage display cache (still present at init).
    const lastKnownEmailRef = useRef<string | null>(user?.email ?? null);

    // ── Persist / clear the display cache ────────────────────────────────────

    const _saveUser = useCallback((u: WorkerUser | null) => {
        setUser(u);
        try {
            if (u) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
            else   localStorage.removeItem(USER_CACHE_KEY);
        } catch { /* quota — non-fatal */ }
    }, []);

    // ── Core: apply a confirmed session ──────────────────────────────────────
    // Reads lastKnownEmailRef to detect account switches without needing any
    // hashing, sentinels, or reading from React state inside a setState call.

    const _applySession = useCallback((incoming: WorkerUser, isNew = false) => {
        const prevEmail = lastKnownEmailRef.current;
        if (prevEmail && incoming.email && prevEmail !== incoming.email) {
            // Different user on the same device → wipe ALL local data and reload.
            clearStorageUser(); // clear namespace BEFORE wipe so sentinels go to global keys
            clearQueueForAccount().catch(() => {});
            wipeLocalAppData();
            // Set new user's namespace + cache their display so it's ready after reload
            if (incoming.id) setStorageUser(String(incoming.id));
            try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(incoming)); } catch { /* non-fatal */ }
            if (isNew) { try { sessionStorage.setItem('procv:pending_new_user', '1'); } catch { /* non-fatal */ } }
            window.location.reload();
            return;
        }
        // Clear any explicit sign-out sentinel — the user is actively signing in.
        try { localStorage.removeItem(ACCOUNT_HASH_KEY); } catch { /* non-fatal */ }
        // Same user (or first sign-in on this device) — apply without reload.
        // Set namespace immediately so all subsequent storage reads use the right prefix.
        if (incoming.id) {
            setStorageUser(String(incoming.id));
            // One-time migration: copy any old unprefixed keys to user-scoped namespace.
            migrateToUserNamespace(String(incoming.id)).catch(() => {});
        }
        clearQueueForAccount().catch(() => {});
        lastKnownEmailRef.current = incoming.email ?? null;
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
                    _applySession(result.user, result.is_new_user);
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
                // If the user explicitly signed out (sentinel present), don't auto-relog
                // even if the Cloudflare session cookie is still technically active
                // (happens when the sign-out network request failed silently).
                const wasExplicitSignOut =
                    localStorage.getItem(ACCOUNT_HASH_KEY) === SIGNED_OUT_SENTINEL;
                if (wasExplicitSignOut) {
                    // Fire-and-forget: try to clear the stale cookie on the server
                    signOutWorker().catch(() => {});
                    _saveUser(null);
                } else {
                    // ── Boot-time account-switch reconciliation ──────────────────
                    // Check whether the server-validated cookie user is a DIFFERENT
                    // person from whoever was cached locally (shared device, or
                    // sign-out flow that silently failed and left a stale cookie).
                    //
                    // We intentionally do NOT call _applySession() here because its
                    // same-user path calls clearQueueForAccount(), which would drop
                    // optimistic sync queue entries that should survive page refreshes.
                    // _applySession is reserved for interactive sign-in events.
                    //
                    // If emails differ → full wipe+reload via _applySession (correct).
                    // If same user (or first boot) → minimal setup, preserve queue.
                    const prevEmail = lastKnownEmailRef.current;
                    const incomingEmail = result.user.email;
                    if (prevEmail && incomingEmail && prevEmail !== incomingEmail) {
                        // Different account — delegate to _applySession for wipe+reload.
                        _applySession(result.user, false);
                    } else {
                        // Same user returning — restore namespace and user state only.
                        // Do NOT clear the sync queue; pending entries are still valid.
                        if (result.user.id) setStorageUser(String(result.user.id));
                        lastKnownEmailRef.current = incomingEmail ?? null;
                        _saveUser(result.user);
                    }
                }
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
    // When another tab signs in as a different user, this tab wipes its local
    // data and reloads so the two tabs never share data from different accounts.

    useEffect(() => {
        function onStorage(e: StorageEvent) {
            if (e.key !== USER_CACHE_KEY) return;
            if (!e.newValue) {
                // Another tab signed out — mirror the sign-out here.
                setUser(null);
                return;
            }
            try {
                const incoming = JSON.parse(e.newValue) as WorkerUser;
                if (!incoming?.email) return;
                // Use lastKnownEmailRef (not React state) — avoids setState-inside-setState.
                const prevEmail = lastKnownEmailRef.current;
                if (prevEmail && incoming.email !== prevEmail) {
                    // Different user signed in on another tab → wipe and reload.
                    wipeLocalAppData();
                    window.location.reload();
                }
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
        _applySession(linked.user, linked.is_new_user);
    }, [_applySession]);

    // ── Drive ─────────────────────────────────────────────────────────────────

    const _scheduleDriveRefresh = useCallback((expiresAt: number) => {
        // Snapshot the expected email NOW (at schedule time) from localStorage.
        // The callback closure captures this snapshot so it remains stable even
        // if the user cache is cleared mid-refresh (sign-out race).
        const expectedEmailSnapshot = (() => {
            try {
                const raw = localStorage.getItem(USER_CACHE_KEY);
                return raw ? (JSON.parse(raw) as { email?: string }).email ?? null : null;
            } catch { return null; }
        })();

        if (driveRefreshTimer.current) clearTimeout(driveRefreshTimer.current);
        const ms = expiresAt - Date.now() - 5 * 60 * 1000;
        if (ms <= 0) return;
        driveRefreshTimer.current = setTimeout(async () => {
            try {
                // Guard 1 — abort if Drive was disconnected while waiting
                // (sign-out, account delete, or manual disconnect happened during
                // the timeout window).  Skipping here prevents token resurrection.
                if (localStorage.getItem(DRIVE_SCOPE_KEY) !== '1') return;

                const { accessToken, expiresIn } = await openOAuthPopup(DRIVE_SCOPES, 'none');

                // Guard 2 — re-check after the async popup (sign-out during OAuth).
                if (localStorage.getItem(DRIVE_SCOPE_KEY) !== '1') return;

                // Re-verify the refreshed token's account identity.
                // On verification failure (tokeninfo unavailable / network blip):
                //   → skip this refresh, keep the existing token in place.
                //   → do NOT write an unverified token to localStorage.
                // On mismatch (different Google account):
                //   → silently disconnect Drive.
                const refreshedEmail = await fetchGoogleAccountEmail(accessToken).catch(() => null);
                if (refreshedEmail === null) {
                    // Tokeninfo unavailable — cannot verify.  Keep old token; do not
                    // write the new unverified one.  The existing token stays valid
                    // until the StorageRouter's expiry check forces a reconnect.
                    return;
                }
                if (expectedEmailSnapshot && refreshedEmail.toLowerCase() !== expectedEmailSnapshot.toLowerCase()) {
                    // Account mismatch — silently disconnect Drive.
                    localStorage.removeItem(DRIVE_TOKEN_KEY);
                    localStorage.removeItem(DRIVE_EXPIRY_KEY);
                    localStorage.removeItem(DRIVE_SCOPE_KEY);
                    setDriveToken(null);
                    setDriveConnected(false);
                    return;
                }

                const newExpiry = Date.now() + expiresIn * 1000 - 60_000;
                setDriveToken({ accessToken, expiresAt: newExpiry });
                // Keep localStorage in sync so StorageRouter sees the refreshed token.
                try { localStorage.setItem(DRIVE_TOKEN_KEY, accessToken); }   catch { /* quota */ }
                try { localStorage.setItem(DRIVE_EXPIRY_KEY, String(newExpiry)); } catch { /* quota */ }
                _scheduleDriveRefresh(newExpiry);
            } catch { /* silently expired — user will be prompted on next Drive action */ }
        }, Math.max(ms, 0));
    }, []);

    useEffect(() => () => {
        if (driveRefreshTimer.current) clearTimeout(driveRefreshTimer.current);
    }, []);

    const requestDriveAccess = useCallback(async () => {
        // Pass login_hint so Google skips account selection and goes straight to
        // the consent screen for the email the user already signed in with.
        // login_hint is only a hint, though — if the browser has multiple Google
        // sessions the user can still pick a different account in the popup.
        const { accessToken, expiresIn } = await openOAuthPopup(DRIVE_SCOPES, 'consent', user?.email);

        // Verify the granted token actually belongs to the signed-in ProCV
        // account before trusting it. Without this check, granting Drive access
        // with a *different* Google account silently pulls that other account's
        // appDataFolder (CVs, profiles) into the current session — a cross-account
        // data leak that looks like "my old data came back".
        //
        // fetchGoogleAccountEmail now throws (fail-closed) if the email cannot be
        // confirmed, so we always block mismatches and verification failures —
        // we never silently fall through to Drive activation.
        if (user?.email) {
            const grantedEmail = await fetchGoogleAccountEmail(accessToken);
            if (grantedEmail.toLowerCase() !== user.email.toLowerCase()) {
                throw new Error(
                    `That Google account (${grantedEmail}) doesn't match your signed-in account (${user.email}). ` +
                    `Please grant Drive access using the same Google account you're signed in with.`,
                );
            }
        }

        const expiresAt = Date.now() + expiresIn * 1000 - 60_000;
        setDriveToken({ accessToken, expiresAt });
        // Write to localStorage so StorageRouter can pick up the token immediately.
        // StorageRouter reads cv_gdrive_token / cv_gdrive_expiry on every save/load
        // call — without these writes Drive sync was silently broken.
        try { localStorage.setItem(DRIVE_TOKEN_KEY, accessToken); }        catch { /* quota */ }
        try { localStorage.setItem(DRIVE_EXPIRY_KEY, String(expiresAt)); } catch { /* quota */ }
        localStorage.setItem(DRIVE_SCOPE_KEY, '1');
        setDriveConnected(true);
        _scheduleDriveRefresh(expiresAt);

        // One-time migration: rename any legacy Drive files (cvb__key.json) to
        // the user-scoped format (cvb__u{id}__key.json) so existing backups are
        // readable with the new structural filename convention.
        //
        // AWAITED — not fire-and-forget.  Callers (App.tsx, CloudBackupSettings.tsx)
        // call migrateLocalToDrive() immediately after requestDriveAccess() resolves.
        // If the rename runs concurrently with the upload, the upload creates NEW
        // user-scoped files while old files are being renamed, leaving duplicates.
        // Awaiting here ensures the Drive namespace is fully upgraded before any
        // read or write uses the new filename convention.
        //
        // Failures are caught and swallowed; migrateDriveFilesToUserScope only
        // clears its "done" flag when ALL renames succeed, so a partial failure
        // is automatically retried on the next Drive connect.
        if (user?.id) {
            await migrateDriveFilesToUserScope(accessToken, String(user.id)).catch(() => {});
        }
    }, [_scheduleDriveRefresh, user?.email, user?.id]);

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
        _applySession(incoming, isNew);
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
        clearStorageUser();     // remove user namespace so next user starts clean
        stampSignedOut();       // write sentinel so boot does not auto-relog via stale cookie
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
