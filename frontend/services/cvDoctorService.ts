/**
 * cvDoctorService.ts
 *
 * Three capabilities:
 *  1. classifyBullets()     — Instant, zero-AI deterministic scan of every
 *                             bullet in the CV. Labels each with the primary
 *                             issue type and severity. Used for the colour-coded
 *                             Bullet Inspector tab in CVDoctorPanel.
 *
 *  2. scanCVForDoctor()     — One fast AI call that returns three lists:
 *                             things to ADD, things to REMOVE, quick wins.
 *
 *  3. rewriteBulletOptions()— On-demand AI call that returns 3 alternative
 *                             rewrites for a single bullet. Only fires when
 *                             the user clicks on a bullet to expand it.
 *
 *  4. diffCV()              — Pure function that compares two CVData snapshots
 *                             and returns what changed (for the diff panel).
 */

import { CVData } from '../types';
import { groqChat } from './groqService';

// ─── Constants ────────────────────────────────────────────────────────────────

const FAST_MODEL  = 'llama-3.1-8b-instant';
const SYSTEM_JSON = 'You are a professional CV consultant. Return ONLY valid JSON with no markdown fences or prose.';

// ─── JSON repair utility ──────────────────────────────────────────────────────
/**
 * Attempts to repair truncated JSON — the most common failure when the AI hits
 * a token limit mid-string.  Closes any open strings, strips dangling commas /
 * colons, then closes unclosed arrays and objects so JSON.parse() can succeed
 * on partial output.
 */
function repairJson(raw: string): string {
    const stack: string[] = [];
    let inStr = false;
    let esc   = false;

    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (esc)        { esc = false; continue; }
        if (c === '\\') { esc = true;  continue; }
        if (c === '"')  { inStr = !inStr; continue; }
        if (inStr)      { continue; }
        if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
        else if ((c === '}' || c === ']') && stack.length) stack.pop();
    }

    let out = raw.trimEnd();
    // Strip a trailing incomplete key (e.g. `,"toRemo` cut off mid-key)
    out = out.replace(/,\s*"[^"]*$/, '');
    // Strip trailing comma or colon that precedes a missing value
    out = out.replace(/[,:\s]+$/, '');
    // Close an unterminated string value
    if (inStr) out += '"';
    // Close remaining open structures (reverse order)
    out += stack.reverse().join('');
    return out;
}

/**
 * Parse JSON, automatically attempting a repair if the first parse fails.
 * Throws only if both attempts fail.
 */
function safeParseJson(raw: string): unknown {
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try {
        return JSON.parse(stripped);
    } catch {
        return JSON.parse(repairJson(stripped));
    }
}

const AI_VERB_SET = new Set([
    'spearheaded','leveraged','orchestrated','catalyzed','utilized','facilitated',
    'ideated','conceptualized','operationalized','solutioned','materialized',
    'actioned','synergized','galvanized','pioneered','revolutionized','transformed',
    'evangelized','strategized','architected','incubated','co-created',
]);

const WEAK_VERB_SET = new Set([
    'helped','assisted','worked','was','were','is','participated','involved',
    'contributed','supported','provided','maintained','used','did','made',
    'had','got','responsible','tasked','engaged',
]);

// Detection regexes for the expanded check set
const PRONOUN_RX          = /\b(I|I've|I'd|I'm|I'll|my|we|we've|we're|we'd|our)\b/i;
const PASSIVE_RX          = /\b(?:was|were)\s+(?:\w+ed|\w+en|built|run|done|made|led|won|kept|grown|shown|given|taken|sent|left|put|set|brought|thought|taught|caught|cut|hurt|let|hit|fit)\b/i;
const PASSIVE_ROLE_RX     = /\b(?:responsible\s+for|tasked\s+with|in\s+charge\s+of|assigned\s+to)\b/i;
const ENSURING_RX         = /\bensuring\b/i;
const BARE_METRIC_OPEN_RX = /^[\d$£€¥₦₹]/;
const DUPLICATE_WORD_RX   = /\b(\w{4,})\s+\1\b/i;

// ─── Types ────────────────────────────────────────────────────────────────────

export type BulletIssueType =
    | 'pronoun'
    | 'ai_language'
    | 'third_person'
    | 'passive_voice'
    | 'weak_verb'
    | 'ensuring_virus'
    | 'no_metric'
    | 'bare_metric_opener'
    | 'duplicate_word'
    | 'too_short'
    | 'too_long'
    | 'good';

export const ISSUE_META: Record<BulletIssueType, { label: string; tip: string; colour: string; border: string; badge: string }> = {
    pronoun:           { label: 'First person',      tip: 'Remove "I", "my", "we" or "our" — rewrite starting with a strong action verb.',                               colour: 'bg-red-50 dark:bg-red-950/30',      border: 'border-l-red-500',      badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
    ai_language:       { label: 'AI buzzword',        tip: 'Replace the buzzword (e.g. "spearheaded", "leveraged") with a direct, real verb.',                            colour: 'bg-red-50 dark:bg-red-950/30',      border: 'border-l-red-400',      badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    third_person:      { label: '3rd-person verb',    tip: 'Change to bare imperative form — "Manages" → "Manage".',                                                      colour: 'bg-red-50 dark:bg-red-950/30',      border: 'border-l-red-400',      badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    passive_voice:     { label: 'Passive voice',      tip: 'Rewrite in active voice — start with what you did, not what was done to you. e.g. "Built…" not "Was tasked with building…".', colour: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-l-orange-500',   badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
    weak_verb:         { label: 'Weak opener',        tip: 'Replace the weak verb with a specific, strong action verb.',                                                  colour: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-l-orange-400',   badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
    ensuring_virus:    { label: '"Ensuring" filler',  tip: 'Remove "ensuring" — state the outcome or action directly. e.g. "…ensuring quality" → "…improving quality by 30%".', colour: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-l-amber-500',    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    no_metric:         { label: 'No number',          tip: 'Add a specific number, %, or scale to quantify the impact.',                                                  colour: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-l-amber-400',    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    bare_metric_opener:{ label: 'Number-first',       tip: 'Move the number into the body — start with an action verb that frames the metric. e.g. "Grew revenue 40%…" not "40% revenue growth…".', colour: 'bg-yellow-50 dark:bg-yellow-950/30', border: 'border-l-yellow-400',   badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
    duplicate_word:    { label: 'Duplicate word',     tip: 'A word is repeated twice in a row — remove the extra one.',                                                   colour: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-l-purple-400',   badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
    too_short:         { label: 'Too short',          tip: 'Expand with scope, method, or result detail (aim for 12–25 words).',                                          colour: 'bg-blue-50 dark:bg-blue-950/30',    border: 'border-l-blue-400',     badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    too_long:          { label: 'Too long',           tip: 'Trim to under 30 words — keep only the core verb, scope, and result.',                                        colour: 'bg-blue-50 dark:bg-blue-950/30',    border: 'border-l-blue-400',     badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    good:              { label: 'Good',               tip: 'This bullet looks strong.',                                                                                   colour: 'bg-green-50 dark:bg-green-950/20',  border: 'border-l-green-400',    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
};

export interface BulletAnnotation {
    roleIndex:    number;
    bulletIndex:  number;
    text:         string;
    issues:       BulletIssueType[];
    primaryIssue: BulletIssueType;
}

export interface CVDoctorScan {
    toAdd:      string[];
    toRemove:   string[];
    quickWins:  string[];
}

export interface CVDiff {
    changedBullets: { roleIndex: number; roleName: string; bulletIndex: number; before: string; after: string }[];
    addedDates:     { roleIndex: number; roleName: string; dates: string }[];
    fixedSummary:   boolean;
    totalChanges:   number;
}

// ─── 1. Deterministic bullet classifier ──────────────────────────────────────

export function classifyBullets(cvData: CVData): BulletAnnotation[] {
    const out: BulletAnnotation[] = [];

    cvData.experience.forEach((role, rIdx) => {
        (role.responsibilities || []).forEach((bullet, bIdx) => {
            const text  = bullet.trim();
            const words = text.split(/\s+/).filter(Boolean);
            const first = words[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
            const issues: BulletIssueType[] = [];

            // ── Critical: first-person pronouns ───────────────────────────
            if (PRONOUN_RX.test(text)) issues.push('pronoun');

            // ── Critical: AI buzzwords / 3rd-person verb ───────────────────
            if (AI_VERB_SET.has(first) || /\b(spearheaded|leveraged|orchestrated|utilized|facilitated|synergized|catalyzed|galvanized)\b/i.test(text)) {
                issues.push('ai_language');
            } else if (/^[A-Z][a-z]{2,}[^s]s\s/.test(text)) {
                issues.push('third_person');
            }

            // ── High: passive voice ────────────────────────────────────────
            if (PASSIVE_RX.test(text) || PASSIVE_ROLE_RX.test(text)) issues.push('passive_voice');

            // ── High: weak opener ──────────────────────────────────────────
            if (WEAK_VERB_SET.has(first)) issues.push('weak_verb');

            // ── Medium: "ensuring" filler word ────────────────────────────
            if (ENSURING_RX.test(text)) issues.push('ensuring_virus');

            // ── Medium: no metric ──────────────────────────────────────────
            if (!/\d/.test(text)) issues.push('no_metric');

            // ── Stylistic: bare metric opener ──────────────────────────────
            if (BARE_METRIC_OPEN_RX.test(text)) issues.push('bare_metric_opener');

            // ── Grammar: duplicate adjacent word ──────────────────────────
            if (DUPLICATE_WORD_RX.test(text)) issues.push('duplicate_word');

            // ── Length ─────────────────────────────────────────────────────
            if (words.length < 7)       issues.push('too_short');
            else if (words.length > 35) issues.push('too_long');

            const primaryIssue: BulletIssueType =
                issues.find(i => i === 'pronoun') ??
                issues.find(i => i === 'ai_language' || i === 'third_person') ??
                issues.find(i => i === 'passive_voice') ??
                issues.find(i => i === 'weak_verb') ??
                issues.find(i => i === 'ensuring_virus') ??
                issues.find(i => i === 'no_metric') ??
                issues.find(i => i === 'bare_metric_opener') ??
                issues.find(i => i === 'duplicate_word') ??
                issues.find(i => i === 'too_short' || i === 'too_long') ??
                'good';

            out.push({ roleIndex: rIdx, bulletIndex: bIdx, text, issues, primaryIssue });
        });
    });

    return out;
}

// ─── 2. AI scan (add / remove / quick wins) ───────────────────────────────────

export async function scanCVForDoctor(cvData: CVData, jobDescription?: string): Promise<CVDoctorScan> {
    const roles     = cvData.experience.map(e => `${e.jobTitle} at ${e.company} (${e.dates || 'no dates'})`).join('; ');
    const skillList = (cvData.skills || []).slice(0, 20).join(', ');

    const prompt = `You are a senior CV consultant doing a quick diagnostic review.

CV SNAPSHOT:
Roles: ${roles || 'none'}
Skills: ${skillList || 'none'}
Education: ${cvData.education?.map(e => `${e.degree} ${e.school} ${e.year}`).join('; ') || 'none'}
Has LinkedIn: ${cvData.personalInfo?.linkedin ? 'yes' : 'no'}
Has GitHub: ${cvData.personalInfo?.github ? 'yes' : 'no'}
Has projects section: ${(cvData.projects || []).length > 0 ? `yes (${cvData.projects!.length})` : 'no'}
${jobDescription ? `\nTARGET ROLE:\n${jobDescription.substring(0, 500)}` : ''}

Return ONLY this JSON (no markdown, no prose):
{
  "toAdd": ["up to 5 specific things MISSING that would strengthen this CV — be concrete, e.g. 'Add LinkedIn URL to contact header', 'Add a Projects section showcasing 2–3 technical builds', 'Quantify the scope of the intern role at CompanyX'"],
  "toRemove": ["up to 4 specific things that WEAKEN or CLUTTER the CV — be direct, e.g. 'Remove Microsoft Word from skills — too basic for a senior role', 'Cut the References section — wastes space, add on request'"],
  "quickWins": ["up to 4 one-sentence improvements with IMMEDIATE impact — e.g. 'Start the Summary with a number: years of experience or client count', 'Add a scope anchor to the first bullet of every role (team size, budget, or region)'"]
}`;

    const text = await groqChat(FAST_MODEL, SYSTEM_JSON, prompt, { temperature: 0.3, json: true, maxTokens: 1200 });
    const parsed = safeParseJson(text) as Record<string, unknown>;
    const clean = (arr: unknown): string[] =>
        Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string').slice(0, 5) : [];
    return {
        toAdd:     clean(parsed.toAdd),
        toRemove:  clean(parsed.toRemove),
        quickWins: clean(parsed.quickWins),
    };
}

// ─── 3. On-demand bullet rewrites ─────────────────────────────────────────────

export async function rewriteBulletOptions(
    bullet:       string,
    role:         { jobTitle: string; company: string; endDate?: string },
    issues:       BulletIssueType[],
    jobDescription?: string,
): Promise<string[]> {
    const isCurrentRole = role.endDate === 'Present' || !role.endDate;
    const tense = isCurrentRole ? 'present tense (bare imperative, e.g. "Manage", "Lead")' : 'past tense (e.g. "Managed", "Led")';

    const taskDesc =
        issues.includes('pronoun')             ? 'Remove the first-person pronoun (I, my, we, our) and rewrite starting with a strong action verb.' :
        issues.includes('ai_language')         ? 'Replace the AI/corporate buzzword with a direct, real verb. Keep the same achievement.' :
        issues.includes('third_person')        ? 'Change the verb from 3rd-person ("Manages") to bare imperative ("Manage").' :
        issues.includes('passive_voice')       ? 'Convert from passive voice to active voice — start with a strong action verb showing what you did.' :
        issues.includes('weak_verb')           ? 'Replace the weak opener with a specific, strong action verb.' :
        issues.includes('ensuring_virus')      ? 'Remove "ensuring" — state the outcome or action directly using a concrete verb.' :
        issues.includes('no_metric')           ? 'Add a specific number, percentage, or scale — if no exact figure exists, use a reasonable approximation (e.g. "~12 clients", "3+ regions").' :
        issues.includes('bare_metric_opener')  ? 'Restructure so a strong action verb comes first, then use the number as supporting evidence.' :
        issues.includes('duplicate_word')      ? 'Fix the repeated word and improve the overall clarity of the sentence.' :
        issues.includes('too_short')           ? 'Expand with more specific detail about the scope, method, or measurable result. Aim for 15–25 words.' :
        issues.includes('too_long')            ? 'Trim to under 28 words. Remove filler; keep the verb, scope, and result.' :
        'Improve the clarity and professional impact of this bullet.';

    const prompt = `You are a professional CV writer. Rewrite the bullet below in 3 different ways.

BULLET: "${bullet}"
ROLE: ${role.jobTitle} at ${role.company}
TASK: ${taskDesc}
TENSE: Use ${tense}.
${jobDescription ? `TARGETING JOB: ${jobDescription.substring(0, 300)}` : ''}

RULES:
- Keep the same underlying fact or achievement — do NOT invent new metrics
- Each rewrite must have a different opening structure
- Plain, direct language — no buzzwords like "spearheaded", "leveraged", "orchestrated"
- No bullet character, no quotation marks around the output

Return ONLY a JSON array of exactly 3 strings:
["rewrite one", "rewrite two", "rewrite three"]`;

    const text = await groqChat(FAST_MODEL, SYSTEM_JSON, prompt, { temperature: 0.65, json: true, maxTokens: 600 });
    const arr = safeParseJson(text);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s: unknown): s is string => typeof s === 'string').slice(0, 3);
}

// ─── 4. Batch rewrite all flagged bullets ─────────────────────────────────────

export interface BatchRewriteEntry {
    roleIndex:   number;
    bulletIndex: number;
    newText:     string;
}

export interface BatchRewriteResult {
    applied:     BatchRewriteEntry[];
    failedCount: number;
}

/**
 * Sends up to BATCH_CAP flagged bullets in a single prompt and returns one
 * fixed version for each.  Higher-severity issues (ai_language, third_person,
 * weak_verb) are prioritised when the list is capped.
 */
const BATCH_CAP = 20;

const ISSUE_PRIORITY: Record<BulletIssueType, number> = {
    pronoun: 0, ai_language: 1, third_person: 2,
    passive_voice: 3, weak_verb: 4, ensuring_virus: 5,
    no_metric: 6, bare_metric_opener: 7, duplicate_word: 8,
    too_short: 9, too_long: 10, good: 99,
};

export async function rewriteAllFlaggedBullets(
    annotations: BulletAnnotation[],
    cv: CVData,
    jobDescription?: string,
): Promise<BatchRewriteResult> {
    const flagged = annotations
        .filter(a => a.primaryIssue !== 'good')
        .sort((a, b) => ISSUE_PRIORITY[a.primaryIssue] - ISSUE_PRIORITY[b.primaryIssue])
        .slice(0, BATCH_CAP);

    if (flagged.length === 0) return { applied: [], failedCount: 0 };

    const ISSUE_TASK: Record<BulletIssueType, string> = {
        pronoun:            'Remove the first-person pronoun (I, my, we, our) — rewrite starting with a strong action verb.',
        ai_language:        'Replace the corporate buzzword (e.g. "spearheaded", "leveraged") with a direct, real action verb.',
        third_person:       'Change the verb to bare imperative form — "Manages" → "Manage", "Generates" → "Generate".',
        passive_voice:      'Convert from passive voice ("was responsible for", "were tasked with") to active voice — start with an action verb.',
        weak_verb:          'Replace the weak opener with a strong, specific action verb.',
        ensuring_virus:     'Remove "ensuring" — state what was achieved or delivered directly using a concrete verb.',
        no_metric:          'Add a specific number, %, or scale. Use a reasonable estimate if no exact figure is available.',
        bare_metric_opener: 'Move the number into the body of the sentence — start with an action verb that frames the metric.',
        duplicate_word:     'Fix the repeated word and ensure the sentence reads naturally.',
        too_short:          'Expand with scope, method, or result detail. Aim for 15–25 words.',
        too_long:           'Trim to under 28 words — keep the verb, scope, and result; cut filler.',
        good:               'No change needed.',
    };

    const lines = flagged.map((ann, i) => {
        const role = cv.experience[ann.roleIndex];
        const isPresent = role?.endDate === 'Present' || !role?.endDate;
        return `[#${i}] ROLE: ${role?.jobTitle ?? ''} at ${role?.company ?? ''} | TENSE: ${isPresent ? 'present' : 'past'} | FIX: ${ISSUE_TASK[ann.primaryIssue]} | BULLET: "${ann.text}"`;
    });

    const prompt = `You are a professional CV writer. Fix each bullet below according to the FIX instruction.

${lines.join('\n')}
${jobDescription ? `\nTARGET ROLE (for context only):\n${jobDescription.substring(0, 400)}` : ''}

RULES:
- Keep the same underlying achievement — do NOT invent new facts or metrics
- Use the specified TENSE for each bullet
- No bullet characters, no quotation marks in output values
- Each output must be a single clean sentence

Return ONLY a JSON array of ${flagged.length} objects, one per input bullet, in the SAME ORDER:
[{"id": 0, "text": "fixed bullet here"}, {"id": 1, "text": "..."}, ...]`;

    // ~80 tokens per bullet is a safe budget for a fixed rewrite
    const maxTokens = Math.min(4000, Math.max(1200, flagged.length * 80));

    let rawArr: { id: number; text: string }[] = [];
    try {
        const text = await groqChat(FAST_MODEL, SYSTEM_JSON, prompt, { temperature: 0.5, json: true, maxTokens });
        rawArr = safeParseJson(text) as { id: number; text: string }[];
    } catch {
        return { applied: [], failedCount: flagged.length };
    }

    const applied: BatchRewriteEntry[] = [];
    let failedCount = 0;

    rawArr.forEach(item => {
        if (typeof item?.id !== 'number' || typeof item?.text !== 'string' || !item.text.trim()) {
            failedCount++;
            return;
        }
        const ann = flagged[item.id];
        if (!ann) { failedCount++; return; }
        applied.push({ roleIndex: ann.roleIndex, bulletIndex: ann.bulletIndex, newText: item.text.trim() });
    });

    return { applied, failedCount };
}

// ─── 5. Diff two CV snapshots ─────────────────────────────────────────────────

export function diffCV(before: CVData, after: CVData): CVDiff {
    const changedBullets: CVDiff['changedBullets'] = [];
    const addedDates:     CVDiff['addedDates']     = [];

    after.experience.forEach((roleAfter, rIdx) => {
        const roleBefore = before.experience[rIdx];
        if (!roleBefore) return;

        const roleName = `${roleAfter.jobTitle} at ${roleAfter.company}`;

        if (!roleBefore.dates && roleAfter.dates) {
            addedDates.push({ roleIndex: rIdx, roleName, dates: roleAfter.dates });
        }

        (roleAfter.responsibilities || []).forEach((bulletAfter, bIdx) => {
            const bulletBefore = (roleBefore.responsibilities || [])[bIdx] ?? '';
            if (bulletBefore.trim() !== bulletAfter.trim()) {
                changedBullets.push({ roleIndex: rIdx, roleName, bulletIndex: bIdx, before: bulletBefore, after: bulletAfter });
            }
        });
    });

    const fixedSummary = before.summary?.trim() !== after.summary?.trim();

    return {
        changedBullets,
        addedDates,
        fixedSummary,
        totalChanges: changedBullets.length + addedDates.length + (fixedSummary ? 1 : 0),
    };
}
