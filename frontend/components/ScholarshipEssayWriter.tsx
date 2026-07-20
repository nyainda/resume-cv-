import React, { useState, useCallback, useMemo, useRef } from 'react';
import { UserProfile } from '../types';
import {
    generateScholarshipEssay,
    detectScholarshipName,
    SCHOLARSHIP_FORBIDDEN_PHRASES,
} from '../services/geminiService';
import { downloadCoverLetterAsPDF } from '../services/pdfService';

// ─── Essay types ──────────────────────────────────────────────────────────────

interface EssayType {
    id: string;
    label: string;
    icon: string;
    subtitle: string;
    tips: string[];
    wordCountRange: string;
    defaultWords: number;
    promptHint: string;
}

const ESSAY_TYPES: EssayType[] = [
    {
        id: 'personal-statement',
        label: 'Personal Statement',
        icon: '📝',
        subtitle: 'Tell your story and highlight your unique journey',
        tips: [
            'Focus on your unique experiences and goals',
            'Show how your background shaped your journey',
            'Connect your story to your future impact',
        ],
        wordCountRange: '500–800 words',
        defaultWords: 650,
        promptHint: 'Write about your background, motivations, academic journey, and why you are a strong candidate for this scholarship.',
    },
    {
        id: 'research-proposal',
        label: 'Research Proposal',
        icon: '🔬',
        subtitle: 'Outline your research idea and methodology',
        tips: [
            'State your research gap clearly in the opening',
            'Justify your methodology choice specifically',
            'Quantify expected outputs and name who benefits',
        ],
        wordCountRange: '800–1500 words',
        defaultWords: 1000,
        promptHint: 'Write a compelling research proposal describing the research question, literature gap, methodology, expected results, timeline, and broader impact.',
    },
    {
        id: 'statement-of-purpose',
        label: 'Statement of Purpose',
        icon: '🎯',
        subtitle: 'Explain your goals and future plans',
        tips: [
            'Name specific faculty, labs, or courses — not just the brand',
            'Draw a clear line: past → this program → future goal',
            'Show how experiences shaped your thinking',
        ],
        wordCountRange: '600–1000 words',
        defaultWords: 750,
        promptHint: 'Write a statement of purpose explaining your academic background, specific reasons for choosing this program, research interests, and career goals.',
    },
    {
        id: 'leadership-essay',
        label: 'Leadership Essay',
        icon: '🏅',
        subtitle: 'Showcase your leadership experiences',
        tips: [
            'Pick ONE story with a clear before/after — not a list',
            'Use "I" not "we" — show your specific initiative',
            'Quantify the outcome wherever possible',
        ],
        wordCountRange: '500–700 words',
        defaultWords: 600,
        promptHint: 'Write a leadership essay describing a specific situation where you demonstrated leadership, the concrete actions you took, and the measurable outcomes.',
    },
    {
        id: 'diversity-inclusion',
        label: 'Diversity & Inclusion',
        icon: '🌍',
        subtitle: 'Discuss your perspective and impact',
        tips: [
            'Be specific about your background — vague claims are weak',
            'Connect lived experience to your perspective in the field',
            'Show what you have already done, not just plans',
        ],
        wordCountRange: '400–600 words',
        defaultWords: 500,
        promptHint: 'Write a diversity statement describing your background, the unique perspective it gives you, and how you advance equity or inclusion in your field.',
    },
    {
        id: 'why-scholarship',
        label: '"Why This Scholarship" Essay',
        icon: '🏛️',
        subtitle: 'Explain why you\'re the right fit',
        tips: [
            'Research alumni and values before writing',
            'Name specific values/programs — not prestige alone',
            'Show what you will GIVE to the network',
        ],
        wordCountRange: '400–600 words',
        defaultWords: 500,
        promptHint: 'Write an essay explaining why you are applying for this specific scholarship, demonstrating deep knowledge of its values, mission, and what you will contribute.',
    },
    {
        id: 'academic-cover-letter',
        label: 'Academic Cover Letter',
        icon: '📄',
        subtitle: 'Write a professional introduction',
        tips: [
            'Address selection criteria point by point',
            'Reference the institution by full name',
            'Keep it concise — under 500 words',
        ],
        wordCountRange: '300–500 words',
        defaultWords: 400,
        promptHint: 'Write a professional academic cover letter introducing yourself, your top qualifications, and your specific interest in this opportunity.',
    },
];

const KNOWN_SCHOLARSHIPS = [
    'Chevening', 'Commonwealth', 'Fulbright',
    'Gates Cambridge', 'Rhodes', 'DAAD', 'Erasmus+',
];

const WORD_COUNT_OPTIONS = [
    { value: '300', label: '300 words' },
    { value: '400', label: '400 words' },
    { value: '500', label: '500 words' },
    { value: '600', label: '600 words' },
    { value: '650', label: '650 words' },
    { value: '750', label: '750 words' },
    { value: '800', label: '800 words' },
    { value: '1000', label: '1000 words' },
    { value: '1500', label: '1500 words' },
];

const TIP_COLORS = [
    'bg-blue-500',
    'bg-purple-500',
    'bg-emerald-500',
];

// ─── Icons ─────────────────────────────────────────────────────────────────────

const EditIcon = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
);
const CopyIcon = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);
const DownloadIcon = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);
const RedoIcon = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
);
const SparkleIcon = () => (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
);
const WarnIcon = () => (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);
const CheckIcon = () => (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
);
const DocIcon = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);
const PlusIcon = () => (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function countWords(text: string) {
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function scanForbidden(text: string): string[] {
    const lower = text.toLowerCase();
    return SCHOLARSHIP_FORBIDDEN_PHRASES.filter(p => lower.includes(p));
}

function timeAgo(date: Date | null): string {
    if (!date) return '';
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return 'Just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface ScholarshipEssayWriterProps {
    userProfile: UserProfile;
    apiKeySet: boolean;
    openSettings: () => void;
}

const ScholarshipEssayWriter: React.FC<ScholarshipEssayWriterProps> = ({
    userProfile,
    apiKeySet,
    openSettings,
}) => {
    const [selectedType, setSelectedType] = useState<EssayType>(ESSAY_TYPES[0]);
    const [scholarshipDesc, setScholarshipDesc] = useState('');
    const [additionalCtx, setAdditionalCtx] = useState('');
    const [wordCountVal, setWordCountVal] = useState('650');
    const [essay, setEssay] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [polishStep, setPolishStep] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [forbiddenFound, setForbiddenFound] = useState<string[]>([]);
    const [detectedScholarship, setDetectedScholarship] = useState<string | null>(null);
    const [lastGenerated, setLastGenerated] = useState<Date | null>(null);
    const [tick, setTick] = useState(0);

    // Tick for "last updated" refresh
    React.useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 30000);
        return () => clearInterval(id);
    }, []);

    const targetWords = parseInt(wordCountVal, 10) || 650;
    const outputWords = useMemo(() => countWords(essay), [essay]);
    const wordDiff = outputWords - targetWords;
    const wordCountOk = essay ? Math.abs(wordDiff) / targetWords <= 0.12 : false;

    const liveDetected = useMemo(() => detectScholarshipName(scholarshipDesc), [scholarshipDesc]);
    const descTooShort = scholarshipDesc.trim().length > 0 && scholarshipDesc.trim().length < 50;
    const canGenerate = !isLoading && apiKeySet && !descTooShort;

    const handleTypeSelect = (type: EssayType) => {
        setSelectedType(type);
        setWordCountVal(String(type.defaultWords));
    };

    const handleGenerate = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        setIsLoading(true);
        setError(null);
        setPolishStep(null);
        setEssay('');
        setForbiddenFound([]);
        setDetectedScholarship(liveDetected);
        try {
            const result = await generateScholarshipEssay({
                profile: userProfile,
                essayType: selectedType.id,
                essayLabel: selectedType.label,
                scholarshipDescription: scholarshipDesc,
                additionalContext: additionalCtx,
                wordCount: targetWords,
                promptHint: selectedType.promptHint,
                onStep: (step) => setPolishStep(step),
            });
            setEssay(result);
            setForbiddenFound(scanForbidden(result));
            setLastGenerated(new Date());
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Generation failed. Please try again.');
        } finally {
            setIsLoading(false);
            setPolishStep(null);
        }
    }, [apiKeySet, openSettings, userProfile, selectedType, scholarshipDesc, additionalCtx, targetWords, liveDetected]);

    const handleCopy = () => {
        if (!essay) return;
        navigator.clipboard.writeText(essay).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleDownload = () => {
        if (!essay) return;
        const name = userProfile.personalInfo?.name?.replace(/\s+/g, '_') || 'essay';
        downloadCoverLetterAsPDF(essay, `${name}_${selectedType.id}.pdf`, 'professional');
    };

    return (
        <div className="flex flex-col h-full min-h-0 bg-zinc-50 dark:bg-neutral-900">

            {/* ── Detected scholarships top bar ──────────────────────────────── */}
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-zinc-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/60 flex-shrink-0 flex-wrap">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                    Detected Scholarships (Live)
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                    {KNOWN_SCHOLARSHIPS.map(s => {
                        const active = liveDetected === s;
                        return (
                            <span
                                key={s}
                                className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-all ${
                                    active
                                        ? 'bg-[#C9A84C] border-[#C9A84C] text-white shadow-sm'
                                        : 'bg-transparent border-zinc-300 dark:border-neutral-600 text-zinc-600 dark:text-zinc-400'
                                }`}
                            >
                                {s}
                            </span>
                        );
                    })}
                </div>
                <div className="ml-auto">
                    <button className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-[#1B2B4B] dark:hover:text-[#C9A84C] transition-colors">
                        <PlusIcon />
                        Add / Manage
                    </button>
                </div>
            </div>

            {/* ── Body: left panel + right panel ─────────────────────────────── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* ══ LEFT PANEL ══════════════════════════════════════════════ */}
                <div className="w-[400px] xl:w-[440px] flex-shrink-0 flex flex-col border-r border-zinc-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/40 overflow-y-auto thin-scrollbar">
                    <div className="p-5 space-y-5">

                        {/* Title */}
                        <div className="pb-1">
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Essay Writer</h2>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">AI-powered essays for scholarships and applications</p>
                        </div>

                        {/* Essay type */}
                        <div>
                            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Essay Type</p>
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-2.5">Choose the type of essay you want</p>
                            <div className="space-y-1.5">
                                {ESSAY_TYPES.map(type => {
                                    const sel = selectedType.id === type.id;
                                    return (
                                        <button
                                            key={type.id}
                                            onClick={() => handleTypeSelect(type)}
                                            className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 transition-all border ${
                                                sel
                                                    ? 'border-l-[3px] border-l-[#C9A84C] border-t-transparent border-r-transparent border-b-transparent bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/8'
                                                    : 'border-transparent hover:bg-zinc-50 dark:hover:bg-neutral-700/40'
                                            }`}
                                            style={sel ? {
                                                borderTopWidth: 0,
                                                borderRightWidth: 0,
                                                borderBottomWidth: 0,
                                                borderLeftWidth: '3px',
                                                borderLeftColor: '#C9A84C',
                                                background: sel ? 'rgba(27,43,75,0.05)' : undefined,
                                            } : {}}
                                        >
                                            <span className="text-base flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-neutral-700">
                                                {type.icon}
                                            </span>
                                            <div className="min-w-0">
                                                <p className={`text-sm font-semibold truncate ${sel ? 'text-[#1B2B4B] dark:text-[#C9A84C]' : 'text-zinc-800 dark:text-zinc-200'}`}>
                                                    {type.label}
                                                </p>
                                                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{type.subtitle}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Word count */}
                        <div>
                            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                                Target Word Count
                            </label>
                            <div className="relative">
                                <select
                                    value={wordCountVal}
                                    onChange={e => setWordCountVal(e.target.value)}
                                    className="w-full appearance-none text-sm rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-zinc-800 dark:text-zinc-100 px-3.5 py-2.5 pr-9 focus:ring-2 focus:ring-[#1B2B4B] focus:border-[#1B2B4B] outline-none"
                                >
                                    {WORD_COUNT_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 mt-1">
                                Suggested for {selectedType.label}: {selectedType.wordCountRange}
                            </p>
                        </div>

                        {/* Tips */}
                        <div>
                            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                                Tips for {selectedType.label}
                            </p>
                            <div className="space-y-2">
                                {selectedType.tips.map((tip, i) => (
                                    <div key={i} className="flex items-start gap-2.5">
                                        <span className={`flex-shrink-0 ${TIP_COLORS[i % TIP_COLORS.length]} text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center mt-0.5`}>
                                            {i + 1}
                                        </span>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{tip}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Scholarship description */}
                        <div>
                            <div className="flex items-baseline justify-between mb-1.5">
                                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                    Scholarship Description
                                    <span className="ml-1.5 text-[10px] font-semibold text-red-500">(Required)</span>
                                </label>
                                {descTooShort && (
                                    <span className="text-[10px] text-amber-500 font-semibold">Too short</span>
                                )}
                            </div>
                            <textarea
                                value={scholarshipDesc}
                                onChange={e => setScholarshipDesc(e.target.value)}
                                maxLength={2000}
                                rows={5}
                                disabled={isLoading}
                                placeholder="Paste the scholarship description or requirements here…"
                                className={`w-full text-sm rounded-lg border px-3.5 py-2.5 resize-none outline-none transition-all bg-white dark:bg-neutral-700/60 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-[#1B2B4B] dark:focus:ring-[#C9A84C] ${
                                    descTooShort
                                        ? 'border-amber-400 dark:border-amber-500'
                                        : 'border-zinc-300 dark:border-neutral-600'
                                }`}
                            />
                            <div className="flex items-center justify-between mt-1">
                                <span className="text-[10.5px] text-zinc-400 dark:text-zinc-500">
                                    {scholarshipDesc.trim() ? '' : 'No description? We\'ll write a strong general essay from your profile.'}
                                </span>
                                <span className="text-[10.5px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                                    {scholarshipDesc.length} / 2000
                                </span>
                            </div>
                        </div>

                        {/* Additional context */}
                        <div>
                            <div className="flex items-baseline justify-between mb-1.5">
                                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                    Additional Context
                                    <span className="ml-1.5 text-[10px] font-medium text-zinc-400">(Optional)</span>
                                </label>
                            </div>
                            <textarea
                                value={additionalCtx}
                                onChange={e => setAdditionalCtx(e.target.value)}
                                maxLength={1000}
                                rows={3}
                                disabled={isLoading}
                                placeholder="Add any personal story, achievements, or details that should be included…"
                                className="w-full text-sm rounded-lg border border-zinc-300 dark:border-neutral-600 px-3.5 py-2.5 resize-none outline-none transition-all bg-white dark:bg-neutral-700/60 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-[#1B2B4B] dark:focus:ring-[#C9A84C]"
                            />
                            <p className="text-right text-[10.5px] text-zinc-400 dark:text-zinc-500 mt-1 tabular-nums">
                                {additionalCtx.length} / 1000
                            </p>
                        </div>

                        {error && (
                            <div className="rounded-lg p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                                <WarnIcon />
                                {error}
                            </div>
                        )}

                        {/* Generate button */}
                        <button
                            onClick={handleGenerate}
                            disabled={!canGenerate}
                            className="w-full rounded-xl py-3.5 px-5 flex items-center justify-center gap-2.5 font-bold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
                            style={{
                                background: canGenerate
                                    ? 'linear-gradient(135deg, #C9A84C 0%, #E8C56A 50%, #C9A84C 100%)'
                                    : '#C9A84C',
                                boxShadow: canGenerate ? '0 4px 16px rgba(201,168,76,0.35)' : 'none',
                            }}
                        >
                            {isLoading && (
                                <svg className="animate-spin h-4 w-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            )}
                            {!isLoading && <SparkleIcon />}
                            <div className="text-left">
                                <div>{isLoading ? (polishStep ?? `Writing your ${selectedType.label}…`) : 'Generate Essay'}</div>
                                {!isLoading && (
                                    <div className="text-[10px] font-normal opacity-80 mt-0.5">
                                        Writing your best possible essay…
                                    </div>
                                )}
                            </div>
                        </button>

                        {!apiKeySet && (
                            <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                                ⚠️{' '}
                                <button onClick={openSettings} className="underline font-semibold">
                                    Set your API key in Settings
                                </button>{' '}
                                to enable generation.
                            </p>
                        )}
                    </div>

                    {/* Bottom spacer */}
                    <div className="flex-1" />
                </div>

                {/* ══ RIGHT PANEL ═════════════════════════════════════════════ */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    {essay ? (
                        <>
                            {/* Output header */}
                            <div className="flex items-center gap-3 px-6 py-3.5 border-b border-zinc-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/40 flex-shrink-0">
                                <div className="p-2 bg-[#1B2B4B] dark:bg-[#1B2B4B] rounded-lg flex-shrink-0">
                                    <DocIcon />
                                </div>
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50 truncate">
                                        {selectedType.label}
                                    </h3>
                                    {detectedScholarship && (
                                        <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#C9A84C]/15 text-[#A87E28] dark:text-[#C9A84C] border border-[#C9A84C]/30 flex-shrink-0">
                                            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                                            </svg>
                                            Detected: {detectedScholarship} Scholarship
                                        </span>
                                    )}
                                </div>

                                {/* Word count badge */}
                                <div className={`ml-auto flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold ${wordCountOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                    {wordCountOk && <CheckIcon />}
                                    <span>Word Count: {outputWords} / {targetWords}</span>
                                    {wordCountOk && <span className="font-bold">✓ On Target</span>}
                                    {!wordCountOk && (
                                        <span className="font-bold">
                                            {wordDiff > 0 ? `+${wordDiff}` : wordDiff} words
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 px-6 py-2.5 border-b border-zinc-100 dark:border-neutral-700/40 bg-white dark:bg-neutral-800/20 flex-shrink-0">
                                <ActionBtn icon={<EditIcon />} label={isEditing ? 'Done' : 'Edit'} onClick={() => setIsEditing(!isEditing)} active={isEditing} />
                                <ActionBtn icon={<CopyIcon />} label={copied ? 'Copied!' : 'Copy'} onClick={handleCopy} />
                                <ActionBtn icon={<DownloadIcon />} label="Download PDF" onClick={handleDownload} />
                                <ActionBtn icon={<RedoIcon />} label="Redo" onClick={handleGenerate} disabled={isLoading} />
                            </div>

                            {/* Essay body + forbidden phrases */}
                            <div className="flex-1 overflow-y-auto thin-scrollbar bg-white dark:bg-neutral-900">
                                <div className="max-w-3xl mx-auto px-8 py-8">
                                    <div
                                        contentEditable={isEditing}
                                        suppressContentEditableWarning
                                        onBlur={e => {
                                            const t = e.currentTarget.innerText;
                                            setEssay(t);
                                            setForbiddenFound(scanForbidden(t));
                                        }}
                                        className={`text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-[1.9] text-[15px] font-serif min-h-[200px] outline-none ${
                                            isEditing
                                                ? 'rounded-lg ring-2 ring-[#C9A84C] ring-inset p-4 bg-[#C9A84C]/5'
                                                : ''
                                        }`}
                                    >
                                        {essay}
                                    </div>

                                    {/* Forbidden phrases panel */}
                                    {forbiddenFound.length > 0 && (
                                        <div className="mt-8 rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/15 p-4">
                                            <div className="flex items-center gap-2 mb-2.5">
                                                <WarnIcon />
                                                <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                                    Detected Common Phrases
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {forbiddenFound.map(phrase => (
                                                    <span
                                                        key={phrase}
                                                        className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-800/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40"
                                                    >
                                                        {phrase}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-xs text-amber-600 dark:text-amber-500">
                                                Consider using more specific and original expressions.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between px-6 py-2.5 border-t border-zinc-100 dark:border-neutral-700/40 bg-white dark:bg-neutral-800/30 flex-shrink-0">
                                <div className="flex items-center gap-3 text-[11px] text-zinc-400 dark:text-zinc-500">
                                    <span>Written from your profile</span>
                                    <span className="h-1 w-1 rounded-full bg-zinc-300 dark:bg-neutral-600" />
                                    <span>Humanized by AI</span>
                                    <span className="h-1 w-1 rounded-full bg-zinc-300 dark:bg-neutral-600" />
                                    <span>Review before submitting</span>
                                </div>
                                {lastGenerated && (
                                    <div className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                                        <span>Last updated: {timeAgo(lastGenerated)}</span>
                                        <button onClick={() => setTick(t => t + 1)} className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors ml-0.5">
                                            <RedoIcon />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        /* Empty state */
                        <div className="flex-1 flex items-center justify-center p-10">
                            <div className="text-center max-w-sm">
                                <div className="w-16 h-16 rounded-2xl bg-[#1B2B4B]/8 dark:bg-[#1B2B4B]/30 flex items-center justify-center mx-auto mb-4">
                                    <span className="text-3xl">{selectedType.icon}</span>
                                </div>
                                <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200 mb-2">
                                    Ready to write your {selectedType.label}
                                </h3>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-5">
                                    Fill in the scholarship description on the left and click <strong>Generate Essay</strong>. Your essay will appear here.
                                </p>
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {['Written from your profile', 'Scholarship-aware', 'Always humanized'].map(tag => (
                                        <span key={tag} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#1B2B4B]/8 dark:bg-[#1B2B4B]/30 text-[#1B2B4B] dark:text-[#C9A84C]">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-6 py-2 border-t border-zinc-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/30 flex-shrink-0">
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    ProCV helps you write better essays, faster.
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    Your story. Stronger applications. Greater opportunities. ✦
                </p>
            </div>
        </div>
    );
};

// ─── Action button ─────────────────────────────────────────────────────────────

interface ActionBtnProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
}
const ActionBtn: React.FC<ActionBtnProps> = ({ icon, label, onClick, active, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40 ${
            active
                ? 'bg-[#1B2B4B] border-[#1B2B4B] text-white dark:bg-[#C9A84C] dark:border-[#C9A84C] dark:text-[#1B2B4B]'
                : 'bg-white dark:bg-neutral-700/50 border-zinc-200 dark:border-neutral-600 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-neutral-500'
        }`}
    >
        {icon}
        {label}
    </button>
);

export default ScholarshipEssayWriter;
