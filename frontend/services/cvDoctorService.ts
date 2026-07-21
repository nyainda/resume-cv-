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
import { getCachedBannedPhrases } from './cvEngineClient';
import { detectField } from './cvPromptHelpers';
import { purifiedCompletion } from './purifiedLLMGateway';

// ─── Constants ────────────────────────────────────────────────────────────────

const FAST_MODEL  = 'llama-3.1-8b-instant';
const SYSTEM_JSON = 'You are a professional CV consultant. Return ONLY valid JSON with no markdown fences or prose.';

// ─── Pipeline rules (injected at boot from loadRules in geminiService) ────────
// Same pattern as HUMANIZATION_RULES in geminiService.ts. Every LLM fix call
// in this file must include these so the Doctor uses the same rules as generation.
let _humanizationRules = '';

/**
 * Called by loadRules() in geminiService.ts after the Worker rules are fetched.
 * Ensures all Doctor LLM calls enforce the same writing standards as CV generation.
 */
export function setDoctorRules(humanizationRules: string): void {
    _humanizationRules = humanizationRules;
}

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
 * Last-resort: extract string arrays from a named key using regex.
 * Handles cases where JSON.parse and repairJson both fail (e.g. unescaped
 * quotes inside array values that the LLM didn't properly escape).
 */
function extractArrayByKey(raw: string, key: string): string[] {
    // Match "key": [ ... ] (greedy match up to closing bracket)
    const blockRx = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\](?:\\s*[,}]|$)`);
    const block = blockRx.exec(raw);
    if (!block) return [];
    const content = block[1];
    const items: string[] = [];
    // Extract every double-quoted string, handling escaped quotes
    const itemRx = /"((?:[^"\\]|\\.)*)"/g;
    let m: RegExpExecArray | null;
    while ((m = itemRx.exec(content)) !== null) {
        const s = m[1].replace(/\\"/g, '"').trim();
        if (s) items.push(s);
    }
    return items;
}

/**
 * Parse JSON, automatically attempting a repair if the first parse fails,
 * then a per-key regex extraction as a last resort.
 * Never throws — returns a best-effort object.
 */
function safeParseJson(raw: string, fallbackKeys?: string[]): unknown {
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try {
        return JSON.parse(stripped);
    } catch {
        try {
            return JSON.parse(repairJson(stripped));
        } catch {
            // Last resort: regex-extract each expected key as a string array
            if (fallbackKeys && fallbackKeys.length > 0) {
                const result: Record<string, string[]> = {};
                for (const key of fallbackKeys) {
                    result[key] = extractArrayByKey(stripped, key);
                }
                return result;
            }
            throw new Error('JSON parse failed after all repair attempts');
        }
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

// Present-tense base verbs commonly misused in past-role bullets
const PRESENT_VERB_SET = new Set([
    'manage','lead','build','drive','design','develop','create','deliver',
    'implement','deploy','run','coordinate','oversee','handle','support',
    'analyze','analyse','plan','execute','own','define','improve','grow','scale',
    'mentor','hire','train','present','write','review','maintain','work',
    'ensure','prepare','identify','provide','conduct','perform','collaborate',
    'communicate','research','produce','monitor','evaluate','report','operate',
    'establish','generate','document','launch','test','debug','migrate',
    'integrate','automate','optimize','architect','ship','release','publish',
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type BulletIssueType =
    | 'pronoun'
    | 'ai_language'
    | 'third_person'
    | 'passive_voice'
    | 'tense_mismatch'
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
    tense_mismatch:    { label: 'Wrong tense',         tip: 'Current-role bullets need present tense ("Manage…"), past-role bullets need past tense ("Managed…").',     colour: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-l-violet-500',   badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
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
    /** Set to true when the user applies a fix — persisted in the build report so the issue
     *  disappears on next open/refresh and syncs across devices. */
    resolved?:    boolean;
}

export interface CVDoctorScan {
    toAdd:           string[];
    toRemove:        string[];
    quickWins:       string[];
    noMetricCount:   number;     // deterministic count — bullets with no digit
    duplicateSkills: string[];   // similar/redundant skill pairs detected by AI
    summaryIssues:   string[];   // specific problems in the summary section
    suggestedSummary?: string;   // concrete AI-rewritten summary the user can apply
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

            // ── Tense mismatch ─────────────────────────────────────────────
            const isCurrentRole =
                !role.endDate ||
                role.endDate.trim() === '' ||
                /^(present|current|now|today)$/i.test(role.endDate.trim());
            if (isCurrentRole) {
                // Current role using past tense (-ed/-ied opener)
                if (/^[A-Z][a-z]{2,}(?:ied|eed|ed)\b/.test(text)) issues.push('tense_mismatch');
            } else {
                // Past role using present-tense base verb opener
                if (PRESENT_VERB_SET.has(first)) issues.push('tense_mismatch');
            }

            // ── Length ─────────────────────────────────────────────────────
            if (words.length < 7)       issues.push('too_short');
            else if (words.length > 35) issues.push('too_long');

            const primaryIssue: BulletIssueType =
                issues.find(i => i === 'pronoun') ??
                issues.find(i => i === 'ai_language' || i === 'third_person') ??
                issues.find(i => i === 'passive_voice') ??
                issues.find(i => i === 'tense_mismatch') ??
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
    // ── Deterministic metric coverage (no AI needed) ──────────────────────────
    const allAnnotations = classifyBullets(cvData);
    const noMetricCount  = allAnnotations.filter(a => a.issues.includes('no_metric')).length;
    const totalBullets   = allAnnotations.length;

    // ── Gather pipeline context in parallel ───────────────────────────────────
    const [bannedEntries] = await Promise.allSettled([getCachedBannedPhrases()]);
    const bannedPhrases = bannedEntries.status === 'fulfilled' && bannedEntries.value
        ? bannedEntries.value.slice(0, 20).map(b => b.phrase).join(', ')
        : 'spearheaded, leveraged, orchestrated, utilized, facilitated, synergized, responsible for, helped to, worked on, passionate about, dynamic, results-driven, detail-oriented, innovative';

    // ── Field detection using CV data as a synthetic profile signal ──
    const syntheticProfile = {
        workExperience: cvData.experience.map(e => ({
            jobTitle: e.jobTitle || '',
            company:  e.company  || '',
            responsibilities: (e.responsibilities || []).join(' '),
        })),
        skills: cvData.skills || [],
    } as any;
    const detectedField = detectField(jobDescription, syntheticProfile);

    // ── Build a bullet snapshot: role header + first 4 bullets each ──
    const bulletSnapshot = cvData.experience.map(role => {
        const bullets = (role.responsibilities || []).slice(0, 4);
        const header  = `${role.jobTitle} at ${role.company} (${role.dates || 'no dates'})`;
        if (bullets.length === 0) return header;
        return `${header}:\n${bullets.map(b => `  • ${b}`).join('\n')}`;
    }).join('\n\n');

    const skillList = (cvData.skills || []).slice(0, 25).join(', ');
    const summaryText = cvData.summary ? `"${cvData.summary.substring(0, 300)}"` : 'none';

    const prompt = `You are a senior CV consultant doing a diagnostic review. Field: ${detectedField}.

METRIC COVERAGE: ${noMetricCount} of ${totalBullets} bullets have no number — this is the #1 issue to flag.

SUMMARY:
${summaryText}

CV SNAPSHOT:
${bulletSnapshot || 'No experience entries.'}

Skills: ${skillList || 'none'}
Education: ${cvData.education?.map(e => `${e.degree} ${e.school} ${e.year}`).join('; ') || 'none'}
Has projects: ${(cvData.projects || []).length > 0 ? `yes (${cvData.projects!.length})` : 'no'}
${jobDescription ? `\nTARGET ROLE:\n${jobDescription.substring(0, 500)}` : ''}

BANNED PHRASES — flag any found in the bullets as things to remove:
${bannedPhrases}

CRITICAL RULES:
- Base every suggestion on the ACTUAL text shown above — do NOT invent metrics.
- Be specific: name the role, bullet, or skill you are referring to.
- Flag banned phrases found in the CV as concrete "toRemove" items.
- For duplicateSkills: list PAIRS that are redundant (e.g. "Stakeholder Management / Stakeholder Engagement").
- For summaryIssues: be specific about what is generic or missing (years of experience, scale, achievement).

Return ONLY this JSON (no markdown, no prose):
{
  "toAdd": ["up to 5 specific things MISSING — e.g. 'The Site Engineer role has no metric — add team size or project budget', 'Add LinkedIn URL'"],
  "toRemove": ["up to 4 things that WEAKEN the CV — e.g. 'Replace \\"leveraged\\" in bullet 1 of Role X with a specific verb', 'Cut the References section'"],
  "quickWins": ["up to 4 one-sentence improvements — e.g. 'Add team size or region to \\"Managed projects…\\" in Role Y'"],
  "duplicateSkills": ["up to 4 redundant skill pairs — e.g. 'Stakeholder Management / Stakeholder Engagement', 'MS Excel / Microsoft Excel'"],
  "summaryIssues": ["up to 3 specific problems — e.g. 'No metric or scale (add years of experience or budget managed)', 'Generic opener — lead with your strongest achievement'"],
  "suggestedSummary": "A concrete 2-3 sentence rewrite of the summary section. Keep only real facts from the CV. Must start with a strong role title and year count. Include one specific achievement or scale figure if visible in the CV. Do NOT invent metrics. Return empty string if the summary is already strong."
}`;

    const text = await groqChat(FAST_MODEL, SYSTEM_JSON, prompt, { temperature: 0.3, json: true, maxTokens: 2000 });
    const parsed = safeParseJson(text, ['toAdd', 'toRemove', 'quickWins', 'duplicateSkills', 'summaryIssues', 'suggestedSummary']) as Record<string, unknown>;
    const clean = (arr: unknown, max = 5): string[] =>
        Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string').slice(0, max) : [];
    const cleanStr = (v: unknown): string | undefined => {
        if (typeof v === 'string' && v.trim().length > 20) return v.trim();
        return undefined;
    };
    // Purify the suggested summary through the gateway so Doctor can't reintroduce banned phrases
    const rawSummary = cleanStr(parsed.suggestedSummary);
    const suggestedSummary = rawSummary
        ? (await purifiedCompletion(() => Promise.resolve(rawSummary))).text
        : undefined;
    return {
        toAdd:            clean(parsed.toAdd),
        toRemove:         clean(parsed.toRemove),
        quickWins:        clean(parsed.quickWins),
        noMetricCount,
        duplicateSkills:  clean(parsed.duplicateSkills, 4),
        summaryIssues:    clean(parsed.summaryIssues, 3),
        suggestedSummary,
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

    // Fetch live banned phrases — falls back gracefully if CF worker unreachable
    const bannedEntries = await getCachedBannedPhrases().catch(() => null);
    const bannedList = bannedEntries && bannedEntries.length > 0
        ? bannedEntries.slice(0, 20).map(b => b.phrase).join(', ')
        : 'spearheaded, leveraged, orchestrated, utilized, facilitated, synergized, responsible for, helped to, worked on, assisted with, tasked with, passionate about, dynamic, results-driven';

    const taskDesc =
        issues.includes('pronoun')             ? 'Remove the first-person pronoun (I, my, we, our) and rewrite starting with a strong action verb.' :
        issues.includes('ai_language')         ? 'Replace the AI/corporate buzzword with a direct, specific verb that describes exactly what was done. Keep the same achievement.' :
        issues.includes('third_person')        ? 'Change the verb from 3rd-person ("Manages") to bare imperative ("Manage").' :
        issues.includes('passive_voice')       ? 'Convert from passive voice to active voice — start with a strong action verb showing what you did.' :
        issues.includes('tense_mismatch')      ? (isCurrentRole ? 'Switch from past tense to present tense (bare imperative) — e.g. "Managed" → "Manage", "Developed" → "Develop".' : 'Switch from present tense to past tense — e.g. "Manage" → "Managed", "Build" → "Built".') :
        issues.includes('weak_verb')           ? 'Replace the weak opener ("helped", "assisted", "worked on") with a specific, strong action verb that directly names what was done.' :
        issues.includes('ensuring_virus')      ? 'Remove "ensuring" — state what was achieved or delivered directly using a concrete verb and outcome.' :
        issues.includes('no_metric')           ? 'Reframe the bullet to highlight observable scope or impact using language already present in the sentence. Do NOT invent figures or use approximation markers.' :
        issues.includes('bare_metric_opener')  ? 'Restructure so a strong action verb comes first, then use the number as supporting evidence within the sentence.' :
        issues.includes('duplicate_word')      ? 'Fix the repeated word and improve the overall clarity of the sentence.' :
        issues.includes('too_short')           ? 'Expand with specific detail about scope, method, or result that is inferable from the role context. Aim for 15–25 words.' :
        issues.includes('too_long')            ? 'Trim to under 28 words. Remove filler phrases; keep the verb, scope, and result.' :
        'Improve the clarity and professional impact of this bullet.';

    const prompt = `You are a professional CV writer. Rewrite the bullet below in 3 different ways.

BULLET: "${bullet}"
ROLE: ${role.jobTitle} at ${role.company}
TASK: ${taskDesc}
TENSE: Use ${tense}.
${jobDescription ? `TARGETING JOB: ${jobDescription.substring(0, 300)}` : ''}
${_humanizationRules ? `\nPROCV WRITING RULES — follow these exactly, same as during CV generation:\n${_humanizationRules}` : ''}

RULES:
- Keep the same underlying fact or achievement — do NOT invent new metrics or figures
- Do NOT use approximation markers like "~", "approx.", "around", "up to" unless already in the original
- Each rewrite must start with a DIFFERENT strong action verb
- BANNED phrases — never use any of these: ${bannedList}
- Plain, direct language — the banned list above includes AI buzzwords like "spearheaded" and "leveraged"
- No bullet character, no quotation marks around the output

Return ONLY a JSON array of exactly 3 strings:
["rewrite one", "rewrite two", "rewrite three"]`;

    const rawText = await groqChat(FAST_MODEL, SYSTEM_JSON, prompt, { temperature: 0.65, json: true, maxTokens: 600 });
    const arr = safeParseJson(rawText);
    if (!Array.isArray(arr)) return [];
    const strings = arr.filter((s: unknown): s is string => typeof s === 'string').slice(0, 3);
    // Run each rewrite through the purification gateway to strip any AI/banned phrases
    const purified = await Promise.all(
        strings.map(s => purifiedCompletion(() => Promise.resolve(s)).then(r => r.text))
    );
    return purified;
}

// ─── 3b. Suggest a quantified version for a metric-less bullet ────────────────
/**
 * For bullets flagged as `no_metric`, generates ONE additional rewrite that
 * includes a plausible, role-calibrated metric.  Numbers are anchored to
 * existing figures in the same role when available; otherwise scope language
 * is used ("across 3 departments", "for 50+ stakeholders").
 *
 * The caller MUST show a "verify numbers before using" disclaimer alongside
 * this suggestion — it is intentionally separate from the 3 standard
 * scope-reframing rewrites returned by rewriteBulletOptions().
 */
export async function suggestQuantifiedBullet(
    bullet: string,
    role: { jobTitle: string; company: string; endDate?: string },
    cvData: CVData,
    jobDescription?: string,
): Promise<string> {
    // Gather number anchors from other bullets in the same role
    const roleEntry = cvData.experience.find(
        e => e.jobTitle === role.jobTitle && e.company === role.company,
    );
    const anchorBullets = (roleEntry?.responsibilities ?? [])
        .filter(b => b.trim() !== bullet.trim() && /\d/.test(b))
        .slice(0, 3);

    const bannedEntries = await getCachedBannedPhrases().catch(() => null);
    const bannedList = bannedEntries && bannedEntries.length > 0
        ? bannedEntries.slice(0, 20).map(b => b.phrase).join(', ')
        : 'spearheaded, leveraged, orchestrated, utilized, facilitated, synergized, responsible for, helped to, worked on';

    const syntheticProfile = {
        workExperience: cvData.experience.map(e => ({
            jobTitle: e.jobTitle ?? '',
            company:  e.company  ?? '',
            responsibilities: (e.responsibilities ?? []).join(' '),
        })),
        skills: cvData.skills ?? [],
    } as any;
    const field = detectField(jobDescription, syntheticProfile);
    const isCurrentRole = !role.endDate || /^(present|current|now|today)$/i.test(role.endDate.trim());
    const tense = isCurrentRole ? 'present-tense bare imperative (e.g. "Manage", "Lead")' : 'past tense (e.g. "Managed", "Led")';

    const anchorBlock = anchorBullets.length > 0
        ? `\nNUMBER ANCHORS — other bullets in this role that already have figures (calibrate scale from these):\n${anchorBullets.map(b => `  • ${b}`).join('\n')}`
        : '';

    const prompt = `You are a CV coach adding a plausible, seniority-calibrated metric to a bullet point.

ROLE: ${role.jobTitle} at ${role.company}
FIELD: ${field}
TENSE: ${tense}${anchorBlock}
${jobDescription ? `\nJOB CONTEXT: ${jobDescription.substring(0, 300)}` : ''}

BULLET WITH NO METRIC:
"${bullet}"

YOUR TASK: Write ONE improved version of this bullet that adds a specific, believable metric.

METRIC GUIDANCE (use the most relevant type):
- If anchor bullets show numbers, calibrate to the same scale
- Team/client/vendor counts: junior 2–10, manager 5–20, senior/director 20+
- Budget scale: junior <$500K, manager $500K–$5M, director/VP $5M+
- % improvements: conservative (15–30%) are more believable than round numbers
- If nothing specific is inferable, use scope language: "across 3 departments", "for 50+ stakeholders", "covering 8 workstreams", "in 4 countries"

STRICT RULES:
- Keep the core achievement from the original bullet unchanged
- Do NOT use "~", "approx.", "up to", or any hedging marker before a number
- Metric must be plausible — never claim a junior analyst "saved $50M"
- BANNED phrases — never use: ${bannedList}
- Return ONLY the single rewritten bullet — no quotes, no preamble, no commentary`;

    // Run the raw groqChat call through the purification gateway
    const { text: raw } = await purifiedCompletion(
        () => groqChat(FAST_MODEL, SYSTEM_JSON, prompt, { temperature: 0.5, maxTokens: 130 })
    );
    return raw.trim()
        .replace(/^```[\s\S]*?```/g, '')
        .replace(/^["•\-*·»]\s*/, '')
        .replace(/^["']|["']$/g, '')
        .trim();
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
    passive_voice: 3, tense_mismatch: 4, weak_verb: 5, ensuring_virus: 6,
    no_metric: 7, bare_metric_opener: 8, duplicate_word: 9,
    too_short: 10, too_long: 11, good: 99,
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

    // Fetch live banned phrases — falls back gracefully if CF worker unreachable
    const bannedEntries = await getCachedBannedPhrases().catch(() => null);
    const bannedList = bannedEntries && bannedEntries.length > 0
        ? bannedEntries.slice(0, 20).map(b => b.phrase).join(', ')
        : 'spearheaded, leveraged, orchestrated, utilized, facilitated, synergized, responsible for, helped to, worked on, assisted with, tasked with, passionate about, dynamic, results-driven';

    const ISSUE_TASK: Record<BulletIssueType, string> = {
        pronoun:            'Remove the first-person pronoun (I, my, we, our) — rewrite starting with a strong action verb.',
        ai_language:        'Replace the corporate buzzword (e.g. "spearheaded", "leveraged") with a direct, specific verb that names exactly what was done.',
        third_person:       'Change the verb to bare imperative form — "Manages" → "Manage", "Generates" → "Generate".',
        passive_voice:      'Convert from passive voice ("was responsible for", "were tasked with") to active voice — start with an action verb.',
        tense_mismatch:     'Fix the verb tense: current-role bullets need present tense ("Manage"), past-role bullets need past tense ("Managed").',
        weak_verb:          'Replace the weak opener ("helped", "assisted", "worked on") with a strong, specific action verb.',
        ensuring_virus:     'Remove "ensuring" — state what was achieved or delivered directly using a concrete verb.',
        no_metric:          'Reframe to highlight observable scope or impact using language already in the bullet. Do NOT invent figures or use approximation markers like "~".',
        bare_metric_opener: 'Move the number into the body of the sentence — start with an action verb that frames the metric.',
        duplicate_word:     'Fix the repeated word and ensure the sentence reads naturally.',
        too_short:          'Expand with scope, method, or result detail inferable from the role context. Aim for 15–25 words.',
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
${_humanizationRules ? `\nPROCV WRITING RULES — follow these exactly, same as during CV generation:\n${_humanizationRules}` : ''}

RULES:
- Keep the same underlying achievement — do NOT invent new facts, figures, or metrics
- Do NOT use approximation markers like "~", "approx.", or "around" unless already in the original
- Each output must start with a DIFFERENT strong action verb from the others
- BANNED phrases — never use any of these: ${bannedList}
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
