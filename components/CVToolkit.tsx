import React, { useState, useCallback } from 'react';
import { UserProfile, ScrapedJob } from '../types';
import {
    checkCVAgainstJob, CVCheckResult,
    generateSmartCoverLetter,
    paraphraseText, ParaphraseTone,
} from '../services/geminiService';
import { researchCompany } from '../services/tavilyService';
import { downloadCoverLetterAsPDF } from '../services/pdfService';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Button } from './ui/Button';
import {
    CheckCircle, AlertCircle, Sparkles, RefreshCw, Download,
    Target, Shield, FileText, ExternalLink,
} from './icons';
import WordImportPanel from './WordImportPanel';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CVToolkitProps {
    userProfile: UserProfile;
    apiKeySet: boolean;
    tavilyApiKey: string | null | undefined;
    openSettings: () => void;
    selectedJob?: ScrapedJob | null;
    /** Navigate to CV Generator, optionally with extra instructions */
    onGoToGenerator?: (extraInstructions?: string) => void;
    /** Called when user imports a profile from Word */
    onProfileImported?: (profile: UserProfile) => void;
}

type ToolTab = 'checker' | 'cover-letter' | 'paraphrase' | 'word-import';

const TONE_OPTIONS: { id: ParaphraseTone; label: string; emoji: string; desc: string }[] = [
    { id: 'professional', label: 'Professional', emoji: '👔', desc: 'Polished, executive tone' },
    { id: 'concise', label: 'Concise', emoji: '✂️', desc: 'Cut 30-40% filler, keep impact' },
    { id: 'creative', label: 'Creative', emoji: '✨', desc: 'Vivid, memorable language' },
    { id: 'ats-friendly', label: 'ATS-Friendly', emoji: '🤖', desc: 'Keyword-rich, scanner-optimized' },
];

// ─── Score Ring ─────────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number; label: string; size?: number }> = ({ score, label, size = 100 }) => {
    const radius = (size - 12) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
    return (
        <div className="flex flex-col items-center gap-1">
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-zinc-200 dark:text-neutral-700" />
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 1s ease' }} />
            </svg>
            <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
                <span className="text-2xl font-black" style={{ color }}>{score}</span>
            </div>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mt-1">{label}</span>
        </div>
    );
};

// ─── Keyword Pill ──────────────────────────────────────────────────────────────

const KeywordPill: React.FC<{ word: string; matched: boolean }> = ({ word, matched }) => (
    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mr-1.5 mb-1.5 ${matched
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
        }`}>
        {matched ? '✓' : '✗'} {word}
    </span>
);

// ─── Word icon for the tab ─────────────────────────────────────────────────────

const WordDocIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
    </svg>
);

// ─── Main Component ────────────────────────────────────────────────────────────

const CVToolkit: React.FC<CVToolkitProps> = ({
    userProfile, apiKeySet, tavilyApiKey, openSettings, selectedJob,
    onGoToGenerator, onProfileImported,
}) => {
    const [activeTab, setActiveTab] = useLocalStorage<ToolTab>('toolkit_tab', 'checker');
    const [jobDescription, setJobDescription] = useLocalStorage<string>('toolkit_jd', selectedJob?.jobDescription || '');

    // ── Checker state ──
    const [checkResult, setCheckResult] = useState<CVCheckResult | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [checkError, setCheckError] = useState<string | null>(null);

    // ── Cover Letter state ──
    const [coverLetter, setCoverLetter] = useLocalStorage<string>('toolkit_cl', '');
    const [isGeneratingCL, setIsGeneratingCL] = useState(false);
    const [clError, setClError] = useState<string | null>(null);
    const [useCompanyResearch, setUseCompanyResearch] = useState(true);

    // ── Paraphraser state ──
    const [inputText, setInputText] = useState('');
    const [outputText, setOutputText] = useState('');
    const [selectedTone, setSelectedTone] = useState<ParaphraseTone>('professional');
    const [isParaphrasing, setIsParaphrasing] = useState(false);

    // Update JD when selectedJob changes
    React.useEffect(() => {
        if (selectedJob?.jobDescription) {
            setJobDescription(selectedJob.jobDescription);
        }
    }, [selectedJob]);

    // ── Check CV ──
    const handleCheck = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        if (!jobDescription.trim()) return;
        setIsChecking(true);
        setCheckError(null);
        try {
            const result = await checkCVAgainstJob(userProfile, jobDescription);
            setCheckResult(result);
        } catch (e) {
            setCheckError(e instanceof Error ? e.message : 'CV check failed.');
        } finally {
            setIsChecking(false);
        }
    }, [apiKeySet, jobDescription, userProfile, openSettings]);

    // ── Fix & Regenerate ──
    const handleFixAndRegenerate = useCallback(() => {
        if (!checkResult) return;
        const missingKws = checkResult.missingKeywords.join(', ');
        const weaknesses = checkResult.weaknesses.join('; ');
        const instructions = `IMPORTANT — Fix these issues found by the CV Checker:\n- Missing keywords to add: ${missingKws}\n- Weaknesses to address: ${weaknesses}\n- Overall suggestions: ${checkResult.suggestions.join('; ')}`;
        onGoToGenerator?.(instructions);
    }, [checkResult, onGoToGenerator]);

    // ── Generate Cover Letter ──
    const handleGenerateCL = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        if (!jobDescription.trim()) return;
        setIsGeneratingCL(true);
        setClError(null);
        try {
            let companyInfo = '';
            if (useCompanyResearch && tavilyApiKey && selectedJob?.company) {
                try {
                    companyInfo = await researchCompany(selectedJob.company, selectedJob.title, tavilyApiKey);
                } catch { /* continue without research */ }
            }
            const letter = await generateSmartCoverLetter(userProfile, jobDescription, companyInfo);
            setCoverLetter(letter);
        } catch (e) {
            setClError(e instanceof Error ? e.message : 'Cover letter generation failed.');
        } finally {
            setIsGeneratingCL(false);
        }
    }, [apiKeySet, jobDescription, userProfile, selectedJob, tavilyApiKey, useCompanyResearch, openSettings, setCoverLetter]);

    // ── Paraphrase ──
    const handleParaphrase = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        if (!inputText.trim()) return;
        setIsParaphrasing(true);
        try {
            const result = await paraphraseText(inputText, selectedTone, jobDescription);
            setOutputText(result);
        } catch {
            setOutputText('Paraphrasing failed. Please try again.');
        } finally {
            setIsParaphrasing(false);
        }
    }, [apiKeySet, inputText, selectedTone, jobDescription, openSettings]);

    const handleDownloadCL = useCallback(() => {
        if (!coverLetter) return;
        const fileName = `Cover_Letter_${selectedJob?.company || 'Application'}.pdf`;
        downloadCoverLetterAsPDF(coverLetter, fileName, 'modern', userProfile.personalInfo);
    }, [coverLetter, userProfile, selectedJob]);

    // ─── TABS ──
    const tabs = [
        { id: 'checker' as ToolTab, label: 'CV Checker', emoji: '🔍' },
        { id: 'cover-letter' as ToolTab, label: 'Cover Letter', emoji: '✉️' },
        { id: 'paraphrase' as ToolTab, label: 'Paraphraser', emoji: '🔄' },
        { id: 'word-import' as ToolTab, label: 'Word Import', emoji: '📄' },
    ];

    const hasProfile = !!(userProfile?.personalInfo?.name);
    const activeJobName = selectedJob ? `${selectedJob.title} @ ${selectedJob.company}` : null;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Sparkles className="h-6 w-6 text-violet-500" /> CV Toolkit
                    </h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Check, optimize, generate documents — and import from Word
                    </p>
                </div>
                {/* Live status banner */}
                <div className="flex flex-wrap gap-2">
                    {hasProfile && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                            {userProfile.personalInfo.name || 'Profile active'}
                        </div>
                    )}
                    {activeJobName && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300">
                            <Target className="h-3 w-3 shrink-0" />
                            {activeJobName}
                        </div>
                    )}
                    {onGoToGenerator && (
                        <button
                            onClick={() => onGoToGenerator()}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 text-zinc-600 dark:text-zinc-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-700 dark:hover:text-violet-300 hover:border-violet-300 transition-all"
                        >
                            <FileText className="h-3 w-3" /> Go to Generator
                        </button>
                    )}
                </div>
            </div>

            {/* Tab switcher */}
            <div className="flex flex-wrap gap-1 bg-zinc-100 dark:bg-neutral-800 p-1 rounded-xl w-fit max-w-full">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${activeTab === t.id
                            ? 'bg-white dark:bg-neutral-700 shadow text-zinc-900 dark:text-zinc-100'
                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                            }`}>
                        <span>{t.emoji}</span>
                        <span className="hidden sm:inline">{t.label}</span>
                        <span className="sm:hidden">{t.label.split(' ')[0]}</span>
                    </button>
                ))}
            </div>

            {/* JD Input (shared across checker, cover-letter, paraphrase tabs) */}
            {activeTab !== 'word-import' && (
                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-4">
                    <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">
                        📋 Job Description{' '}
                        {selectedJob && (
                            <span className="text-violet-500 font-normal">(from: {selectedJob.title} @ {selectedJob.company})</span>
                        )}
                    </label>
                    <textarea
                        value={jobDescription}
                        onChange={e => setJobDescription(e.target.value)}
                        placeholder="Paste the job description here to analyze your CV, generate a cover letter, or paraphrase content…"
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-900 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-violet-400 text-zinc-800 dark:text-zinc-200"
                    />
                    {activeTab === 'cover-letter' && jobDescription.trim() && onGoToGenerator && (
                        <div className="mt-2 flex justify-end">
                            <button
                                onClick={() => onGoToGenerator()}
                                className="text-xs text-violet-600 dark:text-violet-400 font-semibold flex items-center gap-1 hover:underline"
                            >
                                <ExternalLink className="h-3 w-3" /> Use this JD in CV Generator
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ══ CV CHECKER ══ */}
            {activeTab === 'checker' && (
                <div className="space-y-4">
                    <Button
                        onClick={handleCheck}
                        disabled={isChecking || !jobDescription.trim()}
                        className="bg-violet-600 hover:bg-violet-700 text-white border-0 shadow shadow-violet-500/20 rounded-xl px-6"
                    >
                        {isChecking
                            ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Analyzing…</>
                            : <><Shield className="h-4 w-4 mr-2" />Check My CV Against This JD</>}
                    </Button>

                    {checkError && (
                        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0" /> {checkError}
                        </div>
                    )}

                    {checkResult && (
                        <div className="space-y-5">
                            {/* Score cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5 flex items-center gap-5">
                                    <div className="relative">
                                        <ScoreRing score={checkResult.overallScore} label="Match Score" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Overall Match</h3>
                                        <p className="text-xs text-zinc-500 mt-1">{checkResult.summary}</p>
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5 flex items-center gap-5">
                                    <div className="relative">
                                        <ScoreRing score={checkResult.atsScore} label="ATS Score" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100">ATS Compatibility</h3>
                                        <p className="text-xs text-zinc-500 mt-1">
                                            {checkResult.atsScore >= 70 ? 'Your CV should pass most ATS filters.' :
                                                checkResult.atsScore >= 50 ? 'Some ATS systems may miss key information.' :
                                                    'High risk of being filtered out. Add missing keywords.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Fix & Regenerate CTA */}
                            {(checkResult.missingKeywords.length > 0 || checkResult.weaknesses.length > 0) && onGoToGenerator && (
                                <div className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200 dark:border-violet-800 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                    <div className="flex-1">
                                        <h3 className="font-bold text-violet-900 dark:text-violet-100 flex items-center gap-2">
                                            <Sparkles className="h-4 w-4 text-violet-500" /> Ready to fix these issues?
                                        </h3>
                                        <p className="text-xs text-violet-700 dark:text-violet-300 mt-1">
                                            The AI found <strong>{checkResult.missingKeywords.length}</strong> missing keywords and <strong>{checkResult.weaknesses.length}</strong> weaknesses.
                                            Click below to regenerate your CV with these fixes applied automatically.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={handleFixAndRegenerate}
                                        className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl px-5 whitespace-nowrap shadow shadow-violet-500/20 flex-shrink-0"
                                    >
                                        <RefreshCw className="h-4 w-4 mr-2" /> Fix &amp; Regenerate CV
                                    </Button>
                                </div>
                            )}

                            {/* Keywords */}
                            <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
                                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 mb-3">🔑 Keyword Analysis</h3>
                                <div className="mb-3">
                                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5">
                                        ✓ Matched ({checkResult.matchedKeywords.length})
                                    </p>
                                    <div className="flex flex-wrap">
                                        {checkResult.matchedKeywords.map(k => <KeywordPill key={k} word={k} matched />)}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1.5">
                                        ✗ Missing ({checkResult.missingKeywords.length}) — add these to your CV
                                    </p>
                                    <div className="flex flex-wrap">
                                        {checkResult.missingKeywords.map(k => <KeywordPill key={k} word={k} matched={false} />)}
                                    </div>
                                </div>
                            </div>

                            {/* Strengths & Weaknesses */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
                                    <h3 className="font-bold text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
                                        <CheckCircle className="h-4 w-4" /> Strengths
                                    </h3>
                                    <ul className="space-y-2">
                                        {checkResult.strengths.map((s, i) => (
                                            <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300 flex items-start gap-2">
                                                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span> {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
                                    <h3 className="font-bold text-rose-600 dark:text-rose-400 mb-3 flex items-center gap-1.5">
                                        <AlertCircle className="h-4 w-4" /> Weaknesses
                                    </h3>
                                    <ul className="space-y-2">
                                        {checkResult.weaknesses.map((w, i) => (
                                            <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300 flex items-start gap-2">
                                                <span className="text-rose-500 mt-0.5 shrink-0">✗</span> {w}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Suggestions */}
                            <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
                                <h3 className="font-bold text-violet-600 dark:text-violet-400 mb-3 flex items-center gap-1.5">
                                    <Sparkles className="h-4 w-4" /> Suggestions to Improve
                                </h3>
                                <ul className="space-y-2">
                                    {checkResult.suggestions.map((s, i) => (
                                        <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300 flex items-start gap-2">
                                            <span className="text-violet-500 font-bold mt-0.5 shrink-0">{i + 1}.</span> {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══ COVER LETTER ══ */}
            {activeTab === 'cover-letter' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-3 items-center">
                        <Button
                            onClick={handleGenerateCL}
                            disabled={isGeneratingCL || !jobDescription.trim()}
                            className="bg-violet-600 hover:bg-violet-700 text-white border-0 shadow shadow-violet-500/20 rounded-xl px-6"
                        >
                            {isGeneratingCL
                                ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Writing…</>
                                : <><FileText className="h-4 w-4 mr-2" />Generate Smart Cover Letter</>}
                        </Button>
                        {tavilyApiKey && (
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={useCompanyResearch}
                                    onChange={e => setUseCompanyResearch(e.target.checked)}
                                    className="rounded border-zinc-300 text-violet-600 focus:ring-violet-400"
                                />
                                <span className="text-zinc-600 dark:text-zinc-400">🔍 Research company with Tavily <span className="text-zinc-400 text-xs">(1 credit)</span></span>
                            </label>
                        )}
                    </div>

                    {clError && (
                        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0" /> {clError}
                        </div>
                    )}

                    {coverLetter && (
                        <div className="bg-white dark:bg-neutral-800 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                    ✉️ Your Cover Letter
                                </h3>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => navigator.clipboard.writeText(coverLetter)}
                                        className="text-xs rounded-xl border border-zinc-200 dark:border-neutral-700 px-3 h-8"
                                    >
                                        📋 Copy
                                    </Button>
                                    <Button
                                        onClick={handleDownloadCL}
                                        className="text-xs bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl px-3 h-8"
                                    >
                                        <Download className="h-3.5 w-3.5 mr-1" /> PDF
                                    </Button>
                                </div>
                            </div>
                            <div className="bg-zinc-50 dark:bg-neutral-900 rounded-xl p-5 max-h-[500px] overflow-y-auto">
                                <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
                                    {coverLetter}
                                </pre>
                            </div>
                            {onGoToGenerator && (
                                <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-neutral-700">
                                    <p className="text-xs text-zinc-400 flex items-center gap-1">
                                        <Sparkles className="h-3 w-3" /> Generated with AI · Review before sending
                                    </p>
                                    <button
                                        onClick={() => onGoToGenerator()}
                                        className="text-xs text-violet-600 dark:text-violet-400 font-semibold flex items-center gap-1 hover:underline"
                                    >
                                        <ExternalLink className="h-3 w-3" /> Open CV Generator
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ══ PARAPHRASER ══ */}
            {activeTab === 'paraphrase' && (
                <div className="space-y-4">
                    {/* Tone selector */}
                    <div className="flex flex-wrap gap-2">
                        {TONE_OPTIONS.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedTone(t.id)}
                                title={t.desc}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${selectedTone === t.id
                                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                                    : 'border-zinc-200 dark:border-neutral-700 text-zinc-500 hover:border-violet-300'
                                    }`}>
                                <span>{t.emoji}</span> {t.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-zinc-400">
                        {TONE_OPTIONS.find(t => t.id === selectedTone)?.desc}
                        {jobDescription.trim() && ' · Will also consider the JD for context'}
                    </p>

                    {/* Input / Output side by side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">
                                📝 Original Text
                            </label>
                            <textarea
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                placeholder="Paste a bullet point, summary paragraph, or any section of your CV here…"
                                rows={8}
                                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-900 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-violet-400 text-zinc-800 dark:text-zinc-200"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 block">
                                ✨ Paraphrased Output
                            </label>
                            <div className="relative">
                                <textarea
                                    value={outputText}
                                    readOnly
                                    placeholder="Your paraphrased result will appear here…"
                                    rows={8}
                                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-900 text-sm resize-y focus:outline-none text-zinc-800 dark:text-zinc-200"
                                />
                                {outputText && (
                                    <button
                                        onClick={() => navigator.clipboard.writeText(outputText)}
                                        className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 bg-white dark:bg-neutral-700 border border-zinc-200 dark:border-neutral-600 rounded-lg text-zinc-500 hover:text-violet-600 transition-colors"
                                    >
                                        Copy
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 items-center flex-wrap">
                        <Button
                            onClick={handleParaphrase}
                            disabled={isParaphrasing || !inputText.trim()}
                            className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl px-6 shadow shadow-violet-500/20"
                        >
                            {isParaphrasing
                                ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Paraphrasing…</>
                                : <>✨ Paraphrase</>}
                        </Button>
                        {outputText && onGoToGenerator && (
                            <button
                                onClick={() => onGoToGenerator(`Use this improved phrasing in the CV: "${outputText.slice(0, 300)}"`)}
                                className="text-xs text-violet-600 dark:text-violet-400 font-semibold flex items-center gap-1 hover:underline"
                            >
                                <ExternalLink className="h-3 w-3" /> Use in CV Generator
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ══ WORD IMPORT ══ */}
            {activeTab === 'word-import' && (
                <WordImportPanel
                    apiKeySet={apiKeySet}
                    openSettings={openSettings}
                    onProfileImported={(profile) => {
                        onProfileImported?.(profile);
                    }}
                />
            )}
        </div>
    );
};

export default CVToolkit;
