/**
 * InterviewPrep — Fully redesigned with ProCV brand consistency.
 * Colors: Navy #1B2B4B · Gold #C9A84C · Background #F8F7F4
 * Fonts: Playfair Display (headings) · DM Sans (body)
 */
import React, { useState, useCallback } from 'react';
import { UserProfile } from '../types';
import { generateInterviewQA, generateThankYouLetter } from '../services/geminiService';

const NAV  = '#1B2B4B';
const GOLD = '#C9A84C';

interface InterviewPrepProps {
    userProfile: UserProfile;
    apiKeySet: boolean;
    openSettings: () => void;
    initialJd?: string;
}

type Category = 'Behavioural' | 'Technical' | 'Situational' | 'Culture' | 'Strength';

const categoryColors: Record<Category, string> = {
    Behavioural: 'bg-[#1B2B4B]/10 dark:bg-[#1B2B4B]/30 text-[#1B2B4B] dark:text-[#93b4d8] border-[#1B2B4B]/20 dark:border-[#1B2B4B]/40',
    Technical:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    Situational: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    Culture:     'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    Strength:    'bg-[#C9A84C]/15 dark:bg-[#C9A84C]/20 text-[#92400e] dark:text-[#C9A84C] border-[#C9A84C]/30 dark:border-[#C9A84C]/30',
};

const categoryIcons: Record<Category, string> = {
    Behavioural: '🧠', Technical: '⚙️', Situational: '🎯', Culture: '🌱', Strength: '💪',
};

// STAR framework hints — tailored per category
interface StarHint { label: string; letter: string; prompt: string; }
const starHints: Record<Category, StarHint[]> = {
    Behavioural: [
        { letter: 'S', label: 'Situation', prompt: 'Set the scene — what was happening and why it mattered?' },
        { letter: 'T', label: 'Task',      prompt: 'What was your specific responsibility in that moment?' },
        { letter: 'A', label: 'Action',    prompt: 'What exact steps did YOU take? (use "I", not "we")' },
        { letter: 'R', label: 'Result',    prompt: 'What measurable outcome did it produce? Quantify if you can.' },
    ],
    Technical: [
        { letter: 'S', label: 'Problem',   prompt: 'What was the technical challenge or system constraint?' },
        { letter: 'T', label: 'Ownership', prompt: 'What part of the problem were you specifically responsible for?' },
        { letter: 'A', label: 'Solution',  prompt: 'Which tools, patterns, or decisions drove your approach?' },
        { letter: 'R', label: 'Impact',    prompt: 'What improved — performance, reliability, velocity, cost?' },
    ],
    Situational: [
        { letter: 'S', label: 'Scenario',  prompt: 'Frame the hypothetical — what stakes are involved?' },
        { letter: 'T', label: 'Priority',  prompt: 'What would your first goal be? Why that, not something else?' },
        { letter: 'A', label: 'Steps',     prompt: 'Walk through each concrete step you would take.' },
        { letter: 'R', label: 'Outcome',   prompt: 'What result would you be aiming for, and how would you know?' },
    ],
    Culture: [
        { letter: 'S', label: 'Context',   prompt: 'Describe the team or culture environment you were in.' },
        { letter: 'T', label: 'Your role', prompt: 'What were you trying to achieve for the team or organisation?' },
        { letter: 'A', label: 'Action',    prompt: 'How did you contribute, adapt, or lead by example?' },
        { letter: 'R', label: 'Result',    prompt: 'What positive shift happened in the team or project?' },
    ],
    Strength: [
        { letter: 'S', label: 'Setting',   prompt: 'When did this strength make the biggest difference?' },
        { letter: 'T', label: 'Challenge', prompt: 'What needed to be achieved — and why was it hard?' },
        { letter: 'A', label: 'Applied',   prompt: 'How did you specifically deploy this strength?' },
        { letter: 'R', label: 'Delivered', prompt: 'What did it deliver for the business, team, or customer?' },
    ],
};

const inputClass = "w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 transition-all";
const inputFocus = "focus:ring-[#C9A84C]/40 dark:focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]/60";

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-neutral-600 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors"
        >
            {copied ? '✓ Copied' : 'Copy'}
        </button>
    );
};

const InterviewPrep: React.FC<InterviewPrepProps> = ({ userProfile, apiKeySet, openSettings, initialJd = '' }) => {
    const [jobDescription, setJobDescription]     = useState(initialJd);
    const [companyName, setCompanyName]           = useState('');
    const [isGenerating, setIsGenerating]         = useState(false);
    const [error, setError]                       = useState<string | null>(null);
    const [questions, setQuestions]               = useState<Array<{ question: string; answer: string; category: string }>>([]);
    const [revealedAnswers, setRevealedAnswers]   = useState<Set<number>>(new Set());
    const [starOpen, setStarOpen]                 = useState<Set<number>>(new Set());
    const [activeFilter, setActiveFilter]         = useState<string>('All');
    const [loadingMsg, setLoadingMsg]             = useState('Generating...');

    const [showThankYou, setShowThankYou]         = useState(false);
    const [interviewerName, setInterviewerName]   = useState('');
    const [interviewType, setInterviewType]       = useState('interview');
    const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);
    const [thankYouLetter, setThankYouLetter]     = useState<string | null>(null);
    const [letterError, setLetterError]           = useState<string | null>(null);
    const [letterCopied, setLetterCopied]         = useState(false);

    const phases = [
        'Analyzing job requirements…',
        'Mapping your experience to the role…',
        'Crafting behavioural questions…',
        'Building technical scenarios…',
        'Preparing model answers…',
    ];

    const handleGenerate = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        if (!jobDescription.trim()) { setError('Please paste a job description to generate tailored questions.'); return; }
        setIsGenerating(true); setError(null); setQuestions([]); setRevealedAnswers(new Set());
        setStarOpen(new Set()); setActiveFilter('All'); setThankYouLetter(null);
        let phaseIdx = 0; setLoadingMsg(phases[0]);
        const interval = setInterval(() => { phaseIdx = Math.min(phaseIdx + 1, phases.length - 1); setLoadingMsg(phases[phaseIdx]); }, 2500);
        try {
            const result = await generateInterviewQA(userProfile, jobDescription, companyName || undefined);
            setQuestions(result);
        } catch (err: any) {
            setError(err?.message || 'Failed to generate questions. Please try again.');
        } finally { clearInterval(interval); setIsGenerating(false); }
    }, [userProfile, jobDescription, companyName, apiKeySet, openSettings]);

    const toggleAnswer = (idx: number) => setRevealedAnswers(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
    const toggleStar   = (idx: number) => setStarOpen(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
    const revealAll = () => setRevealedAnswers(new Set(questions.map((_, i) => i)));
    const hideAll   = () => setRevealedAnswers(new Set());

    const categories = ['All', ...Array.from(new Set(questions.map(q => q.category)))];
    const filtered   = activeFilter === 'All' ? questions : questions.filter(q => q.category === activeFilter);

    const handleGenerateThankYou = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        setIsGeneratingLetter(true); setLetterError(null); setThankYouLetter(null);
        try {
            const letter = await generateThankYouLetter(userProfile, jobDescription, interviewerName || undefined, interviewType);
            setThankYouLetter(letter);
        } catch (err: any) {
            setLetterError(err?.message || 'Failed to generate letter. Please try again.');
        } finally { setIsGeneratingLetter(false); }
    }, [userProfile, jobDescription, interviewerName, interviewType, apiKeySet, openSettings]);

    return (
        <div className="space-y-6">

            {/* ── Page header ─────────────────────────────────────────── */}
            <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 shadow-sm"
                     style={{ background: NAV }}>
                    🎤
                </div>
                <div>
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-50 leading-tight"
                        style={{ fontFamily: "'Playfair Display', serif" }}>
                        Interview Prep
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {questions.length > 0
                            ? `${questions.length} tailored questions · practice mode`
                            : '10 tailored questions with model answers — based on your CV and the job'}
                    </p>
                </div>
            </div>

            {/* ── Input card ──────────────────────────────────────────── */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 p-6 space-y-4 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                            Company Name <span className="font-normal text-zinc-400 dark:text-zinc-500">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={companyName}
                            onChange={e => setCompanyName(e.target.value)}
                            placeholder="e.g. Google, Stripe, NHS…"
                            className={`${inputClass} ${inputFocus}`}
                            disabled={isGenerating}
                        />
                    </div>
                    <div className="hidden sm:block" />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        Job Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        value={jobDescription}
                        onChange={e => setJobDescription(e.target.value)}
                        placeholder="Paste the full job description here — the AI will generate questions and model answers tailored to THIS specific role…"
                        rows={7}
                        className={`${inputClass} ${inputFocus} resize-none`}
                        disabled={isGenerating}
                    />
                </div>

                {error && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}
                {!apiKeySet && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                        An API key is required.{' '}
                        <button onClick={openSettings} className="font-bold underline hover:no-underline">Open Settings →</button>
                    </div>
                )}

                <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !apiKeySet}
                    className="w-full py-3 px-6 rounded-xl font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2 hover:opacity-90"
                    style={{ background: NAV }}
                >
                    {isGenerating ? (
                        <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            {loadingMsg}
                        </>
                    ) : (
                        <>🎤 Generate 10 Interview Questions</>
                    )}
                </button>
            </div>

            {/* ── Results ─────────────────────────────────────────────── */}
            {questions.length > 0 && (
                <div className="space-y-4">

                    {/* Stats + controls row */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{questions.length} questions ready</span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-2">— reveal answers when ready to practice</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={revealAll}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                                style={{ background: GOLD + '18', borderColor: GOLD + '40', color: '#92400e' }}
                            >
                                Show All
                            </button>
                            <button
                                onClick={hideAll}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
                            >
                                Hide All
                            </button>
                        </div>
                    </div>

                    {/* Category filter tabs */}
                    <div className="flex gap-2 flex-wrap">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveFilter(cat)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                                    activeFilter === cat
                                        ? 'text-white border-transparent'
                                        : 'bg-white dark:bg-neutral-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-600'
                                }`}
                                style={activeFilter === cat ? { background: NAV, borderColor: NAV } : {}}
                            >
                                {cat !== 'All' && `${categoryIcons[cat as Category]} `}
                                {cat}
                                {cat !== 'All' && ` (${questions.filter(q => q.category === cat).length})`}
                            </button>
                        ))}
                    </div>

                    {/* Question cards */}
                    <div className="space-y-3">
                        {filtered.map((q, _i) => {
                            const globalIdx  = questions.indexOf(q);
                            const isRevealed = revealedAnswers.has(globalIdx);
                            const color = categoryColors[q.category as Category] || categoryColors.Strength;
                            const icon  = categoryIcons[q.category as Category] || '💡';
                            return (
                                <div key={globalIdx}
                                     className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 overflow-hidden shadow-sm">
                                    <div className="p-5">
                                        <div className="flex items-start gap-3 mb-3">
                                            <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${color} flex items-center gap-1`}>
                                                {icon} {q.category}
                                            </span>
                                            <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto flex-shrink-0 font-medium">Q{globalIdx + 1}</span>
                                        </div>
                                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-snug mb-3">
                                            "{q.question}"
                                        </p>

                                        {/* STAR Guide — collapsed by default */}
                                        {!isRevealed && (() => {
                                            const hints = starHints[q.category as Category] ?? starHints.Behavioural;
                                            const isStarOpen = starOpen.has(globalIdx);
                                            const letterColors = ['#1B2B4B', '#C9A84C', '#1B2B4B', '#C9A84C'];
                                            return (
                                                <div className="mb-3">
                                                    <button
                                                        onClick={() => toggleStar(globalIdx)}
                                                        className="flex items-center gap-1.5 text-xs font-semibold transition-colors mb-2"
                                                        style={{ color: isStarOpen ? NAV : '#6b7280' }}
                                                    >
                                                        <span className="flex items-center gap-0.5">
                                                            {['S','T','A','R'].map((l, li) => (
                                                                <span key={l} className="w-4 h-4 rounded text-[10px] font-black flex items-center justify-center text-white"
                                                                      style={{ background: isStarOpen ? letterColors[li] : '#d1d5db' }}>
                                                                    {l}
                                                                </span>
                                                            ))}
                                                        </span>
                                                        <span>{isStarOpen ? 'Hide STAR guide' : 'STAR guide'}</span>
                                                        <svg className={`h-3 w-3 transition-transform ${isStarOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="6 9 12 15 18 9"/></svg>
                                                    </button>
                                                    {isStarOpen && (
                                                        <div className="grid grid-cols-2 gap-1.5">
                                                            {hints.map((h, hi) => (
                                                                <div key={h.letter}
                                                                     className="rounded-xl p-2.5 border"
                                                                     style={{ background: letterColors[hi] + '0c', borderColor: letterColors[hi] + '28' }}>
                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                        <span className="w-5 h-5 rounded-lg text-[11px] font-black flex items-center justify-center text-white flex-shrink-0"
                                                                              style={{ background: letterColors[hi] }}>
                                                                            {h.letter}
                                                                        </span>
                                                                        <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200">{h.label}</span>
                                                                    </div>
                                                                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">{h.prompt}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {isRevealed ? (
                                            <div className="rounded-xl border p-4"
                                                 style={{ background: NAV + '08', borderColor: NAV + '25' }}>
                                                <div className="flex items-center justify-between mb-2.5">
                                                    <span className="text-xs font-black uppercase tracking-wider"
                                                          style={{ color: NAV }}>
                                                        Model Answer
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <CopyButton text={q.answer} />
                                                    </div>
                                                </div>
                                                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                                                    {q.answer}
                                                </p>
                                                <button
                                                    onClick={() => toggleAnswer(globalIdx)}
                                                    className="mt-3 text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                                                >
                                                    Hide answer ↑
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => toggleAnswer(globalIdx)}
                                                className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed text-xs font-semibold transition-colors"
                                                style={{ borderColor: GOLD + '60', color: '#92400e' }}
                                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = GOLD + '10'; }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                                            >
                                                Click to reveal model answer →
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Regenerate link */}
                    <div className="text-center">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="text-sm font-semibold transition-colors disabled:opacity-50"
                            style={{ color: NAV }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = GOLD; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = NAV; }}
                        >
                            Regenerate with fresh questions →
                        </button>
                    </div>

                    {/* ── Thank-You Letter ─────────────────────────────── */}
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-800 overflow-hidden shadow-sm">
                        <button
                            onClick={() => setShowThankYou(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-50 dark:hover:bg-neutral-800/60 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                                     style={{ background: GOLD + '20' }}>
                                    📨
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Post-Interview Thank-You Letter</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Generate a personalised thank-you letter after your interview</p>
                                </div>
                            </div>
                            <svg className={`h-4 w-4 text-zinc-400 transition-transform flex-shrink-0 ${showThankYou ? 'rotate-180' : ''}`}
                                 viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </button>

                        {showThankYou && (
                            <div className="border-t border-zinc-100 dark:border-neutral-800 p-5 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                            Interviewer's Name <span className="font-normal text-zinc-400">(optional)</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={interviewerName}
                                            onChange={e => setInterviewerName(e.target.value)}
                                            placeholder="e.g. Sarah, the hiring team…"
                                            className={`${inputClass} ${inputFocus}`}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                            Interview Type
                                        </label>
                                        <select
                                            value={interviewType}
                                            onChange={e => setInterviewType(e.target.value)}
                                            className={`${inputClass} ${inputFocus}`}
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

                                {letterError && (
                                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                                        {letterError}
                                    </div>
                                )}

                                <button
                                    onClick={handleGenerateThankYou}
                                    disabled={isGeneratingLetter || !apiKeySet || !jobDescription.trim()}
                                    className="w-full py-2.5 px-5 rounded-xl font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2 hover:opacity-90"
                                    style={{ background: NAV }}
                                >
                                    {isGeneratingLetter ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                            </svg>
                                            Generating letter…
                                        </>
                                    ) : '📨 Generate Thank-You Letter'}
                                </button>

                                {thankYouLetter && (
                                    <div className="rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-neutral-700"
                                             style={{ background: NAV + '08' }}>
                                            <span className="text-xs font-black uppercase tracking-wider" style={{ color: NAV }}>
                                                Thank-You Letter
                                            </span>
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(thankYouLetter); setLetterCopied(true); setTimeout(() => setLetterCopied(false), 2000); }}
                                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors bg-white dark:bg-neutral-800"
                                            >
                                                {letterCopied ? '✓ Copied!' : 'Copy Letter'}
                                            </button>
                                        </div>
                                        <div className="p-5 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed bg-white dark:bg-neutral-900">
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
