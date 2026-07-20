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
 *   4. Rank — promoted (native+JD) first, then addedFromJD; in jdOnlyMode
 *      unpromoted native skills are excluded entirely
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
 */
export function reconcileSkills(
    profileSkills: string[],
    jdSkills: string[],
    experienceBullets: string[],
    experienceEntries?: Array<{ id: string; bullets: string[] }>,
    jdOnlyMode = false,
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
        // No-JD or backward-compat: native skills first (promoted up front), then JD additions.
        const promotedSet = new Set(promoted.map(s => canonicalise(s).toLowerCase()));
        const nativeSorted = [
            ...nativeRaw.filter(s => promotedSet.has(canonicalise(s).toLowerCase())),
            ...nativeRaw.filter(s => !promotedSet.has(canonicalise(s).toLowerCase())),
        ];
        finalSkills = [...nativeSorted, ...addedFromJD].slice(0, MAX_SKILLS);
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
