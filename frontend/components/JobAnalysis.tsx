import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { analyzeJobEnhanced, optimizeCVForJob, generateInterviewQA } from '../services/geminiService';
import { semanticMatch, chunkProfileText, SemanticMatchEntry } from '../services/cvEngineClient';
import { JobAnalysisResult, EnhancedJobAnalysis, MatchGrade, STARStory, CVData } from '../types';
import { CheckCircle } from './icons';

interface JobAnalysisProps {
    jobDescription: string;
    cvTextContent: string;
    apiKeySet: boolean;
    onAnalysisComplete?: (result: JobAnalysisResult) => void;
    onSaveStories?: (stories: STARStory[]) => void;
    currentCV?: CVData | null;
    onCVUpdate?: (cv: CVData) => void;
}

const GRADE_CONFIG: Record<MatchGrade, { label: string; color: string; bg: string; ring: string }> = {
    A: { label: 'Excellent Fit', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30', ring: 'ring-emerald-400' },
    B: { label: 'Good Fit', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-900/30', ring: 'ring-blue-400' },
    C: { label: 'Moderate Fit', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/30', ring: 'ring-amber-400' },
    D: { label: 'Weak Fit', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-900/30', ring: 'ring-orange-400' },
    F: { label: 'Poor Fit', color: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-900/30', ring: 'ring-rose-400' },
};

type Tab = 'overview' | 'match' | 'strategy' | 'personalize' | 'interview';

const TAB_LABELS: { id: Tab; label: string; short: string }[] = [
    { id: 'overview', label: 'Role Overview', short: 'Role' },
    { id: 'match', label: 'CV Match & Gaps', short: 'Match' },
    { id: 'strategy', label: 'Level Strategy', short: 'Strategy' },
    { id: 'personalize', label: 'Personalization', short: 'Plan' },
    { id: 'interview', label: 'Interview Prep', short: 'Prep' },
];

const ScoreGauge: React.FC<{ score: number; grade: MatchGrade }> = ({ score, grade }) => {
    const cfg = GRADE_CONFIG[grade];
    const sqSize = 90;
    const strokeWidth = 9;
    const radius = (sqSize - strokeWidth) / 2;
    const dashArray = radius * Math.PI * 2;
    const dashOffset = dashArray - dashArray * score / 100;

    return (
        <div className="relative flex flex-col items-center gap-1">
            <div className={`relative w-[90px] h-[90px] flex items-center justify-center`}>
                <svg width={sqSize} height={sqSize} viewBox={`0 0 ${sqSize} ${sqSize}`}>
                    <circle className="fill-none stroke-zinc-200 dark:stroke-neutral-700" cx={sqSize / 2} cy={sqSize / 2} r={radius} strokeWidth={strokeWidth} />
                    <circle
                        className={`fill-none transition-all duration-700 ease-out ${grade === 'A' ? 'stroke-emerald-500' : grade === 'B' ? 'stroke-blue-500' : grade === 'C' ? 'stroke-amber-500' : grade === 'D' ? 'stroke-orange-500' : 'stroke-rose-500'}`}
                        cx={sqSize / 2} cy={sqSize / 2} r={radius} strokeWidth={strokeWidth}
                        transform={`rotate(-90 ${sqSize / 2} ${sqSize / 2})`}
                        style={{ strokeDasharray: dashArray, strokeDashoffset: dashOffset, strokeLinecap: 'round' }}
                    />
                </svg>
                <div className="absolute flex flex-col items-center">
                    <span className={`text-3xl font-black leading-none ${cfg.color}`}>{grade}</span>
                    <span className="text-[10px] font-bold text-zinc-400">{score}%</span>
                </div>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
        </div>
    );
};

const JobAnalysis: React.FC<JobAnalysisProps> = ({ jobDescription, cvTextContent, apiKeySet, onAnalysisComplete, onSaveStories, currentCV, onCVUpdate }) => {
    const [analysis, setAnalysis] = useState<EnhancedJobAnalysis | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [savedStories, setSavedStories] = useState<Set<number>>(new Set());
    const [isFixingCV, setIsFixingCV] = useState(false);
    const [fixSuccess, setFixSuccess] = useState(false);
    const [fixError, setFixError] = useState<string | null>(null);
    const [qaList, setQaList] = useState<Array<{ question: string; answer: string; category: string }>>([]);
    const [isLoadingQA, setIsLoadingQA] = useState(false);
    const [qaError, setQaError] = useState<string | null>(null);
    const [expandedQA, setExpandedQA] = useState<Set<number>>(new Set());
    const [semanticEntries, setSemanticEntries] = useState<SemanticMatchEntry[] | null>(null);
    const [semanticLoading, setSemanticLoading] = useState(false);
    const [semanticAvailable, setSemanticAvailable] = useState(true);

    const runAnalysis = useCallback(async () => {
        if (jobDescription.trim().length < 50 || !apiKeySet) return;
        setIsLoading(true);
        setError(null);
        setAnalysis(null);
        setSavedStories(new Set());
        try {
            const enhanced = await analyzeJobEnhanced(jobDescription, cvTextContent);
            setAnalysis(enhanced);
            if (onAnalysisComplete) {
                const derived: JobAnalysisResult = {
                    keywords: (enhanced.topKeywords || []).slice(0, 10),
                    skills: (enhanced.topKeywords || []).slice(10),
                    companyName: enhanced.companyName,
                    jobTitle: enhanced.jobTitle,
                };
                onAnalysisComplete(derived);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [jobDescription, cvTextContent, apiKeySet, onAnalysisComplete]);

    useEffect(() => {
        if (jobDescription.trim().length > 50 && apiKeySet) {
            const timer = setTimeout(runAnalysis, 1200);
            return () => clearTimeout(timer);
        } else {
            setAnalysis(null);
            setError(null);
        }
    }, [jobDescription, apiKeySet]);

    // Stable, memoised profile-text chunks for the embeddings call.
    const profileChunks = useMemo(() => chunkProfileText(cvTextContent, 180), [cvTextContent]);
    const keywordsKey = (analysis?.topKeywords || []).join('||');
    const chunksKey = profileChunks.join('||');

    // Semantic JD↔skills matching via Workers AI embeddings (cv-engine-worker).
    // Stateless: nothing persisted. Falls back silently to substring matching.
    useEffect(() => {
        const keywords = analysis?.topKeywords || [];
        if (keywords.length === 0 || profileChunks.length === 0) {
            setSemanticEntries(null);
            return;
        }
        let cancelled = false;
        setSemanticLoading(true);
        semanticMatch(keywords, profileChunks)
            .then(res => {
                if (cancelled) return;
                if (res?.results?.length) {
                    setSemanticEntries(res.results);
                    setSemanticAvailable(true);
                } else {
                    setSemanticEntries(null);
                    setSemanticAvailable(false);
                }
            })
            .catch(() => {
                if (cancelled) return;
                setSemanticEntries(null);
                setSemanticAvailable(false);
            })
            .finally(() => {
                if (!cancelled) setSemanticLoading(false);
            });
        return () => { cancelled = true; };
    }, [keywordsKey, chunksKey, profileChunks, analysis?.topKeywords]);

    const handleFixCV = async () => {
        if (!analysis || !currentCV || !onCVUpdate) return;
        setIsFixingCV(true);
        setFixError(null);
        setFixSuccess(false);
        try {
            // Prefer semantic-match misses (true gaps) over substring misses
            // when the embeddings service has returned results.
            let missingKeywords: string[];
            if (semanticEntries && semanticEntries.length > 0) {
                missingKeywords = semanticEntries
                    .filter(e => e.status === 'missing')
                    .map(e => e.keyword);
            } else {
                const cvLower = cvTextContent.toLowerCase();
                missingKeywords = (analysis.topKeywords || []).filter(kw => {
                    const kwLower = kw.toLowerCase().trim();
                    if (cvLower.includes(kwLower)) return false;
                    const words = kwLower.split(/\s+/).filter(w => w.length > 3);
                    return words.length === 0 || !words.some(w => cvLower.includes(w));
                });
            }
            const optimized = await optimizeCVForJob(currentCV, jobDescription, analysis.gaps || [], missingKeywords);
            onCVUpdate({ ...currentCV, ...optimized });
            setFixSuccess(true);
            setTimeout(() => setFixSuccess(false), 4000);
        } catch (e: any) {
            setFixError(e.message || 'Could not optimize CV. Please try again.');
        } finally {
            setIsFixingCV(false);
        }
    };

    const handleGenerateQA = async () => {
        if (!analysis || !apiKeySet) return;
        setIsLoadingQA(true);
        setQaError(null);
        try {
            const qa = await generateInterviewQA(
                { personalInfo: { name: '', email: '', phone: '', location: '', linkedin: '', website: '', github: '' }, summary: cvTextContent, workExperience: [], education: [], skills: [], projects: [], languages: [] } as any,
                jobDescription,
                analysis.companyName
            );
            setQaList(qa);
            setExpandedQA(new Set([0]));
        } catch (e: any) {
            setQaError(e.message || 'Could not generate Q&A. Please try again.');
        } finally {
            setIsLoadingQA(false);
        }
    };

    const handleSaveStory = (index: number) => {
        if (!analysis || !onSaveStories) return;
        const story = analysis.starStories[index];
        const newStory: STARStory = {
            id: Date.now().toString() + '_' + index,
            createdAt: new Date().toISOString(),
            jobRequirement: story.jobRequirement,
            situation: story.situation,
            task: story.task,
            action: story.action,
            result: story.result,
            reflection: story.reflection,
            linkedCompany: story.linkedCompany || analysis.companyName,
            linkedRole: story.linkedRole || analysis.jobTitle,
        };
        onSaveStories([newStory]);
        setSavedStories(prev => new Set([...prev, index]));
    };

    if (!jobDescription.trim() || jobDescription.length < 50) return null;

    if (!apiKeySet) {
        return (
            <div className="mt-6 p-4 border rounded-xl bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30">
                <p className="text-sm text-amber-700 dark:text-amber-300">The CV Engine is temporarily unavailable. Please check your connection and try again.</p>
            </div>
        );
    }

    return (
        <div className="mt-6 border rounded-2xl bg-white dark:bg-neutral-800/50 border-zinc-200 dark:border-neutral-700 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-neutral-700 bg-zinc-50/80 dark:bg-neutral-800/80">
                <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Deep Job Analysis</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">6-block career-ops evaluation</p>
                </div>
                {analysis && (
                    <button
                        onClick={runAnalysis}
                        disabled={isLoading}
                        className="text-xs font-semibold text-[#1B2B4B] hover:text-[#1B2B4B] dark:text-[#C9A84C] flex items-center gap-1 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                        ) : '↺'} Re-analyze
                    </button>
                )}
            </div>

            {/* Loading state */}
            {isLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full border-4 border-[#C9A84C]/20 dark:border-[#1B2B4B]/40"></div>
                        <div className="absolute inset-0 w-10 h-10 rounded-full border-4 border-[#1B2B4B] border-t-transparent animate-spin"></div>
                    </div>
                    <div className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Running 6-block analysis…</div>
                    <div className="text-xs text-zinc-400">Evaluating match, gaps, salary & interview prep</div>
                </div>
            )}

            {/* Error state */}
            {error && !isLoading && (
                <div className="p-5">
                    <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">{error}</p>
                    <button onClick={runAnalysis} className="text-xs font-semibold text-[#1B2B4B] hover:underline">Try again</button>
                </div>
            )}

            {/* Analysis results */}
            {analysis && !isLoading && (
                <div>
                    {/* Score bar */}
                    <div className="px-5 py-4 flex items-center gap-5 border-b border-zinc-100 dark:border-neutral-700/50">
                        <ScoreGauge score={analysis.matchScore} grade={analysis.grade} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-bold text-zinc-900 dark:text-zinc-50 text-sm">{analysis.jobTitle}</span>
                                {analysis.companyName && analysis.companyName !== 'Unknown' && (
                                    <span className="text-xs text-zinc-500">@ {analysis.companyName}</span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F8F7F4] text-[#1B2B4B] dark:bg-[#1B2B4B]/20 dark:text-[#C9A84C]/80">{analysis.archetype}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-neutral-700 dark:text-zinc-300">{analysis.seniority}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-neutral-700 dark:text-zinc-300">{analysis.remote}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{analysis.domain}</span>
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-zinc-300 italic">"{analysis.tldr}"</p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-zinc-100 dark:border-neutral-700 overflow-x-auto">
                        {TAB_LABELS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-3 py-2.5 text-xs font-bold whitespace-nowrap transition-colors border-b-2 -mb-px flex-shrink-0 ${
                                    activeTab === tab.id
                                        ? 'border-[#1B2B4B] text-[#1B2B4B] dark:text-[#C9A84C]'
                                        : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                }`}
                            >
                                <span className="sm:hidden">{tab.short}</span>
                                <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <div className="p-5">
                        {/* Tab A: Role Overview */}
                        {activeTab === 'overview' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Archetype', value: analysis.archetype },
                                        { label: 'Domain', value: analysis.domain },
                                        { label: 'Seniority', value: analysis.seniority },
                                        { label: 'Work Setup', value: analysis.remote },
                                    ].map(item => (
                                        <div key={item.label} className="bg-zinc-50 dark:bg-neutral-700/40 rounded-xl p-3">
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-0.5">{item.label}</div>
                                            <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 leading-tight">{item.value}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 rounded-xl p-4">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#C9A84C] mb-1">Role TL;DR</div>
                                    <p className="text-sm text-[#1B2B4B] dark:text-[#C9A84C]/80">{analysis.tldr}</p>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Salary Estimate</div>
                                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
                                        <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{analysis.salaryRange}</div>
                                        <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{analysis.salaryNotes}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab B: CV Match & Gaps */}
                        {activeTab === 'match' && (
                            <div className="space-y-4">
                                {analysis.matchedRequirements.length > 0 && (
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                                            Matched Requirements ({analysis.matchedRequirements.length})
                                        </div>
                                        <div className="space-y-1.5">
                                            {analysis.matchedRequirements.map((req, i) => (
                                                <div key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                                    <span>{req}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {analysis.gaps.length > 0 && (
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                                            Gaps & Mitigation ({analysis.gaps.length})
                                        </div>
                                        <div className="space-y-2">
                                            {analysis.gaps.map((gap, i) => (
                                                <div key={i} className={`rounded-xl p-3 border ${gap.isBlocker ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/30' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30'}`}>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gap.isBlocker ? 'bg-rose-200 text-rose-800 dark:bg-rose-800/40 dark:text-rose-300' : 'bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300'}`}>
                                                            {gap.isBlocker ? 'Blocker' : 'Nice-to-have'}
                                                        </span>
                                                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{gap.requirement}</span>
                                                    </div>
                                                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                                        <span className="font-semibold">Mitigation: </span>{gap.mitigation}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── Fix My CV button ── */}
                                {currentCV && onCVUpdate && (
                                    <div className="pt-2 border-t border-zinc-100 dark:border-neutral-700">
                                        {fixSuccess ? (
                                            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30">
                                                <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                                                <div>
                                                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">CV updated!</p>
                                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Summary, skills, and bullets have been rewritten to address the gaps above.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                                    Automatically rewrite your CV summary, skills, and bullets to address the gaps above — without changing your actual experience.
                                                </p>
                                                <button
                                                    onClick={handleFixCV}
                                                    disabled={isFixingCV}
                                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-black text-sm transition-all"
                                                    style={{ background: isFixingCV ? '#e5e7eb' : '#111', color: isFixingCV ? '#6b7280' : '#EBFF38', cursor: isFixingCV ? 'not-allowed' : 'pointer' }}
                                                >
                                                    {isFixingCV ? (
                                                        <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Optimizing CV for this job…</>
                                                    ) : (
                                                        <>🎯 Fix My CV for This Job</>
                                                    )}
                                                </button>
                                                {fixError && <p className="text-xs text-rose-500">{fixError}</p>}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tab C: Level Strategy */}
                        {activeTab === 'strategy' && (
                            <div className="space-y-4">
                                <div className="bg-zinc-50 dark:bg-neutral-700/40 rounded-xl p-4">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Positioning Strategy</div>
                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{analysis.levelStrategy}</p>
                                </div>
                                {analysis.seniorPositioningTips.length > 0 && (
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Senior Positioning Tips</div>
                                        <div className="space-y-2">
                                            {analysis.seniorPositioningTips.map((tip, i) => (
                                                <div key={i} className="flex items-start gap-2 bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3">
                                                    <span className="text-violet-500 font-bold text-xs mt-0.5 flex-shrink-0">{i + 1}.</span>
                                                    <p className="text-xs text-violet-800 dark:text-violet-200">{tip}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Salary Negotiation</div>
                                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4">
                                        <div className="text-lg font-black text-emerald-700 dark:text-emerald-300 mb-1">{analysis.salaryRange}</div>
                                        <p className="text-xs text-emerald-700 dark:text-emerald-400">{analysis.salaryNotes}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab D+E: Personalization */}
                        {activeTab === 'personalize' && (
                            <div className="space-y-4">
                                {analysis.topKeywords.length > 0 && (() => {
                                    type Bucket = { keyword: string; bestMatch?: string | null; score?: number };
                                    const matched: Bucket[] = [];
                                    const partial: Bucket[] = [];
                                    const missing: Bucket[] = [];

                                    if (semanticEntries && semanticEntries.length > 0) {
                                        for (const e of semanticEntries) {
                                            const b: Bucket = { keyword: e.keyword, bestMatch: e.bestMatch, score: e.score };
                                            if (e.status === 'matched') matched.push(b);
                                            else if (e.status === 'partial') partial.push(b);
                                            else missing.push(b);
                                        }
                                    } else {
                                        const cvLower = cvTextContent.toLowerCase();
                                        for (const kw of analysis.topKeywords) {
                                            const kwLower = kw.toLowerCase().trim();
                                            if (cvLower.includes(kwLower)) {
                                                matched.push({ keyword: kw });
                                            } else {
                                                const words = kwLower.split(/\s+/).filter(w => w.length > 3);
                                                if (words.length > 0 && words.some(w => cvLower.includes(w))) {
                                                    partial.push({ keyword: kw });
                                                } else {
                                                    missing.push({ keyword: kw });
                                                }
                                            }
                                        }
                                    }

                                    const usingSemantic = !!(semanticEntries && semanticEntries.length > 0);

                                    return (
                                        <div className="rounded-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
                                            <div className="px-4 py-3 bg-zinc-50 dark:bg-neutral-800/80 border-b border-zinc-100 dark:border-neutral-700 flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <div className="text-xs font-bold text-zinc-800 dark:text-zinc-100">ATS Keyword Match Panel</div>
                                                        {semanticLoading && (
                                                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                                                                <svg className="animate-spin h-2.5 w-2.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                                Embedding…
                                                            </span>
                                                        )}
                                                        {usingSemantic && !semanticLoading && (
                                                            <span
                                                                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                                                                title="Powered by Cloudflare Workers AI · @cf/baai/bge-large-en-v1.5 — meaning-aware match, not literal substring."
                                                            >
                                                                AI semantic match
                                                            </span>
                                                        )}
                                                        {!usingSemantic && !semanticLoading && !semanticAvailable && (
                                                            <span
                                                                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-600 dark:bg-neutral-700 dark:text-zinc-300"
                                                                title="Falling back to substring match — semantic engine unreachable."
                                                            >
                                                                Local match
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-400 mt-0.5">
                                                        {analysis.topKeywords.length} keywords from this job description checked against your profile
                                                        {usingSemantic && ' — by meaning, not just exact text'}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 text-[10px] font-bold flex-shrink-0">
                                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{matched.length} matched</span>
                                                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{partial.length} partial</span>
                                                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">{missing.length} missing</span>
                                                </div>
                                            </div>

                                            <div className="divide-y divide-zinc-100 dark:divide-neutral-700/50">
                                                {matched.length > 0 && (
                                                    <div className="px-4 py-3 space-y-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-emerald-500 text-sm">🟢</span>
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                                                Matched — {usingSemantic ? 'present in meaning' : 'already in your profile'}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {matched.map((b, i) => (
                                                                <span
                                                                    key={i}
                                                                    title={b.bestMatch ? `Matches: "${b.bestMatch}"${typeof b.score === 'number' ? ` · ${(b.score * 100).toFixed(0)}%` : ''}` : undefined}
                                                                    className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40"
                                                                >
                                                                    ✓ {b.keyword}
                                                                    {usingSemantic && typeof b.score === 'number' && (
                                                                        <span className="ml-1 text-[9px] opacity-70">{(b.score * 100).toFixed(0)}%</span>
                                                                    )}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {partial.length > 0 && (
                                                    <div className="px-4 py-3 space-y-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-amber-500 text-sm">🟡</span>
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                                                Partial — semantically related, not a strong match
                                                            </span>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            {partial.map((b, i) => (
                                                                <div key={i} className="flex flex-col gap-0.5">
                                                                    <span className="self-start text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                                                                        ~ {b.keyword}
                                                                        {usingSemantic && typeof b.score === 'number' && (
                                                                            <span className="ml-1 text-[9px] opacity-70">{(b.score * 100).toFixed(0)}%</span>
                                                                        )}
                                                                    </span>
                                                                    {usingSemantic && b.bestMatch && (
                                                                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 italic pl-2 line-clamp-1">
                                                                            ↳ closest in your profile: "{b.bestMatch}"
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <p className="text-[10px] text-zinc-400 italic">
                                                            {usingSemantic
                                                                ? 'These are conceptually present but the JD uses different wording. Consider mirroring its exact phrasing.'
                                                                : 'Consider using these exact phrases in your profile to improve ATS matching.'}
                                                        </p>
                                                    </div>
                                                )}

                                                {missing.length > 0 && (
                                                    <div className="px-4 py-3 space-y-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-rose-500 text-sm">🔴</span>
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                                                Missing — {usingSemantic ? 'no semantic equivalent in your profile' : 'not found in your profile'}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {missing.map((b, i) => (
                                                                <span
                                                                    key={i}
                                                                    title={b.bestMatch ? `Closest in profile: "${b.bestMatch}"${typeof b.score === 'number' ? ` · ${(b.score * 100).toFixed(0)}%` : ''}` : undefined}
                                                                    className="text-xs font-medium px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40"
                                                                >
                                                                    ✕ {b.keyword}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        <p className="text-[10px] text-zinc-400 italic">Add these keywords to your profile or skills before generating your CV — they will be injected into the PDF automatically.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                                {analysis.personalizationChanges.length > 0 && (
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                                            Recommended CV Changes ({analysis.personalizationChanges.length})
                                        </div>
                                        <div className="space-y-2">
                                            {analysis.personalizationChanges.map((change, i) => (
                                                <div key={i} className="rounded-xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
                                                    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-neutral-700/50">
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F8F7F4] text-[#1B2B4B] dark:bg-[#1B2B4B]/20 dark:text-[#C9A84C]/80">{change.section}</span>
                                                        <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-1 line-clamp-1">{change.currentState}</span>
                                                    </div>
                                                    <div className="px-3 py-2.5">
                                                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">{change.proposedChange}</p>
                                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic">{change.reason}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tab F: Interview STAR+R + Q&A */}
                        {activeTab === 'interview' && (
                            <div className="space-y-5">
                                {/* Q&A Generator */}
                                <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-neutral-800/80 border-b border-zinc-100 dark:border-neutral-700">
                                        <div>
                                            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100">Interview Q&amp;A Prep</p>
                                            <p className="text-[10px] text-zinc-400 mt-0.5">10 tailored questions with model answers based on your CV + this JD</p>
                                        </div>
                                        <button
                                            onClick={handleGenerateQA}
                                            disabled={isLoadingQA}
                                            className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all"
                                            style={{ background: isLoadingQA ? '#e5e7eb' : '#111', color: isLoadingQA ? '#6b7280' : '#EBFF38', cursor: isLoadingQA ? 'not-allowed' : 'pointer' }}
                                        >
                                            {isLoadingQA ? (
                                                <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Generating…</>
                                            ) : qaList.length > 0 ? '↺ Regenerate' : '✨ Generate Q&A'}
                                        </button>
                                    </div>
                                    {qaError && <p className="text-xs text-rose-500 px-4 py-2">{qaError}</p>}
                                    {qaList.length > 0 && (
                                        <div className="divide-y divide-zinc-100 dark:divide-neutral-700/50">
                                            {qaList.map((qa, i) => {
                                                const isOpen = expandedQA.has(i);
                                                const catColors: Record<string, string> = {
                                                    Behavioural: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                                                    Technical: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
                                                    Situational: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                                                    Culture: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                                                    Strength: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
                                                };
                                                return (
                                                    <div key={i}>
                                                        <button
                                                            onClick={() => setExpandedQA(prev => { const s = new Set(prev); if (s.has(i)) s.delete(i); else s.add(i); return s; })}
                                                            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-neutral-700/30 transition-colors"
                                                        >
                                                            <span className="text-xs font-black text-zinc-400 mt-0.5 flex-shrink-0 w-5">Q{i + 1}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 leading-snug">{qa.question}</p>
                                                                <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${catColors[qa.category] || catColors.Technical}`}>{qa.category}</span>
                                                            </div>
                                                            <svg className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 9l-7 7-7-7" /></svg>
                                                        </button>
                                                        {isOpen && (
                                                            <div className="px-4 pb-3 ml-8">
                                                                <div className="bg-[#F8F7F4] dark:bg-[#1B2B4B]/10 rounded-xl p-3 border border-[#C9A84C]/20 dark:border-[#1B2B4B]/40/30">
                                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#C9A84C] mb-1">Model Answer</p>
                                                                    <p className="text-xs text-[#1B2B4B] dark:text-[#C9A84C]/80 leading-relaxed">{qa.answer}</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {qaList.length === 0 && !isLoadingQA && (
                                        <div className="px-4 py-6 text-center">
                                            <p className="text-xs text-zinc-400">Click "Generate Q&amp;A" to get 10 tailored interview questions with model answers.</p>
                                        </div>
                                    )}
                                </div>

                                {/* STAR+R Stories */}
                                <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                                    STAR+R Story Bank
                                </p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                                    The <span className="font-semibold text-[#1B2B4B] dark:text-[#C9A84C]">Reflection</span> column signals seniority to interviewers. Save stories to your Story Bank in the Tracker.
                                </p>
                                {analysis.starStories.length === 0 && (
                                    <p className="text-sm text-zinc-400 text-center py-6">No stories generated. Add CV text above to get personalized stories.</p>
                                )}
                                {analysis.starStories.map((story, i) => (
                                    <div key={i} className="rounded-xl border border-zinc-200 dark:border-neutral-700 overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-neutral-700/50 border-b border-zinc-100 dark:border-neutral-700">
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">JD Requirement</span>
                                                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{story.jobRequirement}</p>
                                            </div>
                                            {onSaveStories && (
                                                <button
                                                    onClick={() => handleSaveStory(i)}
                                                    disabled={savedStories.has(i)}
                                                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex-shrink-0 ${
                                                        savedStories.has(i)
                                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400'
                                                            : 'bg-white dark:bg-neutral-800 text-[#1B2B4B] border-[#C9A84C]/40 hover:bg-[#F8F7F4] dark:hover:bg-[#1B2B4B]/10'
                                                    }`}
                                                >
                                                    {savedStories.has(i) ? '✓ Saved' : '+ Save to Bank'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {[
                                                { key: 'S', label: 'Situation', value: story.situation, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200' },
                                                { key: 'T', label: 'Task', value: story.task, color: 'bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-200' },
                                                { key: 'A', label: 'Action', value: story.action, color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200' },
                                                { key: 'R', label: 'Result', value: story.result, color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200' },
                                            ].map(item => (
                                                <div key={item.key} className={`rounded-lg p-3 ${item.color}`}>
                                                    <div className="flex items-center gap-1 mb-1">
                                                        <span className="text-[11px] font-black">{item.key}</span>
                                                        <span className="text-[10px] font-semibold opacity-70">{item.label}</span>
                                                    </div>
                                                    <p className="text-xs leading-relaxed">{item.value}</p>
                                                </div>
                                            ))}
                                            <div className="sm:col-span-2 rounded-lg p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-200 border-l-4 border-rose-400">
                                                <div className="flex items-center gap-1 mb-1">
                                                    <span className="text-[11px] font-black">+R</span>
                                                    <span className="text-[10px] font-semibold opacity-70">Reflection — signals seniority</span>
                                                </div>
                                                <p className="text-xs leading-relaxed">{story.reflection}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
);
};

export default JobAnalysis;
