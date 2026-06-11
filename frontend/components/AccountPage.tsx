/**
 * AccountPage — User account management page.
 * Shows profile info, plan, usage stats, sign out, and delete account.
 */

import React, { useState } from 'react';
import type { WorkerUser } from '../services/authService';
import type { UserProfileSlot, SavedCV } from '../types';

interface AccountPageProps {
    workerUser: WorkerUser | null;
    profiles: UserProfileSlot[];
    onSignOut: () => Promise<void>;
    onDeleteAccount: () => Promise<void>;
    onBack: () => void;
}

const PLAN_LABELS: Record<string, { label: string; color: string; bg: string; description: string }> = {
    free:  { label: 'Free',     color: '#6b7280', bg: '#f3f4f6',   description: 'All core features included' },
    byok:  { label: 'BYOK Pro', color: '#1B2B4B', bg: '#e8edf5',   description: 'Bring-your-own-key plan' },
    pro:   { label: 'Pro',      color: '#92400e', bg: '#fef3c7',   description: 'Full access, priority support' },
};

export default function AccountPage({ workerUser, profiles, onSignOut, onDeleteAccount, onBack }: AccountPageProps) {
    const [deletingStep, setDeletingStep] = useState<'idle' | 'confirm' | 'typing' | 'deleting'>('idle');
    const [confirmText, setConfirmText] = useState('');
    const [signingOut, setSigningOut] = useState(false);

    const plan = workerUser?.plan ?? 'free';
    const planInfo = PLAN_LABELS[plan] ?? PLAN_LABELS.free;

    const totalCVs = profiles.reduce((sum, s) => sum + (s.savedCVs?.length ?? 0), 0);
    const totalTracked = profiles.reduce((sum, s) => sum + (s.trackedApps?.length ?? 0), 0);

    const displayName = workerUser?.name || workerUser?.email?.split('@')[0] || 'User';
    const initials = displayName.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('');

    async function handleSignOut() {
        setSigningOut(true);
        try { await onSignOut(); } finally { setSigningOut(false); }
    }

    async function handleDeleteAccount() {
        if (confirmText.toLowerCase() !== 'delete') return;
        setDeletingStep('deleting');
        try { await onDeleteAccount(); } catch {
            setDeletingStep('confirm');
        }
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-neutral-900 py-8 px-4">
            <div className="max-w-2xl mx-auto space-y-5">

                {/* Back button */}
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors mb-2"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 5l-7 7 7 7"/>
                    </svg>
                    Back to app
                </button>

                {/* Header card */}
                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                    <div style={{ background: 'linear-gradient(135deg, #1B2B4B 0%, #243a63 100%)' }} className="px-6 pt-7 pb-10 relative">
                        {/* Decorative dots */}
                        <div className="absolute top-3 right-4 flex gap-1.5 opacity-30">
                            <div className="w-2 h-2 rounded-full bg-white" />
                            <div className="w-2 h-2 rounded-full bg-white" />
                            <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                        <div className="flex items-center gap-4">
                            {workerUser?.picture ? (
                                <img
                                    src={workerUser.picture}
                                    alt={displayName}
                                    referrerPolicy="no-referrer"
                                    className="w-16 h-16 rounded-2xl ring-4 ring-white/20 shadow-lg object-cover"
                                />
                            ) : (
                                <div className="w-16 h-16 rounded-2xl ring-4 ring-white/20 shadow-lg flex items-center justify-center text-2xl font-black"
                                     style={{ background: '#C9A84C', color: '#1B2B4B' }}>
                                    {initials || '?'}
                                </div>
                            )}
                            <div>
                                <h1 className="text-xl font-black text-white leading-tight">{displayName}</h1>
                                <p className="text-sm text-white/60 mt-0.5">{workerUser?.email}</p>
                            </div>
                        </div>
                    </div>

                    {/* Plan badge strip */}
                    <div className="px-6 -mt-5 pb-5">
                        <div className="inline-flex items-center gap-2 rounded-xl px-4 py-2 shadow-sm border"
                             style={{ background: planInfo.bg, borderColor: planInfo.color + '30' }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: planInfo.color }} />
                            <span className="text-xs font-black uppercase tracking-wider" style={{ color: planInfo.color }}>
                                {planInfo.label}
                            </span>
                            <span className="text-xs" style={{ color: planInfo.color + 'cc' }}>· {planInfo.description}</span>
                        </div>
                    </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'Profiles', value: profiles.length, icon: '👤' },
                        { label: 'CVs Saved', value: totalCVs, icon: '📄' },
                        { label: 'Jobs Tracked', value: totalTracked, icon: '📌' },
                    ].map(stat => (
                        <div key={stat.label} className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-4 text-center shadow-sm">
                            <div className="text-2xl mb-1">{stat.icon}</div>
                            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 leading-none">{stat.value}</div>
                            <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 font-medium">{stat.label}</div>
                        </div>
                    ))}
                </div>

                {/* Account info */}
                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-zinc-100 dark:border-neutral-700">
                        <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Account Details</h2>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-neutral-700">
                        <Row label="Name" value={workerUser?.name || '—'} />
                        <Row label="Email" value={workerUser?.email || '—'} />
                        <Row label="Plan" value={planInfo.label} />
                        <Row label="Data stored" value="In your browser (private)" />
                    </div>
                </div>

                {/* Profiles list */}
                {profiles.length > 0 && (
                    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-zinc-100 dark:border-neutral-700">
                            <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Your Profiles</h2>
                        </div>
                        <div className="divide-y divide-zinc-100 dark:divide-neutral-700">
                            {profiles.map(slot => (
                                <div key={slot.id} className="px-6 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <ProfileDot color={slot.color} name={slot.name} />
                                        <div>
                                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{slot.name}</p>
                                            <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                                {slot.profile?.workExperience?.length ?? 0} roles · {slot.savedCVs?.length ?? 0} CVs
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                        {slot.createdAt ? new Date(slot.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Sign out */}
                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-zinc-100 dark:border-neutral-700">
                        <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Session</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                            Signing out clears your session from this device. Your CV data stays saved in the browser.
                        </p>
                        <button
                            onClick={handleSignOut}
                            disabled={signingOut}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-zinc-200 dark:border-neutral-600 text-sm font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 hover:border-zinc-300 transition-all disabled:opacity-60"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                                <polyline points="16 17 21 12 16 7"/>
                                <line x1="21" y1="12" x2="9" y2="12"/>
                            </svg>
                            {signingOut ? 'Signing out…' : 'Sign out of this device'}
                        </button>
                    </div>
                </div>

                {/* Danger zone */}
                <div className="bg-white dark:bg-neutral-800 rounded-2xl border-2 border-red-100 dark:border-red-900/30 overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10">
                        <h2 className="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-wide">Danger Zone</h2>
                    </div>
                    <div className="p-6">
                        {deletingStep === 'idle' && (
                            <>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                                    Deleting your account will permanently remove your session and all cloud-synced data. Your browser-local data (CVs, profiles) will also be cleared from this device.
                                </p>
                                <button
                                    onClick={() => setDeletingStep('confirm')}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-red-200 dark:border-red-800 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                    </svg>
                                    Delete my account
                                </button>
                            </>
                        )}

                        {(deletingStep === 'confirm' || deletingStep === 'typing' || deletingStep === 'deleting') && (
                            <div className="space-y-4">
                                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                    <div>
                                        <p className="text-sm font-black text-red-700 dark:text-red-400">This action cannot be undone</p>
                                        <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                                            Your account, session data, and all cloud-synced CVs will be permanently deleted. Local browser data will also be cleared.
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                        Type <span className="font-black text-red-600 dark:text-red-400 font-mono">delete</span> to confirm
                                    </label>
                                    <input
                                        type="text"
                                        value={confirmText}
                                        onChange={e => { setConfirmText(e.target.value); setDeletingStep('typing'); }}
                                        placeholder="delete"
                                        autoFocus
                                        className="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none transition-all"
                                        style={{
                                            borderColor: confirmText.toLowerCase() === 'delete' ? '#dc2626' : '#fca5a5',
                                            background: '#fff',
                                        }}
                                        disabled={deletingStep === 'deleting'}
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setDeletingStep('idle'); setConfirmText(''); }}
                                        disabled={deletingStep === 'deleting'}
                                        className="flex-1 py-2.5 rounded-xl border-2 border-zinc-200 dark:border-neutral-600 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-all disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDeleteAccount}
                                        disabled={confirmText.toLowerCase() !== 'delete' || deletingStep === 'deleting'}
                                        className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {deletingStep === 'deleting' ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                                                    <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                                                </svg>
                                                Deleting…
                                            </span>
                                        ) : 'Delete account permanently'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center pb-8">
                    ProCV · Your data stays private in your browser
                </p>
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="px-6 py-3.5 flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">{label}</span>
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 text-right">{value}</span>
        </div>
    );
}

function ProfileDot({ color, name }: { color: string; name: string }) {
    const colorMap: Record<string, string> = {
        indigo: '#1B2B4B', violet: '#7c3aed', emerald: '#10b981',
        amber: '#f59e0b', rose: '#f43f5e', sky: '#0ea5e9',
    };
    const bg = colorMap[color] ?? '#1B2B4B';
    const initials = name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
    return (
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
             style={{ background: bg }}>
            {initials}
        </div>
    );
}
