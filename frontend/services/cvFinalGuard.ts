/**
 * cvFinalGuard.ts — Deterministic last-mile CV quality gate.
 *
 * Called as the absolute final step inside generateCV(), right before the
 * result is cached and returned.  Zero AI calls — every check is pure JS
 * so there is zero added latency to the generation pipeline.
 *
 * Responsibilities
 * ────────────────
 * 1. Skill deduplication     — normalise + remove exact / MS-prefix duplicates
 * 2. Summary opener strip    — kill generic AI openers ("A results-driven…")
 * 3. Summary seeking purge   — kill seeking / aspiration clauses
 * 4. Bullet instruction leak — strip residual AI artefacts ("Note:", markdown…)
 */

import { CVData } from '../types';

// ─── 1. Generic summary opener patterns ──────────────────────────────────────

/** Patterns that match the opener of a summary and should be stripped. */
const GENERIC_OPENER_RX: RegExp[] = [
    // "A/An <adjective(s)> <noun>" — the classic AI opener
    /^(A|An)\s+(results?[-\s]driven|results?[-\s]oriented|highly\s+motivated|self[-\s]motivated|dedicated|passionate|dynamic|innovative|proactive|detail[-\s]oriented|hardworking|driven|motivated|seasoned|experienced|accomplished|skilled|talented|versatile|proven|strategic|forward[-\s]thinking|customer[-\s]focused|goal[-\s]oriented|performance[-\s]driven|solution[-\s]oriented)\b\s*/i,
    // "I am / I'm a …"
    /^I\s+'?m\s+a(n)?\s+/i,
    /^I\s+am\s+a(n)?\s+/i,
    // "With a proven / strong / extensive …"
    /^With\s+a\s+(proven|strong|extensive|solid|robust|impressive)\s+/i,
    // "Highly / Deeply / Exceptionally <adjective>"
    /^(Highly|Deeply|Extremely|Exceptionally|Uniquely)\s+(motivated|skilled|experienced|dedicated|driven|passionate|accomplished)\s+/i,
];

/** Single-word banned openers (case-insensitive first word of summary). */
const BANNED_FIRST_WORDS = new Set([
    'passionate', 'dynamic', 'innovative', 'motivated', 'dedicated',
    'hardworking', 'driven', 'proactive', 'versatile', 'ambitious',
    'enthusiastic', 'creative', 'energetic', 'resourceful', 'committed',
]);

/** Patterns for seeking/aspiration clauses anywhere in the summary. */
const SEEKING_RX = [
    /\b(seeking|looking)\s+to\b[^.!?]*/gi,
    /\bseeking\s+(an?\s+)?(opportunity|role|position)\b[^.!?]*/gi,
    /\b(aiming|hoping|eager|excited)\s+to\b[^.!?]*/gi,
    /\blooking\s+forward\s+to\b[^.!?]*/gi,
    /\bkeen\s+to\b[^.!?]*/gi,
];

/**
 * Strip a generic AI opener from the start of a summary.
 * Returns the original string unchanged if no pattern matches.
 */
export function fixSummaryOpener(summary: string): string {
    if (!summary) return summary;

    // Check first word
    const firstWord = summary.split(/\s+/)[0]?.replace(/[^a-z]/gi, '').toLowerCase() ?? '';
    if (BANNED_FIRST_WORDS.has(firstWord)) {
        // Drop the first word and capitalise what follows
        const rest = summary.replace(/^\S+\s*/, '').trimStart();
        if (rest.length > 20) {
            return rest.charAt(0).toUpperCase() + rest.slice(1);
        }
    }

    for (const rx of GENERIC_OPENER_RX) {
        if (rx.test(summary)) {
            const stripped = summary.replace(rx, '').trim();
            // Only accept the stripped version if it's long enough to stand alone
            if (stripped.length > 25) {
                return stripped.charAt(0).toUpperCase() + stripped.slice(1);
            }
        }
    }

    return summary;
}

/**
 * Remove seeking / aspiration clauses from a summary sentence.
 * Operates clause-by-clause; leaves the rest of the summary intact.
 */
export function purgeSummarySeekingLanguage(summary: string): string {
    if (!summary) return summary;
    let result = summary;
    for (const rx of SEEKING_RX) {
        result = result.replace(rx, '').replace(/\s{2,}/g, ' ').trim();
    }
    // Clean up dangling punctuation left by clause removal
    result = result.replace(/,\s*\./g, '.').replace(/\.\s*,/g, '.').trim();
    return result;
}

// ─── 2. Skill deduplication ──────────────────────────────────────────────────

/** Normalise a skill string for duplicate comparison. */
function normSkill(s: string): string {
    return s
        .toLowerCase()
        .replace(/\bms\b/g, 'microsoft')      // "MS Excel" → "microsoft excel"
        .replace(/[^a-z0-9]/g, '')            // strip punctuation / spaces
        .replace(/(skills?|programming|proficiency|knowledge|expertise)$/, ''); // strip generic suffixes
}

/**
 * Deduplicate a skills list by normalised form.
 * When two skills normalise to the same string, the longer / richer original
 * wording is kept.
 *
 * Example: ["MS Excel", "Microsoft Excel", "Excel"] → ["Microsoft Excel"]
 * Example: ["Python", "Python Programming"] → ["Python Programming"]
 */
export function deduplicateSkills(skills: string[]): string[] {
    if (!skills || skills.length === 0) return skills;

    const seen = new Map<string, string>(); // norm → best original

    for (const skill of skills) {
        const trimmed = skill.trim();
        if (!trimmed) continue;
        const norm = normSkill(trimmed);
        if (!norm) { seen.set(trimmed, trimmed); continue; }

        const existing = seen.get(norm);
        if (!existing) {
            seen.set(norm, trimmed);
        } else if (trimmed.length > existing.length) {
            seen.set(norm, trimmed); // keep the more descriptive version
        }
    }

    // Preserve original ordering by filtering the input list
    const kept = new Set(seen.values());
    // First occurrence in original order wins
    const result: string[] = [];
    const addedNorms = new Set<string>();
    for (const skill of skills) {
        const trimmed = skill.trim();
        const norm = normSkill(trimmed);
        if (kept.has(seen.get(norm) ?? trimmed) && !addedNorms.has(norm)) {
            result.push(seen.get(norm) ?? trimmed);
            addedNorms.add(norm);
        }
    }
    return result;
}

// ─── 3. Bullet instruction-leak purge ────────────────────────────────────────

const BULLET_LEAK_RX: RegExp[] = [
    /^(Note:|Based on (the|your)\b|As mentioned|Please note|According to the|This bullet|I've included|I have included)/i,
    /^```[\s\S]*?```/,   // fenced code block
    /^\*\*[^*]+\*\*:\s*/,  // markdown bold label at start (e.g. "**Achievement:** …")
    /^#+\s+/,             // markdown heading
];

function purgeBulletLeaks(bullets: string[]): string[] {
    return bullets.map(b => {
        const t = b.trim();
        for (const rx of BULLET_LEAK_RX) {
            if (rx.test(t)) {
                const cleaned = t.replace(rx, '').trim();
                if (cleaned.length >= 15) return cleaned;
            }
        }
        return b;
    });
}

// ─── 4. Main guard ────────────────────────────────────────────────────────────

export interface FinalGuardResult {
    cvData:  CVData;
    fixes:   string[];  // human-readable log of what was corrected
    changed: boolean;
}

/**
 * Run all deterministic guards on a fully-generated CVData object.
 * Returns the (possibly modified) CVData and a log of fixes applied.
 *
 * Designed to be called right before cvCacheSet() in generateCV().
 */
export function runFinalCVGuard(cvData: CVData): FinalGuardResult {
    const fixes: string[] = [];
    let data = cvData;

    // ── 4a. Skill deduplication ──────────────────────────────────────────────
    if (Array.isArray(data.skills) && data.skills.length > 0) {
        const before = data.skills.length;
        const deduped = deduplicateSkills(data.skills);
        if (deduped.length < before) {
            fixes.push(`skills: removed ${before - deduped.length} duplicate(s) (${before} → ${deduped.length})`);
            data = { ...data, skills: deduped };
        }
    }

    // ── 4b. Summary opener strip ─────────────────────────────────────────────
    if (data.summary) {
        const after1 = fixSummaryOpener(data.summary);
        const after2 = purgeSummarySeekingLanguage(after1);
        if (after2 !== data.summary) {
            const reasons: string[] = [];
            if (after1 !== data.summary) reasons.push('generic opener stripped');
            if (after2 !== after1)       reasons.push('seeking language removed');
            fixes.push(`summary: ${reasons.join(', ')}`);
            data = { ...data, summary: after2 };
        }
    }

    // ── 4c. Bullet instruction-leak purge ───────────────────────────────────
    let anyBulletFixed = false;
    const cleanedExp = data.experience.map(role => {
        const original = role.responsibilities ?? [];
        const cleaned  = purgeBulletLeaks(original);
        const changed  = cleaned.some((b, i) => b !== original[i]);
        if (changed) {
            anyBulletFixed = true;
            fixes.push(`bullets: instruction leak purged in "${role.jobTitle}"`);
        }
        return changed ? { ...role, responsibilities: cleaned } : role;
    });
    if (anyBulletFixed) {
        data = { ...data, experience: cleanedExp };
    }

    const changed = fixes.length > 0;
    if (changed) {
        console.log(`[FinalGuard] ${fixes.length} fix(es) applied:`, fixes);
    }

    return { cvData: data, fixes, changed };
}
