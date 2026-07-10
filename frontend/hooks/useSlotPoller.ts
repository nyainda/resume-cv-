// hooks/useSlotPoller.ts
//
// Lightweight cross-device slot-freshness poller.
//
// Polls GET /api/cv/slot-status every 6 seconds while the tab is in the
// foreground (document.visibilityState === 'visible').  If the server's
// MAX(updated_at) is newer than the last value we recorded locally, it
// calls `onSyncNeeded` so the caller can run a full D1 merge-sync.
//
// Cost at 6s interval: ~10 D1 reads/minute/tab — negligible vs the free
// tier's 5M reads/day ceiling.

import { useEffect, useRef } from 'react';
import { fetchSlotStatus, getLastKnownServerTs } from '../services/userDataCloudService';

const POLL_INTERVAL_MS = 6_000;

/**
 * @param isAuthenticated - only polls when true; stops and clears timer otherwise.
 * @param onSyncNeeded    - called when a newer server timestamp is detected.
 *                          Stable ref pattern: callers may pass an inline lambda;
 *                          the hook always calls the latest version via a ref.
 */
export function useSlotPoller(
    isAuthenticated: boolean,
    onSyncNeeded: () => void,
): void {
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Keep a stable ref so we never need to re-subscribe when the callback changes.
    const onSyncNeededRef = useRef(onSyncNeeded);
    onSyncNeededRef.current = onSyncNeeded;

    useEffect(() => {
        if (!isAuthenticated) {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            return;
        }

        const poll = async () => {
            // Pause in background — browsers throttle timers anyway and there
            // is no point burning D1 reads on a hidden tab.
            if (document.visibilityState !== 'visible') return;

            const status = await fetchSlotStatus();
            if (!status) return; // network error, offline, or not signed in — skip

            // updated_at is unix SECONDS from the server
            if (status.updated_at > getLastKnownServerTs()) {
                onSyncNeededRef.current();
            }
        };

        // Start polling; first tick fires after one full interval so the
        // login-time runD1MergeSync (which already runs on sign-in) gets a
        // chance to record the initial server timestamp first.
        timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [isAuthenticated]);
}
