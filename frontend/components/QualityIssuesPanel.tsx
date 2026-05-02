/**
 * components/QualityIssuesPanel.tsx
 *
 * Modal that lists every quality-audit issue currently present in the CV and
 * offers a per-issue "Fix with AI" button (plus "Fix all"). Replaces the old
 * direct "download JSON report" click — the JSON download is still available
 * here as a secondary action so power users keep their offline audit trail.
 *
 * The panel is driven entirely by the `qualityReport` recomputed in
 * `CVGenerator.tsx` via `auditCvQuality(currentCV)`. When a fix is applied we
 * call `onApplyFix(newCv)` and the parent's audit re-runs automatically — so
 * resolved issues vanish from the list with no extra plumbing.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './ui/Button';
import {
    CheckCircle, AlertTriangle, Sparkles, Download, X, RefreshCw,
} from './icons';
import { CvQualityReport, CvQualityIssue, CvQualityIssueKind } from '../services/cvNumberFidelity';
import { CVData } from '../types';
import type { PurifyLeak } from '../services/cvPurificationPipeline';
import {
    fixCvIssueWithAi, applyFixToCv, getOriginalTextAt, ISSUE_KIND_INSTRUCTIONS,
    insertKeywordIntoBullet,
} from '../services/aiInlineFix';
import {
    scoreAtsCoverage, findBestBulletForKeyword,
    type AtsKeywordReport, type BulletCandidate,
} from '../services/cvAtsKeywords';

interface Props {
    open: boolean;
    onClose: () => void;
    cv: CVData;
    report: CvQualityReport;
    purifyLeaks?: PurifyLeak[];
    /** Job description text — when provided, ATS keyword coverage is shown. */
    jd?: string;
    onApplyFix: (newCv: CVData) => void;
    onDownloadJson: () => void;
}

const KIND_LABEL: Record<CvQualityIssueKind, string> = {
    orphan_currency_comma:       'Currency without amount',
    orphan_currency_word:        'Dangling currency reference',
    orphan_percent:              'Stray "%" without a number',
    orphan_plus:                 'Floating "+" between words',
    orphan_hyphen_noun:          '"-noun" without a number',
    orphan_dollar:               'Stray "$" without an amount',
    stub_bullet:                 'Bullet starts with a preposition',
    empty_bullet:                'Empty bullet',
    duplicate_adjacent_word:     'Duplicate adjacent word',
    mid_sentence_period:         'Stray period mid-sentence',
    first_person_pronoun:        'First-person pronoun ("I", "we", "my")',
    tense_third_person_singular: 'Wrong tense in current role',
    dangling_time_ref:           'Time reference without a number',
    orphan_decimal_stub:         'Decimal stub without leading number (e.g. ".8M")',
    chained_preposition:         'Two prepositions in a row ("by since")',
    unanchored_with_participle:  '"with" + verb-ing without a duration',
    unanchored_hedged_outcome:   'Hedged outcome without a number',
    half_open_range:             'Range "from over X" missing the "to" anchor',
    passive_voice:               'Passive voice — rewrite with an action verb',
    leading_verb_repetition:     'Same opening verb used 3+ times in one role',
};

function AchievementDensityBar({ density }: { density: CvQualityReport['achievementDensity'] }) {
    const { bulletsWithMetrics, totalBullets, percent } = density;
    if (totalBullets === 0) return null;
    const color =
        percent >= 50 ? 'bg-emerald-500' :
        percent >= 30 ? 'bg-amber-400' :
        'bg-rose-400';
    const label =
        percent >= 50 ? 'Good' :
        percent >= 30 ? 'Low' :
        'Very low';
    const tip =
        percent >= 50
            ? 'Over half your bullets contain numbers — recruiters can see measurable impact.'
            : percent >= 30
            ? 'Fewer than half your bullets have a number. Add metrics where possible.'
            : 'Most bullets lack measurable outcomes. Aim for at least 40% with numbers.';
    return (
        <div className="mb-5 rounded-lg border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/40 px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Achievement density
                </span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                    percent >= 50 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                    percent >= 30 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                    'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                }`}>
                    {label} — {bulletsWithMetrics}/{totalBullets} bullets have metrics ({percent}%)
                </span>
            </div>
            <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-neutral-700 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{ width: `${Math.max(2, percent)}%` }}
                />
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">{tip}</p>
        </div>
    );
}

function formatLocation(where: string): string {
    if (where === 'summary') return 'Professional summary';
    const exp = /^experience\[(\d+)\]\s*(.+?)#(\d+)$/.exec(where);
    if (exp) {
        const role = exp[2].trim();
        const bullet = Number(exp[3]) + 1;
        return `Experience #${Number(exp[1]) + 1} — ${role} · bullet ${bullet}`;
    }
    const proj = /^projects\[(\d+)\]\s*(.+)$/.exec(where);
    if (proj) {
        return `Project #${Number(proj[1]) + 1} — ${proj[2].trim()}`;
    }
    return where;
}

interface RowState {
    status: 'idle' | 'fixing' | 'fixed' | 'error';
    error?: string;
    appliedAt?: number;
}

export default function QualityIssuesPanel({
    open, onClose, cv, report, purifyLeaks = [], jd = '', onApplyFix, onDownloadJson,
}: Props) {
    const [rowState, setRowState] = useState<Record<string, RowState>>({});
    const [bulkFixing, setBulkFixing] = useState(false);

    const synonymFixes = useMemo(() =>
        purifyLeaks.filter(l => l.fixedBy === 'synonym_sub'),
    [purifyLeaks]);

    const atsReport = useMemo(
        () => (jd.trim() ? scoreAtsCoverage(cv, jd) : null),
        [cv, jd],
    );

    // ── ATS keyword suggestion state ──────────────────────────────────────────
    type KwStatus = 'idle' | 'loading' | 'done' | 'applied' | 'error';
    type KwState = { status: KwStatus; rewritten?: string; error?: string };
    const [expandedKw, setExpandedKw] = useState<string | null>(null);
    const [kwCandidate, setKwCandidate] = useState<BulletCandidate | null>(null);
    const [kwStates, setKwStates] = useState<Record<string, KwState>>({});

    const handleKwExpand = useCallback((kw: string) => {
        if (expandedKw === kw) { setExpandedKw(null); return; }
        const candidate = findBestBulletForKeyword(cv, kw);
        setKwCandidate(candidate);
        setExpandedKw(kw);
        setKwStates(s => ({ ...s, [kw]: { status: 'idle' } }));
    }, [cv, expandedKw]);

    const handleKwRewrite = useCallback(async (kw: string) => {
        if (!kwCandidate) return;
        setKwStates(s => ({ ...s, [kw]: { status: 'loading' } }));
        try {
            const rewritten = await insertKeywordIntoBullet(kwCandidate.text, kw);
            setKwStates(s => ({ ...s, [kw]: { status: 'done', rewritten } }));
        } catch (e: any) {
            const msg = e?.isUserFacing ? e.message : 'AI rewrite failed — every provider was unavailable.';
            setKwStates(s => ({ ...s, [kw]: { status: 'error', error: msg } }));
        }
    }, [kwCandidate]);

    const handleKwApply = useCallback((kw: string) => {
        const state = kwStates[kw];
        if (!kwCandidate || state?.status !== 'done' || !state.rewritten) return;
        const newCv = applyFixToCv(cv, kwCandidate.where, state.rewritten);
        onApplyFix(newCv);
        setKwStates(s => ({ ...s, [kw]: { status: 'applied' } }));
        setExpandedKw(null);
    }, [cv, kwCandidate, kwStates, onApplyFix]);

    // Stable per-issue key so React doesn't re-shuffle rows when fixes land.
    const issueKey = useCallback(
        (i: CvQualityIssue, idx: number) => `${i.kind}::${i.where}::${idx}`,
        [],
    );

    const grouped = useMemo(() => {
        const buckets: Record<string, CvQualityIssue[]> = {};
        for (const issue of report.issues) {
            const loc = formatLocation(issue.where);
            (buckets[loc] ||= []).push(issue);
        }
        return buckets;
    }, [report]);

    const handleFixOne = useCallback(async (
        issue: CvQualityIssue,
        rowKey: string,
    ) => {
        setRowState(s => ({ ...s, [rowKey]: { status: 'fixing' } }));
        try {
            const original = getOriginalTextAt(cv, issue.where) || issue.snippet;
            const fixed = await fixCvIssueWithAi(original, issue.kind);
            const nextCv = applyFixToCv(cv, issue.where, fixed);
            onApplyFix(nextCv);
            setRowState(s => ({
                ...s,
                [rowKey]: { status: 'fixed', appliedAt: Date.now() },
            }));
        } catch (e: any) {
            const msg = e?.isUserFacing
                ? e.message
                : (e?.message || 'AI fix failed — every provider in the chain was unavailable.');
            setRowState(s => ({ ...s, [rowKey]: { status: 'error', error: msg } }));
        }
    }, [cv, onApplyFix]);

    const handleFixAll = useCallback(async () => {
        if (report.issues.length === 0) return;
        setBulkFixing(true);
        // Walk a SNAPSHOT of the original issues. We pass the live CV into each
        // call so applied fixes accumulate. Stop early on the first hard error.
        let workingCv = cv;
        for (let idx = 0; idx < report.issues.length; idx++) {
            const issue = report.issues[idx];
            const rowKey = issueKey(issue, idx);
            setRowState(s => ({ ...s, [rowKey]: { status: 'fixing' } }));
            try {
                const original = getOriginalTextAt(workingCv, issue.where) || issue.snippet;
                const fixed = await fixCvIssueWithAi(original, issue.kind);
                workingCv = applyFixToCv(workingCv, issue.where, fixed);
                onApplyFix(workingCv);
                setRowState(s => ({
                    ...s,
                    [rowKey]: { status: 'fixed', appliedAt: Date.now() },
                }));
            } catch (e: any) {
                setRowState(s => ({
                    ...s,
                    [rowKey]: {
                        status: 'error',
                        error: e?.message || 'AI fix failed.',
                    },
                }));
                // Quota exhausted = no point continuing, just bail.
                if (/quota|rate|exhaust|429/.test(String(e?.message || ''))) break;
            }
        }
        setBulkFixing(false);
    }, [cv, report, onApplyFix, issueKey]);

    if (!open) return null;

    const allClean = report.totalIssues === 0;
    const hasSynonymFixes = synonymFixes.length > 0;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quality-panel-title"
        >
            <div
                className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-zinc-200 dark:border-neutral-700"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-zinc-200 dark:border-neutral-700 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <h2
                            id="quality-panel-title"
                            className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
                        >
                            {allClean ? (
                                <CheckCircle className="h-5 w-5 text-emerald-500" />
                            ) : (
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                            )}
                            Quality {report.score}/100
                            <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
                                · {report.totalIssues} issue{report.totalIssues === 1 ? '' : 's'} across {report.totalBullets} bullet{report.totalBullets === 1 ? '' : 's'}
                            </span>
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                            {allClean && !hasSynonymFixes
                                ? 'No issues detected. Your CV passes every deterministic rule (numbers, voice, tense, openers).'
                                : allClean && hasSynonymFixes
                                ? `No remaining issues. The pipeline auto-fixed ${synonymFixes.length} overused word${synonymFixes.length === 1 ? '' : 's'} before you saw the CV.`
                                : 'Click "Fix with AI" on any issue to rewrite just that snippet — the rest of the CV stays untouched.'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-neutral-800 text-zinc-500"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Bulk actions */}
                {!allClean && (
                    <div className="px-5 py-3 border-b border-zinc-200 dark:border-neutral-700 flex flex-wrap gap-2 bg-zinc-50 dark:bg-neutral-800/40">
                        <Button
                            size="sm"
                            onClick={handleFixAll}
                            disabled={bulkFixing}
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                        >
                            {bulkFixing ? (
                                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Fixing all…</>
                            ) : (
                                <><Sparkles className="h-4 w-4 mr-2" />Fix all {report.totalIssues} with AI</>
                            )}
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={onDownloadJson}
                        >
                            <Download className="h-4 w-4 mr-2" />Download JSON report
                        </Button>
                    </div>
                )}

                {/* Issue list */}
                <div className="flex-1 overflow-y-auto p-5">
                    {/* ATS keyword coverage — shown only when a JD is pasted */}
                    {atsReport && (
                        <div className="mb-5 rounded-lg border border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-900/10 px-4 py-3">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                                    ATS keyword match
                                </span>
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                    atsReport.score >= 80
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                        : atsReport.score >= 60
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                                }`}>
                                    {atsReport.matched.length}/{atsReport.keywords.length} keywords ({atsReport.score}%)
                                </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-blue-200/60 dark:bg-blue-800/40 overflow-hidden mb-1.5">
                                <div
                                    className={`h-full rounded-full transition-all ${
                                        atsReport.score >= 80 ? 'bg-emerald-500' :
                                        atsReport.score >= 60 ? 'bg-amber-400' : 'bg-rose-400'
                                    }`}
                                    style={{ width: `${Math.max(2, atsReport.score)}%` }}
                                />
                            </div>
                            <p className="text-[11px] text-blue-600/80 dark:text-blue-400/70 mb-3">
                                {atsReport.score >= 80
                                    ? 'Strong match — your CV reflects the JD well. ATS should parse this successfully.'
                                    : atsReport.score >= 60
                                    ? 'Moderate match — adding the missing keywords below to bullets or skills will improve ATS ranking.'
                                    : 'Weak match — ATS may filter this CV before a recruiter sees it. Add the missing keywords where truthful.'}
                            </p>
                            {atsReport.missing.length > 0 && (
                                <div className="mb-2">
                                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
                                        Missing from CV — click a keyword to get a smart suggestion ({atsReport.missing.length}):
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {atsReport.missing.map(kw => {
                                            const st = kwStates[kw];
                                            const isApplied = st?.status === 'applied';
                                            const isExpanded = expandedKw === kw;
                                            return (
                                                <button
                                                    key={kw}
                                                    onClick={() => !isApplied && handleKwExpand(kw)}
                                                    disabled={isApplied}
                                                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                                                        isApplied
                                                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/60 cursor-default'
                                                            : isExpanded
                                                            ? 'bg-amber-200 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200 border-amber-400 dark:border-amber-600'
                                                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700/60 hover:bg-amber-200 dark:hover:bg-amber-800/40'
                                                    }`}
                                                >
                                                    {isApplied ? `✓ ${kw}` : `+ ${kw}`}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Expanded suggestion card for the selected keyword */}
                                    {expandedKw && atsReport.missing.includes(expandedKw) && (() => {
                                        const kw = expandedKw;
                                        const st = kwStates[kw] ?? { status: 'idle' };
                                        return (
                                            <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-900/15 p-3 text-[11px]">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-semibold text-amber-800 dark:text-amber-300">
                                                        Smart suggestion for "{kw}"
                                                    </span>
                                                    <button
                                                        onClick={() => setExpandedKw(null)}
                                                        className="text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>

                                                {!kwCandidate ? (
                                                    <p className="text-amber-700/80 dark:text-amber-400/70 italic">
                                                        No experience bullets found — add this skill to your Skills section manually.
                                                    </p>
                                                ) : (
                                                    <>
                                                        <p className="text-[10px] uppercase tracking-wide text-amber-600/70 dark:text-amber-500/70 mb-1">
                                                            Best matching bullet · {kwCandidate.label}
                                                        </p>
                                                        <p className="text-amber-800/90 dark:text-amber-200/80 bg-white/60 dark:bg-black/20 rounded px-2 py-1.5 mb-2 leading-relaxed">
                                                            {kwCandidate.text}
                                                        </p>

                                                        {st.status === 'idle' && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleKwRewrite(kw)}
                                                                className="text-[11px] h-7 px-3 border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/30"
                                                            >
                                                                <Sparkles className="h-3 w-3 mr-1" />
                                                                Rewrite with AI to include "{kw}"
                                                            </Button>
                                                        )}
                                                        {st.status === 'loading' && (
                                                            <p className="text-amber-700/70 dark:text-amber-400/70 flex items-center gap-1.5">
                                                                <RefreshCw className="h-3 w-3 animate-spin" />
                                                                Rewriting…
                                                            </p>
                                                        )}
                                                        {st.status === 'error' && (
                                                            <p className="text-rose-600 dark:text-rose-400">{st.error}</p>
                                                        )}
                                                        {st.status === 'done' && st.rewritten && (
                                                            <>
                                                                <p className="text-[10px] uppercase tracking-wide text-emerald-600/70 dark:text-emerald-500/70 mb-1">
                                                                    Suggested rewrite
                                                                </p>
                                                                <p className="text-emerald-800/90 dark:text-emerald-200/80 bg-emerald-50/80 dark:bg-emerald-900/20 rounded px-2 py-1.5 mb-2 leading-relaxed border border-emerald-200 dark:border-emerald-700/40">
                                                                    {st.rewritten}
                                                                </p>
                                                                <div className="flex gap-2">
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => handleKwApply(kw)}
                                                                        className="text-[11px] h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                    >
                                                                        <CheckCircle className="h-3 w-3 mr-1" />
                                                                        Apply to CV
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => handleKwRewrite(kw)}
                                                                        className="text-[11px] h-7 px-3"
                                                                    >
                                                                        <RefreshCw className="h-3 w-3 mr-1" />
                                                                        Retry
                                                                    </Button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                            {atsReport.matched.length > 0 && (
                                <div>
                                    <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">
                                        Found in CV ({atsReport.matched.length}):
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {atsReport.matched.map(kw => (
                                            <span
                                                key={kw}
                                                className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60"
                                            >
                                                {kw}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Achievement density bar — always shown when there are bullets */}
                    <AchievementDensityBar density={report.achievementDensity} />

                    {/* Auto-fixed by pipeline — shown whenever the purifier made synonym substitutions */}
                    {hasSynonymFixes && (
                        <section className="mb-5">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Auto-fixed by pipeline ({synonymFixes.length})
                            </h3>
                            <ul className="space-y-1.5">
                                {synonymFixes.map((fix, i) => (
                                    <li
                                        key={`syn-${i}`}
                                        className="border border-emerald-200 dark:border-emerald-800/60 rounded-lg px-3 py-2 bg-emerald-50/60 dark:bg-emerald-900/10 flex items-start gap-2"
                                    >
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                            <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                                                Overused word replaced
                                            </span>
                                            {fix.phrase && (
                                                <span className="ml-1.5 text-xs font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 rounded px-1">
                                                    {fix.phrase}
                                                </span>
                                            )}
                                            {fix.fieldLocation && (
                                                <div className="text-[11px] text-emerald-600/70 dark:text-emerald-500/70 mt-0.5">
                                                    {fix.fieldLocation}
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    {allClean ? (
                        <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                            <p className="font-medium">All clean.</p>
                            <p className="text-sm mt-1">Re-open after editing to re-audit.</p>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={onDownloadJson}
                                className="mt-4"
                            >
                                <Download className="h-4 w-4 mr-2" />Download JSON report anyway
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {(Object.entries(grouped) as Array<[string, CvQualityIssue[]]>).map(([location, issues]) => (
                                <section key={location}>
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
                                        {location}
                                    </h3>
                                    <ul className="space-y-2">
                                        {issues.map((issue) => {
                                            const rowKey = issueKey(issue, report.issues.indexOf(issue));
                                            const state = rowState[rowKey] ?? { status: 'idle' as const };
                                            return (
                                                <li
                                                    key={rowKey}
                                                    className="border border-zinc-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-900"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                                                {KIND_LABEL[issue.kind] ?? issue.kind}
                                                            </div>
                                                            {issue.snippet && (
                                                                <div className="mt-1 text-xs font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-neutral-800/60 rounded px-2 py-1 break-words">
                                                                    {issue.snippet}
                                                                </div>
                                                            )}
                                                            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                                                                {ISSUE_KIND_INSTRUCTIONS[issue.kind]?.split('.')[0] ?? ''}.
                                                            </div>
                                                            {state.status === 'error' && (
                                                                <div className="mt-2 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-1">
                                                                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                                                    <span>{state.error}</span>
                                                                </div>
                                                            )}
                                                            {state.status === 'fixed' && (
                                                                <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                                                    <CheckCircle className="h-3.5 w-3.5" />
                                                                    Fixed — re-auditing…
                                                                </div>
                                                            )}
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() => handleFixOne(issue, rowKey)}
                                                            disabled={state.status === 'fixing' || state.status === 'fixed' || bulkFixing}
                                                            className="flex-shrink-0"
                                                        >
                                                            {state.status === 'fixing' ? (
                                                                <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />Fixing</>
                                                            ) : state.status === 'fixed' ? (
                                                                <><CheckCircle className="h-3.5 w-3.5 mr-1" />Done</>
                                                            ) : state.status === 'error' ? (
                                                                <><RefreshCw className="h-3.5 w-3.5 mr-1" />Retry</>
                                                            ) : (
                                                                <><Sparkles className="h-3.5 w-3.5 mr-1" />Fix with AI</>
                                                            )}
                                                        </Button>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-zinc-200 dark:border-neutral-700 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                    <span>AI fixes use your configured fallback chain (Workers AI → Groq → Cerebras → OpenRouter → …).</span>
                    <button
                        onClick={onClose}
                        className="text-zinc-700 dark:text-zinc-300 hover:underline"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
