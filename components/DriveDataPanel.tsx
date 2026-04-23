// components/DriveDataPanel.tsx
// Shows what's saved in Google Drive (or local storage) and allows
// the user to explicitly save, retrieve, or refresh their data.

import React, { useState, useEffect } from 'react';
import { useGoogleAuth } from '../auth/GoogleAuthContext';
import { getStorageService, isDriveActive, migrateLocalToDrive } from '../services/storage/StorageRouter';

interface FileEntry {
    key: string;
    label: string;
    icon: string;
}

const KEY_META: Record<string, { label: string; icon: string }> = {
    userProfile: { label: 'User Profile', icon: '👤' },
    savedCVs: { label: 'Saved CVs', icon: '📄' },
    currentCV: { label: 'Current CV Draft', icon: '✏️' },
    trackedApps: { label: 'Job Applications', icon: '🎯' },
    apiSettings: { label: 'API Settings', icon: '🔑' },
    darkMode: { label: 'Theme Preference', icon: '🌙' },
    profiles: { label: 'Multiple Profiles', icon: '👥' },
    activeProfileId: { label: 'Active Profile', icon: '✅' },
};

function formatKey(key: string): { label: string; icon: string } {
    return KEY_META[key] ?? { label: key, icon: '📁' };
}

interface DriveDataPanelProps {
    onDataRestored?: () => void;
}

function useLastSync() {
    const [lastSync, setLastSync] = useState<string | null>(
        localStorage.getItem('cv_drive_last_sync')
    );
    useEffect(() => {
        const handler = () => setLastSync(localStorage.getItem('cv_drive_last_sync'));
        window.addEventListener('drive-save-success', handler);
        return () => window.removeEventListener('drive-save-success', handler);
    }, []);
    return lastSync;
}

function formatLastSync(iso: string | null): string {
    if (!iso) return 'Never';
    try {
        const d = new Date(iso);
        const diff = Date.now() - d.getTime();
        if (diff < 60_000) return 'Just now';
        if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
        if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
        return d.toLocaleDateString();
    } catch { return iso; }
}

export const DriveDataPanel: React.FC<DriveDataPanelProps> = ({ onDataRestored }) => {
    const { user, isAuthenticated, signIn } = useGoogleAuth();
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [migrationProgress, setMigrationProgress] = useState<{ done: number; total: number } | null>(null);
    const lastSync = useLastSync();

    const driveActive = isDriveActive();

    const loadFiles = async () => {
        setLoading(true);
        try {
            const svc = getStorageService();
            const keys = await svc.list();
            setFiles(keys.map(key => ({ key, ...formatKey(key) })));
        } catch {
            setFiles([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!loading) loadFiles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]);

    const handleSyncNow = async () => {
        if (!driveActive) return;
        setSyncing(true);
        setSyncMsg(null);
        setMigrationProgress(null);
        try {
            // Reset migration flag to force re-sync
            localStorage.removeItem('cv_builder:gdrive_migrated');
            await migrateLocalToDrive((done, total) => {
                setMigrationProgress({ done, total });
            });
            setMigrationProgress(null);
            setSyncMsg({ type: 'success', text: '✓ All data synced to Google Drive successfully!' });
            await loadFiles();
        } catch (e) {
            setSyncMsg({ type: 'error', text: (e as Error).message ?? 'Sync failed' });
        } finally {
            setSyncing(false);
        }
    };

    const handleRestoreKey = async (key: string) => {
        if (!driveActive) return;
        setRestoring(key);
        try {
            const svc = getStorageService();
            const data = await svc.load(key);
            if (data !== null) {
                // Write back to localStorage so hooks pick it up
                localStorage.setItem(`cv_builder:${key}`, JSON.stringify(data));
                setSyncMsg({ type: 'success', text: `✓ "${formatKey(key).label}" restored from Drive.` });
                onDataRestored?.();
            } else {
                setSyncMsg({ type: 'error', text: `"${formatKey(key).label}" not found in Drive.` });
            }
        } catch (e) {
            setSyncMsg({ type: 'error', text: (e as Error).message ?? 'Restore failed' });
        } finally {
            setRestoring(null);
        }
    };

    const handleRestoreAll = async () => {
        if (!driveActive) return;
        setSyncing(true);
        setSyncMsg(null);
        try {
            const svc = getStorageService();
            const keys = await svc.list();
            for (const key of keys) {
                const data = await svc.load(key);
                if (data !== null) {
                    localStorage.setItem(`cv_builder:${key}`, JSON.stringify(data));
                }
            }
            setSyncMsg({ type: 'success', text: `✓ Restored ${keys.length} items from Google Drive.` });
            onDataRestored?.();
        } catch (e) {
            setSyncMsg({ type: 'error', text: (e as Error).message ?? 'Restore failed' });
        } finally {
            setSyncing(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">☁️ Drive Data</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Sign in with Google to view, save and restore your data from Google Drive.
                </p>
                <button
                    onClick={signIn}
                    className="w-full py-2 px-4 text-sm font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                    Connect Google Drive
                </button>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">☁️ Drive Data</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${driveActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-neutral-700 dark:text-zinc-400'}`}>
                    {driveActive ? '● Drive Active' : '○ Local Only'}
                </span>
            </div>
            {driveActive && (
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 -mt-1">
                    Last synced: <span className="font-semibold text-zinc-500 dark:text-zinc-400">{formatLastSync(lastSync)}</span>
                    <span className="mx-1.5">·</span>
                    Auto-sync every 5 min
                </p>
            )}

            {/* Connected user info */}
            {user && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    {user.picture ? (
                        <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" className="w-6 h-6 rounded-full ring-1 ring-emerald-400" />
                    ) : (
                        <div className="w-6 h-6 rounded-full bg-[#1B2B4B] flex items-center justify-center text-[9px] text-white font-bold">{user.name[0]}</div>
                    )}
                    <div>
                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">{user.name}</p>
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">{user.email}</p>
                    </div>
                </div>
            )}

            {/* Feedback message */}
            {syncMsg && (
                <div className={`text-xs px-3 py-2 rounded-lg font-medium ${syncMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                    {syncMsg.text}
                </div>
            )}

            {/* Migration progress */}
            {migrationProgress && (
                <div className="space-y-1">
                    <div className="w-full bg-zinc-200 dark:bg-neutral-700 rounded-full h-1.5">
                        <div
                            className="bg-[#1B2B4B] h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${(migrationProgress.done / migrationProgress.total) * 100}%` }}
                        />
                    </div>
                    <p className="text-[10px] text-zinc-400 text-center">Syncing {migrationProgress.done} / {migrationProgress.total} items…</p>
                </div>
            )}

            {/* Bulk actions */}
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={handleSyncNow}
                    disabled={syncing || !driveActive}
                    className="py-2 px-3 text-xs font-bold rounded-lg bg-[#1B2B4B] hover:bg-[#152238] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
                >
                    {syncing ? (
                        <span className="animate-spin text-sm">⟳</span>
                    ) : '☁️'} Save All to Drive
                </button>
                <button
                    onClick={handleRestoreAll}
                    disabled={syncing || !driveActive}
                    className="py-2 px-3 text-xs font-bold rounded-lg border border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
                >
                    ⬇️ Restore All
                </button>
            </div>

            {/* File list */}
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {loading ? (
                    <div className="py-6 text-center text-xs text-zinc-400 animate-pulse">Loading Drive files…</div>
                ) : files.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-400">No files found in Drive yet.<br />Click "Save All" to upload your data.</div>
                ) : (
                    files.map(f => (
                        <div key={f.key} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-neutral-700/50 group">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-base leading-none">{f.icon}</span>
                                <span className="text-xs text-zinc-600 dark:text-zinc-300 truncate font-medium">{f.label}</span>
                            </div>
                            <button
                                onClick={() => handleRestoreKey(f.key)}
                                disabled={restoring === f.key || !driveActive}
                                className="text-[10px] font-bold text-[#C9A84C] dark:text-[#C9A84C] opacity-0 group-hover:opacity-100 transition-opacity hover:underline disabled:opacity-50 flex-shrink-0 ml-2"
                            >
                                {restoring === f.key ? '…' : 'Restore'}
                            </button>
                        </div>
                    ))
                )}
            </div>

            <button
                onClick={loadFiles}
                className="w-full text-[10px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            >
                ↻ Refresh file list
            </button>
        </div>
    );
};

export default DriveDataPanel;
