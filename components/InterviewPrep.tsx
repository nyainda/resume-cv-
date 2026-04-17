import React, { useState, useCallback } from 'react';
import { UserProfile } from '../types';
import { generateInterviewQA, generateThankYouLetter } from '../services/geminiService';

interface InterviewPrepProps {
    userProfile: UserProfile;
    apiKeySet: boolean;
    openSettings: () => void;
    initialJd?: string;
}

type Category = 'Behavioural' | 'Technical' | 'Situational' | 'Culture' | 'Strength';

const categoryColors: Record<Category, string> = {
    Behavioural: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    Technical: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    Situational: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    Culture: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    Strength: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
};

const categoryIcons: Record<Category, string> = {
    Behavioural: '🧠',
    Technical: '⚙️',
    Situational: '🎯',
    Culture: '🌱',
    Strength: '💪',
};

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            title="Copy answer"
        >
            {copied ? '✓ Copied' : 'Copy'}
        </button>
    );
};

const InterviewPrep: React.FC<InterviewPrepProps> = ({ userProfile, apiKeySet, openSettings, initialJd = '' }) => {
    const [jobDescription, setJobDescription] = useState(initialJd);
    const [companyName, setCompanyName] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [questions, setQuestions] = useState<Array<{ question: string; answer: string; category: string }>>([]);
    const [revealedAnswers, setRevealedAnswers] = useState<Set<number>>(new Set());
    const [activeFilter, setActiveFilter] = useState<string>('All');
    const [loadingMsg, setLoadingMsg] = useState('Generating...');

    // Thank-you letter
    const [showThankYou, setShowThankYou] = useState(false);
    const [interviewerName, setInterviewerName] = useState('');
    const [interviewType, setInterviewType] = useState('interview');
    const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);
    const [thankYouLetter, setThankYouLetter] = useState<string | null>(null);
    const [letterError, setLetterError] = useState<string | null>(null);
    const [letterCopied, setLetterCopied] = useState(false);

    const phases = [
        'Analyzing job requirements...',
        'Mapping your experience to the role...',
        'Crafting behavioural questions...',
        'Building technical scenarios...',
        'Preparing model answers...',
    ];

    const handleGenerate = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        if (!jobDescription.trim()) { setError('Please paste a job description to generate tailored questions.'); return; }

        setIsGenerating(true);
        setError(null);
        setQuestions([]);
        setRevealedAnswers(new Set());
        setActiveFilter('All');
        setThankYouLetter(null);

        let phaseIdx = 0;
        setLoadingMsg(phases[0]);
        const interval = setInterval(() => {
            phaseIdx = Math.min(phaseIdx + 1, phases.length - 1);
            setLoadingMsg(phases[phaseIdx]);
        }, 2500);

        try {
            const result = await generateInterviewQA(userProfile, jobDescription, companyName || undefined);
            setQuestions(result);
        } catch (err: any) {
            setError(err?.message || 'Failed to generate questions. Please try again.');
        } finally {
            clearInterval(interval);
            setIsGenerating(false);
        }
    }, [userProfile, jobDescription, companyName, apiKeySet, openSettings]);

    const toggleAnswer = (idx: number) => {
        setRevealedAnswers(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const revealAll = () => setRevealedAnswers(new Set(questions.map((_, i) => i)));
    const hideAll = () => setRevealedAnswers(new Set());

    const categories = ['All', ...Array.from(new Set(questions.map(q => q.category)))];
    const filtered = activeFilter === 'All' ? questions : questions.filter(q => q.category === activeFilter);

    const handleGenerateThankYou = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        setIsGeneratingLetter(true);
        setLetterError(null);
        setThankYouLetter(null);
        try {
            const letter = await generateThankYouLetter(userProfile, jobDescription, interviewerName || undefined, interviewType);
            setThankYouLetter(letter);
        } catch (err: any) {
            setLetterError(err?.message || 'Failed to generate letter. Please try again.');
        } finally {
            setIsGeneratingLetter(false);
        }
    }, [userProfile, jobDescription, interviewerName, interviewType, apiKeySet, openSettings]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0">
                    <span className="text-lg">🎤</span>
                </div>
                <div>
                    <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">Interview Prep</h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">10 tailored interview questions with model answers — based on your CV and the job description.</p>
                </div>
            </div>

            {/* Input card */}
            <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Company Name <span className="font-normal text-zinc-400">(optional)</span></label>
                        <input
                            type="text"
                            value={companyName}
                            onChange={e => setCompanyName(e.target.value)}
                            placeholder="e.g. Google, Stripe, NHS..."
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                            disabled={isGenerating}
                        />
                    </div>
                    <div className="hidden sm:block" />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Job Description</label>
                    <textarea
                        value={jobDescription}
                        onChange={e => setJobDescription(e.target.value)}
                        placeholder="Paste the full job description here — the AI will generate questions and model answers tailored to THIS specific role..."
                        rows={7}
                        className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                        disabled={isGenerating}
                    />
                </div>

                {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">{error}</div>}
                {!apiKeySet && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                        An API key is required. <button onClick={openSettings} className="font-bold underline">Open Settings →</button>
                    </div>
                )}

                <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !apiKeySet}
                    className="w-full py-3 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
                >
                    {isGenerating ? (
                        <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>{loadingMsg}</>
                    ) : (
                        <>🎤 Generate 10 Interview Questions</>
                    )}
                </button>
            </div>

            {/* Questions */}
            {questions.length > 0 && (
                <div className="space-y-4">
                    {/* Stats row */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{questions.length} questions generated</span>
                            <span className="text-xs text-zinc-400">— practice mode: reveal answers when ready</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={revealAll} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors">Show All Answers</button>
                            <button onClick={hideAll} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-neutral-700 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-neutral-600 hover:bg-zinc-200 dark:hover:bg-neutral-600 transition-colors">Hide All</button>
                        </div>
                    </div>

                    {/* Category filter tabs */}
                    <div className="flex gap-2 flex-wrap">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveFilter(cat)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${activeFilter === cat ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-neutral-700 hover:border-violet-400 dark:hover:border-violet-600'}`}
                            >
                                {cat !== 'All' && categoryIcons[cat as Category]} {cat} {cat !== 'All' && `(${questions.filter(q => q.category === cat).length})`}
                            </button>
                        ))}
                    </div>

                    {/* Question cards */}
                    <div className="space-y-3">
                        {filtered.map((q, i) => {
                            const globalIdx = questions.indexOf(q);
                            const isRevealed = revealedAnswers.has(globalIdx);
                            const color = categoryColors[q.category as Category] || categoryColors.Strength;
                            const icon = categoryIcons[q.category as Category] || '💡';
                            return (
                                <div key={globalIdx} className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 overflow-hidden">
                                    <div className="p-5">
                                        <div className="flex items-start gap-3 mb-3">
                                            <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${color} flex items-center gap-1`}>
                                                {icon} {q.category}
                                            </span>
                                            <span className="text-xs text-zinc-400 ml-auto flex-shrink-0">Q{globalIdx + 1}</span>
                                        </div>
                                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-snug mb-4">"{q.question}"</p>

                                        {isRevealed ? (
                                            <div className="rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">Model Answer</span>
                                                    <CopyButton text={q.answer} />
                                                </div>
                                                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">{q.answer}</p>
                                                <button onClick={() => toggleAnswer(globalIdx)} className="mt-3 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Hide answer ↑</button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => toggleAnswer(globalIdx)}
                                                className="w-full py-2.5 px-4 rounded-lg border-2 border-dashed border-violet-300 dark:border-violet-700 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                                            >
                                                Click to reveal model answer →
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Regenerate */}
                    <div className="text-center">
                        <button onClick={handleGenerate} disabled={isGenerating} className="text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50">
                            Regenerate with fresh questions →
                        </button>
                    </div>

                    {/* Thank-You Letter section */}
                    <div className="bg-white dark:bg-neutral-800/50 rounded-xl border border-zinc-200 dark:border-neutral-800 overflow-hidden">
                        <button
                            onClick={() => setShowThankYou(prev => !prev)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-50 dark:hover:bg-neutral-800/80 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl">📨</span>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Post-Interview Thank-You Letter</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Generate a personalised thank-you letter after your interview</p>
                                </div>
                            </div>
                            <svg className={`h-4 w-4 text-zinc-400 transition-transform ${showThankYou ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 12 15 18 9" /></svg>
                        </button>

                        {showThankYou && (
                            <div className="border-t border-zinc-200 dark:border-neutral-700 p-5 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Interviewer's Name <span className="font-normal text-zinc-400">(optional)</span></label>
                                        <input
                                            type="text"
                                            value={interviewerName}
                                            onChange={e => setInterviewerName(e.target.value)}
                                            placeholder="e.g. Sarah, the hiring team..."
                                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Interview Type</label>
                                        <select
                                            value={interviewType}
                                            onChange={e => setInterviewType(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        >
                                            <option value="interview">Phone / Video Interview</option>
                                            <option value="first-round interview">First-Round Interview</option>
                                            <option value="technical interview">Technical Interview</option>
                                            <option value="final-round interview">Final-Round Interview</option>
                                            <option value="coffee chat">Coffee Chat / Informal Meeting</option>
                                            <option value="panel interview">Panel Interview</option>
                                        </select>
                                    </div>
                                </div>

                                {letterError && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">{letterError}</div>}

                                <button
                                    onClick={handleGenerateThankYou}
                                    disabled={isGeneratingLetter || !apiKeySet || !jobDescription.trim()}
                                    className="w-full py-2.5 px-5 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2"
                                >
                                    {isGeneratingLetter ? (
                                        <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Generating letter...</>
                                    ) : '📨 Generate Thank-You Letter'}
                                </button>

                                {thankYouLetter && (
                                    <div className="rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700 overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-neutral-700">
                                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Thank-You Letter</span>
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(thankYouLetter); setLetterCopied(true); setTimeout(() => setLetterCopied(false), 2000); }}
                                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
                                            >
                                                {letterCopied ? '✓ Copied!' : 'Copy Letter'}
                                            </button>
                                        </div>
                                        <div className="p-5 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                                            {thankYouLetter}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InterviewPrep;
