import { CustomSectionType } from '../types';

/**
 * Maps a raw section `type` string + human label → a canonical CustomSectionType.
 *
 * Why this exists:
 *   AI extraction assigns one of the known type values but real-world CV headings
 *   are inconsistent ("Professional Development", "Community Service",
 *   "Board Memberships", "Speaking Engagements", etc.).  When the AI falls back to
 *   `type: "custom"` — or returns a slightly wrong type — this function inspects the
 *   **label** and maps it to the nearest canonical type so sidebar rendering,
 *   promoted-section deduplication, and profile-form display all work correctly.
 *
 * Rules:
 *   1. If `type` is already a valid, non-"custom" value → keep it.
 *   2. Otherwise regex-match the label (case-insensitive) against priority-ordered
 *      patterns.  The first match wins.
 *   3. Nothing matched → return "custom".
 */

const VALID_TYPES = new Set<string>([
  'certifications', 'awards', 'publications', 'volunteer',
  'presentations', 'patents', 'courses', 'memberships',
  'achievements', 'hobbies', 'interests', 'custom',
]);

/** Priority-ordered: more specific patterns must come before broad ones. */
const LABEL_PATTERNS: Array<[RegExp, CustomSectionType]> = [
  // ── Certifications / Licences ─────────────────────────────────────────────
  [/certif|licen[sc]e|credential|accreditat|professional qualif/i, 'certifications'],

  // ── Awards / Honours ─────────────────────────────────────────────────────
  [/award|honour|honor|recognition|prize|scholarship|fellowship|distinction|dean.?s list/i, 'awards'],

  // ── Publications ─────────────────────────────────────────────────────────
  [/publicat|journal article|book chapter|thesis|dissertation|research output|working paper/i, 'publications'],

  // ── Volunteer / Community ─────────────────────────────────────────────────
  [/volunteer|community service|community involvement|community engagement|civic|pro bono|charity|non.?profit|social impact/i, 'volunteer'],

  // ── Presentations / Speaking ──────────────────────────────────────────────
  [/present|speaking|keynote|lecture|seminar|webinar|conference talk|panel/i, 'presentations'],

  // ── Patents / IP ─────────────────────────────────────────────────────────
  [/patent|intellectual property|invention disclosure/i, 'patents'],

  // ── Courses / Training / Professional Development ─────────────────────────
  [/course|training|workshop|bootcamp|continuing ed|professional dev|e.?learning|mooc|upskill|short programme|adult ed/i, 'courses'],

  // ── Languages — must come BEFORE memberships; "language" contains no member-
  //    like words but a label mismatch would otherwise fall through to memberships.
  //    Languages should never live in customSections (dedicated field exists), so
  //    we route any stray entry to 'custom' as a safe catch-all rather than a
  //    semantically wrong type.
  [/^languages?$|^language proficiency$|^language skills?$/i, 'custom'],

  // ── Memberships / Affiliations ────────────────────────────────────────────
  [/member|affiliat|associat|society|institution|board|committee|network|chapter|professional body/i, 'memberships'],

  // ── Achievements / Highlights ─────────────────────────────────────────────
  [/achievement|accomplish|highlight|milestone|notable/i, 'achievements'],

  // ── Hobbies / Interests (broad — keep near the end) ──────────────────────
  [/hobb|interest|passion|leisure|personal interest|activit|extracurricular/i, 'hobbies'],
];

export function normaliseSectionType(
  type: string | undefined,
  label: string | undefined,
): CustomSectionType {
  const t = (type ?? '').toLowerCase().trim();
  const l = (label ?? '').toLowerCase().trim();

  // Already a valid, specific type — keep it as-is.
  if (VALID_TYPES.has(t) && t !== 'custom') return t as CustomSectionType;

  // Try to infer from the label.
  for (const [rx, canonical] of LABEL_PATTERNS) {
    if (rx.test(l)) return canonical;
  }

  return 'custom';
}

/**
 * Convenience: apply normaliseSectionType to every section in an array,
 * returning a new array with corrected types.
 */
export function normaliseCustomSections<T extends { type?: string; label?: string }>(
  sections: T[],
): T[] {
  return sections.map(s => ({
    ...s,
    type: normaliseSectionType(s.type, s.label),
  }));
}
