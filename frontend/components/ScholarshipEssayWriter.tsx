import React, { useState, useCallback, useMemo } from 'react';
import { UserProfile } from '../types';
import { Button } from './ui/Button';
import { Label } from './ui/Label';
import { Textarea } from './ui/Textarea';
import { Sparkles, Download, ClipboardCopy, Edit, BookOpen, FileText, AlertTriangle, CheckCircle } from './icons';
import {
    generateScholarshipEssay,
    detectScholarshipName,
    SCHOLARSHIP_FORBIDDEN_PHRASES,
} from '../services/geminiService';
import { downloadCoverLetterAsPDF } from '../services/pdfService';

interface EssayType {
    id: string;
    label: string;
    emoji: string;
    description: string;
    tips: string[];
    wordCount: string;
    defaultWords: number;
    promptHint: string;
}

const essayTypes: EssayType[] = [
    {
        id: 'personal-statement',
        label: 'Personal Statement',
        emoji: '📝',
        description: 'Why you deserve this scholarship — your story, motivations, and goals.',
        tips: [
            'Open with a specific moment, not a general statement about your passion',
            'Connect real past experiences directly to this scholarship\'s mission',
            'Show self-awareness and growth — not just achievements',
        ],
        wordCount: '500–800 words',
        defaultWords: 650,
        promptHint: 'Write about your background, motivations, academic journey, and why you are a strong candidate for this scholarship.',
    },
    {
        id: 'research-proposal',
        label: 'Research Proposal',
        emoji: '🔬',
        description: 'For PhD, postdoc, or research grants — your research question and methodology.',
        tips: [
            'State the research gap clearly in the first paragraph',
            'Explain WHY your methodology is the right one for this question',
            'Be specific about expected outputs and who benefits',
        ],
        wordCount: '800–1500 words',
        defaultWords: 1000,
        promptHint: 'Write a compelling research proposal describing the research question, literature gap, methodology, expected results, timeline, and broader impact.',
    },
    {
        id: 'statement-of-purpose',
        label: 'Statement of Purpose',
        emoji: '🎯',
        description: 'For graduate school applications — why this program, why you, future goals.',
        tips: [
            'Name specific faculty, labs, or courses — not just the university brand',
            'Show a clear line from past experience → this program → future goal',
            'Avoid listing achievements; show how they shaped your thinking',
        ],
        wordCount: '600–1000 words',
        defaultWords: 750,
        promptHint: 'Write a statement of purpose explaining your academic background, specific reasons for choosing this program, research interests, and career goals.',
    },
    {
        id: 'leadership-essay',
        label: 'Leadership Essay',
        emoji: '🏅',
        description: 'For Chevening, Commonwealth, and leadership scholarships.',
        tips: [
            'Pick ONE story with a clear before/after — not a list of roles',
            'Use "I" not "we" — show YOUR specific initiative and decisions',
            'Quantify the outcome wherever possible',
        ],
        wordCount: '500–700 words',
        defaultWords: 600,
        promptHint: 'Write a leadership essay describing a specific situation where you demonstrated leadership, the concrete actions you took, and the measurable outcomes.',
    },
    {
        id: 'diversity-inclusion',
        label: 'Diversity & Inclusion',
        emoji: '🌍',
        description: 'For Commonwealth, government, and development-focused scholarships.',
        tips: [
            'Be specific about your background — vague diversity claims are weak',
            'Connect your lived experience to a concrete perspective you bring to the field',
            'Show what you have already done — not just what you plan to do',
        ],
        wordCount: '400–600 words',
        defaultWords: 500,
        promptHint: 'Write a diversity statement describing your background, the unique perspective it gives you, and how you advance equity or inclusion in your field.',
    },
    {
        id: 'why-scholarship',
        label: '"Why This Scholarship"',
        emoji: '🏛️',
        description: 'Specific essay on why this particular scholarship fits your goals.',
        tips: [
            'Research the scholarship\'s alumni and values before writing',
            'Name specific values, programmes, or alumni networks — not just the prestige',
            'Show what you will GIVE to the network, not just what you will gain',
        ],
        wordCount: '400–600 words',
        defaultWords: 500,
        promptHint: 'Write an essay explaining why you are applying for this specific scholarship, demonstrating deep knowledge of its values, mission, and what you will contribute.',
    },
    {
        id: 'academic-cover-letter',
        label: 'Academic Cover Letter',
        emoji: '📄',
        description: 'Formal cover letter for scholarship or programme applications.',
        tips: [
            'Address specific selection criteria point by point',
            'Reference the scholarship/institution by full name',
            'Keep it concise and professional — less than 500 words',
        ],
        wordCount: '300–500 words',
        defaultWords: 400,
        promptHint: 'Write a professional academic cover letter introducing yourself, your top qualifications, and your specific interest in this opportunity.',
    },
];

// Known scholarship names for the badge
const KNOWN_SCHOLARSHIPS = [
    'Chevening', 'Commonwealth', 'Fulbright', 'Gates Cambridge',
    'Rhodes', 'DAAD', 'Erasmus+',
];

interface ScholarshipEssayWriterProps {
    userProfile: UserProfile;
    apiKeySet: boolean;
    openSettings: () => void;
}

const ScholarshipEssayWriter: React.FC<ScholarshipEssayWriterProps> = ({ userProfile, apiKeySet, openSettings }) => {
    const [selectedType, setSelectedType] = useState<EssayType>(essayTypes[0]);
    const [scholarshipDescription, setScholarshipDescription] = useState('');
    const [additionalContext, setAdditionalContext] = useState('');
    const [desiredWordCount, setDesiredWordCount] = useState('650');
    const [generatedEssay, setGeneratedEssay] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [polishStep, setPolishStep] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detectedScholarship, setDetectedScholarship] = useState<string | null>(null);
    const [forbiddenFound, setForbiddenFound] = useState<string[]>([]);

    // Live word count of output
    const outputWordCount = useMemo(
        () => generatedEssay ? generatedEssay.split(/\s+/).filter(Boolean).length : 0,
        [generatedEssay]
    );
    const targetWords = parseInt(desiredWordCount, 10) || 650;
    const wordCountDiff = outputWordCount - targetWords;
    const wordCountOk = Math.abs(wordCountDiff) / targetWords <= 0.12;

    // Detect forbidden phrases in the generated essay
    const scanForbidden = (text: string) => {
        const lower = text.toLowerCase();
        return SCHOLARSHIP_FORBIDDEN_PHRASES.filter(phrase => lower.includes(phrase));
    };

    // Detect scholarship name from description
    const liveDetectedScholarship = useMemo(
        () => detectScholarshipName(scholarshipDescription),
        [scholarshipDescription]
    );

    const descTooShort = scholarshipDescription.trim().length > 0 && scholarshipDescription.trim().length < 50;
    const canGenerate = !isLoading && apiKeySet && !descTooShort;

    const handleGenerate = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        setIsLoading(true);
        setError(null);
        setPolishStep(null);
        setGeneratedEssay('');
        setForbiddenFound([]);
        setDetectedScholarship(liveDetectedScholarship);
        try {
            const essay = await generateScholarshipEssay({
                profile: userProfile,
                essayType: selectedType.id,
                essayLabel: selectedType.label,
                scholarshipDescription,
                additionalContext,
                wordCount: targetWords,
                promptHint: selectedType.promptHint,
                onStep: (step) => setPolishStep(step),
            });
            setGeneratedEssay(essay);
            setForbiddenFound(scanForbidden(essay));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg || 'Generation failed. Please try again.');
        } finally {
            setIsLoading(false);
            setPolishStep(null);
        }
    }, [apiKeySet, openSettings, userProfile, selectedType, scholarshipDescription, additionalContext, targetWords, liveDetectedScholarship]);

    const handleCopy = () => {
        if (!generatedEssay) return;
        navigator.clipboard.writeText(generatedEssay).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleDownload = () => {
        if (!generatedEssay) return;
        const name = userProfile.personalInfo.name.replace(/\s+/g, '_');
        downloadCoverLetterAsPDF(generatedEssay, `${name}_${selectedType.id}.pdf`, 'professional');
    };

    // Update default word count when essay type changes
    const handleTypeSelect = (type: EssayType) => {
        setSelectedType(type);
        setDesiredWordCount(String(type.defaultWords));
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="bg-[#1B2B4B] rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, #C9A84C 0%, transparent 60%)' }} />
                <div className="relative flex items-center gap-3 mb-2">
                    <div className="p-2 bg-[#C9A84C]/20 rounded-xl">
                        <BookOpen className="h-6 w-6 text-[#C9A84C]" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight">Scholarship Essay Writer</h2>
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#C9A84C]">
                            Per-type structure · Scholarship-aware · Always humanized
                        </p>
                    </div>
                </div>
                <p className="relative text-white/70 text-sm leading-relaxed max-w-2xl mt-1">
                    Generate compelling scholarship essays drawn from your profile. Each essay follows the exact structure reviewers expect for its type, with forbidden clichés blocked and word count enforced.
                </p>

                {/* Known scholarship pills */}
                <div className="relative flex flex-wrap gap-1.5 mt-3">
                    {KNOWN_SCHOLARSHIPS.map(s => (
                        <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                            {s}
                        </span>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Left: Essay Type Selector + Word Count */}
                <div className="lg:col-span-2 space-y-6">
                    <div>
                        <Label className="text-base font-bold mb-3 block text-zinc-800 dark:text-zinc-100">Essay Type</Label>
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 thin-scrollbar">
                            {essayTypes.map(type => {
                                const isSelected = selectedType.id === type.id;
                                return (
                                    <button
                                        key={type.id}
                                        onClick={() => handleTypeSelect(type)}
                                        className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-150 ${
                                            isSelected
                                                ? 'border-[#C9A84C] bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/5 shadow-sm'
                                                : 'border-zinc-200 dark:border-neutral-700 hover:border-[#1B2B4B]/40 dark:hover:border-[#C9A84C]/30 bg-white dark:bg-neutral-800/40'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">{type.emoji}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-sm font-semibold ${isSelected ? 'text-[#1B2B4B] dark:text-[#C9A84C]' : 'text-zinc-800 dark:text-zinc-200'}`}>
                                                    {type.label}
                                                </p>
                                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                                    {type.wordCount} · {type.description.substring(0, 46)}…
                                                </p>
                                            </div>
                                            {isSelected && <CheckCircle className="h-4 w-4 text-[#C9A84C] ml-auto flex-shrink-0" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Word Count */}
                    <div>
                        <Label htmlFor="word-count" className="text-sm font-semibold mb-1 block">Target Word Count</Label>
                        <select
                            id="word-count"
                            value={desiredWordCount}
                            onChange={e => setDesiredWordCount(e.target.value)}
                            className="w-full text-sm rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 px-3 py-2 focus:ring-2 focus:ring-[#1B2B4B] focus:border-[#1B2B4B]"
                        >
                            <option value="300">~300 words (Short)</option>
                            <option value="400">~400 words (Brief)</option>
                            <option value="500">~500 words (Standard)</option>
                            <option value="600">~600 words</option>
                            <option value="650">~650 words (Recommended)</option>
                            <option value="750">~750 words</option>
                            <option value="800">~800 words (Detailed)</option>
                            <option value="1000">~1000 words (Long)</option>
                            <option value="1500">~1500 words (Research proposal)</option>
                        </select>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                            Suggested for {selectedType.label}: {selectedType.wordCount}
                        </p>
                    </div>

                    {/* Tips */}
                    <div className="p-4 rounded-xl bg-[#1B2B4B]/5 dark:bg-[#1B2B4B]/30 border border-[#1B2B4B]/15 dark:border-[#C9A84C]/20">
                        <p className="text-xs font-bold text-[#1B2B4B] dark:text-[#C9A84C] mb-2">
                            ✦ Tips for {selectedType.label}
                        </p>
                        <ul className="space-y-1.5">
                            {selectedType.tips.map((tip, i) => (
                                <li key={i} className="text-xs text-[#1B2B4B]/80 dark:text-zinc-300 flex items-start gap-1.5">
                                    <span className="mt-0.5 text-[#C9A84C] font-bold flex-shrink-0">·</span>
                                    {tip}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Right: Inputs & Controls */}
                <div className="lg:col-span-3 space-y-5">
                    {/* Scholarship Description */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <Label htmlFor="scholarship-desc" className="text-sm font-semibold">
                                Scholarship / Program Description
                            </Label>
                            {liveDetectedScholarship && (
                                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#C9A84C]/15 text-[#B8922A] dark:text-[#C9A84C]">
                                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26Z"/>
                                    </svg>
                                    {liveDetectedScholarship} detected
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1.5">
                            Paste the scholarship call, eligibility criteria, values, or requirements. The AI uses this to align your essay to the scholarship's specific mission.
                        </p>
                        <Textarea
                            id="scholarship-desc"
                            value={scholarshipDescription}
                            onChange={e => setScholarshipDescription(e.target.value)}
                            placeholder="Paste the scholarship description, eligibility criteria, or values here. The more detail you give, the better the essay will be aligned to what reviewers want…"
                            rows={6}
                            disabled={isLoading}
                            className={descTooShort ? 'border-amber-400 focus:ring-amber-400' : ''}
                        />
                        {descTooShort && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                Add more detail ({scholarshipDescription.trim().length}/50 chars minimum) — a fuller description produces a much better essay.
                            </p>
                        )}
                        {!scholarshipDescription.trim() && (
                            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                                💡 No description? The AI will write a strong general essay using your profile alone.
                            </p>
                        )}
                    </div>

                    {/* Additional context */}
                    <div>
                        <Label htmlFor="additional-context" className="text-sm font-semibold mb-1.5 block">
                            Additional Context
                            <span className="ml-2 text-xs font-normal text-zinc-400">(optional)</span>
                        </Label>
                        <Textarea
                            id="additional-context"
                            value={additionalContext}
                            onChange={e => setAdditionalContext(e.target.value)}
                            placeholder="Specific stories, achievements, or talking points to include. E.g.: 'I founded a community recycling programme in 2022 that served 500 households — I want this mentioned prominently…'"
                            rows={3}
                            disabled={isLoading}
                        />
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            {error}
                        </div>
                    )}

                    {/* Generate button */}
                    <Button
                        onClick={handleGenerate}
                        disabled={!canGenerate}
                        size="lg"
                        className="w-full bg-[#1B2B4B] hover:bg-[#1B2B4B]/90 text-white border-0 shadow-md disabled:opacity-50"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 mr-3 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                <span>{polishStep ?? `Writing your ${selectedType.label}…`}</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="h-5 w-5 mr-2 text-[#C9A84C]" />
                                Generate {selectedType.emoji} {selectedType.label}
                            </>
                        )}
                    </Button>

                    {!apiKeySet && (
                        <p className="text-amber-600 dark:text-amber-400 text-xs text-center">
                            ⚠️ Set your API key in{' '}
                            <button onClick={openSettings} className="underline font-semibold">Settings</button>{' '}
                            to enable generation.
                        </p>
                    )}
                </div>
            </div>

            {/* Generated Essay Output */}
            {generatedEssay && (
                <div className="bg-white dark:bg-neutral-800/50 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                    {/* Output header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-zinc-200 dark:border-neutral-700 bg-[#1B2B4B]/3 dark:bg-[#1B2B4B]/20">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-[#1B2B4B] rounded-lg">
                                <FileText className="h-4 w-4 text-[#C9A84C]" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                                    {selectedType.emoji} {selectedType.label}
                                    {detectedScholarship && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#C9A84C]/20 text-[#B8922A] dark:text-[#C9A84C]">
                                            {detectedScholarship}
                                        </span>
                                    )}
                                </h3>
                                {/* Word count target vs actual */}
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-xs font-semibold ${
                                        wordCountOk
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-amber-600 dark:text-amber-400'
                                    }`}>
                                        {outputWordCount} words
                                    </span>
                                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                        (target: {targetWords})
                                    </span>
                                    {wordCountOk ? (
                                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">✓ on target</span>
                                    ) : (
                                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                            {wordCountDiff > 0 ? `+${wordCountDiff}` : wordCountDiff} from target
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setIsEditing(!isEditing)}>
                                <Edit className="h-4 w-4 mr-1.5" />
                                {isEditing ? 'Done' : 'Edit'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleCopy}>
                                <ClipboardCopy className="h-4 w-4 mr-1.5" />
                                {copied ? '✓ Copied!' : 'Copy'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleDownload}>
                                <Download className="h-4 w-4 mr-1.5" />
                                PDF
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={isLoading}>
                                <Sparkles className="h-4 w-4 mr-1.5" />
                                Redo
                            </Button>
                        </div>
                    </div>

                    {/* Forbidden phrase warning */}
                    {forbiddenFound.length > 0 && (
                        <div className="mx-5 mt-4 p-3 rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/15">
                            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                {forbiddenFound.length} cliché phrase{forbiddenFound.length > 1 ? 's' : ''} detected — reviewers penalise these
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {forbiddenFound.map(phrase => (
                                    <span key={phrase} className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-800/30 text-amber-800 dark:text-amber-300">
                                        "{phrase}"
                                    </span>
                                ))}
                            </div>
                            <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1.5">
                                Edit the essay to replace these with a specific named experience or number.
                            </p>
                        </div>
                    )}

                    {/* Essay body */}
                    <div
                        contentEditable={isEditing}
                        suppressContentEditableWarning
                        onBlur={e => {
                            const text = e.currentTarget.innerText;
                            setGeneratedEssay(text);
                            setForbiddenFound(scanForbidden(text));
                        }}
                        className={`p-6 sm:p-8 text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-[1.9] text-sm font-serif max-w-3xl mx-auto min-h-[300px] ${
                            isEditing
                                ? 'ring-2 ring-inset ring-[#C9A84C] focus:outline-none bg-[#C9A84C]/5 dark:bg-[#C9A84C]/10 rounded-lg m-4 p-6'
                                : ''
                        }`}
                    >
                        {generatedEssay}
                    </div>

                    <div className="px-6 pb-4 flex items-center gap-2">
                        <div className="h-1.5 w-1.5 bg-[#C9A84C] rounded-full" />
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            Written from your profile · Humanized · Review and personalize before submitting
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScholarshipEssayWriter;
