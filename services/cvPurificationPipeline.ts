/**
 * cvPurificationPipeline.ts — the "Hot Fire" pipeline.
 *
 * Single source of truth for every post-generation safety pass. Every CV that
 * leaves any AI generation path (initial generate, regenerate, optimize,
 * improve, GitHub-mode, summary enhance, responsibility rewrite) MUST flow
 * through `purifyCV()` before being returned to the user.
 *
 * Also provides `cleanImportedText()` — a deterministic forbidden-word
 * substitution pass that runs BEFORE uploaded CV text is parsed into the
 * profile, so toxic phrases never enter the source data in the first place.
 *
 * Pure JavaScript. Zero AI cost. Cannot fail.
 */

import { CVData, UserProfile } from '../types';
import { getCachedBannedPhrases, type BannedEntry } from './cvEngineClient';

// ────────────────────────────────────────────────────────────────────────────
// 1. FORBIDDEN-WORD SUBSTITUTIONS — applied to imported CV text BEFORE parsing,
//    and to any free-text field after generation. Replacement-based (not just
//    deletion) so the sentence stays grammatical.
// ────────────────────────────────────────────────────────────────────────────
const SUBSTITUTIONS: Array<[RegExp, string]> = [
    [/\bleveraging\b/gi,                 'using'],
    [/\bleveraged\b/gi,                  'used'],
    [/\bleverage\b/gi,                   'use'],
    [/\bspearheaded\b/gi,                'led'],
    [/\bspearhead\b/gi,                  'lead'],
    [/\butilized\b/gi,                   'used'],
    [/\butilised\b/gi,                   'used'],
    [/\butilize\b/gi,                    'use'],
    [/\butilise\b/gi,                    'use'],
    [/\bfacilitated\b/gi,                'enabled'],
    [/\bfacilitate\b/gi,                 'enable'],
    [/\bsynergy\b/gi,                    'collaboration'],
    [/\bsynergies\b/gi,                  'collaboration'],
    [/\binnovative solutions?\b/gi,      'practical solutions'],
    [/\bbest practices?\b/gi,            'proven methods'],
    [/\bknowledge sharing\b/gi,          'documentation'],
    [/\bstaying up[- ]to[- ]date\b/gi,   'keeping current'],
    [/\bdrive meaningful change\b/gi,    'improve outcomes'],
    [/\bpassion for\b/gi,                'focus on'],
    [/\bresults[- ]driven\b/gi,          'delivery-focused'],
    [/\bdetail[- ]oriented\b/gi,         'thorough'],
    [/\bgo[- ]getter\b/gi,               'self-starter'],
    // POS-preserving: noun → noun. Earlier mapping to "collaborative" (an
    // adjective) produced ungrammatical output like "I am a collaborative" when
    // the preceding article wasn't stripped.
    [/\bteam player\b/gi,                'collaborator'],
    // "dynamic" — just delete (rarely adds meaning)
    [/\bdynamic\s+/gi,                   ''],
    // "end-to-end" — borderline buzzword that user-flagged after seeing it
    // overused in real generations ("end-to-end project", "end-to-end system",
    // "end-to-end pipeline"). Drop the modifier and let the noun stand alone —
    // safer than substituting a synonym that might not fit every context.
    [/\bend[- ]to[- ]end\s+/gi,          ''],
    // ", ensuring <participle phrase>" — the most over-used filler the user
    // reported (11 hits in a single CV). It's almost always tautological
    // ("ensuring timely completion", "ensuring effective communication",
    // "ensuring long-term partnerships"). We strip from the comma through the
    // next sentence-boundary punctuation. Conservative: only when prefixed by
    // a comma so we don't mangle a sentence that genuinely starts with
    // "Ensuring X happens before Y…". Substitution diff log records it as
    // "ensuring … → (removed)" so telemetry tracks the leak.
    [/,\s*ensuring\s+[^.;:!?]+/gi,       ''],
];

/**
 * Removes consecutive duplicate words like "documentation and documentation"
 * → "documentation". The substitution pass above turns phrases such as
 * "knowledge sharing" into "documentation", which can collide with a
 * neighbouring word and create accidental repetition. This guard runs after
 * substitutions to clean those up. Idempotent.
 *
 * Examples:
 *   "documentation and documentation" → "documentation"
 *   "the the team"                    → "the team"
 *   "use use cases"                   → "use cases"
 */
export function removeDuplicateWords(input: string): string {
    if (!input || typeof input !== 'string') return input || '';
    let out = input;
    let prev: string;
    // Run until stable — collapsing one pair can expose another (e.g. "a a a").
    do {
        prev = out;
        // Adjacent duplicates: "word word" → "word" (case-insensitive).
        out = out.replace(/\b(\w+)\s+\1\b/gi, '$1');
        // Duplicates separated by a single short connector ("and", "or", ",", "&").
        out = out.replace(/\b(\w+)\s+(?:and|or|&|,)\s+\1\b/gi, '$1');
    } while (out !== prev);
    return out;
}

/**
 * Deterministic regex pass over raw text. Idempotent and safe to run multiple
 * times. Returns both the cleaned text and a list of substitutions made (so
 * callers can show a diff to the user if they want).
 */
export function cleanImportedText(input: string): { cleaned: string; changes: string[] } {
    if (!input || typeof input !== 'string') return { cleaned: input || '', changes: [] };
    let out = input;
    const changes: string[] = [];
    for (const [pattern, replacement] of SUBSTITUTIONS) {
        const matches = out.match(pattern);
        if (matches && matches.length) {
            const sample = matches[0];
            changes.push(`${sample.toLowerCase()} → ${replacement || '(removed)'}`);
            out = out.replace(pattern, replacement);
        }
    }
    // Collapse double spaces and orphaned spaces created by deletions.
    out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1');
    // Final guard: substitutions can cause adjacent duplicate words. Strip them.
    const before = out;
    out = removeDuplicateWords(out);
    if (out !== before) changes.push('removed duplicate adjacent words');
    return { cleaned: out, changes };
}

/**
 * Remote-augmented cleaner. Runs the local deterministic pass first (always
 * safe, never fails), then layers any additional banned phrases pulled from
 * the cv-engine-worker (KV-backed) on top. If the worker is unavailable, the
 * result is identical to `cleanImportedText` — the local list remains the
 * fallback source of truth.
 */
function escapeRegexLiteral(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const LOCAL_BANNED_KEYS = new Set<string>(
    SUBSTITUTIONS.map(([re]) => re.source.toLowerCase())
);

export async function cleanImportedTextRemote(input: string): Promise<{ cleaned: string; changes: string[] }> {
    const local = cleanImportedText(input);
    let out = local.cleaned;
    const changes = [...local.changes];

    let remote: BannedEntry[] | null = null;
    try { remote = await getCachedBannedPhrases(); } catch { remote = null; }
    if (!remote || remote.length === 0) return { cleaned: out, changes };

    for (const { phrase, replacement } of remote) {
        if (!phrase) continue;
        const literal = phrase.toLowerCase();
        // Skip phrases the local list already handles to avoid duplicate change entries.
        if (LOCAL_BANNED_KEYS.has(`\\b${escapeRegexLiteral(literal)}\\b`)) continue;
        const re = new RegExp(`\\b${escapeRegexLiteral(phrase)}\\b`, 'gi');
        if (!re.test(out)) continue;
        const repl = replacement ?? '';
        changes.push(`${literal} → ${repl || '(removed)'}`);
        out = out.replace(re, repl);
    }

    // Collapse whitespace artefacts from any deletions and de-dupe again.
    out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1');
    const before = out;
    out = removeDuplicateWords(out);
    if (out !== before && !changes.includes('removed duplicate adjacent words')) {
        changes.push('removed duplicate adjacent words');
    }
    return { cleaned: out, changes };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. PHRASE-REPETITION DETECTOR — flags any 4+ word phrase that appears 2+
//    times across the entire CV text. These are the "AI comfort phrases" that
//    a banned-word list can't catch because each instance differs slightly.
// ────────────────────────────────────────────────────────────────────────────
function gatherCVText(cv: CVData): string {
    const parts: string[] = [];
    if (cv.summary) parts.push(cv.summary);
    (cv.experience || []).forEach(e => (e.responsibilities || []).forEach(b => parts.push(b)));
    (cv.education || []).forEach(e => e.description && parts.push(e.description));
    (cv.projects || []).forEach(p => p.description && parts.push(p.description));
    return parts.join(' \n ');
}

/**
 * Returns repeated phrases of 4–7 words that occur 2+ times. Stop-word filtered
 * so "and the team and" doesn't trigger. Used both for logging and to drive
 * targeted regeneration when integration grows.
 */
export function detectPhraseRepetition(cv: CVData): Array<{ phrase: string; count: number }> {
    const text = gatherCVText(cv).toLowerCase().replace(/[^\w\s]/g, ' ');
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 8) return [];

    const STOPWORDS = new Set(['the', 'and', 'a', 'an', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'is', 'was', 'as', 'or', 'this', 'that', 'it', 'be']);
    const counts = new Map<string, number>();

    for (let n = 4; n <= 7; n++) {
        for (let i = 0; i + n <= words.length; i++) {
            const window = words.slice(i, i + n);
            // Skip windows that are mostly stopwords — they're not "AI tells".
            const contentWords = window.filter(w => !STOPWORDS.has(w)).length;
            if (contentWords < Math.ceil(n * 0.6)) continue;
            const phrase = window.join(' ');
            counts.set(phrase, (counts.get(phrase) || 0) + 1);
        }
    }

    const repeated: Array<{ phrase: string; count: number }> = [];
    for (const [phrase, count] of Array.from(counts.entries())) {
        if (count >= 2) repeated.push({ phrase, count });
    }
    // Keep only the longest superset when phrases overlap (e.g., prefer the
    // 6-word repeat over the embedded 4-word repeat).
    repeated.sort((a, b) => b.phrase.length - a.phrase.length);
    const kept: Array<{ phrase: string; count: number }> = [];
    for (const r of repeated) {
        if (!kept.some(k => k.phrase.includes(r.phrase))) kept.push(r);
    }
    return kept.slice(0, 10);
}

// ────────────────────────────────────────────────────────────────────────────
// 3. ROUND-NUMBER SATURATION CHECK — warns when >60% of metrics are round.
//    Real human CVs mix specific numbers (47%, 7.5h/wk) with round ones.
// ────────────────────────────────────────────────────────────────────────────
export function detectRoundNumberSaturation(cv: CVData): { ratio: number; flagged: boolean } {
    const text = gatherCVText(cv);
    const numbers = text.match(/\b\d+(?:\.\d+)?\s?%?/g) || [];
    if (numbers.length < 4) return { ratio: 0, flagged: false };
    const round = numbers.filter(n => {
        const v = parseFloat(n);
        if (isNaN(v)) return false;
        return v % 5 === 0 || v % 10 === 0;
    }).length;
    const ratio = round / numbers.length;
    return { ratio, flagged: ratio > 0.6 };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. TENSE-CONSISTENCY GUARD — current roles should use present tense, past
//    roles past tense. Detects AND fixes mixed tense within a single role.
// ────────────────────────────────────────────────────────────────────────────
const PRESENT_VERB_HINTS = /\b(manage|lead|build|develop|design|own|run|deliver|drive|create|maintain|coordinate|support)s?\b/i;
const PAST_VERB_HINTS    = /\b(managed|led|built|developed|designed|owned|ran|delivered|drove|created|maintained|coordinated|supported|launched|shipped|reduced|grew|cut)\b/i;

/**
 * Verb tense map. Each entry is [present-3rd-person, past]. Used by the tense
 * enforcer to flip the LEADING verb of a bullet when it disagrees with the
 * role's employment status. Only the bullet's first verb is flipped — that is
 * what ATS parsers and recruiters use to detect employment status.
 *
 * Conjugation rule used in mapping:
 *   - Current role  → present-3rd-person ("Manages", "Leads")
 *   - Past role     → simple past         ("Managed", "Led")
 */
const VERB_TENSE_MAP: Array<{ present: string; past: string }> = [
    // Regular -ed verbs
    { present: 'Manages',       past: 'Managed' },
    { present: 'Develops',      past: 'Developed' },
    { present: 'Designs',       past: 'Designed' },
    { present: 'Delivers',      past: 'Delivered' },
    { present: 'Maintains',     past: 'Maintained' },
    { present: 'Coordinates',   past: 'Coordinated' },
    { present: 'Supports',      past: 'Supported' },
    { present: 'Launches',      past: 'Launched' },
    { present: 'Implements',    past: 'Implemented' },
    { present: 'Owns',          past: 'Owned' },
    { present: 'Creates',       past: 'Created' },
    { present: 'Drives',        past: 'Drove' },
    { present: 'Improves',      past: 'Improved' },
    { present: 'Optimises',     past: 'Optimised' },
    { present: 'Optimizes',     past: 'Optimized' },
    { present: 'Mentors',       past: 'Mentored' },
    { present: 'Trains',        past: 'Trained' },
    { present: 'Negotiates',    past: 'Negotiated' },
    { present: 'Oversees',      past: 'Oversaw' },
    { present: 'Reports',       past: 'Reported' },
    { present: 'Prepares',      past: 'Prepared' },
    { present: 'Reviews',       past: 'Reviewed' },
    { present: 'Analyses',      past: 'Analysed' },
    { present: 'Analyzes',      past: 'Analyzed' },
    { present: 'Collaborates',  past: 'Collaborated' },
    { present: 'Achieves',      past: 'Achieved' },
    { present: 'Increases',     past: 'Increased' },
    { present: 'Reduces',       past: 'Reduced' },
    { present: 'Grows',         past: 'Grew' },
    { present: 'Cuts',          past: 'Cut' },
    { present: 'Builds',        past: 'Built' },
    { present: 'Leads',         past: 'Led' },
    { present: 'Runs',          past: 'Ran' },
    { present: 'Ships',         past: 'Shipped' },
    { present: 'Plans',         past: 'Planned' },
    { present: 'Executes',      past: 'Executed' },
    { present: 'Drafts',        past: 'Drafted' },
    { present: 'Researches',    past: 'Researched' },
    { present: 'Tests',         past: 'Tested' },
    { present: 'Documents',     past: 'Documented' },
    { present: 'Presents',      past: 'Presented' },
    { present: 'Streamlines',   past: 'Streamlined' },
    { present: 'Saves',         past: 'Saved' },
    { present: 'Generates',     past: 'Generated' },
    { present: 'Tracks',        past: 'Tracked' },
    { present: 'Monitors',      past: 'Monitored' },
    { present: 'Identifies',    past: 'Identified' },
    { present: 'Resolves',      past: 'Resolved' },
    { present: 'Handles',       past: 'Handled' },
    { present: 'Processes',     past: 'Processed' },
    { present: 'Audits',        past: 'Audited' },
    { present: 'Establishes',   past: 'Established' },
    { present: 'Spearheads',    past: 'Spearheaded' },
    { present: 'Leverages',     past: 'Leveraged' },
    { present: 'Architects',    past: 'Architected' },
    { present: 'Refactors',     past: 'Refactored' },
    { present: 'Migrates',      past: 'Migrated' },
    { present: 'Automates',     past: 'Automated' },
    { present: 'Authors',       past: 'Authored' },
    { present: 'Publishes',     past: 'Published' },
    // Verbs added in response to user-reported tense leaks in current roles.
    { present: 'Conducts',      past: 'Conducted' },
    { present: 'Performs',      past: 'Performed' },
    { present: 'Calculates',    past: 'Calculated' },
    { present: 'Compiles',      past: 'Compiled' },
    { present: 'Communicates',  past: 'Communicated' },
    { present: 'Configures',    past: 'Configured' },
    { present: 'Deploys',       past: 'Deployed' },
    { present: 'Engineers',     past: 'Engineered' },
    { present: 'Facilitates',   past: 'Facilitated' },
    { present: 'Forecasts',     past: 'Forecast' },
    { present: 'Initiates',     past: 'Initiated' },
    { present: 'Integrates',    past: 'Integrated' },
    { present: 'Investigates',  past: 'Investigated' },
    { present: 'Orchestrates',  past: 'Orchestrated' },
    { present: 'Partners',      past: 'Partnered' },
    { present: 'Pilots',        past: 'Piloted' },
    { present: 'Produces',      past: 'Produced' },
    { present: 'Programs',      past: 'Programmed' },
    { present: 'Promotes',      past: 'Promoted' },
    { present: 'Recommends',    past: 'Recommended' },
    { present: 'Scales',        past: 'Scaled' },
    { present: 'Schedules',     past: 'Scheduled' },
    { present: 'Secures',       past: 'Secured' },
    { present: 'Solves',        past: 'Solved' },
    { present: 'Standardises',  past: 'Standardised' },
    { present: 'Standardizes',  past: 'Standardized' },
    { present: 'Supervises',    past: 'Supervised' },
    { present: 'Translates',    past: 'Translated' },
    { present: 'Updates',       past: 'Updated' },
    { present: 'Validates',     past: 'Validated' },
    { present: 'Writes',        past: 'Wrote' },
    { present: 'Speaks',        past: 'Spoke' },
    { present: 'Teaches',       past: 'Taught' },
    { present: 'Brings',        past: 'Brought' },
    { present: 'Sells',         past: 'Sold' },
    { present: 'Serves',        past: 'Served' },
    { present: 'Sets',          past: 'Set' },
    { present: 'Holds',         past: 'Held' },
    { present: 'Wins',          past: 'Won' },
    { present: 'Sees',          past: 'Saw' },
    { present: 'Makes',         past: 'Made' },
    { present: 'Takes',         past: 'Took' },
    { present: 'Gives',         past: 'Gave' },
    { present: 'Hires',         past: 'Hired' },
    { present: 'Fires',         past: 'Fired' },
    { present: 'Closes',        past: 'Closed' },
    { present: 'Opens',         past: 'Opened' },
];

function isCurrentRole(role: { endDate?: string }): boolean {
    const ed = String(role.endDate || '').trim();
    if (!ed) return true;
    return /present|current|ongoing/i.test(ed);
}

/**
 * Returns the alternative present-tense form (bare infinitive) for a 3rd-person
 * singular verb. "Leads" → "lead", "Watches" → "watch", "Studies" → "study".
 * Used so the tense detector recognises bullets that start with the bare verb
 * ("Lead a team of 5…") even though VERB_TENSE_MAP stores 3rd-person form.
 *
 * Conjugation rules (English present-tense suffix stripping, in order):
 *   "ies" → "y"        ("studies" → "study")
 *   "ches/shes/sses/xes/zes/oes" → strip last 2  ("watches" → "watch")
 *   trailing "s" (not "ss") → strip last 1       ("leads" → "lead")
 * Returns null when the input doesn't have a recognisable 3rd-person ending.
 */
function bareInfinitiveOf(thirdPersonForm: string): string | null {
    const lower = thirdPersonForm.toLowerCase();
    if (lower.endsWith('ies') && lower.length > 3) return lower.slice(0, -3) + 'y';
    if (/(ches|shes|sses|xes|zes|oes)$/.test(lower)) return lower.slice(0, -2);
    if (lower.endsWith('s') && !lower.endsWith('ss')) return lower.slice(0, -1);
    return null;
}

/**
 * Returns true when `word` (lowercase) is recognisable as the present-tense
 * form of the verb pair — accepts BOTH the 3rd-person singular ("Leads") and
 * the bare infinitive ("Lead"). The latter handles bullets that omit the
 * 3rd-person suffix, e.g. "Lead a team of 5…" in a past role that should flip
 * to "Led".
 */
function isPresentForm(word: string, pair: { present: string }): boolean {
    const lower = word.toLowerCase();
    if (lower === pair.present.toLowerCase()) return true;
    const bare = bareInfinitiveOf(pair.present);
    return bare !== null && lower === bare;
}

/**
 * Rewrites the LEADING verb of a bullet to match the target tense if it is
 * currently in the wrong tense. Returns { text, changed }.
 *
 * Heuristic: the bullet's first word (after any leading bullet glyph or quote)
 * is the action verb. We compare it against VERB_TENSE_MAP and flip when
 * needed. Bullets that don't start with a recognised verb are left untouched.
 *
 * The present-form check accepts both 3rd-person ("Leads") and bare infinitive
 * ("Lead") so a past-role bullet starting with "Lead a team…" gets flipped to
 * "Led" — previously the bare form silently slipped through.
 */
function flipLeadingVerb(bullet: string, target: 'present' | 'past'): { text: string; changed: boolean } {
    if (!bullet || typeof bullet !== 'string') return { text: bullet || '', changed: false };
    // Match optional leading punctuation/whitespace, then the first word.
    const m = bullet.match(/^(\s*[-•·*»"']?\s*)([A-Za-z]+)(\b)/);
    if (!m) return { text: bullet, changed: false };
    const [, prefix, firstWord, boundary] = m;
    const lower = firstWord.toLowerCase();

    for (const pair of VERB_TENSE_MAP) {
        const presLower = pair.present.toLowerCase();
        const pastLower = pair.past.toLowerCase();
        if (target === 'present' && lower === pastLower && lower !== presLower) {
            const replacement = matchCase(firstWord, pair.present);
            return { text: prefix + replacement + boundary + bullet.slice(m[0].length), changed: true };
        }
        if (target === 'past' && isPresentForm(firstWord, pair) && lower !== pastLower) {
            const replacement = matchCase(firstWord, pair.past);
            return { text: prefix + replacement + boundary + bullet.slice(m[0].length), changed: true };
        }
    }
    return { text: bullet, changed: false };
}

/**
 * Returns true when `bullet`'s leading verb is already in the target tense.
 * Used to gate `flipMidBulletVerb` — we only flip the second verb in a
 * conjunction once the first verb is correct, so we never produce mixed-tense
 * Frankenstein bullets like "Architected and ships X" (past + 3rd-person).
 */
function leadingVerbInTargetTense(bullet: string, target: 'present' | 'past'): boolean {
    const m = bullet.match(/^(\s*[-•·*»"']?\s*)([A-Za-z]+)(\b)/);
    if (!m) return false;
    const word = m[2].toLowerCase();
    for (const pair of VERB_TENSE_MAP) {
        if (target === 'present' && isPresentForm(word, pair)) return true;
        if (target === 'past' && word === pair.past.toLowerCase()) return true;
    }
    return false;
}

/** Preserves the original word's case envelope (UPPER, Title, lower). */
function matchCase(original: string, replacement: string): string {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement.toLowerCase();
}

/**
 * Flips a SINGLE mid-bullet verb when it is a "Verb1 and Verb2" / "Verb1, Verb2"
 * conjunction whose two verbs disagree in tense ("Develops and implemented X").
 *
 * Heuristic: locate any pattern `(verb_a) (and|,) (verb_b)` where verb_b is in
 * the opposite tense to the role's target. We rewrite verb_b only — verb_a is
 * already covered by `flipLeadingVerb`. We don't try to be clever about
 * three-verb chains; the most common AI failure is a two-verb conjunction.
 */
function flipMidBulletVerb(bullet: string, target: 'present' | 'past'): { text: string; changed: boolean } {
    if (!bullet) return { text: bullet || '', changed: false };
    let out = bullet;
    let changed = false;
    for (const pair of VERB_TENSE_MAP) {
        const wrong = (target === 'present' ? pair.past : pair.present).toLowerCase();
        const right = target === 'present' ? pair.present : pair.past;
        // Match "and|, " then the wrongly-tensed verb as a standalone word.
        const re = new RegExp(`\\b(and|,)\\s+(${wrong})\\b`, 'gi');
        if (re.test(out)) {
            out = out.replace(re, (_m, conj, w) => `${conj} ${matchCase(w, right)}`);
            changed = true;
        }
    }
    return { text: out, changed };
}

/**
 * Enforces verb-tense consistency across every role. Mutates a copy of cv.experience.
 * Returns the new CV plus a list of human-readable change descriptions.
 *
 * Two passes per bullet:
 *   1. Leading verb (`flipLeadingVerb`) — handles "Conducted X" in a current role.
 *   2. Mid-bullet conjunction (`flipMidBulletVerb`) — handles
 *      "Develops and implemented X" by flipping the second verb to match the
 *      first (which is already enforced to the role's target tense above).
 */
export function enforceTenseConsistency(cv: CVData): { cv: CVData; changes: string[] } {
    const changes: string[] = [];
    if (!cv || !cv.experience) return { cv, changes };
    const fixedExperience = cv.experience.map(role => {
        const target: 'present' | 'past' = isCurrentRole(role) ? 'present' : 'past';
        const newBullets = (role.responsibilities || []).map(b => {
            const lead = flipLeadingVerb(b, target);
            // Gate: only flip the mid-bullet verb if the LEADING verb is now in
            // the target tense. Otherwise we produce mixed-tense bullets like
            // "Architected and ships X" where the first verb is past and the
            // second is present — strictly worse than the original.
            const midSafe = leadingVerbInTargetTense(lead.text, target);
            const mid = midSafe ? flipMidBulletVerb(lead.text, target) : { text: lead.text, changed: false };
            const finalText = mid.text;
            if (lead.changed || mid.changed) {
                changes.push(`[${role.jobTitle} @ ${role.company}] ${lead.changed && mid.changed ? 'lead+mid' : lead.changed ? 'lead' : 'mid'} flipped to ${target}: "${b.slice(0, 50)}…"`);
            }
            return finalText;
        });
        return { ...role, responsibilities: newBullets };
    });
    return { cv: { ...cv, experience: fixedExperience }, changes };
}

function detectTenseMismatch(cv: CVData): string[] {
    const issues: string[] = [];
    (cv.experience || []).forEach(role => {
        const isCurrent = isCurrentRole(role);
        const bullets = role.responsibilities || [];
        for (const b of bullets) {
            // Strip "to <verb>" infinitives before tense checks. Without this,
            // a perfectly past-tense bullet like "Led a team to deliver projects"
            // matches PRESENT_VERB_HINTS on "deliver" and falsely flags as
            // mixed tense, creating noise in the warnings reported to the user.
            const cleaned = b.replace(/\bto\s+[A-Za-z]+\b/gi, '');
            const hasPresent = PRESENT_VERB_HINTS.test(cleaned);
            const hasPast    = PAST_VERB_HINTS.test(cleaned);
            if (hasPresent && hasPast) {
                issues.push(`Mixed tense in "${role.jobTitle} @ ${role.company}": "${b.slice(0, 60)}…"`);
            } else if (isCurrent && hasPast && !hasPresent) {
                issues.push(`Current role "${role.jobTitle}" uses past tense bullet — should be present.`);
                break; // one warning per role
            } else if (!isCurrent && hasPresent && !hasPast) {
                issues.push(`Past role "${role.jobTitle}" uses present tense bullet — should be past.`);
                break;
            }
        }
    });
    return issues;
}

// ────────────────────────────────────────────────────────────────────────────
// 4a. ROUND-NUMBER JITTER — when >60% of metrics in the CV are round (multiples
//     of 5 or 10), real recruiters spot it instantly as AI output. We can't
//     invent truth, but we can apply a small, deterministic jitter (±1–3 pts
//     for percentages, ±2–4% for raw counts) so the metrics read as estimated
//     rather than fabricated round numbers. Only fires when saturation > 0.6.
//
//     Deterministic: same input → same output. Driven by the index of the
//     metric in the CV, not a random seed, so output is reproducible.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-metric jitter offsets. Indexed mod length so different metrics in the
 * same CV get different offsets. Skews mostly negative — recruiters trust
 * conservative numbers more than inflated ones.
 */
const PERCENT_OFFSETS = [-3, +2, -1, +3, -2, +1, -4, +2, -1, +3, -2, +1];
const COUNT_PCT_DELTAS = [-0.04, +0.03, -0.02, +0.05, -0.03, +0.02, -0.05, +0.03];

function jitterText(text: string, idxRef: { i: number }): { text: string; changed: boolean } {
    if (!text) return { text, changed: false };
    let changed = false;
    // Percentages first — most common round-number culprit.
    let out = text.replace(/\b(\d+(?:\.\d+)?)\s?%/g, (full, num) => {
        const v = parseFloat(num);
        if (isNaN(v)) return full;
        // Only jitter ROUND percentages (multiple of 5 or 10) so we don't
        // disturb numbers the AI already specifically chose.
        if (!(v % 5 === 0 || v % 10 === 0)) return full;
        // Don't touch 100% / 0% — they're often factual.
        if (v <= 0 || v >= 100) return full;
        const offset = PERCENT_OFFSETS[idxRef.i++ % PERCENT_OFFSETS.length];
        let adjusted = v + offset;
        // Keep within [1, 99] and avoid landing on another round number.
        if (adjusted <= 0) adjusted = v - 1;
        if (adjusted >= 100) adjusted = v - 1;
        if (adjusted % 5 === 0) adjusted += offset > 0 ? 1 : -1;
        changed = true;
        return `${adjusted}%`;
    });
    // Round currency / counts >= 100 that end in two or more zeros — nudge by
    // a small percentage so "1,000" becomes "970" or "1,040".
    out = out.replace(/\b(\d{3,})\b/g, (full, numStr) => {
        const v = parseInt(numStr, 10);
        if (isNaN(v) || v < 100) return full;
        // Only jitter "very round" counts: trailing two-or-more zeros.
        if (v % 100 !== 0) return full;
        const delta = COUNT_PCT_DELTAS[idxRef.i++ % COUNT_PCT_DELTAS.length];
        let adjusted = Math.round(v * (1 + delta));
        // Avoid landing on an equally-round number.
        if (adjusted % 100 === 0) adjusted += (delta > 0 ? 7 : -7);
        if (adjusted % 10 === 0) adjusted += (delta > 0 ? 1 : -1);
        if (adjusted <= 0) return full;
        changed = true;
        return String(adjusted);
    });
    return { text: out, changed };
}

/**
 * Applies the jitter pass across summary, experience bullets, education and
 * project descriptions. Only fires when round-number saturation is detected,
 * so well-balanced CVs are left completely untouched.
 */
export function jitterRoundNumbers(cv: CVData): { cv: CVData; changes: string[] } {
    const changes: string[] = [];
    const idxRef = { i: 0 };
    const jit = (s: string) => {
        const { text, changed } = jitterText(s || '', idxRef);
        if (changed) changes.push(`jittered: "${(s || '').slice(0, 50)}…" → "${text.slice(0, 50)}…"`);
        return text;
    };
    const out: CVData = {
        ...cv,
        summary: jit(cv.summary || ''),
        experience: (cv.experience || []).map(e => ({
            ...e,
            responsibilities: (e.responsibilities || []).map(jit),
        })),
        education: (cv.education || []).map(e => ({ ...e, description: jit(e.description || '') })),
        projects: (cv.projects || []).map(p => ({ ...p, description: jit(p.description || '') })),
    };
    return { cv: out, changes };
}

// ────────────────────────────────────────────────────────────────────────────
// 4a-bis. CORRUPTED-METRIC GUARD — small fallback LLMs (Cloudflare Workers AI
//     free tier, etc.) sometimes obey "reduce the metric" instructions by
//     stripping the digits and leaving placeholder fragments behind, e.g.:
//         "Generated KES 8,000,000 in revenue"
//             → "Generate KES ,000 in revenue"
//         "exceeding monthly targets by 20%"
//             → "exceeding monthly targets by %"
//         "coordinating with a 12-person team"
//             → "coordinating with a -person team"
//     These are unambiguous corruption signatures (no legitimate CV bullet
//     ever produces them). When detected, we revert that single field to its
//     pre-validator value so the user keeps a real number rather than a gap.
// ────────────────────────────────────────────────────────────────────────────
const CORRUPTED_METRIC_PATTERNS: RegExp[] = [
    // Currency code or symbol followed by an orphan thousands group.
    // Matches: "KES ,000", "USD ,500,000", "$ ,000", "KSh ,200"
    /(?:[A-Z]{2,4}|KSh|Ksh|R|₦|₹|€|£|\$)\s+,\d{3}/,
    // Bare percent / per-cent with no leading number — preposition + space + %.
    // Matches: "by %", "of %", "to %", "at %", "over %", "around %"
    /\b(?:by|of|to|at|over|under|around|near|nearly|about|approximately)\s+%/i,
    // Article/qualifier + hyphen-prefixed unit ("a -person", "a -hour", "an -hour").
    /\b(?:a|an|the)\s+-(?:person|hour|day|week|month|year|member|seat|figure|fold|page|line|step|tier|level|point|degree|man|woman)\b/i,
    // Generic orphan thousands group surrounded by spaces (",000 in", " ,500 ").
    /\s,\d{3}(?:,\d{3})*(?=\s)/,
    // "increase of %" / "reduction of %" / "growth of %".
    /\b(?:increase|reduction|decrease|drop|rise|growth|gain|boost|cut|lift|uplift|improvement)\s+of\s+%/i,
    // Range/comparison left bare ("from to", "from %", "by up to %").
    /\bfrom\s+%|\bup\s+to\s+%|\bover\s+%|\bunder\s+%/i,
    // Hyphen-bounded missing number ("- person team", "- hour shift").
    /\s-\s+(?:person|hour|day|week|month|year|member)\b/i,
];

/** Returns true if the text contains an obvious "metric got stripped" signature. */
export function hasCorruptedMetric(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    return CORRUPTED_METRIC_PATTERNS.some(rx => rx.test(text));
}

/**
 * Walks through a CV that just came back from a fallback LLM (validator,
 * humanizer, etc.) and reverts any text field that exhibits corrupted-metric
 * signatures back to the pre-call original. Untouched fields are kept as-is so
 * legitimate fixes the LLM made survive.
 */
export function revertCorruptedMetrics(
    newCV: CVData,
    originalCV: CVData,
): { cv: CVData; reverted: string[] } {
    const reverted: string[] = [];

    const summary = hasCorruptedMetric(newCV.summary || '')
        && !hasCorruptedMetric(originalCV.summary || '')
        ? (reverted.push('summary'), originalCV.summary || '')
        : (newCV.summary || '');

    const experience = (newCV.experience || []).map((role, ri) => {
        const origRole = (originalCV.experience || [])[ri];
        if (!origRole) return role;
        const origBullets = origRole.responsibilities || [];
        const responsibilities = (role.responsibilities || []).map((b, bi) => {
            const orig = origBullets[bi];
            if (typeof orig === 'string' && hasCorruptedMetric(b) && !hasCorruptedMetric(orig)) {
                reverted.push(`${role.jobTitle} @ ${role.company} — bullet ${bi + 1}`);
                return orig;
            }
            return b;
        });
        return { ...role, responsibilities };
    });

    const projects = (newCV.projects || []).map((p, pi) => {
        const orig = (originalCV.projects || [])[pi];
        if (orig && hasCorruptedMetric(p.description || '') && !hasCorruptedMetric(orig.description || '')) {
            reverted.push(`project: ${p.name || `#${pi + 1}`}`);
            return { ...p, description: orig.description || '' };
        }
        return p;
    });

    const education = (newCV.education || []).map((e, ei) => {
        const orig = (originalCV.education || [])[ei];
        if (orig && hasCorruptedMetric(e.description || '') && !hasCorruptedMetric(orig.description || '')) {
            reverted.push(`education: ${e.degree || `#${ei + 1}`}`);
            return { ...e, description: orig.description || '' };
        }
        return e;
    });

    return { cv: { ...newCV, summary, experience, projects, education }, reverted };
}

// ────────────────────────────────────────────────────────────────────────────
// 4b. EDUCATION GUARD — if a degree has a real graduation year, the AI must
//     not describe it as "currently pursuing". Strips that phrase deterministi-
//     cally so a missed system-prompt instruction can't leak through.
// ────────────────────────────────────────────────────────────────────────────
const PURSUING_PATTERN = /\b(?:currently\s+pursuing|presently\s+pursuing|in\s+pursuit\s+of|now\s+pursuing|currently\s+studying|currently\s+enrolled\s+in)\b[^.,;]*[.,;]?\s*/gi;

/**
 * A graduation year is treated as "completed" when it parses to a 4-digit year
 * that is not in the future and the field doesn't contain hints like
 * "expected", "present", "in progress", "ongoing", "pursuing", "anticipated"
 * or "TBD". For ranges like "2018 – 2022" we look at the last year.
 */
export function isCompletedDegree(yearField: string | undefined): boolean {
    if (!yearField || typeof yearField !== 'string') return false;
    const lower = yearField.toLowerCase();
    if (/\b(expected|present|current|currently|ongoing|in\s+progress|pursuing|anticipated|tbd|to\s+be\s+determined)\b/.test(lower)) {
        return false;
    }
    const years = yearField.match(/\b(19|20|21)\d{2}\b/g);
    if (!years || years.length === 0) return false;
    const latest = parseInt(years[years.length - 1], 10);
    const thisYear = new Date().getFullYear();
    return latest <= thisYear;
}

/**
 * Removes "currently pursuing" phrases from an education description if the
 * degree has a real, past/present graduation year. Keeps the sentence tidy.
 */
export function stripPursuingForCompletedDegree(description: string, yearField: string | undefined): string {
    if (!description) return description || '';
    if (!isCompletedDegree(yearField)) return description;
    let out = description.replace(PURSUING_PATTERN, '');
    out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
    // Tidy leading/trailing punctuation left behind.
    out = out.replace(/^[\s,.;:]+/, '').replace(/[\s,;:]+$/, '');
    return out;
}

// ────────────────────────────────────────────────────────────────────────────
// 4c. PHASE-2 POLISH LAYER — the small-but-deadly fixes that distinguish a
//     "passable" AI CV from a "polished" one. Modelled on the auto-rules used
//     by Teal, Rezi, Resume.io, Enhancv and Kickresume:
//
//       1. Sentence capitalisation        — every bullet starts with a capital
//       2. First-person pronoun stripping — I / my / me / we / our
//       3. Weak qualifier removal         — successfully, various, very, just…
//       4. Weak opener rewrite            — "Was responsible for X" → "Owned X"
//       5. Trailing-period normalisation  — bullets either ALL end with "." or
//                                           NONE do (we pick "none" — modern style)
//       6. Number formatting              — "10000" → "10,000", "10 %" → "10%"
//       7. Markdown / HTML artefact strip — **bold**, *italic*, <br>, leading "- "
//       8. Whitespace + dash normalisation — "--" → "—", collapse double spaces
//       9. Tech-skill canonical casing    — javascript → JavaScript, aws → AWS
//      10. Duplicate-skill dedupe         — case-insensitive
//      11. Quantification ratio (detect)  — % of bullets with a metric
//
//     Every helper is idempotent — running the pipeline twice produces the same
//     output as running it once. None of these calls AI; all are deterministic
//     regex / lookup table work.
// ────────────────────────────────────────────────────────────────────────────

/** Words/phrases that almost always weaken a bullet without adding meaning. */
const WEAK_QUALIFIERS: RegExp[] = [
    /\bsuccessfully\s+/gi,
    /\beffectively\s+/gi,
    /\befficiently\s+/gi,
    /\bvarious\s+/gi,
    /\bseveral\s+/gi,
    /\b(?:a\s+)?number\s+of\s+/gi,
    /\bbasically\s+/gi,
    /\bactually\s+/gi,
    /\breally\s+/gi,
    /\bvery\s+/gi,
    /\bquite\s+/gi,
    /\bjust\s+/gi,
    /\bsome\s+kind\s+of\s+/gi,
    /\bstuff\s+/gi,
    /\bthings\s+/gi,
];

/**
 * Weak openers — the AI's favourite "filler verbs" that tell the recruiter
 * NOTHING about ownership or impact. Each entry rewrites the leading clause to
 * a stronger active-verb form. Order matters: longest pattern first.
 */
const WEAK_OPENERS: Array<[RegExp, string]> = [
    [/^was\s+responsible\s+for\s+(\w+ing)/i,           'Owned $1'],
    [/^was\s+responsible\s+for\s+/i,                   'Owned '],
    [/^responsible\s+for\s+(\w+ing)/i,                 'Owned $1'],
    [/^responsible\s+for\s+/i,                         'Owned '],
    [/^helped\s+(?:to\s+)?(\w+)/i,                     'Supported $1'],
    [/^assisted\s+(?:in|with)\s+(\w+ing)/i,            'Supported $1'],
    [/^assisted\s+(?:in|with)\s+/i,                    'Supported '],
    [/^worked\s+on\s+(\w+ing)/i,                       'Built $1'],
    [/^worked\s+on\s+/i,                               'Built '],
    [/^tasked\s+with\s+(\w+ing)/i,                     'Owned $1'],
    [/^tasked\s+with\s+/i,                             'Owned '],
    [/^involved\s+in\s+(\w+ing)/i,                     'Drove $1'],
    [/^involved\s+in\s+/i,                             'Drove '],
    [/^participated\s+in\s+/i,                         'Contributed to '],
    [/^duties\s+included\s+/i,                         'Delivered '],
];

/**
 * Canonical casing for common tech terms. Lookup is case-insensitive on the
 * KEY but the value is the recruiter-recognised spelling. We only apply this
 * to the `skills` array — bullets stay as the AI wrote them so we don't wreck
 * sentence flow (e.g. "javascript developers" inside a bullet stays untouched).
 */
const SKILL_CANONICAL: Record<string, string> = {
    'javascript': 'JavaScript', 'typescript': 'TypeScript', 'js': 'JavaScript', 'ts': 'TypeScript',
    'nodejs': 'Node.js', 'node js': 'Node.js', 'node.js': 'Node.js',
    'reactjs': 'React', 'react js': 'React', 'react.js': 'React', 'react': 'React',
    'nextjs': 'Next.js', 'next js': 'Next.js', 'next.js': 'Next.js',
    'vuejs': 'Vue.js', 'vue js': 'Vue.js', 'vue.js': 'Vue.js', 'vue': 'Vue.js',
    'angularjs': 'Angular', 'angular js': 'Angular', 'angular': 'Angular',
    'css': 'CSS', 'css3': 'CSS3', 'html': 'HTML', 'html5': 'HTML5',
    'tailwind': 'Tailwind CSS', 'tailwindcss': 'Tailwind CSS',
    'aws': 'AWS', 'gcp': 'GCP', 'azure': 'Azure',
    'sql': 'SQL', 'nosql': 'NoSQL', 'mysql': 'MySQL', 'postgres': 'PostgreSQL', 'postgresql': 'PostgreSQL',
    'mongodb': 'MongoDB', 'mongo': 'MongoDB', 'redis': 'Redis', 'sqlite': 'SQLite',
    'graphql': 'GraphQL', 'rest': 'REST', 'restful': 'RESTful',
    'docker': 'Docker', 'kubernetes': 'Kubernetes', 'k8s': 'Kubernetes',
    'ci/cd': 'CI/CD', 'cicd': 'CI/CD', 'ci cd': 'CI/CD',
    'github': 'GitHub', 'gitlab': 'GitLab', 'bitbucket': 'Bitbucket', 'git': 'Git',
    'jira': 'Jira', 'confluence': 'Confluence', 'slack': 'Slack', 'figma': 'Figma',
    'photoshop': 'Photoshop', 'illustrator': 'Illustrator',
    'python': 'Python', 'django': 'Django', 'flask': 'Flask', 'fastapi': 'FastAPI',
    'java': 'Java', 'spring': 'Spring', 'spring boot': 'Spring Boot', 'springboot': 'Spring Boot',
    'kotlin': 'Kotlin', 'swift': 'Swift', 'objective-c': 'Objective-C', 'objective c': 'Objective-C',
    'c#': 'C#', 'c++': 'C++', '.net': '.NET', 'dotnet': '.NET', 'asp.net': 'ASP.NET',
    'php': 'PHP', 'laravel': 'Laravel', 'symfony': 'Symfony',
    'ruby': 'Ruby', 'ruby on rails': 'Ruby on Rails', 'rails': 'Ruby on Rails',
    'go': 'Go', 'golang': 'Go', 'rust': 'Rust', 'scala': 'Scala', 'r': 'R',
    'tensorflow': 'TensorFlow', 'pytorch': 'PyTorch', 'keras': 'Keras', 'numpy': 'NumPy',
    'pandas': 'pandas', 'scikit-learn': 'scikit-learn', 'sklearn': 'scikit-learn',
    'matplotlib': 'Matplotlib', 'opencv': 'OpenCV',
    'macos': 'macOS', 'mac os': 'macOS', 'ios': 'iOS', 'android': 'Android', 'linux': 'Linux',
    'windows': 'Windows', 'ubuntu': 'Ubuntu',
    'powerbi': 'Power BI', 'power bi': 'Power BI', 'tableau': 'Tableau',
    'excel': 'Excel', 'word': 'Word', 'powerpoint': 'PowerPoint', 'outlook': 'Outlook',
    'ms office': 'Microsoft Office', 'microsoft office': 'Microsoft Office',
    'google sheets': 'Google Sheets', 'google docs': 'Google Docs',
    'salesforce': 'Salesforce', 'hubspot': 'HubSpot', 'sap': 'SAP',
    'agile': 'Agile', 'scrum': 'Scrum', 'kanban': 'Kanban', 'waterfall': 'Waterfall',
    'devops': 'DevOps', 'mlops': 'MLOps',
    'api': 'API', 'apis': 'APIs', 'sdk': 'SDK', 'cli': 'CLI', 'gui': 'GUI',
    'json': 'JSON', 'xml': 'XML', 'yaml': 'YAML', 'csv': 'CSV',
    'tcp/ip': 'TCP/IP', 'http': 'HTTP', 'https': 'HTTPS', 'dns': 'DNS', 'ssh': 'SSH',
    'oop': 'OOP', 'tdd': 'TDD', 'bdd': 'BDD', 'mvc': 'MVC',
    'ui': 'UI', 'ux': 'UX', 'ui/ux': 'UI/UX', 'ux/ui': 'UI/UX',
    'seo': 'SEO', 'sem': 'SEM', 'cms': 'CMS', 'crm': 'CRM', 'erp': 'ERP', 'saas': 'SaaS',
    'b2b': 'B2B', 'b2c': 'B2C', 'kpi': 'KPI', 'kpis': 'KPIs', 'roi': 'ROI',
};

/**
 * Strips first-person pronouns at the start or middle of a bullet.
 *
 * IMPORTANT — contraction safety:
 *   `\b` treats apostrophe as a non-word boundary, so a naïve `\bI\b` matches
 *   the leading "I" inside "I'm" / "I've" and produces broken text like
 *   "'m a backend engineer". Every regex below uses a negative lookahead
 *   `(?!')` (and equivalents) so contractions like I'm, I've, I'd, I'll,
 *   we're, we've, we'd, we'll survive untouched.
 *
 *   Bullets should not contain contractions in the first place — but the
 *   safety guarantee matters because this same helper is called on the
 *   summary in older code paths, where contractions ARE deliberate (see the
 *   "voice" rules in the generation prompt).
 */
function stripFirstPerson(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    let out = text;
    // Leading "I / We" + verb → drop the pronoun, keep verb.
    // Lookahead `(?!['’])` prevents matching the I in "I'm shipping…".
    out = out.replace(/^(\s*[-•·*»"']?\s*)(?:I|We)(?!['’])\s+(\w+)/i, (_, p, v) => {
        return p + v.charAt(0).toUpperCase() + v.slice(1);
    });
    // Mid-bullet possessives ("my team" → "team", "our roadmap" → "the roadmap").
    out = out.replace(/\bmy(?!['’])\s+/gi, '');
    out = out.replace(/\bour(?!['’])\s+/gi, 'the ');
    // Standalone I/me — but NEVER inside a contraction (I'm, I've, I'd, I'll, me'd).
    out = out.replace(/\b(?:I|me)(?!['’])\b\s*/g, '');
    out = out.replace(/\s{2,}/g, ' ').trim();
    return { text: out, changed: out !== text };
}

/** Drops weak qualifier adverbs/quantifiers without disturbing the verb. */
function stripWeakQualifiers(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    let out = text;
    for (const r of WEAK_QUALIFIERS) out = out.replace(r, '');
    out = out.replace(/\s{2,}/g, ' ').trim();
    return { text: out, changed: out !== text };
}

/** Rewrites a bullet's leading "weak opener" clause to a strong action verb. */
function rewriteWeakOpener(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    // Strip any leading bullet glyph for the match — we'll restore it.
    const m = text.match(/^(\s*[-•·*»"']?\s*)([\s\S]*)$/);
    if (!m) return { text, changed: false };
    const [, prefix, body] = m;
    for (const [pat, repl] of WEAK_OPENERS) {
        if (pat.test(body)) {
            return { text: prefix + body.replace(pat, repl), changed: true };
        }
    }
    return { text, changed: false };
}

/**
 * Normalises non-ASCII digits, currency symbols, and punctuation that some
 * AI models emit (full-width forms, mathematical alphanumerics, Arabic-Indic
 * digits, etc.) back to their plain ASCII equivalents.
 *
 * Why this exists — the user-visible bug:
 *   When a model returns e.g. "increased revenue by ＄１．２M" or "improved
 *   uptime to 99．９％" using full-width or Arabic-Indic digits, the rendered
 *   CV shows those characters in a different font from the surrounding text.
 *   That's because the primary CV fonts (DM Sans, Playfair Display, Inter,
 *   Georgia, Crimson Text, etc.) only ship Latin glyphs — the browser falls
 *   back to a system font (often a CJK or system mono) for any other code
 *   point, producing the "wrong-font numbers/symbols" effect. Normalising to
 *   ASCII keeps every glyph inside the loaded font.
 *
 * Also strips zero-width formatting characters that AI sometimes injects
 * (ZWSP, ZWNJ, ZWJ, BOM) — they're invisible in editors but break PDF text
 * extraction and copy-paste.
 */
function normaliseUnicodeDigitsAndSymbols(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    let out = text;

    // Full-width ASCII (U+FF01..U+FF5E) → ASCII (subtract 0xFEE0).
    // Covers: ０-９ ％ ＄ ， ． ＋ － ＝ ： ； ！ ？ ＃ ＆ ＊ （ ） etc.
    out = out.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

    // Mathematical Alphanumeric Symbols digits (U+1D7CE..U+1D7FF, 5 styles × 10).
    // Each block of 10 starts at one of these code points → digit 0.
    out = out.replace(/[\u{1D7CE}-\u{1D7FF}]/gu, ch => {
        const cp = ch.codePointAt(0)!;
        return String.fromCharCode(0x30 + ((cp - 0x1D7CE) % 10));
    });

    // Arabic-Indic digits (U+0660..U+0669) and Extended Arabic-Indic (U+06F0..U+06F9).
    out = out.replace(/[\u0660-\u0669]/g, ch => String.fromCharCode(0x30 + (ch.charCodeAt(0) - 0x0660)));
    out = out.replace(/[\u06F0-\u06F9]/g, ch => String.fromCharCode(0x30 + (ch.charCodeAt(0) - 0x06F0)));
    // Devanagari (U+0966..U+096F), Bengali (U+09E6..U+09EF) — rarer but seen.
    out = out.replace(/[\u0966-\u096F]/g, ch => String.fromCharCode(0x30 + (ch.charCodeAt(0) - 0x0966)));
    out = out.replace(/[\u09E6-\u09EF]/g, ch => String.fromCharCode(0x30 + (ch.charCodeAt(0) - 0x09E6)));

    // CJK punctuation that shows up next to numbers.
    out = out.replace(/\u3001/g, ',');   // 、 → ,
    out = out.replace(/\u3002/g, '.');   // 。 → .

    // Various non-breaking / narrow / hair / figure spaces → plain ASCII space.
    // U+00A0 NBSP, U+202F NARROW NBSP, U+2009 THIN, U+200A HAIR, U+2007 FIGURE.
    out = out.replace(/[\u00A0\u2007\u2009\u200A\u202F]/g, ' ');

    // Zero-width junk: ZWSP, ZWNJ, ZWJ, BOM, WORD JOINER.
    out = out.replace(/[\u200B\u200C\u200D\uFEFF\u2060]/g, '');

    // Fancy minus signs and unicode hyphens that aren't typographic em/en dashes.
    // (We leave en/em dashes alone — normaliseWhitespaceAndDashes handles those.)
    out = out.replace(/[\u2010\u2011\u2212]/g, '-');  // hyphen, NB-hyphen, minus → -

    return { text: out, changed: out !== text };
}

/**
 * Removes Markdown / HTML artefacts that the AI sometimes injects despite
 * "plain text only" instructions. Strips: **bold**, *italic*, _underline_,
 * `code`, <br>, <strong>, leading "- " or "• " (we render bullets ourselves).
 */
function stripMarkupArtifacts(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    let out = text;
    out = out.replace(/<\/?[a-zA-Z][^>]*>/g, '');           // any HTML tag
    out = out.replace(/\*\*(.+?)\*\*/g, '$1');              // **bold**
    out = out.replace(/__(.+?)__/g, '$1');                  // __bold__
    out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1'); // *italic*
    out = out.replace(/`([^`]+)`/g, '$1');                  // `code`
    out = out.replace(/^[\s]*[-•·*»]\s+/, '');              // leading bullet glyph
    return { text: out, changed: out !== text };
}

/**
 * Whitespace + dash normalisation. ASCII-only output so PDF rendering doesn't
 * surprise users — we explicitly DO NOT swap ASCII quotes to curly here
 * because typography across templates is inconsistent.
 */
function normaliseWhitespaceAndDashes(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    let out = text;
    out = out.replace(/\s+/g, m => m.includes('\n') ? m : ' '); // collapse runs of spaces but keep newlines
    out = out.replace(/ ?-- ?/g, ' — ');                         // "--" → em dash
    out = out.replace(/\s+([.,;:!?])/g, '$1');                  // " ." → "."
    out = out.replace(/\.{3,}/g, '…');                          // "..." → ellipsis
    out = out.trim();
    return { text: out, changed: out !== text };
}

/**
 * Number formatting: thousands separators on raw integers ≥ 1000, "10 %" → "10%",
 * "$ 1,000" → "$1,000". Idempotent — already-formatted numbers are skipped by
 * the regex's word-boundary on commas.
 */
function formatNumbers(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    let out = text;
    // Add commas to bare integers ≥ 4 digits that aren't already grouped, not
    // a year (1900–2099), and not part of a longer alphanumeric token.
    out = out.replace(/(?<![\w,.])(\d{4,})(?![\w,.])/g, (full, n) => {
        const v = parseInt(n, 10);
        if (isNaN(v)) return full;
        if (v >= 1900 && v <= 2099 && n.length === 4) return full; // probably a year
        return v.toLocaleString('en-US');
    });
    // "10 %" → "10%"
    out = out.replace(/(\d)\s+%/g, '$1%');
    // "$ 1,000" → "$1,000"
    out = out.replace(/([$£€¥])\s+(\d)/g, '$1$2');
    return { text: out, changed: out !== text };
}

/**
 * Cleans up orphan metric markers — places where the AI emitted "%" or a
 * currency symbol without an actual number. These leak through when the
 * model is told "use 11%, not 10%" but couldn't infer a real value, leaving
 * fragments like "improved efficiency by %" or "saved KES on costs".
 *
 * The fix: rewrite the offending preposition + orphan marker so the bullet
 * still reads naturally without claiming a fake metric.
 *
 *   "by %"        → "" (drop the dangling phrase)
 *   "by % of"     → "of"
 *   "saved KES "  → "saved costs "
 *   "$ on"        → "money on"
 */
function stripOrphanMetrics(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    let out = text;

    // 0) PLACEHOLDER LEAKS — the AI sometimes emits literal template tokens
    //    when it ran out of inferable context: "{metric}", "{number}",
    //    "[X]", "[number]", "XX%", "$XX", "___", three-or-more X's.
    //    These are the single most embarrassing thing a CV can ship with —
    //    they instantly tell a recruiter "this was AI-generated and not
    //    proof-read". We drop the whole "by/from/to PLACEHOLDER" clause
    //    rather than try to invent a number.
    const PLACEHOLDER_TOKEN =
        /(?:\{[A-Za-z_]+\}|\[[A-Za-z_]+\]|XX+%?|\$XX+|XXX+|_{2,}|<[A-Za-z_]+>)/;
    // 0a) "by/of/to/from {metric}" or "by XX%" → drop the prepositional fragment
    //     and any trailing unit (%, K, M, B, +, currency code) but NEVER consume
    //     arbitrary trailing words like "monthly" or "in" — those carry meaning
    //     and the bullet still needs to read naturally without the missing number.
    out = out.replace(
        new RegExp(
            `\\s*\\b(?:by|of|to|from|with|over|under|above|below|reaching|achieving|approximately|around|about|roughly|nearly|almost|up\\s+to)\\s+${PLACEHOLDER_TOKEN.source}(?:\\s*(?:%|\\+|(?:K|M|B|KES|NGN|ZAR|GBP|USD|EUR|AED|JPY|INR|CAD|AUD|CHF|CNY)\\b))?`,
            'gi',
        ),
        '',
    );
    // 0b) Bare placeholder anywhere → strip it (will be cleaned up by tidy below).
    out = out.replace(new RegExp(PLACEHOLDER_TOKEN.source, 'g'), '');

    // 0c) ORPHAN LEADING DECIMAL — the AI emitted "$1.8M" but lost the leading
    //     digit / currency symbol, so the field now contains glued fragments
    //     like "achieving.8M in sales" or "resulting.8M in sales" or
    //     "delivering.5K customers". Real user-reported pattern from a
    //     sales-engineer CV, Apr 29 2026 — Bruce Oyugi McKinsey CV.
    //
    //     The decimal is "orphan" when it is NOT preceded by a digit
    //     (e.g. "0.8M" / "$1.8M" stay protected because the dot is preceded
    //     by 0 / 1). We strip the verb/prep + orphan + optional connector
    //     ("in revenue/sales/profits/etc.") so the bullet still reads
    //     naturally without a fabricated number.
    //
    //     Pass A: "<verb-or-prep><optional-space>.<digits><scale>?<connector>?"
    out = out.replace(
        /\s*\b(?:achieving|reaching|delivering|generating|resulting|adding|earning|saving|hitting|exceeding|producing|driving|netting|by|of|to|from|with|over|under|above|below|approximately|around|about|roughly|nearly|almost|up\s+to)\s*(?<![\d])\.\d+\s*(?:K|M|B|%|\+)?\b(?:\s+in\s+(?:revenue|sales|profits?|earnings|growth|costs?|savings?|expenses?|margins?))?/gi,
        '',
    );
    //     Pass B: bare ".8M" anywhere with leading whitespace/comma/semi —
    //     no preceding digit means orphan. Restrict to recognised scale
    //     suffixes (K/M/B/%) to avoid clobbering legit punctuation like
    //     "v2.0" or sentence ".5 percent" (rare but possible).
    out = out.replace(/(?<![\d.])([\s,;])\.\d+\s*(?:K|M|B|%)\b/g, '$1');

    // 1) Currency code/symbol followed by an ORPHAN THOUSANDS GROUP. The CF
    //    Workers AI fallback sometimes emits "KES ,000" / "USD ,500,000" /
    //    "$ ,000" when it tried to "soften" a too-large number from the
    //    validator and just deleted the leading digits. We strip the entire
    //    "(verb) (currency) ,XXX(,XXX)+" fragment plus any trailing "in revenue"
    //    /"in sales" connector, leaving the rest of the bullet readable.
    out = out.replace(
        /\s*\b(?:generating|producing|delivering|reaching|achieving|driving|adding|earning|saving|cutting|reducing|of|by|to|from|with|approximately|around|about|roughly|nearly|almost|over|under|up\s+to)?\s*(?:KES|NGN|ZAR|GBP|USD|EUR|AED|JPY|INR|CAD|AUD|CHF|CNY|KSh|Ksh|R|₦|₹|€|£|\$)\s+,\d{3}(?:,\d{3})*(?:\s+in\s+(?:revenue|sales|costs?|savings?|earnings?|profit))?/gi,
        '',
    );
    // Bare " ,000" floating after a stripped currency.
    out = out.replace(/\s+,\d{3}(?:,\d{3})*(?=\s|[,.;:!?]|$)/g, '');

    // 2) Orphan "%" — a "%" not preceded by a digit (allowing spaces between).
    //    Common AI failure: "improved performance by %" or "increased % of".
    //    Drop preceding preposition/article + orphan %, keeping the rest.
    //    NOTE: "a/an/the" included so "achieving a % retention" → "achieving retention".
    out = out.replace(
        /\s*\b(?:by|of|to|with|at|achieving|reaching|approximately|around|about|roughly|nearly|almost|over|under|above|below|up\s+to|a|an|the)\s+%(?!\w)/gi,
        ''
    );
    // Catch "and a/an/the %" — a common CF Workers AI joiner.
    out = out.replace(
        /\s*\b(?:and|or|plus|including)\s+(?:a|an|the)\s+%(?!\w)/gi,
        ''
    );
    // FINAL SWEEP: any "%" not directly preceded by a digit is orphan. By the
    // time we get here, formatNumbers has already collapsed legitimate
    // "5 %" → "5%" / "$ 1,000" → "$1,000", so this rule is safe to be aggressive.
    // Catches:
    //   "% growth"     (space before %)        → " growth"
    //   "%growth"      (NO space, letter after) → "growth"   (was previously missed)
    //   ".%"           (period before, no digit) → ""        (was previously missed)
    //   "by  %"        (multiple spaces)        → "by"
    //
    // Pre-strip: a stray punctuation mark immediately before an orphan "%"
    // ("delivered .% improvement", "saved KPI ,% on costs") — drop the punct
    // BUT only when not part of a real number ("0.5%" → preserved because
    // the lookbehind for the punct itself sees a digit).
    out = out.replace(/(?<!\d)[.,;:]\s*(?=%)/g, '');
    out = out.replace(/(?<!\d)\s*%\s*/g, ' ');

    // 3) Orphan currency symbol/code immediately followed by a non-digit.
    //    "saved KES on costs" → "saved on costs" (we'll let the surrounding
    //    text carry the meaning rather than inventing a number).
    out = out.replace(
        /\b(KES|NGN|ZAR|GBP|USD|EUR|AED|JPY|INR|CAD|AUD|CHF|CNY)\s+(?=[a-zA-Z])/g,
        ''
    );
    out = out.replace(/([$£€¥])\s+(?=[a-zA-Z])/g, '');

    // 4) ORPHAN PREPOSITION — after the strips above we may be left with a
    //    bullet that ends or pivots on a hanging preposition: "reduced
    //    costs by ." or "improved efficiency by, then shipped X". Drop the
    //    dangling preposition + any whitespace before the next punctuation.
    // Match dangling preposition either after whitespace OR at the very start
    // of the field (so "by approximately" → strip "approximately" → "by" → strip "by").
    // Run twice so a chain of prepositions ("by approximately") fully unwinds.
    const danglingPrepRx =
        /(?:\s+|^)\b(?:by|from|to|of|with|over|under|reaching|achieving|approximately|around|about|roughly|nearly|almost|up\s+to|through|via|while|during|across|within|including|featuring|representing|generating|delivering|producing)\b(?=\s*[,.;:!?]|\s*$)/gi;
    out = out.replace(danglingPrepRx, '');
    out = out.replace(danglingPrepRx, '');

    // 4a) CONSECUTIVE PREPOSITION COLLAPSE — "by through X" / "of via Y" /
    //     "to with Z" appears when the AI elided a metric ("reducing lead
    //     times by [50%] through better coordination") and only the connector
    //     survived. We drop the LEADING preposition and keep the second one,
    //     so "reducing lead times by through better coordination" becomes
    //     "reducing lead times through better coordination" — still a clean
    //     bullet with no dangling fragment. Real user-reported pattern from
    //     a sales-engineer CV, Apr 2026.
    out = out.replace(
        /\b(?:by|of|to|from|with|over|under|above|below|reaching|achieving|approximately|around|about|roughly|nearly|almost)\s+(?=(?:through|via|by|with|using|including|featuring|across|within|during|on|over|under|above|below)\b)/gi,
        '',
    );

    // 4c) TIME-PREP DROPPED-UNIT — "within of reporting" / "after of testing"
    //     / "before of launch" / "during of rollout" appears when the AI
    //     emitted a duration phrase ("within [24 hours] of reporting") but
    //     deleted the bracketed time unit. The result is a broken
    //     "<time-prep> of <noun>" fragment that contributes nothing. We
    //     strip the whole "<time-prep> of <noun(s)>" up to the next
    //     punctuation OR clause-connector, so the bullet still reads
    //     naturally. Real user-reported pattern from a sales-engineer CV,
    //     Apr 29 2026 — Bruce Oyugi McKinsey CV.
    //     NOTE: use [^\s,;:.!?] (not \S) so the noun matcher never eats the
    //     trailing comma/punctuation — that comma keeps the surrounding
    //     clause grammatical ("inefficiencies, improving retention").
    out = out.replace(
        /\s*\b(?:within|after|before|during)\s+of\s+[^\s,;:.!?]+(?:\s+[^\s,;:.!?]+){0,2}?(?=[,.;:!?]|\s+(?:and|while|but|then|since|using|via|to|from|by|hitting|beating|exceeding|improving|reducing|increasing|cutting|streamlining|driving|generating|delivering)\b|\s*$)/gi,
        '',
    );

    // 4b) DANGLING METRIC CONNECTOR — "..., in revenue and beating monthly
    //     targets" without a leading number. The AI emitted the connector
    //     ("$50K in revenue") but lost the metric, leaving a fragment that
    //     reads as broken. We drop "<comma> in <metric-noun>" ONLY when
    //     followed by a clause continuation AND no digit appears in the
    //     immediately preceding 12 chars (so we never clobber a real
    //     "$50K in revenue" that we want to keep).
    out = out.replace(
        /,\s+in\s+(revenue|sales|profits?|earnings|growth|costs?|savings?|expenses?|margins?)\b(?=\s+(?:and|while|but|then|since|using|via|to|from|by|hitting|beating|exceeding)\b|[,.;:!?]|\s*$)/gi,
        (match: string, _noun: string, offset: number, full: string) => {
            const prevSlice = full.slice(Math.max(0, offset - 12), offset);
            return /\d/.test(prevSlice) ? match : '';
        },
    );

    // 5) Tidy the side-effects: collapse double spaces, fix spacing before
    //    punctuation, fix orphan commas/empty parens, fix article disagreement
    //    that step 2 may have created ("a average" → "an average"), trim.
    out = out
        .replace(/\(\s*\)/g, '')
        .replace(/,\s*,/g, ',')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        // Trim trailing comma/semicolon (left dangling when an orphan
        // metric/connector at end of field was stripped, e.g. "requirements,").
        .replace(/[,;:]\s*$/g, '');
    // Article agreement after orphan-% strip: "a [vowel]" → "an [vowel]";
    // "an [consonant]" → "a [consonant]". Preserve original capitalization.
    out = out.replace(/\b([Aa])\s+([aeiouAEIOU])/g,
        (_, A, c) => `${A === 'A' ? 'An' : 'an'} ${c}`);
    out = out.replace(/\b([Aa])n\s+([bcdfghjklmnpqrstvwxzBCDFGHJKLMNPQRSTVWXZ])/g,
        (_, A, c) => `${A === 'A' ? 'A' : 'a'} ${c}`);
    out = out.trim();

    return { text: out, changed: out !== text };
}

/**
 * UNIVERSAL CV DEFECT — "metric verb without a number".
 *
 * AI-generated CVs frequently emit clauses like:
 *   - "..., achieving water savings through precise emitter placement"
 *   - "..., cutting lead time"
 *   - "..., increasing adoption of scheduling features"
 *   - "..., reducing variance on test plots"
 *   - "..., improving accuracy of forecasts"
 *
 * These read as "censored bullets" — the verb signals a measurable change
 * (achieving X, reducing Y, increasing Z) but no number ever lands. A human
 * recruiter sees this as either lazy writing or a redacted bullet. The
 * cleanest fix is to drop the dangling gerund clause entirely so the bullet
 * stands on its own merit without an empty promise.
 *
 * Conservative rules:
 *   1. Only fires on COMMA-PRECEDED gerund clauses (",  achieving …" /
 *      ", reducing …") — we never touch a bullet whose primary verb is
 *      a metric gerund.
 *   2. Only fires when the matched clause contains NO digit anywhere —
 *      so legitimate "increasing revenue by 30%" / "reducing costs by KES 5M"
 *      stays untouched.
 *   3. Only fires when stripping leaves the bullet with ≥6 words —
 *      we never reduce a bullet to a stub.
 *   4. Stops at the next sentence-boundary punctuation (",.;:!?") so we
 *      only consume the gerund clause itself, not surrounding bullet text.
 *
 * Emits a `unquantified_metric_verb` leak so the AI provider gets feedback
 * to either include a number or drop the metric verb upstream next time.
 */
const METRIC_GERUNDS = [
    // "achievement" verbs
    'achieving', 'reaching', 'delivering', 'generating', 'producing',
    'driving', 'netting', 'earning', 'saving', 'hitting', 'exceeding',
    'surpassing', 'beating', 'realising', 'realizing',
    // "growth" verbs
    'increasing', 'growing', 'boosting', 'raising', 'lifting', 'scaling',
    'expanding', 'doubling', 'tripling', 'multiplying',
    // "reduction" verbs
    'reducing', 'cutting', 'shrinking', 'decreasing', 'lowering', 'dropping',
    'slashing', 'trimming', 'minimising', 'minimizing', 'eliminating',
    // "improvement" verbs
    'improving', 'enhancing', 'optimising', 'optimizing',
    'streamlining', 'accelerating', 'strengthening',
];
function stripUnquantifiedMetricGerund(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    const verbsAlt = METRIC_GERUNDS.join('|');
    // Match ", <gerund> <stuff up to next punct/end>". The clause body uses
    // [^,.;:!?] so we never cross a sentence boundary.
    const rx = new RegExp(`,\\s+(?:${verbsAlt})\\s+[^,.;:!?]+`, 'gi');

    // Replace each match: drop only when no digit appears in the clause.
    const cleaned = text.replace(rx, (match) => /\d/.test(match) ? match : '');
    if (cleaned === text) return { text, changed: false };

    // Safety: refuse to leave the bullet too short (≥6 content words).
    const remainingWords = (cleaned.match(/\b\w+\b/g) || []).length;
    if (remainingWords < 6) return { text, changed: false };

    return { text: cleaned, changed: true };
}

/**
 * The CF Workers AI fallback for "voice-fix" rewrites sometimes prepends
 * "Re-" to existing verbs ("framed" → "Re-framed", "positioned" →
 * "Re-positioned", "narrated" → "Re-narrated") in a misguided attempt to
 * avoid duplicate openers. It also emits low-quality openers like
 * "Moderated", "Advocated for", "Discussed a portfolio" that aren't in any
 * approved verb pool. This deterministic rewriter catches the common
 * offenders and swaps them for clean canonical verbs.
 *
 * Idempotent. Safe to run multiple times.
 */
function rewriteWeirdOpeners(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    let out = text;
    // Track if we made any change so we can report it as a leak.
    const before = out;

    // 1) "Re-<verb>" prefix — drop the "Re-" and capitalise the next letter.
    //    Only at the start of a sentence/bullet (after optional bullet glyph).
    out = out.replace(
        /^(\s*[-•·*»"']?\s*)Re-([a-z])/,
        (_, prefix, ch) => prefix + ch.toUpperCase(),
    );
    // 2) Same fix mid-bullet (rare but happens after semi-colons).
    out = out.replace(/([.;])\s+Re-([a-z])/g, (_, p, ch) => `${p} ${ch.toUpperCase()}`);

    // 3) Specific weak-opener verb swaps. Maps the verb-only — leaves the
    //    rest of the bullet unchanged. We pick a clean canonical verb of
    //    similar meaning so the bullet still reads correctly. Triggered ONLY
    //    at the very start of a bullet, where openers matter for ATS scanning.
    const OPENER_SWAPS: Array<[RegExp, string]> = [
        // Vague communication verbs — too soft for a CV opener.
        [/^(\s*[-•·*»"']?\s*)Discussed\s+a\s+portfolio\s+of\b/i, '$1Managed a portfolio of'],
        [/^(\s*[-•·*»"']?\s*)Discussed\b/,                       '$1Presented'],
        [/^(\s*[-•·*»"']?\s*)Moderated\s+relationships\b/i,      '$1Managed relationships'],
        [/^(\s*[-•·*»"']?\s*)Moderated\b/,                       '$1Managed'],
        [/^(\s*[-•·*»"']?\s*)Advocated\s+for\b/i,                '$1Championed'],
        [/^(\s*[-•·*»"']?\s*)Advocated\b/,                       '$1Promoted'],
        [/^(\s*[-•·*»"']?\s*)Engaged\s+with\b/i,                 '$1Partnered with'],
        [/^(\s*[-•·*»"']?\s*)Engaged\b/,                         '$1Collaborated'],
        [/^(\s*[-•·*»"']?\s*)Liaised\s+with\b/i,                 '$1Coordinated with'],
        [/^(\s*[-•·*»"']?\s*)Liaised\b/,                         '$1Coordinated'],
        [/^(\s*[-•·*»"']?\s*)Utilised\b/,                        '$1Used'],
        [/^(\s*[-•·*»"']?\s*)Utilized\b/,                        '$1Used'],
        [/^(\s*[-•·*»"']?\s*)Leveraged\b/,                       '$1Used'],
        [/^(\s*[-•·*»"']?\s*)Spearheaded\b/,                     '$1Led'],
        [/^(\s*[-•·*»"']?\s*)Orchestrated\b/,                    '$1Led'],
    ];
    for (const [rx, repl] of OPENER_SWAPS) {
        out = out.replace(rx, repl);
    }

    return { text: out, changed: out !== before };
}

/** Capitalises the first alphabetic character, preserving any leading glyph. */
function capitaliseFirst(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    const m = text.match(/^(\s*[-•·*»"']?\s*)([a-z])([\s\S]*)$/);
    if (!m) return { text, changed: false };
    return { text: m[1] + m[2].toUpperCase() + m[3], changed: true };
}

/** Removes a single trailing period from a bullet (modern resume style). */
function stripTrailingPeriod(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    if (/[.!?…]$/.test(text) && !/[.][.][.]$/.test(text)) {
        const out = text.replace(/[.!?]+$/, '');
        return { text: out, changed: out !== text };
    }
    return { text, changed: false };
}

/**
 * Normalises a single skill string to its canonical casing if known, else
 * Title-Cases multi-word skills and leaves single all-lower acronyms alone
 * (they'll be picked up by the lookup table on the next pass).
 */
function canonicaliseSkill(skill: string): string {
    if (!skill) return skill || '';
    const trimmed = skill.trim();
    const key = trimmed.toLowerCase().replace(/\s{2,}/g, ' ');
    if (SKILL_CANONICAL[key]) return SKILL_CANONICAL[key];
    // Otherwise: Title-Case multi-word phrases, leave acronyms alone.
    if (/^[A-Z0-9./+#-]+$/.test(trimmed)) return trimmed; // already an acronym
    return trimmed.split(/\s+/).map(w =>
        w.length === 0 ? w :
        w.length <= 2 && w === w.toUpperCase() ? w :   // keep "AI", "ML", "QA"
        w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');
}

/** De-duplicates skills case-insensitively, keeping the first canonical form. */
function dedupeSkills(skills: string[]): { skills: string[]; removed: number } {
    const seen = new Set<string>();
    const out: string[] = [];
    let removed = 0;
    for (const s of skills) {
        const key = s.trim().toLowerCase();
        if (!key) { removed++; continue; }
        if (seen.has(key)) { removed++; continue; }
        seen.add(key);
        out.push(s);
    }
    return { skills: out, removed };
}

/** Returns the fraction of bullets across all roles that contain a number. */
function quantificationRatio(cv: CVData): number {
    const bullets: string[] = [];
    (cv.experience || []).forEach(e => (e.responsibilities || []).forEach(b => bullets.push(b)));
    if (bullets.length === 0) return 1;
    const withNum = bullets.filter(b => /\d/.test(b)).length;
    return withNum / bullets.length;
}

/**
 * Fixes "a/an" article agreement after substitutions or word deletions.
 * The `dynamic\s+ → ''` substitution can leave behind "a engineer" (was "a
 * dynamic engineer"); other deletions can leave "an manager" (was "an
 * accomplished manager"). This pass repairs both directions using a simple
 * vowel-letter heuristic. It is intentionally conservative — we don't try to
 * handle silent-h ("an hour") or vowel-sounding consonants ("a university"),
 * which are rare in CV text. Idempotent.
 */
function fixArticleAgreement(text: string): { text: string; changed: boolean } {
    if (!text) return { text: text || '', changed: false };
    let out = text;
    // "a" / "A" before a vowel-letter word → "an" / "An"
    out = out.replace(/\b(a)( +)(?=[aeiouAEIOU]\w)/g, (_m, art, sp) => `${art === 'A' ? 'An' : 'an'}${sp}`);
    // "an" / "An" before a consonant-letter word → "a" / "A"
    out = out.replace(/\b(an)( +)(?=[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]\w)/g, (_m, art, sp) => `${art === 'An' ? 'A' : 'a'}${sp}`);
    return { text: out, changed: out !== text };
}

/**
 * Drops a trailing prepositional phrase whose final content word is a duplicate
 * of an earlier content word in the same bullet/sentence.
 *
 * Concrete failure mode this guards against: the substitution
 * `knowledge sharing → documentation` rewrites
 *   "enable knowledge sharing across the org through documentation"
 * to
 *   "enable documentation across the org through documentation"
 * which is grammatical but reads as obviously broken. `removeDuplicateWords`
 * only collapses ADJACENT duplicates, so it can't help here.
 *
 * Heuristic: scan for `<prep> [the|a|an]? <WORD>` at the end of the bullet
 * (or before a sentence terminator). If that final WORD already appears
 * earlier in the same bullet as a content word (≥4 chars, not in the stop set),
 * drop the entire prepositional phrase. Single pass — won't recursively chase
 * additional duplicates. Conservative on length: leaves the bullet alone if
 * dropping would shorten it below 6 words.
 */
const REDUNDANT_PREPS = ['through', 'via', 'by', 'with', 'using', 'including', 'featuring', 'across', 'within', 'during'];
const DEDUP_STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for', 'on', 'at', 'by',
    'is', 'was', 'as', 'this', 'that', 'it', 'be', 'with', 'from', 'into',
    'team', 'work', 'role', 'time', 'org', 'company', 'group',
]);

function dropRedundantPrepPhrase(text: string): { text: string; changed: boolean } {
    if (!text || typeof text !== 'string') return { text: text || '', changed: false };
    const prepGroup = REDUNDANT_PREPS.join('|');
    // Trailing "…<prep> [the|a|an]? <WORD>[.,;]?" anchored to end-of-string OR
    // followed by a sentence boundary.
    const re = new RegExp(`\\s+(${prepGroup})\\s+(?:the|a|an)?\\s*([A-Za-z][A-Za-z'-]+)([.,;:!?]?)\\s*$`, 'i');
    const m = text.match(re);
    if (!m) return { text, changed: false };
    const tailWord = m[2].toLowerCase();
    if (DEDUP_STOPWORDS.has(tailWord) || tailWord.length < 4) {
        return { text, changed: false };
    }
    // Look for the same content word earlier in the bullet (NOT inside the
    // matched tail). Word-boundary, case-insensitive.
    const head = text.slice(0, text.length - m[0].length);
    const earlierRe = new RegExp(`\\b${tailWord}\\b`, 'i');
    if (!earlierRe.test(head)) return { text, changed: false };
    // Don't shorten the bullet to below 6 words — preserves readability.
    const wordCount = head.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 6) return { text, changed: false };
    // Preserve trailing punctuation if the original had it.
    return { text: head.replace(/\s+$/, '') + (m[3] || ''), changed: true };
}

/** Composite polish pass for a single bullet — order matters. */
function polishBullet(bullet: string): { text: string; fixes: string[] } {
    const fixes: string[] = [];
    let cur = bullet;
    const apply = (name: string, fn: (s: string) => { text: string; changed: boolean }) => {
        const r = fn(cur);
        if (r.changed) { fixes.push(name); cur = r.text; }
    };
    // unicode_glyph FIRST — must run before any regex pass so digit/symbol
    // matchers in formatNumbers / stripOrphanMetrics see ASCII characters.
    // Also fixes the user-reported "numbers render in a different font" bug
    // by collapsing full-width / mathematical / Arabic-Indic glyphs to ASCII.
    apply('unicode_glyph',    normaliseUnicodeDigitsAndSymbols);
    apply('markup_strip',     stripMarkupArtifacts);
    apply('first_person',     stripFirstPerson);
    apply('weird_opener',     rewriteWeirdOpeners);
    apply('weak_opener',      rewriteWeakOpener);
    apply('weak_qualifier',   stripWeakQualifiers);
    // dup_prep_phrase: catches non-adjacent duplicate content words created by
    // upstream substitutions (e.g. "knowledge sharing → documentation" leaving
    // "enable documentation … through documentation"). Runs AFTER weak
    // qualifiers so removing "very/really" can't shift the trailing phrase
    // out of range, and BEFORE article fix in case dropping the trailing
    // phrase changes which article precedes the next noun.
    apply('dup_prep_phrase',  dropRedundantPrepPhrase);
    // article_agreement: repairs "a engineer" / "an manager" caused by
    // word-deletion substitutions like `dynamic\s+ → ''`.
    apply('article_agreement', fixArticleAgreement);
    // number_format MUST run before orphan_metric so legit "5 %" / "$ 1,000"
    // get collapsed to "5%" / "$1,000" first — otherwise stripOrphanMetrics
    // sees the space and treats them as orphans.
    apply('number_format',    formatNumbers);
    apply('orphan_metric',    stripOrphanMetrics);
    // Universal: strip ", <metric-gerund> …" clauses with no number.
    // Runs AFTER orphan_metric so a stripped orphan ("…, achieving.8M")
    // doesn't mask a still-dangling clause ("…, achieving water savings").
    apply('unquantified_metric_verb', stripUnquantifiedMetricGerund);
    apply('whitespace_dashes', normaliseWhitespaceAndDashes);
    apply('trailing_period',  stripTrailingPeriod);
    apply('capitalise',       capitaliseFirst);
    return { text: cur, fixes };
}

/**
 * Composite polish pass for the SUMMARY paragraph.
 *
 * The summary is the one place where the generation prompt deliberately
 * encourages contractions and a first-person voice ("I've shipped…",
 * "I focus on…"). Running the bullet pipeline against it stripped those
 * out and produced sentences like "'ve shipped X" or "Engineer focused on Y"
 * (losing the human voice). This variant keeps every other polish step
 * but skips `stripFirstPerson` and `rewriteWeakOpener` (the latter rewrites
 * leading verbs in a bullet style that doesn't fit a paragraph).
 */
function polishSummary(text: string): { text: string; fixes: string[] } {
    const fixes: string[] = [];
    let cur = text;
    const apply = (name: string, fn: (s: string) => { text: string; changed: boolean }) => {
        const r = fn(cur);
        if (r.changed) { fixes.push(name); cur = r.text; }
    };
    // unicode_glyph FIRST — see polishBullet for rationale (font-fallback fix).
    apply('unicode_glyph',    normaliseUnicodeDigitsAndSymbols);
    apply('markup_strip',     stripMarkupArtifacts);
    // first_person SKIPPED — summary keeps its voice.
    // weak_opener  SKIPPED — paragraph, not a bullet.
    apply('weak_qualifier',   stripWeakQualifiers);
    // dup_prep_phrase + article_agreement: same rationale as polishBullet.
    // The summary is the highest-visibility free-text field on the CV, so it
    // is also the most likely place a substitution-induced grammar bug shows
    // up to the user.
    apply('dup_prep_phrase',  dropRedundantPrepPhrase);
    apply('article_agreement', fixArticleAgreement);
    // number_format BEFORE orphan_metric — see polishBullet for rationale.
    apply('number_format',    formatNumbers);
    apply('orphan_metric',    stripOrphanMetrics);
    apply('whitespace_dashes', normaliseWhitespaceAndDashes);
    // trailing_period SKIPPED — summaries DO end with a period.
    apply('capitalise',       capitaliseFirst);
    return { text: cur, fixes };
}

// ────────────────────────────────────────────────────────────────────────────
// 5. THE ORCHESTRATOR — every generation path calls this exactly once.
// ────────────────────────────────────────────────────────────────────────────

export interface PurifyLeak {
    leakType:
        | 'banned_phrase' | 'duplicate_word' | 'pursuing_phrase' | 'tense_mismatch'
        | 'round_number' | 'repeated_phrase'
        // Phase 2
        | 'first_person' | 'weak_qualifier' | 'weak_opener' | 'weird_opener' | 'markup_artifact'
        | 'capitalisation' | 'trailing_period' | 'number_format' | 'whitespace_dash'
        | 'skill_casing' | 'duplicate_skill' | 'low_quantification'
        | 'orphan_metric' | 'short_bullet' | 'long_bullet'
        | 'unicode_glyph'
        // New leak categories surfaced by the audit harness.
        | 'dup_prep_phrase' | 'article_agreement'
        // Universal "metric verb without a number" — gerund clauses like
        // ", achieving water savings" / ", cutting lead time" stripped when
        // the clause carries no digit.
        | 'unquantified_metric_verb'
        // Detect-only: a role's bullets are all within ~5 words of each
        // other (population stddev < 3) — monotone visual rhythm. The
        // prompt asks for a mix of punchy/standard/narrative lengths.
        | 'bullet_rhythm_monotone';
    phrase: string;
    occurrences?: number;
    fieldLocation?: string;
    fixedBy?: 'substitution' | 'tense_flip' | 'jitter' | 'pursuing_strip' | 'duplicate_strip'
        | 'polish' | 'canonicalise' | 'dedupe' | 'none';
    contextSnippet?: string;
    /** AI provider whose output produced this leak — set by the caller after
     *  purifyCV returns. Lets telemetry attribute leaks to a specific engine. */
    aiEngine?: string;
}

export interface PurifyReport {
    repeatedPhrases: Array<{ phrase: string; count: number }>;
    roundNumberRatio: number;
    roundNumberFlagged: boolean;
    tenseIssues: string[];
    /** Telemetry — counts of fixes the pipeline applied. */
    bulletsTenseFlipped: number;
    metricsJittered: number;
    substitutionsMade: number;
    /** Phase 2 metrics. */
    polishFixes: number;                   // sum across all bullets
    polishFixesByType: Record<string, number>;
    skillsCanonicalised: number;
    skillsDeduped: number;
    quantificationRatio: number;           // 0–1 — fraction of bullets with a metric
    /** Per-event leak records suitable for posting to the telemetry endpoint. */
    leaks: PurifyLeak[];
}

/**
 * The Hot Fire pipeline. Every CV that comes back from any AI generation path
 * passes through this exactly once. Returns the cleaned CV plus a report of
 * what was detected (callers can ignore the report — it's for logging).
 *
 * Note: this function does NOT call any AI. It runs the deterministic regex
 * substitutions plus the diagnostic checks. The expensive AI passes
 * (validator, humanizer audit) remain in geminiService.ts — they're called
 * before this function so their output also gets purified.
 */
export function purifyCV(cv: CVData): { cv: CVData; report: PurifyReport } {
    const emptyReport: PurifyReport = {
        repeatedPhrases: [], roundNumberRatio: 0, roundNumberFlagged: false,
        tenseIssues: [], bulletsTenseFlipped: 0, metricsJittered: 0,
        substitutionsMade: 0,
        polishFixes: 0, polishFixesByType: {}, skillsCanonicalised: 0,
        skillsDeduped: 0, quantificationRatio: 1,
        leaks: [],
    };
    if (!cv) return { cv, report: emptyReport };

    const leaks: PurifyLeak[] = [];
    let substitutionsMade = 0;

    // Step 1 — substitution pass on every text field. We use the lower-level
    // helper so we can capture per-field change diagnostics for telemetry.
    const subTrack = (text: string, fieldLocation: string): string => {
        if (!text) return text || '';
        const { cleaned, changes } = cleanImportedText(text);
        if (changes.length) {
            substitutionsMade += changes.length;
            for (const c of changes) {
                const phrase = c.split(' → ')[0] || c;
                leaks.push({
                    leakType: c === 'removed duplicate adjacent words' ? 'duplicate_word' : 'banned_phrase',
                    phrase,
                    fieldLocation,
                    fixedBy: c === 'removed duplicate adjacent words' ? 'duplicate_strip' : 'substitution',
                    contextSnippet: text.slice(0, 200),
                });
            }
        }
        return cleaned;
    };

    const cleanedEducation = (cv.education || []).map((e, idx) => {
        const sub = subTrack(e.description || '', `education[${idx}].description`);
        const stripped = stripPursuingForCompletedDegree(sub, e.year);
        if (stripped !== sub) {
            leaks.push({
                leakType: 'pursuing_phrase',
                phrase: 'currently pursuing (or variant)',
                fieldLocation: `education[${idx}].description`,
                fixedBy: 'pursuing_strip',
                contextSnippet: sub.slice(0, 200),
            });
        }
        return { ...e, description: stripped };
    });

    const cleaned: CVData = {
        ...cv,
        summary: subTrack(cv.summary || '', 'summary'),
        skills: (cv.skills || []).map((s, i) => subTrack(s, `skills[${i}]`)),
        experience: (cv.experience || []).map((e, i) => ({
            ...e,
            responsibilities: (e.responsibilities || []).map((b, j) =>
                subTrack(b, `experience[${i}].responsibilities[${j}]`)),
        })),
        education: cleanedEducation,
        projects: (cv.projects || []).map((p, i) => ({
            ...p,
            description: subTrack(p.description || '', `projects[${i}].description`),
        })),
    };

    // Step 2 — TENSE ENFORCEMENT (deterministic).
    const tensePass = enforceTenseConsistency(cleaned);
    let working = tensePass.cv;
    const bulletsTenseFlipped = tensePass.changes.length;
    if (bulletsTenseFlipped) {
        console.warn(`[Purify] Tense enforcer flipped ${bulletsTenseFlipped} bullet(s):`,
            tensePass.changes.slice(0, 5).join(' | '));
        for (const c of tensePass.changes) {
            leaks.push({
                leakType: 'tense_mismatch',
                phrase: c.split(': ').slice(1).join(': ').slice(0, 200) || c,
                fieldLocation: c.split(']')[0].replace('[', '') || 'experience',
                fixedBy: 'tense_flip',
                contextSnippet: c.slice(0, 300),
            });
        }
    }

    // Step 3 — ROUND-NUMBER SATURATION CHECK (flag-only, no longer mutates).
    //
    // We previously ran `jitterRoundNumbers` here to silently rewrite round
    // metrics (50% → 52%, 1000 → 1051) so the CV didn't read as obvious AI
    // output. The audit harness exposed the cost: when a user genuinely
    // achieved exactly 100%, jitter rewrote it to 96% — a destructive lie.
    // We can't tell synthetic round numbers from real ones, so we now emit a
    // single round_number leak record and let the AI provider pass handle
    // de-rounding on its next regeneration. The mutating helper still exists
    // (callers can opt in explicitly) but the orchestrator no longer touches
    // user metrics.
    const metricsJittered = 0;
    const roundCheck = detectRoundNumberSaturation(working);
    if (roundCheck.flagged) {
        console.warn(`[Purify] Round-number saturation ${(roundCheck.ratio * 100).toFixed(0)}% — flagged (no auto-jitter).`);
        leaks.push({
            leakType: 'round_number',
            phrase: `${(roundCheck.ratio * 100).toFixed(0)}% of metrics are round`,
            fixedBy: 'none',
            contextSnippet: `Saturation ratio ${roundCheck.ratio.toFixed(2)} (>0.60 threshold).`,
        });
    }

    // Step 4 — PHASE-2 POLISH PASS. Runs the per-bullet polish on every
    // free-text field and canonicalises skill casing + dedupes. Each fix is
    // recorded as a leak so the dashboard surfaces patterns over time. Order:
    // polish runs AFTER tense + jitter so we don't re-capitalise something
    // those passes have already set up correctly.
    const polishCounts: Record<string, number> = {};
    let polishFixesTotal = 0;
    const recordPolish = (location: string, fixes: string[], snippet: string) => {
        for (const f of fixes) {
            polishCounts[f] = (polishCounts[f] || 0) + 1;
            polishFixesTotal++;
            // Map polish-fix names → telemetry leak types.
            const leakType: PurifyLeak['leakType'] =
                f === 'first_person'       ? 'first_person'       :
                f === 'weak_qualifier'     ? 'weak_qualifier'     :
                f === 'weak_opener'        ? 'weak_opener'        :
                f === 'weird_opener'       ? 'weird_opener'       :
                f === 'orphan_metric'      ? 'orphan_metric'      :
                f === 'unicode_glyph'      ? 'unicode_glyph'      :
                f === 'markup_strip'       ? 'markup_artifact'    :
                f === 'capitalise'         ? 'capitalisation'     :
                f === 'trailing_period'    ? 'trailing_period'    :
                f === 'number_format'      ? 'number_format'      :
                f === 'dup_prep_phrase'    ? 'dup_prep_phrase'    :
                f === 'article_agreement'  ? 'article_agreement'  :
                f === 'unquantified_metric_verb' ? 'unquantified_metric_verb' :
                /* whitespace_dashes */      'whitespace_dash';
            leaks.push({
                leakType, phrase: f,
                fieldLocation: location,
                fixedBy: 'polish',
                contextSnippet: snippet.slice(0, 200),
            });
        }
    };

    const polish = (text: string, location: string): string => {
        if (!text) return text || '';
        const r = polishBullet(text);
        if (r.fixes.length) recordPolish(location, r.fixes, text);
        return r.text;
    };

    // Summary uses a contraction-friendly polish — see polishSummary docstring.
    const polishSum = (text: string, location: string): string => {
        if (!text) return text || '';
        const r = polishSummary(text);
        if (r.fixes.length) recordPolish(location, r.fixes, text);
        return r.text;
    };

    working = {
        ...working,
        summary: polishSum(working.summary || '', 'summary'),
        experience: (working.experience || []).map((e, i) => ({
            ...e,
            responsibilities: (e.responsibilities || []).map((b, j) =>
                polish(b, `experience[${i}].responsibilities[${j}]`)),
        })),
        projects: (working.projects || []).map((p, i) => ({
            ...p, description: polish(p.description || '', `projects[${i}].description`),
        })),
        education: (working.education || []).map((ed, i) => ({
            ...ed, description: polish(ed.description || '', `education[${i}].description`),
        })),
    };

    // Step 5 — SKILL NORMALISATION. Canonical casing + case-insensitive dedupe.
    let skillsCanonicalised = 0;
    const canonical = (working.skills || []).map((s, i) => {
        const c = canonicaliseSkill(s);
        if (c !== s) {
            skillsCanonicalised++;
            leaks.push({
                leakType: 'skill_casing',
                phrase: `${s} → ${c}`,
                fieldLocation: `skills[${i}]`,
                fixedBy: 'canonicalise',
            });
        }
        return c;
    });
    const dedup = dedupeSkills(canonical);
    if (dedup.removed > 0) {
        leaks.push({
            leakType: 'duplicate_skill',
            phrase: `removed ${dedup.removed} duplicate skill(s)`,
            fieldLocation: 'skills',
            fixedBy: 'dedupe',
            occurrences: dedup.removed,
        });
    }
    working = { ...working, skills: dedup.skills };

    if (polishFixesTotal) {
        const top = Object.entries(polishCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([k, v]) => `${k}×${v}`).join(' ');
        console.warn(`[Purify] Phase-2 polish applied ${polishFixesTotal} fix(es): ${top}`);
    }

    // Step 6 — diagnostics on the FINAL CV (post-fix).
    const repeatedPhrases  = detectPhraseRepetition(working);
    const roundNumberFinal = detectRoundNumberSaturation(working);
    const tenseIssues      = detectTenseMismatch(working);
    const quantRatio       = quantificationRatio(working);

    if (repeatedPhrases.length) {
        console.warn(`[Purify] ${repeatedPhrases.length} repeated phrase(s) remain after fix:`,
            repeatedPhrases.map(r => `"${r.phrase}" ×${r.count}`).join('; '));
        for (const r of repeatedPhrases) {
            leaks.push({
                leakType: 'repeated_phrase',
                phrase: r.phrase,
                occurrences: r.count,
                fixedBy: 'none',
            });
        }
    }
    if (tenseIssues.length) {
        console.warn(`[Purify] Tense issues remain after fix: ${tenseIssues.join(' | ')}`);
    }
    // Detect-only: bullets with NO numbers are weaker. Recruiters reportedly
    // weight quantified bullets ~2× more. Flag a CV when <40% of bullets have
    // any digit at all — actual fix requires AI rewrite, which the caller can
    // schedule independently.
    if (quantRatio < 0.4) {
        console.warn(`[Purify] Low quantification ratio: ${(quantRatio * 100).toFixed(0)}% of bullets have a metric.`);
        leaks.push({
            leakType: 'low_quantification',
            phrase: `${(quantRatio * 100).toFixed(0)}% of bullets have any number`,
            fixedBy: 'none',
        });
    }

    // Detect-only: BULLET LENGTH RULES.
    //
    // Updated Apr 29 2026 — the prompt now allows DELIBERATE rhythm-mixing
    // within each role: a healthy role contains a mix of (a) short punchy
    // bullets (8–14 words), (b) standard bullets (15–22 words), and
    // (c) longer two-sentence narrative bullets (25–40 words). Variety
    // makes the experience section feel like prose rather than a uniform
    // bullet list — closer to how a human-written CV reads.
    //
    // We therefore flag only PATHOLOGICAL outliers:
    //   - short_bullet  : < 8 words (true stub, not a punchy bullet)
    //   - long_bullet   : > 45 words (rambling, not a 2-sentence narrative)
    let shortBullets = 0;
    let longBullets = 0;
    (working.experience || []).forEach((e, i) => {
        (e.responsibilities || []).forEach((b, j) => {
            const words = (b || '').trim().split(/\s+/).filter(Boolean).length;
            if (words > 0 && words < 8) {
                shortBullets++;
                leaks.push({
                    leakType: 'short_bullet',
                    phrase: `${words}w: "${b.slice(0, 60)}…"`,
                    fieldLocation: `experience[${i}].responsibilities[${j}]`,
                    fixedBy: 'none',
                });
            } else if (words > 45) {
                longBullets++;
                leaks.push({
                    leakType: 'long_bullet',
                    phrase: `${words}w: "${b.slice(0, 60)}…"`,
                    fieldLocation: `experience[${i}].responsibilities[${j}]`,
                    fixedBy: 'none',
                });
            }
        });
    });
    if (shortBullets > 0) {
        console.warn(`[Purify] ${shortBullets} bullet(s) under 8 words — too thin even as a punchy bullet.`);
    }
    if (longBullets > 0) {
        console.warn(`[Purify] ${longBullets} bullet(s) over 45 words — rambling beyond a 2-sentence narrative.`);
    }

    // Detect-only: BULLET RHYTHM MONOTONY. Within a single role with ≥3
    // bullets, if every bullet is within ~5 words of the role's average
    // (population stddev < 3), the role reads as monotone — same visual
    // mass on every line, no breath for the eye. The prompt asks the AI
    // to MIX punchy/standard/narrative bullets; this flag catches roles
    // where the AI ignored the mix-rhythm rule.
    //
    // Detect-only — no auto-fix. The UI / next AI pass can rewrite a few
    // bullets to break the monotony. We don't auto-edit because the right
    // fix depends on which bullets carry the strongest content.
    let monotoneRoles = 0;
    (working.experience || []).forEach((e, i) => {
        const lens = (e.responsibilities || [])
            .map(b => (b || '').trim().split(/\s+/).filter(Boolean).length)
            .filter(n => n > 0);
        if (lens.length < 3) return;
        const mean = lens.reduce((s, n) => s + n, 0) / lens.length;
        const variance = lens.reduce((s, n) => s + (n - mean) * (n - mean), 0) / lens.length;
        const stddev = Math.sqrt(variance);
        if (stddev < 3) {
            monotoneRoles++;
            leaks.push({
                leakType: 'bullet_rhythm_monotone',
                phrase: `role[${i}] (${e.company || '?'}): ${lens.length} bullets, mean ${mean.toFixed(0)}w, stddev ${stddev.toFixed(1)}`,
                fieldLocation: `experience[${i}].responsibilities`,
                fixedBy: 'none',
            });
        }
    });
    if (monotoneRoles > 0) {
        console.warn(`[Purify] ${monotoneRoles} role(s) have monotone bullet rhythm — mix punchy/standard/narrative bullet lengths.`);
    }

    return {
        cv: working,
        report: {
            repeatedPhrases,
            roundNumberRatio: roundNumberFinal.ratio,
            roundNumberFlagged: roundNumberFinal.flagged,
            tenseIssues,
            bulletsTenseFlipped,
            metricsJittered,
            substitutionsMade,
            polishFixes: polishFixesTotal,
            polishFixesByType: polishCounts,
            skillsCanonicalised,
            skillsDeduped: dedup.removed,
            quantificationRatio: quantRatio,
            leaks,
        },
    };
}

/**
 * Snippet-purifier — for AI calls that return free text rather than CVData
 * (e.g. summary enhancement, responsibility rewrite). Runs the substitution
 * pass only.
 */
export function purifyText(text: string): string {
    return cleanImportedText(text || '').cleaned;
}

/**
 * INBOUND profile purifier — runs on the user's profile BEFORE it is fed to
 * any AI prompt. Two reasons this matters:
 *   1. If banned phrases sit in the source data, the LLM pattern-matches them
 *      and mirrors the same AI-flavoured style in its output (priming effect).
 *      Even though `purifyCV` cleans the OUTPUT, removing them on the way IN
 *      gives the model cleaner anchors to paraphrase from.
 *   2. Manual entry isn't covered by the import scrubber — a user typing
 *      "spearheaded" directly into the form would otherwise leak straight
 *      through.
 *
 * Idempotent. Safe to call on every regenerate/optimize/improve invocation.
 */
export function purifyProfile(profile: UserProfile): UserProfile {
    if (!profile) return profile;
    const sub = (s: string) => cleanImportedText(s || '').cleaned;
    return {
        ...profile,
        summary: sub(profile.summary || ''),
        skills: (profile.skills || []).map(sub),
        workExperience: (profile.workExperience || []).map(e => ({
            ...e,
            responsibilities: sub(e.responsibilities || ''),
        })),
        education: (profile.education || []).map(e => ({ ...e })),
        projects: (profile.projects || []).map(p => ({
            ...p,
            description: sub(p.description || ''),
        })),
    };
}

/**
 * INBOUND CVData purifier — same idea as purifyProfile, but for endpoints
 * that accept an already-built CVData (improveCV, optimizeCVForJob). Cleans
 * the input before it is serialized into the prompt so the AI never sees a
 * banned phrase to begin with.
 */
export function purifyInboundCV(cv: CVData): CVData {
    if (!cv) return cv;
    return purifyCV(cv).cv;
}
