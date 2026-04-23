import React, { useState, useCallback, useMemo } from 'react';
import { CVData, UserProfile, TemplateName, FontName, templateDisplayNames, CVGenerationMode, cvGenerationModes, ScrapedJob } from '../types';
import { generateCV, generateCoverLetter } from '../services/geminiService';
import { downloadCVAsPDF } from '../services/pdfService';
import CVPreview from './CVPreview';
import CoverLetterPreview from './CoverLetterPreview';
import { Button } from './ui/Button';
import {
    X, Download, Save, Sparkles, RefreshCw, ExternalLink, CheckCircle,
    Building, AlertCircle, FileText, BookOpen,
} from './icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobPipelineModalProps {
    job: ScrapedJob;
    userProfile: UserProfile;
    apiKeySet: boolean;
    onClose: () => void;
    onSaveCV: (cvData: CVData, name: string) => void;
    onSaveCoverLetter: (text: string, name: string) => void;
    onMarkApplied: () => void;
    openSettings: () => void;
}

type ModalSection = 'overview' | 'cv' | 'cover-letter';

// ─── Match Score (client-side, no AI call) ────────────────────────────────────

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'should', 'could', 'may', 'might', 'must', 'shall', 'can',
    'this', 'that', 'these', 'those', 'we', 'you', 'our', 'your', 'their',
    'its', 'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'whether',
    'work', 'working', 'team', 'role', 'job', 'position', 'company', 'office',
    'including', 'such', 'other', 'also', 'well', 'strong', 'good', 'great',
    'able', 'across', 'about', 'up', 'out', 'into', 'through', 'over',
]);

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s+#]/g, ' ')
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

interface MatchResult {
    score: number;       // 0-100
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    matchedSkills: string[];
    missingKeywords: string[];
    recommendation: string;
    recommendationColor: string;
    emoji: string;
}

function computeMatch(userProfile: UserProfile, jd: string): MatchResult {
    const jdTokens = new Set(tokenize(jd));

    // User skills (from skills list + job titles from experience)
    const userSkills = [
        ...userProfile.skills,
        ...userProfile.workExperience.map(e => e.jobTitle),
        ...(userProfile.projects || []).map(p => p.name),
    ];

    const userTokens = userSkills.flatMap(s => tokenize(s));
    const uniqueUserTokens = [...new Set(userTokens)];

    // Matched: user tokens that appear in JD
    const matched = uniqueUserTokens.filter(t => jdTokens.has(t));

    // Find important JD keywords not in user profile (top missing keywords)
    const jdImportant = tokenize(jd).filter(t => t.length > 3);
    const wordFreq = new Map<string, number>();
    for (const w of jdImportant) {
        wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
    const topJdKeywords = [...wordFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([w]) => w);

    const missing = topJdKeywords.filter(k => !uniqueUserTokens.includes(k)).slice(0, 8);

    // Score = matched / max(user skill count, 1) * 100, capped at 100
    const raw = uniqueUserTokens.length === 0
        ? 50
        : Math.round((matched.length / Math.min(uniqueUserTokens.length, 20)) * 100);
    const score = Math.min(raw, 100);

    let grade: MatchResult['grade'];
    let recommendation: string;
    let recommendationColor: string;
    let emoji: string;

    if (score >= 75) {
        grade = 'A'; recommendation = 'Strong Match — Apply Now'; recommendationColor = 'text-emerald-600 dark:text-emerald-400'; emoji = '🔥';
    } else if (score >= 55) {
        grade = 'B'; recommendation = 'Good Match — Worth Applying'; recommendationColor = 'text-blue-600 dark:text-blue-400'; emoji = '✅';
    } else if (score >= 35) {
        grade = 'C'; recommendation = 'Partial Match — Consider It'; recommendationColor = 'text-amber-600 dark:text-amber-400'; emoji = '🤔';
    } else if (score >= 20) {
        grade = 'D'; recommendation = 'Weak Match — May Be a Stretch'; recommendationColor = 'text-orange-600 dark:text-orange-400'; emoji = '⚠️';
    } else {
        grade = 'F'; recommendation = 'Low Match — High-Effort Application'; recommendationColor = 'text-rose-600 dark:text-rose-400'; emoji = '❌';
    }

    return {
        score,
        grade,
        matchedSkills: matched.slice(0, 12),
        missingKeywords: missing,
        recommendation,
        recommendationColor,
        emoji,
    };
}

// ─── Template Picker (compact inline version) ─────────────────────────────────

const RECOMMENDED_TEMPLATES: { id: TemplateName; label: string; badge?: string }[] = [
    { id: 'ats-clean-pro', label: 'ATS Clean Pro', badge: '🎯 ATS' },
    { id: 'standard-pro', label: 'Standard Pro', badge: '⭐ Popular' },
    { id: 'professional', label: 'Professional' },
    { id: 'modern', label: 'Modern', badge: '🔥 Trending' },
    { id: 'silicon-valley', label: 'Silicon Valley', badge: '🦄 Startup' },
    { id: 'tokyo-night', label: 'Tokyo Night', badge: '🗼 Bold' },
    { id: 'executive', label: 'Executive', badge: '🏛️ Senior' },
    { id: 'minimalist', label: 'Minimalist', badge: '✨ Clean' },
    { id: 'software-engineer', label: 'Tech', badge: '💻 SWE' },
    { id: 'harvard-gold', label: 'Harvard Gold', badge: '🎓 Academic' },
    { id: 'navy-sidebar', label: 'Navy Sidebar' },
    { id: 'london-finance', label: 'London Finance' },
];

const ALL_TEMPLATE_NAMES = Object.keys(templateDisplayNames) as TemplateName[];

// ─── Grade Ring ───────────────────────────────────────────────────────────────

const GradeRing: React.FC<{ score: number; grade: string }> = ({ score, grade }) => {
    const r = 28;
    const circ = 2 * Math.PI * r;
    const fill = (score / 100) * circ;
    const gradeColor = grade === 'A' ? '#10b981' : grade === 'B' ? '#3b82f6' : grade === 'C' ? '#f59e0b' : grade === 'D' ? '#f97316' : '#ef4444';

    return (
        <div className="relative w-20 h-20 shrink-0">
            <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-zinc-200 dark:text-neutral-700" />
                <circle cx="40" cy="40" r={r} fill="none" stroke={gradeColor} strokeWidth="8"
                    strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black" style={{ color: gradeColor }}>{grade}</span>
                <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">{score}%</span>
            </div>
        </div>
    );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

const JobPipelineModal: React.FC<JobPipelineModalProps> = ({
    job, userProfile, apiKeySet, onClose, onSaveCV, onSaveCoverLetter, onMarkApplied, openSettings,
}) => {
    const [section, setSection] = useState<ModalSection>('overview');

    // CV state
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateName>('ats-clean-pro');
    const [selectedFont] = useState<FontName>('inter');
    const [selectedMode, setSelectedMode] = useState<CVGenerationMode>('honest');
    const [generatedCV, setGeneratedCV] = useState<CVData | null>(null);
    const [isGeneratingCV, setIsGeneratingCV] = useState(false);
    const [cvError, setCvError] = useState<string | null>(null);
    const [cvSaved, setCvSaved] = useState(false);
    const [showAllTemplates, setShowAllTemplates] = useState(false);

    // Cover letter state
    const [coverLetterText, setCoverLetterText] = useState('');
    const [isGeneratingCL, setIsGeneratingCL] = useState(false);
    const [clError, setClError] = useState<string | null>(null);
    const [clSaved, setClSaved] = useState(false);

    // Compute match score from user profile vs JD
    const match = useMemo(() => computeMatch(userProfile, job.jobDescription || job.snippet), [userProfile, job]);

    // ── CV Generation ─────────────────────────────────────────────────────────
    const handleGenerateCV = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        setIsGeneratingCV(true);
        setCvError(null);
        setCvSaved(false);

        const runGen = () => generateCV(userProfile, job.jobDescription || job.snippet, selectedMode, 'job', 'standard');

        try {
            const cv = await runGen();
            setGeneratedCV(cv);
        } catch (firstErr: any) {
            const errMsg = (firstErr?.message || '').toLowerCase();
            const isRetryable = firstErr?.status === 429 ||
                errMsg.includes('rate limit') || errMsg.includes('rate_limit') ||
                errMsg.includes('unavailable') || errMsg.includes('both groq') ||
                errMsg.includes('overload') || errMsg.includes('try again');

            if (isRetryable) {
                const waitSec: number = firstErr?.retryAfterSeconds ?? 45;
                for (let i = waitSec; i > 0; i--) {
                    setCvError(`Rate limited — retrying in ${i}s…`);
                    await new Promise(r => setTimeout(r, 1000));
                }
                setCvError(null);
                try {
                    const cv = await runGen();
                    setGeneratedCV(cv);
                } catch (retryErr: any) {
                    setCvError(retryErr instanceof Error ? retryErr.message : 'CV generation failed.');
                }
            } else {
                setCvError(firstErr instanceof Error ? firstErr.message : 'CV generation failed.');
            }
        } finally {
            setIsGeneratingCV(false);
        }
    }, [apiKeySet, userProfile, job, selectedMode, openSettings]);

    const handleDownloadCV = useCallback(() => {
        if (!generatedCV) return;
        const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
        downloadCVAsPDF({
            cvData: generatedCV,
            personalInfo: userProfile.personalInfo,
            template: selectedTemplate,
            font: selectedFont,
            fileName: `${sanitize(userProfile.personalInfo.name)}_${sanitize(job.company)}_CV.pdf`,
            jobDescription: job.jobDescription || job.snippet,
        });
    }, [generatedCV, userProfile, selectedTemplate, selectedFont, job]);

    const handleSaveCV = useCallback(() => {
        if (!generatedCV) return;
        const name = `${job.title} @ ${job.company}`;
        onSaveCV(generatedCV, name);
        setCvSaved(true);
    }, [generatedCV, job, onSaveCV]);

    // ── Cover Letter Generation ───────────────────────────────────────────────
    const handleGenerateCL = useCallback(async () => {
        if (!apiKeySet) { openSettings(); return; }
        setIsGeneratingCL(true);
        setClError(null);
        setClSaved(false);
        try {
            const text = await generateCoverLetter(userProfile, job.jobDescription || job.snippet);
            setCoverLetterText(text);
            setSection('cover-letter');
        } catch (e) {
            setClError(e instanceof Error ? e.message : 'Cover letter generation failed.');
        } finally {
            setIsGeneratingCL(false);
        }
    }, [apiKeySet, userProfile, job, openSettings]);

    const handleSaveCL = useCallback(() => {
        if (!coverLetterText) return;
        const name = `Cover Letter — ${job.title} @ ${job.company}`;
        onSaveCoverLetter(coverLetterText, name);
        setClSaved(true);
    }, [coverLetterText, job, onSaveCoverLetter]);

    const displayedTemplates = showAllTemplates
        ? ALL_TEMPLATE_NAMES.map(id => ({ id, label: templateDisplayNames[id] }))
        : RECOMMENDED_TEMPLATES;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-6 px-4">
            <div className="w-full max-w-4xl bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl flex flex-col min-h-0">

                {/* ── Header ── */}
                <div className="flex items-start gap-4 p-6 border-b border-zinc-100 dark:border-neutral-800 sticky top-0 bg-white dark:bg-neutral-900 rounded-t-3xl z-10">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100 leading-tight line-clamp-1">
                            {job.title}
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-sm font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                                <Building className="h-3.5 w-3.5" /> {job.company}
                            </span>
                            {job.location && <span className="text-xs text-zinc-400">· {job.location}</span>}
                            <span className={`text-xs font-bold ${match.recommendationColor} flex items-center gap-1`}>
                                · {match.emoji} {match.recommendation}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <a href={job.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs font-bold px-3 h-8 rounded-xl border border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-400 hover:border-violet-400 hover:text-violet-600 transition-colors">
                            <ExternalLink className="h-3.5 w-3.5" /> Apply
                        </a>
                        <button onClick={onClose}
                            className="h-8 w-8 flex items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* ── Section Tabs ── */}
                <div className="flex gap-1 p-4 pb-0">
                    {([
                        { id: 'overview', label: '📊 Overview & Stats' },
                        { id: 'cv', label: '📄 CV Builder' },
                        { id: 'cover-letter', label: '✉️ Cover Letter' },
                    ] as const).map(tab => (
                        <button key={tab.id} onClick={() => setSection(tab.id)}
                            className={`px-4 py-2 rounded-t-xl text-xs font-bold border-b-2 transition-all ${section === tab.id
                                ? 'border-violet-500 text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/10'
                                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                }`}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Body ── */}
                <div className="flex-1 overflow-y-auto p-6">

                    {/* ══ OVERVIEW ══ */}
                    {section === 'overview' && (
                        <div className="space-y-6">

                            {/* Match card */}
                            <div className="bg-gradient-to-br from-zinc-50 to-white dark:from-neutral-800 dark:to-neutral-900 rounded-2xl border border-zinc-200 dark:border-neutral-700 p-5">
                                <h3 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
                                    Profile Match Analysis
                                </h3>
                                <div className="flex items-start gap-5">
                                    <GradeRing score={match.score} grade={match.grade} />
                                    <div className="flex-1 space-y-3">
                                        <div>
                                            <p className={`font-black text-lg ${match.recommendationColor}`}>
                                                {match.emoji} {match.recommendation}
                                            </p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                                Based on your skills vs. the job description keywords
                                            </p>
                                        </div>
                                        {match.matchedSkills.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-1.5">
                                                    ✅ Matched Skills
                                                </p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {match.matchedSkills.map(s => (
                                                        <span key={s} className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                                                            {s}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {match.missingKeywords.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-1.5">
                                                    ⚠️ JD Keywords Not in Your Profile
                                                </p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {match.missingKeywords.map(k => (
                                                        <span key={k} className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                                                            {k}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Quick actions */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button onClick={() => setSection('cv')}
                                    className="flex items-center gap-3 p-4 rounded-2xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 hover:border-violet-400 transition-all text-left">
                                    <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                                        <FileText className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Generate CV</p>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Pick template, generate & save</p>
                                    </div>
                                </button>
                                <button onClick={() => { setSection('cover-letter'); if (!coverLetterText) handleGenerateCL(); }}
                                    className="flex items-center gap-3 p-4 rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 hover:border-blue-400 transition-all text-left">
                                    <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                        <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Generate Cover Letter</p>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">AI-crafted, editable & downloadable</p>
                                    </div>
                                </button>
                            </div>

                            {/* JD preview */}
                            <div>
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Job Description</h3>
                                <div className="bg-zinc-50 dark:bg-neutral-800 rounded-xl p-4 max-h-64 overflow-y-auto">
                                    <pre className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
                                        {job.jobDescription || job.snippet || 'No job description available.'}
                                    </pre>
                                </div>
                            </div>

                            {/* Mark applied */}
                            <div className="flex justify-end">
                                <button onClick={() => { onMarkApplied(); onClose(); }}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow shadow-emerald-500/20 transition-colors">
                                    <CheckCircle className="h-4 w-4" /> Mark as Applied
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ══ CV BUILDER ══ */}
                    {section === 'cv' && (
                        <div className="space-y-6">

                            {/* Mode selector */}
                            <div>
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Generation Mode</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {cvGenerationModes.map(mode => {
                                        const colors: Record<CVGenerationMode, { ring: string; bg: string; text: string }> = {
                                            honest: { ring: 'ring-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300' },
                                            boosted: { ring: 'ring-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300' },
                                            aggressive: { ring: 'ring-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-300' },
                                        };
                                        const c = colors[mode.id];
                                        const active = selectedMode === mode.id;
                                        return (
                                            <button key={mode.id} onClick={() => setSelectedMode(mode.id)}
                                                className={`p-3 rounded-xl border-2 text-left transition-all ${active ? `ring-2 ${c.ring} border-transparent ${c.bg}` : 'border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 bg-white dark:bg-neutral-800'}`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-lg">{mode.emoji}</span>
                                                    <span className={`text-xs font-bold ${active ? c.text : 'text-zinc-700 dark:text-zinc-300'}`}>{mode.label}</span>
                                                </div>
                                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">{mode.shortDesc}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Template picker */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Template</h3>
                                    <button onClick={() => setShowAllTemplates(v => !v)}
                                        className="text-xs text-violet-600 dark:text-violet-400 font-semibold hover:underline">
                                        {showAllTemplates ? 'Show recommended' : `Show all ${ALL_TEMPLATE_NAMES.length} →`}
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {displayedTemplates.map(t => (
                                        <button key={t.id} onClick={() => setSelectedTemplate(t.id)}
                                            className={`relative p-2.5 rounded-xl border-2 text-xs font-semibold text-center transition-all ${selectedTemplate === t.id
                                                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 shadow-sm'
                                                : 'border-zinc-200 dark:border-neutral-700 text-zinc-600 dark:text-zinc-400 hover:border-violet-300 bg-white dark:bg-neutral-800'
                                                }`}>
                                            {selectedTemplate === t.id && (
                                                <div className="absolute -top-1.5 -right-1.5">
                                                    <CheckCircle className="h-4 w-4 text-violet-500 bg-white dark:bg-neutral-900 rounded-full" />
                                                </div>
                                            )}
                                            <span className="block truncate">{t.label}</span>
                                            {'badge' in t && t.badge && (
                                                <span className="block text-[10px] text-zinc-400 mt-0.5 truncate">{t.badge}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Generate button */}
                            {!generatedCV ? (
                                <div className="flex flex-col items-center gap-3 py-4">
                                    {cvError && (
                                        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm w-full">
                                            <AlertCircle className="h-4 w-4 shrink-0" /> {cvError}
                                        </div>
                                    )}
                                    <Button onClick={handleGenerateCV} disabled={isGeneratingCV}
                                        className="bg-violet-600 hover:bg-violet-700 text-white border-0 shadow-lg shadow-violet-500/25 px-10 rounded-xl h-11 font-bold text-sm">
                                        {isGeneratingCV
                                            ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Generating CV…</>
                                            : <><Sparkles className="h-4 w-4 mr-2" />Generate CV</>}
                                    </Button>
                                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                        AI tailors your CV to this job description using the selected mode and template.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Action bar */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Button onClick={handleGenerateCV} disabled={isGeneratingCV}
                                            className="rounded-xl text-xs border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-zinc-300 px-4 h-8">
                                            {isGeneratingCV
                                                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />Regenerating…</>
                                                : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Regenerate</>}
                                        </Button>
                                        <Button onClick={handleDownloadCV}
                                            className="bg-violet-600 hover:bg-violet-700 text-white border-0 rounded-xl text-xs px-4 h-8">
                                            <Download className="h-3.5 w-3.5 mr-1.5" />Download PDF
                                        </Button>
                                        <Button onClick={handleSaveCV} disabled={cvSaved}
                                            className={`rounded-xl text-xs px-4 h-8 border-0 ${cvSaved ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow shadow-emerald-500/20'}`}>
                                            {cvSaved
                                                ? <><CheckCircle className="h-3.5 w-3.5 mr-1.5" />Saved!</>
                                                : <><Save className="h-3.5 w-3.5 mr-1.5" />Save to Library</>}
                                        </Button>
                                    </div>

                                    {/* CV Preview */}
                                    <div className="border-2 border-zinc-100 dark:border-neutral-700 rounded-2xl overflow-hidden">
                                        <div className="overflow-auto max-h-[600px]">
                                            <div className="scale-[0.7] origin-top-left" style={{ width: '142.857%' }}>
                                                <CVPreview
                                                    cvData={generatedCV}
                                                    personalInfo={userProfile.personalInfo}
                                                    template={selectedTemplate}
                                                    font={selectedFont}
                                                    jobDescription={job.jobDescription || job.snippet}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══ COVER LETTER ══ */}
                    {section === 'cover-letter' && (
                        <div className="space-y-4">
                            {!coverLetterText ? (
                                <div className="flex flex-col items-center gap-3 py-8">
                                    {clError && (
                                        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-sm w-full">
                                            <AlertCircle className="h-4 w-4 shrink-0" /> {clError}
                                        </div>
                                    )}
                                    <Button onClick={handleGenerateCL} disabled={isGeneratingCL}
                                        className="bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-lg shadow-blue-500/25 px-10 rounded-xl h-11 font-bold text-sm">
                                        {isGeneratingCL
                                            ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Writing Cover Letter…</>
                                            : <><Sparkles className="h-4 w-4 mr-2" />Generate Cover Letter</>}
                                    </Button>
                                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                        AI writes a tailored cover letter for this specific role and company.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Save bar */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Button onClick={handleGenerateCL} disabled={isGeneratingCL}
                                            className="rounded-xl text-xs border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-zinc-300 px-4 h-8">
                                            {isGeneratingCL
                                                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />Rewriting…</>
                                                : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Rewrite</>}
                                        </Button>
                                        <Button onClick={handleSaveCL} disabled={clSaved}
                                            className={`rounded-xl text-xs px-4 h-8 border-0 ${clSaved ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow shadow-emerald-500/20'}`}>
                                            {clSaved
                                                ? <><CheckCircle className="h-3.5 w-3.5 mr-1.5" />Saved!</>
                                                : <><Save className="h-3.5 w-3.5 mr-1.5" />Save Cover Letter</>}
                                        </Button>
                                    </div>

                                    <CoverLetterPreview
                                        letterText={coverLetterText}
                                        onTextChange={setCoverLetterText}
                                        fileName={`CoverLetter_${job.company}_${job.title}.pdf`}
                                        personalInfo={userProfile.personalInfo}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default JobPipelineModal;
