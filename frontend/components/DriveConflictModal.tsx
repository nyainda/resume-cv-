// components/DriveConflictModal.tsx
//
// Shown whenever DriveStorageService detects a remote file was modified
// since the last local load (optimistic locking conflict).
//
// Design: slides up from bottom-right as a compact card rather than a
// full-screen modal — less alarming, doesn't block work, auto-highlights
// whichever version is newer so the right choice is obvious.

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

function timeAgo(iso: string): string {
    try {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    } catch {
        return '';
    }
}

const KEY_LABELS: Record<string, string> = {
    userProfile: 'User Profile',
    savedCVs: 'Saved CVs',
    currentCV: 'Current CV Draft',
    trackedApps: 'Job Applications',
    apiSettings: 'API Settings',
    profiles: 'Profiles',
    activeProfileId: 'Active Profile',
    darkMode: 'Theme',
};

function labelFor(key: string): string {
    return KEY_LABELS[key] ?? key;
}

interface Props {
    onResolved?: (key: string, action: 'overwrite' | 'pull' | 'dismiss') => void;
}

export const DriveConflictModal: React.FC<Props> = ({ onResolved }) => {
    const [conflict, setConflict] = useState<ConflictEvent | null>(null);
    const [working, setWorking] = useState<'overwrite' | 'pull' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<ConflictEvent>).detail;
            setConflict(detail);
            setError(null);
            setWorking(null);
            // Small delay so the CSS transition fires
            setTimeout(() => setVisible(true), 20);
        };
        window.addEventListener('drive-conflict', handler);
        return () => window.removeEventListener('drive-conflict', handler);
    }, []);

    const dismiss = useCallback(() => {
        setVisible(false);
        setTimeout(() => {
            setConflict(null);
            onResolved?.(conflict?.key ?? '', 'dismiss');
        }, 300);
    }, [conflict, onResolved]);

    const resolve = useCallback(async (action: 'overwrite' | 'pull') => {
        if (!conflict) return;
        setWorking(action);
        setError(null);

        try {
            const router = getDriveRouter();
            if (!router) throw new Error('Not connected to Google Drive');

            if (action === 'overwrite') {
                await router.forceSaveToDrive(conflict.key, conflict.localData);
            } else {
                await router.pullFromDrive(conflict.key);
                window.location.reload();
            }

            onResolved?.(conflict.key, action);
            setVisible(false);
            setTimeout(() => setConflict(null), 300);
        } catch (err) {
            setError((err as Error).message ?? 'Something went wrong');
            setWorking(null);
        }
    }, [conflict, onResolved]);

    if (!conflict) return null;

    const driveTs = new Date(conflict.driveModifiedAt).getTime();
    const localTs = new Date(conflict.storedModifiedAt).getTime();
    const driveIsNewer = driveTs > localTs;
    const recommended: 'pull' | 'overwrite' = driveIsNewer ? 'pull' : 'overwrite';

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 24,
                right: 24,
                zIndex: 9999,
                width: 360,
                maxWidth: 'calc(100vw - 32px)',
                transform: visible ? 'translateY(0)' : 'translateY(120%)',
                opacity: visible ? 1 : 0,
                transition: 'transform 0.3s cubic-bezier(0.34,1.26,0.64,1), opacity 0.25s ease',
                pointerEvents: visible ? 'all' : 'none',
            }}
        >
            <div style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                borderRadius: 16,
                boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
                overflow: 'hidden',
                fontFamily: 'system-ui,-apple-system,sans-serif',
            }}>
                {/* Header */}
                <div style={{
                    padding: '14px 16px 12px',
                    borderBottom: '1px solid #f4f4f5',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: '#fef3c7', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 15, flexShrink: 0,
                    }}>
                        🔄
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#18181b', lineHeight: 1.2 }}>
                            Drive version differs
                        </div>
                        <div style={{ fontSize: 11, color: '#71717a', marginTop: 2, lineHeight: 1.4 }}>
                            <strong style={{ color: '#3f3f46' }}>{labelFor(conflict.key)}</strong>
                            {' '}was changed on another device.
                        </div>
                    </div>
                    <button
                        onClick={dismiss}
                        disabled={!!working}
                        style={{
                            border: 'none', background: 'none', cursor: 'pointer',
                            color: '#a1a1aa', padding: '2px 4px', borderRadius: 6,
                            fontSize: 16, lineHeight: 1, flexShrink: 0,
                        }}
                        title="Decide later"
                    >
                        ✕
                    </button>
                </div>

                {/* Version comparison */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Drive version */}
                    <div
                        onClick={() => !working && resolve('pull')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 12, cursor: working ? 'default' : 'pointer',
                            border: `1.5px solid ${recommended === 'pull' ? '#3b82f6' : '#e4e4e7'}`,
                            background: recommended === 'pull' ? '#eff6ff' : '#fafafa',
                            transition: 'all 0.15s',
                            opacity: working === 'overwrite' ? 0.4 : 1,
                        }}
                    >
                        <span style={{ fontSize: 18, flexShrink: 0 }}>☁️</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
                                Drive version
                                {recommended === 'pull' && (
                                    <span style={{ marginLeft: 6, fontSize: 10, background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>
                                        NEWER ✓
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
                                {timeAgo(conflict.driveModifiedAt)} · {formatDate(conflict.driveModifiedAt)}
                            </div>
                        </div>
                        {working === 'pull' ? (
                            <span style={{ fontSize: 14, animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>⟳</span>
                        ) : (
                            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={2.5} style={{ flexShrink: 0 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                            </svg>
                        )}
                    </div>

                    {/* Local version */}
                    <div
                        onClick={() => !working && resolve('overwrite')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 12, cursor: working ? 'default' : 'pointer',
                            border: `1.5px solid ${recommended === 'overwrite' ? '#7c3aed' : '#e4e4e7'}`,
                            background: recommended === 'overwrite' ? '#f5f3ff' : '#fafafa',
                            transition: 'all 0.15s',
                            opacity: working === 'pull' ? 0.4 : 1,
                        }}
                    >
                        <span style={{ fontSize: 18, flexShrink: 0 }}>💻</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9' }}>
                                This device
                                {recommended === 'overwrite' && (
                                    <span style={{ marginLeft: 6, fontSize: 10, background: '#ede9fe', color: '#6d28d9', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>
                                        NEWER ✓
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
                                {timeAgo(conflict.storedModifiedAt)} · {formatDate(conflict.storedModifiedAt)}
                            </div>
                        </div>
                        {working === 'overwrite' ? (
                            <span style={{ fontSize: 14, animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>⟳</span>
                        ) : (
                            <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="#7c3aed" strokeWidth={2.5} style={{ flexShrink: 0 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                            </svg>
                        )}
                    </div>

                    {error && (
                        <div style={{
                            padding: '8px 12px', borderRadius: 10,
                            background: '#fef2f2', border: '1px solid #fecaca',
                            fontSize: 11, color: '#dc2626',
                        }}>
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div style={{
                    padding: '8px 16px 12px',
                    fontSize: 10.5, color: '#a1a1aa', textAlign: 'center', lineHeight: 1.4,
                }}>
                    Click a version to use it · ✕ to decide later
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default DriveConflictModal;
