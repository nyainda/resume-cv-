/**
 * InterviewPrep — Two-column sticky layout redesign.
 * Left: sticky setup form. Right: accordion question list.
 * Colors: Navy #1B2B4B · Gold #C9A84C — dark/light mode preserved.
 */
import React, { useState, useCallback, useRef } from 'react';
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
    const [ratings, setRatings]                   = useState<Map<number, number>>(new Map());
    const [activeFilter, setActiveFilter]         = useState<string>('All');
    const [loadingMsg, setLoadingMsg]             = useState('Generating...');

    const [showThankYou, setShowThankYou]         = useState(false);
    const [interviewerName, setInterviewerName]   = useState('');
    const [interviewType, setInterviewType]       = useState('interview');
    const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);
    const [thankYouLetter, setThankYouLetter]     = useState<string | null>(null);
    const [letterError, setLetterError]           = useState<string | null>(null);
    const [letterCopied, setLetterCopied]         = useState(false);

    const [questionCount, setQuestionCount]       = useState(10);
    const [mockMode, setMockMode]                 = useState(false);
    const [mockIndex, setMockIndex]               = useState(0);
    const intervalRef                             = useRef<ReturnType<typeof setInterval> | null>(null);
    const generatedAtRef                          = useRef<Date | null>(null);

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
        setStarOpen(new Set()); setRatings(new Map()); setActiveFilter('All'); setThankYouLetter(null);
        setMockMode(false); setMockIndex(0);
        let phaseIdx = 0; setLoadingMsg(phases[0]);
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
            phaseIdx = Math.min(phaseIdx + 1, phases.length - 1);
            setLoadingMsg(phases[phaseIdx]);
        }, 2500);
        try {
            const result = await generateInterviewQA(userProfile, jobDescription, companyName || undefined, questionCount);
            setQuestions(result);
            generatedAtRef.current = new Date();
        } catch (err: any) {
            setError(err?.message || 'Failed to generate questions. Please try again.');
        } finally {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            setIsGenerating(false);
        }
    }, [userProfile, jobDescription, companyName, apiKeySet, openSettings, questionCount]);

    const toggleAnswer  = (idx: number) => setRevealedAnswers(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
    const toggleStar    = (idx: number) => setStarOpen(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
    const rateQuestion  = (idx: number, score: number) => setRatings(prev => { const m = new Map(prev); m.set(idx, score); return m; });
    const revealAll = () => setRevealedAnswers(new Set(questions.map((_, i) => i)));
    const hideAll   = () => setRevealedAnswers(new Set());

    // ── PDF export ──────────────────────────────────────────────────────────
    const exportPracticeReport = useCallback(() => {
        const now     = new Date();
        const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const ratingLabels: Record<number, string> = { 1: '😬 Struggled', 2: '😐 Unsure', 3: '🙂 OK', 4: '😊 Good', 5: '🔥 Nailed it' };
        const ratingColors: Record<number, string> = { 1: '#dc2626', 2: '#ea580c', 3: '#d97706', 4: '#1B2B4B', 5: '#059669' };
        const ratingBg: Record<number, string>     = { 1: '#fef2f2', 2: '#fff7ed', 3: '#fffbeb', 4: '#eef1f7', 5: '#f0fdf4' };

        const avgR   = ratings.size > 0 ? (Array.from(ratings.values()) as number[]).reduce((a, b) => a + b, 0) / ratings.size : 0;
        const pct    = ratings.size > 0 ? Math.round((avgR / 5) * 100) : 0;
        const pctColor = pct >= 70 ? '#059669' : pct >= 45 ? '#d97706' : '#dc2626';

        const practiceQs = questions.filter((_, i) => (ratings.get(i) ?? 0) <= 2 && ratings.has(i));
        const confidentQs = questions.filter((_, i) => (ratings.get(i) ?? 0) >= 4 && ratings.has(i));

        const catIcon: Record<string, string> = { Behavioural: '🧠', Technical: '⚙️', Situational: '🎯', Culture: '🌱', Strength: '💪' };

        const questionRows = questions.map((q, i) => {
            const r = ratings.get(i);
            const label  = r ? ratingLabels[r]  : '— Not rated';
            const color  = r ? ratingColors[r]  : '#9ca3af';
            const bg     = r ? ratingBg[r]      : '#f9fafb';
            const icon   = catIcon[q.category] ?? '💡';
            return `
            <div style="margin-bottom:16px;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;break-inside:avoid;">
                <div style="background:#f8f7f4;padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:13px;">${icon}</span>
                        <span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">${q.category}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        ${r ? `<span style="font-size:11px;font-weight:700;color:${color};background:${bg};padding:3px 10px;border-radius:999px;border:1px solid ${color}30;">${label}</span>` : ''}
                        <span style="font-size:11px;color:#9ca3af;font-weight:600;">Q${i + 1}</span>
                    </div>
                </div>
                <div style="padding:14px 16px 10px;">
                    <p style="font-size:13px;font-weight:600;color:#111827;margin:0 0 12px;line-height:1.5;">"${q.question.replace(/"/g, '&quot;')}"</p>
                    <div style="background:#1B2B4B0a;border:1px solid #1B2B4B20;border-radius:10px;padding:12px 14px;">
                        <p style="font-size:10px;font-weight:900;color:#1B2B4B;text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px;">Model Answer</p>
                        <p style="font-size:12px;color:#374151;line-height:1.65;margin:0;white-space:pre-line;">${q.answer.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                    </div>
                </div>
            </div>`;
        }).join('');

        const practiceList = practiceQs.length > 0 ? `
        <div style="margin-top:24px;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;break-inside:avoid;">
            <p style="font-size:11px;font-weight:900;color:#dc2626;text-transform:uppercase;letter-spacing:.08em;margin:0 0 12px;">📌 Focus on these before your interview</p>
            ${practiceQs.map((q) => {
                const qi = questions.indexOf(q);
                return `<div style="margin-bottom:8px;padding:10px 12px;background:white;border-radius:8px;border:1px solid #fecaca;">
                    <span style="font-size:10px;font-weight:700;color:#dc2626;">Q${qi + 1} · ${q.category}</span>
                    <p style="font-size:12px;color:#374151;margin:3px 0 0;line-height:1.4;">"${q.question.replace(/"/g, '&quot;')}"</p>
                </div>`;
            }).join('')}
        </div>` : '';

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Interview Practice Report — ${companyName || 'ProCV'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: white; color: #111827; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    @page { margin: 15mm 12mm; size: A4; }
  }
  .page { max-width: 760px; margin: 0 auto; padding: 32px 24px; }
</style>
</head>
<body>
<div class="page">
  <div style="background:#1B2B4B;border-radius:16px;padding:24px 28px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
    <div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="background:#C9A84C;color:#1B2B4B;font-weight:900;font-size:13px;padding:5px 10px;border-radius:8px;">ProCV</div>
        <span style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:500;">Your Personal Career Consultant</span>
      </div>
      <h1 style="color:white;font-size:22px;font-weight:900;line-height:1.2;margin-bottom:4px;">Interview Practice Report</h1>
      <p style="color:rgba(255,255,255,0.6);font-size:13px;">${companyName ? `Preparing for: <strong style="color:rgba(255,255,255,0.85)">${companyName}</strong> · ` : ''}${dateStr} at ${timeStr}</p>
    </div>
    <div style="text-align:right;flex-shrink:0;">
      <p style="color:rgba(255,255,255,0.5);font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px;">Readiness</p>
      <p style="color:${pctColor};font-size:32px;font-weight:900;line-height:1;">${pct}%</p>
      <p style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:2px;">${ratings.size} of ${questions.length} rated</p>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:24px;">
    ${[
      { label: 'Need Practice', count: practiceQs.length,  color: '#dc2626', bg: '#fef2f2' },
      { label: 'Getting There', count: ratings.size - practiceQs.length - confidentQs.length, color: '#d97706', bg: '#fffbeb' },
      { label: 'Confident',     count: confidentQs.length, color: '#059669', bg: '#f0fdf4' },
    ].map(row => `
    <div style="background:${row.bg};border-radius:10px;padding:12px;text-align:center;border:1px solid ${row.color}30;">
      <p style="font-size:24px;font-weight:900;color:${row.color};line-height:1;">${row.count}</p>
      <p style="font-size:11px;color:#6b7280;font-weight:600;margin-top:2px;">${row.label}</p>
    </div>`).join('')}
  </div>
  ${practiceList}
  <h2 style="font-size:13px;font-weight:900;color:#1B2B4B;text-transform:uppercase;letter-spacing:.08em;margin:${practiceQs.length > 0 ? '24px' : '0'} 0 12px;opacity:.7;">All Questions &amp; Model Answers</h2>
  ${questionRows}
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:11px;color:#9ca3af;">Generated by ProCV · procv.app</span>
    <span style="font-size:11px;color:#9ca3af;">${dateStr}</span>
  </div>
</div>
<script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html' });
        const url  = URL.createObjectURL(blob);
        const win  = window.open(url, '_blank');
        if (win) { setTimeout(() => URL.revokeObjectURL(url), 60000); }
    }, [questions, ratings, companyName]);

    // Derived rating data
    const ratingScale = [
        { score: 1, emoji: '😬', label: 'Struggled' },
        { score: 2, emoji: '😐', label: 'Unsure' },
        { score: 3, emoji: '🙂', label: 'OK' },
        { score: 4, emoji: '😊', label: 'Good' },
        { score: 5, emoji: '🔥', label: 'Nailed it' },
    ];
    const ratedCount    = ratings.size;
    const needsPractice = questions.filter((_, i) => (ratings.get(i) ?? 0) <= 2 && ratings.has(i));
    const confident     = questions.filter((_, i) => (ratings.get(i) ?? 0) >= 4 && ratings.has(i));
    const avgRating     = ratedCount > 0 ? (Array.from(ratings.values()) as number[]).reduce((a, b) => a + b, 0) / ratedCount : 0;
    const readinessPct  = ratedCount > 0 ? Math.round((avgRating / 5) * 100) : 0;

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

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">

            {/* ── Page header ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4">
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
                            AI-powered interview questions and model answers — tailored to your CV and the job
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Two-column layout ─────────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">

                {/* ═══════════════════════════════════════════════════════
                    LEFT COLUMN — sticky setup panel
                ════════════════════════════════════════════════════════ */}
                <div className="w-full lg:w-[400px] xl:w-[420px] lg:flex-shrink-0 lg:sticky lg:top-4">
                    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 shadow-sm overflow-hidden">

                        {/* Panel header */}
                        <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-700">
                            <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 tracking-tight">
                                Interview Setup
                            </h2>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Company */}
                            <div>
                                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
                                    Company <span className="font-normal text-zinc-400 dark:text-zinc-500">(Optional)</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 text-sm">🏢</span>
                                    <input
                                        type="text"
                                        value={companyName}
                                        onChange={e => setCompanyName(e.target.value)}
                                        placeholder="e.g. Google, Stripe, NHS…"
                                        className={`${inputClass} ${inputFocus} pl-8 pr-8`}
                                        disabled={isGenerating}
                                    />
                                    {companyName && (
                                        <button
                                            onClick={() => setCompanyName('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                                        >
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Question count */}
                            <div>
                                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
                                    Number of Questions
                                </label>
                                <div className="flex gap-2">
                                    {[5, 10, 15].map(n => (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setQuestionCount(n)}
                                            disabled={isGenerating}
                                            className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                                                questionCount === n
                                                    ? 'border-transparent text-white shadow-sm'
                                                    : 'border-zinc-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-neutral-500'
                                            }`}
                                            style={questionCount === n ? { background: NAV } : {}}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Job Description */}
                            <div>
                                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5">
                                    Job Description <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <textarea
                                        value={jobDescription}
                                        onChange={e => setJobDescription(e.target.value)}
                                        placeholder="Paste the full job description here — the AI will generate questions and model answers tailored to this specific role…"
                                        rows={7}
                                        className={`${inputClass} ${inputFocus} resize-none`}
                                        disabled={isGenerating}
                                    />
                                    <span className="absolute bottom-2 right-3 text-[10px] text-zinc-400 dark:text-zinc-600 pointer-events-none tabular-nums">
                                        {jobDescription.length} / 2000
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Tips card */}
                        <div className="mx-5 mb-5 rounded-xl border border-[#C9A84C]/30 dark:border-[#C9A84C]/20 bg-[#C9A84C]/8 dark:bg-[#C9A84C]/5 p-3.5">
                            <p className="flex items-center gap-1.5 text-xs font-bold mb-2"
                               style={{ color: GOLD }}>
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                                Tips
                            </p>
                            <ul className="space-y-1.5">
                                {[
                                    'Paste the full job description for best results',
                                    'The more specific, the more relevant the questions',
                                    'Questions are tailored to your CV and target role',
                                ].map(tip => (
                                    <li key={tip} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                                        <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                                            <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                        {tip}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Errors / warnings */}
                        {error && (
                            <div className="mx-5 mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                                {error}
                            </div>
                        )}
                        {!apiKeySet && (
                            <div className="mx-5 mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                                An API key is required.{' '}
                                <button onClick={openSettings} className="font-bold underline hover:no-underline">Open Settings →</button>
                            </div>
                        )}

                        {/* Generate button */}
                        <div className="px-5 pb-5 space-y-2">
                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating || !apiKeySet}
                                className="w-full py-3 px-6 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99]"
                                style={{ background: GOLD, color: '#1a1a1a' }}
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
                                    <>
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                            <line x1="12" y1="19" x2="12" y2="23"/>
                                            <line x1="8" y1="23" x2="16" y2="23"/>
                                        </svg>
                                        Generate {questionCount} Questions
                                    </>
                                )}
                            </button>
                            {isGenerating && (
                                <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
                                    ⏳ This may take a few seconds
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════
                    RIGHT COLUMN — questions panel
                ════════════════════════════════════════════════════════ */}
                <div className="flex-1 min-w-0 space-y-4">

                    {/* Empty state */}
                    {questions.length === 0 && !isGenerating && (
                        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-700 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ color: GOLD }}>
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                    </svg>
                                    <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Generated Interview Questions</h2>
                                </div>
                            </div>
                            <div className="py-16 px-8 text-center">
                                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl"
                                     style={{ background: NAV + '12' }}>
                                    🎤
                                </div>
                                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Ready when you are</p>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-xs mx-auto leading-relaxed">
                                    Fill in the setup form and hit Generate to get {questionCount} tailored questions with model answers.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Loading skeleton */}
                    {isGenerating && (
                        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-700 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ color: GOLD }}>
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                    </svg>
                                    <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Generated Interview Questions</h2>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <svg className="animate-spin h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                    </svg>
                                    <span className="text-xs text-zinc-400 dark:text-zinc-500">{loadingMsg}</span>
                                </div>
                            </div>
                            <div className="divide-y divide-zinc-100 dark:divide-neutral-700">
                                {Array.from({ length: questionCount }).map((_, i) => (
                                    <div key={i} className="px-5 py-4 flex items-center gap-4">
                                        <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-neutral-700 animate-pulse flex-shrink-0" />
                                        <div className="flex-1 h-4 rounded-lg bg-zinc-100 dark:bg-neutral-700 animate-pulse" style={{ width: `${60 + (i % 3) * 15}%` }} />
                                        <div className="w-4 h-4 rounded bg-zinc-100 dark:bg-neutral-700 animate-pulse flex-shrink-0" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Questions list */}
                    {questions.length > 0 && (
                        <>
                            {/* Mock mode toggle + controls row */}
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        onClick={() => { setMockMode(v => !v); setMockIndex(0); setRevealedAnswers(new Set()); }}
                                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                                            mockMode
                                                ? 'text-white border-transparent'
                                                : 'border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-800 bg-white dark:bg-neutral-800'
                                        }`}
                                        style={mockMode ? { background: NAV } : {}}
                                        title="Practice one question at a time without seeing answers upfront"
                                    >
                                        🎭 {mockMode ? 'Exit Mock Mode' : 'Mock Mode'}
                                    </button>
                                    {!mockMode && (
                                        <>
                                            <button
                                                onClick={revealAll}
                                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors bg-white dark:bg-neutral-800"
                                                style={{ background: GOLD + '18', borderColor: GOLD + '40', color: '#92400e' }}
                                            >
                                                Show All
                                            </button>
                                            <button
                                                onClick={hideAll}
                                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-800 bg-white dark:bg-neutral-800 transition-colors"
                                            >
                                                Hide All
                                            </button>
                                        </>
                                    )}
                                </div>
                                {ratedCount > 0 && (
                                    <button
                                        onClick={exportPracticeReport}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:opacity-90 active:scale-95"
                                        style={{ background: NAV, color: '#fff', borderColor: NAV }}
                                    >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                                        </svg>
                                        Export PDF
                                    </button>
                                )}
                            </div>

                            {/* ── Mock Mode view ──────────────────────────────── */}
                            {mockMode && (() => {
                                const q = filtered[mockIndex] ?? filtered[0];
                                if (!q) return null;
                                const gi = questions.indexOf(q);
                                const isRevealed = revealedAnswers.has(gi);
                                const color = categoryColors[q.category as Category] || categoryColors.Strength;
                                const icon  = categoryIcons[q.category as Category] || '💡';
                                return (
                                    <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                                        <div className="px-5 pt-4 pb-2">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${color}`}>
                                                    {icon} {q.category}
                                                </span>
                                                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                                                    {mockIndex + 1} / {filtered.length}
                                                </span>
                                            </div>
                                            <div className="w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-1">
                                                <div
                                                    className="h-1 rounded-full transition-all duration-300"
                                                    style={{ width: `${((mockIndex + 1) / filtered.length) * 100}%`, background: NAV }}
                                                />
                                            </div>
                                        </div>
                                        <div className="p-5">
                                            <p className="text-base font-semibold text-zinc-800 dark:text-zinc-200 leading-snug mb-5">
                                                "{q.question}"
                                            </p>
                                            {!isRevealed ? (
                                                <div className="space-y-3">
                                                    <p className="text-xs text-zinc-400 dark:text-zinc-500 italic text-center">
                                                        Think through your answer, then reveal the model response.
                                                    </p>
                                                    <button
                                                        onClick={() => toggleAnswer(gi)}
                                                        className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors"
                                                        style={{ borderColor: GOLD + '60', color: '#92400e' }}
                                                    >
                                                        Reveal model answer →
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="rounded-xl border p-4 mb-4"
                                                     style={{ background: NAV + '08', borderColor: NAV + '25' }}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-black uppercase tracking-wider" style={{ color: GOLD }}>Model Answer</span>
                                                        <CopyButton text={q.answer} />
                                                    </div>
                                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">{q.answer}</p>
                                                </div>
                                            )}
                                            {isRevealed && (
                                                <div className="rounded-xl border border-zinc-100 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-800/40 px-4 py-3 mb-4">
                                                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-wide">How did you do?</p>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {ratingScale.map(r => {
                                                            const isSelected = ratings.get(gi) === r.score;
                                                            return (
                                                                <button key={r.score} onClick={() => rateQuestion(gi, r.score)} title={r.label}
                                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${isSelected ? 'border-transparent text-white scale-105 shadow-sm' : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'}`}
                                                                    style={isSelected ? { background: r.score <= 2 ? '#dc2626' : r.score === 3 ? '#d97706' : NAV } : {}}>
                                                                    <span className="text-base leading-none">{r.emoji}</span>
                                                                    <span className="hidden sm:inline">{r.label}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => { setMockIndex(i => Math.max(0, i - 1)); setRevealedAnswers(new Set()); }}
                                                    disabled={mockIndex === 0}
                                                    className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-neutral-800 transition-colors"
                                                >
                                                    ← Previous
                                                </button>
                                                {mockIndex < filtered.length - 1 ? (
                                                    <button
                                                        onClick={() => { setMockIndex(i => i + 1); setRevealedAnswers(new Set()); }}
                                                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
                                                        style={{ background: NAV }}
                                                    >
                                                        Next →
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => setMockMode(false)}
                                                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
                                                        style={{ background: '#059669' }}
                                                    >
                                                        ✅ Finish Mock
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Accordion question list */}
                            <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 shadow-sm overflow-hidden">

                                {/* Panel header */}
                                <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-700 flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ color: GOLD }}>
                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                        </svg>
                                        <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Generated Interview Questions</h2>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {/* Category filter pills */}
                                        {categories.length > 2 && categories.map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => setActiveFilter(cat)}
                                                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                                                    activeFilter === cat
                                                        ? 'text-white border-transparent'
                                                        : 'bg-white dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-600'
                                                }`}
                                                style={activeFilter === cat ? { background: NAV, borderColor: NAV } : {}}
                                            >
                                                {cat !== 'All' && `${categoryIcons[cat as Category]} `}{cat}
                                            </button>
                                        ))}
                                        {/* Badge */}
                                        <span className="text-xs font-bold px-2.5 py-1 rounded-full border"
                                              style={{ background: GOLD + '18', borderColor: GOLD + '40', color: '#92400e' }}>
                                            {questions.length} Questions Generated
                                        </span>
                                    </div>
                                </div>

                                {/* Accordion rows */}
                                <div className="divide-y divide-zinc-100 dark:divide-neutral-700">
                                    {filtered.map((q) => {
                                        const globalIdx  = questions.indexOf(q);
                                        const isRevealed = revealedAnswers.has(globalIdx);
                                        const color = categoryColors[q.category as Category] || categoryColors.Strength;
                                        const icon  = categoryIcons[q.category as Category] || '💡';
                                        const hints = starHints[q.category as Category] ?? starHints.Behavioural;
                                        const isStarOpen = starOpen.has(globalIdx);
                                        const letterColors = ['#1B2B4B', '#C9A84C', '#1B2B4B', '#C9A84C'];

                                        return (
                                            <div key={globalIdx}>
                                                {/* Row trigger */}
                                                <button
                                                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-neutral-700/40 transition-colors text-left group"
                                                    onClick={() => toggleAnswer(globalIdx)}
                                                >
                                                    {/* Number circle */}
                                                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors"
                                                          style={isRevealed
                                                              ? { background: NAV, color: '#fff' }
                                                              : { background: 'var(--tw-ring-color, #f4f4f5)', color: '#71717a' }}
                                                          onMouseEnter={e => { if (!isRevealed) { (e.currentTarget as HTMLElement).style.background = NAV + '15'; } }}
                                                          onMouseLeave={e => { if (!isRevealed) { (e.currentTarget as HTMLElement).style.background = ''; } }}>
                                                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                                                            isRevealed
                                                                ? ''
                                                                : 'bg-zinc-100 dark:bg-neutral-700 text-zinc-500 dark:text-zinc-400 group-hover:bg-zinc-200 dark:group-hover:bg-neutral-600'
                                                        }`}
                                                              style={isRevealed ? { background: NAV, color: '#fff' } : {}}>
                                                            {globalIdx + 1}
                                                        </span>
                                                    </span>
                                                    {/* Question text */}
                                                    <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-snug">
                                                        {q.question}
                                                    </span>
                                                    {/* Chevron */}
                                                    <svg
                                                        className={`w-4 h-4 flex-shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform duration-200 ${isRevealed ? 'rotate-180' : ''}`}
                                                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                                        <polyline points="6 9 12 15 18 9"/>
                                                    </svg>
                                                </button>

                                                {/* Expanded content */}
                                                {isRevealed && (
                                                    <div className="px-5 pb-5 space-y-3"
                                                         style={{ background: 'var(--tw-bg, rgba(0,0,0,0.01))' }}>

                                                        {/* Category chip */}
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${color}`}>
                                                                {icon} {q.category}
                                                            </span>
                                                        </div>

                                                        {/* Model answer */}
                                                        <div className="rounded-xl border p-4"
                                                             style={{ background: NAV + '06', borderColor: NAV + '20' }}>
                                                            <div className="flex items-center justify-between mb-2.5">
                                                                <span className="text-xs font-black uppercase tracking-wider"
                                                                      style={{ color: GOLD }}>
                                                                    Model Answer
                                                                </span>
                                                                <CopyButton text={q.answer} />
                                                            </div>
                                                            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                                                                {q.answer}
                                                            </p>
                                                        </div>

                                                        {/* STAR guide */}
                                                        <div>
                                                            <button
                                                                onClick={e => { e.stopPropagation(); toggleStar(globalIdx); }}
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
                                                                <div className="grid grid-cols-2 gap-1.5 mb-2">
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

                                                        {/* Self-rating widget */}
                                                        <div className="rounded-xl border border-zinc-100 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/60 px-4 py-3">
                                                            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2.5 uppercase tracking-wide">
                                                                How did you do?
                                                            </p>
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                {ratingScale.map(r => {
                                                                    const isSelected = ratings.get(globalIdx) === r.score;
                                                                    return (
                                                                        <button
                                                                            key={r.score}
                                                                            onClick={e => { e.stopPropagation(); rateQuestion(globalIdx, r.score); }}
                                                                            title={r.label}
                                                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                                                                                isSelected
                                                                                    ? 'border-transparent text-white scale-105 shadow-sm'
                                                                                    : 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-neutral-600'
                                                                            }`}
                                                                            style={isSelected ? {
                                                                                background: r.score <= 2 ? '#dc2626' : r.score === 3 ? '#d97706' : NAV,
                                                                            } : {}}
                                                                        >
                                                                            <span className="text-base leading-none">{r.emoji}</span>
                                                                            <span className="hidden sm:inline">{r.label}</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                                {ratings.has(globalIdx) && (
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); rateQuestion(globalIdx, 0); }}
                                                                        className="text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 ml-1 transition-colors"
                                                                    >
                                                                        clear
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Status footer bar */}
                                <div className="px-5 py-3 border-t border-zinc-100 dark:border-neutral-700 flex items-center justify-between gap-3 flex-wrap"
                                     style={{ background: GOLD + '08' }}>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                        <span className="mr-1" style={{ color: GOLD }}>ⓘ</span>
                                        Tailored to your CV and the job description
                                        <span className="mx-1.5 text-zinc-300 dark:text-neutral-600">•</span>
                                        Practice confidently
                                        <span className="mx-1.5 text-zinc-300 dark:text-neutral-600">•</span>
                                        Be authentic
                                    </p>
                                    <span className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0">
                                        Generated just now
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                    </span>
                                </div>
                            </div>

                            {/* ── Practice Summary ──────────────────────────── */}
                            {ratedCount > 0 && (
                                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
                                    <div className="px-5 py-4 border-b border-zinc-100 dark:border-neutral-800"
                                         style={{ background: NAV + '08' }}>
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div>
                                                <h3 className="text-sm font-black text-zinc-800 dark:text-zinc-100"
                                                    style={{ fontFamily: "'Playfair Display', serif" }}>
                                                    Practice Summary
                                                </h3>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                                    {ratedCount} of {questions.length} questions self-assessed
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <p className="text-xs text-zinc-400 dark:text-zinc-500">Readiness</p>
                                                    <p className="text-xl font-black leading-none"
                                                       style={{ color: readinessPct >= 70 ? '#059669' : readinessPct >= 45 ? '#d97706' : '#dc2626' }}>
                                                        {readinessPct}%
                                                    </p>
                                                </div>
                                                <svg className="w-12 h-12 -rotate-90 flex-shrink-0" viewBox="0 0 48 48">
                                                    <circle cx="24" cy="24" r="18" fill="none" stroke="#e5e7eb" strokeWidth="5" className="dark:stroke-neutral-700"/>
                                                    <circle cx="24" cy="24" r="18" fill="none"
                                                        stroke={readinessPct >= 70 ? '#059669' : readinessPct >= 45 ? '#d97706' : '#dc2626'}
                                                        strokeWidth="5"
                                                        strokeDasharray={`${(readinessPct / 100) * 2 * Math.PI * 18} ${2 * Math.PI * 18}`}
                                                        strokeLinecap="round"
                                                        className="transition-all duration-700"/>
                                                </svg>
                                            </div>
                                        </div>
                                        <div className="mt-3 w-full bg-zinc-100 dark:bg-neutral-700 rounded-full h-1.5">
                                            <div className="h-1.5 rounded-full transition-all duration-500"
                                                 style={{ width: `${(ratedCount / questions.length) * 100}%`, background: NAV }}/>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 divide-x divide-zinc-100 dark:divide-neutral-800">
                                        {[
                                            { label: 'Need Practice', count: needsPractice.length, color: '#dc2626', emoji: '📌' },
                                            { label: 'Getting There', count: ratedCount - needsPractice.length - confident.length, color: '#d97706', emoji: '📈' },
                                            { label: 'Confident', count: confident.length, color: '#059669', emoji: '✅' },
                                        ].map(row => (
                                            <div key={row.label} className="py-3 px-4 text-center">
                                                <div className="text-lg font-black" style={{ color: row.color }}>{row.count}</div>
                                                <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium leading-tight mt-0.5">{row.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {needsPractice.length > 0 && (
                                        <div className="border-t border-zinc-100 dark:border-neutral-800 px-5 py-4">
                                            <p className="text-xs font-black uppercase tracking-wider text-red-500 mb-2.5">📌 Focus on these</p>
                                            <div className="space-y-2">
                                                {needsPractice.map(q => {
                                                    const qi = questions.indexOf(q);
                                                    const r = ratingScale.find(rs => rs.score === ratings.get(qi));
                                                    return (
                                                        <div key={qi} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                                                            <span className="text-base flex-shrink-0 mt-0.5">{r?.emoji ?? '😬'}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="text-[10px] font-bold text-red-400 uppercase">Q{qi + 1} · {q.category}</span>
                                                                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug mt-0.5 line-clamp-2">"{q.question}"</p>
                                                            </div>
                                                            <button
                                                                onClick={() => { toggleAnswer(qi); setStarOpen(prev => { const n = new Set(prev); n.delete(qi); return n; }); }}
                                                                className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors text-white"
                                                                style={{ background: NAV }}
                                                            >
                                                                Review
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    {ratedCount === questions.length && needsPractice.length === 0 && (
                                        <div className="border-t border-zinc-100 dark:border-neutral-800 px-5 py-4 text-center">
                                            <p className="text-2xl mb-1">🎉</p>
                                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">You're interview-ready!</p>
                                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">You rated yourself 3+ on every question. Go get that job.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Regenerate */}
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
                        </>
                    )}
                </div>
            </div>

            {/* ── Thank-You Letter (full width) ────────────────────────────── */}
            {questions.length > 0 && (
                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
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
            )}
        </div>
    );
};

export default InterviewPrep;
