// services/cvNumberFidelity.ts
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
const UNIT_SUFFIXES = '%|x|times|m|million|k|thousand|bn|billion|M|K';
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
    let out = text;
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
    // Drop stranded prepositions left at the end ("…driving a increase in").
    out = out.replace(
        /\b(by|of|to|with|at|from|for|in|on|across|reaching|approximately|around|about|roughly|nearly|almost|over|under|above|below|up\s+to)\s*([.,;:!?]|$)/gi,
        '$2',
    );
    // Drop a preposition immediately followed by another preposition or the
    // word "and"/"or" — common after a number is stripped from between them
    // ("by 30% from Dec 2023" → "by from Dec 2023" → "from Dec 2023").
    // Run twice to handle "by of from" type chains.
    const PREP_CHAIN_RX = /\b(by|of|to|with|at|for|over|under|above|below|across|reaching|achieving|approximately|around|about|roughly|nearly|almost)\s+(?=(?:by|of|to|with|at|from|for|in|on|over|under|above|below|across|and|or)\b)/gi;
    out = out.replace(PREP_CHAIN_RX, '');
    out = out.replace(PREP_CHAIN_RX, '');
    // "a "/"an "/"the " followed immediately by another article or a
    // preposition is also a strip-orphan ("achieved a increase").
    out = out.replace(/\b(a|an|the)\s+(?=(?:by|of|to|with|at|from|for|in|on|and|or|a|an|the)\b)/gi, '');
    // Collapse ", ," / " , " / multi-spaces / space-before-punct.
    out = out.replace(/\s*,\s*,/g, ',');
    out = out.replace(/\s+([,.;:!?])/g, '$1');
    out = out.replace(/\(\s*\)/g, '');
    out = out.replace(/\s{2,}/g, ' ').trim();
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
