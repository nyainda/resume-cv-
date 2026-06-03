/**
 * hrDetectorSimulation.ts
 *
 * Pure-JS HR / recruiter eye simulation — zero LLM tokens.
 *
 * Scores a finished CVData on 8 signals that correlate with "written by AI"
 * patterns detected by experienced recruiters and modern ATS screeners.
 * Returns a 0–100 humanness score (100 = sounds fully human) plus a per-signal
 * breakdown with actionable fixes.
 *
 * Signal map (risk points, higher = more AI-like):
 *   1.  Banned-opener survival     — max 20 pts
 *   2.  Verb-led saturation        — max 15 pts
 *   3.  Bullet-length uniformity   — max 15 pts
 *   4.  Repeated opener verb       — max 15 pts
 *   5.  Summary cliché density     — max 15 pts
 *   6.  Generic summary opener     — max 10 pts
 *   7.  Pronoun leak in bullets    — max 10 pts
 *   8.  Passive voice ratio        — max 10 pts
 *
 * Risk is capped at 100; humanness = 100 − risk.
 */

import type { CVData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Signal constants
// ─────────────────────────────────────────────────────────────────────────────

/** Openers that trained recruiters flag as AI-template tells */
const BANNED_OPENERS: RegExp[] = [
    /^spearheaded\b/i, /^orchestrated\b/i, /^leveraged\b/i,
    /^utilized\b/i,    /^facilitated\b/i,  /^empowered\b/i,
    /^championed\b/i,  /^harnessed\b/i,    /^synergized\b/i,
    /^responsible\s+for\b/i, /^helped\s+to\b/i, /^worked\s+on\b/i,
    /^assisted\s+with\b/i,   /^tasked\s+with\b/i,
];

/** Phrases that are almost exclusive to AI-generated summaries */
const SUMMARY_AI_ISMS: RegExp[] = [
    /highly\s+motivated/i, /results[‐-]?driven/i, /results[‐-]?oriented/i,
    /passionate\s+about/i, /detail[‐-]?oriented/i, /team\s+player/i,
    /hard[‐-]?working/i,   /self[‐-]?starter/i,    /go[‐-]?getter/i,
    /dynamic\s+professional/i, /proven\s+track\s+record/i,
    /excellent\s+communication\s+skills/i, /strong\s+work\s+ethic/i,
    /dedicated\s+professional/i, /innovative\s+thinker/i,
    /forward[‐-]?thinking/i, /well[‐-]?rounded/i, /value[‐-]?add/i,
    /thought\s+leader/i, /best[‐-]?in[‐-]?class/i,
];

/** Summary openers that scream "generic AI template" */
const GENERIC_OPENER_RXS: RegExp[] = [
    /^i\s+am\s+a\b/i, /^i'm\s+a\b/i,
    /^seeking\b/i, /^looking\s+to\b/i, /^aiming\s+to\b/i,
    /^an?\s+experienced\b/i, /^a\s+dedicated\b/i,
    /^a\s+results[‐-]?driven\b/i, /^a\s+highly\s+motivated\b/i,
    /^a\s+passionate\b/i, /^dynamic\s+professional/i,
    /^results[‐-]?oriented\b/i, /^results[‐-]?driven\b/i,
];

/** Passive voice — "was/were/been/being + past participle" */
const PASSIVE_RX = /\b(was|were|been|being|is|are)\s+\w+(?:ed|en)\b/i;

/** First-person pronouns that should not appear in bullets */
const PRONOUN_RX = /\b(i\s+|my\s+|\bme\b|\bwe\s+|\bour\s+)/i;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function wordCount(s: string): number {
    return s.split(/\s+/).filter(Boolean).length;
}

function firstWord(s: string): string {
    return s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
}

/** Collect every bullet from all roles */
function allBullets(cv: CVData): string[] {
    const bullets: string[] = [];
    for (const role of cv.experience ?? []) {
        const resps = role.responsibilities;
        if (Array.isArray(resps)) bullets.push(...resps.map(String));
        else if (typeof resps === 'string') {
            bullets.push(...(resps as string).split(/\n/).map(s => s.trim()).filter(Boolean));
        }
    }
    return bullets;
}

/** Population standard deviation of a numeric array */
function stddev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((s, n) => s + n, 0) / arr.length;
    const variance = arr.reduce((s, n) => s + (n - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
}

/** Simple past-tense verb check (ends in -ed, or common irregular) */
const IRREGULAR_PAST = new Set([
    'led', 'built', 'ran', 'grew', 'drove', 'wrote', 'made', 'gave',
    'took', 'brought', 'sent', 'sold', 'won', 'cut', 'set', 'put',
    'held', 'kept', 'found', 'got', 'left', 'paid', 'read', 'met',
]);
function isVerbOpener(word: string): boolean {
    if (!word) return false;
    if (IRREGULAR_PAST.has(word)) return true;
    if (word.endsWith('ed') || word.endsWith('ied')) return true;
    // Present-tense tech verbs (Manage, Configure, etc.)
    if (/^(manage|configure|maintain|monitor|coordinate|report|design|build|analyse|analyze|review|prepare|conduct|compile|process|deliver|evaluate|assess|direct|create|develop|support|plan|produce)\b/i.test(word)) return true;
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type HRSignalSeverity = 'high' | 'medium' | 'low' | 'pass';

export interface HRSignal {
    id: string;
    label: string;
    severity: HRSignalSeverity;
    /** Short explanation shown to user */
    detail: string;
    /** Actionable fix suggestion */
    fix: string;
    /** 0–max_pts — how many risk points this signal contributed */
    riskPts: number;
    /** Upper bound for this signal */
    maxPts: number;
}

export interface HRDetectionResult {
    /** 0–100 — higher = more human-sounding */
    humanScore: number;
    /** 0–100 — higher = more AI-pattern risk */
    riskScore: number;
    signals: HRSignal[];
    /** Verdicts for UI badge */
    verdict: 'Excellent' | 'Good' | 'Needs work' | 'High risk';
    verdictColor: 'emerald' | 'teal' | 'amber' | 'red';
}

// ─────────────────────────────────────────────────────────────────────────────
// Scorer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a finished CVData against 8 recruiter-eye signals.
 * All computation is pure JS — no network calls, no LLM tokens.
 *
 * @param cv  The CVData to analyse (from getState/generateCV output).
 * @returns   HRDetectionResult with humanScore, riskScore, and per-signal breakdown.
 */
export function scoreHRDetection(cv: CVData): HRDetectionResult {
    const bullets  = allBullets(cv);
    const summary  = (cv.summary || '').trim();
    const signals: HRSignal[] = [];

    // ── Signal 1: Banned-opener survival (max 20 pts) ─────────────────────────
    {
        const hits: string[] = [];
        for (const b of bullets) {
            for (const rx of BANNED_OPENERS) {
                if (rx.test(b.trim())) { hits.push(b.trim().split(/\s+/).slice(0, 3).join(' ')); break; }
            }
        }
        const riskPts = Math.min(20, hits.length * 4);
        signals.push({
            id: 'banned_opener',
            label: 'Banned opener words',
            severity: riskPts >= 12 ? 'high' : riskPts >= 4 ? 'medium' : 'pass',
            detail: hits.length > 0
                ? `${hits.length} bullet(s) start with flagged openers: "${hits.slice(0, 3).join('", "')}"`
                : 'No banned openers detected.',
            fix: 'Replace "Spearheaded", "Leveraged", "Responsible for" etc. with direct action verbs: Led, Built, Reduced, Delivered.',
            riskPts,
            maxPts: 20,
        });
    }

    // ── Signal 2: Verb-led saturation (max 15 pts) ────────────────────────────
    {
        if (bullets.length > 0) {
            const verbLed = bullets.filter(b => isVerbOpener(firstWord(b))).length;
            const ratio   = verbLed / bullets.length;
            const riskPts = ratio > 0.88 ? 15 : ratio > 0.78 ? 8 : ratio > 0.65 ? 3 : 0;
            const pct     = Math.round(ratio * 100);
            signals.push({
                id: 'verb_saturation',
                label: 'Verb-led bullet saturation',
                severity: riskPts >= 12 ? 'high' : riskPts >= 6 ? 'medium' : riskPts > 0 ? 'low' : 'pass',
                detail: `${pct}% of bullets start with an action verb (threshold: 65%).`,
                fix: 'Mix in number-led ("3 sites coordinated…"), scope-led ("Across 5 counties,…"), or context-led ("As the sole engineer,…") bullets.',
                riskPts,
                maxPts: 15,
            });
        } else {
            signals.push({ id: 'verb_saturation', label: 'Verb-led bullet saturation', severity: 'pass', detail: 'No bullets found.', fix: '', riskPts: 0, maxPts: 15 });
        }
    }

    // ── Signal 3: Bullet-length uniformity (max 15 pts) ───────────────────────
    {
        if (bullets.length >= 4) {
            const lens    = bullets.map(wordCount);
            const sd      = stddev(lens);
            const riskPts = sd < 2 ? 15 : sd < 3 ? 10 : sd < 4 ? 5 : 0;
            signals.push({
                id: 'length_uniformity',
                label: 'Bullet-length uniformity',
                severity: riskPts >= 12 ? 'high' : riskPts >= 8 ? 'medium' : riskPts > 0 ? 'low' : 'pass',
                detail: `Word-count std-dev across bullets: ${sd.toFixed(1)} (safe threshold ≥ 4).`,
                fix: 'Vary bullet lengths deliberately: short punchy ones (8–10 words) should alternate with detailed ones (16–22 words).',
                riskPts,
                maxPts: 15,
            });
        } else {
            signals.push({ id: 'length_uniformity', label: 'Bullet-length uniformity', severity: 'pass', detail: 'Too few bullets to assess.', fix: '', riskPts: 0, maxPts: 15 });
        }
    }

    // ── Signal 4: Repeated opener verb (max 15 pts) ───────────────────────────
    {
        const openerFreq: Record<string, number> = {};
        for (const b of bullets) {
            const w = firstWord(b);
            if (w) openerFreq[w] = (openerFreq[w] ?? 0) + 1;
        }
        const repeats = Object.entries(openerFreq)
            .filter(([, n]) => n >= 3)
            .sort((a, b) => b[1] - a[1]);
        const riskPts = Math.min(15, repeats.length * 5);
        signals.push({
            id: 'repeated_opener',
            label: 'Repeated opener verb',
            severity: riskPts >= 10 ? 'high' : riskPts >= 5 ? 'medium' : riskPts > 0 ? 'low' : 'pass',
            detail: repeats.length > 0
                ? `${repeats.length} verb(s) used to open ≥3 bullets: ${repeats.slice(0, 3).map(([v, n]) => `"${v}" ×${n}`).join(', ')}`
                : 'Good opener variety — no verb repeated 3+ times.',
            fix: 'No single verb should start more than 2 bullets. Rotate verb families: Technical (Built, Configured), Management (Led, Directed), Analysis (Assessed, Evaluated).',
            riskPts,
            maxPts: 15,
        });
    }

    // ── Signal 5: Summary cliché density (max 15 pts) ─────────────────────────
    {
        const hits = SUMMARY_AI_ISMS.filter(rx => rx.test(summary));
        const riskPts = Math.min(15, hits.length * 5);
        signals.push({
            id: 'summary_cliches',
            label: 'Summary cliché density',
            severity: riskPts >= 10 ? 'high' : riskPts >= 5 ? 'medium' : riskPts > 0 ? 'low' : 'pass',
            detail: hits.length > 0
                ? `${hits.length} AI-ism phrase(s) detected in summary: "${hits.slice(0, 2).map(r => r.source.replace(/\\\s\+/g, ' ').replace(/[\\^$]/g, '')).join('", "')}"`
                : 'No cliché phrases in summary.',
            fix: 'Remove phrases like "results-driven", "highly motivated", "detail-oriented". Replace with a specific achievement or fact about yourself.',
            riskPts,
            maxPts: 15,
        });
    }

    // ── Signal 6: Generic summary opener (max 10 pts) ─────────────────────────
    {
        const hit = summary.length > 0 && GENERIC_OPENER_RXS.some(rx => rx.test(summary));
        const riskPts = hit ? 10 : 0;
        signals.push({
            id: 'generic_opener',
            label: 'Generic summary opener',
            severity: hit ? 'high' : 'pass',
            detail: hit
                ? 'Summary opens with a generic phrase ("I am a…", "An experienced…", "Seeking…").'
                : 'Summary opens with a specific, role-grounded statement.',
            fix: 'Open with job title + years + strongest achievement: "Civil engineer with 7 years of structural design experience, delivering KES 250M of infrastructure projects across 4 counties."',
            riskPts,
            maxPts: 10,
        });
    }

    // ── Signal 7: Pronoun leak in bullets (max 10 pts) ────────────────────────
    {
        const hits = bullets.filter(b => PRONOUN_RX.test(b));
        const riskPts = Math.min(10, hits.length * 5);
        signals.push({
            id: 'pronoun_leak',
            label: 'First-person pronouns in bullets',
            severity: riskPts >= 8 ? 'high' : riskPts >= 4 ? 'medium' : riskPts > 0 ? 'low' : 'pass',
            detail: hits.length > 0
                ? `${hits.length} bullet(s) contain "I", "my", "we" or "our" — common in low-quality AI outputs.`
                : 'No first-person pronouns detected in bullets.',
            fix: 'CVs use implied subject — never write "I managed…" or "My team delivered…". Write "Managed…" or "Delivered… with a team of N."',
            riskPts,
            maxPts: 10,
        });
    }

    // ── Signal 8: Passive voice ratio (max 10 pts) ────────────────────────────
    {
        if (bullets.length > 0) {
            const passiveCount = bullets.filter(b => PASSIVE_RX.test(b)).length;
            const ratio        = passiveCount / bullets.length;
            const riskPts      = ratio > 0.25 ? 10 : ratio > 0.15 ? 5 : 0;
            const pct          = Math.round(ratio * 100);
            signals.push({
                id: 'passive_voice',
                label: 'Passive voice ratio',
                severity: riskPts >= 8 ? 'high' : riskPts >= 4 ? 'medium' : 'pass',
                detail: `${pct}% of bullets use passive constructions ("was managed", "were delivered").`,
                fix: 'Rewrite passive bullets as active: "The project was delivered by the team" → "Delivered the project with a team of 6 engineers."',
                riskPts,
                maxPts: 10,
            });
        } else {
            signals.push({ id: 'passive_voice', label: 'Passive voice ratio', severity: 'pass', detail: 'No bullets to check.', fix: '', riskPts: 0, maxPts: 10 });
        }
    }

    // ── Aggregate ─────────────────────────────────────────────────────────────
    const totalRisk   = Math.min(100, signals.reduce((s, sig) => s + sig.riskPts, 0));
    const humanScore  = 100 - totalRisk;

    let verdict: HRDetectionResult['verdict'];
    let verdictColor: HRDetectionResult['verdictColor'];
    if (humanScore >= 85)      { verdict = 'Excellent';   verdictColor = 'emerald'; }
    else if (humanScore >= 70) { verdict = 'Good';        verdictColor = 'teal';    }
    else if (humanScore >= 50) { verdict = 'Needs work';  verdictColor = 'amber';   }
    else                       { verdict = 'High risk';   verdictColor = 'red';     }

    return { humanScore, riskScore: totalRisk, signals, verdict, verdictColor };
}
