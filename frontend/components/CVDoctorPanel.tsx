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
    classifyBullets, scanCVForDoctor, rewriteBulletOptions,
    BulletAnnotation, BulletIssueType, CVDoctorScan, CVDiff, ISSUE_META,
} from '../services/cvDoctorService';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    cv:              CVData;
    jobDescription?: string;
    diff?:           CVDiff | null;
    onApplyBullet:   (roleIndex: number, bulletIndex: number, newText: string) => void;
    onClose:         () => void;
}

// ─── Colour legend items ──────────────────────────────────────────────────────

const LEGEND: { type: BulletIssueType; label: string }[] = [
    { type: 'ai_language',  label: 'AI buzzword / 3rd-person verb' },
    { type: 'weak_verb',    label: 'Weak opener' },
    { type: 'no_metric',    label: 'No number / metric' },
    { type: 'too_short',    label: 'Too short or too long' },
    { type: 'good',         label: 'Looks good' },
];

// ─── Sub-component: single colour-coded bullet row ────────────────────────────

const BulletRow: React.FC<{
    ann:          BulletAnnotation;
    role:         CVData['experience'][number];
    jobDescription?: string;
    onApply:      (text: string) => void;
}> = ({ ann, role, jobDescription, onApply }) => {
    const [expanded,  setExpanded]  = useState(false);
    const [rewrites,  setRewrites]  = useState<string[] | null>(null);
    const [loading,   setLoading]   = useState(false);
    const [applied,   setApplied]   = useState<number | null>(null);
    const meta = ISSUE_META[ann.primaryIssue];

    const fetchRewrites = useCallback(async () => {
        if (rewrites !== null || loading) return;
        setLoading(true);
        try {
            const opts = await rewriteBulletOptions(ann.text, role, ann.issues, jobDescription);
            setRewrites(opts);
        } catch {
            setRewrites([]);
        } finally {
            setLoading(false);
        }
    }, [ann, role, jobDescription, rewrites, loading]);

    const handleExpand = () => {
        setExpanded(e => !e);
        if (!expanded && rewrites === null) fetchRewrites();
    };

    const handleApply = (idx: number, text: string) => {
        setApplied(idx);
        onApply(text);
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

type Tab = 'scan' | 'bullets' | 'changes';

const CVDoctorPanel: React.FC<Props> = ({ cv, jobDescription, diff, onApplyBullet, onClose }) => {
    const [activeTab, setActiveTab] = useState<Tab>(diff && diff.totalChanges > 0 ? 'changes' : 'scan');
    const [scan,      setScan]      = useState<CVDoctorScan | null>(null);
    const [scanLoading, setScanLoading] = useState(false);
    const [scanError,   setScanError]   = useState<string | null>(null);
    const [diffExpanded, setDiffExpanded] = useState<Set<number>>(new Set());

    const annotations = React.useMemo(() => classifyBullets(cv), [cv]);
    const goodCount   = annotations.filter(a => a.primaryIssue === 'good').length;
    const issueCount  = annotations.length - goodCount;

    const hasScan = useRef(false);

    useEffect(() => {
        if (activeTab === 'scan' && !hasScan.current && !scan && !scanLoading) {
            hasScan.current = true;
            setScanLoading(true);
            setScanError(null);
            scanCVForDoctor(cv, jobDescription)
                .then(setScan)
                .catch(err => setScanError(err?.message ?? 'Scan failed — try again.'))
                .finally(() => setScanLoading(false));
        }
    }, [activeTab, cv, jobDescription, scan, scanLoading]);

    const tabs: { id: Tab; label: string; count?: number }[] = [
        { id: 'scan',    label: 'Smart Review' },
        { id: 'bullets', label: 'Bullets', count: issueCount > 0 ? issueCount : undefined },
        ...(diff && diff.totalChanges > 0 ? [{ id: 'changes' as Tab, label: 'What Changed', count: diff.totalChanges }] : []),
    ];

    return (
        <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm pointer-events-auto"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative pointer-events-auto w-full max-w-xl h-full bg-white dark:bg-neutral-900 shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-neutral-700 bg-gradient-to-r from-violet-50 to-white dark:from-violet-900/20 dark:to-neutral-900 flex-shrink-0">
                    <div>
                        <h2 className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                            <span className="text-violet-600 dark:text-violet-400">⚕</span>
                            CV Doctor
                        </h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            Career review · {annotations.length} bullets · {goodCount} strong · {issueCount} flagged
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-lg font-bold leading-none"
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-zinc-200 dark:border-neutral-700 flex-shrink-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-2.5 text-xs font-bold relative transition-colors ${
                                activeTab === tab.id
                                    ? 'text-violet-700 dark:text-violet-300 border-b-2 border-violet-500'
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
                            {scanLoading && (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <span className="inline-block w-8 h-8 rounded-full border-3 border-violet-400 border-t-transparent animate-spin" style={{ borderWidth: '3px' }} />
                                    <p className="text-sm text-zinc-500">Reviewing your CV…</p>
                                </div>
                            )}

                            {scanError && (
                                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
                                    {scanError}
                                    <button
                                        onClick={() => { hasScan.current = false; setScan(null); setScanError(null); setActiveTab('bullets'); setTimeout(() => setActiveTab('scan'), 50); }}
                                        className="block mt-2 text-xs underline"
                                    >
                                        Try again
                                    </button>
                                </div>
                            )}

                            {scan && !scanLoading && (
                                <div className="space-y-5">
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

                                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center pt-2">
                                        Review suggestions — apply what fits your story and skip what doesn't.
                                    </p>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── BULLETS TAB ── */}
                    {activeTab === 'bullets' && (
                        <div className="space-y-5">
                            {/* Legend */}
                            <div className="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/50 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Colour key</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                    {LEGEND.map(l => {
                                        const m = ISSUE_META[l.type];
                                        return (
                                            <div key={l.type} className="flex items-center gap-1.5">
                                                <span className={`w-2 h-2 rounded-full ${l.type === 'good' ? 'bg-green-400' : l.type === 'no_metric' ? 'bg-amber-400' : l.type === 'too_short' ? 'bg-blue-400' : l.type === 'weak_verb' ? 'bg-orange-400' : 'bg-red-400'}`} />
                                                <span className="text-[10px] text-zinc-600 dark:text-zinc-400">{l.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">Click any bullet to see AI rewrite options.</p>
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
