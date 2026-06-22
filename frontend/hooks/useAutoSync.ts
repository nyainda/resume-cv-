// hooks/useAutoSync.ts
// Automatically syncs local data to Google Drive every N minutes
// when the user is signed in AND auto-backup is enabled.
//
// The user can turn auto-backup off via the toggle in CloudBackupSettings.
// The preference is stored under AUTO_SYNC_PREF_KEY in localStorage.
// Default when the key is absent: enabled (true).

import { useEffect, useRef } from 'react';
import { isDriveActive, migrateLocalToDrive } from '../services/storage/StorageRouter';
import { useAuth } from '../auth/AuthContext';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** localStorage key for the user's auto-backup preference. */
export const AUTO_SYNC_PREF_KEY = 'procv:autoSync:enabled';

/** Returns true when auto-backup is enabled (default: true when key absent). */
export function isAutoSyncEnabled(): boolean {
    try {
        const raw = localStorage.getItem(AUTO_SYNC_PREF_KEY);
        return raw === null ? true : raw === 'true';
    } catch {
        return true;
    }
}

/** Persist the auto-backup preference and notify listeners. */
export function setAutoSyncEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(AUTO_SYNC_PREF_KEY, String(enabled));
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('procv:autoSyncPrefChanged', { detail: { enabled } }));
}

export function useAutoSync(isAuthenticated: boolean) {
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const { user } = useAuth();

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
            // Respect the user's auto-backup preference.
            if (!isAutoSyncEnabled()) return;
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
