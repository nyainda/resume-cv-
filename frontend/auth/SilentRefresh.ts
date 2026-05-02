// auth/SilentRefresh.ts
// Silently refreshes the Google access token using a hidden iframe
// with prompt=none. This works as long as the user's Google session
// cookie is still alive (stays alive for ~2 weeks even after cache clears).
//
// Returns a new { accessToken, expiresIn } or throws if the user's
// Google session is gone (requires user to click "Sign In" again).

const SCOPES = [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

export function silentRefresh(hint?: string): Promise<{ accessToken: string; expiresIn: number }> {
    return new Promise((resolve, reject) => {
        const clientId = (import.meta as { env: Record<string, string> }).env.VITE_GOOGLE_CLIENT_ID;
        if (!clientId) {
            reject(new Error('VITE_GOOGLE_CLIENT_ID is not set'));
            return;
        }

        const redirectUri = `${window.location.origin}/oauth-callback.html`;
        const url =
            `https://accounts.google.com/o/oauth2/v2/auth` +
            `?client_id=${encodeURIComponent(clientId)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=token` +
            `&scope=${encodeURIComponent(SCOPES)}` +
            `&prompt=none` +  // ← key flag: no UI, fails fast if not logged in
            (hint ? `&login_hint=${encodeURIComponent(hint)}` : '');

        // Create a hidden iframe
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:none;overflow:hidden;';
        document.body.appendChild(iframe);

        // Listen for the postMessage from oauth-callback.html inside the iframe
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('silent_refresh_timeout'));
        }, 15_000);

        function handler(event: MessageEvent) {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'gdrive_token') return;
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            cleanup();

            const { access_token, expires_in, error } = event.data;
            if (error || !access_token) {
                reject(new Error(error ?? 'silent_refresh_failed'));
            } else {
                resolve({ accessToken: access_token, expiresIn: Number(expires_in ?? 3600) });
            }
        }

        function cleanup() {
            window.removeEventListener('message', handler);
            try { iframe.remove(); } catch { /* already gone */ }
        }

        window.addEventListener('message', handler);
        iframe.src = url;
    });
}
