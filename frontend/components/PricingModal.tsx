/**
 * PricingModal — Billing preparation component.
 * Shows Free / Pro / Business tiers with feature lists and CTAs.
 * Wired up and ready for a payment processor (Stripe / Whop) to be attached later.
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const CROSS = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 opacity-30">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

interface Plan {
    id: string;
    name: string;
    price: { monthly: number; annual: number };
    badge?: string;
    accentColor: string;
    accentBg: string;
    description: string;
    features: Array<{ label: string; included: boolean }>;
    cta: string;
}

const PLANS: Plan[] = [
    {
        id: 'free',
        name: 'Free',
        price: { monthly: 0, annual: 0 },
        accentColor: '#6b7280',
        accentBg: '#f3f4f6',
        description: 'Everything you need to start your job search.',
        features: [
            { label: '1 career profile', included: true },
            { label: 'All 35+ CV templates', included: true },
            { label: 'AI CV generation (community quota)', included: true },
            { label: 'PDF download', included: true },
            { label: 'ATS score checker', included: true },
            { label: 'Interview prep tool', included: true },
            { label: 'Multiple profiles (rooms)', included: false },
            { label: 'Priority AI models (GPT-4o, Claude 3.5)', included: false },
            { label: 'Unlimited generations', included: false },
            { label: 'Cloud sync across devices', included: false },
            { label: 'Cover letter generator', included: false },
        ],
        cta: 'Current plan',
    },
    {
        id: 'pro',
        name: 'Pro',
        badge: 'Most popular',
        price: { monthly: 9, annual: 7 },
        accentColor: '#1B2B4B',
        accentBg: '#e8edf5',
        description: 'For active job seekers targeting multiple roles.',
        features: [
            { label: 'Everything in Free', included: true },
            { label: 'Up to 5 career profiles', included: true },
            { label: 'Priority AI models (GPT-4o, Claude 3.5)', included: true },
            { label: 'Unlimited CV generations', included: true },
            { label: 'Cloud sync across devices', included: true },
            { label: 'Cover letter generator', included: true },
            { label: 'LinkedIn optimizer', included: true },
            { label: 'Salary research & negotiation coach', included: true },
            { label: 'Job pipeline tracker', included: true },
            { label: 'Email reply writer', included: false },
            { label: 'Team seats', included: false },
        ],
        cta: 'Upgrade to Pro',
    },
    {
        id: 'business',
        name: 'Business',
        badge: 'Coming soon',
        price: { monthly: 29, annual: 22 },
        accentColor: '#92400e',
        accentBg: '#fef3c7',
        description: 'For career coaches, agencies, and power users.',
        features: [
            { label: 'Everything in Pro', included: true },
            { label: 'Unlimited career profiles', included: true },
            { label: 'Up to 5 team seats', included: true },
            { label: 'Email reply writer', included: true },
            { label: 'White-label CV export', included: true },
            { label: 'Bulk generate for clients', included: true },
            { label: 'Priority support', included: true },
            { label: 'API access (beta)', included: true },
            { label: 'Custom templates (beta)', included: true },
            { label: 'Dedicated account manager', included: false },
            { label: 'SLA guarantee', included: false },
        ],
        cta: 'Join waitlist',
    },
];

export default function PricingModal({ isOpen, onClose, currentPlan = 'free', userEmail }: PricingModalProps) {
    const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
    const [loading, setLoading] = useState<string | null>(null);

    if (!isOpen) return null;

    function handleCta(plan: Plan) {
        if (plan.id === 'free' || plan.id === currentPlan) return;
        if (plan.id === 'business') {
            window.open(
                `https://procv.app/waitlist?plan=business${userEmail ? `&email=${encodeURIComponent(userEmail)}` : ''}`,
                '_blank',
                'noopener,noreferrer'
            );
            return;
        }
        setLoading(plan.id);
        setTimeout(() => {
            setLoading(null);
            alert('Payments are coming soon! You\'ll be notified when Pro launches.');
        }, 800);
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="relative w-full sm:max-w-5xl bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                style={{ maxHeight: '95dvh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-neutral-800 flex-shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-zinc-900 dark:text-white">Choose your plan</h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                            Upgrade to unlock more profiles, unlimited AI, and cloud sync.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Billing toggle */}
                        <div className="hidden sm:flex items-center gap-2 bg-zinc-100 dark:bg-neutral-800 rounded-xl p-1">
                            {(['monthly', 'annual'] as const).map(b => (
                                <button
                                    key={b}
                                    onClick={() => setBilling(b)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${billing === b
                                        ? 'bg-white dark:bg-neutral-700 text-zinc-900 dark:text-white shadow-sm'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                                >
                                    {b === 'annual' ? 'Annual (save 20%)' : 'Monthly'}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={onClose}
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors text-lg font-bold flex-shrink-0"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Plans */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {PLANS.map(plan => {
                            const price = billing === 'annual' ? plan.price.annual : plan.price.monthly;
                            const isCurrentPlan = plan.id === currentPlan;
                            const isPro = plan.id === 'pro';

                            return (
                                <div
                                    key={plan.id}
                                    className={`relative flex flex-col rounded-2xl border-2 overflow-hidden transition-all ${
                                        isPro
                                            ? 'border-[#1B2B4B] shadow-lg shadow-[#1B2B4B]/10'
                                            : 'border-zinc-200 dark:border-neutral-700'
                                    }`}
                                >
                                    {/* Badge */}
                                    {plan.badge && (
                                        <div
                                            className="absolute top-0 left-0 right-0 text-center text-[10px] font-black uppercase tracking-widest py-1"
                                            style={{
                                                background: isPro ? '#1B2B4B' : '#f59e0b',
                                                color: '#fff',
                                            }}
                                        >
                                            {plan.badge}
                                        </div>
                                    )}

                                    <div className={`flex flex-col flex-1 p-5 ${plan.badge ? 'pt-8' : ''}`}>
                                        {/* Plan name + price */}
                                        <div className="mb-4">
                                            <h3 className="text-base font-black text-zinc-900 dark:text-white">{plan.name}</h3>
                                            <div className="flex items-baseline gap-1 mt-1">
                                                <span className="text-3xl font-black" style={{ color: plan.accentColor }}>
                                                    {price === 0 ? 'Free' : `$${price}`}
                                                </span>
                                                {price > 0 && (
                                                    <span className="text-sm text-zinc-400 dark:text-zinc-500">
                                                        /mo{billing === 'annual' ? ', billed annually' : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                                                {plan.description}
                                            </p>
                                        </div>

                                        {/* CTA */}
                                        <button
                                            onClick={() => handleCta(plan)}
                                            disabled={isCurrentPlan || plan.id === 'business'}
                                            className={`w-full py-2.5 rounded-xl text-sm font-black transition-all mb-5 ${
                                                isCurrentPlan
                                                    ? 'bg-zinc-100 dark:bg-neutral-800 text-zinc-400 dark:text-zinc-500 cursor-default'
                                                    : isPro
                                                        ? 'bg-[#1B2B4B] hover:bg-[#152238] text-white shadow-lg shadow-[#1B2B4B]/20'
                                                        : plan.id === 'business'
                                                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 cursor-not-allowed opacity-70'
                                                            : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700'
                                            }`}
                                        >
                                            {loading === plan.id ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                                                    </svg>
                                                    Redirecting…
                                                </span>
                                            ) : isCurrentPlan ? '✓ Current plan' : plan.cta}
                                        </button>

                                        {/* Feature list */}
                                        <div className="space-y-2.5 flex-1">
                                            {plan.features.map(f => (
                                                <div key={f.label} className={`flex items-start gap-2.5 ${!f.included ? 'opacity-40' : ''}`}>
                                                    <span style={{ color: f.included ? plan.accentColor : undefined }}>
                                                        {f.included ? CHECK : CROSS}
                                                    </span>
                                                    <span className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{f.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer note */}
                    <p className="text-center text-xs text-zinc-400 dark:text-zinc-600 mt-6 pb-2">
                        All plans include 100% private data storage. No CV data is ever shared or sold.
                        Cancel anytime.
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
}
