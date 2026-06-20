// hooks/useAutoSync.ts
// Automatically syncs local data to Google Drive every N minutes
// when the user is signed in. Fires drive-save-start before each sync
// so the AutoSaveIndicator can show "Saving…".

import { useEffect, useRef } from 'react';
import { isDriveActive, migrateLocalToDrive } from '../services/storage/StorageRouter';
import { useGoogleAuth } from '../auth/GoogleAuthContext';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useAutoSync(isAuthenticated: boolean) {
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const { user } = useGoogleAuth();

    useEffect(() => {
        if (!isAuthenticated) {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            return;
        }

        const sync = async () => {
            if (!isDriveActive()) return;
            try {
                window.dispatchEvent(new CustomEvent('drive-save-start'));
                // Do NOT reset the migration flag — migrateLocalToDrive is a one-time
                // initial upload. Ongoing saves go through StorageRouter.save() which
                // already writes to Drive on every change. Resetting the flag here caused
                // a full re-upload of all keys every 5 min, generating Drive API errors
                // and repeated "Cloud Sync Failed" toasts.
                await migrateLocalToDrive(undefined, user?.email);
                window.dispatchEvent(new CustomEvent('drive-save-success', { detail: { key: '__auto_sync__' } }));
                localStorage.setItem('cv_drive_last_sync', new Date().toISOString());
            } catch (err) {
                window.dispatchEvent(new CustomEvent('drive-save-error', { detail: { error: err } }));
            }
        };

        // Run once after 30 seconds of sign-in, then every 5 minutes
        const initialDelay = setTimeout(sync, 30_000);
        timerRef.current = setInterval(sync, SYNC_INTERVAL_MS);

        return () => {
            clearTimeout(initialDelay);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isAuthenticated, user?.email]);
}
