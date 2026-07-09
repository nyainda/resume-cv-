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

/**
 * Call this when the server rejects a slot write because the slot_id is
 * already owned by a different account (HTTP 409 from /api/cv/user-slots).
 * This is NOT a session/auth problem — the current session is valid — so it
 * must not trigger a sign-out. AuthContext listens for this and purges only
 * the offending slot's local caches (hash/sync-timestamp so it stops being
 * silently skipped) plus removes it from local profile state, forcing a
 * fresh slot_id on next save instead of retrying a write the server will
 * keep rejecting forever.
 */
export function notifySlotOwnershipConflict(slotId: string): void {
    try {
        window.dispatchEvent(new CustomEvent('procv:slot-ownership-conflict', { detail: { slotId } }));
    } catch { /* non-fatal */ }
}
