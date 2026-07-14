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
import { syncTierFromSession } from '../services/accountTierService';
import { getDeviceId } from '../services/userDataCloudService';
import { clearQueueForAccount } from '../services/storage/syncQueue';
import {
    setStorageUser,
    clearStorageUser,
    migrateToUserNamespace,
    getUserPrefix,
} from '../services/storage/userStorageNamespace';
import {
    stampSignedOut,
    ACCOUNT_HASH_KEY,
    SIGNED_OUT_SENTINEL,
    clearAllIdbAsync,
    clearUserScopedStorage,
    stampDeletedAccount,
    rotateDeviceId,
} from '../utils/clearUserStorage';

// ─── Constants ────────────────────────────────────────────────────────────────

export const USER_CACHE_KEY  = 'procv:worker_user';
const OAUTH_CALLBACK_KEY     = 'procv:oauth_callback';

const IDENTITY_SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

// ─── Types ────────────────────────────────────────────────────────────────────

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
    /** Sign in with Google (identity only) — used by AuthModal. */
    googleSignIn: () => Promise<void>;
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

/**
 * Deletes one IDB database and resolves once the browser confirms it's gone
 * (or on error/block/timeout) — never hangs the caller indefinitely.
 */
function _deleteIdbDatabase(name: string): Promise<void> {
    return new Promise(resolve => {
        try {
            const req = indexedDB.deleteDatabase(name);
            const timer = setTimeout(resolve, 2000); // safety cap — never block reload forever
            req.onsuccess = () => { clearTimeout(timer); resolve(); };
            req.onerror   = () => { clearTimeout(timer); resolve(); };
            // onblocked fires if another tab still has the DB open — don't wait on it,
            // the delete completes once that tab's connection closes; we've already
            // cleared localStorage + set skip sentinels, which is the primary defense.
            req.onblocked = () => { clearTimeout(timer); resolve(); };
        } catch { resolve(); }
    });
}

/**
 * Wipes all local app data for an account switch. Returns a Promise that
 * resolves once every IDB delete has actually completed (or safely timed
 * out) — callers MUST await this before reloading/continuing. Previously
 * the IDB deletes were fire-and-forget while the caller reloaded
 * immediately after; the reload could tear down the page before the
 * deletes settled, and — more importantly — before any in-flight
 * background sync request (queued while the old account was still
 * active) had a chance to be cancelled, letting stale local profile data
 * slip through and sync under the new account. Awaiting this closes that
 * window; the synchronous localStorage clear below still happens first.
 */
export async function wipeLocalAppData(): Promise<void> {
    try {
        // ── 1. IDB-skip sentinels — written SYNCHRONOUSLY before any async work ──
        // restoreLocalStorageFromIDB() checks 'cv_appdata_cleared' on boot and
        // skips the restore if set, preventing old IDB data from coming back.
        // loadAuthState() checks 'procv:google_auth_cleared' and skips the
        // stale Google auth token, preventing silent re-auth as the old user.
        try { localStorage.setItem('cv_appdata_cleared', '1'); } catch { /* non-fatal */ }

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

        // ── 3. Awaited IDB deletes ─────────────────────────────────────────────────
        // Delete base DB names AND all known user-scoped variants, and WAIT for
        // each to actually finish before returning. Since we don't know all user
        // IDs, we enumerate the existing databases and delete any that match our
        // naming pattern.
        const BASE_IDB = [
            'cv_builder_auth',
            'cv_builder_cvdata',
            'cv_builder_appdata',
            'cv_builder_sync',
            'cv_builder_keyvault',
        ];
        const deletions: Promise<void>[] = BASE_IDB.map(name => _deleteIdbDatabase(name));

        if (typeof indexedDB.databases === 'function') {
            try {
                const dbs = await indexedDB.databases();
                dbs.forEach(db => {
                    if (!db.name) return;
                    const isOurs = BASE_IDB.some(base =>
                        db.name === base ||
                        db.name!.startsWith(base + '_u_') ||
                        db.name!.startsWith(base + '_anon'),
                    );
                    if (isOurs) deletions.push(_deleteIdbDatabase(db.name!));
                });
            } catch { /* browsers without indexedDB.databases() — already handled above */ }
        }

        await Promise.all(deletions);
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

    const pendingResolvers  = useRef<Array<(ok: boolean) => void>>([]);

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
        // Reconcile the feature-gating tier (accountTierService) with the plan
        // the server just confirmed. `u` here is always server-validated (never
        // the localStorage display cache, which has `plan` force-reset to
        // 'free' above) — so this is the one place a premium→free downgrade
        // (subscription canceled/expired/admin-revoked) actually takes effect.
        // On sign-out (u === null) also drop back to 'free' so a stale premium
        // flag can't linger for whoever signs in next on this device.
        syncTierFromSession(u?.plan ?? null);
    }, []);

    // ── Core: apply a confirmed session ──────────────────────────────────────
    // Reads lastKnownEmailRef to detect account switches without needing any
    // hashing, sentinels, or reading from React state inside a setState call.

    const _applySession = useCallback((incoming: WorkerUser, isNew = false) => {
        const prevEmail = lastKnownEmailRef.current;
        if (prevEmail && incoming.email && prevEmail !== incoming.email) {
            // Different user on the same device → wipe ALL local data, THEN reload.
            // clearQueueForAccount() is awaited first so any in-flight/pending
            // background sync for the OLD account is dropped before it can race the
            // account switch and get sent under the NEW session's cookie (this was
            // the actual mechanism behind a confirmed cross-account leak — the
            // reload used to fire before the wipe/queue-clear settled). No UI is
            // shown during this gap since we still hold the previous account's
            // rendered state until reload; it's milliseconds in practice.
            (async () => {
                clearStorageUser(); // clear namespace BEFORE wipe so sentinels go to global keys
                await clearQueueForAccount().catch(() => {});
                await wipeLocalAppData();
                // Set new user's namespace + cache their display so it's ready after reload
                if (incoming.id) setStorageUser(String(incoming.id));
                try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(incoming)); } catch { /* non-fatal */ }
                // Always resolve the flag explicitly for the incoming account rather than
                // leaving behind whatever the previous account in this tab last set —
                // otherwise a stale 'new user' flag from account A can wrongly reopen
                // onboarding for account B after this reload.
                try {
                    if (isNew) sessionStorage.setItem('procv:pending_new_user', '1');
                    else sessionStorage.removeItem('procv:pending_new_user');
                } catch { /* non-fatal */ }
                window.location.reload();
            })();
            return;
        }
        // Clear any explicit sign-out sentinel — the user is actively signing in.
        try { localStorage.removeItem(ACCOUNT_HASH_KEY); } catch { /* non-fatal */ }
        // Same user (or first sign-in on this device) — apply without reload.
        // Set namespace immediately so all subsequent storage reads use the right prefix.
        if (incoming.id) {
            setStorageUser(String(incoming.id));
            // One-time migration: copy any old unprefixed keys to user-scoped namespace.
            migrateToUserNamespace(String(incoming.id), isNew).catch(() => {});
        }
        clearQueueForAccount().catch(() => {});
        lastKnownEmailRef.current = incoming.email ?? null;
        _saveUser(incoming);
        if (isNew) {
            setIsNewUser(true);
            // Persist across a plain page refresh (not just the account-switch
            // reload path below). Without this, a brand-new user who refreshes
            // mid-onboarding — e.g. after picking a plan or uploading a CV, before
            // hitting "Finish" — loses isNewUser (it was React-state-only) and the
            // OnboardingWizard never remounts, silently dumping them into the app
            // with no profile set up and no way to get the wizard back.
            try { sessionStorage.setItem('procv:pending_new_user', '1'); } catch { /* non-fatal */ }
        } else {
            // Explicitly reset so a returning user signing in after a new user on
            // the same tab never inherits stale isNewUser=true state.
            setIsNewUser(false);
            try { sessionStorage.removeItem('procv:pending_new_user'); } catch { /* non-fatal */ }
        }
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

            // 2b. ?deleted=1 — account was just deleted on this tab.
            // All local storage and IDB were already wiped before the redirect,
            // so there is no session to validate. Skip validateSession() entirely
            // to avoid: spinner → network call → D1 sync attempt → 401s.
            // The app will boot directly into the landing page.
            if (params.get('deleted') === '1') {
                const clean = new URL(window.location.href);
                clean.searchParams.delete('deleted');
                window.history.replaceState({}, '', clean.toString());
                if (!cancelled) setIsLoading(false);
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
                // Server says definitively signed out — also reset any stale
                // isNewUser flag so a subsequent login on the same session
                // doesn't inherit it and wrongly trigger onboarding clearing.
                _saveUser(null);
                setIsNewUser(false);
                try { sessionStorage.removeItem('procv:pending_new_user'); } catch { /* non-fatal */ }
            }
            // Network error: keep display cache → user not kicked to landing page on cold start

            setIsLoading(false);
        }

        boot().catch(() => { if (!cancelled) setIsLoading(false); });
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
                // Another tab signed out OR deleted its account.
                //
                // CRITICAL: this tab may still hold a different (stale) in-memory
                // profile/slot in React state, with a debounced sync-queue flush
                // timer already armed. If we only clear the display state here,
                // that pending flush can still fire — carrying THIS tab's stale
                // profile data — and land under whatever session cookie the
                // browser now has (the other tab may have already signed into a
                // brand-new account by the time this flush runs). That is the
                // exact mechanism behind the cross-account data leak: two tabs
                // open, one deletes/switches, the other's background autosave
                // silently attributes its old data to the new account.
                //
                // Fix: treat ANY auth-state change observed from another tab as
                // untrustworthy for this tab's in-memory state. Cancel this
                // tab's queued syncs and force a full reload so it re-derives
                // everything from scratch (fresh session, fresh namespace).
                clearQueueForAccount().catch(() => {});
                setUser(null);
                stampSignedOut(); // prevent auto-relog on next boot
                try { sessionStorage.removeItem('procv:pending_new_user'); } catch { /* non-fatal */ }
                window.location.reload();
                return;
            }
            try {
                const incoming = JSON.parse(e.newValue) as WorkerUser;
                if (!incoming?.email) return;
                // Use lastKnownEmailRef (not React state) — avoids setState-inside-setState.
                const prevEmail = lastKnownEmailRef.current;
                if (!prevEmail || incoming.email !== prevEmail) {
                    // Different user signed in on another tab (or this tab had no
                    // user of its own yet) → this tab's in-memory state cannot be
                    // trusted to belong to the new account. Cancel any queued sync
                    // for this tab and reload so it starts clean under the new
                    // session/namespace. Awaited (not fire-and-forget) for the same
                    // reason as the primary account-switch path in _applySession —
                    // reloading before the wipe/queue-clear settle is what let stale
                    // data leak into a different account in a confirmed incident.
                    (async () => {
                        await clearQueueForAccount().catch(() => {});
                        await wipeLocalAppData();
                        // wipeLocalAppData() doesn't touch sessionStorage; without this,
                        // a stale pending_new_user flag from a previous account in this
                        // tab could wrongly trigger onboarding for whoever signs into
                        // this tab next.
                        try { sessionStorage.removeItem('procv:pending_new_user'); } catch { /* non-fatal */ }
                        window.location.reload();
                    })();
                }
            } catch { /* malformed — ignore */ }
        }
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // ── Background sync 401 → sign-out ───────────────────────────────────────
    // userDataCloudService fires 'procv:session-expired' whenever the Worker
    // returns 401 on a background sync call. Without this, the UI stays
    // "logged in" while every save silently fails — the user sees their data
    // but the Worker refuses every write.
    //
    // Runs the same cleanup as signOut() so auth/storage state is fully reset:
    // user cache, session fallback token, sign-out sentinel, user namespace,
    // Drive token + timer, and isNewUser flag.

    useEffect(() => {
        function onSessionExpired() {
            // Only act if we believe we're signed in. Ignore the event if we're
            // already signed out (avoids duplicate teardown on late in-flight 401s).
            if (!localStorage.getItem(USER_CACHE_KEY)) return;

            // Mirror signOut() cleanup exactly ─────────────────────────────────
            // Best-effort server-side cookie clear (fire-and-forget so the UI
            // responds immediately even if the network call is slow/fails).
            signOutWorker().catch(() => {});
            clearSessionFallback();
            clearStorageUser();   // drop user namespace so next user starts clean
            stampSignedOut();     // sentinel → boot won't auto-relog via stale cookie
            _saveUser(null);

            setIsNewUser(false);
            try { sessionStorage.removeItem('procv:pending_new_user'); } catch { /* non-fatal */ }
        }
        window.addEventListener('procv:session-expired', onSessionExpired);
        return () => window.removeEventListener('procv:session-expired', onSessionExpired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_saveUser]);

    // ── Slot ownership conflict (409) — NOT a session problem ────────────────
    // userDataCloudService fires 'procv:slot-ownership-conflict' when the
    // Worker refuses to write a slot because its slot_id is already owned by
    // a different account (stale local data from an earlier account switch on
    // this device). The current session is still valid, so this must never
    // sign the user out. It already cleared that slot's local sync hash/
    // timestamp so it won't be silently treated as "in sync"; we just log it
    // here for visibility. The profile itself is untouched — the next edit to
    // that slot will keep failing to push under this ID, which is intentional
    // (better a visibly-stuck sync than silently corrupting another account).
    useEffect(() => {
        function onSlotOwnershipConflict(e: Event) {
            const slotId = (e as CustomEvent<{ slotId?: string }>).detail?.slotId;
            console.warn(
                `[Auth] Slot ${slotId ?? '(unknown)'} is owned by a different account on this device ` +
                `and will not sync under the current session. This does not affect your current sign-in.`
            );
        }
        window.addEventListener('procv:slot-ownership-conflict', onSlotOwnershipConflict);
        return () => window.removeEventListener('procv:slot-ownership-conflict', onSlotOwnershipConflict);
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
        setIsNewUser(false);
        try { sessionStorage.removeItem('procv:pending_new_user'); } catch { /* non-fatal */ }
    }, [_saveUser]);

    // ── Delete account ────────────────────────────────────────────────────────

    const deleteAccount = useCallback(async (deviceId?: string): Promise<boolean> => {
        // deleteAccountWorker now reads the localStorage fallback token internally,
        // so no sessionToken parameter is needed here.
        const ok = await deleteAccountWorker(deviceId);
        if (!ok) return false;

        // Server-side data is gone — now guarantee the local slate is clean
        // BEFORE the next sign-in (same or different account) can run its
        // first-login migration and adopt stale legacy keys. Without this,
        // leftover legacy-prefixed localStorage keys from the deleted account
        // get silently adopted by migrateToUserNamespace() on the next
        // account's first login, making a brand-new account inherit the
        // deleted account's profile data.
        await clearQueueForAccount().catch(() => {}); // drop any queued sync for the deleted account
        clearStorageUser();                              // drop procv:storage_ns
        clearSessionFallback();                           // stale token can't be valid for a deleted account
        rotateDeviceId();                                 // new account = new device_id
        await clearAllIdbAsync();                         // await — must finish before reload
        clearUserScopedStorage({ clearAppData: true });   // wipes u_*, legacy unprefixed keys, procv:*
        stampDeletedAccount();                             // let the account-switch guard know it's clean
        _saveUser(null);
        setIsNewUser(false);

        // Navigate to the origin with ?deleted=1 so the boot sequence skips
        // validateSession() and renders the landing page immediately — no spinner,
        // no D1 sync attempt, no 401s from a deleted account's cookie.
        window.location.replace(window.location.origin + '?deleted=1');

        return true;
    }, [_saveUser]);

    // ─────────────────────────────────────────────────────────────────────────

    const value: AuthContextValue = {
        user,
        isLoading,
        isAuthenticated: !!user,
        isNewUser,
        clearNewUser: () => {
            setIsNewUser(false);
            try { sessionStorage.removeItem('procv:pending_new_user'); } catch { /* non-fatal */ }
        },
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
        googleSignIn,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
