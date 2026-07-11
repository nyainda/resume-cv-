/**
 * PricingModal — ProCV pricing tiers.
 *
 * Three tiers: Free · BYOK · Premium
 * Matches the authoritative TIER_FEATURES gate in accountTierService.ts.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';

interface PricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentPlan?: string;
    userEmail?: string;
    /** If provided, the pricing modal opens directly to this tab */
    defaultView?: 'cards' | 'compare';
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

const CHECK = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const CROSS = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 opacity-20">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const PARTIAL = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 opacity-50">
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

// ─── Comparison table data ────────────────────────────────────────────────────

interface FeatureRow {
    label: string;
    free:    'yes' | 'no' | 'partial' | string;
    byok:    'yes' | 'no' | 'partial' | string;
    premium: 'yes' | 'no' | 'partial' | string;
}

interface FeatureSection {
    title: string;
    rows: FeatureRow[];
}

const FEATURE_SECTIONS: FeatureSection[] = [
    {
        title: 'Usage',
        rows: [
            { label: 'CV generations',   free: '3 total',         byok: 'Unlimited',       premium: 'Unlimited'     },
            { label: 'Profile slots',    free: '1',               byok: '3',               premium: '5'             },
            { label: 'PDF downloads',    free: '2, watermarked',  byok: 'Unlimited, watermarked', premium: 'Unlimited, clean' },
            { label: 'AI model',         free: 'Mistral 24B',     byok: 'Your own keys',   premium: 'Llama 70B + DeepSeek R1' },
        ],
    },
    {
        title: 'CV Builder',
        rows: [
            { label: 'All 35+ templates',         free: 'yes',          byok: 'yes',     premium: 'yes'     },
            { label: 'Generation modes',           free: 'Honest only',  byok: 'All 3',   premium: 'All 3 incl. Aggressive' },
            { label: 'ATS gap pinning',            free: 'no',           byok: 'yes',     premium: 'yes'     },
            { label: 'CV Doctor & humanizer',      free: 'partial',      byok: 'yes',     premium: 'yes'     },
            { label: 'Smart bullets rewrite',      free: 'partial',      byok: 'yes',     premium: 'yes'     },
            { label: 'Market research',            free: 'partial',      byok: 'yes',     premium: 'yes'     },
        ],
    },
    {
        title: 'Career Suite',
        rows: [
            { label: 'Interview Prep',             free: 'no',           byok: 'yes',     premium: 'yes'     },
            { label: 'Email Apply',                free: 'no',           byok: 'yes',     premium: 'yes'     },
            { label: 'Scholarship Essay Writer',   free: 'no',           byok: 'yes',     premium: 'yes'     },
            { label: 'Application Tracker',        free: '15 apps',      byok: 'Unlimited', premium: 'Unlimited' },
            { label: 'LinkedIn Optimizer',         free: 'no',           byok: 'no',      premium: 'yes'     },
            { label: 'Salary Negotiation Coach',   free: 'no',           byok: 'no',      premium: 'yes'     },
            { label: 'Career Pivot Advisor',       free: 'no',           byok: 'no',      premium: 'yes'     },
        ],
    },
    {
        title: 'Downloads & Sharing',
        rows: [
            { label: 'CV sharing links',           free: 'yes',          byok: 'yes',     premium: 'yes'     },
            { label: 'Watermark-free PDF',         free: 'no',           byok: 'no',      premium: 'yes'     },
            { label: 'Bulk export (ZIP)',           free: 'no',           byok: 'no',      premium: 'yes'     },
            { label: 'Custom domain sharing',      free: 'no',           byok: 'no',      premium: 'yes'     },
            { label: 'Word (.docx) import',        free: 'yes',          byok: 'yes',     premium: 'yes'     },
            { label: 'PDF / image import',         free: 'yes',          byok: 'yes',     premium: 'yes'     },
        ],
    },
];

const TIER_COLORS = {
    free:    { accent: '#6B7280', light: '#F3F4F6', text: '#374151' },
    byok:    { accent: '#2563EB', light: '#EFF6FF', text: '#1D4ED8' },
    premium: { accent: '#1B2B4B', light: '#E8EDF5', text: '#1B2B4B' },
};

function CellValue({ value, accent }: { value: string; accent: string }) {
    if (value === 'yes')     return <span style={{ color: accent }}>{CHECK}</span>;
    if (value === 'no')      return <span className="text-zinc-200 dark:text-zinc-700">{CROSS}</span>;
    if (value === 'partial') return <span style={{ color: accent }}>{PARTIAL}</span>;
    return <span className="text-[10px] font-semibold leading-tight text-center block" style={{ color: accent }}>{value}</span>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PricingModal({
    isOpen,
    onClose,
    currentPlan = 'free',
    userEmail: _userEmail,
    defaultView = 'cards',
}: PricingModalProps) {
    const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
    const [view, setView] = useState<'cards' | 'compare'>(defaultView);

    if (!isOpen) return null;

    const proMonthly = 19;
    const proAnnual  = Math.round(149 / 12);

    const effectivePlan = currentPlan === 'premium' ? 'premium'
        : currentPlan === 'byok'    ? 'byok'
        : 'free';

    function handleUpgradePremium() {
        // TODO Phase 2: open Stripe Checkout
        // For now, direct them to email notification
        window.open('mailto:hello@procv.app?subject=ProCV Premium — notify me&body=Please notify me when Premium launches!', '_blank');
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="relative w-full sm:max-w-5xl bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                style={{ maxHeight: '95dvh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Mobile drag handle */}
                <div className="flex justify-center pt-2.5 pb-0 sm:hidden">
                    <div className="w-10 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                </div>

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
                    <div>
                        <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white"
                            style={{ fontFamily: "'Playfair Display', serif" }}>
                            Choose your plan
                        </h2>
                        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                            Start free — upgrade when you need more. Your work is always saved.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Cards / Compare toggle */}
                        <div className="hidden sm:flex items-center gap-0.5 bg-zinc-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
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
                        {/* Monthly / Annual toggle */}
                        <div className="hidden sm:flex items-center gap-0.5 bg-zinc-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
                            {(['monthly', 'annual'] as const).map(b => (
                                <button key={b} onClick={() => setBilling(b)}
                                    className={`px-3 py-1.5 rounded-md font-bold transition-all ${
                                        billing === b
                                            ? 'bg-white dark:bg-neutral-700 text-zinc-900 dark:text-white shadow-sm'
                                            : 'text-zinc-500 dark:text-zinc-400'
                                    }`}>
                                    {b === 'annual' ? 'Annual (−35%)' : 'Monthly'}
                                </button>
                            ))}
                        </div>
                        <button onClick={onClose}
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-neutral-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors text-xl font-bold flex-shrink-0">
                            ×
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {view === 'cards' ? (
                        /* ── Cards view ─────────────────────────────────── */
                        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">

                            {/* ── FREE ── */}
                            <div className={`flex flex-col rounded-2xl border-2 overflow-hidden ${effectivePlan === 'free' ? 'ring-2 ring-zinc-400' : ''}`}
                                 style={{ borderColor: '#E5E7EB' }}>
                                <div className="p-4 sm:p-5 flex flex-col flex-1">
                                    <div className="text-2xl mb-1.5">🆓</div>
                                    <h3 className="text-base font-black text-zinc-900 dark:text-white">Free</h3>
                                    <div className="flex items-baseline gap-1 mt-1 mb-1">
                                        <span className="text-3xl font-black text-zinc-500">$0</span>
                                        <span className="text-xs text-zinc-400">forever</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                                        Try ProCV with no card and no API key. AI is included — no setup.
                                    </p>
                                    <button disabled className="w-full py-2.5 rounded-xl text-xs font-black bg-zinc-100 dark:bg-neutral-800 text-zinc-400 cursor-default mb-4">
                                        {effectivePlan === 'free' ? '✓ Current plan' : 'Always free'}
                                    </button>
                                    <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 flex-1">
                                        {[
                                            '3 CV generations (lifetime)',
                                            '1 profile slot',
                                            'All 35+ templates',
                                            'Workers AI — Mistral 24B',
                                            'CV checker & ATS score',
                                            'Application tracker (15 apps)',
                                            'CV sharing links',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2">
                                                <span className="text-zinc-400 mt-0.5 flex-shrink-0">{CHECK}</span>
                                                {f}
                                            </li>
                                        ))}
                                        {[
                                            'Boosted / Aggressive modes',
                                            'Interview Prep, Email Apply',
                                            'LinkedIn, Salary, Career Pivot',
                                            'Clean PDF (no watermark)',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2 opacity-30">
                                                <span className="flex-shrink-0 mt-0.5">{CROSS}</span>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* ── BYOK ── */}
                            <div className={`flex flex-col rounded-2xl border-2 overflow-hidden ${effectivePlan === 'byok' ? 'ring-2 ring-blue-400' : ''}`}
                                 style={{ borderColor: '#BFDBFE' }}>
                                <div className="p-4 sm:p-5 flex flex-col flex-1">
                                    <div className="text-2xl mb-1.5">🔑</div>
                                    <h3 className="text-base font-black text-zinc-900 dark:text-white">BYOK</h3>
                                    <div className="flex items-baseline gap-1 mt-1 mb-1">
                                        <span className="text-3xl font-black text-blue-600">$0</span>
                                        <span className="text-xs text-zinc-400">+ your API key</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                                        Bring your Gemini or Claude key. Unlimited generations on your own quota.
                                    </p>
                                    {effectivePlan === 'byok' ? (
                                        <button disabled className="w-full py-2.5 rounded-xl text-xs font-black bg-blue-50 text-blue-400 cursor-default mb-4">
                                            ✓ Current plan
                                        </button>
                                    ) : (
                                        <button onClick={onClose}
                                            className="w-full py-2.5 rounded-xl text-xs font-black text-center bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors mb-4">
                                            Add key in Settings →
                                        </button>
                                    )}
                                    <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 flex-1">
                                        {[
                                            'Unlimited generations',
                                            '3 profile slots',
                                            'Gemini / Claude (your key)',
                                            'All 3 modes (incl. Aggressive)',
                                            'ATS gap pinning',
                                            'Interview Prep · Email Apply',
                                            'Scholarship Essay Writer',
                                            'Unlimited job tracking',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2">
                                                <span className="text-blue-500 mt-0.5 flex-shrink-0">{CHECK}</span>
                                                {f}
                                            </li>
                                        ))}
                                        {[
                                            'LinkedIn, Salary, Career Pivot',
                                            'Clean PDF (no watermark)',
                                            'Bulk export · Custom domain',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2 opacity-30">
                                                <span className="flex-shrink-0 mt-0.5">{CROSS}</span>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-3 leading-relaxed">
                                        Get a free Gemini key at <span className="font-bold">aistudio.google.com</span>
                                    </p>
                                </div>
                            </div>

                            {/* ── PREMIUM ── */}
                            <div className={`flex flex-col rounded-2xl border-2 overflow-hidden ${effectivePlan === 'premium' ? 'ring-2 ring-yellow-400' : ''}`}
                                 style={{ borderColor: '#1B2B4B', boxShadow: '0 8px 32px rgba(27,43,75,0.14)' }}>
                                <div className="text-[10px] font-black uppercase tracking-widest py-1 text-center text-white"
                                     style={{ background: '#1B2B4B' }}>
                                    ⭐ Most popular
                                </div>
                                <div className="p-4 sm:p-5 flex flex-col flex-1">
                                    <div className="text-2xl mb-1.5">👑</div>
                                    <h3 className="text-base font-black text-zinc-900 dark:text-white">Premium</h3>
                                    <div className="flex items-baseline gap-1 mt-1 mb-1">
                                        <span className="text-3xl font-black" style={{ color: '#1B2B4B' }}>
                                            ${billing === 'annual' ? proAnnual : proMonthly}
                                        </span>
                                        <span className="text-xs text-zinc-400">
                                            /mo{billing === 'annual' ? ' · billed $149/yr' : ''}
                                        </span>
                                    </div>
                                    {billing === 'annual' && (
                                        <div className="text-[10px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/30 rounded-md px-2 py-0.5 inline-block mb-1 self-start">
                                            Save 35% vs monthly
                                        </div>
                                    )}
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                                        Everything, unlimited. Best AI models. Clean PDFs. For serious job seekers.
                                    </p>
                                    {effectivePlan === 'premium' ? (
                                        <button disabled className="w-full py-2.5 rounded-xl text-xs font-black text-white cursor-default mb-4"
                                                style={{ background: '#C9A84C' }}>
                                            ✓ You're on Premium
                                        </button>
                                    ) : (
                                        <button onClick={handleUpgradePremium}
                                            className="w-full py-2.5 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 active:scale-95 mb-4 shadow-lg"
                                            style={{ background: 'linear-gradient(135deg, #1B2B4B 0%, #2d4270 100%)' }}>
                                            Get Premium — coming soon
                                        </button>
                                    )}
                                    <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 flex-1">
                                        {[
                                            'Unlimited generations',
                                            '5 profile slots',
                                            'Llama 70B + DeepSeek R1',
                                            'All 3 modes incl. Aggressive',
                                            'ATS gap pinning',
                                            'Interview Prep · Email Apply',
                                            'Scholarship Essay Writer',
                                            'LinkedIn Optimizer',
                                            'Salary Negotiation Coach',
                                            'Career Pivot Advisor',
                                            'Clean PDF — no watermark',
                                            'Bulk export · Custom domain',
                                        ].map(f => (
                                            <li key={f} className="flex items-start gap-2">
                                                <span style={{ color: '#C9A84C' }} className="mt-0.5 flex-shrink-0">{CHECK}</span>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ── Comparison table ────────────────────────────── */
                        <div className="p-4 sm:p-5 overflow-x-auto">
                            <table className="w-full text-xs border-collapse min-w-[520px]">
                                <thead>
                                    <tr>
                                        <th className="text-left py-3 pr-4 text-zinc-500 dark:text-zinc-400 font-semibold w-44">Feature</th>
                                        {[
                                            { id: 'free',    label: '🆓 Free',    sub: '$0',                          color: TIER_COLORS.free.accent    },
                                            { id: 'byok',    label: '🔑 BYOK',    sub: '$0 + your key',               color: TIER_COLORS.byok.accent    },
                                            { id: 'premium', label: '👑 Premium', sub: `$${billing === 'annual' ? proAnnual : proMonthly}/mo`, color: TIER_COLORS.premium.accent },
                                        ].map(t => (
                                            <th key={t.id} className="text-center py-3 px-3 font-black" style={{ color: t.color }}>
                                                <div>{t.label}</div>
                                                <div className="text-[10px] font-semibold text-zinc-400 mt-0.5">{t.sub}</div>
                                                {effectivePlan === t.id && (
                                                    <div className="text-[9px] font-black mt-0.5 px-2 py-0.5 rounded-full inline-block"
                                                         style={{ background: t.color + '20', color: t.color }}>Current</div>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {FEATURE_SECTIONS.map(section => (
                                        <React.Fragment key={section.title}>
                                            <tr>
                                                <td colSpan={4} className="pt-4 pb-1">
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
                                                        { val: row.free,    color: TIER_COLORS.free.accent    },
                                                        { val: row.byok,    color: TIER_COLORS.byok.accent    },
                                                        { val: row.premium, color: TIER_COLORS.premium.accent },
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
                    <div className="px-5 sm:px-6 pb-5 pt-2 space-y-2">
                        {/* Annual billing toggle on mobile */}
                        <div className="sm:hidden flex items-center gap-1 bg-zinc-100 dark:bg-neutral-800 rounded-lg p-1 text-xs w-full">
                            {(['monthly', 'annual'] as const).map(b => (
                                <button key={b} onClick={() => setBilling(b)}
                                    className={`flex-1 py-2 rounded-md font-bold transition-all ${
                                        billing === b
                                            ? 'bg-white dark:bg-neutral-700 text-zinc-900 dark:text-white shadow-sm'
                                            : 'text-zinc-500'
                                    }`}>
                                    {b === 'annual' ? 'Annual (−35%)' : 'Monthly'}
                                </button>
                            ))}
                        </div>
                        <div className="text-center space-y-1">
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
                                🔐 Your CVs and data are never deleted when you change plans.
                                Upgrading only unlocks — it never resets your work.
                            </p>
                            <p className="text-[10px] text-zinc-300 dark:text-zinc-700">
                                No subscription contracts · Cancel any time
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
