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
    // Clear the refresh-survival flag now that onboarding is genuinely finished,
    // so a later plain sign-out/sign-in on this device doesn't wrongly re-open it.
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

        const profile = obj as unknown as UserProfile;
        const collections: (keyof UserProfile)[] = ['workExperience', 'education', 'skills', 'projects', 'languages'];
        for (const k of collections) {
            if (!Array.isArray(profile[k])) (profile as Record<string, unknown>)[k] = [];
        }
        return profile;
    } catch { return null; }
}

type Plan = 'premium' | 'free';
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

const FORMAT_BADGES = [
    { label: 'PDF', color: '#EF4444', bg: '#FEF2F2' },
    { label: 'Word .docx', color: '#2563EB', bg: '#EFF6FF' },
    { label: 'Image', color: '#7C3AED', bg: '#F5F3FF' },
    { label: 'JSON', color: '#D97706', bg: '#FFFBEB' },
];

export const OnboardingWizard: React.FC<Props> = ({ onComplete }) => {
    const [step, setStep] = useState<Step>('plan');
    const [plan, setPlan] = useState<Plan>('free');
    const [importedProfile, setImportedProfile] = useState<UserProfile | null>(null);
    const [pendingDocxFile, setPendingDocxFile] = useState<File | null>(null);
    const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
    const [pendingImportType, setPendingImportType] = useState<PendingImportType | null>(null);
    const [importFileName, setImportFileName] = useState<string | null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [geminiKey, setGeminiKey] = useState('');
    const [claudeKey, setClaudeKey] = useState('');
    const [finishing, setFinishing] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isPremium = plan === 'premium';
    const totalSteps = isPremium ? 2 : 3;
    const stepIndex = step === 'plan' ? 0 : step === 'import' ? 1 : 2;

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

    const finish = useCallback(() => {
        setFinishing(true);
        if (isPremium) { setTier('premium'); setSelectedProvider('workers-ai'); }
        else { setTier('free'); setSelectedProvider(claudeKey.trim() ? 'claude' : 'gemini'); }
        const apiSettings: ApiSettings = {
            provider: 'gemini',
            aiProvider: isPremium ? 'workers-ai' : (claudeKey.trim() ? 'claude' : 'gemini'),
            apiKey: geminiKey.trim() || null,
            claudeApiKey: claudeKey.trim() || null,
            msClientId: null,
        };
        markOnboardingDone();
        onComplete({
            plan,
            pendingDocxFile: pendingDocxFile ?? undefined,
            pendingImportFile: pendingImportFile ?? undefined,
            pendingImportType: pendingImportType ?? undefined,
            importedProfile: importedProfile ?? undefined,
            apiSettings,
        });
    }, [isPremium, plan, geminiKey, claudeKey, importedProfile, pendingDocxFile, pendingImportFile, pendingImportType, onComplete]);

    return (
        <div
            className="fixed inset-0 z-[200] flex flex-col items-stretch justify-end sm:items-center sm:justify-center sm:p-4"
            style={{ background: 'rgba(10,16,30,0.82)', backdropFilter: 'blur(6px)' }}
        >
            {/*
             * Sheet container
             * Mobile  : slides up from bottom, max 92dvh, scrolls inside
             * Desktop : centred card, max 512px wide
             *
             * Safe-area-inset-bottom is applied to the last focusable element in
             * each step so content always clears the iPhone home indicator.
             */}
            <div
                className="relative bg-white dark:bg-neutral-900 w-full rounded-t-3xl sm:rounded-2xl sm:max-w-lg lg:max-w-xl shadow-2xl flex flex-col"
                style={{ maxHeight: '92dvh', minHeight: 0 }}
            >
                {/* Mobile drag handle */}
                <div className="flex justify-center pt-2.5 pb-0.5 sm:hidden flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                </div>

                {/* Header */}
                <div className="flex items-center gap-2.5 px-4 sm:px-5 pt-3 sm:pt-5 pb-0.5 flex-shrink-0">
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

                {/* Scrollable body — fills remaining height */}
                <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

                    {/* ── STEP 1: Choose plan ───────────────────────────────── */}
                    {step === 'plan' && (
                        <div className="px-3 sm:px-6 pb-4 sm:pb-6 pt-1 space-y-3 sm:space-y-4"
                             style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
                            <div className="text-center space-y-0.5">
                                <h2 className="text-lg sm:text-2xl font-black text-zinc-900 dark:text-zinc-100"
                                    style={{ fontFamily: "'Playfair Display', serif" }}>
                                    Welcome to ProCV
                                </h2>
                                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                    Your AI career consultant. Takes about two minutes.
                                </p>
                            </div>

                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">How would you like to use AI?</p>

                            {/* Plan cards — 2 columns at all sizes */}
                            <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                {/* Premium */}
                                <button
                                    onClick={() => { setPlan('premium'); setStep('import'); }}
                                    className="relative flex flex-col gap-1.5 sm:gap-2 rounded-xl border-2 p-2.5 sm:p-4 text-left transition-all hover:shadow-lg active:scale-[0.98]"
                                    style={{ borderColor: '#C9A84C', background: 'linear-gradient(135deg, #FDFBF5 0%, #FFF8E7 100%)' }}
                                >
                                    <span className="absolute -top-2.5 left-2 text-[9px] font-black px-2 py-0.5 rounded-full tracking-wide text-white"
                                          style={{ background: '#1B2B4B' }}>AI INCLUDED ✦</span>
                                    <div className="mt-2 flex flex-col gap-1.5 sm:gap-2">
                                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                             style={{ background: '#1B2B4B' }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                                <circle cx="12" cy="12" r="10" stroke="#C9A84C" strokeWidth="2"/>
                                                <path d="M12 6v6l4 2" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round"/>
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-xs sm:text-sm font-black leading-snug" style={{ color: '#1B2B4B' }}>Premium</p>
                                            <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">No API key needed</p>
                                        </div>
                                    </div>
                                    {/* Feature list: visible on sm and up */}
                                    <ul className="text-[10px] text-zinc-600 space-y-0.5 hidden sm:block">
                                        <li>✓ CV generation &amp; ATS</li>
                                        <li>✓ Cover letters &amp; interview</li>
                                        <li>✓ Doctor &amp; humanizer</li>
                                    </ul>
                                    <span className="text-[10px] sm:text-[11px] font-bold mt-auto" style={{ color: '#C9A84C' }}>Select →</span>
                                </button>

                                {/* Free / BYOK */}
                                <button
                                    onClick={() => { setPlan('free'); setStep('import'); }}
                                    className="flex flex-col gap-1.5 sm:gap-2 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-neutral-900 p-2.5 sm:p-4 text-left hover:border-zinc-400 hover:shadow-md transition-all active:scale-[0.98]"
                                >
                                    <div className="mt-2 flex flex-col gap-1.5 sm:gap-2">
                                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-zinc-100 dark:bg-zinc-800">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#6B7280" strokeWidth="2"/>
                                                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#6B7280" strokeWidth="2" strokeLinecap="round"/>
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-xs sm:text-sm font-black text-zinc-700 dark:text-zinc-300 leading-snug">Free</p>
                                            <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">Bring your own key</p>
                                        </div>
                                    </div>
                                    <ul className="text-[10px] text-zinc-500 space-y-0.5 hidden sm:block">
                                        <li>✓ All core features</li>
                                        <li>✓ Free Gemini/Claude key</li>
                                        <li>✓ Upgrade any time</li>
                                    </ul>
                                    <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 mt-auto">Select →</span>
                                </button>
                            </div>

                            <p className="text-[10px] text-zinc-400 text-center">
                                You can switch providers any time in Settings.
                            </p>
                        </div>
                    )}

                    {/* ── STEP 2: Import profile ───────────────────────────── */}
                    {step === 'import' && (
                        <div className="px-3 sm:px-6 pb-4 sm:pb-6 pt-1 space-y-2.5 sm:space-y-4">
                            <div className="text-center space-y-0.5">
                                <h2 className="text-base sm:text-xl font-black text-zinc-900 dark:text-zinc-100"
                                    style={{ fontFamily: "'Playfair Display', serif" }}>
                                    Import your existing CV
                                </h2>
                                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                    Pre-fill your profile instantly — or skip and type manually.
                                </p>
                            </div>

                            {/* Supported formats */}
                            <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center">
                                {FORMAT_BADGES.map(b => (
                                    <span key={b.label}
                                          className="text-[10px] font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full"
                                          style={{ background: b.bg, color: b.color }}>
                                        {b.label}
                                    </span>
                                ))}
                            </div>

                            {/* Drop zone — compact on mobile */}
                            <div
                                onDrop={handleDrop}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onClick={() => fileInputRef.current?.click()}
                                className="cursor-pointer rounded-xl border-2 border-dashed p-3.5 sm:p-7 text-center transition-all duration-200"
                                style={{
                                    borderColor: hasFileSelected ? '#22C55E' : dragOver ? '#1B2B4B' : importError ? '#F87171' : '#D1D5DB',
                                    background: hasFileSelected ? '#F0FDF4' : dragOver ? '#F0F4FF' : importError ? '#FFF5F5' : '#FAFAFA',
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
                                        {pendingImportType === 'pdf' && 'PDF will be extracted by AI after setup.'}
                                        {pendingImportType === 'image' && 'Image will be scanned by AI vision after setup.'}
                                        {pendingDocxFile && 'Word document will be parsed by AI after setup.'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP 3: API Keys (free plan only) ────────────────── */}
                    {step === 'keys' && (
                        <div className="px-3 sm:px-6 pb-4 sm:pb-6 pt-1 space-y-2.5 sm:space-y-3">
                            <div className="text-center space-y-0.5">
                                <h2 className="text-base sm:text-xl font-black text-zinc-900 dark:text-zinc-100"
                                    style={{ fontFamily: "'Playfair Display', serif" }}>
                                    Add your AI key
                                </h2>
                                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">Free from Google — takes 30 seconds.</p>
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
                                        <p className="text-[10px] text-zinc-400 font-medium">Optional</p>
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

                {/*
                 * Persistent footer — action buttons live OUTSIDE the scrollable
                 * body so they stay visible regardless of how tall a step's
                 * content gets (e.g. long feature lists, error banners, or
                 * import-status notices). Only steps with explicit actions
                 * (import, keys) render one; the plan step advances on card tap.
                 */}
                {step === 'import' && (
                    <div className="flex-shrink-0 px-3 sm:px-6 pt-2 border-t border-zinc-100 dark:border-neutral-800 space-y-1.5"
                         style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}>
                        <button
                            onClick={isPremium ? finish : () => setStep('keys')}
                            disabled={importLoading || finishing}
                            className="w-full py-3 rounded-xl text-white text-sm font-black transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                            style={{ background: '#1B2B4B' }}
                        >
                            {finishing ? 'Setting up…' : hasFileSelected ? 'Continue →' : "Skip — I'll fill in manually →"}
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
