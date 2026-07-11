import React, { useState, useRef, useCallback } from 'react';
import { UserProfile, ApiSettings } from '../types';
import { setTier } from '../services/accountTierService';
import { setSelectedProvider } from '../services/groqService';
import { extractTextFromDocx } from '../services/wordImportService';

export const ONBOARDING_DONE_KEY = 'procv:onboardingDone';
export function hasCompletedOnboarding(): boolean {
    try { return localStorage.getItem(ONBOARDING_DONE_KEY) === '1'; } catch { return false; }
}
export function markOnboardingDone(): void {
    try { localStorage.setItem(ONBOARDING_DONE_KEY, '1'); } catch { }
    try { sessionStorage.removeItem('procv:pending_new_user'); } catch { }
}

function tryParseProfileJson(text: string): UserProfile | null {
    try {
        const raw = JSON.parse(text) as Record<string, unknown>;
        let obj = raw;
        for (const key of ['profile', 'cv', 'resume', 'data', 'user', 'output', 'result']) {
            const inner = raw[key];
            if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
                const i = inner as Record<string, unknown>;
                if (i.personalInfo || i.workExperience || i.experience || i.name) { obj = i; break; }
            }
        }
        if (!obj.personalInfo && !obj.name && !obj.workExperience && !obj.experience) return null;
        const profile = obj as UserProfile;
        const collections: (keyof UserProfile)[] = ['workExperience', 'education', 'skills', 'projects', 'languages'];
        for (const k of collections) {
            if (!Array.isArray(profile[k])) (profile as Record<string, unknown>)[k] = [];
        }
        return profile;
    } catch { return null; }
}

// Free | BYOK | Premium — each flows through a different step path
type Plan = 'free' | 'byok' | 'premium';
type Step = 'plan' | 'import' | 'keys';

export type PendingImportType = 'docx' | 'pdf' | 'image';

interface Props {
    onComplete: (opts: {
        plan: Plan;
        pendingDocxFile?: File;
        pendingImportFile?: File;
        pendingImportType?: PendingImportType;
        importedProfile?: UserProfile;
        apiSettings: ApiSettings;
    }) => void;
}

// ─── Step dots ────────────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
    return (
        <div className="flex items-center justify-center gap-2 py-2">
            {Array.from({ length: total }).map((_, i) => (
                <span key={i} className="transition-all duration-300" style={{
                    display: 'inline-block',
                    width: i === current ? 20 : 8,
                    height: 7,
                    borderRadius: 4,
                    background: i < current ? '#C9A84C' : i === current ? '#1B2B4B' : '#D1D5DB',
                }} />
            ))}
        </div>
    );
}

// ─── Plan card data ───────────────────────────────────────────────────────────

const PLANS: Array<{
    id: Plan;
    icon: string;
    name: string;
    badge?: string;
    tagline: string;
    price: string;
    priceNote: string;
    bullets: string[];
    dimmed?: string[];
    borderColor: string;
    headerBg: string;
    headerText: string;
    accentColor: string;
    ctaText: string;
}> = [
    {
        id: 'free',
        icon: '🆓',
        name: 'Free',
        tagline: 'Try it out — no card, no key.',
        price: '$0',
        priceNote: 'forever',
        bullets: [
            '3 CV generations',
            '1 profile slot',
            'All 35+ templates',
            'Workers AI — no key needed',
            'CV checker & sharing links',
        ],
        dimmed: [
            'Boosted / Aggressive modes',
            'LinkedIn, Salary Coach',
            'Clean PDF (no watermark)',
        ],
        borderColor: '#E5E7EB',
        headerBg: '#F9FAFB',
        headerText: '#374151',
        accentColor: '#6B7280',
        ctaText: 'Start free →',
    },
    {
        id: 'byok',
        icon: '🔑',
        name: 'BYOK',
        tagline: 'Bring your Gemini or Claude key.',
        price: '$0',
        priceNote: '+ your API key',
        bullets: [
            'Unlimited generations',
            '3 profile slots',
            'All 3 generation modes',
            'ATS gap pinning',
            'Interview Prep · Email Apply',
            'Scholarship Essay Writer',
            'Unlimited job tracking',
        ],
        dimmed: [
            'LinkedIn, Salary Coach, Career Pivot',
            'Clean PDF (no watermark)',
        ],
        borderColor: '#BFDBFE',
        headerBg: '#EFF6FF',
        headerText: '#1D4ED8',
        accentColor: '#2563EB',
        ctaText: 'Add my key →',
    },
    {
        id: 'premium',
        icon: '⭐',
        name: 'Premium',
        badge: 'BEST RESULTS',
        tagline: 'No key needed. Full suite. Clean PDFs.',
        price: '$19',
        priceNote: '/mo  ·  $149/yr',
        bullets: [
            'Unlimited generations',
            '5 profile slots',
            'Llama 70B + DeepSeek R1 AI',
            'All modes incl. Aggressive',
            'Full career suite (12 tools)',
            'LinkedIn, Salary, Career Pivot',
            'Clean PDF — no watermark',
            'Bulk export · Custom domain',
        ],
        borderColor: '#1B2B4B',
        headerBg: '#1B2B4B',
        headerText: '#FFFFFF',
        accentColor: '#C9A84C',
        ctaText: 'Go Premium →',
    },
];

const FORMAT_BADGES = [
    { label: 'PDF', color: '#EF4444', bg: '#FEF2F2' },
    { label: 'Word .docx', color: '#2563EB', bg: '#EFF6FF' },
    { label: 'Image', color: '#7C3AED', bg: '#F5F3FF' },
    { label: 'JSON', color: '#D97706', bg: '#FFFBEB' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export const OnboardingWizard: React.FC<Props> = ({ onComplete }) => {
    const [step, setStep]                   = useState<Step>('plan');
    const [plan, setPlan]                   = useState<Plan>('free');
    const [importedProfile, setImportedProfile]     = useState<UserProfile | null>(null);
    const [pendingDocxFile, setPendingDocxFile]     = useState<File | null>(null);
    const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
    const [pendingImportType, setPendingImportType] = useState<PendingImportType | null>(null);
    const [importFileName, setImportFileName]       = useState<string | null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError]     = useState<string | null>(null);
    const [geminiKey, setGeminiKey]         = useState('');
    const [claudeKey, setClaudeKey]         = useState('');
    const [finishing, setFinishing]         = useState(false);
    const [dragOver, setDragOver]           = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // BYOK is the only plan that has a keys step
    const totalSteps = plan === 'byok' ? 3 : 2;
    const stepIndex  = step === 'plan' ? 0 : step === 'import' ? 1 : 2;

    // ── File handling ──────────────────────────────────────────────────────────

    const handleFile = useCallback(async (file: File) => {
        setImportError(null);
        setImportLoading(true);
        setImportFileName(file.name);
        setImportedProfile(null);
        setPendingDocxFile(null);
        setPendingImportFile(null);
        setPendingImportType(null);

        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

        try {
            if (ext === 'json') {
                const text = await file.text();
                const profile = tryParseProfileJson(text);
                if (!profile) throw new Error("This JSON file doesn't look like a ProCV profile export.");
                setImportedProfile(profile);
            } else if (ext === 'docx') {
                setPendingDocxFile(file);
            } else if (ext === 'doc') {
                throw new Error('.doc files are not supported — please save as .docx first.');
            } else if (ext === 'pdf') {
                setPendingImportFile(file);
                setPendingImportType('pdf');
            } else if (imageExts.includes(ext)) {
                setPendingImportFile(file);
                setPendingImportType('image');
            } else {
                throw new Error('Unsupported file. Please use PDF, Word (.docx), an image, or JSON.');
            }
        } catch (e: any) {
            setImportError(e?.message ?? 'Could not read this file.');
            setImportFileName(null);
        } finally {
            setImportLoading(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const hasFileSelected = !!(importedProfile || pendingDocxFile || pendingImportFile);

    // ── Finish: wire the chosen plan's provider & tier ─────────────────────────

    const finish = useCallback(() => {
        setFinishing(true);

        if (plan === 'premium') {
            setTier('premium');
            setSelectedProvider('workers-ai');
        } else if (plan === 'byok') {
            // Stored plan stays 'free'; BYOK is detected at runtime via hasByokKeys().
            setTier('free');
            setSelectedProvider(claudeKey.trim() ? 'claude' : 'gemini');
        } else {
            // Pure free — Workers AI handles it server-side, no key needed.
            setTier('free');
            setSelectedProvider('workers-ai');
        }

        const apiSettings: ApiSettings = {
            provider: 'gemini',
            aiProvider: plan === 'premium'
                ? 'workers-ai'
                : plan === 'byok'
                    ? (claudeKey.trim() ? 'claude' : 'gemini')
                    : 'workers-ai',
            apiKey:        plan === 'byok' ? (geminiKey.trim() || null) : null,
            claudeApiKey:  plan === 'byok' ? (claudeKey.trim() || null) : null,
            msClientId:    null,
        };

        markOnboardingDone();
        onComplete({
            plan,
            pendingDocxFile:    pendingDocxFile    ?? undefined,
            pendingImportFile:  pendingImportFile  ?? undefined,
            pendingImportType:  pendingImportType  ?? undefined,
            importedProfile:    importedProfile    ?? undefined,
            apiSettings,
        });
    }, [plan, geminiKey, claudeKey, importedProfile, pendingDocxFile, pendingImportFile, pendingImportType, onComplete]);

    // ── Plan selection ─────────────────────────────────────────────────────────

    const selectPlan = useCallback((p: Plan) => {
        setPlan(p);
        setStep('import');
    }, []);

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div
            className="fixed inset-0 z-[200] flex flex-col items-stretch justify-end sm:items-center sm:justify-center sm:p-4"
            style={{ background: 'rgba(10,16,30,0.85)', backdropFilter: 'blur(8px)' }}
        >
            <div
                className="relative bg-white dark:bg-neutral-900 w-full rounded-t-3xl sm:rounded-2xl sm:max-w-2xl shadow-2xl flex flex-col"
                style={{ maxHeight: '92dvh', minHeight: 0 }}
            >
                {/* Mobile drag handle */}
                <div className="flex justify-center pt-2.5 pb-0.5 sm:hidden flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                </div>

                {/* Header */}
                <div className="flex items-center gap-2.5 px-4 sm:px-6 pt-3 sm:pt-5 pb-0.5 flex-shrink-0">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ background: '#1B2B4B' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#C9A84C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <span className="text-sm font-black tracking-tight" style={{ color: '#1B2B4B', fontFamily: "'DM Sans', sans-serif" }}>ProCV</span>
                    <span className="text-xs text-zinc-400 ml-auto">Setup</span>
                </div>

                <StepDots total={totalSteps} current={stepIndex} />

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

                    {/* ── STEP 1: Choose plan ──────────────────────────────── */}
                    {step === 'plan' && (
                        <div className="px-3 sm:px-6 pb-4 sm:pb-6 pt-1">
                            <div className="text-center space-y-0.5 mb-4">
                                <h2 className="text-lg sm:text-2xl font-black text-zinc-900 dark:text-zinc-100"
                                    style={{ fontFamily: "'Playfair Display', serif" }}>
                                    Welcome to ProCV
                                </h2>
                                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                                    How do you want to power your AI?
                                </p>
                            </div>

                            {/* 3-column on sm+, stacked on mobile */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                                {PLANS.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => selectPlan(p.id)}
                                        className="relative flex flex-col text-left rounded-2xl border-2 overflow-hidden transition-all hover:shadow-lg active:scale-[0.98]"
                                        style={{ borderColor: p.borderColor }}
                                    >
                                        {/* Card header */}
                                        <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2.5"
                                             style={{ background: p.headerBg }}>
                                            <span className="text-xl sm:text-2xl flex-shrink-0">{p.icon}</span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-black leading-none" style={{ color: p.headerText }}>{p.name}</p>
                                                    {p.badge && (
                                                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full tracking-wide"
                                                              style={{ background: '#C9A84C', color: '#1B2B4B' }}>
                                                            {p.badge}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] leading-tight mt-0.5 opacity-70" style={{ color: p.headerText }}>
                                                    {p.tagline}
                                                </p>
                                            </div>
                                            <div className="flex-shrink-0 text-right">
                                                <p className="text-base sm:text-lg font-black leading-none" style={{ color: p.id === 'premium' ? '#C9A84C' : p.accentColor }}>
                                                    {p.price}
                                                </p>
                                                <p className="text-[9px] opacity-60 leading-tight" style={{ color: p.headerText }}>{p.priceNote}</p>
                                            </div>
                                        </div>

                                        {/* Feature list */}
                                        <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-white dark:bg-neutral-900 flex-1 space-y-1">
                                            {p.bullets.map(b => (
                                                <div key={b} className="flex items-start gap-1.5">
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5"
                                                         style={{ stroke: p.accentColor }} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="20 6 9 17 4 12"/>
                                                    </svg>
                                                    <span className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-tight">{b}</span>
                                                </div>
                                            ))}
                                            {p.dimmed?.map(b => (
                                                <div key={b} className="flex items-start gap-1.5 opacity-30">
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5"
                                                         stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                                    </svg>
                                                    <span className="text-[11px] text-zinc-400 leading-tight">{b}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* CTA */}
                                        <div className="px-3 sm:px-4 py-2 border-t border-zinc-100 dark:border-neutral-800 flex items-center justify-between bg-white dark:bg-neutral-900">
                                            <span className="text-[11px] font-black" style={{ color: p.accentColor }}>{p.ctaText}</span>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                                 stroke={p.accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M5 12h14M12 5l7 7-7 7"/>
                                            </svg>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Reassurance */}
                            <p className="text-[10px] text-zinc-400 text-center mt-3">
                                You can change this any time in Settings. Your CVs and data are always yours.
                            </p>
                        </div>
                    )}

                    {/* ── STEP 2: Import existing CV ───────────────────────── */}
                    {step === 'import' && (
                        <div className="px-3 sm:px-6 pb-4 sm:pb-6 pt-1 space-y-2.5 sm:space-y-4">
                            {/* Plan badge */}
                            <div className="flex justify-center">
                                {PLANS.filter(p => p.id === plan).map(p => (
                                    <span key={p.id} className="text-[10px] font-black px-2.5 py-1 rounded-full"
                                          style={{ background: plan === 'premium' ? '#1B2B4B' : plan === 'byok' ? '#EFF6FF' : '#F3F4F6',
                                                   color: plan === 'premium' ? '#C9A84C' : plan === 'byok' ? '#2563EB' : '#6B7280' }}>
                                        {p.icon} {p.name} plan selected
                                    </span>
                                ))}
                            </div>

                            <div className="text-center space-y-0.5">
                                <h2 className="text-base sm:text-xl font-black text-zinc-900 dark:text-zinc-100"
                                    style={{ fontFamily: "'Playfair Display', serif" }}>
                                    Import your existing CV
                                </h2>
                                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                    Pre-fill your profile instantly — or skip and type manually.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center">
                                {FORMAT_BADGES.map(b => (
                                    <span key={b.label}
                                          className="text-[10px] font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full"
                                          style={{ background: b.bg, color: b.color }}>
                                        {b.label}
                                    </span>
                                ))}
                            </div>

                            {/* Drop zone */}
                            <div
                                onDrop={handleDrop}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onClick={() => fileInputRef.current?.click()}
                                className="cursor-pointer rounded-xl border-2 border-dashed p-3.5 sm:p-7 text-center transition-all duration-200"
                                style={{
                                    borderColor: hasFileSelected ? '#22C55E' : dragOver ? '#1B2B4B' : importError ? '#F87171' : '#D1D5DB',
                                    background:  hasFileSelected ? '#F0FDF4' : dragOver ? '#F0F4FF' : importError ? '#FFF5F5' : '#FAFAFA',
                                }}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".docx,.json,.pdf,.jpg,.jpeg,.png,.webp"
                                    className="hidden"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                                />
                                {importLoading ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="inline-block w-6 h-6 sm:w-7 sm:h-7 rounded-full border-[3px] animate-spin"
                                              style={{ borderColor: '#1B2B4B', borderTopColor: 'transparent' }} />
                                        <p className="text-xs sm:text-sm text-zinc-500">Reading {importFileName}…</p>
                                    </div>
                                ) : hasFileSelected ? (
                                    <div className="flex flex-col items-center gap-1.5">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-100 flex items-center justify-center">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12"/>
                                            </svg>
                                        </div>
                                        <p className="text-xs sm:text-sm font-bold text-green-700 dark:text-green-400">
                                            {importedProfile
                                                ? `${importedProfile.personalInfo?.name || 'Profile'} — ready`
                                                : `${importFileName} — will process after setup`}
                                        </p>
                                        <p className="text-[11px] text-zinc-400">Tap to change file</p>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 sm:flex-col sm:gap-2 sm:items-center">
                                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                                <polyline points="17 8 12 3 7 8"/>
                                                <line x1="12" y1="3" x2="12" y2="15"/>
                                            </svg>
                                        </div>
                                        <div className="text-left sm:text-center">
                                            <p className="text-xs sm:text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                                                Drop your CV or{' '}
                                                <span className="underline sm:inline hidden" style={{ color: '#1B2B4B' }}>browse files</span>
                                                <span className="sm:hidden" style={{ color: '#1B2B4B' }}>tap to browse</span>
                                            </p>
                                            <p className="text-[11px] text-zinc-400 mt-0.5">PDF · Word · Image · JSON export</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {importError && (
                                <p className="text-xs text-red-600 dark:text-red-400 text-center">{importError}</p>
                            )}

                            {(pendingDocxFile || pendingImportFile) && (
                                <div className="rounded-lg px-2.5 sm:px-3 py-2 text-[11px] flex items-start gap-2"
                                     style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                    <span>
                                        {pendingImportType === 'pdf'   && 'PDF will be extracted by AI after setup.'}
                                        {pendingImportType === 'image' && 'Image will be scanned by AI vision after setup.'}
                                        {pendingDocxFile               && 'Word document will be parsed by AI after setup.'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP 3: API Keys (BYOK only) ─────────────────────── */}
                    {step === 'keys' && (
                        <div className="px-3 sm:px-6 pb-4 sm:pb-6 pt-1 space-y-2.5 sm:space-y-3">
                            <div className="text-center space-y-0.5">
                                <h2 className="text-base sm:text-xl font-black text-zinc-900 dark:text-zinc-100"
                                    style={{ fontFamily: "'Playfair Display', serif" }}>
                                    Add your AI key
                                </h2>
                                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                                    Gemini is free from Google — takes 30 seconds to get.
                                </p>
                            </div>

                            {/* Gemini — recommended */}
                            <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 p-2.5 sm:p-4 space-y-2 sm:space-y-2.5 bg-blue-50/30 dark:bg-blue-900/5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-zinc-800 dark:text-zinc-200">🔍 Google Gemini</p>
                                        <p className="text-[10px] font-bold" style={{ color: '#16A34A' }}>Recommended · 100% Free</p>
                                    </div>
                                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
                                       className="text-[11px] font-bold hover:underline shrink-0" style={{ color: '#1B2B4B' }}
                                       onClick={(e) => e.stopPropagation()}>
                                        Get free key →
                                    </a>
                                </div>
                                <input
                                    type="password"
                                    placeholder="AIza…"
                                    value={geminiKey}
                                    onChange={(e) => setGeminiKey(e.target.value)}
                                    className="w-full text-sm px-3 py-2 sm:py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-neutral-800 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2"
                                    style={{ '--tw-ring-color': '#1B2B4B' } as React.CSSProperties}
                                />
                            </div>

                            {/* Claude — optional */}
                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-2.5 sm:p-4 space-y-2 sm:space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-zinc-800 dark:text-zinc-200">🧠 Anthropic Claude</p>
                                        <p className="text-[10px] text-zinc-400 font-medium">Optional — paid API</p>
                                    </div>
                                    <a href="https://console.anthropic.com/keys" target="_blank" rel="noreferrer"
                                       className="text-[11px] font-bold hover:underline shrink-0" style={{ color: '#1B2B4B' }}
                                       onClick={(e) => e.stopPropagation()}>
                                        Get key →
                                    </a>
                                </div>
                                <input
                                    type="password"
                                    placeholder="sk-ant-…"
                                    value={claudeKey}
                                    onChange={(e) => setClaudeKey(e.target.value)}
                                    className="w-full text-sm px-3 py-2 sm:py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-neutral-800 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2"
                                    style={{ '--tw-ring-color': '#1B2B4B' } as React.CSSProperties}
                                />
                            </div>

                            <p className="text-[10px] text-zinc-400 text-center px-2 leading-relaxed">
                                🔐 Keys are stored only in your browser and never sent to our servers.
                            </p>
                        </div>
                    )}
                </div>

                {/* ── Footer: fixed action buttons ──────────────────────────── */}
                {step === 'import' && (
                    <div className="flex-shrink-0 px-3 sm:px-6 pt-2 border-t border-zinc-100 dark:border-neutral-800 space-y-1.5"
                         style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}>
                        <button
                            onClick={plan === 'byok' ? () => setStep('keys') : finish}
                            disabled={importLoading || finishing}
                            className="w-full py-3 rounded-xl text-white text-sm font-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                            style={{ background: '#1B2B4B' }}
                        >
                            {finishing ? 'Setting up…' : plan === 'byok' ? 'Next — add key →' : hasFileSelected ? 'Continue →' : "Skip — I'll fill in manually →"}
                        </button>
                        <button onClick={() => setStep('plan')}
                                className="w-full text-sm text-zinc-400 hover:text-zinc-600 py-2 transition-colors font-medium">
                            ← Back
                        </button>
                    </div>
                )}

                {step === 'keys' && (
                    <div className="flex-shrink-0 px-3 sm:px-6 pt-2 border-t border-zinc-100 dark:border-neutral-800 space-y-1.5"
                         style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
                        <button
                            onClick={finish}
                            disabled={finishing}
                            className="w-full py-3 rounded-xl text-white text-sm font-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                            style={{ background: '#1B2B4B' }}
                        >
                            {finishing ? 'Setting up…' : geminiKey || claudeKey ? "Let's go →" : 'Skip for now →'}
                        </button>
                        <button onClick={() => setStep('import')}
                                className="w-full text-sm text-zinc-400 hover:text-zinc-600 py-2 transition-colors font-medium">
                            ← Back
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
