// services/cvNumberFidelity.ts
import { auditCvVoice } from './cvVoiceFidelity';
//
// Number-fidelity helpers used by services/geminiService.ts.
//
// History: the previous implementation deleted just the digits of any
// generated number that didn't appear in the source bullets. The
// surrounding "%", "+", "-noun", "KES ", "$" etc. were left behind as
// orphans, so users saw garbage like:
//   - "a portfolio of + end-to-end project lifecycles"
//   - "a -person field operations team"
//   - "KES , in revenue"
//   - "exceeding monthly targets by % from Dec 2023"
//
// These helpers consume the entire numeric phrase, tidy any orphan
// punctuation, preserve calendar years, and (via repairBulletsAgainstSource)
// fall back to the user's original profile bullet whenever the generated
// bullet would come out broken.

const CURRENCY_WORDS =
    'USD|EUR|GBP|KES|KSH|NGN|ZAR|GHS|UGX|TZS|RWF|XOF|XAF|JPY|CNY|INR|AUD|CAD|CHF|AED';
// Includes time units (years/months/weeks/days/hours) so phrases like
// "with 5 years delivering" get consumed wholesale instead of leaving
// "with years delivering" behind when the number is hallucinated.
const UNIT_SUFFIXES =
    '%|x|times|m|million|k|thousand|bn|billion|M|K|years?|months?|weeks?|days?|hours?';
const HYPHEN_NOUN_SUFFIXES =
    'person|people|day|days|week|weeks|month|months|year|years|strong|fold|member|members|hour|hours|minute|minutes|second|seconds';

// Matches a full numeric expression: optional currency prefix, the number
// itself (with thousand-separators / decimals), and optional unit / "+" /
// "-noun" suffix. Use 'g' flag at call site.
//
// (?<![A-Za-z]) ensures we don't eat digits that are part of an
// alphanumeric token like "Q4", "G7", "iPhone15", "COVID19".
const NUMERIC_PHRASE_SOURCE =
    `(?:\\b(?:${CURRENCY_WORDS})\\s*)?` +     // optional "KES " / "USD "
    `[$€£₦₹¥]?\\s*` +                         // optional symbol
    `(?<![A-Za-z])` +                         // not glued to a letter
    `\\d[\\d,]*(?:\\.\\d+)?` +                // the number
    `(?![A-Za-z])` +                          // not glued to a letter
    `(?:\\s*(?:${UNIT_SUFFIXES})\\b)?` +      // optional unit (%, x, m, k…)
    `(?:-(?:${HYPHEN_NOUN_SUFFIXES})\\b)?` +  // optional "-person" / "-day"
    `\\+?`;                                   // optional trailing +

const YEAR_NUMERIC_RX = /^(?:19|20)\d{2}$/;

const STRANDED_PREPOSITIONS = new Set([
    'by', 'of', 'to', 'with', 'at', 'from', 'for', 'in', 'on',
    'across', 'over', 'under', 'above', 'below', 'reaching',
    'achieving', 'approximately', 'around', 'about', 'roughly',
    'nearly', 'almost',
]);

export interface ProfileLikeForNumbers {
    professionalSummary?: string;
    summary?: string;
    workExperience?: Array<{ responsibilities?: unknown }>;
    projects?: Array<{ description?: unknown }>;
}

export function collectSourceNumberTokens(
    sourceBullets: string[],
    profile?: ProfileLikeForNumbers,
): Set<string> {
    const haystacks: string[] = [...sourceBullets];
    if (profile) {
        if (typeof profile.professionalSummary === 'string') haystacks.push(profile.professionalSummary);
        if (typeof profile.summary === 'string') haystacks.push(profile.summary);
        for (const role of (profile.workExperience || [])) {
            const r = (role as any)?.responsibilities;
            if (typeof r === 'string') haystacks.push(r);
            else if (Array.isArray(r)) haystacks.push(...(r as string[]));
        }
        for (const proj of (profile.projects || [])) {
            if (proj && typeof proj.description === 'string') haystacks.push(proj.description);
        }
    }
    const tokens = new Set<string>();
    for (const h of haystacks) {
        const hits = String(h || '').match(/\b\d+(?:[.,]\d+)*\b/g) || [];
        for (const t of hits) {
            tokens.add(t);
            tokens.add(t.replace(/,/g, '')); // also accept comma-stripped form
        }
    }
    return tokens;
}

export function stripUngroundedNumbers(
    text: string,
    sourceNumberTokens: Set<string>,
): string {
    if (!text) return '';
    const rx = new RegExp(NUMERIC_PHRASE_SOURCE, 'gi');
    let out = text.replace(rx, (full) => {
        const digitMatch = full.match(/\d[\d,]*(?:\.\d+)?/);
        if (!digitMatch) return full;
        const digitCore = digitMatch[0];
        const digitNoCommas = digitCore.replace(/,/g, '');
        // Always keep 4-digit calendar years — they are almost never
        // hallucinations and stripping them produces "from Dec to Present".
        if (YEAR_NUMERIC_RX.test(digitNoCommas)) return full;
        // Keep if the same number (with or without commas) appears anywhere
        // in the source profile bullets / summary / projects.
        if (sourceNumberTokens.has(digitCore) || sourceNumberTokens.has(digitNoCommas)) return full;
        // Otherwise drop the entire phrase.
        return '';
    });
    out = tidyOrphanRemnants(out);
    return out;
}

export function tidyOrphanRemnants(text: string): string {
    return tidyOrphanRemnantsImpl(text, 0);
}

function tidyOrphanRemnantsImpl(text: string, depth: number): string {
    let out = text;
    // ── STRICT PASS 1: orphan decimal stubs ────────────────────────────────
    // Catches residue like "Generated.8M", "Generated $.8M", "from $.5K to"
    // — when the leading integer of a decimal currency figure was stripped
    // (or never generated) and only the decimal tail survived. Matches an
    // optional currency symbol followed by a leading-period decimal that is
    // NOT preceded by another digit (so "version 1.8" stays intact).
    out = out.replace(
        /(?<!\d)[$€£₦₹¥]?\.\d+(?:\s*[KMBkmb])?\b\+?/g,
        '',
    );
    // Currency word ("KES", "USD"…) immediately followed by a period or
    // semicolon with no digits in between — leftover after a decimal strip
    // ("KES .8M" → ".8M" → ""; sweep the orphan currency word now).
    out = out.replace(
        new RegExp(
            `\\b(?:${CURRENCY_WORDS}|KSh|Ksh)\\s*(?=[.,;:!?])`,
            'g',
        ),
        '',
    );
    // Remove orphan currency word/symbol followed by stray comma group
    // ("KES , in revenue", "$ ,000 in sales", "USD ,500,000").
    out = out.replace(
        new RegExp(
            `\\s*\\b(?:${CURRENCY_WORDS}|KSh|Ksh)\\s*[,]+(?:\\d{3}(?:,\\d{3})*)?\\s*(?:in\\s+(?:revenue|sales|costs?|savings?|earnings?|profit))?`,
            'gi',
        ),
        '',
    );
    out = out.replace(/\s*[$€£₦₹¥]\s*[,]+(?:\d{3}(?:,\d{3})*)?\s*/g, ' ');
    // Orphan currency word with nothing after it ("of KES from Dec 2023").
    out = out.replace(
        new RegExp(
            `\\s*\\b(?:of|by|to|with|at|from|for|approximately|around|about|roughly|nearly|almost|over|under|above|below|up\\s+to)\\s+(?:${CURRENCY_WORDS}|KSh|Ksh)\\b(?!\\s*[\\d$€£₦₹¥])`,
            'gi',
        ),
        '',
    );
    // Orphan "%" with no preceding digit.
    out = out.replace(
        /\s*\b(?:by|of|to|with|at|achieving|reaching|approximately|around|about|roughly|nearly|almost|over|under|above|below|up\s+to|a|an|the)\s+%(?!\w)/gi,
        '',
    );
    out = out.replace(/(?<!\d)\s*%(?!\w)/g, '');
    // Orphan "+" sitting where a leading number used to be ("of + clients").
    out = out.replace(
        /\s*\b(?:of|with|by|over|under|across|up\s+to|reaching|approximately|around|about|roughly|nearly|almost)\s+\+\s+/gi,
        ' ',
    );
    out = out.replace(/(^|[\s(])\+(?=\s|$|[a-zA-Z])/g, '$1');
    // Orphan hyphen between an article and a noun ("a -person team", "the -day window").
    out = out.replace(
        new RegExp(`\\b(a|an|the)\\s+-(?:${HYPHEN_NOUN_SUFFIXES})\\b\\s*`, 'gi'),
        '',
    );
    // Generic orphan leading hyphen ("- person", " - day").
    out = out.replace(/(^|\s)-(?=[a-zA-Z])/g, '$1');
    // Orphan time / experience reference left after a number is stripped:
    //   "with years delivering"  → ""
    //   "of months across"       → "across"
    //   "for years experience"   → ""
    // Same for "experience" with no leading number ("of experience").
    out = out.replace(
        /\b(?:with|of|for|in|on|over|under|across|during|approximately|around|about|roughly|nearly|almost)\s+(?:years?|months?|weeks?|days?|hours?|experience)\b\s*/gi,
        ' ',
    );
    // Drop stranded prepositions left at the end ("…driving a increase in").
    out = out.replace(
        /\b(by|of|to|with|at|from|for|in|on|across|reaching|approximately|around|about|roughly|nearly|almost|over|under|above|below|up\s+to)\s*([.,;:!?]|$)/gi,
        '$2',
    );
    // Drop a preposition immediately followed by another preposition, a
    // temporal connector, or "and"/"or" — common after a number is stripped
    // from between them ("by 30% from Dec 2023" → "by from Dec 2023" →
    // "from Dec 2023"; "exceeding targets by since Dec" → "exceeding
    // targets since Dec"). Run twice to handle "by of from" type chains.
    //
    // The trailing negative lookahead `(?![a-z]+\s+\d)` is the safety valve
    // for legitimate ranges — "from 50% to over 95%" must keep its "to",
    // because the second preposition is followed by a real number, so this
    // is a real range end, not a stripped-number orphan.
    // STRICT preps that are NEVER the start of a numeric range — they always
    // need a number/object after them, so when chained directly into another
    // preposition they are always orphans (e.g. "by from 90%" — "by" lost
    // its anchor, "from" still has 90% so the strip below would spare it).
    const STRICT_PREP_CHAIN_RX = /\b(by|of|with|at|for|over|under|above|below|across|reaching|achieving|approximately|around|about|roughly|nearly|almost)\s+(?=(?:by|of|to|with|at|from|for|in|on|over|under|above|below|across|and|or|since|when|until|after|before|while|within|throughout|during)\b)/gi;
    // RANGE-START preps ("to" / "from") need the digit-aware safety lookahead
    // because legitimate ranges like "from 50% to over 95%" must survive.
    const RANGE_PREP_CHAIN_RX = /\b(to|from)\s+(?=(?:by|of|to|with|at|from|for|in|on|over|under|above|below|across|and|or|since|when|until|after|before|while|within|throughout|during)\b(?![a-z]*\s+[\d$€£₦₹¥]))/gi;
    // Run twice — first pass may expose new chains for the second.
    out = out.replace(STRICT_PREP_CHAIN_RX, '');
    out = out.replace(RANGE_PREP_CHAIN_RX, '');
    out = out.replace(STRICT_PREP_CHAIN_RX, '');
    out = out.replace(RANGE_PREP_CHAIN_RX, '');
    // "with delivering / leading / managing …" — left behind when a
    // duration was stripped from "with 5 years delivering …". Drop the
    // dangling "with" so the participle can lead the phrase naturally
    // ("Field Engineer with delivering …" → "Field Engineer delivering …").
    out = out.replace(
        /\bwith\s+(?=(?:delivering|leading|managing|driving|building|creating|developing|engineering|designing|implementing|providing|generating|achieving|owning|spearheading|growing|expanding|optimi[sz]ing|automating|launching|coordinating|orchestrating|architecting|operating|running|scaling|integrating|deploying|migrating|maintaining)\b)/gi,
        '',
    );
    // Hedged-outcome orphan: "achieving / reaching / driving / yielding +
    // (average|approximately|around|substantial|...) + [optional adjective] +
    // (savings|growth|reduction|...)" — appears when the LLM attached a
    // metric verb to a hedge but the actual number was stripped. Strip the
    // entire hollow claim so we don't leave "achieving average water savings".
    const HEDGE_OUTCOME_RX = /(?:[,;:]\s*)?\b(?:achieving|reaching|driving|yielding|delivering|generating|enabling|producing|resulting\s+in|leading\s+to)\s+(?:an?\s+)?(?:average|approximately|around|about|roughly|nearly|almost|over|under|substantial|significant|notable|measurable|consistent|meaningful|noticeable|considerable)\s+(?:[a-z]+\s+){0,2}(?:savings?|growth|reduction|reductions|improvement|improvements|increase|increases|decrease|decreases|gains?|wins?|results?|impact|efficiency|adoption|engagement|retention|conversion|throughput|productivity|performance|uptime|accuracy|coverage|quality)\b/gi;
    out = out.replace(HEDGE_OUTCOME_RX, '');
    // "on average" / "by on average" with no nearby digit in the same clause
    // is almost always residue ("improve water use efficiency on average").
    // Drop only the trailing "on average" tail when it sits at sentence end
    // or before a comma — keeps "on average, we ship 3 a week" intact.
    out = out.replace(/\s+(?:by\s+)?on\s+average(?=\s*[,.;:!?]|\s*$)/gi, '');
    // "a "/"an "/"the " followed immediately by another article or a
    // preposition is also a strip-orphan ("achieved a increase").
    out = out.replace(/\b(a|an|the)\s+(?=(?:by|of|to|with|at|from|for|in|on|and|or|a|an|the)\b)/gi, '');
    // Collapse ", ," / " , " / multi-spaces / space-before-punct.
    out = out.replace(/\s*,\s*,/g, ',');
    out = out.replace(/\s+([,.;:!?])/g, '$1');
    // Drop a comma that now sits immediately before a sentence terminator
    // ("…water conservation,." → "…water conservation.") — common after
    // the hedged-outcome strip removes a trailing clause.
    out = out.replace(/,(?=\s*[.;:!?])/g, '');
    // Drop a trailing comma at end of string.
    out = out.replace(/,\s*$/g, '');
    out = out.replace(/\(\s*\)/g, '');
    // Collapse repeated terminal punctuation (".." / ",,," / "!!!" → single).
    // Three-dot ellipsis is preserved (handled by negative lookahead earlier
    // pass + this rule only collapses 2+ identical punct of "." "," ";").
    out = out.replace(/([,;:])\1+/g, '$1');
    out = out.replace(/\.{2}(?!\.)/g, '.');
    // Ensure single space after sentence-ending punctuation when followed by
    // a word (".Designed" → ". Designed"). Skips decimals (handled above)
    // AND skips abbreviations like "i.e." / "e.g." / "U.S.A." / "Ph.D."
    // where the previous segment was a single letter (so the period is part
    // of an abbreviation, not a sentence terminator).
    out = out.replace(/(?<![A-Za-z]\.[A-Za-z])(?<!\b[A-Za-z])([.!?])([A-Za-z])/g, '$1 $2');
    // Capitalise the first letter after a sentence terminator (". the team"
    // → ". The team"). Same abbreviation guard as above.
    out = out.replace(
        /(?<![A-Za-z]\.[A-Za-z])(?<!\b[A-Za-z])([.!?]\s+)([a-z])/g,
        (_m, p, c) => p + c.toUpperCase(),
    );
    // Standalone lowercase "i" pronoun → "I" (never matches "i.e.", "in", etc.
    // because we require word boundaries on both sides and a single letter).
    out = out.replace(/\bi\b(?!\.)/g, 'I');
    out = out.replace(/\s{2,}/g, ' ').trim();
    // ── STRICT PASS 2: re-run the cleanup chain once more ──────────────────
    // Some cleanups expose new orphans (e.g. removing a number reveals a
    // chained preposition that the first pass couldn't see). One re-entry
    // is enough to settle cascading damage. Depth is capped at 1.
    if (depth < 1 && out !== text) {
        return tidyOrphanRemnantsImpl(out, depth + 1);
    }
    return out;
}

/**
 * Heuristic: returns true if the (already-stripped) bullet looks broken
 * enough that the user is better served by the original source bullet.
 */
export function isBulletDegraded(stripped: string, original: string): boolean {
    if (!stripped) return true;
    const trimmed = stripped.trim();
    if (trimmed.length < 25) return true;
    // Sentence stub starting with a preposition is almost always wrong.
    const firstWord = trimmed.replace(/^[\s•\-*·»"']+/, '').split(/\s+/)[0]?.toLowerCase();
    if (firstWord && STRANDED_PREPOSITIONS.has(firstWord)) return true;
    // ── STRICT signatures: defense-in-depth against orphans that survived
    //    tidyOrphanRemnants. Any of these means "fall back to source bullet".
    // Orphan decimal stub anywhere ("Generated.8M", "delivered .5M ARR").
    if (/(?<!\d)\.\d+\s*[KMBkmb]?\b/.test(trimmed)) return true;
    // Chained prepositions / temporals ("by since", "by from", "to in").
    if (/\b(?:by|of|to|with|at|for|over|under|across)\s+(?:by|of|to|with|at|from|for|in|on|since|when|until|after|before|while)\b/i.test(trimmed)) return true;
    // "with delivering / leading / managing …" — lost duration anchor.
    if (/\bwith\s+(?:delivering|leading|managing|driving|building|creating|developing|engineering|designing|implementing|providing|generating|achieving|owning|spearheading|growing|expanding|optimi[sz]ing|automating|launching|coordinating|orchestrating|architecting|operating|running|scaling|integrating|deploying|migrating|maintaining)\b/i.test(trimmed)) return true;
    // "from over X% within …" / "from approximately X% to …" with no second
    // value present — the start-of-range anchor was stripped.
    if (/\bfrom\s+(?:over|under|about|approximately|around|roughly|nearly|almost|~)\s+\d/i.test(trimmed)
        && !/\bto\s+(?:over|under|about|approximately|around|roughly|nearly|almost|~)?\s*\d/i.test(trimmed)) return true;
    // Hedged-outcome orphan that escaped the strip.
    if (/\b(?:achieving|reaching|driving|yielding|delivering|generating|enabling)\s+(?:an?\s+)?(?:average|approximately|around|about|roughly|nearly|almost|substantial|significant|notable|measurable)\s+\w+\s+(?:savings?|growth|reduction|improvement|increase|decrease|gains?)\b/i.test(trimmed)) return true;
    // Lost more than 40 % of the words AND the original had a sentence-leading
    // action verb — the bullet is hollowed out.
    const origWords = (original || '').split(/\s+/).filter(Boolean).length;
    const newWords = trimmed.split(/\s+/).filter(Boolean).length;
    if (origWords >= 8 && newWords / origWords < 0.6) return true;
    return false;
}

/**
 * Apply the number strip to every generated bullet for a role and, when a
 * bullet would come out broken, fall back to the next unused source bullet
 * from the same role. If we run out of source bullets, we drop the broken
 * bullet rather than emit garbage.
 */
export function repairBulletsAgainstSource(
    generatedBullets: string[],
    sourceBullets: string[],
    sourceNumberTokens: Set<string>,
): string[] {
    const sourcePool = sourceBullets.map(s => String(s || '').trim()).filter(Boolean);
    const used = new Set<number>();
    const out: string[] = [];
    for (let i = 0; i < generatedBullets.length; i++) {
        const original = String(generatedBullets[i] || '');
        const stripped = stripUngroundedNumbers(original, sourceNumberTokens);
        if (!isBulletDegraded(stripped, original)) {
            out.push(stripped);
            continue;
        }
        // Pick a fallback source bullet, preferring the same index.
        let fallback = '';
        if (i < sourcePool.length && !used.has(i)) {
            fallback = sourcePool[i];
            used.add(i);
        } else {
            for (let j = 0; j < sourcePool.length; j++) {
                if (!used.has(j)) {
                    fallback = sourcePool[j];
                    used.add(j);
                    break;
                }
            }
        }
        if (fallback) out.push(fallback);
        // else: drop this bullet entirely — better than emitting garbage.
    }
    return out;
}

/**
 * Apply the same strip + fallback logic to a single free-text block (the
 * professional summary, project description, etc.). Returns the cleaned
 * generated text, or — if it would come out broken — the source fallback
 * verbatim. Returns the original generated text only if no fallback exists.
 */
export function repairTextAgainstSource(
    generatedText: string,
    sourceText: string,
    sourceNumberTokens: Set<string>,
): string {
    const original = String(generatedText || '');
    const stripped = stripUngroundedNumbers(original, sourceNumberTokens);
    if (!isBulletDegraded(stripped, original)) return stripped;
    const fallback = String(sourceText || '').trim();
    return fallback || stripped;
}

// ── Output quality audit ──────────────────────────────────────────────────
//
// Cheap, deterministic post-flight check that runs on the FINAL CV after
// every fidelity pass. Pure regex, O(total characters), no LLM calls. Used
// to surface any orphan-symbol garbage that slipped through the pipeline so
// regressions are visible in the console immediately.

export type CvQualityIssueKind =
    | 'orphan_currency_comma'        // "KES ," / "$ ,"
    | 'orphan_currency_word'         // "of KES" with no number after
    | 'orphan_percent'               // " %" not preceded by a digit
    | 'orphan_plus'                  // " + " between words
    | 'orphan_hyphen_noun'           // " -person" not preceded by a digit
    | 'orphan_dollar'                // "$ " followed by non-digit
    | 'stub_bullet'                  // bullet starts with a preposition
    | 'empty_bullet'                 // bullet is empty/whitespace
    | 'duplicate_adjacent_word'      // "the the", "and and"
    | 'mid_sentence_period'          // ". " followed by lowercase letter
    | 'first_person_pronoun'         // "I", "I've", "my", "we", "our"
    | 'tense_third_person_singular'  // "Generates" / "Delivers" in current role
    | 'dangling_time_ref'            // "with years", "of months", "for experience"
    | 'orphan_decimal_stub'          // "Generated.8M", "$.5K"
    | 'chained_preposition'          // "by since", "to in", "of from"
    | 'unanchored_with_participle'   // "with delivering", "with leading"
    | 'unanchored_hedged_outcome'    // "achieving average water savings"
    | 'half_open_range';             // "from over 95%" with no "to" anchor

export interface CvQualityIssue {
    kind: CvQualityIssueKind;
    where: string;
    snippet: string;
}

export interface CvQualityReport {
    score: number;          // 0–100, higher is better
    totalBullets: number;
    totalIssues: number;
    issues: CvQualityIssue[];
    durationMs: number;
}

interface CvLikeForAudit {
    summary?: string;
    experience?: Array<{
        jobTitle?: string;
        company?: string;
        responsibilities?: string[];
    }>;
    projects?: Array<{ name?: string; description?: string }>;
}

const ORPHAN_PROBES: Array<{ kind: CvQualityIssueKind; rx: RegExp }> = [
    { kind: 'orphan_currency_comma', rx: /\b(?:USD|EUR|GBP|KES|KSH|NGN|ZAR|GHS|UGX|TZS|RWF|XOF|XAF|JPY|CNY|INR|AUD|CAD|CHF|AED|KSh|Ksh)\s*,/ },
    { kind: 'orphan_currency_comma', rx: /[$€£₦₹¥]\s*,/ },
    { kind: 'orphan_currency_word', rx: /\b(?:of|by|to|with|at|from|for)\s+(?:USD|EUR|GBP|KES|KSH|NGN|ZAR|GHS|UGX|TZS|RWF|XOF|XAF|JPY|CNY|INR|AUD|CAD|CHF|AED|KSh|Ksh)\b(?!\s*[\d$€£₦₹¥])/ },
    { kind: 'orphan_percent', rx: /(?<!\d)\s%(?!\w)/ },
    { kind: 'orphan_percent', rx: /\b(?:by|of|to|with|at|achieving|reaching)\s+%(?!\w)/i },
    { kind: 'orphan_plus', rx: /\b(?:of|with|by|over|under|across)\s+\+\s+/i },
    { kind: 'orphan_plus', rx: /(^|\s)\+\s+(?=[a-zA-Z])/ },
    { kind: 'orphan_hyphen_noun', rx: /\b(a|an|the)\s+-(?:person|people|day|days|week|weeks|month|months|year|years|strong|fold|member|members|hour|hours)\b/i },
    { kind: 'orphan_dollar', rx: /[$€£₦₹¥]\s+(?=[A-Za-z])/ },
    { kind: 'duplicate_adjacent_word', rx: /\b(\w+)\s+\1\b/i },
    { kind: 'mid_sentence_period', rx: /\.\s+[a-z]/ },
    // Dangling time / experience reference left after a hallucinated number
    // was stripped: "with years delivering", "of months across", "for experience".
    { kind: 'dangling_time_ref', rx: /\b(?:with|of|for|in|over|across|during)\s+(?:years?|months?|weeks?|days?|hours?|experience)\b/i },
    // Orphan decimal stub: ".8M" / "$.5K" not preceded by a digit.
    { kind: 'orphan_decimal_stub', rx: /(?<!\d)[$€£₦₹¥]?\.\d+\s*[KMBkmb]?\b/ },
    // Chained prepositions / temporals exposing a stripped number.
    { kind: 'chained_preposition', rx: /\b(?:by|of|to|with|at|for|over|under|across)\s+(?:by|of|to|with|at|from|for|in|on|since|when|until|after|before|while)\b/i },
    // "with delivering / leading / managing …" — duration anchor lost.
    { kind: 'unanchored_with_participle', rx: /\bwith\s+(?:delivering|leading|managing|driving|building|creating|developing|engineering|designing|implementing|providing|generating|achieving|owning|spearheading|growing|expanding|optimi[sz]ing|automating|launching|coordinating|orchestrating|architecting|operating|running|scaling|integrating|deploying|migrating|maintaining)\b/i },
    // Hedged-outcome orphan that escaped the strip.
    { kind: 'unanchored_hedged_outcome', rx: /\b(?:achieving|reaching|driving|yielding|delivering|generating|enabling)\s+(?:an?\s+)?(?:average|approximately|around|about|roughly|nearly|almost|substantial|significant|notable|measurable)\s+\w+\s+(?:savings?|growth|reduction|improvement|increase|decrease|gains?)\b/i },
];

const STUB_FIRST_WORDS = new Set([
    'by', 'of', 'to', 'with', 'at', 'from', 'for', 'in', 'on',
    'across', 'over', 'under', 'above', 'below',
]);

function snippetAround(text: string, idx: number, span = 40): string {
    const start = Math.max(0, idx - span);
    const end = Math.min(text.length, idx + span);
    return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

function probeText(text: string, where: string, issues: CvQualityIssue[]): void {
    if (!text) return;
    for (const probe of ORPHAN_PROBES) {
        const m = probe.rx.exec(text);
        if (m) {
            issues.push({
                kind: probe.kind,
                where,
                snippet: snippetAround(text, m.index ?? 0),
            });
        }
    }
}

export function auditCvQuality(cv: CvLikeForAudit): CvQualityReport {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const issues: CvQualityIssue[] = [];
    let totalBullets = 0;

    if (typeof cv.summary === 'string') {
        probeText(cv.summary, 'summary', issues);
    }

    const experience = cv.experience || [];
    for (let i = 0; i < experience.length; i++) {
        const role = experience[i] || {};
        const label = `experience[${i}] ${role.jobTitle || '?'} @ ${role.company || '?'}`;
        const bullets = Array.isArray(role.responsibilities) ? role.responsibilities : [];
        for (let j = 0; j < bullets.length; j++) {
            const b = String(bullets[j] || '');
            totalBullets++;
            const where = `${label}#${j}`;
            const trimmed = b.trim();
            if (!trimmed) {
                issues.push({ kind: 'empty_bullet', where, snippet: '' });
                continue;
            }
            const firstWord = trimmed.replace(/^[\s•\-*·»"']+/, '').split(/\s+/)[0]?.toLowerCase();
            if (firstWord && STUB_FIRST_WORDS.has(firstWord)) {
                issues.push({ kind: 'stub_bullet', where, snippet: trimmed.slice(0, 80) });
            }
            probeText(b, where, issues);
        }
    }

    const projects = cv.projects || [];
    for (let i = 0; i < projects.length; i++) {
        const p = projects[i] || {};
        const label = `projects[${i}] ${p.name || '?'}`;
        if (typeof p.description === 'string') {
            probeText(p.description, label, issues);
        }
    }

    // Voice audit (first-person pronouns, tense drift in current role).
    // Kept in a separate module so the two concerns are testable in
    // isolation; merged here so consumers see one combined report.
    try {
        const voiceIssues = auditCvVoice(cv as any);
        for (const v of voiceIssues) {
            issues.push({ kind: v.kind as CvQualityIssueKind, where: v.where, snippet: v.snippet });
        }
    } catch {
        // Voice audit must never block the rest of the report.
    }

    const totalIssues = issues.length;
    // Score: 100 minus 8 per issue, floored at 0.
    const score = Math.max(0, 100 - totalIssues * 8);
    const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return { score, totalBullets, totalIssues, issues, durationMs };
}

/**
 * Convenience wrapper that runs auditCvQuality and emits a single-line
 * console summary plus per-issue warnings only when issues are found.
 * Safe to call from inside finalizeCvData — it never throws and it never
 * mutates the CV.
 */
export function logCvQualityReport(cv: CvLikeForAudit, contextLabel = 'CV'): CvQualityReport {
    let report: CvQualityReport;
    try {
        report = auditCvQuality(cv);
    } catch {
        return { score: 0, totalBullets: 0, totalIssues: 0, issues: [], durationMs: 0 };
    }
    const ms = report.durationMs.toFixed(1);
    if (report.totalIssues === 0) {
        // Quiet success line so users can confirm the audit ran.
        // eslint-disable-next-line no-console
        console.info(`[CV Quality] ${contextLabel}: score 100/100 across ${report.totalBullets} bullet(s) in ${ms}ms`);
        return report;
    }
    // eslint-disable-next-line no-console
    console.warn(
        `[CV Quality] ${contextLabel}: score ${report.score}/100 — ${report.totalIssues} issue(s) across ${report.totalBullets} bullet(s) in ${ms}ms`,
    );
    // Surface up to 6 issues so the console doesn't get spammed on a really
    // bad CV; the rest are still in the returned report for callers who want
    // them (telemetry, tests, etc.).
    for (const issue of report.issues.slice(0, 6)) {
        // eslint-disable-next-line no-console
        console.warn(`  • [${issue.kind}] ${issue.where}: "${issue.snippet}"`);
    }
    if (report.issues.length > 6) {
        // eslint-disable-next-line no-console
        console.warn(`  …and ${report.issues.length - 6} more (see returned report)`);
    }
    return report;
}
