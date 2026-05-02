// hooks/useAutoSync.ts
// Automatically syncs local data to Google Drive every N minutes
// when the user is signed in. Fires drive-save-start before each sync
// so the AutoSaveIndicator can show "Saving…".

import { useEffect, useRef } from 'react';
import { isDriveActive, migrateLocalToDrive, resetMigrationFlag } from '../services/storage/StorageRouter';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useAutoSync(isAuthenticated: boolean) {
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
                // Force a re-sync by resetting the migration flag so every key is pushed
                resetMigrationFlag();
                await migrateLocalToDrive();
                window.dispatchEvent(new CustomEvent('drive-save-success', { detail: { key: '__auto_sync__' } }));
                // Store timestamp for "last synced" display
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
    }, [isAuthenticated]);
}
