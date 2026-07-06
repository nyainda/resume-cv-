/**
 * cvFinalGuard.ts — Comprehensive last-mile CV quality gate.
 *
 * Called as the absolute final step inside generateCV(), right before caching.
 * Works identically for job / general / academic modes — no special cases needed.
 *
 * ── Layer 1: Deterministic (zero AI cost, zero latency) ──────────────────────
 *  1. Skill deduplication        — exact + MS-prefix normalisation
 *  2. Summary opener strip       — "A results-driven…", "I am a…", "Highly motivated…"
 *  3. Summary seeking purge      — "seeking to / looking to / eager to…" clauses
 *  4. Placeholder removal        — [Add metric], {VALUE}, XX%, <INSERT> across ALL fields
 *  5. Double-word fix            — "the the", "and and" across ALL fields
 *  6. Project bullets compliance — leak purge + placeholder + capitalise (p.bullets[])
 *  7. Free-text compliance       — achievements, certifications, custom section descriptions
 *  8. Bullet instruction-leak    — "Note:", markdown fences, bold labels in exp. bullets
 *
 * ── Layer 2: AI grammar & coherence (GROQ_FAST, 5 s timeout, graceful fallback) ─
 *  9. Summary grammar            — truncated sentence, agreement error, AI artefact
 * 10. Project description grammar — same checks on project description strings
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { CVData, CVProject, CustomSectionItem } from '../types';
import { groqChat, GROQ_FAST } from './groqService';

// ─── Shared constants ─────────────────────────────────────────────────────────

const SYSTEM_EDITOR = 'You are a strict grammar editor for professional CV content. Fix only genuine errors. Never rephrase, improve tone, or add new content.';

// ─── 1. Generic summary opener patterns ──────────────────────────────────────

/** Patterns that should never open a professional summary. */
const GENERIC_OPENER_RX: RegExp[] = [
    // "A/An <pure-adjective> …" — the classic AI opener (only the clearest offenders)
    /^(A|An)\s+(results?[-\s]driven|results?[-\s]oriented|highly\s+motivated|self[-\s]motivated|dedicated|passionate|dynamic|innovative|proactive|detail[-\s]oriented|hardworking|driven|motivated|seasoned|versatile|forward[-\s]thinking|goal[-\s]oriented|performance[-\s]driven|solution[-\s]oriented)\b\s*/i,
    // "I am / I'm a …"
    /^I\s+'?m\s+a(n)?\s+/i,
    /^I\s+am\s+a(n)?\s+/i,
    // "With a proven / strong …"
    /^With\s+a\s+(proven|strong|extensive|solid|robust)\s+/i,
    // "Highly / Deeply / Exceptionally <adjective>"
    /^(Highly|Deeply|Extremely|Exceptionally|Uniquely)\s+(motivated|dedicated|driven|passionate|committed)\s+/i,
];

/** Single-word banned first words for a summary. */
const BANNED_FIRST_WORDS = new Set([
    'passionate', 'dynamic', 'innovative', 'motivated', 'dedicated',
    'hardworking', 'driven', 'proactive', 'versatile', 'ambitious',
    'enthusiastic', 'creative', 'energetic', 'resourceful', 'committed',
]);

/** Seeking / aspiration clause patterns. */
const SEEKING_RX: RegExp[] = [
    /\b(seeking|looking)\s+to\b[^.!?]*/gi,
    /\bseeking\s+(an?\s+)?(opportunity|role|position)\b[^.!?]*/gi,
    /\b(aiming|hoping|eager|excited)\s+to\b[^.!?]*/gi,
    /\blooking\s+forward\s+to\b[^.!?]*/gi,
    /\bkeen\s+to\b[^.!?]*/gi,
];

export function fixSummaryOpener(summary: string): string {
    if (!summary) return summary;
    const firstWord = summary.split(/\s+/)[0]?.replace(/[^a-z]/gi, '').toLowerCase() ?? '';
    if (BANNED_FIRST_WORDS.has(firstWord)) {
        const rest = summary.replace(/^\S+\s*/, '').trimStart();
        if (rest.length > 20) return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
    for (const rx of GENERIC_OPENER_RX) {
        if (rx.test(summary)) {
            const stripped = summary.replace(rx, '').trim();
            if (stripped.length > 25) return stripped.charAt(0).toUpperCase() + stripped.slice(1);
        }
    }
    return summary;
}

export function purgeSummarySeekingLanguage(summary: string): string {
    if (!summary) return summary;
    let result = summary;
    for (const rx of SEEKING_RX) result = result.replace(rx, '').replace(/\s{2,}/g, ' ').trim();
    return result.replace(/,\s*\./g, '.').replace(/\.\s*,/g, '.').trim();
}

// ─── 2. Skill deduplication ──────────────────────────────────────────────────

function normSkill(s: string): string {
    return s
        .toLowerCase()
        .replace(/\bms\b/g, 'microsoft')
        .replace(/[^a-z0-9]/g, '')
        .replace(/(skills?|programming|proficiency|knowledge|expertise)$/, '');
}

export function deduplicateSkills(skills: string[]): string[] {
    if (!skills || skills.length === 0) return skills;
    const seen = new Map<string, string>();
    for (const skill of skills) {
        const t = skill.trim();
        if (!t) continue;
        const norm = normSkill(t);
        if (!norm) { seen.set(t, t); continue; }
        const existing = seen.get(norm);
        if (!existing || t.length > existing.length) seen.set(norm, t);
    }
    const kept = new Set(seen.values());
    const result: string[] = [];
    const addedNorms = new Set<string>();
    for (const skill of skills) {
        const t = skill.trim();
        const norm = normSkill(t);
        const canonical = seen.get(norm) ?? t;
        if (kept.has(canonical) && !addedNorms.has(norm)) {
            result.push(canonical);
            addedNorms.add(norm);
        }
    }
    return result;
}

// ─── 3. Placeholder & double-word fixers ─────────────────────────────────────

/** Regex matching AI placeholder patterns that should never appear in a CV. */
const PLACEHOLDER_RX =
    /\[(?:Add|Insert|Enter|Your|Specific|Example|XX|N\/A)[^\]]*\]|\{[A-Z_]{2,}\}|<(?:INSERT|ADD|ENTER|METRIC|VALUE)[^>]*>|\bXX%?\b|\bN\/A\b/gi;

const DOUBLE_WORD_RX = /\b(\w{2,})\s+\1\b/gi;

/** Strip placeholder tokens from a string. */
function removePlaceholders(text: string): string {
    if (!text) return text;
    return text.replace(PLACEHOLDER_RX, '').replace(/\s{2,}/g, ' ').trim();
}

/** Fix double words: "the the" → "the". */
function fixDoubleWords(text: string): string {
    if (!text) return text;
    return text.replace(DOUBLE_WORD_RX, '$1').replace(/\s{2,}/g, ' ').trim();
}

function cleanText(text: string): string {
    return fixDoubleWords(removePlaceholders(text));
}

// ─── 4. Bullet instruction-leak purge ────────────────────────────────────────

const BULLET_LEAK_RX: RegExp[] = [
    /^(Note:|Based on (the|your)\b|As mentioned|Please note|According to the|This bullet|I've included|I have included)/i,
    /^```[\s\S]*?```/,
    /^\*\*[^*]+\*\*:\s*/,
    /^#+\s+/,
];

function purgeSingleBullet(b: string): string {
    const t = b.trim();
    for (const rx of BULLET_LEAK_RX) {
        if (rx.test(t)) {
            const cleaned = t.replace(rx, '').trim();
            if (cleaned.length >= 15) return cleaned;
        }
    }
    return b;
}

function purifyBullets(bullets: string[]): string[] {
    return bullets
        .map(b => cleanText(purgeSingleBullet(b)))
        .filter(b => b.trim().length >= 8);   // drop stubs left after cleaning
}

// ─── 5. Project content compliance ───────────────────────────────────────────

function purifyProjectContent(projects: CVProject[]): { projects: CVProject[]; changed: boolean } {
    let changed = false;
    const result = projects.map(p => {
        const desc    = cleanText(p.description || '');
        const bullets = p.bullets ? purifyBullets(p.bullets) : undefined;
        const same    = desc === p.description && (!p.bullets || JSON.stringify(bullets) === JSON.stringify(p.bullets));
        if (!same) changed = true;
        return same ? p : { ...p, description: desc, ...(bullets ? { bullets } : {}) };
    });
    return { projects: result, changed };
}

// ─── 6. Free-text fields compliance ──────────────────────────────────────────

function cleanCustomItems(items: CustomSectionItem[]): { items: CustomSectionItem[]; changed: boolean } {
    let changed = false;
    const result = items.map(item => {
        const title = cleanText(item.title || '');
        const desc  = item.description ? cleanText(item.description) : item.description;
        if (title === item.title && desc === item.description) return item;
        changed = true;
        return { ...item, title, description: desc };
    });
    return { items: result, changed };
}

// ─── 7. AI grammar & coherence pass ──────────────────────────────────────────

/**
 * Truncation detector: returns true if the text appears cut off mid-thought.
 * Cheap deterministic pre-check — AI pass only runs when this or placeholder
 * checks flag something.
 */
function looksIncomplete(text: string): boolean {
    if (!text) return false;
    const t = text.trimEnd();
    // Ends with a preposition, conjunction, or article
    if (/\b(and|but|or|with|for|of|in|on|at|to|a|an|the|by|from|that|which|who|where|when)$/i.test(t)) return true;
    // Contains remaining placeholder after cleaning (rare but possible with nested brackets)
    if (/\[\s*\]|\{\s*\}/.test(t)) return true;
    return false;
}

interface GrammarCheckInput {
    summary:             string;
    projectDescriptions: string[];  // up to 4
}

async function runGrammarCoherencePass(input: GrammarCheckInput): Promise<GrammarCheckInput> {
    const { summary, projectDescriptions } = input;

    // Only run if something actually needs checking
    const summaryNeedsCheck    = looksIncomplete(summary) || PLACEHOLDER_RX.test(summary) || DOUBLE_WORD_RX.test(summary);
    const projectsNeedCheck    = projectDescriptions.some(
        d => looksIncomplete(d) || PLACEHOLDER_RX.test(d) || DOUBLE_WORD_RX.test(d)
    );

    // Reset regex lastIndex (they're global)
    PLACEHOLDER_RX.lastIndex = 0;
    DOUBLE_WORD_RX.lastIndex = 0;

    if (!summaryNeedsCheck && !projectsNeedCheck) return input;   // nothing to fix — skip AI call

    const prompt = `Fix ONLY these specific errors in the CV content below. Do NOT rephrase, improve, or restructure anything. Return every field UNCHANGED if it has no error.

Errors to fix:
1. Text cut off mid-sentence (ends on a preposition, article, or conjunction)
2. Placeholder text: [Add X], {VALUE}, [Year], XX%, <INSERT>
3. Double words: "the the", "is is", "and and"
4. Clear grammar agreement (e.g. "has manage" → "has managed")

CONTENT:
${JSON.stringify({ summary, projectDescriptions }, null, 2)}

Return ONLY a JSON object:
{"summary": "...", "projectDescriptions": ["..."]}
No markdown, no commentary.`;

    try {
        const raw = await Promise.race<string>([
            groqChat(GROQ_FAST, SYSTEM_EDITOR, prompt, { temperature: 0.1, json: true, maxTokens: 600 }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
        const parsed = JSON.parse(raw);
        return {
            summary: typeof parsed.summary === 'string' && parsed.summary.length > 10
                ? parsed.summary
                : summary,
            projectDescriptions: Array.isArray(parsed.projectDescriptions)
                ? parsed.projectDescriptions.map((d: unknown, i: number) =>
                      typeof d === 'string' && d.length > 5 ? d : projectDescriptions[i] ?? '')
                : projectDescriptions,
        };
    } catch {
        return input;  // graceful fallback — return originals unchanged
    }
}

// ─── 8. Main guard ────────────────────────────────────────────────────────────

export interface FinalGuardResult {
    cvData:  CVData;
    fixes:   string[];
    changed: boolean;
}

/**
 * Run all guards on a fully-generated CVData object.
 *
 * Layer 1 is purely deterministic (zero AI cost).
 * Layer 2 is a lightweight AI grammar pass (GROQ_FAST, 5s timeout, graceful fallback).
 *
 * General mode / academic mode: identical behaviour — no special cases needed.
 * Fires as the very last step in generateCV(), right before cvCacheSet().
 */
export async function runFinalCVGuard(cvData: CVData): Promise<FinalGuardResult> {
    const fixes: string[] = [];
    let data = cvData;

    // ── Layer 1a: Skill deduplication ────────────────────────────────────────
    if (Array.isArray(data.skills) && data.skills.length > 0) {
        const before  = data.skills.length;
        const deduped = deduplicateSkills(data.skills);
        if (deduped.length < before) {
            fixes.push(`skills: removed ${before - deduped.length} duplicate(s)`);
            data = { ...data, skills: deduped };
        }
    }

    // ── Layer 1b: Summary opener + seeking language ───────────────────────────
    if (data.summary) {
        const s1 = fixSummaryOpener(data.summary);
        const s2 = purgeSummarySeekingLanguage(s1);
        const s3 = cleanText(s2);
        if (s3 !== data.summary) {
            const reasons: string[] = [];
            if (s1 !== data.summary) reasons.push('generic opener stripped');
            if (s2 !== s1)           reasons.push('seeking language removed');
            if (s3 !== s2)           reasons.push('placeholder/double-word cleaned');
            fixes.push(`summary: ${reasons.join(', ')}`);
            data = { ...data, summary: s3 };
        }
    }

    // ── Layer 1c: Experience bullet leak purge ────────────────────────────────
    let anyBulletFixed = false;
    const cleanedExp = data.experience.map(role => {
        const original = role.responsibilities ?? [];
        const cleaned  = purifyBullets(original);
        if (cleaned.length !== original.length || cleaned.some((b, i) => b !== original[i])) {
            anyBulletFixed = true;
            fixes.push(`exp bullets: cleaned "${role.jobTitle}"`);
        }
        return (cleaned.length !== original.length || cleaned.some((b, i) => b !== original[i]))
            ? { ...role, responsibilities: cleaned }
            : role;
    });
    if (anyBulletFixed) data = { ...data, experience: cleanedExp };

    // ── Layer 1d: Project content compliance ─────────────────────────────────
    if ((data.projects ?? []).length > 0) {
        const { projects, changed } = purifyProjectContent(data.projects!);
        if (changed) {
            fixes.push('projects: bullets/descriptions cleaned');
            data = { ...data, projects };
        }
    }

    // ── Layer 1e: Free-text fields (achievements, certifications, custom) ─────
    if ((data.achievements ?? []).length > 0) {
        const cleaned = (data.achievements!).map(a =>
            typeof a === 'string' ? cleanText(a) : a
        ) as string[];
        if (cleaned.some((a, i) => a !== data.achievements![i])) {
            fixes.push('achievements: placeholder/double-word cleaned');
            data = { ...data, achievements: cleaned };
        }
    }

    if ((data.certifications ?? []).length > 0) {
        let certsChanged = false;
        const cleanedCerts = (data.certifications!).map(cert => {
            if (typeof cert === 'string') {
                const cleaned = cleanText(cert);
                if (cleaned !== cert) certsChanged = true;
                return cleaned;
            }
            const cleanedName = cert.name ? cleanText(cert.name) : cert.name;
            const cleanedIssuer = cert.issuer ? cleanText(cert.issuer) : cert.issuer;
            if (cleanedName !== cert.name || cleanedIssuer !== cert.issuer) {
                certsChanged = true;
                return { ...cert, name: cleanedName, issuer: cleanedIssuer };
            }
            return cert;
        });
        if (certsChanged) {
            fixes.push('certifications: placeholder/double-word cleaned');
            data = { ...data, certifications: cleanedCerts };
        }
    }

    if ((data.customSections ?? []).length > 0) {
        let sectionChanged = false;
        const cleanedSections = (data.customSections!).map(sec => {
            const { items, changed } = cleanCustomItems(sec.items);
            if (changed) sectionChanged = true;
            return changed ? { ...sec, items } : sec;
        });
        if (sectionChanged) {
            fixes.push('customSections: items cleaned');
            data = { ...data, customSections: cleanedSections };
        }
    }

    // ── Layer 2: AI grammar & coherence pass ──────────────────────────────────
    const summaryForCheck  = data.summary ?? '';
    const projectDescs     = (data.projects ?? []).slice(0, 4).map(p => p.description ?? '');
    const hasContentToCheck = summaryForCheck || projectDescs.some(d => d.length > 0);

    if (hasContentToCheck) {
        try {
            const grammarFixed = await runGrammarCoherencePass({
                summary: summaryForCheck,
                projectDescriptions: projectDescs,
            });

            // Apply summary fix
            if (grammarFixed.summary !== summaryForCheck && grammarFixed.summary.length > 20) {
                fixes.push('summary: grammar/coherence corrected by AI');
                data = { ...data, summary: grammarFixed.summary };
            }

            // Apply project description fixes
            const newProjects = (data.projects ?? []).map((p, i) => {
                const fixed = grammarFixed.projectDescriptions[i];
                if (fixed && fixed !== (p.description ?? '') && fixed.length > 10) {
                    fixes.push(`project "${p.name}": description corrected`);
                    return { ...p, description: fixed };
                }
                return p;
            });
            if (newProjects.some((p, i) => p !== (data.projects ?? [])[i])) {
                data = { ...data, projects: newProjects };
            }
        } catch {
            // Grammar pass failure is always silent — core CV is never blocked
        }
    }

    const changed = fixes.length > 0;
    if (changed) console.log(`[FinalGuard] ${fixes.length} fix(es):`, fixes);

    return { cvData: data, fixes, changed };
}
