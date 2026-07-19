/**
 * skillsReconciler.ts — 5-pass deterministic skills reconciler (Feature 3).
 *
 * Reconciles user profile skills against JD-extracted skills.
 * No LLM — fast, predictable, auditable.
 *
 * Passes:
 *   1. Normalise — lowercase, trim, expand abbreviations
 *   2. Semantic dedup — cluster using synonym map
 *   3. Evidence check — fuzzy-match JD skills against experience bullets
 *   4. Rank — native > JD-evidenced > JD-ungrounded (dropped)
 *   5. Voice normalise — use user's own phrasing style
 */

import { buildSynonymMap, ABBREV_EXPANSIONS } from './skillsSynonymMap';

export interface ReconciledSkills {
  /** Final ordered list — max 15 skills, ready to inject into cv.skills. */
  finalSkills: string[];
  /** Skills from user profile (after dedup/normalisation). */
  native: string[];
  /** JD skills evidenced in the user's bullets — added. */
  addedFromJD: string[];
  /** JD skills NOT evidenced in bullets — dropped. */
  dropped: string[];
  /** Profile skills that the JD confirms (rank-boosted). */
  promoted: string[];
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

/** Simple fuzzy evidence check: does the skill appear in the concatenated bullets? */
function isEvidenced(skill: string, bulletText: string): boolean {
  const needle = skill.toLowerCase().replace(/[^a-z0-9]/g, '');
  const haystack = bulletText.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  if (haystack.includes(needle)) return true;
  // Also check canonical form
  const canonical = canonicalise(skill).toLowerCase().replace(/[^a-z0-9]/g, '');
  return haystack.includes(canonical);
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
 * @param profileSkills Skills from user profile
 * @param jdSkills Skills extracted from the job description
 * @param experienceBullets All experience bullet text concatenated
 */
export function reconcileSkills(
  profileSkills: string[],
  jdSkills: string[],
  experienceBullets: string[],
): ReconciledSkills {
  const bulletText = experienceBullets.join(' ');

  // Pass 1+2: normalise + dedup profile skills
  const nativeRaw = deduplicateWithSynonyms(profileSkills.map(normalise));
  const nativeCanonicals = new Set(nativeRaw.map(s => canonicalise(s).toLowerCase()));

  // Pass 1+2: normalise + dedup JD skills
  const jdRaw = deduplicateWithSynonyms(jdSkills.map(normalise));

  // Separate JD skills into: already-native vs new
  const newJDSkills = jdRaw.filter(s => !nativeCanonicals.has(canonicalise(s).toLowerCase()));

  // Pass 3: evidence check on new JD skills
  const addedFromJD: string[] = [];
  const dropped: string[] = [];

  for (const skill of newJDSkills) {
    if (isEvidenced(skill, bulletText)) {
      // Pass 5: voice normalise before adding
      addedFromJD.push(voiceNormalise(skill, nativeRaw));
    } else {
      dropped.push(skill);
    }
  }

  // Pass 4: identify promoted (native skills confirmed by JD)
  const jdCanonicals = new Set(jdRaw.map(s => canonicalise(s).toLowerCase()));
  const promoted = nativeRaw.filter(s => jdCanonicals.has(canonicalise(s).toLowerCase()));

  // Build final list: native first (promoted first within native), then added from JD
  const promotedSet = new Set(promoted.map(s => canonicalise(s).toLowerCase()));
  const nativeSorted = [
    ...nativeRaw.filter(s => promotedSet.has(canonicalise(s).toLowerCase())),
    ...nativeRaw.filter(s => !promotedSet.has(canonicalise(s).toLowerCase())),
  ];

  const finalSkills = [...nativeSorted, ...addedFromJD].slice(0, MAX_SKILLS);

  return {
    finalSkills,
    native: nativeRaw,
    addedFromJD,
    dropped,
    promoted,
  };
}
