import React, { useState, useRef, useCallback, useEffect } from 'react';
import { UserProfile, ApiSettings } from '../types';
import { setTier } from '../services/accountTierService';
import { setSelectedProvider } from '../services/groqService';
import { extractTextFromDocx, parseWordTextToProfile } from '../services/wordImportService';

// ─── localStorage key ────────────────────────────────────────────────────────
export const ONBOARDING_DONE_KEY = 'procv:onboardingDone';

export function hasCompletedOnboarding(): boolean {
    try { return localStorage.getItem(ONBOARDING_DONE_KEY) === '1'; } catch { return false; }
}
export function markOnboardingDone(): void {
    try { localStorage.setItem(ONBOARDING_DONE_KEY, '1'); } catch { }
}

// ─── Helpers to read `validateAndNormaliseProfile` logic ────────────────────
// We parse JSON locally — same logic as the WordImportPanel JSON mode.
function tryParseProfileJson(text: string): UserProfile | null {
    try {
        const raw = JSON.parse(text) as Record<string, unknown>;
        // Unwrap common wrappers: {profile:{...}}, {cv:{...}}, {data:{...}}, etc.
        let obj = raw;
        for (const key of ['profile', 'cv', 'resume', 'data', 'user', 'output', 'result']) {
            const inner = raw[key];
            if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
                const i = inner as Record<string, unknown>;
                if (i.personalInfo || i.workExperience || i.experience || i.name) {
                    obj = i;
                    break;
                }
            }
        }
        // Minimal check — must have some profile-like shape
        if (!obj.personalInfo && !obj.name && !obj.workExperience && !obj.experience) return null;
        return obj as unknown as UserProfile;
    } catch {
        return null;
    }
}

// ─── Types ───────────────────────────────────────────────────────────────────
type Plan = 'premium' | 'free';
type Step = 'plan' | 'import' | 'keys';

interface Props {
    onComplete: (opts: {
        plan: Plan;
        pendingDocxFile?: File;
        importedProfile?: UserProfile;
        apiSettings: ApiSettings;
    }) => void;
}

// ─── Step indicator ──────────────────────────────────────────────────────────
function StepDots({ total, current }: { total: number; current: number }) {
    return (
        <div className="flex items-center justify-center gap-2 py-3">
            {Array.from({ length: total }).map((_, i) => (
                <span key={i} className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i < current ? 'bg-violet-500' : i === current ? 'bg-violet-400 ring-2 ring-violet-300' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
            ))}
        </div>
    );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────
export const OnboardingWizard: React.FC<Props> = ({ onComplete }) => {
    const [step, setStep] = useState<Step>('plan');
    const [plan, setPlan] = useState<Plan>('free');

    // Import state
    const [importedProfile, setImportedProfile] = useState<UserProfile | null>(null);
    const [pendingDocxFile, setPendingDocxFile] = useState<File | null>(null);
    const [importFileName, setImportFileName] = useState<string | null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Keys state (free plan only)
    const [geminiKey, setGeminiKey] = useState('');
    const [claudeKey, setClaudeKey] = useState('');
    const [finishing, setFinishing] = useState(false);

    const isPremium = plan === 'premium';
    // Premium: 2 steps (plan → import). Free: 3 steps (plan → import → keys).
    const totalSteps = isPremium ? 2 : 3;
    const stepIndex = step === 'plan' ? 0 : step === 'import' ? 1 : 2;

    // ── File handling ─────────────────────────────────────────────────────
    const handleFile = useCallback(async (file: File) => {
        setImportError(null);
        setImportLoading(true);
        setImportFileName(file.name);
        setImportedProfile(null);
        setPendingDocxFile(null);

        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

        try {
            if (ext === 'json') {
                const text = await file.text();
                const profile = tryParseProfileJson(text);
                if (!profile) throw new Error('This JSON file doesn\'t look like a ProCV profile export.');
                setImportedProfile(profile);
            } else if (ext === 'docx') {
                // Docx needs AI parsing — we'll process it after the wizard finishes
                // (when we have an API key). Store the file for the parent to handle.
                // For Premium users the worker will do it; for free we need a key first.
                setPendingDocxFile(file);
            } else if (ext === 'doc') {
                throw new Error('.doc files are not supported — please save as .docx first.');
            } else if (ext === 'pdf') {
                throw new Error('PDF import is available from the Profile page after setup. Use Word (.docx) or JSON here.');
            } else {
                throw new Error('Unsupported file. Please use .docx or .json.');
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
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = '';
    }, [handleFile]);

    // ── Finish ────────────────────────────────────────────────────────────
    const finish = useCallback(() => {
        setFinishing(true);
        if (isPremium) {
            setTier('premium');
            setSelectedProvider('workers-ai');
        } else {
            setTier('free');
            setSelectedProvider(claudeKey.trim() ? 'claude' : 'gemini');
        }
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
            importedProfile: importedProfile ?? undefined,
            apiSettings,
        });
    }, [isPremium, plan, geminiKey, claudeKey, importedProfile, pendingDocxFile, onComplete]);

    const goToImport = useCallback((p: Plan) => {
        setPlan(p);
        setStep('import');
    }, []);

    const goToKeys = useCallback(() => setStep('keys'), []);

    const hasFileSelected = !!(importedProfile || pendingDocxFile);

    // ─── Render ───────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <StepDots total={totalSteps} current={stepIndex} />

                <div className="flex-1 overflow-y-auto">

                    {/* ── STEP 1: Choose plan ───────────────────────────── */}
                    {step === 'plan' && (
                        <div className="px-6 pb-7 pt-1 space-y-5">
                            <div className="text-center space-y-1">
                                <div className="text-4xl">👋</div>
                                <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100">Welcome to ProCV</h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Your AI career consultant. Let's get you set up in two minutes.</p>
                            </div>

                            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider text-center">Choose how you'd like to use AI</p>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {/* Premium */}
                                <button
                                    onClick={() => goToImport('premium')}
                                    className="relative flex flex-col gap-2 rounded-xl border-2 border-violet-400 bg-gradient-to-b from-violet-50 to-white dark:from-violet-900/20 dark:to-neutral-900 p-4 text-left hover:border-violet-500 hover:shadow-lg transition-all"
                                >
                                    <span className="absolute -top-2.5 left-4 bg-violet-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full tracking-wide">PREMIUM ✨</span>
                                    <div className="mt-2">
                                        <p className="text-sm font-bold text-violet-700 dark:text-violet-300">AI Included</p>
                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">No API keys needed. Powered by Cloudflare Workers AI — just start building.</p>
                                    </div>
                                    <ul className="text-[11px] text-violet-600 dark:text-violet-400 space-y-0.5 mt-1">
                                        <li>✓ CV generation &amp; ATS scoring</li>
                                        <li>✓ Cover letters &amp; interview prep</li>
                                        <li>✓ CV Doctor &amp; humanizer</li>
                                    </ul>
                                    <span className="mt-1 text-[10px] font-bold text-violet-500">Select →</span>
                                </button>

                                {/* Free / BYOK */}
                                <button
                                    onClick={() => goToImport('free')}
                                    className="flex flex-col gap-2 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-neutral-900 p-4 text-left hover:border-zinc-400 hover:shadow-md transition-all"
                                >
                                    <div className="mt-2">
                                        <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">🔑 Free — Bring Your Key</p>
                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">Use your own free Google Gemini or Anthropic Claude key.</p>
                                    </div>
                                    <ul className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5 mt-1">
                                        <li>✓ All core features</li>
                                        <li>✓ Free keys from Google / Anthropic</li>
                                        <li>✓ Upgrade to Premium any time</li>
                                    </ul>
                                    <span className="mt-1 text-[10px] font-bold text-zinc-400">Select →</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── STEP 2: Import profile ────────────────────────── */}
                    {step === 'import' && (
                        <div className="px-6 pb-7 pt-1 space-y-4">
                            <div className="text-center space-y-1">
                                <div className="text-4xl">📄</div>
                                <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100">Import your existing CV</h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Pre-fill your profile in seconds. Supports Word and JSON exports.</p>
                            </div>

                            {/* Drop zone */}
                            <div
                                onDrop={handleDrop}
                                onDragOver={(e) => e.preventDefault()}
                                onClick={() => fileInputRef.current?.click()}
                                className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors duration-200 ${
                                    hasFileSelected
                                        ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                                        : importError
                                            ? 'border-red-300 bg-red-50 dark:bg-red-900/10'
                                            : 'border-zinc-200 dark:border-zinc-700 hover:border-violet-400 bg-zinc-50 dark:bg-neutral-800/60'
                                }`}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".docx,.json"
                                    className="hidden"
                                    onChange={handleFileInput}
                                />
                                {importLoading ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="inline-block w-7 h-7 rounded-full border-[3px] border-violet-400 border-t-transparent animate-spin" />
                                        <p className="text-sm text-zinc-500">Reading {importFileName}…</p>
                                    </div>
                                ) : hasFileSelected ? (
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-3xl">✅</span>
                                        <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                                            {importedProfile
                                                ? `${importedProfile.personalInfo?.name || 'Profile'} — ready to import`
                                                : `${importFileName} — will import after setup`}
                                        </p>
                                        <p className="text-[11px] text-zinc-400">Click to change file</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-3xl">⬆️</span>
                                        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                                            Drop your CV or <span className="text-violet-500 underline">browse</span>
                                        </p>
                                        <div className="flex gap-2 mt-1">
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">Word .docx</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium">JSON export</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {importError && (
                                <p className="text-xs text-red-600 dark:text-red-400 text-center -mt-1">{importError}</p>
                            )}

                            {pendingDocxFile && (
                                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                                    <strong>Note:</strong> Word import uses AI parsing — it will run automatically after setup completes.
                                </div>
                            )}

                            <div className="space-y-2 pt-1">
                                <button
                                    onClick={isPremium ? finish : goToKeys}
                                    disabled={importLoading || finishing}
                                    className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
                                >
                                    {finishing ? 'Setting up…' : hasFileSelected ? 'Continue →' : "Skip — I'll fill it in manually →"}
                                </button>
                                <button onClick={() => setStep('plan')} className="w-full text-xs text-zinc-400 hover:text-zinc-600 py-1">← Back</button>
                            </div>
                        </div>
                    )}

                    {/* ── STEP 3: API Keys (free plan only) ────────────── */}
                    {step === 'keys' && (
                        <div className="px-6 pb-7 pt-1 space-y-4">
                            <div className="text-center space-y-1">
                                <div className="text-4xl">🔑</div>
                                <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100">Add your API key</h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">Get a free key from Google (Gemini) — takes about 30 seconds.</p>
                            </div>

                            {/* Gemini */}
                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Google Gemini</p>
                                        <p className="text-[10px] text-green-600 dark:text-green-400 font-semibold">Recommended · Free</p>
                                    </div>
                                    <a
                                        href="https://aistudio.google.com/app/apikey"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[11px] text-violet-500 hover:text-violet-700 hover:underline font-medium"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        Get free key →
                                    </a>
                                </div>
                                <input
                                    type="password"
                                    placeholder="AIza…"
                                    value={geminiKey}
                                    onChange={(e) => setGeminiKey(e.target.value)}
                                    className="w-full text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-neutral-800 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                />
                            </div>

                            {/* Claude (optional) */}
                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Anthropic Claude</p>
                                        <p className="text-[10px] text-zinc-400 font-medium">Optional</p>
                                    </div>
                                    <a
                                        href="https://console.anthropic.com/keys"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[11px] text-violet-500 hover:text-violet-700 hover:underline font-medium"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        Get key →
                                    </a>
                                </div>
                                <input
                                    type="password"
                                    placeholder="sk-ant-…"
                                    value={claudeKey}
                                    onChange={(e) => setClaudeKey(e.target.value)}
                                    className="w-full text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-neutral-800 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                />
                            </div>

                            <p className="text-[10px] text-zinc-400 text-center px-4">
                                Your keys are encrypted in your browser and never sent to our servers.
                            </p>

                            <div className="space-y-2 pt-1">
                                <button
                                    onClick={finish}
                                    disabled={finishing}
                                    className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
                                >
                                    {finishing ? 'Setting up…' : geminiKey || claudeKey ? "Let's go →" : 'Skip for now →'}
                                </button>
                                <button onClick={() => setStep('import')} className="w-full text-xs text-zinc-400 hover:text-zinc-600 py-1">← Back</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
