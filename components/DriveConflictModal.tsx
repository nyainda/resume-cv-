// components/DriveConflictModal.tsx
//
// Shown automatically whenever DriveStorageService detects that the remote
// file was modified since we last loaded it (optimistic locking conflict).
//
// The user gets three choices:
//  1. Overwrite — push local data to Drive, discarding the remote version.
//  2. Use Drive version — pull the remote data and discard local edits.
//  3. Dismiss — do nothing for now (local edits stay in browser, Drive unchanged).

import React, { useEffect, useState, useCallback } from 'react';
import { getDriveRouter } from '../services/storage/StorageRouter';

interface ConflictEvent {
    key: string;
    localData: unknown;
    driveData: unknown;
    driveModifiedAt: string;
    storedModifiedAt: string;
}

function formatDate(iso: string): string {
    try {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

const KEY_LABELS: Record<string, string> = {
    userProfile: 'User Profile',
    savedCVs: 'Saved CVs',
    currentCV: 'Current CV Draft',
    trackedApps: 'Job Applications',
    apiSettings: 'API Settings',
    profiles: 'Multiple Profiles',
    activeProfileId: 'Active Profile',
    darkMode: 'Theme Preference',
};

function labelFor(key: string): string {
    return KEY_LABELS[key] ?? key;
}

interface Props {
    /** Called after the conflict is resolved so the parent can reload data if needed. */
    onResolved?: (key: string, action: 'overwrite' | 'pull' | 'dismiss') => void;
}

export const DriveConflictModal: React.FC<Props> = ({ onResolved }) => {
    const [conflict, setConflict] = useState<ConflictEvent | null>(null);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Listen for drive-conflict events dispatched by StorageRouter
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<ConflictEvent>).detail;
            setConflict(detail);
            setError(null);
            setWorking(false);
        };
        window.addEventListener('drive-conflict', handler);
        return () => window.removeEventListener('drive-conflict', handler);
    }, []);

    const resolve = useCallback(async (action: 'overwrite' | 'pull' | 'dismiss') => {
        if (!conflict) return;
        setWorking(true);
        setError(null);

        try {
            const router = getDriveRouter();
            if (!router) throw new Error('Not connected to Google Drive');

            if (action === 'overwrite') {
                await router.forceSaveToDrive(conflict.key, conflict.localData);
            } else if (action === 'pull') {
                await router.pullFromDrive(conflict.key);
                // Trigger a page reload so React state picks up the new local data
                window.location.reload();
            }

            onResolved?.(conflict.key, action);
            setConflict(null);
        } catch (err) {
            setError((err as Error).message ?? 'Something went wrong');
        } finally {
            setWorking(false);
        }
    }, [conflict, onResolved]);

    if (!conflict) return null;

    const driveDate = formatDate(conflict.driveModifiedAt);
    const localDate = formatDate(conflict.storedModifiedAt);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => !working && resolve('dismiss')}
            />

            {/* Dialog */}
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-neutral-800">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-xl">
                            ⚡
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                Sync conflict detected
                            </h2>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{labelFor(conflict.key)}</span>
                                {' '}was updated on another device since your last sync.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Timeline */}
                <div className="px-5 py-4 space-y-3">
                    {/* Drive version */}
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <span className="text-lg leading-none flex-shrink-0">☁️</span>
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-blue-700 dark:text-blue-400">Drive version</p>
                            <p className="text-[11px] text-blue-600 dark:text-blue-500 mt-0.5">
                                Last modified: <span className="font-semibold">{driveDate}</span>
                            </p>
                        </div>
                    </div>

                    {/* Local version */}
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                        <span className="text-lg leading-none flex-shrink-0">💻</span>
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-violet-700 dark:text-violet-400">Your local version</p>
                            <p className="text-[11px] text-violet-600 dark:text-violet-500 mt-0.5">
                                Based on Drive snapshot from: <span className="font-semibold">{localDate}</span>
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
                            {error}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-5 pb-5 space-y-2">
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center pb-1">
                        Which version do you want to keep?
                    </p>

                    {/* Keep mine */}
                    <button
                        disabled={working}
                        onClick={() => resolve('overwrite')}
                        className="w-full py-2.5 px-4 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {working ? <span className="animate-spin">⟳</span> : '💻'}
                        Overwrite Drive with my version
                    </button>

                    {/* Use Drive */}
                    <button
                        disabled={working}
                        onClick={() => resolve('pull')}
                        className="w-full py-2.5 px-4 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {working ? <span className="animate-spin">⟳</span> : '☁️'}
                        Use Drive version (discard my changes)
                    </button>

                    {/* Dismiss */}
                    <button
                        disabled={working}
                        onClick={() => resolve('dismiss')}
                        className="w-full py-2 px-4 text-xs font-medium rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                    >
                        Decide later
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DriveConflictModal;
