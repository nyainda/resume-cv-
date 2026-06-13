/**
 * AccountPage — Premium, fully responsive account management page.
 */

import React, { useState, useEffect } from 'react';
import type { WorkerUser } from '../services/authService';
import type { UserProfileSlot } from '../types';
import { getSelectedProvider } from '../services/groqService';

interface AccountPageProps {
    workerUser: WorkerUser | null;
    profiles: UserProfileSlot[];
    onSignOut: () => Promise<void>;
    onDeleteAccount: () => Promise<void>;
    onBack: () => void;
    onUpgrade?: () => void;
}

const PLAN_CONFIG: Record<string, { label: string; color: string; bg: string; ring: string; desc: string; icon: string }> = {
    free:  { label: 'Free',     color: '#6b7280', bg: '#f9fafb',   ring: '#e5e7eb', desc: 'All core features included',        icon: '🌱' },
    byok:  { label: 'BYOK Pro', color: '#1B2B4B', bg: '#eef1f7',   ring: '#1B2B4B30', desc: 'Bring-your-own-key plan',          icon: '🔑' },
    pro:   { label: 'Pro',      color: '#92400e', bg: '#fffbeb',   ring: '#fde68a', desc: 'Full access · Priority support',    icon: '⭐' },
};

const PROVIDER_CONFIG: Record<string, { label: string; model: string; color: string; bg: string; darkBg: string; icon: string; desc: string }> = {
    'workers-ai': { label: 'Workers AI',  model: 'Mistral Small 3.1 24B', color: '#f97316', bg: '#fff7ed',   darkBg: '#431407', icon: '☁️', desc: 'Cloudflare Workers AI — free, no key needed' },
    'claude':     { label: 'Claude',      model: 'Haiku 4.5',             color: '#8b5cf6', bg: '#f5f3ff',   darkBg: '#2e1065', icon: '🤖', desc: 'Anthropic Claude — your API key' },
    'gemini':     { label: 'Gemini',      model: '2.5 Flash',             color: '#0891b2', bg: '#ecfeff',   darkBg: '#164e63', icon: '✨', desc: 'Google Gemini — your API key' },
};

const SLOT_COLORS: Record<string, string> = {
    indigo: '#1B2B4B', violet: '#7c3aed', emerald: '#10b981',
    amber: '#f59e0b', rose: '#f43f5e', sky: '#0ea5e9',
};

function Avatar({ name, picture, size = 'lg' }: { name: string; picture?: string; size?: 'sm' | 'md' | 'lg' }) {
    const initials = name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
    const sz = size === 'lg' ? 'w-20 h-20 text-2xl' : size === 'md' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-xs';
    if (picture) return (
        <img src={picture} alt={name} referrerPolicy="no-referrer"
            className={`${sz} rounded-2xl ring-4 ring-white/25 shadow-xl object-cover flex-shrink-0`} />
    );
    return (
        <div className={`${sz} rounded-2xl ring-4 ring-white/20 shadow-xl flex items-center justify-center font-black flex-shrink-0`}
             style={{ background: '#C9A84C', color: '#1B2B4B' }}>
            {initials}
        </div>
    );
}

export default function AccountPage({ workerUser, profiles, onSignOut, onDeleteAccount, onBack, onUpgrade }: AccountPageProps) {
    const [deletingStep, setDeletingStep] = useState<'idle' | 'confirm' | 'typing' | 'deleting'>('idle');
    const [confirmText, setConfirmText] = useState('');
    const [signingOut, setSigningOut] = useState(false);
    const [provider, setProvider] = useState<string>('workers-ai');

    useEffect(() => { setProvider(getSelectedProvider()); }, []);

    const plan = workerUser?.plan ?? 'free';
    const planCfg = PLAN_CONFIG[plan] ?? PLAN_CONFIG.free;
    const provCfg = PROVIDER_CONFIG[provider] ?? PROVIDER_CONFIG['workers-ai'];

    const totalCVs      = profiles.reduce((s, p) => s + (p.savedCVs?.length ?? 0), 0);
    const totalTracked  = profiles.reduce((s, p) => s + (p.trackedApps?.length ?? 0), 0);
    const totalRoles    = profiles.reduce((s, p) => s + (p.profile?.workExperience?.length ?? 0), 0);

    const displayName = workerUser?.name || workerUser?.email?.split('@')[0] || 'User';

    async function handleSignOut() {
        setSigningOut(true);
        try { await onSignOut(); } finally { setSigningOut(false); }
    }

    async function handleDeleteAccount() {
        if (confirmText.toLowerCase() !== 'delete') return;
        setDeletingStep('deleting');
        try { await onDeleteAccount(); } catch { setDeletingStep('confirm'); }
    }

    const stats = [
        { label: 'Profiles',     value: profiles.length, sub: 'career profiles',    icon: '👤' },
        { label: 'CVs Saved',    value: totalCVs,         sub: 'documents',          icon: '📄' },
        { label: 'Jobs Tracked', value: totalTracked,     sub: 'applications',       icon: '📌' },
        { label: 'Roles Added',  value: totalRoles,       sub: 'work entries',       icon: '💼' },
    ];

    return (
        <div className="min-h-screen bg-[#F8F7F4] dark:bg-neutral-950 pb-16">

            {/* ── Hero Banner ─────────────────────────────────────────────── */}
            <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1B2B4B 0%, #152238 60%, #0d1829 100%)' }}>
                {/* Decorative background shapes */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-10" style={{ background: '#C9A84C' }} />
                    <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full opacity-5" style={{ background: '#C9A84C' }} />
                    <div className="absolute top-1/2 left-1/3 w-96 h-px opacity-10" style={{ background: 'linear-gradient(to right, transparent, #C9A84C, transparent)' }} />
                </div>

                {/* Back button */}
                <div className="relative z-10 px-4 sm:px-6 pt-5 pb-0">
                    <button
                        onClick={onBack}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-white/60 hover:text-white transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 5l-7 7 7 7"/>
                        </svg>
                        Back to app
                    </button>
                </div>

                {/* User info */}
                <div className="relative z-10 px-4 sm:px-6 pt-8 pb-12">
                    <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-5">
                        <Avatar name={displayName} picture={workerUser?.picture} size="lg" />
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight truncate"
                                style={{ fontFamily: "'Playfair Display', serif" }}>
                                {displayName}
                            </h1>
                            <p className="text-sm text-white/55 mt-1 truncate">{workerUser?.email ?? 'Not signed in'}</p>
                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                                {/* Plan badge */}
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black"
                                      style={{ background: planCfg.bg, color: planCfg.color, border: `1px solid ${planCfg.ring}` }}>
                                    <span>{planCfg.icon}</span>
                                    {planCfg.label}
                                </span>
                                {plan === 'free' && onUpgrade && (
                                    <button
                                        onClick={onUpgrade}
                                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black transition-all hover:scale-105 active:scale-100"
                                        style={{ background: 'linear-gradient(135deg, #C9A84C, #e0b85c)', color: '#1B2B4B' }}>
                                        ↑ Upgrade to Pro
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Wave divider */}
                <div className="absolute bottom-0 left-0 right-0 h-6 rounded-t-[2rem] bg-[#F8F7F4] dark:bg-neutral-950" />
            </div>

            {/* ── Content ─────────────────────────────────────────────────── */}
            <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-0 pt-6 space-y-5">

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {stats.map(s => (
                        <div key={s.label}
                             className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-4 shadow-sm text-center">
                            <div className="text-2xl mb-1">{s.icon}</div>
                            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 leading-none">{s.value}</div>
                            <div className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 mt-1 uppercase tracking-wide">{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Active AI Provider */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-800 flex items-center justify-between">
                        <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Active AI Provider</h2>
                        <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            In use
                        </span>
                    </div>
                    <div className="p-5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 shadow-sm"
                                 style={{ background: provCfg.bg }}>
                                {provCfg.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base font-black text-zinc-900 dark:text-zinc-50">{provCfg.label}</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                                          style={{ background: provCfg.bg, color: provCfg.color }}>
                                        {provCfg.model}
                                    </span>
                                </div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{provCfg.desc}</p>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-neutral-800 rounded-xl px-3 py-2">
                            This provider powers <strong className="text-zinc-600 dark:text-zinc-300">all AI features</strong> — CV generation, analysis, cover letters, interview prep, and file import. Change it in <strong className="text-zinc-600 dark:text-zinc-300">Settings → AI Provider</strong>.
                        </p>
                    </div>
                </div>

                {/* Account details */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-800">
                        <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Account Details</h2>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-neutral-800">
                        <InfoRow label="Full Name"     value={workerUser?.name  || '—'} />
                        <InfoRow label="Email"         value={workerUser?.email || '—'} mono />
                        <InfoRow label="Plan"          value={`${planCfg.icon}  ${planCfg.label} — ${planCfg.desc}`} />
                        <InfoRow label="Data Storage"  value="Browser (private — stays on your device)" />
                    </div>
                </div>

                {/* Profiles */}
                {profiles.length > 0 && (
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-800 flex items-center justify-between">
                            <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Your Profiles</h2>
                            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500">{profiles.length} total</span>
                        </div>
                        <div className="divide-y divide-zinc-100 dark:divide-neutral-800">
                            {profiles.map(slot => {
                                const bg = SLOT_COLORS[slot.color] ?? '#1B2B4B';
                                const initials = slot.name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
                                const cvCount   = slot.savedCVs?.length ?? 0;
                                const roleCount = slot.profile?.workExperience?.length ?? 0;
                                return (
                                    <div key={slot.id} className="px-5 py-4 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm"
                                             style={{ background: bg }}>
                                            {initials}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">{slot.name}</p>
                                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                                                {roleCount} role{roleCount !== 1 ? 's' : ''} · {cvCount} CV{cvCount !== 1 ? 's' : ''}
                                                {slot.trackedApps?.length ? ` · ${slot.trackedApps.length} tracked` : ''}
                                            </p>
                                        </div>
                                        {slot.createdAt && (
                                            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 flex-shrink-0">
                                                {new Date(slot.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Session / Sign out */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-800">
                        <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Session</h2>
                    </div>
                    <div className="p-5">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                            Signing out removes your session from this device. Your CV data and profiles stay saved in the browser — nothing is deleted.
                        </p>
                        <button
                            onClick={handleSignOut}
                            disabled={signingOut}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-zinc-200 dark:border-neutral-700 text-sm font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-800 hover:border-zinc-300 transition-all disabled:opacity-60"
                        >
                            {signingOut ? (
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3"/>
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                                </svg>
                            ) : (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                                    <polyline points="16 17 21 12 16 7"/>
                                    <line x1="21" y1="12" x2="9" y2="12"/>
                                </svg>
                            )}
                            {signingOut ? 'Signing out…' : 'Sign out of this device'}
                        </button>
                    </div>
                </div>

                {/* Danger zone */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border-2 border-red-100 dark:border-red-900/40 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-red-100 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/30">
                        <h2 className="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-wide flex items-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            Danger Zone
                        </h2>
                    </div>
                    <div className="p-5">
                        {deletingStep === 'idle' && (
                            <>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
                                    Deleting your account permanently removes your session and all cloud-synced data. Your local browser data (CVs, profiles) is also cleared from this device.
                                </p>
                                <button
                                    onClick={() => setDeletingStep('confirm')}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-red-200 dark:border-red-800 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6"/>
                                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                        <path d="M10 11v6"/><path d="M14 11v6"/>
                                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                    </svg>
                                    Delete my account
                                </button>
                            </>
                        )}

                        {(deletingStep === 'confirm' || deletingStep === 'typing' || deletingStep === 'deleting') && (
                            <div className="space-y-4">
                                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                    <div>
                                        <p className="text-sm font-black text-red-700 dark:text-red-400">This action cannot be undone</p>
                                        <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-1 leading-relaxed">
                                            Your account, session data, and all cloud-synced CVs will be permanently deleted. Local browser data will also be cleared from this device.
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                        Type <code className="font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded text-xs">delete</code> to confirm
                                    </label>
                                    <input
                                        type="text"
                                        value={confirmText}
                                        onChange={e => { setConfirmText(e.target.value); setDeletingStep('typing'); }}
                                        placeholder="delete"
                                        autoFocus
                                        className="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none transition-all dark:bg-neutral-800 dark:text-zinc-200"
                                        style={{ borderColor: confirmText.toLowerCase() === 'delete' ? '#dc2626' : '#fca5a5' }}
                                        disabled={deletingStep === 'deleting'}
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setDeletingStep('idle'); setConfirmText(''); }}
                                        disabled={deletingStep === 'deleting'}
                                        className="flex-1 py-2.5 rounded-xl border-2 border-zinc-200 dark:border-neutral-700 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-all disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDeleteAccount}
                                        disabled={confirmText.toLowerCase() !== 'delete' || deletingStep === 'deleting'}
                                        className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {deletingStep === 'deleting' ? (
                                            <span className="inline-flex items-center justify-center gap-2">
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
                <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center pt-2 pb-6">
                    ProCV · Your data stays private in your browser
                </p>
            </div>
        </div>
    );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="px-5 py-4 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
            <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium flex-shrink-0">{label}</span>
            <span className={`text-sm font-semibold text-zinc-800 dark:text-zinc-200 sm:text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>
                {value}
            </span>
        </div>
    );
}
