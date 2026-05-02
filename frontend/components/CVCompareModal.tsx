/**
 * CVCompareModal.tsx
 *
 * Side-by-side ATS keyword coverage and writing-quality comparison between the
 * current CV in the editor and any saved CV from the user's history.
 *
 * When a job description is present each column shows:
 *   • ATS keyword match % + colour-coded bar
 *   • "✦ Only in this version" chip row — keywords this version covers that
 *     the other misses (the key signal for choosing which draft to submit)
 *   • All matched keywords (exclusive ones highlighted, shared ones muted)
 *   • Missing keywords in amber chips
 *
 * Without a JD only writing-quality scores are compared side-by-side.
 */

import React, { useState, useMemo } from 'react';
import { X, AlertTriangle } from './icons';
import type { CVData, SavedCV } from '../types';
import { auditCvQuality, type CvQualityReport } from '../services/cvNumberFidelity';
import { scoreAtsCoverage, type AtsKeywordReport } from '../services/cvAtsKeywords';

// ─────────────────────────────────────────────────────────────────────────────
// CvColumn — one side of the comparison
// ─────────────────────────────────────────────────────────────────────────────

interface ColumnProps {
    label: string;
    sublabel: string;
    quality: CvQualityReport;
    ats: AtsKeywordReport | null;
    /** Keywords matched here that are MISSING from the other version. */
    exclusiveMatches: string[];
    isWinner: boolean;
    hasJd: boolean;
    actionLabel?: string;
    onAction?: () => void;
}

function CvColumn({
    label, sublabel, quality, ats, exclusiveMatches, isWinner, hasJd, actionLabel, onAction,
}: ColumnProps) {
    const exclusiveSet = new Set(exclusiveMatches);

    const qColor =
        quality.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
        quality.score >= 60 ? 'text-amber-500 dark:text-amber-400' :
        'text-rose-500 dark:text-rose-400';

    const atsColor = ats
        ? ats.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
          ats.score >= 60 ? 'text-amber-500 dark:text-amber-400' :
          'text-rose-500 dark:text-rose-400'
        : '';

    const barColor = ats
        ? ats.score >= 80 ? 'bg-emerald-500' :
          ats.score >= 60 ? 'bg-amber-400' : 'bg-rose-400'
        : '';

    return (
        <div className={`p-6 flex flex-col gap-4 ${isWinner ? 'bg-emerald-50/40 dark:bg-emerald-900/5' : ''}`}>
            {/* Header */}
            <div className="flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                        <span className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                            {label}
                        </span>
                        {isWinner && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-700/60">
                                ★ Better {hasJd ? 'ATS match' : 'quality'}
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{sublabel}</p>
                </div>
            </div>

            {/* Score row */}
            <div className="flex gap-6 items-end">
                <div>
                    <div className={`text-4xl font-bold tabular-nums leading-none ${qColor}`}>
                        {quality.score}
                    </div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">Quality score</div>
                </div>
                {ats && (
                    <div>
                        <div className={`text-4xl font-bold tabular-nums leading-none ${atsColor}`}>
                            {ats.score}%
                        </div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">ATS match</div>
                    </div>
                )}
            </div>

            {/* ATS bar */}
            {ats && (
                <div>
                    <div className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${Math.max(2, ats.score)}%` }}
                        />
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                        {ats.matched.length} of {ats.keywords.length} JD keywords matched
                    </p>
                </div>
            )}

            {/* ✦ Exclusive matches — the key hiring signal */}
            {exclusiveMatches.length > 0 && (
                <div>
                    <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">
                        ✦ Only in this version ({exclusiveMatches.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {exclusiveMatches.map(kw => (
                            <span
                                key={kw}
                                className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-semibold"
                            >
                                {kw}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* All matched (exclusive highlighted, shared muted) */}
            {ats && ats.matched.length > 0 && (
                <div>
                    <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1.5">
                        Matched ({ats.matched.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {ats.matched.map(kw => (
                            <span
                                key={kw}
                                className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                    exclusiveSet.has(kw)
                                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60 font-semibold'
                                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700'
                                }`}
                            >
                                {kw}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Missing */}
            {ats && ats.missing.length > 0 && (
                <div>
                    <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mb-1.5">
                        Missing ({ats.missing.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {ats.missing.map(kw => (
                            <span
                                key={kw}
                                className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700/40"
                            >
                                {kw}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Writing issues summary */}
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                {quality.totalIssues === 0
                    ? `No writing issues across ${quality.totalBullets} bullet${quality.totalBullets === 1 ? '' : 's'}.`
                    : `${quality.totalIssues} writing issue${quality.totalIssues === 1 ? '' : 's'} across ${quality.totalBullets} bullet${quality.totalBullets === 1 ? '' : 's'}.`}
            </p>

            {/* Switch-to-this-version action */}
            {actionLabel && onAction && (
                <button
                    onClick={onAction}
                    className="mt-auto w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-semibold transition-colors"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CVCompareModal — main export
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    open: boolean;
    onClose: () => void;
    currentCv: CVData;
    savedCVs: SavedCV[];
    jd: string;
    onSelectSaved: (cv: CVData) => void;
}

const PURPOSE_EMOJI: Record<string, string> = {
    job: '💼', academic: '🎓', general: '📄',
};

export default function CVCompareModal({
    open, onClose, currentCv, savedCVs, jd, onSelectSaved,
}: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const selectedSaved = useMemo(
        () => savedCVs.find(s => s.id === selectedId) ?? null,
        [savedCVs, selectedId],
    );

    const hasJd = jd.trim().length > 0;

    // Quality — recomputed from live CV data on open
    const qualityA = useMemo(() => auditCvQuality(currentCv), [currentCv]);
    const qualityB = useMemo(
        () => (selectedSaved ? auditCvQuality(selectedSaved.data) : null),
        [selectedSaved],
    );

    // ATS coverage — O(keywords × cvText), fully deterministic
    const atsA = useMemo(
        () => (hasJd ? scoreAtsCoverage(currentCv, jd) : null),
        [currentCv, jd, hasJd],
    );
    const atsB = useMemo(
        () => (hasJd && selectedSaved ? scoreAtsCoverage(selectedSaved.data, jd) : null),
        [selectedSaved, jd, hasJd],
    );

    // Exclusive keyword sets — what each version has that the other doesn't
    const setA = useMemo(() => new Set(atsA?.matched ?? []), [atsA]);
    const setB = useMemo(() => new Set(atsB?.matched ?? []), [atsB]);
    const exclusiveA = useMemo(
        () => (atsA?.matched ?? []).filter(k => !setB.has(k)),
        [atsA, setB],
    );
    const exclusiveB = useMemo(
        () => (atsB?.matched ?? []).filter(k => !setA.has(k)),
        [atsB, setA],
    );

    // Winner: ATS score when JD available, quality score otherwise
    const aScore = hasJd ? (atsA?.score ?? 0) : qualityA.score;
    const bScore = hasJd ? (atsB?.score ?? 0) : (qualityB?.score ?? 0);
    const aWins = selectedSaved !== null && aScore > bScore;
    const bWins = selectedSaved !== null && bScore > aScore;

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="w-full max-w-5xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 my-8">

                {/* ── Header ────────────────────────────────────────────────── */}
                <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
                    <div>
                        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                            CV version comparison
                            {hasJd ? ' — ATS keyword match' : ' — Quality scores'}
                        </h2>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                            {hasJd
                                ? 'Select a saved version below to see which draft covers more JD keywords before you submit.'
                                : 'Paste a job description in the generator to also compare ATS keyword coverage.'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-4 shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        aria-label="Close comparison"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* ── Saved CV picker ────────────────────────────────────────── */}
                <div className="px-6 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-800/30">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-2">
                        Compare current CV against:
                    </p>
                    {savedCVs.length === 0 ? (
                        <p className="text-xs text-neutral-400 dark:text-neutral-500 italic">
                            No saved CVs yet. Use "Save CV" in the generator to build up versions to compare.
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {savedCVs.map(s => {
                                const title = s.name || s.data.experience?.[0]?.jobTitle || 'Untitled';
                                const emoji = PURPOSE_EMOJI[s.purpose] ?? '📄';
                                const date = new Date(s.createdAt).toLocaleDateString(undefined, {
                                    month: 'short', day: 'numeric',
                                });
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                                            s.id === selectedId
                                                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                                                : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-violet-400 dark:hover:border-violet-500 hover:text-violet-700 dark:hover:text-violet-400'
                                        }`}
                                    >
                                        {emoji} {title}
                                        <span className="ml-1.5 opacity-60">{date}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Two-column comparison ─────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-200 dark:divide-neutral-700">
                    <CvColumn
                        label="Current CV"
                        sublabel="Being edited now"
                        quality={qualityA}
                        ats={atsA}
                        exclusiveMatches={exclusiveA}
                        isWinner={aWins}
                        hasJd={hasJd}
                    />

                    {selectedSaved && qualityB ? (
                        <CvColumn
                            label={
                                selectedSaved.name ||
                                selectedSaved.data.experience?.[0]?.jobTitle ||
                                'Saved CV'
                            }
                            sublabel={`${PURPOSE_EMOJI[selectedSaved.purpose] ?? '📄'} ${selectedSaved.purpose} · ${new Date(selectedSaved.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`}
                            quality={qualityB}
                            ats={atsB}
                            exclusiveMatches={exclusiveB}
                            isWinner={bWins}
                            hasJd={hasJd}
                            actionLabel="Switch to this version"
                            onAction={() => { onSelectSaved(selectedSaved.data); onClose(); }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center p-12 text-center">
                            <AlertTriangle className="h-10 w-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3 opacity-50" />
                            <p className="text-sm text-neutral-400 dark:text-neutral-500">
                                Select a saved CV above to see the comparison.
                            </p>
                        </div>
                    )}
                </div>

                {/* ── Footer tip ────────────────────────────────────────────── */}
                <div className="px-6 py-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-800/20">
                    <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">✦ Only in this version</span>
                        {' '}chips are the decisive signal — they show keywords a version covers that the other misses. ATS filters rank your CV higher for each keyword it contains.
                    </p>
                </div>
            </div>
        </div>
    );
}
