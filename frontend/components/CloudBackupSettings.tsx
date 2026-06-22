// components/CloudBackupSettings.tsx
// Cloud backup settings panel.
//
// Three distinct states:
//   1. Not signed in → "Sign in with Google" (identity + Drive scope in one flow)
//   2. Signed in, Drive NOT connected → "Connect Drive" (one tap — adds Drive
//      scope to existing session, then migrates all local data to Drive)
//   3. Signed in AND Drive connected → shows account + "Disconnect"

import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { migrateLocalToDrive, hasMigratedToDrive } from '../services/storage/StorageRouter';

interface MigrationProgress {
    uploaded: number;
    total: number;
}

type Step = 'idle' | 'signing-in' | 'connecting' | 'migrating' | 'done' | 'error';

export const CloudBackupSettings: React.FC = () => {
    const {
        user,
        isLoading,
        googleSignIn,
        signOut,
        isAuthenticated,
        driveConnected,
        requestDriveAccess,
    } = useAuth();

    const [step, setStep]                     = useState<Step>('idle');
    const [errorMsg, setErrorMsg]             = useState('');
    const [migration, setMigration]           = useState<MigrationProgress | null>(null);

    // Keep step in sync whenever auth / drive state changes from outside
    useEffect(() => {
        if (isLoading) return;
        if (!isAuthenticated) { setStep('idle'); return; }
        if (driveConnected)   { setStep('done'); return; }
        if (step === 'done' || step === 'idle') setStep('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, driveConnected, isLoading]);

    // ── Sign in (not yet authenticated) ─────────────────────────────────────
    const handleSignIn = async () => {
        setErrorMsg('');
        setStep('signing-in');
        try {
            await googleSignIn();
            // After sign-in, check if Drive scope is already granted
            // (it will be if the user previously connected Drive)
        } catch (err) {
            setStep('error');
            setErrorMsg((err as Error).message ?? 'Sign-in failed. Please try again.');
        }
    };

    // ── Connect Drive (already signed in, just needs Drive scope) ────────────
    const handleConnectDrive = async () => {
        setErrorMsg('');
        setStep('connecting');
        try {
            // One tap — adds drive.appdata scope to the existing Google session.
            // Google shows a popup pre-filled with the signed-in account.
            await requestDriveAccess();
            setStep('migrating');

            // Migrate all existing localStorage + IDB data to Drive
            if (!hasMigratedToDrive(user?.email)) {
                await migrateLocalToDrive((uploaded, total) => {
                    setMigration({ uploaded, total });
                }, user?.email ?? undefined);
                setMigration(null);
            }

            setStep('done');
        } catch (err) {
            setStep('error');
            setErrorMsg((err as Error).message ?? 'Could not connect Drive. Please try again.');
        }
    };

    const handleDisconnect = async () => {
        await signOut();
        setStep('idle');
        setMigration(null);
        setErrorMsg('');
    };

    if (isLoading) {
        return (
            <div className="space-y-4 animate-pulse">
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg" />
            </div>
        );
    }

    const isBusy = step === 'signing-in' || step === 'connecting' || step === 'migrating';

    return (
        <div className="space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Cloud backup
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Your CVs and profiles are stored in your own Google Drive — invisible to others.
                    </p>
                </div>

                {/* Status badge */}
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    (driveConnected && isAuthenticated)
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : step === 'migrating' || step === 'connecting'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : step === 'error'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                    {(driveConnected && isAuthenticated) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                    )}
                    {(driveConnected && isAuthenticated) ? 'Drive active ✓'
                        : step === 'connecting'  ? 'Connecting…'
                        : step === 'migrating'   ? 'Syncing…'
                        : step === 'error'       ? 'Error'
                        : 'Local only'}
                </span>
            </div>

            {/* Drive info box */}
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
                    Stored in a private, hidden folder using the{' '}
                    <span className="font-mono text-xs bg-gray-200 dark:bg-gray-700 px-1 rounded">drive.appdata</span>{' '}
                    scope. No one else — not even you in the Drive UI — can browse these files.
                </p>
            </div>

            {/* ── State: Drive already connected ── */}
            {isAuthenticated && driveConnected && user ? (
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
                            <div className="w-8 h-8 rounded-full bg-[#1B2B4B] flex items-center justify-center text-white text-xs font-bold">
                                {(user.name || user.email || '?').charAt(0).toUpperCase()}
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

            ) : isAuthenticated && !driveConnected ? (
                /* ── State: signed in but Drive scope not yet granted ── */
                <div className="space-y-3">
                    {errorMsg && (
                        <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
                    )}

                    {/* Migration progress bar */}
                    {step === 'migrating' && migration && migration.total > 0 && (
                        <div className="space-y-1">
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="bg-[#1B2B4B] h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${Math.round((migration.uploaded / migration.total) * 100)}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                Uploading {migration.uploaded} of {migration.total} items to Drive…
                            </p>
                        </div>
                    )}

                    <button
                        onClick={handleConnectDrive}
                        disabled={isBusy}
                        className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg
                                   bg-[#1B2B4B] hover:bg-[#1B2B4B]/90 text-white
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   transition-colors duration-150 flex items-center justify-center gap-2"
                    >
                        {isBusy && (
                            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                        )}
                        {step === 'connecting' && 'Opening Drive permissions…'}
                        {step === 'migrating' && (migration
                            ? `Uploading ${migration.uploaded} / ${migration.total}…`
                            : 'Preparing upload…')}
                        {(step === 'idle' || step === 'error') && 'Connect Drive — one tap'}
                    </button>

                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                        You're already signed in — this just adds Drive backup permission.
                    </p>
                </div>

            ) : (
                /* ── State: not signed in at all ── */
                <div className="space-y-3">
                    {errorMsg && (
                        <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
                    )}
                    <button
                        onClick={handleSignIn}
                        disabled={isBusy}
                        className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg
                                   bg-blue-600 hover:bg-blue-700 text-white
                                   disabled:opacity-50 disabled:cursor-not-allowed
                                   transition-colors duration-150 flex items-center justify-center gap-2"
                    >
                        {step === 'signing-in' && (
                            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                        )}
                        {step === 'signing-in' ? 'Opening Google sign-in…' : 'Sign in with Google'}
                    </button>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        If you skip this, your data stays in browser cache only — lost if you clear site data.
                    </p>
                </div>
            )}
        </div>
    );
};

export default CloudBackupSettings;
