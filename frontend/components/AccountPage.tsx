/**
 * AccountPage — Premium, fully responsive account management page.
 */

import React, { useState, useEffect } from 'react';
import type { WorkerUser } from '../services/authService';
import type { UserProfileSlot } from '../types';
import { getSelectedProvider } from '../services/groqService';
import { useAccountTier } from '../hooks/useAccountTier';

interface AccountPageProps {
    workerUser: WorkerUser | null;
    profiles: UserProfileSlot[];
    onSignOut: () => Promise<void>;
    onDeleteAccount: () => Promise<void>;
    onClearAllData: () => Promise<void>;
    onBack: () => void;
    onUpgrade?: () => void;
    onEditProfile?: () => void;
}

const PLAN_CONFIG: Record<string, { label: string; color: string; bg: string; darkBg: string; ring: string; darkRing: string; desc: string; icon: string }> = {
    free:    { label: 'Free',     color: '#4b5563', bg: '#f3f4f6',   darkBg: 'rgba(255,255,255,0.08)', ring: '#d1d5db', darkRing: 'rgba(255,255,255,0.12)', desc: 'All core features included',     icon: '🌱' },
    byok:    { label: 'BYOK Pro', color: '#1B2B4B', bg: '#eef1f7',   darkBg: 'rgba(27,43,75,0.5)',     ring: '#1B2B4B30', darkRing: 'rgba(201,168,76,0.3)',   desc: 'Bring-your-own-key plan',        icon: '🔑' },
    premium: { label: 'Premium',  color: '#92400e', bg: '#fffbeb',   darkBg: 'rgba(201,168,76,0.15)',  ring: '#fde68a',   darkRing: 'rgba(201,168,76,0.4)',   desc: 'Full access · Priority support', icon: '⭐' },
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
    const sz = size === 'lg' ? 'w-16 h-16 text-xl' : size === 'md' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-xs';
    if (picture) return (
        <img src={picture} alt={name} referrerPolicy="no-referrer"
            className={`${sz} rounded-2xl ring-2 ring-zinc-200 dark:ring-neutral-700 shadow-md object-cover flex-shrink-0`} />
    );
    return (
        <div className={`${sz} rounded-2xl ring-2 ring-zinc-200 dark:ring-neutral-700 shadow-md flex items-center justify-center font-black flex-shrink-0`}
             style={{ background: '#1B2B4B', color: '#C9A84C' }}>
            {initials}
        </div>
    );
}

export default function AccountPage({ workerUser, profiles, onSignOut, onDeleteAccount, onClearAllData, onBack, onUpgrade, onEditProfile }: AccountPageProps) {
    const [deletingStep, setDeletingStep] = useState<'idle' | 'confirm' | 'typing' | 'deleting'>('idle');
    const [confirmText, setConfirmText] = useState('');
    const [signingOut, setSigningOut] = useState(false);
    const [provider, setProvider] = useState<string>('workers-ai');
    const [clearDataStep, setClearDataStep] = useState<'idle' | 'confirm' | 'clearing'>('idle');
    const [copiedId, setCopiedId] = useState(false);

    useEffect(() => { setProvider(getSelectedProvider()); }, []);

    // Server confirms 'free' | 'premium' only — BYOK is client-detected via
    // key presence, so use the reactive effective tier (not the raw plan
    // field) to get an accurate 'byok' badge here.
    const { effectiveTier } = useAccountTier();
    const plan = effectiveTier;
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

            {/* ── Header card — adapts to light & dark ────────────────────── */}
            <div className="bg-white dark:bg-neutral-900 border-b border-zinc-200 dark:border-neutral-800">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 pb-6">

                    {/* Top bar: back link + quick sign-out */}
                    <div className="flex items-center justify-between mb-5">
                        <button
                            onClick={onBack}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 12H5M12 5l-7 7 7 7"/>
                            </svg>
                            Back to app
                        </button>
                        {/* Sign out — always visible at the top */}
                        <button
                            onClick={handleSignOut}
                            disabled={signingOut}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50"
                        >
                            {signingOut ? (
                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3"/>
                                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                                </svg>
                            ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                                    <polyline points="16 17 21 12 16 7"/>
                                    <line x1="21" y1="12" x2="9" y2="12"/>
                                </svg>
                            )}
                            {signingOut ? 'Signing out…' : 'Sign out'}
                        </button>
                    </div>

                    {/* User row */}
                    <div className="flex items-center gap-4">
                        <Avatar name={displayName} picture={workerUser?.picture} size="lg" />
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50 leading-tight truncate"
                                style={{ fontFamily: "'Playfair Display', serif" }}>
                                {displayName}
                            </h1>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                                {workerUser?.email ?? 'Not signed in'}
                            </p>
                            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                                {/* Plan badge */}
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border
                                                 bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300
                                                 border-zinc-200 dark:border-neutral-700">
                                    <span>{planCfg.icon}</span>
                                    {planCfg.label}
                                </span>
                                {plan === 'free' && onUpgrade && (
                                    <button
                                        onClick={onUpgrade}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-all hover:opacity-90 active:scale-95"
                                        style={{ background: '#1B2B4B', color: '#C9A84C', borderColor: '#1B2B4B' }}>
                                        ↑ Upgrade to Pro
                                    </button>
                                )}
                                {/* Edit profile shortcut */}
                                {onEditProfile && (
                                    <button
                                        onClick={() => { onBack(); onEditProfile(); }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border border-zinc-200 dark:border-neutral-700 bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-all"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                        </svg>
                                        Edit Profile
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Content ─────────────────────────────────────────────────── */}
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 space-y-5">

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

                {/* Active AI Provider — only shown for BYOK users with a configured key-based provider */}
                {plan === 'byok' && provider !== 'workers-ai' && (
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
                )}

                {/* Account details */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-800">
                        <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Account Details</h2>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-neutral-800">
                        <InfoRow label="Full Name" value={workerUser?.name  || '—'} />
                        <InfoRow label="Email"     value={workerUser?.email || '—'} mono />
                        <InfoRow label="Plan"      value={`${planCfg.icon}  ${planCfg.label} — ${planCfg.desc}`} />
                        {/* Account ID with copy */}
                        <div className="px-5 py-4 flex items-center justify-between gap-4">
                            <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium flex-shrink-0">Account ID</span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 tracking-wider">
                                    {workerUser?.id
                                        ? String(workerUser.id).padStart(8, '0').replace(/^(.{4})(.{4})$/, '$1-$2')
                                        : '—'}
                                </span>
                                {workerUser?.id && (
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(String(workerUser!.id));
                                            setCopiedId(true);
                                            setTimeout(() => setCopiedId(false), 2000);
                                        }}
                                        title="Copy Account ID"
                                        className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all border"
                                        style={copiedId
                                            ? { background: '#dcfce7', color: '#16a34a', borderColor: '#86efac' }
                                            : { background: 'transparent', color: '#9ca3af', borderColor: '#e5e7eb' }}
                                    >
                                        {copiedId ? '✓ Copied' : 'Copy'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <InfoRow label="Storage" value="Browser (private — stays on your device)" />
                    </div>
                </div>

                {/* Data Protection */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-800 flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                        <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Data Protection</h2>
                    </div>
                    <div className="p-5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {[
                                { icon: '🔐', title: 'AES-256 encryption', desc: 'API keys stored encrypted in IndexedDB — never in plaintext' },
                                { icon: '🌐', title: 'TLS 1.3 in transit', desc: 'Every network request is encrypted end-to-end' },
                                { icon: '🏠', title: 'Browser-first storage', desc: 'CV data stays on your device; only synced when signed in' },
                                { icon: '🛡️', title: 'Zero key exposure', desc: 'Keys proxied via Cloudflare Worker — never visible in DevTools' },
                                { icon: '🔒', title: 'HttpOnly sessions', desc: 'Session cookies can\'t be read by JavaScript or extensions' },
                                { icon: '🗑️', title: 'Right to erasure', desc: 'Delete your account to permanently remove all cloud data' },
                            ].map(item => (
                                <div key={item.title} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-800/50">
                                    <span className="text-base flex-shrink-0 mt-px">{item.icon}</span>
                                    <div>
                                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{item.title}</p>
                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed pt-1 border-t border-zinc-100 dark:border-neutral-800">
                            ProCV does not sell your data. CV content is sent to your chosen AI provider only during generation and is never stored on our servers.
                        </p>
                    </div>
                </div>

                {/* Storage & Backup */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-800">
                        <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Storage &amp; Backup</h2>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="space-y-2">
                            {[
                                { badge: 'Cloud-synced', badgeColor: '#22c55e', icon: '☁️', title: 'Cloudflare D1', desc: 'Profiles, CVs, preferences — synced across devices when signed in' },
                                { badge: 'Encrypted', badgeColor: '#8b5cf6', icon: '🔒', title: 'IndexedDB (Browser)', desc: 'API keys, session tokens — encrypted locally, never leaves your device' },
                                { badge: 'Local only', badgeColor: '#f59e0b', icon: '💾', title: 'localStorage', desc: 'UI prefs, sync bookkeeping, cache — local to this browser only' },
                            ].map(item => (
                                <div key={item.title} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-neutral-800/50">
                                    <span className="text-xl flex-shrink-0">{item.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{item.title}</span>
                                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                                                  style={{ background: item.badgeColor + '20', color: item.badgeColor }}>
                                                {item.badge}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="pt-3 border-t border-zinc-100 dark:border-neutral-800 flex items-center justify-between gap-3 flex-wrap">
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Export a full JSON backup of your profile data any time.</p>
                            <button
                                onClick={() => {
                                    try {
                                        const data = {
                                            exportedAt: new Date().toISOString(),
                                            accountId: workerUser?.id,
                                            profiles: JSON.parse(localStorage.getItem('cv_builder:profiles') || '[]'),
                                        };
                                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `procv-backup-${new Date().toISOString().slice(0, 10)}.json`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    } catch { /* non-fatal */ }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-all flex-shrink-0"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                Export backup
                            </button>
                        </div>
                    </div>
                </div>

                {/* Share Your CV / Profile */}
                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-800 flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">Share Your CV / Profile</h2>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-zinc-100 dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400">
                            Settings → Profile &amp; Sharing
                        </span>
                    </div>
                    <div className="p-5">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                            Generate expiring share links for job applications, or set up a permanent public profile page with your own URL.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                            {[
                                { icon: '🔗', title: 'Temporary link', desc: 'Expiring link — ideal for one-off job applications', badge: 'Most popular' },
                                { icon: '🌐', title: 'Public profile', desc: 'Permanent branded page at procv.app/p/your-name', badge: 'For your brand' },
                            ].map(item => (
                                <div key={item.title} className="p-3 rounded-xl bg-zinc-50 dark:bg-neutral-800/50 border border-zinc-100 dark:border-neutral-700">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-base">{item.icon}</span>
                                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{item.title}</span>
                                        <span className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                                              style={{ background: '#C9A84C20', color: '#C9A84C' }}>
                                            {item.badge}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={onBack}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90"
                            style={{ background: '#1B2B4B', color: '#C9A84C' }}
                        >
                            Open Profile &amp; Sharing settings
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                        </button>
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
                    <div className="p-5 space-y-5">

                        {/* ── Reset browser data ─────────────────────────────── */}
                        <div className="pb-5 border-b border-zinc-100 dark:border-neutral-800">
                            <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Reset browser data</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                                Clears all locally stored data from this browser — profiles, CVs, settings, cookies, and cached files. Your account and cloud-synced data are <strong>not</strong> deleted. Use this if you're seeing stale data from a previous account.
                            </p>

                            {clearDataStep === 'idle' && (
                                <button
                                    onClick={() => setClearDataStep('confirm')}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-amber-200 dark:border-amber-800 text-sm font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
                                        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                                    </svg>
                                    Reset browser data
                                </button>
                            )}

                            {clearDataStep === 'confirm' && (
                                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-amber-700 dark:text-amber-400 mb-1">This will sign you out on this device</p>
                                        <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mb-3 leading-relaxed">
                                            All local data (profiles, CVs, API keys, settings) will be wiped from this browser. You can sign back in to restore cloud-synced data.
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setClearDataStep('idle')}
                                                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    setClearDataStep('clearing');
                                                    await onClearAllData();
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition-all"
                                            >
                                                Yes, clear everything
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {clearDataStep === 'clearing' && (
                                <div className="inline-flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 font-semibold">
                                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="rgba(217,119,6,0.3)" strokeWidth="3"/>
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#d97706" strokeWidth="3" strokeLinecap="round"/>
                                    </svg>
                                    Clearing browser data…
                                </div>
                            )}
                        </div>

                        {/* ── Delete account ─────────────────────────────────── */}
                        <div>
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
