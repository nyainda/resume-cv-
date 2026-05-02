// services/cvVoiceFidelity.ts
//
// Voice-fidelity helpers used by services/geminiService.ts.
//
// Two recurring problems the LLM produces, even with strong prompt
// instructions, that the deterministic post-processor must fix:
//
// 1. First-person pronouns leak into the professional summary and
//    bullets. CVs/resumes are conventionally written without "I", "I've",
//    "my", "we", or "our". Example from a real generation:
//      "I've combined data analysis, site surveying, and project management
//       to help farmers adopt precision agriculture systems."
//    → "Combined data analysis, site surveying, and project management to
//       help farmers adopt precision agriculture systems."
//
// 2. Tense drift in the current role. The convention is to use the base
//    form ("Manage", "Lead", "Deliver") for the active role and past tense
//    ("Led", "Built", "Designed") for past roles. The LLM frequently
//    mixes the first bullet ("Manage 15+ projects") with third-person
//    singular present ("Generates KES 10M…", "Delivers tailored designs…",
//    "Maintains a 98% satisfaction rate…") within the same role. This
//    reads like a job description written about the candidate, not a
//    bullet written by the candidate.
//
// Pure regex + lookup table. Idempotent. Never throws.

// ── First-person pronoun stripping ─────────────────────────────────────

/**
 * Remove first-person pronouns from a free-text block (summary, project
 * description, etc.) and rewrite the immediately-affected sentence so it
 * reads naturally without the subject. Conservative: only rewrites the
 * leading clause of each sentence, never replaces "my X" with "their X"
 * because that almost always sounds wrong out of context.
 */
export function stripFirstPersonPronouns(text: string): string {
    if (!text) return '';
    let out = text;

    // "I've combined …" / "I have combined …" / "I'm combining …" /
    // "I am combining …" → "Combined …" / "Combining …"
    // We capture the next verb and capitalise it when it lands at sentence
    // start.
    out = out.replace(
        /(^|[.!?]\s+|—\s+)I(?:'ve| have|'m| am)\s+(\w+)/g,
        (_match, lead, verb) => `${lead}${verb.charAt(0).toUpperCase()}${verb.slice(1)}`,
    );
    // Mid-sentence "I've" / "I have" / etc. — drop the pronoun, keep the verb.
    out = out.replace(/\bI(?:'ve| have|'m| am)\s+/g, '');
    // Standalone "I" (with surrounding spaces).
    out = out.replace(/\bI\s+/g, '');
    // Possessive "my" — rewrite to "the" when followed by a noun phrase.
    // This is the safest neutralisation; "their" reads strangely out of
    // first-person context. Skip "my own" → "" (rare but cleaner).
    out = out.replace(/\bmy own\s+/gi, '');
    out = out.replace(/\bmy\s+/gi, 'the ');
    // "we" / "our" / "us" — strip when leading a clause, otherwise drop.
    out = out.replace(/(^|[.!?]\s+|—\s+)(?:we|our|us)\s+(\w+)/gi,
        (_match, lead, verb) => `${lead}${verb.charAt(0).toUpperCase()}${verb.slice(1)}`,
    );
    out = out.replace(/\b(?:we|our|us)\s+/gi, '');

    // Tidy whitespace and capitalise the very first character.
    out = out.replace(/\s{2,}/g, ' ').trim();
    if (out.length > 0) {
        out = out.charAt(0).toUpperCase() + out.slice(1);
    }
    return out;
}

// ── Tense normalisation for the current role ───────────────────────────

// Allow-list of common third-person singular present-tense verbs that
// should be base-form imperative when leading a CV bullet. Keys are
// lowercase; values are the base form preserving British/American
// spelling that matches the input. The map is intentionally small and
// hand-curated — better to under-fix than to convert a noun ("Engineers
// solutions") into something wrong.
const TPS_TO_BASE: Record<string, string> = {
    generates: 'Generate',
    delivers: 'Deliver',
    maintains: 'Maintain',
    improves: 'Improve',
    reduces: 'Reduce',
    coordinates: 'Coordinate',
    leads: 'Lead',
    drives: 'Drive',
    manages: 'Manage',
    builds: 'Build',
    designs: 'Design',
    develops: 'Develop',
    implements: 'Implement',
    provides: 'Provide',
    supports: 'Support',
    creates: 'Create',
    optimizes: 'Optimize',
    optimises: 'Optimise',
    analyzes: 'Analyze',
    analyses: 'Analyse',
    collaborates: 'Collaborate',
    trains: 'Train',
    conducts: 'Conduct',
    oversees: 'Oversee',
    streamlines: 'Streamline',
    executes: 'Execute',
    launches: 'Launch',
    handles: 'Handle',
    monitors: 'Monitor',
    evaluates: 'Evaluate',
    performs: 'Perform',
    presents: 'Present',
    writes: 'Write',
    edits: 'Edit',
    tests: 'Test',
    deploys: 'Deploy',
    resolves: 'Resolve',
    mentors: 'Mentor',
    advises: 'Advise',
    achieves: 'Achieve',
    reviews: 'Review',
    tracks: 'Track',
    reports: 'Report',
    identifies: 'Identify',
    communicates: 'Communicate',
    assists: 'Assist',
    facilitates: 'Facilitate',
    negotiates: 'Negotiate',
    forecasts: 'Forecast',
    plans: 'Plan',
    organizes: 'Organize',
    organises: 'Organise',
    spearheads: 'Spearhead',
    champions: 'Champion',
    architects: 'Architect',
    automates: 'Automate',
};

const TPS_KEYS = new Set(Object.keys(TPS_TO_BASE));

/**
 * Normalise the leading verb of a single CV bullet from third-person
 * singular present ("Generates", "Delivers") to base-form imperative
 * ("Generate", "Deliver"), but only when the verb is in our allow-list
 * AND the bullet looks like a normal action statement.
 */
export function normalizePresentTenseToImperative(bullet: string): string {
    if (!bullet) return bullet;
    // Strip a leading bullet glyph for the lookup, but preserve it on output.
    const leadingGlyphMatch = bullet.match(/^(\s*[•\-*·»"']?\s*)/);
    const leading = leadingGlyphMatch ? leadingGlyphMatch[0] : '';
    const rest = bullet.slice(leading.length);
    const wordMatch = rest.match(/^(\w+)(\b)/);
    if (!wordMatch) return bullet;
    const firstWord = wordMatch[1];
    const lower = firstWord.toLowerCase();
    if (!TPS_KEYS.has(lower)) return bullet;
    const base = TPS_TO_BASE[lower];
    return leading + base + rest.slice(firstWord.length);
}

/**
 * Apply tense normalisation to an array of bullets — used when callers
 * want to fix the entire current role at once.
 */
export function normalizeBulletsToImperative(bullets: string[]): string[] {
    return (bullets || []).map(b => normalizePresentTenseToImperative(String(b || '')));
}

// ── Audit probes (consumed by services/cvNumberFidelity::auditCvQuality) ──

export type CvVoiceIssueKind =
    | 'first_person_pronoun'
    | 'tense_third_person_singular';

export interface CvVoiceIssue {
    kind: CvVoiceIssueKind;
    where: string;
    snippet: string;
}

const FIRST_PERSON_RX = /\b(?:I|I'm|I've|I'd|I'll|my|me|myself|we|our|ours|us|ourselves)\b/;

/** Returns true if the text contains a first-person pronoun. */
export function hasFirstPerson(text: string): boolean {
    return !!text && FIRST_PERSON_RX.test(text);
}

/** Returns true if the bullet starts with a third-person singular verb in our allow-list. */
export function startsWithThirdPersonSingularVerb(bullet: string): boolean {
    if (!bullet) return false;
    const trimmed = bullet.replace(/^[\s•\-*·»"']+/, '');
    const m = trimmed.match(/^(\w+)\b/);
    if (!m) return false;
    return TPS_KEYS.has(m[1].toLowerCase());
}

function snippetAround(text: string, idx: number, span = 40): string {
    const start = Math.max(0, idx - span);
    const end = Math.min(text.length, idx + span);
    return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

interface CvLikeForVoiceAudit {
    summary?: string;
    experience?: Array<{
        jobTitle?: string;
        company?: string;
        endDate?: string;
        responsibilities?: string[];
    }>;
}

/**
 * Detect voice issues across the CV. Pure regex / lookup. Returns an
 * array compatible with the shape used by auditCvQuality so the two
 * audits can be merged into a single report.
 */
export function auditCvVoice(cv: CvLikeForVoiceAudit): CvVoiceIssue[] {
    const issues: CvVoiceIssue[] = [];
    if (typeof cv.summary === 'string' && cv.summary) {
        const m = FIRST_PERSON_RX.exec(cv.summary);
        if (m) {
            issues.push({
                kind: 'first_person_pronoun',
                where: 'summary',
                snippet: snippetAround(cv.summary, m.index ?? 0),
            });
        }
    }
    const experience = cv.experience || [];
    for (let i = 0; i < experience.length; i++) {
        const role = experience[i] || {};
        const isCurrent = isCurrentRole(role.endDate);
        const label = `experience[${i}] ${role.jobTitle || '?'} @ ${role.company || '?'}`;
        const bullets = Array.isArray(role.responsibilities) ? role.responsibilities : [];
        for (let j = 0; j < bullets.length; j++) {
            const b = String(bullets[j] || '');
            if (!b) continue;
            const where = `${label}#${j}`;
            const fp = FIRST_PERSON_RX.exec(b);
            if (fp) {
                issues.push({
                    kind: 'first_person_pronoun',
                    where,
                    snippet: snippetAround(b, fp.index ?? 0),
                });
            }
            // Third-person singular present in the current role only —
            // past roles legitimately use past tense, not imperative.
            if (isCurrent && startsWithThirdPersonSingularVerb(b)) {
                issues.push({
                    kind: 'tense_third_person_singular',
                    where,
                    snippet: b.slice(0, 80),
                });
            }
        }
    }
    return issues;
}

function isCurrentRole(endDate?: string): boolean {
    if (!endDate) return true;
    const v = String(endDate).trim().toLowerCase();
    if (!v) return true;
    return v === 'present' || v === 'current' || v === 'now' || v === 'ongoing';
}
