/**
 * skillsReconciler.ts — 5-pass deterministic skills reconciler.
 *
 * Reconciles user profile skills against JD-extracted skills.
 * No LLM — fast, predictable, auditable.
 *
 * Passes:
 *   1. Normalise — lowercase, trim, expand abbreviations
 *   2. Semantic dedup — cluster using synonym map
 *   3. Evidence check — fuzzy-match JD skills against experience bullets
 *      (per-entry when experienceEntries provided, blob fallback otherwise)
 *   4. Rank — JD-relevant skills first; seniority-aware ordering is applied
 *      only to non-JD native defaults, never to explicit JD matches
 *   5. Voice normalise — use user's own phrasing style
 */

import { buildSynonymMap, ABBREV_EXPANSIONS } from './skillsSynonymMap';

/** Where a skill's evidence was found. */
export interface EvidenceSource {
    /** 'profile' = listed in profile.skills; 'entry:<id>' = found in an experience entry */
    source: 'profile' | `entry:${string}`;
}

export interface ReconciledSkills {
    /** Final ordered list — max 15 skills, ready to inject into cv.skills. */
    finalSkills: string[];
    /** Skills from user profile (after dedup/normalisation). */
    native: string[];
    /** JD skills evidenced in the user's bullets/profile — included. */
    addedFromJD: string[];
    /** JD skills NOT evidenced anywhere — dropped (no fabrication). */
    dropped: string[];
    /** Profile skills that the JD confirms (rank-boosted). */
    promoted: string[];
    /**
     * Maps each skill in finalSkills to the experience entry IDs where
     * evidence was found. 'profile' = found only in profile.skills (no
     * specific experience anchor). Used to inject per-role bullet directives.
     *
     * key   = skill string (as it appears in finalSkills)
     * value = array of experience entry ids, e.g. ['role_0', 'role_2'],
     *         or ['profile'] when the only evidence is profile.skills itself.
     */
    evidenceMap: Map<string, string[]>;
}

/** Career level used only for deterministic skill ordering. */
export type SkillSeniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'executive' | 'exec';

export interface SkillReconcileOptions {
    /**
     * When supplied, generic process/tool skills are moved below stronger
     * senior-level signals for senior and executive candidates. This never
     * removes a skill and never applies to JD-matched skills.
     */
    seniority?: SkillSeniority | string;
}

const MAX_SKILLS = 15;
const SYNONYM_MAP = buildSynonymMap();

// ─── Pass 1: Normalise ───────────────────────────────────────────────────────

function normalise(skill: string): string {
    const trimmed = skill.trim();
    // Try abbreviation expansion first (exact match only)
    const abbrev = ABBREV_EXPANSIONS[trimmed.toLowerCase()];
    if (abbrev) return abbrev;
    return trimmed;
}

// ─── Pass 2: Semantic dedup via synonym map ──────────────────────────────────

function canonicalise(skill: string): string {
    const lower = skill.toLowerCase();
    return SYNONYM_MAP.get(lower) ?? skill;
}

function deduplicateWithSynonyms(skills: string[]): string[] {
    const seen = new Map<string, string>(); // canonical → original phrasing
    for (const skill of skills) {
        const normalised = normalise(skill);
        const canonical = canonicalise(normalised).toLowerCase();
        if (!seen.has(canonical)) {
            seen.set(canonical, normalised); // keep first occurrence's phrasing
        }
    }
    return Array.from(seen.values());
}

// ─── Pass 3: Evidence check ──────────────────────────────────────────────────

/** Simple fuzzy evidence check: does the skill appear in the given text? */
function matchesText(skill: string, text: string): boolean {
    const needle = skill.toLowerCase().replace(/[^a-z0-9]/g, '');
    const haystack = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
    if (haystack.includes(needle)) return true;
    // Also check canonical form
    const canonical = canonicalise(skill).toLowerCase().replace(/[^a-z0-9]/g, '');
    return haystack.includes(canonical);
}

/**
 * Find which experience entry IDs evidence this skill.
 * Returns an empty array when no entry matches.
 */
function findEvidenceEntries(
    skill: string,
    entries: Array<{ id: string; bullets: string[] }>,
): string[] {
    const matched: string[] = [];
    for (const entry of entries) {
        const text = entry.bullets.join(' ');
        if (matchesText(skill, text)) {
            matched.push(entry.id);
        }
    }
    return matched;
}

// ─── Pass 5: Voice normalise ─────────────────────────────────────────────────

/**
 * If the user writes "Python" not "Python programming", prefer brevity.
 * Checks if the JD skill's canonical form matches a user skill that is shorter.
 */
function voiceNormalise(jdSkill: string, nativeSkills: string[]): string {
    const jdCanon = canonicalise(jdSkill).toLowerCase();
    for (const native of nativeSkills) {
        const nativeCanon = canonicalise(native).toLowerCase();
        if (jdCanon === nativeCanon) return native; // use user's own phrasing
        if (jdCanon.startsWith(nativeCanon) && native.length < jdSkill.length) return native;
    }
    // Check synonym map for canonical
    const mapped = SYNONYM_MAP.get(jdSkill.toLowerCase());
    return mapped ?? jdSkill;
}

// ─── Seniority-aware default ordering ─────────────────────────────────────────

/**
 * These are intentionally broad, low-signal skills that can make an otherwise
 * senior CV read like a task-level profile when they lead the list. They are
 * never forbidden: an explicit JD match is always kept ahead of this pass.
 */
const FOUNDATIONAL_SKILL_SIGNALS = [
    /\bagile\b/i,
    /\bscrum\b/i,
    /\bkanban\b/i,
    /\bjira\b/i,
    /\btrello\b/i,
    /\btime\s+management\b/i,
    /\bteamwork\b/i,
    /\bcommunication\b/i,
    /\bcustomer\s+service\b/i,
    /\bdata\s+entry\b/i,
    /\bmicrosoft\s+office\b/i,
    /\bms\s+office\b/i,
];

/**
 * Signals that communicate scope, ownership, or technical depth. This list
 * affects ordering only; it is not a claim that a candidate has the skill.
 */
const SENIOR_SCOPE_SIGNALS = [
    /\barchitecture\b/i,
    /\bsystems?\s+design\b/i,
    /\btechnical\s+strategy\b/i,
    /\bproduct\s+strategy\b/i,
    /\broadmap\b/i,
    /\bportfolio\b/i,
    /\btransformation\b/i,
    /\bscal(?:e|ing|ability)\b/i,
    /\bgovernance\b/i,
    /\b(?:people|line|team)\s+management\b/i,
    /\bcross[-\s]functional\s+leadership\b/i,
    /\bstakeholder\s+management\b/i,
    /\bmentoring\b/i,
    /\bcoaching\b/i,
    /\bbudget\b/i,
    /\bp&l\b/i,
    /\b(?:go[-\s]?to[-\s]?market|gtm)\b/i,
];

function seniorityOrderScore(skill: string, seniority?: string): number {
    const level = seniority?.trim().toLowerCase();
    if (!level || !['senior', 'lead', 'executive', 'exec'].includes(level)) return 0;

    const foundational = FOUNDATIONAL_SKILL_SIGNALS.some(pattern => pattern.test(skill));
    const scope = SENIOR_SCOPE_SIGNALS.some(pattern => pattern.test(skill));
    // Scope signals are useful at the top; generic signals are still retained
    // but intentionally move down. Neutral technical/domain skills stay stable.
    return (scope ? 2 : 0) - (foundational ? 2 : 0);
}

function sortNativeDefaults(skills: string[], seniority?: string): string[] {
    if (!seniority) return skills;
    return skills
        .map((skill, index) => ({ skill, index, score: seniorityOrderScore(skill, seniority) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(item => item.skill);
}

/** Best-effort profile-level inference for the post-generation repair pass. */
export function inferSkillSeniority(
    workExperience: Array<{ jobTitle?: string; startDate?: string; endDate?: string }> = [],
): SkillSeniority {
    const totalYears = workExperience.reduce((sum, experience) => {
        const start = experience.startDate ? new Date(experience.startDate) : null;
        const end = experience.endDate && !/^present|current|now$/i.test(experience.endDate)
            ? new Date(experience.endDate)
            : new Date();
        if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return sum;
        return sum + Math.max(0, end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    }, 0);

    const title = workExperience[0]?.jobTitle || '';
    if (/\b(?:chief|vp|vice president|director|founder|partner)\b/i.test(title) && totalYears >= 7) {
        return 'executive';
    }
    if (/\b(?:head|manager|lead)\b/i.test(title) && totalYears >= 4) return 'lead';
    if (totalYears >= 7) return 'senior';
    if (totalYears >= 3) return 'mid';
    if (totalYears > 0 && /\b(?:intern|trainee|apprentice)\b/i.test(title)) return 'intern';
    return 'junior';
}

// ─── Main reconciler ─────────────────────────────────────────────────────────

/**
 * Reconcile profile skills with JD skills.
 *
 * @param profileSkills  Skills from user profile.skills
 * @param jdSkills       Skills extracted from the job description (keywords + soft skills)
 * @param experienceBullets  Flat list of all bullet strings (backward-compat, blob mode)
 * @param experienceEntries  Per-entry data for evidence mapping (optional).
 *                           When provided, the evidenceMap is populated with entry IDs.
 * @param jdOnlyMode     When true (JD-present CV generation), finalSkills contains ONLY
 *                       JD-relevant skills (promoted + addedFromJD). Profile skills with
 *                       no JD relevance are excluded. When false (default), all native
 *                       profile skills are included with JD-confirmed ones promoted.
 * @param options        Optional seniority ordering for non-JD native defaults.
 */
export function reconcileSkills(
    profileSkills: string[],
    jdSkills: string[],
    experienceBullets: string[],
    experienceEntries?: Array<{ id: string; bullets: string[] }>,
    jdOnlyMode = false,
    options: SkillReconcileOptions = {},
): ReconciledSkills {
    const blobText = experienceBullets.join(' ');

    // Pass 1+2: normalise + dedup profile skills
    const nativeRaw = deduplicateWithSynonyms(profileSkills.map(normalise));
    const nativeCanonicals = new Set(nativeRaw.map(s => canonicalise(s).toLowerCase()));

    // Pass 1+2: normalise + dedup JD skills
    const jdRaw = deduplicateWithSynonyms(jdSkills.map(normalise));

    // Separate JD skills into: already-native vs new
    const newJDSkills = jdRaw.filter(s => !nativeCanonicals.has(canonicalise(s).toLowerCase()));

    // Pass 3: evidence check on new JD skills + build evidenceMap
    const addedFromJD: string[] = [];
    const dropped: string[] = [];
    const evidenceMap = new Map<string, string[]>();

    for (const skill of newJDSkills) {
        const entryMatches = experienceEntries
            ? findEvidenceEntries(skill, experienceEntries)
            : [];
        const foundInBlob = entryMatches.length > 0 || matchesText(skill, blobText);

        if (foundInBlob) {
            const voiced = voiceNormalise(skill, nativeRaw);
            addedFromJD.push(voiced);
            // Map to specific entries if available, else flag as blob-evidenced
            evidenceMap.set(voiced, entryMatches.length > 0 ? entryMatches : []);
        } else {
            dropped.push(skill);
        }
    }

    // Pass 4: identify promoted (native skills confirmed by JD)
    const jdCanonicals = new Set(jdRaw.map(s => canonicalise(s).toLowerCase()));
    const promoted = nativeRaw.filter(s => jdCanonicals.has(canonicalise(s).toLowerCase()));

    // Build evidenceMap entries for promoted native skills.
    // Profile.skills is itself evidence — they may also appear in bullets.
    for (const skill of promoted) {
        const entryMatches = experienceEntries
            ? findEvidenceEntries(skill, experienceEntries)
            : [];
        // 'profile' is always in the source (profile.skills IS evidence per spec);
        // add entry matches on top when present.
        const sources = entryMatches.length > 0 ? entryMatches : ['profile'];
        evidenceMap.set(skill, sources);
    }

    // Build final list
    let finalSkills: string[];

    if (jdOnlyMode) {
        // JD-present CV: ONLY JD-relevant, evidenced skills (spec §"No Profile-Skill Fallback").
        // Order: promoted (native + JD-confirmed) first → addedFromJD (bullets-only evidence).
        finalSkills = [...promoted, ...addedFromJD].slice(0, MAX_SKILLS);
    } else {
        // Keep every JD-relevant skill ahead of unconfirmed defaults. This
        // protects ATS coverage while leaving the profile's own skills intact.
        const promotedSet = new Set(promoted.map(s => canonicalise(s).toLowerCase()));
        const nativeDefaults = sortNativeDefaults(
            nativeRaw.filter(s => !promotedSet.has(canonicalise(s).toLowerCase())),
            options.seniority,
        );
        finalSkills = [...promoted, ...addedFromJD, ...nativeDefaults].slice(0, MAX_SKILLS);
    }

    return {
        finalSkills,
        native: nativeRaw,
        addedFromJD,
        dropped,
        promoted,
        evidenceMap,
    };
}
