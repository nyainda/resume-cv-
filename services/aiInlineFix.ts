/**
 * services/aiInlineFix.ts
 *
 * Targeted AI repair for individual CV quality issues. Instead of regenerating
 * a whole section (which costs tokens, drifts away from the user's wording, and
 * can change facts), we send only the offending snippet plus the issue kind to
 * the LLM and ask for the smallest possible rewrite that resolves it.
 *
 * Two pure helpers are exported:
 *
 *   1. `fixCvIssueWithAi(originalText, issueKind, contextHint?)` — calls
 *      `groqChat` (which walks the full Workers-AI → Groq → Cerebras → … chain)
 *      with a tight system prompt and returns the corrected text.
 *
 *   2. `applyFixToCv(cv, where, fixedText)` — parses an audit `where` path
 *      string (e.g. `summary` or `experience[2] Engineer @ Acme#3`) and writes
 *      the corrected text back into a *cloned* CV object. Never mutates the
 *      input. Returns the new CV, or the original CV unchanged if the path
 *      can't be resolved.
 *
 * The two are deliberately separate so the panel UI can preview the rewrite
 * before committing it (and so unit tests can stub the AI call).
 */

import { groqChat } from './groqService';
import { CvQualityIssueKind } from './cvNumberFidelity';
import { CVData } from '../types';

/**
 * Human-readable description of each issue kind, used both in the system
 * prompt and in the UI panel. Keep the wording terse and instructive — the
 * LLM follows it directly.
 */
export const ISSUE_KIND_INSTRUCTIONS: Record<CvQualityIssueKind, string> = {
    orphan_currency_comma:
        'A currency code is followed by a stray comma instead of a number. ' +
        'Either restore the missing number (only if the user clearly knows it) ' +
        'or remove the currency reference entirely. Never invent figures.',
    orphan_currency_word:
        'A preposition is followed by a currency code with no amount after it ' +
        '(e.g. "of KES" with nothing more). Remove the dangling currency phrase ' +
        'cleanly without inventing a number.',
    orphan_percent:
        'A "%" symbol appears without a number in front of it. Remove the stray ' +
        '"%" and the surrounding scaffolding ("by %", "of %") so the sentence ' +
        'reads naturally. Do not invent a percentage.',
    orphan_plus:
        'A "+" sign is floating between words instead of after a number. Remove it.',
    orphan_hyphen_noun:
        'A hyphen + noun pattern appears where a number should be (e.g. ' +
        '"a -person team"). Remove the hyphen-noun phrase or the noun entirely. ' +
        'Do not invent a head-count.',
    orphan_dollar:
        'A "$" symbol is followed by a word instead of a number. Remove the "$" ' +
        'so the sentence reads naturally. Do not invent a dollar amount.',
    stub_bullet:
        'The bullet starts with a preposition (by, of, with, from, …) instead of ' +
        'a strong action verb in past tense. Rewrite it to lead with a verb such ' +
        'as Led / Built / Delivered / Improved / Designed — without inventing facts.',
    empty_bullet:
        'The bullet is empty. Replace it with the word "(removed)" so the caller ' +
        'can drop it from the list.',
    duplicate_adjacent_word:
        'Two identical words appear back-to-back. Delete the duplicate.',
    mid_sentence_period:
        'A period is followed by a lowercase word, suggesting a stray period in ' +
        'the middle of a sentence. Remove the misplaced period.',
    first_person_pronoun:
        'First-person voice ("I", "I\'ve", "my", "we", "our") is not allowed in ' +
        'a CV. Rewrite in third-person impersonal voice or as a strong past-tense ' +
        'imperative bullet. Do not add new facts.',
    tense_third_person_singular:
        'A current-role bullet uses third-person singular present tense ' +
        '("Generates", "Delivers", "Maintains"). Rewrite as a present-tense ' +
        'imperative ("Generate", "Deliver", "Maintain") so it matches CV voice.',
    dangling_time_ref:
        'A time reference like "with years" or "of months experience" lost its ' +
        'number. Either restore the duration only if the user clearly knows it, ' +
        'or remove the dangling phrase entirely. Do not invent a duration.',
};

const SYSTEM_PROMPT = `You are a precision CV editor. The user will give you ONE
short resume snippet and ONE issue to fix. Your job:

1. Make the smallest possible edit that resolves the issue.
2. Preserve every number, date, currency amount, and proper noun exactly as
   written. Never invent metrics, durations, percentages, or company facts.
3. Keep the user's original wording, tone, and skill terms wherever possible.
4. Never add a preamble, explanation, quotation marks, or trailing punctuation
   beyond what the snippet originally had.
5. Return ONLY the corrected snippet as plain text. No markdown, no labels.

If the snippet is already correct after your edit, that's fine — return the
edited version. If the snippet cannot be fixed without inventing facts, return
the literal string "(remove)" so the caller can drop it.`.trim();

/**
 * Ask the LLM to rewrite a single CV snippet so the given quality issue is
 * resolved. The fallback chain in `groqChat` decides which provider to use.
 *
 * Returns the corrected text, trimmed. Throws (with `isUserFacing: true` in
 * most cases) when every provider in the chain has failed — the caller is
 * expected to surface that to the user.
 */
export async function fixCvIssueWithAi(
    originalText: string,
    issueKind: CvQualityIssueKind,
    contextHint?: string,
): Promise<string> {
    const cleanInput = String(originalText ?? '').trim();
    if (!cleanInput) return '';

    const instruction = ISSUE_KIND_INSTRUCTIONS[issueKind] ?? `Fix the "${issueKind}" issue.`;
    const userPrompt = [
        `ISSUE TO FIX: ${issueKind}`,
        `INSTRUCTION: ${instruction}`,
        contextHint ? `CONTEXT: ${contextHint}` : null,
        '',
        'SNIPPET:',
        cleanInput,
        '',
        'Return only the corrected snippet.',
    ].filter(Boolean).join('\n');

    // Lowest reasonable temperature — we want a precise edit, not creativity.
    // No JSON mode: the response is plain text.
    const raw = await groqChat(
        // Model id is a label only — `groqChat` maps it onto the chosen provider.
        'llama-3.1-8b-instant',
        SYSTEM_PROMPT,
        userPrompt,
        { temperature: 0.1, maxTokens: 320 },
    );

    return _sanitizeAiOutput(raw, cleanInput);
}

/**
 * Strip wrapping quotes / leading "Corrected:" labels / trailing period drift
 * that small models occasionally emit. Falls back to the original text when
 * the model returned an empty or obviously-broken response.
 */
function _sanitizeAiOutput(raw: string, fallback: string): string {
    if (!raw) return fallback;
    let out = String(raw).trim();
    // Strip a single pair of wrapping quotes (straight or curly).
    out = out.replace(/^[\s`"'“”‘’]+|[\s`"'“”‘’]+$/g, '').trim();
    // Strip "Corrected:" / "Rewrite:" / "Fixed:" prefixes some models add.
    out = out.replace(/^(?:corrected|rewrite|rewritten|fixed|edit|edited)\s*:\s*/i, '').trim();
    // Strip a leading bullet character ("•", "-", "*", "·").
    out = out.replace(/^[•\-*·»]\s+/, '').trim();
    if (!out) return fallback;
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// applyFixToCv — write the corrected text back into a cloned CV object
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsed `where` path. The audit emits one of three shapes:
 *   - "summary"
 *   - "experience[N] <jobTitle> @ <company>#M"   (M is a bullet index)
 *   - "projects[N] <projectName>"
 */
export type ParsedAuditPath =
    | { kind: 'summary' }
    | { kind: 'experience_bullet'; roleIndex: number; bulletIndex: number }
    | { kind: 'project_description'; projectIndex: number }
    | { kind: 'unknown' };

const RX_EXPERIENCE = /^experience\[(\d+)\][^#]*#(\d+)$/;
const RX_PROJECT    = /^projects\[(\d+)\]/;

export function parseAuditPath(where: string): ParsedAuditPath {
    const w = String(where ?? '').trim();
    if (w === 'summary') return { kind: 'summary' };
    const exp = RX_EXPERIENCE.exec(w);
    if (exp) {
        return {
            kind: 'experience_bullet',
            roleIndex: Number(exp[1]),
            bulletIndex: Number(exp[2]),
        };
    }
    const proj = RX_PROJECT.exec(w);
    if (proj) {
        return { kind: 'project_description', projectIndex: Number(proj[1]) };
    }
    return { kind: 'unknown' };
}

/**
 * Returns a *new* CV object with the fix applied at the given path. If the
 * path is unrecognised the original CV is returned unchanged. If the AI
 * returned the special token "(remove)" or "(removed)", the bullet (or the
 * whole field) is cleared / dropped.
 */
export function applyFixToCv(
    cv: CVData,
    where: string,
    fixedText: string,
): CVData {
    const path = parseAuditPath(where);
    if (path.kind === 'unknown') return cv;

    const trimmed = String(fixedText ?? '').trim();
    const isRemoval = /^\(remove[d]?\)$/i.test(trimmed);

    // Shallow clone what we need — we never mutate the input.
    const next: CVData = { ...cv };

    if (path.kind === 'summary') {
        next.summary = isRemoval ? '' : trimmed;
        return next;
    }

    if (path.kind === 'experience_bullet') {
        const exp = Array.isArray(cv.experience) ? cv.experience.slice() : [];
        const role = exp[path.roleIndex];
        if (!role) return cv;
        const bullets = Array.isArray(role.responsibilities)
            ? role.responsibilities.slice()
            : [];
        if (path.bulletIndex < 0 || path.bulletIndex >= bullets.length) return cv;
        if (isRemoval) {
            bullets.splice(path.bulletIndex, 1);
        } else {
            bullets[path.bulletIndex] = trimmed;
        }
        exp[path.roleIndex] = { ...role, responsibilities: bullets };
        next.experience = exp;
        return next;
    }

    if (path.kind === 'project_description') {
        const projects = Array.isArray((cv as any).projects)
            ? (cv as any).projects.slice()
            : [];
        const project = projects[path.projectIndex];
        if (!project) return cv;
        projects[path.projectIndex] = {
            ...project,
            description: isRemoval ? '' : trimmed,
        };
        (next as any).projects = projects;
        return next;
    }

    return cv;
}

/**
 * Pull the original snippet out of a CV at the given path. Used by the panel
 * UI to (a) show "before" text next to the issue, and (b) hand the precise
 * source string to `fixCvIssueWithAi` instead of relying on the snippet from
 * the audit (which is truncated to ~80 chars).
 */
export function getOriginalTextAt(cv: CVData, where: string): string {
    const path = parseAuditPath(where);
    if (path.kind === 'summary') return String(cv.summary ?? '');
    if (path.kind === 'experience_bullet') {
        const role = cv.experience?.[path.roleIndex];
        const b = role?.responsibilities?.[path.bulletIndex];
        return String(b ?? '');
    }
    if (path.kind === 'project_description') {
        const p = (cv as any).projects?.[path.projectIndex];
        return String(p?.description ?? '');
    }
    return '';
}
