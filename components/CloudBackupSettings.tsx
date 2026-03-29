// components/CloudBackupSettings.tsx
// Cloud backup settings panel — uses GoogleAuthContext as the single
// source of truth for auth state (same as GoogleSignInButton).

import React, { useState, useEffect } from 'react';
import { useGoogleAuth } from '../auth/GoogleAuthContext';
import { migrateLocalToDrive, isDriveActive } from '../services/storage/StorageRouter';

type Status = 'idle' | 'connecting' | 'migrating' | 'active' | 'error';

interface MigrationProgress {
    uploaded: number;
    total: number;
}

export const CloudBackupSettings: React.FC = () => {
    const { user, loading, error, signIn, signOut, isAuthenticated } = useGoogleAuth();

    const [status, setStatus] = useState<Status>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [migration, setMigration] = useState<MigrationProgress | null>(null);

    // Sync status with auth state
    useEffect(() => {
        if (loading) return;
        if (isAuthenticated) {
            const hasMigrated = localStorage.getItem('cv_builder:gdrive_migrated') === 'done';
            setStatus(hasMigrated ? 'active' : 'idle');
        } else {
            setStatus('idle');
        }
    }, [isAuthenticated, loading]);

    const handleConnect = async () => {
        setErrorMsg('');
        setStatus('connecting');
        try {
            await signIn();
            // After sign-in, attempt migration
            const hasMigrated = localStorage.getItem('cv_builder:gdrive_migrated') === 'done';
            if (!hasMigrated) {
                setStatus('migrating');
                await migrateLocalToDrive((uploaded, total) => {
                    setMigration({ uploaded, total });
                });
                setMigration(null);
            }
            setStatus('active');
        } catch (err) {
            setStatus('error');
            setErrorMsg((err as Error).message ?? 'Connection failed. Please try again.');
        }
    };

    const handleDisconnect = () => {
        signOut();
        setStatus('idle');
        setMigration(null);
        setErrorMsg('');
    };

    // ── Status badge ──────────────────────────────────────────────────────────
    const Badge = () => {
        const configs: Record<Status, { text: string; classes: string }> = {
            idle: { text: 'Cache only', classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
            connecting: { text: 'Connecting…', classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
            migrating: { text: 'Syncing…', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
            active: { text: 'Drive active ✓', classes: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
            error: { text: 'Connection failed', classes: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
        };
        const resolvedStatus = isAuthenticated ? 'active' : status;
        const { text, classes } = configs[resolvedStatus];
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
                {resolvedStatus === 'active' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                )}
                {text}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="space-y-4 animate-pulse">
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Cloud backup
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Your CVs and profile are stored in your own Google Drive — invisible to others.
                    </p>
                </div>
                <Badge />
            </div>

            {/* Drive icon + description */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="flex-shrink-0 mt-0.5">
                    <svg width="20" height="18" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                    </svg>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    Data is stored in a private, hidden folder in your Google Drive using the{' '}
                    <span className="font-mono text-xs bg-gray-200 dark:bg-gray-700 px-1 rounded">appdata</span>{' '}
                    scope. No one else can see or access these files.
                </p>
            </div>

            {/* Active state — show connected account + disconnect */}
            {isAuthenticated && user ? (
                <div className="flex items-center justify-between p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                    <div className="flex items-center gap-3">
                        {user.picture ? (
                            <img
                                src={user.picture}
                                alt={user.name}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-full ring-2 ring-green-300 dark:ring-green-700"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p className="text-xs font-medium text-green-800 dark:text-green-300">{user.name}</p>
                            <p className="text-[11px] text-green-700 dark:text-green-400 font-mono">{user.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleDisconnect}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline ml-4 flex-shrink-0"
                    >
                        Disconnect
                    </button>
                </div>
            ) : (
                /* Setup form */
                <div className="space-y-3">
                    {(errorMsg || error) && (
                        <p className="text-xs text-red-600 dark:text-red-400">{errorMsg || error}</p>
                    )}

                    <button
                        onClick={handleConnect}
                        disabled={status === 'connecting' || status === 'migrating'}
                        className="w-full py-2 px-4 text-sm font-medium rounded-lg
                       bg-blue-600 hover:bg-blue-700 text-white
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors duration-150"
                    >
                        {status === 'connecting' && 'Opening Google sign-in…'}
                        {status === 'migrating' && (
                            migration
                                ? `Syncing ${migration.uploaded} / ${migration.total} items…`
                                : 'Preparing sync…'
                        )}
                        {(status === 'idle' || status === 'error') && 'Connect Google Drive'}
                    </button>
                </div>
            )}

            {/* Migration progress bar */}
            {status === 'migrating' && migration && migration.total > 0 && (
                <div className="space-y-1">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${(migration.uploaded / migration.total) * 100}%` }}
                        />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                        Moving your existing data to Drive…
                    </p>
                </div>
            )}

            {/* Footer note */}
            <p className="text-xs text-gray-400 dark:text-gray-500">
                If you skip this, your data stays in browser cache only — it will be lost if you clear site data.
            </p>
        </div>
    );
};

export default CloudBackupSettings;