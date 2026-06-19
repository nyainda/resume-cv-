/**
 * CVDoctorPanel.tsx
 *
 * Full-featured career review panel with three tabs:
 *
 *  ① Smart Review — career-consultant-style read of the CV:
 *                   "Strengthen with", "Simplify by removing", "Quick Wins"
 *  ② Bullets      — instant colour-coded bullet inspector; click any flagged
 *                   bullet to get 3 rewrite options and apply with one click
 *  ③ What Changed — diff view shown after Auto-Optimize (before → after)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CVData } from '../types';
import {
    classifyBullets, scanCVForDoctor, rewriteBulletOptions, rewriteAllFlaggedBullets,
    suggestQuantifiedBullet,
    BulletAnnotation, BulletIssueType, CVDoctorScan, CVDiff, ISSUE_META,
} from '../services/cvDoctorService';
import { paraphraseText, ParaphraseTone } from '../services/geminiService';
import { deduplicateSkills } from '../services/cvFinalGuard';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    cv:              CVData;
    jobDescription?: string;
    diff?:           CVDiff | null;
    onApplyBullet:   (roleIndex: number, bulletIndex: number, newText: string) => void;
    onClose:         () => void;
    /** Called when the doctor makes a structural change to the full CV (e.g. dedup skills) */
    onUpdateCV?:     (cv: CVData) => void;
}

// ─── Colour legend items ──────────────────────────────────────────────────────

const LEGEND: { type: BulletIssueType; label: string }[] = [
    { type: 'pronoun',            label: 'First-person pronoun (I / my / we)' },
    { type: 'ai_language',        label: 'AI buzzword or 3rd-person verb' },
    { type: 'passive_voice',      label: 'Passive voice / responsible for' },
    { type: 'tense_mismatch',     label: 'Wrong tense (current role past / past role present)' },
    { type: 'weak_verb',          label: 'Weak opener' },
    { type: 'ensuring_virus',     label: '"Ensuring" filler word' },
    { type: 'no_metric',          label: 'No number or metric' },
    { type: 'bare_metric_opener', label: 'Starts with a number (no verb setup)' },
    { type: 'duplicate_word',     label: 'Duplicate adjacent word' },
    { type: 'too_short',          label: 'Too short or too long' },
    { type: 'good',               label: 'Looks good' },
];

// ─── Sub-component: single colour-coded bullet row ────────────────────────────

const BulletRow: React.FC<{
    ann:             BulletAnnotation;
    role:            CVData['experience'][number];
    cv:              CVData;
    jobDescription?: string;
    onApply:         (text: string) => void;
}> = ({ ann, role, cv, jobDescription, onApply }) => {
    const [expanded,       setExpanded]       = useState(false);
    const [rewrites,       setRewrites]       = useState<string[] | null>(null);
    const [loading,        setLoading]        = useState(false);
    const [applied,        setApplied]        = useState<number | null>(null);
    // Quantified suggestion — only fetched for no_metric bullets
    const [quantified,     setQuantified]     = useState<string | null>(null);
    const [quantLoading,   setQuantLoading]   = useState(false);
    const [quantApplied,   setQuantApplied]   = useState(false);
    const meta = ISSUE_META[ann.primaryIssue];
    const isNoMetric = ann.primaryIssue === 'no_metric' || ann.issues.includes('no_metric');

    const fetchRewrites = useCallback(async () => {
        if (rewrites !== null || loading) return;
        setLoading(true);

        const standardFetch = rewriteBulletOptions(ann.text, role, ann.issues, jobDescription)
            .then(setRewrites)
            .catch(() => setRewrites([]));

        // Fire quantified suggestion in parallel for no_metric bullets
        let quantFetch: Promise<void> = Promise.resolve();
        if (isNoMetric && quantified === null) {
            setQuantLoading(true);
            quantFetch = suggestQuantifiedBullet(ann.text, role, cv, jobDescription)
                .then(setQuantified)
                .catch(() => setQuantified(null))
                .finally(() => setQuantLoading(false));
        }

        await Promise.allSettled([standardFetch, quantFetch]);
        setLoading(false);
    }, [ann, role, cv, jobDescription, rewrites, loading, isNoMetric, quantified]);

    const handleExpand = () => {
        setExpanded(e => !e);
        if (!expanded && rewrites === null) fetchRewrites();
    };

    const handleApply = (idx: number, text: string) => {
        setApplied(idx);
        onApply(text);
        setTimeout(() => setExpanded(false), 600);
    };

    const handleApplyQuantified = () => {
        if (!quantified) return;
        setQuantApplied(true);
        onApply(quantified);
        setTimeout(() => setExpanded(false), 600);
    };

    return (
        <div className={`rounded-lg border-l-4 ${meta.colour} ${meta.border} mb-1.5 overflow-hidden transition-all`}>
            <button
                onClick={handleExpand}
                className="w-full text-left px-3 py-2 flex items-start gap-2 group"
            >
                <span className={`flex-shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.badge}`}>
                    {meta.label}
                </span>
                <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed flex-1 min-w-0">
                    {ann.text}
                </span>
                <span className="flex-shrink-0 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 text-xs mt-0.5">
                    {expanded ? '▲' : '▼'}
                </span>
            </button>

            {expanded && (
                <div className="px-3 pb-3 space-y-2">
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic">{meta.tip}</p>

                    {ann.primaryIssue === 'good' ? (
                        <p className="text-[11px] text-green-600 dark:text-green-400">
                            This bullet passes all checks. No rewrite needed.
                        </p>
                    ) : loading ? (
                        <div className="flex items-center gap-2 py-1">
                            <span className="inline-block w-3 h-3 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
                            <span className="text-[11px] text-zinc-500">Getting rewrites…</span>
                        </div>
                    ) : rewrites && rewrites.length > 0 ? (
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                Choose a rewrite:
                            </p>
                            {rewrites.map((rw, i) => (
                                <div key={i} className="flex items-start gap-2 group/rw">
                                    <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 text-[9px] font-bold flex items-center justify-center">
                                        {i + 1}
                                    </span>
                                    <p className="flex-1 text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
                                        {rw}
                                    </p>
                                    <button
                                        onClick={() => handleApply(i, rw)}
                                        className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                                            applied === i
                                                ? 'bg-green-500 text-white'
                                                : 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-800/60'
                                        }`}
                                    >
                                        {applied === i ? '✓ Applied' : 'Use this'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : rewrites !== null && rewrites.length === 0 ? (
                        <p className="text-[11px] text-red-500">Could not generate rewrites — try again.</p>
                    ) : null}

                    {/* ── Quantified suggestion (no_metric bullets only) ── */}
                    {isNoMetric && (
                        <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2.5 space-y-2">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                    ⚡ With metric
                                </span>
                                <span className="text-[9px] text-amber-600 dark:text-amber-500 italic">
                                    — AI suggestion, verify numbers before using
                                </span>
                            </div>

                            {quantLoading ? (
                                <div className="flex items-center gap-2">
                                    <span className="inline-block w-3 h-3 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                                    <span className="text-[11px] text-amber-600 dark:text-amber-400">Generating metric suggestion…</span>
                                </div>
                            ) : quantified ? (
                                <div className="flex items-start gap-2">
                                    <p className="flex-1 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
                                        {quantified}
                                    </p>
                                    <button
                                        onClick={handleApplyQuantified}
                                        className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                                            quantApplied
                                                ? 'bg-green-500 text-white'
                                                : 'bg-amber-200 dark:bg-amber-800/60 text-amber-800 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-700/60'
                                        }`}
                                    >
                                        {quantApplied ? '✓ Applied' : 'Use this'}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => {
                                        setQuantLoading(true);
                                        suggestQuantifiedBullet(ann.text, role, cv, jobDescription)
                                            .then(setQuantified)
                                            .catch(() => setQuantified(null))
                                            .finally(() => setQuantLoading(false));
                                    }}
                                    className="text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 underline"
                                >
                                    Generate metric suggestion
                                </button>
                            )}
                        </div>
                    )}

                    {ann.primaryIssue !== 'good' && (
                        <button
                            onClick={() => fetchRewrites()}
                            disabled={loading}
                            className="text-[10px] text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 underline disabled:opacity-40"
                        >
                            {loading ? 'Loading…' : rewrites !== null ? 'Refresh rewrites' : 'Get rewrites'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Main panel ───────────────────────────────────────────────────────────────

const PARAPHRASE_TONES: { id: ParaphraseTone; label: string; desc: string; emoji: string }[] = [
    { id: 'professional', label: 'Professional',  desc: 'Formal, polished',    emoji: '💼' },
    { id: 'concise',      label: 'Concise',        desc: 'Shorter, punchy',     emoji: '⚡' },
    { id: 'creative',     label: 'Creative',       desc: 'Dynamic, engaging',   emoji: '✨' },
    { id: 'ats-friendly', label: 'ATS-Friendly',   desc: 'Keyword-optimised',   emoji: '🎯' },
];

type Tab = 'scan' | 'bullets' | 'changes' | 'paraphrase';

const CVDoctorPanel: React.FC<Props> = ({ cv, jobDescription, diff, onApplyBullet, onClose, onUpdateCV }) => {
    const [activeTab, setActiveTab] = useState<Tab>(diff && diff.totalChanges > 0 ? 'changes' : 'scan');
    const [scan,      setScan]      = useState<CVDoctorScan | null>(null);
    const [scanLoading, setScanLoading] = useState(false);
    const [scanError,   setScanError]   = useState<string | null>(null);
    const [diffExpanded, setDiffExpanded] = useState<Set<number>>(new Set());

    // Batch rewrite state
    const [isRewritingAll,   setIsRewritingAll]   = useState(false);
    const [batchDoneCount,   setBatchDoneCount]   = useState<number | null>(null);
    const [batchError,       setBatchError]       = useState<string | null>(null);

    // Dedup skills state
    const [dedupDone, setDedupDone] = useState(false);
    const handleCleanDuplicates = useCallback(() => {
        if (!onUpdateCV) return;
        const cleaned = deduplicateSkills(cv.skills || []);
        onUpdateCV({ ...cv, skills: cleaned });
        setDedupDone(true);
        setTimeout(() => setDedupDone(false), 3000);
    }, [cv, onUpdateCV]);
    // Track which bullets have been batch-rewritten so they show green
    const [batchApplied,     setBatchApplied]     = useState<Set<string>>(new Set());

    // Paraphraser state
    const [paraInput,    setParaInput]    = useState('');
    const [paraOutput,   setParaOutput]   = useState('');
    const [paraTone,     setParaTone]     = useState<ParaphraseTone>('professional');
    const [paraLoading,  setParaLoading]  = useState(false);
    const [paraCopied,   setParaCopied]   = useState(false);

    const handleParaphrase = useCallback(async () => {
        if (!paraInput.trim()) return;
        setParaLoading(true);
        setParaOutput('');
        try {
            const result = await paraphraseText(paraInput, paraTone, jobDescription ?? '');
            setParaOutput(result);
        } catch {
            setParaOutput('Paraphrasing failed — please try again.');
        } finally {
            setParaLoading(false);
        }
    }, [paraInput, paraTone, jobDescription]);

    const copyParaOutput = async () => {
        if (!paraOutput) return;
        await navigator.clipboard.writeText(paraOutput);
        setParaCopied(true);
        setTimeout(() => setParaCopied(false), 2000);
    };

    const annotations = React.useMemo(() => classifyBullets(cv), [cv]);
    const goodCount   = annotations.filter(a => a.primaryIssue === 'good').length;
    const issueCount  = annotations.length - goodCount;

    const handleRewriteAll = useCallback(async () => {
        setIsRewritingAll(true);
        setBatchDoneCount(null);
        setBatchError(null);
        try {
            const result = await rewriteAllFlaggedBullets(annotations, cv, jobDescription);
            const applied = new Set<string>();
            result.applied.forEach(entry => {
                onApplyBullet(entry.roleIndex, entry.bulletIndex, entry.newText);
                applied.add(`${entry.roleIndex}_${entry.bulletIndex}`);
            });
            setBatchApplied(applied);
            setBatchDoneCount(result.applied.length);
            if (result.failedCount > 0) {
                setBatchError(`${result.failedCount} bullet${result.failedCount > 1 ? 's' : ''} could not be rewritten — apply them individually below.`);
            }
        } catch (err: any) {
            setBatchError(err?.message?.substring(0, 100) ?? 'Batch rewrite failed. Try again or fix bullets individually.');
        } finally {
            setIsRewritingAll(false);
        }
    }, [annotations, cv, jobDescription, onApplyBullet]);

    const hasScan = useRef(false);
    // The JD string that was active when the last scan ran — used to detect staleness
    const lastScanJD = useRef<string>('');
    // Show a "JD changed" prompt when the JD is swapped after a scan has run
    const [jdChangedSinceLastScan, setJdChangedSinceLastScan] = useState(false);

    // When jobDescription changes after a scan has already run, mark the scan as stale
    // so the user is prompted to re-run (instead of silently showing stale results)
    useEffect(() => {
        if (hasScan.current && (jobDescription ?? '') !== lastScanJD.current) {
            setJdChangedSinceLastScan(true);
        }
    }, [jobDescription]);

    const triggerScan = useCallback(() => {
        hasScan.current = true;
        lastScanJD.current = jobDescription ?? '';
        setJdChangedSinceLastScan(false);
        setScan(null);
        setScanLoading(true);
        setScanError(null);
        scanCVForDoctor(cv, jobDescription)
            .then(setScan)
            .catch(err => setScanError(err?.message ?? 'Scan failed — try again.'))
            .finally(() => setScanLoading(false));
    }, [cv, jobDescription]);

    useEffect(() => {
        if (activeTab === 'scan' && !hasScan.current && !scan && !scanLoading) {
            triggerScan();
        }
    }, [activeTab, triggerScan, scan, scanLoading]);

    const tabs: { id: Tab; label: string; count?: number }[] = [
        { id: 'scan',       label: 'Smart Review' },
        { id: 'bullets',    label: 'Bullets', count: issueCount > 0 ? issueCount : undefined },
        { id: 'paraphrase', label: 'Paraphraser' },
        ...(diff && diff.totalChanges > 0 ? [{ id: 'changes' as Tab, label: 'What Changed', count: diff.totalChanges }] : []),
    ];

    return (
        <div className="fixed inset-0 z-50 flex flex-col sm:flex-row sm:justify-end pointer-events-none">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
                onClick={onClose}
            />

            {/* Panel — bottom sheet on mobile, right drawer on sm+ */}
            <div className="relative pointer-events-auto
                w-full sm:max-w-xl
                h-[92dvh] sm:h-full
                mt-auto sm:mt-0
                bg-white dark:bg-neutral-900
                rounded-t-2xl sm:rounded-none
                shadow-[0_-8px_40px_rgba(0,0,0,0.18)] sm:shadow-[-8px_0_40px_rgba(0,0,0,0.12)]
                flex flex-col overflow-hidden
                animate-slide-in-bottom sm:animate-slide-in-right
            ">
                {/* Mobile drag handle */}
                <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-neutral-600" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 sm:py-4 border-b border-zinc-200 dark:border-neutral-700 bg-gradient-to-r from-violet-600 to-violet-500 dark:from-violet-800 dark:to-violet-700 flex-shrink-0">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                            <span>⚕</span>
                            CV Doctor
                            {issueCount > 0 && (
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black">
                                    {issueCount} issue{issueCount > 1 ? 's' : ''}
                                </span>
                            )}
                        </h2>
                        <p className="text-xs text-violet-100 mt-0.5">
                            {annotations.length} bullets · {goodCount} strong · {issueCount} flagged
                        </p>
                        {/* JD context indicator — shows which JD the Doctor is working from */}
                        <p className="text-[10px] text-violet-200/80 mt-1 truncate max-w-[260px]">
                            {jobDescription?.trim()
                                ? `📋 ${jobDescription.trim().substring(0, 60).replace(/\n/g, ' ')}${jobDescription.trim().length > 60 ? '…' : ''}`
                                : '📋 General review — no JD pasted'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white text-sm font-bold transition-colors"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-zinc-200 dark:border-neutral-700 flex-shrink-0 bg-zinc-50 dark:bg-neutral-800/50">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-3 text-xs font-bold relative transition-colors ${
                                activeTab === tab.id
                                    ? 'text-violet-700 dark:text-violet-300 border-b-2 border-violet-500 bg-white dark:bg-neutral-900'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                            }`}
                        >
                            {tab.label}
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black">
                                    {tab.count > 9 ? '9+' : tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {/* ── SCAN TAB ── */}
                    {activeTab === 'scan' && (
                        <>
                            {/* JD changed banner — appears when the JD is updated after a scan ran */}
                            {jdChangedSinceLastScan && !scanLoading && (
                                <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Job description changed</p>
                                        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                                            This review was run against a different JD. Re-scan to get tailored results for the current one.
                                        </p>
                                    </div>
                                    <button
                                        onClick={triggerScan}
                                        className="flex-shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                                    >
                                        Re-scan now
                                    </button>
                                </div>
                            )}

                            {scanLoading && (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <span className="inline-block w-8 h-8 rounded-full border-3 border-violet-400 border-t-transparent animate-spin" style={{ borderWidth: '3px' }} />
                                    <p className="text-sm text-zinc-500">
                                        {jobDescription?.trim() ? 'Reviewing CV against job description…' : 'Reviewing your CV…'}
                                    </p>
                                </div>
                            )}

                            {scanError && (
                                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
                                    {scanError}
                                    <button
                                        onClick={triggerScan}
                                        className="block mt-2 text-xs underline"
                                    >
                                        Try again
                                    </button>
                                </div>
                            )}

                            {scan && !scanLoading && (
                                <div className="space-y-5">
                                    {/* Metric coverage banner */}
                                    {scan.noMetricCount > 0 && (
                                        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-3">
                                            <span className="flex-shrink-0 text-2xl">📊</span>
                                            <div>
                                                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                                                    {scan.noMetricCount} bullet{scan.noMetricCount > 1 ? 's' : ''} have no number
                                                </p>
                                                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                                                    Go to the <strong>Bullets</strong> tab and click any amber bullet to get rewrite options — including a suggested metric version.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Quick Wins */}
                                    {scan.quickWins.length > 0 && (
                                        <ScanSection
                                            title="Quick Wins"
                                            icon="⚡"
                                            colour="violet"
                                            items={scan.quickWins}
                                            description="High-impact improvements with immediate effect."
                                        />
                                    )}
                                    {scan.toAdd.length > 0 && (
                                        <ScanSection
                                            title="Strengthen With"
                                            icon="＋"
                                            colour="green"
                                            items={scan.toAdd}
                                            description="Elements currently missing that would make this CV more compelling."
                                        />
                                    )}
                                    {scan.toRemove.length > 0 && (
                                        <ScanSection
                                            title="Simplify By Removing"
                                            icon="✂"
                                            colour="red"
                                            items={scan.toRemove}
                                            description="Content that dilutes your story or takes up valuable space."
                                        />
                                    )}

                                    {/* Duplicate skills */}
                                    {scan.duplicateSkills.length > 0 && (
                                        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">♻</span>
                                                    <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300">Duplicate / Redundant Skills</h3>
                                                </div>
                                                {onUpdateCV && (
                                                    <button
                                                        onClick={handleCleanDuplicates}
                                                        className={`flex-shrink-0 text-[10px] font-bold px-3 py-1 rounded-lg transition-colors ${
                                                            dedupDone
                                                                ? 'bg-green-500 text-white'
                                                                : 'bg-amber-500 hover:bg-amber-600 text-white'
                                                        }`}
                                                    >
                                                        {dedupDone ? '✓ Cleaned!' : 'Clean now'}
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-3">Similar skills listed separately — merge them into one clear term.</p>
                                            <ul className="space-y-2">
                                                {scan.duplicateSkills.map((item, i) => (
                                                    <li key={i} className="flex items-start gap-2">
                                                        <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                                                        <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Summary issues */}
                                    {scan.summaryIssues.length > 0 && (
                                        <ScanSection
                                            title="Summary Needs Work"
                                            icon="✍"
                                            colour="amber"
                                            items={scan.summaryIssues}
                                            description="Your opening summary is the first thing a recruiter reads — make every sentence count."
                                        />
                                    )}

                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center pt-2">
                                        Review suggestions — apply what fits your story and skip what doesn't.
                                    </p>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── BULLETS TAB ── */}
                    {activeTab === 'bullets' && (
                        <div className="space-y-4">
                            {/* Rewrite All Flagged banner — shown only when there are issues */}
                            {issueCount > 0 && (
                                <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-gradient-to-r from-violet-50 to-white dark:from-violet-900/20 dark:to-neutral-900 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                                                {issueCount} bullet{issueCount > 1 ? 's' : ''} flagged
                                            </p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                                Fix all in one go — the highest-severity issues are prioritised.
                                                {issueCount > 20 && ' Top 20 will be fixed first.'}
                                            </p>
                                            {batchDoneCount !== null && (
                                                <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-1.5">
                                                    ✓ {batchDoneCount} bullet{batchDoneCount > 1 ? 's' : ''} rewritten successfully
                                                </p>
                                            )}
                                            {batchError && (
                                                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">{batchError}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleRewriteAll}
                                            disabled={isRewritingAll}
                                            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white transition-colors shadow-sm disabled:cursor-not-allowed"
                                        >
                                            {isRewritingAll ? (
                                                <>
                                                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                                    </svg>
                                                    Rewriting…
                                                </>
                                            ) : batchDoneCount !== null ? (
                                                <>
                                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                                                    Rewrite Again
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                                    Rewrite All Flagged
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Legend */}
                            <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/50 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Colour key</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                    {LEGEND.map(l => (
                                        <div key={l.type} className="flex items-center gap-1.5">
                                            <span className={`w-2 h-2 rounded-full ${l.type === 'good' ? 'bg-green-400' : l.type === 'no_metric' ? 'bg-amber-400' : l.type === 'too_short' ? 'bg-blue-400' : l.type === 'weak_verb' ? 'bg-orange-400' : 'bg-red-400'}`} />
                                            <span className="text-[10px] text-zinc-600 dark:text-zinc-400">{l.label}</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">Click any bullet to see rewrite options.</p>
                            </div>

                            {/* Bullets grouped by role */}
                            {cv.experience.map((role, rIdx) => {
                                const roleBullets = annotations.filter(a => a.roleIndex === rIdx);
                                if (roleBullets.length === 0) return null;
                                const roleIssues = roleBullets.filter(a => a.primaryIssue !== 'good').length;
                                return (
                                    <div key={rIdx}>
                                        <div className="flex items-baseline gap-2 mb-2">
                                            <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{role.jobTitle}</h3>
                                            <span className="text-[10px] text-zinc-400">at {role.company}</span>
                                            {roleIssues > 0 && (
                                                <span className="ml-auto text-[10px] font-bold text-red-500">{roleIssues} issue{roleIssues > 1 ? 's' : ''}</span>
                                            )}
                                        </div>
                                        {roleBullets.map(ann => (
                                            <BulletRow
                                                key={`${ann.roleIndex}-${ann.bulletIndex}`}
                                                ann={ann}
                                                role={role}
                                                cv={cv}
                                                jobDescription={jobDescription}
                                                onApply={text => onApplyBullet(ann.roleIndex, ann.bulletIndex, text)}
                                            />
                                        ))}
                                    </div>
                                );
                            })}

                            {annotations.length === 0 && (
                                <p className="text-sm text-zinc-500 text-center py-8">No bullets to review yet. Generate a CV first.</p>
                            )}
                        </div>
                    )}

                    {/* ── PARAPHRASER TAB ── */}
                    {activeTab === 'paraphrase' && (
                        <div className="space-y-4">
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Paste any text below — a bullet point, summary, or paragraph — and the AI will rewrite it in your chosen tone.
                            </p>

                            {/* Tone selector */}
                            <div className="grid grid-cols-2 gap-2">
                                {PARAPHRASE_TONES.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setParaTone(t.id)}
                                        className={`text-left p-2.5 rounded-xl border-2 transition-all text-xs
                                            ${paraTone === t.id
                                                ? 'border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20'
                                                : 'border-zinc-200 dark:border-neutral-700 hover:border-zinc-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-800/40'
                                            }`}
                                    >
                                        <span className="block text-base mb-0.5">{t.emoji}</span>
                                        <span className={`font-bold ${paraTone === t.id ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300'}`}>{t.label}</span>
                                        <span className={`block text-[10px] ${paraTone === t.id ? 'text-violet-500 dark:text-violet-400' : 'text-zinc-400 dark:text-zinc-500'}`}>{t.desc}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Input */}
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Your Text</label>
                                <textarea
                                    rows={4}
                                    value={paraInput}
                                    onChange={e => setParaInput(e.target.value)}
                                    placeholder="Paste a bullet, summary line, or any text here…"
                                    className="w-full text-xs rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2.5 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                />
                            </div>

                            <button
                                onClick={handleParaphrase}
                                disabled={!paraInput.trim() || paraLoading}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white transition-colors disabled:cursor-not-allowed shadow-sm"
                            >
                                {paraLoading ? (
                                    <>
                                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                        </svg>
                                        Paraphrasing…
                                    </>
                                ) : '🔄 Paraphrase'}
                            </button>

                            {/* Output */}
                            {paraOutput && (
                                <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400">Result</p>
                                        <button
                                            onClick={copyParaOutput}
                                            className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-violet-100 dark:bg-violet-800/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-700/40 transition-colors"
                                        >
                                            {paraCopied ? '✓ Copied!' : '⎘ Copy'}
                                        </button>
                                    </div>
                                    <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">{paraOutput}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── CHANGES TAB ── */}
                    {activeTab === 'changes' && (
                        <div className="space-y-4">
                            {(!diff || diff.totalChanges === 0) ? (
                                <p className="text-sm text-zinc-500 text-center py-8">
                                    No changes yet. Run Auto-Optimize to see what the AI fixed.
                                </p>
                            ) : (
                                <>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                        Auto-Optimize made <span className="font-bold text-violet-600 dark:text-violet-400">{diff.totalChanges} change{diff.totalChanges > 1 ? 's' : ''}</span> to your CV.
                                    </p>

                                    {diff.fixedSummary && (
                                        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">Summary updated</p>
                                            <p className="text-xs text-zinc-600 dark:text-zinc-400">The professional summary was cleaned up.</p>
                                        </div>
                                    )}

                                    {diff.addedDates.map((d, i) => (
                                        <div key={i} className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
                                            <p className="text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400 mb-1">Date added</p>
                                            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{d.roleName}</p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{d.dates}</p>
                                        </div>
                                    ))}

                                    {diff.changedBullets.map((c, i) => (
                                        <div key={i} className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden">
                                            <button
                                                onClick={() => setDiffExpanded(prev => {
                                                    const next = new Set(prev);
                                                    next.has(i) ? next.delete(i) : next.add(i);
                                                    return next;
                                                })}
                                                className="w-full flex items-center justify-between px-3 py-2 text-left"
                                            >
                                                <div>
                                                    <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{c.roleName}</p>
                                                    <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-0.5">Bullet {c.bulletIndex + 1} changed</p>
                                                </div>
                                                <span className="text-zinc-400 text-xs">{diffExpanded.has(i) ? '▲' : '▼'}</span>
                                            </button>

                                            {diffExpanded.has(i) && (
                                                <div className="px-3 pb-3 space-y-2">
                                                    {c.before && (
                                                        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2">
                                                            <p className="text-[9px] font-bold uppercase tracking-wide text-red-500 mb-1">Before</p>
                                                            <p className="text-[11px] text-red-800 dark:text-red-300 leading-relaxed line-through opacity-75">{c.before}</p>
                                                        </div>
                                                    )}
                                                    <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-2">
                                                        <p className="text-[9px] font-bold uppercase tracking-wide text-green-600 mb-1">After</p>
                                                        <p className="text-[11px] text-green-800 dark:text-green-300 leading-relaxed">{c.after}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Scan section sub-component ───────────────────────────────────────────────

const COLOUR_MAP = {
    violet: { bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800', title: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-400' },
    green:  { bg: 'bg-green-50 dark:bg-green-900/20',   border: 'border-green-200 dark:border-green-800',   title: 'text-green-700 dark:text-green-300',   dot: 'bg-green-400' },
    red:    { bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200 dark:border-red-800',       title: 'text-red-700 dark:text-red-300',       dot: 'bg-red-400' },
    amber:  { bg: 'bg-amber-50 dark:bg-amber-900/20',   border: 'border-amber-200 dark:border-amber-800',   title: 'text-amber-700 dark:text-amber-300',   dot: 'bg-amber-400' },
};

const ScanSection: React.FC<{
    title:       string;
    icon:        string;
    colour:      keyof typeof COLOUR_MAP;
    items:       string[];
    description: string;
}> = ({ title, icon, colour, items, description }) => {
    const c = COLOUR_MAP[colour];
    return (
        <div className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
            <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{icon}</span>
                <h3 className={`text-sm font-bold ${c.title}`}>{title}</h3>
            </div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-3">{description}</p>
            <ul className="space-y-2">
                {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                        <span className={`flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${c.dot}`} />
                        <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default CVDoctorPanel;
