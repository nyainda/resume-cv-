// src/components/GoogleSignInButton.tsx
// A premium, high-aesthetic Google Sign In button and user card.

import React, { useState, useEffect } from 'react';
import { useGoogleAuth } from '../auth/GoogleAuthContext';
import { migrateLocalToDrive, isDriveActive } from '../services/storage/StorageRouter';
import { Shield, CheckCircle, RefreshCw, AlertCircle } from './icons';

interface Props {
    onSignedIn?: () => void;
    onSignedOut?: () => void;
}

export const GoogleSignInButton: React.FC<Props> = ({ onSignedIn, onSignedOut }) => {
    const { user, loading, error, signIn, signOut, isAuthenticated, silentRefreshing } = useGoogleAuth();

    const [migrating, setMigrating] = useState(false);
    const [migrProgress, setMigrProgress] = useState({ done: 0, total: 0 });
    const [migrDone, setMigrDone] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) return;
        if (localStorage.getItem('cv_builder:gdrive_migrated') === 'done') {
            setMigrDone(true);
            return;
        }

        let active = true;
        setMigrating(true);

        migrateLocalToDrive((done, total) => {
            if (active) setMigrProgress({ done, total });
        })
            .then(() => {
                if (active) {
                    setMigrating(false);
                    setMigrDone(true);
                    onSignedIn?.();
                }
            })
            .catch((err) => {
                if (active) {
                    setMigrating(false);
                    console.error(err);
                }
            });

        return () => { active = false; };
    }, [isAuthenticated, onSignedIn]);

    const handleSignIn = async () => {
        try {
            await signIn();
        } catch (err) {
            console.error('Sign-in failed', err);
        }
    };

    const handleSignOut = () => {
        signOut();
        setMigrDone(false);
        onSignedOut?.();
    };

    if (loading) {
        return (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-50 dark:bg-neutral-800/50 border border-zinc-200 dark:border-neutral-700 animate-pulse">
                <Spinner />
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Restoring session…</span>
            </div>
        );
    }

    if (isAuthenticated && user) {
        return (
            <div className="relative group overflow-hidden rounded-2xl bg-white dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 transition-all duration-300 hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-800">
                {/* Background accent */}
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all duration-500" />

                <div className="relative p-4 space-y-4">
                    <div className="flex items-center gap-4">
                        {/* Avatar */}
                        <div className="relative">
                            {user.picture ? (
                                <img
                                    src={user.picture}
                                    alt={user.name}
                                    referrerPolicy="no-referrer"
                                    className="w-12 h-12 rounded-full object-cover ring-2 ring-indigo-100 dark:ring-indigo-900 shadow-sm"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="absolute -bottom-1 -right-1 p-0.5 bg-white dark:bg-neutral-800 rounded-full">
                                <div className="p-0.5 bg-green-500 rounded-full ring-2 ring-white dark:ring-neutral-800 shadow-sm">
                                    <CheckCircle className="w-2.5 h-2.5 text-white" />
                                </div>
                            </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate leading-tight">
                                {user.name}
                            </h4>
                            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                                {user.email}
                            </p>
                        </div>

                        <button
                            onClick={handleSignOut}
                            className="text-xs font-bold text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                            Log out
                        </button>
                    </div>

                    {/* Status Bar */}
                    <div className="pt-2 border-t border-zinc-100 dark:border-neutral-700">
                        {/* Silent-refresh indicator */}
                        {silentRefreshing && (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-2">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                Reconnecting…
                            </div>
                        )}

                        {migrating ? (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                    <span className="flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Migrating data...</span>
                                    <span>{migrProgress.done}/{migrProgress.total}</span>
                                </div>
                                <div className="w-full bg-zinc-100 dark:bg-neutral-900 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-500 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                                        style={{ width: migrProgress.total > 0 ? `${(migrProgress.done / migrProgress.total) * 100}%` : '5%' }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="flex items-center gap-2 text-green-600 dark:text-green-400 font-bold">
                                    <div className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </div>
                                    Syncing to Drive
                                </span>
                                <span className="text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                                    <Shield className="w-3 h-3" /> Secure Connection
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <button
                onClick={handleSignIn}
                disabled={loading}
                className="w-full relative group bg-white dark:bg-neutral-800 border-2 border-zinc-200 dark:border-neutral-700 hover:border-indigo-500 dark:hover:border-indigo-600 p-0.5 rounded-2xl transition-all duration-300 hover:shadow-xl active:scale-[0.98]"
            >
                <div className="flex items-center justify-center gap-4 px-6 py-4 rounded-[calc(1rem-2px)] bg-white dark:bg-neutral-800 group-hover:bg-zinc-50/50 dark:group-hover:bg-neutral-700/50 transition-colors">
                    <GoogleLogo />
                    <div className="text-left">
                        <p className="text-sm font-extrabold text-zinc-900 dark:text-white leading-none">Connect with Google</p>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest mt-1">Enable Cloud Storage</p>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0 group-hover:duration-300">
                        →
                    </div>
                </div>
            </button>

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-100 dark:border-red-900/50 animate-shake">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/30">
                    <p className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">Backup</p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-tight">CVs and data saved safely in your Drive.</p>
                </div>
                <div className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100/50 dark:border-purple-800/30">
                    <p className="text-[10px] font-extrabold text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-1">Sync</p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-tight">Switch between laptop and mobile instantly.</p>
                </div>
            </div>

            <p className="text-[10px] text-center text-zinc-400 dark:text-zinc-500 px-4 font-medium italic">
                * Your data remains in your personal Google account. We never see or store your private information on our servers.
            </p>
        </div>
    );
};

const Spinner = () => (
    <div className="relative w-5 h-5">
        <div className="absolute inset-0 border-2 border-indigo-200 dark:border-indigo-800 rounded-full" />
        <div className="absolute inset-0 border-2 border-indigo-600 rounded-full border-t-transparent animate-spin" />
    </div>
);

const GoogleLogo = () => (
    <div className="p-2.5 bg-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.05)] border border-zinc-100">
        <svg width="20" height="20" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
            <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" />
        </svg>
    </div>
);
export default GoogleSignInButton;