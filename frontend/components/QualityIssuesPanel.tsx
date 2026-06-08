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
    fixCvIssueWithAi, fixSeniorityIssueWithAi, applyFixToCv, getOriginalTextAt,
    ISSUE_KIND_INSTRUCTIONS, insertKeywordIntoBullet,
} from '../services/aiInlineFix';
import { stripTildeNumbers } from '../services/cvNumberFidelity';
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
    tilde_number:                'Tilde before number ("~50") — AI tell, remove it',
    missing_trailing_period:     'Bullet does not end with a full stop',
};

// ── Style governance — detect-only leak types ────────────────────────────────

const GOVERNANCE_LEAK_KINDS = new Set([
    'opener_category_monotone',
    'all_verb_led',
    'verb_cluster_dominance',
    'bare_metric_opener',
    'context_missing',
    'meaning_cluster_repetition',
]);

const DETECT_ONLY_LEAK_KINDS = new Set([
    'bullet_rhythm_monotone',
    'bullet_band_imbalance',
    'word_overuse_per_role',
    'summary_bullet_phrase_leak',
    'low_quantification_role',
    'round_number',
    'short_bullet',
    'long_bullet',
    'repeated_phrase',
    'low_quantification',
]);

// ── Seniority coherence — detect-only leak types ──────────────────────────────

const SENIORITY_LEAK_KINDS = new Set(['seniority_overreach', 'seniority_underreach']);

const SENIORITY_LEAK_META: Record<string, StyleLeakMeta> = {
    seniority_overreach: {
        label: 'Ownership claim too strong for this role',
        severity: 'warn',
        guidance: 'This bullet uses language (e.g. "led the team", "owned the strategy", "spearheaded") that wouldn\'t be realistic for the inferred seniority of this role. Reword to reflect actual scope — "contributed to", "supported the lead engineer", or "implemented under direction of". Recruiter ATS systems and human reviewers both flag this.',
    },
    seniority_underreach: {
        label: 'Language too junior for this role level',
        severity: 'info',
        guidance: 'This bullet uses assistive language ("helped", "assisted", "supported") as the primary ownership claim for a senior or lead role. Restate with what YOU owned or delivered — "Designed and shipped X", "Led the migration of Y", "Reduced Z by 30%".',
    },
};

// ── Dimensional Score Card ────────────────────────────────────────────────────

interface DimScore { label: string; score: number; max: number; color: string; detail: string }

function computeDimensions(
    report: CvQualityReport,
    purifyLeaks: PurifyLeak[],
): DimScore[] {
    // ── Dim 1: Structure — orphan symbols, stub bullets, passive voice, etc. ──
    const STRUCTURE_KINDS = new Set([
        'orphan_currency_comma', 'orphan_currency_word', 'orphan_percent',
        'orphan_plus', 'orphan_dollar', 'orphan_hyphen_noun', 'orphan_decimal_stub',
        'stub_bullet', 'empty_bullet', 'duplicate_adjacent_word', 'mid_sentence_period',
        'tilde_number', 'missing_trailing_period', 'dangling_time_ref',
        'chained_preposition', 'unanchored_with_participle', 'unanchored_hedged_outcome',
        'half_open_range', 'passive_voice', 'leading_verb_repetition',
    ]);
    const structureIssues = report.issues.filter(i => STRUCTURE_KINDS.has(i.kind)).length;
    const structureScore = Math.max(0, 25 - Math.min(structureIssues * 3, 25));
    const structureDetail = structureIssues === 0
        ? 'No structural issues'
        : `${structureIssues} issue${structureIssues === 1 ? '' : 's'} (orphan symbols, passive voice, stubs)`;

    // ── Dim 2: Metrics & Evidence — quantification density + orphan metrics ──
    const { percent } = report.achievementDensity;
    let metricsBase = percent >= 60 ? 25 : percent >= 40 ? 20 : percent >= 25 ? 14 : percent >= 10 ? 8 : 3;
    const lowQ  = purifyLeaks.filter(l => l.leakType === 'low_quantification').length;
    const lowQR = purifyLeaks.filter(l => l.leakType === 'low_quantification_role').length;
    const roundN = purifyLeaks.filter(l => l.leakType === 'round_number').length;
    metricsBase = Math.max(0, metricsBase - lowQ * 4 - lowQR * 2 - roundN * 2);
    const metricsDetail = `${percent}% of bullets have metrics`
        + (lowQ || lowQR ? `, ${lowQ + lowQR} role(s) unquantified` : '')
        + (roundN ? `, ${roundN} round-number flag` : '');

    // ── Dim 3: Voice & Style — governance + rhythm + voice issues ─────────────
    const governanceCount = purifyLeaks.filter(l => l.fixedBy === 'none' && GOVERNANCE_LEAK_KINDS.has(l.leakType)).length;
    const rhythmCount     = purifyLeaks.filter(l => l.fixedBy === 'none' && DETECT_ONLY_LEAK_KINDS.has(l.leakType)).length;
    const VOICE_KINDS     = new Set(['first_person_pronoun', 'tense_third_person_singular']);
    const voiceCount      = report.issues.filter(i => VOICE_KINDS.has(i.kind)).length;
    const styleScore      = Math.max(0, 25 - governanceCount * 3 - rhythmCount * 2 - voiceCount * 3);
    const styleTotal      = governanceCount + rhythmCount + voiceCount;
    const styleDetail     = styleTotal === 0
        ? 'No style or voice issues'
        : `${styleTotal} flag${styleTotal === 1 ? '' : 's'} (${[
              governanceCount ? `${governanceCount} style` : '',
              rhythmCount     ? `${rhythmCount} rhythm` : '',
              voiceCount      ? `${voiceCount} voice` : '',
          ].filter(Boolean).join(', ')})`;

    // ── Dim 4: Career Believability — seniority coherence ────────────────────
    const overreach  = purifyLeaks.filter(l => l.leakType === 'seniority_overreach').length;
    const underreach = purifyLeaks.filter(l => l.leakType === 'seniority_underreach').length;
    const believeScore  = Math.max(0, 25 - overreach * 6 - underreach * 3);
    const believeDetail = (overreach + underreach) === 0
        ? 'All bullets match inferred career tier'
        : `${overreach ? `${overreach} overreach` : ''}${overreach && underreach ? ', ' : ''}${underreach ? `${underreach} underreach` : ''} flag${(overreach + underreach) === 1 ? '' : 's'}`;

    const dimColor = (s: number, max: number) => {
        const pct = s / max;
        return pct >= 0.8 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-amber-400' : 'bg-rose-400';
    };

    return [
        { label: 'Structure',            score: structureScore, max: 25, color: dimColor(structureScore, 25), detail: structureDetail },
        { label: 'Metrics & Evidence',   score: metricsBase,    max: 25, color: dimColor(metricsBase, 25),    detail: metricsDetail },
        { label: 'Voice & Style',        score: styleScore,     max: 25, color: dimColor(styleScore, 25),     detail: styleDetail },
        { label: 'Career Believability', score: believeScore,   max: 25, color: dimColor(believeScore, 25),   detail: believeDetail },
    ];
}

function DimensionalScoreCard({ report, purifyLeaks }: { report: CvQualityReport; purifyLeaks: PurifyLeak[] }) {
    const dims = useMemo(() => computeDimensions(report, purifyLeaks), [report, purifyLeaks]);
    const total = dims.reduce((s, d) => s + d.score, 0);
    const totalColor = total >= 80 ? 'text-emerald-600 dark:text-emerald-400'
        : total >= 60 ? 'text-amber-500 dark:text-amber-400'
        : 'text-rose-500 dark:text-rose-400';
    const totalBg = total >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/30'
        : total >= 60 ? 'bg-amber-100 dark:bg-amber-900/30'
        : 'bg-rose-100 dark:bg-rose-900/30';
    return (
        <div className="mb-5 rounded-lg border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/40 px-4 py-3">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
                    Dimensional breakdown
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${totalColor} ${totalBg}`}>
                    {total}/100
                </span>
            </div>
            <div className="space-y-2.5">
                {dims.map(d => (
                    <div key={d.label}>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{d.label}</span>
                            <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                                {d.score}/{d.max}
                            </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-neutral-700 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${d.color}`}
                                style={{ width: `${Math.max(2, (d.score / d.max) * 100)}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{d.detail}</p>
                    </div>
                ))}
            </div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-3 border-t border-zinc-200 dark:border-neutral-700 pt-2">
                Computed deterministically from {report.totalBullets} bullet{report.totalBullets === 1 ? '' : 's'} — no AI required.
                Each dimension is scored independently so you know exactly what to fix.
            </p>
        </div>
    );
}

interface StyleLeakMeta {
    label: string;
    severity: 'warn' | 'info';
    guidance: string;
}

const GOVERNANCE_LEAK_META: Record<string, StyleLeakMeta> = {
    opener_category_monotone: {
        label: 'Opener monotony — same category throughout',
        severity: 'warn',
        guidance: 'Mix opener types: add 1–2 bullets led by a number ("3 patents filed"), a scope clause ("Across 4 teams…"), or a context phrase ("As the only engineer…") to break the pattern.',
    },
    all_verb_led: {
        label: 'All bullets start with an action verb',
        severity: 'warn',
        guidance: 'Rotate 1–2 bullets to number-led or context-led openers — e.g. "12 engineers supported across 3 squads" instead of "Supported 12 engineers across 3 squads".',
    },
    verb_cluster_dominance: {
        label: 'Verb family overused in this role',
        severity: 'warn',
        guidance: 'Swap a few bullets to a different action family. If you have many "built / designed / created" openers, try "analysed", "trained", "reduced", or "delivered".',
    },
    bare_metric_opener: {
        label: 'Metric placed before context',
        severity: 'info',
        guidance: 'Lead with the action, then the number. "Rebuilt pricing model, lifting revenue by 40%" reads more naturally than "40% revenue increase through…".',
    },
    context_missing: {
        label: 'No context clause before the metric',
        severity: 'info',
        guidance: 'Add a setup clause before your number. "Increased revenue by 40%" → "Redesigned pricing across 3 tiers, increasing revenue by 40%".',
    },
    meaning_cluster_repetition: {
        label: 'Same outcome type repeated across bullets',
        severity: 'warn',
        guidance: 'Vary your result type per bullet: mix revenue impact, risk reduction, speed, quality, and team growth. Avoid 3+ bullets all about efficiency or growth.',
    },
};

const DETECT_ONLY_LEAK_META: Record<string, StyleLeakMeta> = {
    bullet_rhythm_monotone: {
        label: 'Bullet lengths are monotone',
        severity: 'warn',
        guidance: 'Mix punchy (8–14 words), standard (15–22 words), and narrative (25–40 words) bullets. Uniform length makes the role feel template-generated.',
    },
    bullet_band_imbalance: {
        label: 'Bullet length band is lopsided',
        severity: 'info',
        guidance: 'Shorten one bullet to a punchy 8–12 word statement, or expand one to a two-sentence narrative to break the visual uniformity.',
    },
    word_overuse_per_role: {
        label: 'A word is repeated too often in this role',
        severity: 'warn',
        guidance: 'Replace the flagged word in 1–2 bullets with a synonym — e.g. swap "data" for "information", "records", or "metrics".',
    },
    summary_bullet_phrase_leak: {
        label: 'Summary phrase echoed in an experience bullet',
        severity: 'info',
        guidance: 'Rephrase the experience bullet — it mirrors a specific phrase from your summary, making both sections feel redundant to recruiters.',
    },
    low_quantification_role: {
        label: 'No numbers in this role',
        severity: 'warn',
        guidance: 'Add at least one metric, even a scope: team size, client count, budget, or project count. Unquantified roles lose credibility against quantified ones.',
    },
    round_number: {
        label: 'Too many round numbers',
        severity: 'info',
        guidance: 'More than 60% of your metrics are round figures (25%, 50%, 100). Specific numbers (23%, £3.8M) feel more credible and authentic.',
    },
    short_bullet: {
        label: 'Bullet is very short',
        severity: 'info',
        guidance: 'Expand this bullet with an outcome or context — a result-oriented sentence of 15–22 words reads much stronger than a stub.',
    },
    long_bullet: {
        label: 'Bullet is very long',
        severity: 'info',
        guidance: 'Split this bullet or tighten the language. Bullets over 45 words are hard to scan during a 6-second CV review.',
    },
    repeated_phrase: {
        label: 'Repeated phrase across bullets',
        severity: 'warn',
        guidance: 'Remove or rephrase one of the bullets sharing this phrase — duplication reduces impact and can signal AI generation.',
    },
    low_quantification: {
        label: 'Overall metric density is low',
        severity: 'warn',
        guidance: 'Add at least one measurable outcome per role (%, £/$, time saved, team size). Even scopes like "across 3 offices" count toward a stronger impression.',
    },
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
            // noChange = AI understood the text but made no edit (issue may be borderline).
            // Show a softer "manual edit needed" hint instead of a hard error color.
            const msg = e?.noChange
                ? 'AI couldn\'t find a safe automatic fix — try editing this bullet manually.'
                : e?.isUserFacing
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

    const tildeIssues = useMemo(
        () => report.issues.filter(i => i.kind === 'tilde_number'),
        [report.issues],
    );

    const handleFixTildeInstant = useCallback((issue: CvQualityIssue, rowKey: string) => {
        const original = getOriginalTextAt(cv, issue.where) || issue.snippet;
        const fixed = stripTildeNumbers(original);
        if (fixed === original) {
            setRowState(s => ({ ...s, [rowKey]: { status: 'fixed', appliedAt: Date.now() } }));
            return;
        }
        const nextCv = applyFixToCv(cv, issue.where, fixed);
        onApplyFix(nextCv);
        setRowState(s => ({ ...s, [rowKey]: { status: 'fixed', appliedAt: Date.now() } }));
    }, [cv, onApplyFix]);

    const periodIssues = useMemo(
        () => report.issues.filter(i => i.kind === 'missing_trailing_period'),
        [report.issues],
    );

    const handleFixPeriodInstant = useCallback((issue: CvQualityIssue, rowKey: string) => {
        const original = getOriginalTextAt(cv, issue.where) || issue.snippet;
        const trimmed = original.trimEnd();
        const fixed = /[.!?]$/.test(trimmed) ? trimmed : trimmed.replace(/[,;]*$/, '') + '.';
        if (fixed === original) {
            setRowState(s => ({ ...s, [rowKey]: { status: 'fixed', appliedAt: Date.now() } }));
            return;
        }
        const nextCv = applyFixToCv(cv, issue.where, fixed);
        onApplyFix(nextCv);
        setRowState(s => ({ ...s, [rowKey]: { status: 'fixed', appliedAt: Date.now() } }));
    }, [cv, onApplyFix]);

    const handleFixAllPeriodsInstant = useCallback(() => {
        if (periodIssues.length === 0) return;
        let workingCv = cv;
        for (let idx = 0; idx < periodIssues.length; idx++) {
            const issue = periodIssues[idx];
            const rowKey = issueKey(issue, report.issues.indexOf(issue));
            const original = getOriginalTextAt(workingCv, issue.where) || issue.snippet;
            const trimmed = original.trimEnd();
            const fixed = /[.!?]$/.test(trimmed) ? trimmed : trimmed.replace(/[,;]*$/, '') + '.';
            workingCv = applyFixToCv(workingCv, issue.where, fixed);
            setRowState(s => ({ ...s, [rowKey]: { status: 'fixed', appliedAt: Date.now() } }));
        }
        onApplyFix(workingCv);
    }, [cv, periodIssues, report.issues, issueKey, onApplyFix]);

    const handleFixAllTildesInstant = useCallback(() => {
        if (tildeIssues.length === 0) return;
        let workingCv = cv;
        for (let idx = 0; idx < tildeIssues.length; idx++) {
            const issue = tildeIssues[idx];
            const rowKey = issueKey(issue, report.issues.indexOf(issue));
            const original = getOriginalTextAt(workingCv, issue.where) || issue.snippet;
            const fixed = stripTildeNumbers(original);
            workingCv = applyFixToCv(workingCv, issue.where, fixed);
            setRowState(s => ({ ...s, [rowKey]: { status: 'fixed', appliedAt: Date.now() } }));
        }
        onApplyFix(workingCv);
    }, [cv, tildeIssues, report.issues, issueKey, onApplyFix]);

    const governanceLeaks = useMemo(() =>
        purifyLeaks.filter(l => l.fixedBy === 'none' && GOVERNANCE_LEAK_KINDS.has(l.leakType)),
    [purifyLeaks]);

    const detectOnlyLeaks = useMemo(() =>
        purifyLeaks.filter(l => l.fixedBy === 'none' && DETECT_ONLY_LEAK_KINDS.has(l.leakType)),
    [purifyLeaks]);

    const seniorityLeaks = useMemo(() =>
        purifyLeaks.filter(l => l.fixedBy === 'none' && SENIORITY_LEAK_KINDS.has(l.leakType)),
    [purifyLeaks]);

    const [believabilityRevealed, setBelievabilityRevealed] = useState(false);

    // ── Seniority fix state ──────────────────────────────────────────────────
    type SenFixStatus = { status: 'fixing' | 'fixed' | 'error'; error?: string };
    const [senFixStates, setSenFixStates] = useState<Record<string, SenFixStatus>>({});
    const [senFixingAll, setSenFixingAll] = useState(false);

    const _senKey = (leak: PurifyLeak, idx: number) =>
        `${leak.fieldLocation}::${idx}`;

    const _inferTier = (roleLabel: string, isOverreach: boolean): string => {
        const l = (roleLabel || '').toLowerCase();
        if (l.includes('intern')) return 'intern';
        if (l.includes('junior') || l.includes(' jr ') || l.includes('jr.')) return 'junior';
        if (l.includes('principal') || l.includes('director') || l.includes('vp') || l.includes('c-level') || l.includes('chief') || l.includes('executive')) return 'executive';
        if (l.includes('lead') || l.includes('staff')) return 'lead';
        if (l.includes('senior') || l.includes(' sr ') || l.includes('sr.')) return 'senior';
        return isOverreach ? 'junior' : 'senior';
    };

    const handleFixSeniorityOne = useCallback(async (leak: PurifyLeak, key: string) => {
        const bulletText = getOriginalTextAt(cv, leak.fieldLocation);
        if (!bulletText) return;
        const isOverreach = leak.leakType === 'seniority_overreach';
        const flaggedPhrase = (leak.phrase || '').split(' — ')[0].trim();
        const roleLabel = leak.contextSnippet || '';
        const tier = _inferTier(roleLabel, isOverreach);
        setSenFixStates(s => ({ ...s, [key]: { status: 'fixing' } }));
        try {
            const fixed = await fixSeniorityIssueWithAi(
                bulletText,
                leak.leakType as 'seniority_overreach' | 'seniority_underreach',
                roleLabel,
                tier,
                flaggedPhrase,
            );
            const nextCv = applyFixToCv(cv, leak.fieldLocation, fixed);
            onApplyFix(nextCv);
            setSenFixStates(s => ({ ...s, [key]: { status: 'fixed' } }));
        } catch (e: any) {
            const msg = e?.isUserFacing ? e.message : 'AI fix failed — every provider was unavailable.';
            setSenFixStates(s => ({ ...s, [key]: { status: 'error', error: msg } }));
        }
    }, [cv, onApplyFix]);

    const handleFixSeniorityAll = useCallback(async () => {
        if (senFixingAll || seniorityLeaks.length === 0) return;
        setSenFixingAll(true);
        let workingCv = cv;
        for (let i = 0; i < seniorityLeaks.length; i++) {
            const leak = seniorityLeaks[i];
            const key = _senKey(leak, i);
            const bulletText = getOriginalTextAt(workingCv, leak.fieldLocation);
            if (!bulletText) continue;
            const isOverreach = leak.leakType === 'seniority_overreach';
            const flaggedPhrase = (leak.phrase || '').split(' — ')[0].trim();
            const roleLabel = leak.contextSnippet || '';
            const tier = _inferTier(roleLabel, isOverreach);
            setSenFixStates(s => ({ ...s, [key]: { status: 'fixing' } }));
            try {
                const fixed = await fixSeniorityIssueWithAi(
                    bulletText,
                    leak.leakType as 'seniority_overreach' | 'seniority_underreach',
                    roleLabel,
                    tier,
                    flaggedPhrase,
                );
                workingCv = applyFixToCv(workingCv, leak.fieldLocation, fixed);
                setSenFixStates(s => ({ ...s, [key]: { status: 'fixed' } }));
                if (/quota|rate|exhaust|429/.test(String((fixed as any)?.message || ''))) break;
            } catch (e: any) {
                const msg = e?.isUserFacing ? e.message : 'AI fix failed.';
                setSenFixStates(s => ({ ...s, [key]: { status: 'error', error: msg } }));
                if (/quota|rate|exhaust|429/.test(String(e?.message || ''))) break;
            }
        }
        onApplyFix(workingCv);
        setSenFixingAll(false);
    }, [cv, seniorityLeaks, senFixingAll, onApplyFix]);

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
                        {periodIssues.length > 0 && (
                            <Button
                                size="sm"
                                onClick={handleFixAllPeriodsInstant}
                                disabled={bulkFixing}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Add full stops ({periodIssues.length})
                            </Button>
                        )}
                        {tildeIssues.length > 0 && (
                            <Button
                                size="sm"
                                onClick={handleFixAllTildesInstant}
                                disabled={bulkFixing}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Fix {tildeIssues.length} tilde{tildeIssues.length === 1 ? '' : 's'} instantly
                            </Button>
                        )}
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

                    {/* Dimensional score card — 4 independently-scored dimensions */}
                    {report.totalBullets > 0 && (
                        <DimensionalScoreCard report={report} purifyLeaks={purifyLeaks} />
                    )}

                    {/* Career Believability — on-demand deep analysis */}
                    <section className="mb-5">
                        {!believabilityRevealed ? (
                            <div className="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/40 px-4 py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                        Career Believability
                                    </p>
                                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-snug">
                                        Checks if your bullet language matches your actual seniority level — no AI, instant.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setBelievabilityRevealed(true)}
                                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 dark:bg-zinc-700 hover:bg-zinc-700 dark:hover:bg-zinc-600 text-white text-xs font-semibold transition-colors"
                                >
                                    <Sparkles className="h-3 w-3" />
                                    Run analysis
                                </button>
                            </div>
                        ) : seniorityLeaks.length === 0 ? (
                            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 px-4 py-3 flex items-center gap-2">
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                                <div>
                                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Career Believability — all clear</p>
                                    <p className="text-[11px] text-emerald-600/70 dark:text-emerald-500/70 mt-0.5">
                                        All bullets match your inferred career tier.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Career believability ({seniorityLeaks.length})
                                    </h3>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={senFixingAll}
                                        onClick={handleFixSeniorityAll}
                                        className="text-[11px] h-7 px-3 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700/60 dark:text-rose-300 dark:hover:bg-rose-900/20 flex-shrink-0"
                                    >
                                        {senFixingAll ? (
                                            <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Fixing all…</>
                                        ) : (
                                            <><Sparkles className="h-3 w-3 mr-1" />Fix all with AI</>
                                        )}
                                    </Button>
                                </div>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2.5 leading-relaxed">
                                    Analysed role titles, date ranges, and career progression — no AI.
                                    Flags bullets whose ownership or language doesn't match the inferred
                                    seniority of that specific role.
                                </p>
                                <ul className="space-y-2">
                                    {seniorityLeaks.map((leak, i) => {
                                        const meta = SENIORITY_LEAK_META[leak.leakType];
                                        if (!meta) return null;
                                        const isOverreach = leak.leakType === 'seniority_overreach';
                                        const key = _senKey(leak, i);
                                        const fixSt = senFixStates[key];
                                        return (
                                            <li
                                                key={`sen-${i}`}
                                                className={`border rounded-lg px-3 py-2.5 flex items-start gap-2.5 ${
                                                    fixSt?.status === 'fixed'
                                                        ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10 opacity-60'
                                                        : isOverreach
                                                        ? 'border-rose-200 dark:border-rose-800/60 bg-rose-50/50 dark:bg-rose-900/10'
                                                        : 'border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-900/10'
                                                }`}
                                            >
                                                {fixSt?.status === 'fixed'
                                                    ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-emerald-500" />
                                                    : <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${isOverreach ? 'text-rose-500' : 'text-amber-400'}`} />
                                                }
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                                            {fixSt?.status === 'fixed' ? 'Fixed' : meta.label}
                                                        </div>
                                                        {fixSt?.status !== 'fixed' && (
                                                            <button
                                                                disabled={fixSt?.status === 'fixing' || senFixingAll}
                                                                onClick={() => handleFixSeniorityOne(leak, key)}
                                                                className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
                                                                    fixSt?.status === 'fixing'
                                                                        ? 'text-zinc-400 cursor-wait'
                                                                        : isOverreach
                                                                        ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30'
                                                                        : 'text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                                                                }`}
                                                            >
                                                                {fixSt?.status === 'fixing'
                                                                    ? <><RefreshCw className="h-2.5 w-2.5 animate-spin" />Fixing…</>
                                                                    : <><Sparkles className="h-2.5 w-2.5" />Fix</>
                                                                }
                                                            </button>
                                                        )}
                                                    </div>
                                                    {leak.phrase && (() => {
                                                        const parts = leak.phrase.split(' — ');
                                                        const flaggedWord = parts[0];
                                                        return (
                                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                                                                    isOverreach
                                                                        ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                                                                        : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                                                }`}>
                                                                    "{flaggedWord}"
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                    {leak.contextSnippet && (
                                                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 italic">
                                                            {leak.contextSnippet}
                                                        </div>
                                                    )}
                                                    {leak.fieldLocation && (
                                                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                                                            {formatLocation(leak.fieldLocation)}
                                                        </div>
                                                    )}
                                                    {fixSt?.status === 'error' && (
                                                        <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">{fixSt.error}</p>
                                                    )}
                                                    {fixSt?.status !== 'fixed' && (
                                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                                                            {meta.guidance}
                                                        </p>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </>
                        )}
                    </section>

                    {/* Style Intelligence — governance pattern issues (detect-only, no AI fix) */}
                    {governanceLeaks.length > 0 && (
                        <section className="mb-5">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-2 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" />
                                Style Intelligence ({governanceLeaks.length})
                            </h3>
                            <ul className="space-y-2">
                                {governanceLeaks.map((leak, i) => {
                                    const meta = GOVERNANCE_LEAK_META[leak.leakType];
                                    if (!meta) return null;
                                    return (
                                        <li
                                            key={`gov-${i}`}
                                            className={`border rounded-lg px-3 py-2.5 flex items-start gap-2.5 ${
                                                meta.severity === 'warn'
                                                    ? 'border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-900/10'
                                                    : 'border-blue-200 dark:border-blue-800/50 bg-blue-50/40 dark:bg-blue-900/10'
                                            }`}
                                        >
                                            <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${
                                                meta.severity === 'warn' ? 'text-amber-500' : 'text-blue-400'
                                            }`} />
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                                    {meta.label}
                                                </div>
                                                {leak.phrase && (
                                                    <div className="text-[11px] font-mono mt-0.5 text-zinc-600 dark:text-zinc-400 bg-white/60 dark:bg-black/20 rounded px-1.5 py-0.5 break-words">
                                                        {leak.phrase}
                                                    </div>
                                                )}
                                                {leak.contextSnippet && (
                                                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 italic">
                                                        {leak.contextSnippet}
                                                    </div>
                                                )}
                                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                                                    {meta.guidance}
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {/* Writing patterns — other detect-only pipeline flags */}
                    {detectOnlyLeaks.length > 0 && (
                        <section className="mb-5">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Writing patterns to review ({detectOnlyLeaks.length})
                            </h3>
                            <ul className="space-y-1.5">
                                {detectOnlyLeaks.map((leak, i) => {
                                    const meta = DETECT_ONLY_LEAK_META[leak.leakType];
                                    if (!meta) return null;
                                    return (
                                        <li
                                            key={`det-${i}`}
                                            className="border border-zinc-200 dark:border-neutral-700 rounded-lg px-3 py-2.5 bg-zinc-50/60 dark:bg-neutral-800/30 flex items-start gap-2.5"
                                        >
                                            <div className={`h-2 w-2 rounded-full flex-shrink-0 mt-1 ${
                                                meta.severity === 'warn' ? 'bg-amber-400' : 'bg-zinc-400 dark:bg-zinc-500'
                                            }`} />
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                                    {meta.label}
                                                </div>
                                                {leak.phrase && (
                                                    <div className="text-[11px] mt-0.5 text-zinc-500 dark:text-zinc-400 break-words">
                                                        {leak.phrase}
                                                    </div>
                                                )}
                                                {leak.fieldLocation && (
                                                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                                                        {formatLocation(leak.fieldLocation)}
                                                    </div>
                                                )}
                                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                                                    {meta.guidance}
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

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
                                                        {issue.kind === 'missing_trailing_period' ? (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleFixPeriodInstant(issue, rowKey)}
                                                                disabled={state.status === 'fixed' || bulkFixing}
                                                                className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                            >
                                                                {state.status === 'fixed' ? (
                                                                    <><CheckCircle className="h-3.5 w-3.5 mr-1" />Done</>
                                                                ) : (
                                                                    <><CheckCircle className="h-3.5 w-3.5 mr-1" />Add full stop</>
                                                                )}
                                                            </Button>
                                                        ) : issue.kind === 'tilde_number' ? (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleFixTildeInstant(issue, rowKey)}
                                                                disabled={state.status === 'fixed' || bulkFixing}
                                                                className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                            >
                                                                {state.status === 'fixed' ? (
                                                                    <><CheckCircle className="h-3.5 w-3.5 mr-1" />Done</>
                                                                ) : (
                                                                    <><CheckCircle className="h-3.5 w-3.5 mr-1" />Fix instantly</>
                                                                )}
                                                            </Button>
                                                        ) : (
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
                                                        )}
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
