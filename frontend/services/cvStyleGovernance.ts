/**
 * cvStyleGovernance.ts — Stylistic Governance for AI CV outputs.
 *
 * Seven detect-only checks that catch "AI-shaped" writing patterns that survive
 * word-level substitution and phrase-repetition checks. Pure regex + lookup
 * tables. Zero AI cost. Zero network calls. Idempotent.
 *
 * Used by purifyCV() (step 6 diagnostics) — results are emitted as PurifyLeak
 * records with fixedBy: 'none'. They surface in telemetry and the quality
 * dashboard but are not auto-fixed (the right fix is an AI rewrite or user edit).
 *
 * Also exports GOVERNANCE_SUBSTITUTIONS — additional AI buzzword patterns that
 * extend the main SUBSTITUTIONS list in cvPurificationPipeline.ts.
 *
 * Checks:
 *   1. Opener category classification (verb / number / scope / context /
 *      timeframe / collaboration / outcome / fragment)
 *   2. Consecutive same-category opener detection (≥3 in a row)
 *   3. Verb-led saturation (>85% of role bullets are verb openers)
 *   4. Semantic verb cluster dominance (one cluster >50% of bullets per role)
 *   5. Bare metric opener (metric in first 5 words, no action-verb setup)
 *   6. Context-before-achievement gap (verb→metric within 6 words, no setup)
 *   7. Meaning-cluster repetition (same outcome expressed 3+ times per role)
 */

import { CVData } from '../types';
import type { SubstitutionRule } from './cvPurificationPipeline';

// ─── Opener category type ─────────────────────────────────────────────────────

export type OpenerCategory =
    | 'verb'          // starts with an action verb — the AI default
    | 'number'        // "3 patents filed", "$2M in new ARR"
    | 'scope'         // "Across 5 regions…", "For 200+ clients…"
    | 'context'       // "As the sole engineer…", "After acquiring…"
    | 'timeframe'     // "In Q3 2023…", "Over 2 years…"
    | 'collaboration' // "With the security team…", "Partnering with…"
    | 'outcome'       // "Top performer…", "Ranked #1…", "Awarded…"
    | 'noun'          // "Payment failure rates dropped…", "Cart abandonment fell 34%…"
    | 'fragment';     // ≤5 words — short punchy fact: "Zero downtime. 18 months."

// ─── Issue types ──────────────────────────────────────────────────────────────

export interface StyleIssue {
    kind:
        | 'opener_category_monotone'    // ≥3 consecutive same-category openers
        | 'all_verb_led'                // >85% of role bullets are verb-led
        | 'verb_cluster_dominance'      // one semantic cluster >50% of bullets in role
        | 'bare_metric_opener'          // bullet opens with a metric, no action verb setup
        | 'context_missing'             // verb→metric within 6 words (no setup clause)
        | 'meaning_cluster_repetition'; // same outcome family expressed 3+ times per role
    severity: 'warn' | 'info';
    where: string;           // e.g. "Software Engineer @ Acme"
    detail: string;          // human-readable description for the console / dashboard
    fieldLocation: string;   // e.g. "experience[0].responsibilities"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip leading bullet glyph / whitespace before classification. */
function stripGlyph(s: string): string {
    return s.replace(/^[\s•\-*·»"']+/, '').trim();
}

// ─── 1. Opener category classifier ───────────────────────────────────────────

/** Small written-number words that signal a number opener at the start of a bullet. */
const NUMBER_WORDS = new Set([
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
    'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
    'hundred', 'thousand', 'million', 'billion',
]);

const SCOPE_RX    = /^(across|for|throughout|covering|spanning|serving|supporting)\b/i;
const CONTEXT_RX  = /^(as|after|during|following|while|when|upon|having|given|since|once|before)\b/i;
// Noun-context detection: metric/process noun as sentence subject, change verb as predicate.
// Catches "Payment failure rates dropped…", "Cart abandonment fell 34%…", "Load time
// decreased from 4.2s to 1.1s…". These were previously misclassified as 'verb' because
// the classifier's default fallback didn't distinguish noun subjects from action verbs.
const NOUN_SUBJECT_RX = /^[A-Z][a-z]+(?:\s+[a-z]+)?\s+(?:rates?|times?|costs?|revenue|margins?|volumes?|scores?|ratios?|adoption|retention|churn|attrition|errors?|failures?|abandonment|performance|throughput|latency|uptime|satisfaction|spend|headcount|conversion|load|response|availability|capacity|efficiency|accuracy)\b/i;
const CHANGE_PREDICATE_RX = /\b(?:dropped?|fell|grew|rose|increased?|decreased?|improved?|reduced?|declined?|jumped?|plummeted?|halved?|doubled?|tripled?|climbed?|shrunk?|shrank|surged?|dipped?)\b/i;
const TIMEFRAME_RX = /^(?:in\s+(?:q[1-4]|20\d{2}|19\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)|over\s+(?:the\s+)?(?:\d+|two|three|four|five|six|seven|eight)|within\s+(?:\d+|one|two|three|four|six|twelve)|by\s+(?:20\d{2}|q[1-4])|from\s+20\d{2})\b/i;
const COLLAB_RX   = /^(?:with\s+(?:the|a|an|my|our)\s+|partnering\s+with|working\s+alongside|alongside|together\s+with|in\s+partnership|in\s+collaboration|collaborating\s+with|jointly\s+with)\b/i;
const OUTCOME_RX  = /^(?:top\s+performer|ranked|awarded|recognised|recognized|promoted|selected|certified|chosen|winner|recipient)\b/i;
const CURRENCY_RX = /^(?:[$£€¥₦₹]|\b(?:KES|USD|EUR|GBP|NGN|ZAR|AED|INR)\s)/i;

/**
 * Classify the opening style of a single bullet. Deterministic — same input
 * always yields the same category.
 */
export function classifyOpener(bullet: string): OpenerCategory {
    const s = stripGlyph(bullet);
    if (!s) return 'fragment';

    const words = s.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const firstWord = words[0]?.toLowerCase() ?? '';

    // Fragment: very short statement (≤5 words)
    if (wordCount <= 5) return 'fragment';

    // Number openers: digit-first or currency-first or written number word
    if (/^\d/.test(firstWord) || CURRENCY_RX.test(s)) return 'number';
    if (NUMBER_WORDS.has(firstWord)) return 'number';

    // Context openers: "As the sole engineer…", "After acquiring…"
    if (CONTEXT_RX.test(s)) return 'context';

    // Timeframe openers: "In Q3 2023…", "Over 2 years…", "Within 6 months…"
    if (TIMEFRAME_RX.test(s)) return 'timeframe';

    // Collaboration openers: "With the security team…", "Partnering with…"
    if (COLLAB_RX.test(s)) return 'collaboration';

    // Scope openers: "Across 5 regions…", "For 200+ clients…"
    if (SCOPE_RX.test(s)) return 'scope';

    // Outcome/recognition openers: "Top performer…", "Ranked #1…"
    if (OUTCOME_RX.test(s)) return 'outcome';

    // Noun-context opener: performance/metric noun as grammatical subject, change verb
    // as predicate. e.g. "Payment failure rates dropped from 2.4% to 0.6%…"
    // Must pass both checks to avoid false positives on regular sentences.
    if (NOUN_SUBJECT_RX.test(s) && CHANGE_PREDICATE_RX.test(s)) return 'noun';

    // Default: verb opener (starts with an action verb — the most common AI pattern)
    return 'verb';
}

// ─── 2 & 3. Consecutive opener monotone + verb-led saturation ────────────────

function auditOpenerDiversity(
    bullets: string[],
    where: string,
    fieldLocation: string,
): StyleIssue[] {
    if (bullets.length < 3) return [];
    const issues: StyleIssue[] = [];
    const categories = bullets.map(classifyOpener);

    // Flag when ≥3 consecutive bullets share the same opener category.
    // Resets the streak so each new run of 3 generates only one issue.
    let streak = 1;
    let lastFlaggedAt = -1;
    for (let i = 1; i < categories.length; i++) {
        if (categories[i] === categories[i - 1]) {
            streak++;
            if (streak >= 3 && lastFlaggedAt !== i - streak + 1) {
                lastFlaggedAt = i - streak + 1;
                issues.push({
                    kind: 'opener_category_monotone',
                    severity: 'warn',
                    where,
                    detail: `${streak}+ consecutive "${categories[i]}" openers starting at bullet ${i - streak + 2} — mix opener types (number, scope, context, collaboration) for human-sounding variety`,
                    fieldLocation,
                });
            }
        } else {
            streak = 1;
        }
    }

    // Flag when >85% of bullets in a role start with an action verb.
    // Threshold: ≥4 bullets so we don't flag very short roles.
    const verbCount = categories.filter(c => c === 'verb').length;
    if (bullets.length >= 4 && verbCount / bullets.length > 0.85) {
        issues.push({
            kind: 'all_verb_led',
            severity: 'warn',
            where,
            detail: `${verbCount}/${bullets.length} bullets (${Math.round(verbCount / bullets.length * 100)}%) start with an action verb — add 1–2 number-led, scope-led, or context-led bullets to break the AI verb-chain`,
            fieldLocation,
        });
    }

    return issues;
}

// ─── 4. Semantic verb cluster dominance ──────────────────────────────────────

/**
 * Semantic families of action verbs. The AI tends to over-index on one family
 * per role — "Led, Managed, Directed, Oversaw, Supervised" are all leadership
 * verbs and produce a monotone tone even though the words are different.
 *
 * Matches the FIRST word of the bullet (after glyph strip). Past tense only
 * since bullets should always use past tense in previous roles.
 */
const VERB_CLUSTERS: Record<string, RegExp> = {
    leadership:  /^(?:led|managed|directed|supervised|oversaw|governed|headed|commanded|administered|chaired|ran|owned|championed|orchestrated|spearheaded)\b/i,
    build:       /^(?:built|developed|created|designed|engineered|architected|constructed|established|launched|deployed|wrote|implemented|coded|programmed|shipped|published|released)\b/i,
    growth:      /^(?:increased|grew|expanded|improved|enhanced|boosted|accelerated|elevated|amplified|scaled|doubled|tripled|raised|widened|deepened)\b/i,
    reduce:      /^(?:reduced|cut|streamlined|optimized|optimised|automated|simplified|refactored|eliminated|minimized|minimised|trimmed|decreased|lowered|compressed|consolidated|halved)\b/i,
    analyze:     /^(?:analyzed|analysed|assessed|evaluated|reviewed|audited|investigated|researched|studied|examined|monitored|tracked|measured|identified|diagnosed|benchmarked)\b/i,
    communicate: /^(?:presented|communicated|reported|trained|coached|mentored|educated|guided|advised|briefed|facilitated|collaborated)\b/i,
    strategy:    /^(?:defined|shaped|devised|planned|formulated|prioritized|prioritised|aligned|proposed|envisioned|determined|established|outlined)\b/i,
    deliver:     /^(?:delivered|executed|completed|finished|shipped|fulfilled|produced|generated|achieved|hit|exceeded|surpassed|met)\b/i,
};

function classifyVerbCluster(bullet: string): string | null {
    const s = stripGlyph(bullet);
    for (const [cluster, rx] of Object.entries(VERB_CLUSTERS)) {
        if (rx.test(s)) return cluster;
    }
    return null;
}

function auditVerbClusterDominance(
    bullets: string[],
    where: string,
    fieldLocation: string,
): StyleIssue[] {
    if (bullets.length < 4) return [];
    const clusterCounts: Record<string, number> = {};
    for (const b of bullets) {
        const cluster = classifyVerbCluster(b);
        if (cluster) clusterCounts[cluster] = (clusterCounts[cluster] || 0) + 1;
    }
    const issues: StyleIssue[] = [];
    for (const [cluster, count] of Object.entries(clusterCounts)) {
        if (count / bullets.length > 0.50) {
            issues.push({
                kind: 'verb_cluster_dominance',
                severity: 'warn',
                where,
                detail: `"${cluster}" verb cluster: ${count}/${bullets.length} bullets (${Math.round(count / bullets.length * 100)}%) — rotate to other action families (e.g. analyze, deliver, strategy) for tonal range`,
                fieldLocation,
            });
        }
    }
    return issues;
}

// ─── 5. Bare metric opener ────────────────────────────────────────────────────

/**
 * A bullet that OPENS with a raw metric ("40% increase in…", "$2M generated…")
 * is a common AI pattern — it front-loads the number without context. Human
 * writers typically set up the action first. We flag it so the next polish pass
 * can reframe as "Rebuilt X, achieving a 40% increase in…".
 *
 * The bare-metric opener is different from an intentional number opener
 * ("3 patents filed in 2024") — the latter is short, factual, and doesn't
 * need reframing. We avoid false-positives by only flagging when the metric
 * is immediately followed by a scale word and the bullet is ≥ 8 words.
 */
const BARE_METRIC_RX = /^(?:[$£€¥₦₹]|(?:KES|USD|EUR|GBP|NGN|ZAR)\s)?\d[\d,.]*\s*(?:%|percent|K\b|M\b|B\b|x\b|times?\b)/i;

function auditBareMetricOpener(
    bullets: string[],
    where: string,
    fieldLocation: string,
): StyleIssue[] {
    const issues: StyleIssue[] = [];
    for (const b of bullets) {
        const s = stripGlyph(b);
        const wordCount = s.split(/\s+/).filter(Boolean).length;
        // Only flag non-trivial bullets where the opener is a scaled metric
        if (wordCount >= 8 && BARE_METRIC_RX.test(s)) {
            issues.push({
                kind: 'bare_metric_opener',
                severity: 'info',
                where,
                detail: `"${s.slice(0, 65)}…" — opens with a metric; add an action verb first so the reader understands what you did before seeing the result`,
                fieldLocation,
            });
        }
    }
    return issues;
}

// ─── 6. Context-before-achievement gap ───────────────────────────────────────

/**
 * Detects verb-first bullets where a metric appears very early (words 2–6)
 * with no context clause between the verb and the number.
 *
 *   "Increased revenue by 40%"              ← flagged (verb then immediate metric)
 *   "Rebuilt pricing model, increasing…"    ← safe (verb then context then metric)
 *   "Reduced churn rate from 18% to 9%"     ← flagged
 *   "Diagnosed root-cause of churn, reducing rate from 18% to 9%" ← safe
 *
 * We check the first 6 words for a digit after a capitalised action verb.
 * Severity is 'info' (not 'warn') — short quantified bullets aren't always wrong.
 */
const CAPITAL_VERB_RX = /^[A-Z][a-z]{2,}/;
const EARLY_DIGIT_RX  = /\b\d[\d,.]*\s*(?:%|percent|K\b|M\b|B\b|x\b|times?\b)?\b/;

function auditContextBeforeAchievement(
    bullets: string[],
    where: string,
    fieldLocation: string,
): StyleIssue[] {
    const issues: StyleIssue[] = [];
    for (const b of bullets) {
        const s = stripGlyph(b);
        const words = s.split(/\s+/).filter(Boolean);
        // Skip very short bullets (≤7 words) — context clause can't fit
        if (words.length <= 7) continue;
        // Must start with a capitalised verb (first word only, not a number)
        if (!CAPITAL_VERB_RX.test(words[0]) || /^\d/.test(words[0])) continue;
        // If a metric appears in words 2–6, there's no room for a context clause
        const earlySlice = words.slice(1, 6).join(' ');
        if (EARLY_DIGIT_RX.test(earlySlice)) {
            issues.push({
                kind: 'context_missing',
                severity: 'info',
                where,
                detail: `"${s.slice(0, 70)}…" — metric appears before context; consider "Did X [in scope/under condition], achieving Y%" to give the achievement meaning`,
                fieldLocation,
            });
        }
    }
    return issues;
}

// ─── 7. Meaning-cluster repetition ───────────────────────────────────────────

/**
 * Even with different words, repeatedly expressing the same OUTCOME MEANING
 * reads as AI output. "Improved efficiency", "enhanced performance",
 * "optimized workflow", "boosted productivity" in the same role all say
 * the same thing with different synonyms. We map them to meaning families
 * and flag when ≥3 bullets in a role belong to the same family.
 *
 * Regexes are global (/gi) — reset lastIndex before each use.
 */
const MEANING_CLUSTERS: Record<string, RegExp> = {
    improvement: /\b(?:improv|enhanc|optimis|optimiz|uplift|upgrad|refin|strengthen|revamp|fortif|elevat|better|polish)\w*/gi,
    growth:      /\b(?:grow|expand|scal|increas|accelerat|amplif|doubl|tripl|rais\w+|driv\w+\s+growth)\w*/gi,
    reduction:   /\b(?:reduc|decreas|lower|minimis|minimiz|trim|cut|compress|shrink|slim|halv|eliminat)\w*/gi,
    efficiency:  /\b(?:effici|streamlin|automat|simplif|speed\s+up|rationalis|rationaliz|consolidat)\w*/gi,
    stakeholder: /\b(?:collaborat|partner|stakeholder|align\w+\s+with|coordinat\w+\s+with|cross[- ]functional|cross[- ]team)\w*/gi,
};

function auditMeaningClusterRepetition(
    bullets: string[],
    where: string,
    fieldLocation: string,
): StyleIssue[] {
    if (bullets.length < 3) return [];
    const issues: StyleIssue[] = [];

    for (const [family, rx] of Object.entries(MEANING_CLUSTERS)) {
        let count = 0;
        for (const b of bullets) {
            rx.lastIndex = 0;
            if (rx.test(b)) count++;
        }
        if (count >= 3) {
            issues.push({
                kind: 'meaning_cluster_repetition',
                severity: 'warn',
                where,
                detail: `"${family}" meaning cluster: ${count}/${bullets.length} bullets express the same underlying outcome — vary the result type (scope, process change, quality, efficiency, revenue, risk reduction)`,
                fieldLocation,
            });
        }
    }
    return issues;
}

// ─── Main audit function ──────────────────────────────────────────────────────

export interface StyleGovernanceReport {
    issues: StyleIssue[];
    totalIssues: number;
    issuesByKind: Record<string, number>;
    durationMs: number;
}

/**
 * Runs all seven stylistic governance checks across every experience role.
 * Returns a report of detected issues — zero mutation, purely observational.
 * Safe to call from inside purifyCV (it never throws and it never mutates cv).
 */
export function auditStyleGovernance(cv: CVData): StyleGovernanceReport {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const issues: StyleIssue[] = [];

    for (let i = 0; i < (cv.experience || []).length; i++) {
        const role = cv.experience[i];
        if (!role) continue;
        const bullets = (role.responsibilities || []).filter(
            b => typeof b === 'string' && b.trim().length > 0,
        );
        if (bullets.length < 2) continue;

        const where = `${role.jobTitle || '?'} @ ${role.company || '?'}`;
        const fieldLocation = `experience[${i}].responsibilities`;

        issues.push(...auditOpenerDiversity(bullets, where, fieldLocation));
        issues.push(...auditVerbClusterDominance(bullets, where, fieldLocation));
        issues.push(...auditBareMetricOpener(bullets, where, fieldLocation));
        issues.push(...auditContextBeforeAchievement(bullets, where, fieldLocation));
        issues.push(...auditMeaningClusterRepetition(bullets, where, fieldLocation));
    }

    // Also audit project bullets when they exist (Bug 2 — projects now first-class citizens)
    for (let i = 0; i < (cv.projects || []).length; i++) {
        const project = (cv.projects || [])[i];
        if (!project) continue;
        const bullets = (project.bullets || []).filter(
            b => typeof b === 'string' && b.trim().length > 0,
        );
        if (bullets.length < 2) continue;

        const where = `Project: ${project.name || '?'}`;
        const fieldLocation = `projects[${i}].bullets`;

        issues.push(...auditOpenerDiversity(bullets, where, fieldLocation));
        issues.push(...auditVerbClusterDominance(bullets, where, fieldLocation));
        issues.push(...auditBareMetricOpener(bullets, where, fieldLocation));
        issues.push(...auditContextBeforeAchievement(bullets, where, fieldLocation));
        issues.push(...auditMeaningClusterRepetition(bullets, where, fieldLocation));
    }

    const issuesByKind: Record<string, number> = {};
    for (const iss of issues) {
        issuesByKind[iss.kind] = (issuesByKind[iss.kind] || 0) + 1;
    }

    const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return { issues, totalIssues: issues.length, issuesByKind, durationMs };
}

// ─── New AI buzzword substitutions ───────────────────────────────────────────

/**
 * Additional AI-specific buzzwords and filler patterns not covered by the
 * original SUBSTITUTIONS list in cvPurificationPipeline.ts.
 *
 * Exported so cvPurificationPipeline.ts can merge these into the auto-fix pass.
 *
 * Rules (same as the main list):
 *   - Regexes are /gi (case-insensitive, global).
 *   - Replacements keep the sentence grammatical (noun→noun, verb→verb).
 *   - Empty string replacements are safe to drop (pure filler adverbs / modifiers).
 *   - Longer / more-specific patterns come first to avoid partial matches.
 */
// Single source of truth: this table MUST stay in sync with the identical
// `_GOV` array in `backend/cv-engine-worker/src/handlers/purify.ts`. A prior
// migration emptied this table (silent no-op) while the Worker kept the real
// data — see cv-purification-pipeline-migration-gap memory note.
const gov = (pattern: RegExp, replacement: string, reason: string): SubstitutionRule =>
    ({ pattern, replacement, reason });

export const GOVERNANCE_SUBSTITUTIONS: SubstitutionRule[] = [
    // ── Adverb AI-tells (silently remove — they add no meaning) ───────────────
    gov(/\bproactively\s+/gi,                                  '', 'phrase:ai-adverb'),
    gov(/\bseamlessly\s+/gi,                                   '', 'phrase:ai-adverb'),
    gov(/\brobustly\s+/gi,                                     '', 'phrase:ai-adverb'),
    gov(/\bholistically\s+/gi,                                 '', 'phrase:ai-adverb'),
    gov(/\bstrategically\s+/gi,                                '', 'phrase:ai-adverb'),
    // ── Adjective AI-tells (silently remove when preceding nouns) ─────────────
    gov(/\bcutting[- ]edge\s+/gi,                              '', 'phrase:ai-adjective'),
    gov(/\bdata[- ]driven\s+/gi,                               '', 'phrase:ai-adjective'),
    gov(/\bworld[- ]class\s+/gi,                               '', 'phrase:ai-adjective'),
    gov(/\bstate[- ]of[- ]the[- ]art\s+/gi,                    '', 'phrase:ai-adjective'),
    gov(/\bvalue[- ]added\s+/gi,                               '', 'phrase:ai-adjective'),
    gov(/\bscalable\s+(?=solution|framework|infrastructure|pipeline|model|platform|approach)/gi, '', 'phrase:ai-adjective'),
    gov(/\brobust\s+(?=solution|framework|pipeline|system|architecture|approach|model)/gi,       '', 'phrase:ai-adjective'),
    // ── Superlative / hyperbolic phrases → concrete alternatives ──────────────
    gov(/\bbest[- ]in[- ]class\b/gi,                          'top-performing',       'phrase:hyperbole'),
    gov(/\bhigh[- ]impact\b/gi,                               'impactful',            'phrase:hyperbole'),
    gov(/\bground[- ]breaking\b/gi,                           'novel',                'phrase:hyperbole'),
    gov(/\bholistic\b/gi,                                     'comprehensive',        'phrase:hyperbole'),
    gov(/\bproactive\b/gi,                                    'forward-thinking',     'phrase:hyperbole'),
    gov(/\bseamless\b/gi,                                     'smooth',               'phrase:hyperbole'),
    gov(/\bgame[- ]changing\b/gi,                             'impactful',            'phrase:hyperbole'),
    gov(/\bgame[- ]changer\b/gi,                              'improvement',          'phrase:hyperbole'),
    gov(/\btransformative\b/gi,                               'significant',          'phrase:hyperbole'),
    gov(/\bdisruptive\s+(?=technology|approach|solution|innovation)/gi, 'new ',       'phrase:hyperbole'),
    gov(/\bpivotal\b/gi,                                      'critical',             'phrase:hyperbole'),
    gov(/\bactionable\s+insights?\b/gi,                       'findings',             'phrase:ai-buzzword'),
    gov(/\bactionable\b/gi,                                   'practical',            'phrase:ai-buzzword'),
    gov(/\bthought\s+leadership\b/gi,                         'domain expertise',     'phrase:ai-buzzword'),
    gov(/\bthought\s+leaders?\b/gi,                           'domain expert',        'phrase:ai-buzzword'),
    gov(/\bat\s+the\s+forefront\s+of\b/gi,                    'leading in',           'phrase:ai-buzzword'),
    gov(/\bin\s+a\s+timely\s+manner\b/gi,                     'on time',              'phrase:ai-buzzword'),
    gov(/\bstakeholder\s+engagement\b/gi,                     'stakeholder communication', 'phrase:ai-buzzword'),
    gov(/\bcross[- ]functional\s+collaboration\b/gi,          'cross-team collaboration',  'phrase:ai-buzzword'),
    gov(/\bkey\s+stakeholders?\b/gi,                          'stakeholders',         'phrase:ai-buzzword'),
    gov(/\bsignificant\s+impact\b/gi,                         'measurable results',   'phrase:ai-buzzword'),
    gov(/\bpositive\s+impact\b/gi,                            'measurable results',   'phrase:ai-buzzword'),
    gov(/\bdriving\s+(?:business\s+)?(?:value|outcomes?|impact)\b/gi, 'delivering results', 'phrase:ai-buzzword'),
    gov(/\bharnessed?\b/gi,                                   'used',                 'phrase:ai-buzzword'),
    gov(/\bharnessing\b/gi,                                   'using',                'phrase:ai-buzzword'),
    gov(/\bempower(?:ed)?\b/gi,                               'enabled',              'phrase:ai-buzzword'),
    gov(/\bempowering\b/gi,                                   'enabling',             'phrase:ai-buzzword'),
    gov(/\bempowers\b/gi,                                     'enables',              'phrase:ai-buzzword'),
    gov(/\bfoster(?:ed)?\s+(?:a\s+)?(?:culture|environment)\s+of\b/gi, 'built a culture of', 'phrase:ai-buzzword'),
    gov(/\bpivot(?:ed)?\s+to\b/gi,                            'switched to',          'phrase:ai-buzzword'),
    gov(/\bpivoting\s+to\b/gi,                                'switching to',         'phrase:ai-buzzword'),
    gov(/\bdriving\s+alignment\b/gi,                          'aligning teams',       'phrase:ai-buzzword'),
    gov(/\bsolving\s+complex\s+problems?\b/gi,                'resolving technical challenges', 'phrase:ai-buzzword'),
    // ── Filler closing phrases (delete) ───────────────────────────────────────
    gov(/[,\s]*moving\s+forward[.,]?\s*/gi,                   '', 'phrase:filler-closing'),
    gov(/[,\s]*going\s+forward[.,]?\s*/gi,                    '', 'phrase:filler-closing'),
];
