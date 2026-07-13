/**
 * Shared accent-color hierarchy tokens for ProCV templates.
 *
 * THE RULE (see design doc "Design System: Accent Color & Hierarchy Rules"):
 * `accentColor` maps to exactly ONE structural role — section-level
 * wayfinding. That means:
 *   - Section headers (PROFESSIONAL SUMMARY, EXPERIENCE, EDUCATION, ...) —
 *     the ONLY text color use of accent.
 *   - The one-time decorative mark tied to the candidate's name (an
 *     underline/rule directly beneath it, if the template has one) — the
 *     one intentional "branding" use of accent outside section labels.
 *   - A section header's own decorative tick/bar (the little colored dash
 *     that visually pairs with a section label) — this is part of the
 *     header component itself, not body content, so it stays accent too.
 *
 * Everything else — entry titles, company/institution names, links, dates,
 * bullet markers, skill-tag backgrounds, metadata — gets its hierarchy from
 * weight, size, and case, NEVER from color. Use these tokens instead of
 * `accentColor` for all of that.
 *
 * Why: this holds up in grayscale/ATS-stripped rendering, keeps accent's job
 * singular so future sections never have to "decide" whether they deserve
 * color, and makes every ProCV template feel like the same design language
 * regardless of which accent swatch the user picks.
 */

/** Tier 2 — entry titles (job title, degree, project name): bold, near-black ink. */
export const INK_TITLE = '#111827';

/** Tier 2 — entry sub-line (company, institution, issuing org): one notch lighter than the title. */
export const INK_SUBLINE = '#374151';

/** Tier 3 — metadata (dates, location, employment type, proficiency level): lightest, smallest, mid-gray. */
export const INK_META = '#6B7280';

/** Neutral bullet markers / skill-tag dots — never accent, so they never compete with section labels. */
export const INK_DOT = '#9CA3AF';

/** Base link color (LinkedIn/GitHub/website/project links) — base ink + underline on hover, never accent. */
export const INK_LINK = '#111827';
