/**
 * sessionEvents.ts
 *
 * Tiny event bus for auth/session signals that cross service boundaries.
 *
 * Fires a CustomEvent on window so any listener (AuthContext) can react
 * without creating an import cycle between services and the auth layer.
 */

/**
 * Call this whenever a Cloudflare Worker endpoint that requires an active
 * session returns HTTP 401.  AuthContext listens for this event and triggers
 * a full local sign-out so the UI never stays "logged in" while the server
 * is rejecting every write.
 *
 * Safe to call from any service — fires synchronously, never throws.
 */
export function notifySessionExpired(): void {
    try {
        window.dispatchEvent(new CustomEvent('procv:session-expired'));
    } catch { /* non-fatal */ }
}
