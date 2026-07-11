/**
 * PricingModal — ProCV pricing tiers.
 *
 * 4 tiers:
 *   Free            — 2 CV generations, hard-capped, no payment.
 *   BYOK            — Unlimited with the user's own API keys, no payment.
 *   Pay-per-Download — $2.99 per credit (Stripe), Llama 3.3 70B, no subscription.
 *   Pro             — $19/mo or $149/yr, full suite, Llama 3.3 70B.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';

interface PricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentPlan?: string;
    userEmail?: string;
}

const CHECK = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const CROSS = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 opacity-25">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const PARTIAL = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 opacity-60">
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

interface FeatureRow {
    label: string;
    free: 'yes' | 'no' | 'partial' | string;
    byok: 'yes' | 'no' | 'partial' | string;
    ppd: 'yes' | 'no' | 'partial' | string;
    pro: 'yes' | 'no' | 'partial' | string;
}

interface FeatureSection {
    title: string;
    rows: FeatureRow[];
}

const FEATURE_SECTIONS: FeatureSection[] = [
    {
        title: 'Usage',
        rows: [
            { label: 'CV generations',         free: '2 total',      byok: 'Unlimited',     ppd: '1 per credit',  pro: 'Unlimited' },
            { label: 'Profile rooms',           free: '1',            byok: '3',             ppd: '1',             pro: '5' },
            { label: 'PDF downloads',           free: '2 max',        byok: 'Unlimited',     ppd: '1 per credit',  pro: 'Unlimited' },
            { label: 'AI model',                free: 'Mistral 24B',  byok: 'Your own keys', ppd: 'Llama 3.3 70B', pro: 'Llama 3.3 70B' },
        ],
    },
    {
        title: 'CV Builder',
        rows: [
            { label: 'All 35+ templates',           free: 'yes', byok: 'yes',     ppd: 'yes',     pro: 'yes' },
            { label: 'Generation modes',            free: 'Honest only', byok: 'All 3',  ppd: 'Honest + Boosted', pro: 'All 3 incl. Aggressive' },
            { label: 'ATS gap pinning',             free: 'no',  byok: 'yes',     ppd: 'yes',     pro: 'yes' },
            { label: 'Smart bullets rewrite',       free: 'no',  byok: 'yes',     ppd: 'yes',     pro: 'yes' },
            { label: 'CV Checker (full ATS score)', free: 'partial', byok: 'yes', ppd: 'yes',     pro: 'yes' },
            { label: 'HR Detector',                 free: 'no',  byok: 'yes',     ppd: 'no',      pro: 'yes' },
            { label: 'Paraphraser',                 free: 'no',  byok: 'yes',     ppd: 'yes',     pro: 'yes' },
            { label: 'Market research',             free: 'partial', byok: 'yes', ppd: 'yes',     pro: 'yes' },
        ],
    },
    {
        title: 'Career Suite',
        rows: [
            { label: 'LinkedIn Optimizer',           free: 'no',  byok: 'yes', ppd: 'no',  pro: 'yes' },
            { label: 'Interview Prep',               free: 'no',  byok: 'yes', ppd: 'no',  pro: 'yes' },
            { label: 'Salary Negotiation Coach',     free: 'no',  byok: 'yes', ppd: 'no',  pro: 'yes' },
            { label: 'Portal Scanner',               free: 'partial', byok: 'yes', ppd: 'partial', pro: 'yes' },
            { label: 'Scholarship Essay Writer',     free: 'no',  byok: 'yes', ppd: 'no',  pro: 'yes' },
            { label: 'Application Tracker',          free: 'yes', byok: 'yes', ppd: 'yes', pro: 'yes' },
            { label: 'Analytics Dashboard',          free: 'no',  byok: 'yes', ppd: 'no',  pro: 'yes' },
        ],
    },
    {
        title: 'Import & Export',
        rows: [
            { label: 'Word (.docx) import',     free: 'yes', byok: 'yes', ppd: 'yes', pro: 'yes' },
            { label: 'PDF import',              free: 'no',  byok: 'yes', ppd: 'yes', pro: 'yes' },
            { label: 'GitHub import',           free: 'no',  byok: 'yes', ppd: 'no',  pro: 'yes' },
            { label: 'WYSIWYG PDF download',    free: 'partial', byok: 'yes', ppd: 'yes', pro: 'yes' },
            { label: 'CV sharing links',        free: 'yes', byok: 'yes', ppd: 'yes', pro: 'yes' },
            { label: 'Google Drive / OneDrive', free: 'no',  byok: 'yes', ppd: 'no',  pro: 'yes' },
        ],
    },
];

const TIER_COLORS = {
    free: { accent: '#6b7280', light: '#f3f4f6', text: '#374151' },
    byok: { accent: '#2563eb', light: '#eff6ff', text: '#1d4ed8' },
    ppd:  { accent: '#d97706', light: '#fffbeb', text: '#92400e' },
    pro:  { accent: '#1B2B4B', light: '#e8edf5', text: '#1B2B4B' },
};

function CellValue({ value, accent }: { value: FeatureRow['free']; accent: string }) {
    if (value === 'yes')     return <span style={{ color: accent }}>{CHECK}</span>;
    if (value === 'no')      return <span className="text-zinc-300 dark:text-zinc-600">{CROSS}</span>;
    if (value === 'partial') return <span style={{ color: accent, opacity: 0.7 }}>{PARTIAL}</span>;
    return <span className="text-[10px] font-semibold leading-tight" style={{ color: accent }}>{value}</span>;
}

export default function PricingModal({ isOpen, onClose, currentPlan = 'free', userEmail: _userEmail }: PricingModalProps) {
    const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
    const [view, setView] = useState<'cards' | 'compare'>('cards');

    if (!isOpen) return null;

    const proMonthly = 19;
    const proAnnual  = Math.round(149 / 12);

    function handleUpgrade(tier: string) {
        if (tier === 'pro') {
            // TODO: wire Stripe checkout — setTier('premium') after payment confirmed
            alert("Pro payments are launching soon! You'll be emailed when it's live.");
        } else if (tier === 'ppd') {
            alert("Pay-per-download credits are coming soon via Stripe. Each credit = 1 premium-quality CV generation + download.");
        }
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="relative w-full sm:max-w-6xl bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                style={{ maxHeight: '95dvh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-zinc-900 dark:text-white">Choose your plan</h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                            Start free — pay only when you need more.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Cards / Compare toggle */}
                        <div className="hidden sm:flex items-center gap-1 bg-zinc-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
                            {(['cards', 'compare'] as const).map(v => (
                                <button key={v} onClick={() => setView(v)}
                                    className={`px-3 py-1.5 rounded-md font-bold transition-all capitalize ${
                                        view === v
                                            ? 'bg-white dark:bg-neutral-700 text-zinc-900 dark:text-white shadow-sm'
                                            : 'text-zinc-500 dark:text-zinc-400'
                                    }`}>
                                    {v}
                                </button>
                            ))}
                        </div>
                        {/* Monthly / Annual toggle — only relevant for Pro */}
                        <div className="hidden sm:flex items-center gap-1 bg-zinc-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
                            {(['monthly', 'annual'] as const).map(b => (
                                <button key={b} onClick={() => setBilling(b)}
                                    className={`px-3 py-1.5 rounded-md font-bold transition-all ${
                                        billing === b
                                            ? 'bg-white dark:bg-neutral-700 text-zinc-900 dark:text-white shadow-sm'
                                            : 'text-zinc-500 dark:text-zinc-400'
                                    }`}>
                                    {b === 'annual' ? 'Annual (save 35%)' : 'Monthly'}
                                </button>
                            ))}
                        </div>
                        <button onClick={onClose}
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-neutral-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors text-lg font-bold flex-shrink-0">
                            ×
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {view === 'cards' ? (
                        /* ── Cards view ── */
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                            {/* FREE */}
                            <div className="flex flex-col rounded-2xl border-2 border-zinc-200 dark:border-neutral-700 overflow-hidden">
                                <div className="p-5 flex flex-col flex-1">
                                    <div className="text-2xl mb-1">🆓</div>
                                    <h3 className="text-base font-black text-zinc-900 dark:text-white">Free</h3>
                                    <div className="flex items-baseline gap-1 mt-1 mb-1">
                                        <span className="text-3xl font-black text-zinc-500">$0</span>
                                        <span className="text-xs text-zinc-400">forever</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">Try it out. 2 full CV generations, no card needed.</p>
                                    <button disabled className="w-full py-2.5 rounded-xl text-sm font-black bg-zinc-100 dark:bg-neutral-800 text-zinc-400 cursor-default mb-4">
                                        {currentPlan === 'free' ? '✓ Current plan' : 'Free forever'}
                                    </button>
                                    <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 flex-1">
                                        {[
                                            '2 CV generations total',
                                            '1 profile room',
                                            'All 35+ templates',
                                            'ATS score checker (basic)',
                                            'Application tracker',
                                            'CV sharing links',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2">
                                                <span className="text-zinc-400 mt-0.5 flex-shrink-0">{CHECK}</span>
                                                {f}
                                            </li>
                                        ))}
                                        {[
                                            'Boosted / Aggressive modes',
                                            'Career suite tools',
                                            'Cloud backup',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2 opacity-35">
                                                <span className="flex-shrink-0 mt-0.5">{CROSS}</span>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* BYOK */}
                            <div className="flex flex-col rounded-2xl border-2 border-blue-200 dark:border-blue-900 overflow-hidden">
                                <div className="p-5 flex flex-col flex-1">
                                    <div className="text-2xl mb-1">🔑</div>
                                    <h3 className="text-base font-black text-zinc-900 dark:text-white">BYOK</h3>
                                    <div className="flex items-baseline gap-1 mt-1 mb-1">
                                        <span className="text-3xl font-black text-blue-600">$0</span>
                                        <span className="text-xs text-zinc-400">your own API keys</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">Bring your Groq or Gemini key. Full features, unlimited generations — your quota.</p>
                                    <a href="#settings" onClick={onClose}
                                        className="w-full py-2.5 rounded-xl text-sm font-black text-center bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors mb-4 block">
                                        Add keys in Settings →
                                    </a>
                                    <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 flex-1">
                                        {[
                                            'Unlimited generations (your quota)',
                                            '3 profile rooms',
                                            'All 35+ templates',
                                            'All 3 generation modes',
                                            'Full career suite',
                                            'Google Drive / OneDrive backup',
                                            'GitHub import',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2">
                                                <span className="text-blue-600 mt-0.5 flex-shrink-0">{CHECK}</span>
                                                {f}
                                            </li>
                                        ))}
                                        <li className="flex items-start gap-2 opacity-50">
                                            <span className="flex-shrink-0 mt-0.5">{CROSS}</span>
                                            Llama 3.3 70B (managed)
                                        </li>
                                    </ul>
                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-3 leading-relaxed">
                                        Requires: <span className="font-bold">Groq</span> (free tier) or <span className="font-bold">Gemini</span> API key. Add in Settings → API Keys.
                                    </p>
                                </div>
                            </div>

                            {/* PAY-PER-DOWNLOAD */}
                            <div className="flex flex-col rounded-2xl border-2 border-amber-300 dark:border-amber-800 overflow-hidden">
                                <div className="bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest py-1 text-center">
                                    No subscription needed
                                </div>
                                <div className="p-5 flex flex-col flex-1">
                                    <div className="text-2xl mb-1">💳</div>
                                    <h3 className="text-base font-black text-zinc-900 dark:text-white">Pay-per-Download</h3>
                                    <div className="flex items-baseline gap-1 mt-1 mb-0.5">
                                        <span className="text-3xl font-black text-amber-600">from $3.49</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 leading-relaxed">
                                        One credit = one Llama 3.3 70B generation + WYSIWYG PDF. Buy as many as you need — credits never expire.
                                    </p>

                                    {/* Credit bundle picker */}
                                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden mb-4 text-xs">
                                        {[
                                            { qty: 1,  price: '$3.49',  each: '$3.49', tag: '',              popular: false },
                                            { qty: 4,  price: '$10.99', each: '$2.75', tag: 'Save 21%',      popular: false },
                                            { qty: 8,  price: '$18.99', each: '$2.37', tag: 'Most popular ★', popular: true  },
                                            { qty: 15, price: '$29.99', each: '$2.00', tag: 'Save 43%',      popular: false },
                                        ].map(b => (
                                            <div key={b.qty}
                                                className={`flex items-center justify-between px-3 py-2 border-b last:border-b-0 border-amber-100 dark:border-amber-900 ${b.popular ? 'bg-amber-50 dark:bg-amber-900/30' : ''}`}>
                                                <span className={`font-bold ${b.popular ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                                    {b.qty} credit{b.qty > 1 ? 's' : ''}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    {b.tag && (
                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${b.popular ? 'bg-amber-500 text-white' : 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300'}`}>
                                                            {b.tag}
                                                        </span>
                                                    )}
                                                    <span className="text-zinc-400 dark:text-zinc-500">{b.each}/ea</span>
                                                    <span className={`font-black ${b.popular ? 'text-amber-600' : 'text-zinc-800 dark:text-zinc-200'}`}>{b.price}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <button onClick={() => handleUpgrade('ppd')}
                                        className="w-full py-2.5 rounded-xl text-sm font-black bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 transition-colors mb-4">
                                        Buy credits — coming soon
                                    </button>

                                    <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 flex-1">
                                        {[
                                            'Llama 3.3 70B (premium quality)',
                                            'All 35+ templates',
                                            'Honest + Boosted modes',
                                            'ATS gap pinning',
                                            'Full ATS score checker',
                                            'WYSIWYG PDF download',
                                            'CV sharing link',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2">
                                                <span className="text-amber-600 mt-0.5 flex-shrink-0">{CHECK}</span>
                                                {f}
                                            </li>
                                        ))}
                                        {[
                                            'Career suite (LinkedIn, Interview…)',
                                            'Cloud backup',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2 opacity-35">
                                                <span className="flex-shrink-0 mt-0.5">{CROSS}</span>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* PRO */}
                            <div className="flex flex-col rounded-2xl border-2 overflow-hidden"
                                style={{ borderColor: '#1B2B4B', boxShadow: '0 8px 32px rgba(27,43,75,0.12)' }}>
                                <div className="text-[10px] font-black uppercase tracking-widest py-1 text-center text-white"
                                    style={{ background: '#1B2B4B' }}>
                                    Most popular
                                </div>
                                <div className="p-5 flex flex-col flex-1">
                                    <div className="text-2xl mb-1">⭐</div>
                                    <h3 className="text-base font-black text-zinc-900 dark:text-white">Pro</h3>
                                    <div className="flex items-baseline gap-1 mt-1 mb-1">
                                        <span className="text-3xl font-black" style={{ color: '#1B2B4B' }}>
                                            ${billing === 'annual' ? proAnnual : proMonthly}
                                        </span>
                                        <span className="text-xs text-zinc-400">
                                            /mo{billing === 'annual' ? ', billed $149/yr' : ''}
                                        </span>
                                    </div>
                                    {billing === 'annual' && (
                                        <div className="text-[10px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/30 rounded-md px-2 py-0.5 inline-block mb-1">
                                            Save 35% vs monthly
                                        </div>
                                    )}
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">Everything, unlimited. For serious job seekers.</p>
                                    <button onClick={() => handleUpgrade('pro')}
                                        className="w-full py-2.5 rounded-xl text-sm font-black text-white transition-colors mb-4 shadow-lg"
                                        style={{ background: '#1B2B4B' }}>
                                        Upgrade to Pro — coming soon
                                    </button>
                                    <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 flex-1">
                                        {[
                                            'Llama 3.3 70B (fastest, best)',
                                            'Unlimited generations',
                                            '5 profile rooms',
                                            'All 3 modes incl. Aggressive',
                                            'Full career suite (12 tools)',
                                            'Google Drive / OneDrive sync',
                                            'GitHub import',
                                            'HR Detector + Analytics',
                                            'Priority support',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2">
                                                <span style={{ color: '#1B2B4B' }} className="mt-0.5 flex-shrink-0">{CHECK}</span>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ── Comparison table view ── */
                        <div className="p-5 overflow-x-auto">
                            <table className="w-full text-xs border-collapse min-w-[640px]">
                                <thead>
                                    <tr>
                                        <th className="text-left py-3 pr-4 text-zinc-500 dark:text-zinc-400 font-semibold w-48">Feature</th>
                                        {[
                                            { id: 'free', label: '🆓 Free',              sub: '$0',           color: TIER_COLORS.free.accent },
                                            { id: 'byok', label: '🔑 BYOK',              sub: '$0 + your keys', color: TIER_COLORS.byok.accent },
                                            { id: 'ppd',  label: '💳 Pay-per-Download',  sub: '$2.99 / DL',   color: TIER_COLORS.ppd.accent  },
                                            { id: 'pro',  label: '⭐ Pro',               sub: `$${billing === 'annual' ? proAnnual : proMonthly}/mo`, color: TIER_COLORS.pro.accent  },
                                        ].map(t => (
                                            <th key={t.id} className="text-center py-3 px-3 font-black" style={{ color: t.color }}>
                                                <div>{t.label}</div>
                                                <div className="text-[10px] font-semibold text-zinc-400 mt-0.5">{t.sub}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {FEATURE_SECTIONS.map(section => (
                                        <React.Fragment key={section.title}>
                                            <tr>
                                                <td colSpan={5} className="pt-4 pb-1">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                                                        {section.title}
                                                    </span>
                                                </td>
                                            </tr>
                                            {section.rows.map((row, i) => (
                                                <tr key={row.label}
                                                    className={`border-t ${i === 0 ? 'border-zinc-200 dark:border-neutral-700' : 'border-zinc-100 dark:border-neutral-800'}`}>
                                                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300 font-medium">{row.label}</td>
                                                    {([
                                                        { val: row.free, color: TIER_COLORS.free.accent },
                                                        { val: row.byok, color: TIER_COLORS.byok.accent },
                                                        { val: row.ppd,  color: TIER_COLORS.ppd.accent  },
                                                        { val: row.pro,  color: TIER_COLORS.pro.accent  },
                                                    ] as const).map((cell, ci) => (
                                                        <td key={ci} className="py-2 px-3 text-center align-middle">
                                                            <div className="flex items-center justify-center">
                                                                <CellValue value={cell.val} accent={cell.color} />
                                                            </div>
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ── Footer ── */}
                    <div className="px-6 pb-5 pt-1 text-center space-y-1">
                        <p className="text-xs text-zinc-400 dark:text-zinc-600">
                            All plans store data 100% privately in your browser. No CV data is ever shared or sold.
                        </p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-600">
                            Cancel Pro anytime. Pay-per-download credits never expire.
                        </p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
