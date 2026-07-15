/**
 * pageFit.ts
 *
 * Shared page-math constants and helpers used by both the live preview
 * (CVGenerator.tsx) and the PDF-export pipeline (getCVHtml / PDF worker).
 *
 * Keep A4_PAGE_HEIGHT_PX in sync with the resume-pdf-worker viewport height
 * (backend/resume-pdf-worker/src/index.ts → page.setViewport { height: 1123 }).
 */

/**
 * A4 page height at 794 px wide / 96 dpi, with a small safety buffer.
 *
 * Exact A4 at 96 dpi: 297 mm × (96 / 25.4) = 1122.52 px.
 * We use 1120 (≈2.5 px below the exact value) so the convergence loop
 * compresses until content is clearly within the page — avoiding the
 * sub-pixel overflow that caused a nearly-blank page 2 in Playwright.
 */
export const A4_PAGE_HEIGHT_PX = 1120;

/**
 * How many A4 pages will content of `contentHeightPx` pixels require?
 * Returns at least 1.
 */
export function getPageCount(contentHeightPx: number): number {
  if (contentHeightPx <= 0) return 1;
  return Math.ceil(contentHeightPx / A4_PAGE_HEIGHT_PX);
}

/**
 * Raw fractional page ratio — 1.4 means content fills 1 full page plus 40%
 * of a second. Used by the smart layout-mode detection to distinguish
 * "compress to 1 page" from "expand to fill 2 pages".
 */
export function getPageFraction(contentHeightPx: number): number {
  if (contentHeightPx <= 0) return 1;
  return contentHeightPx / A4_PAGE_HEIGHT_PX;
}

/**
 * If pageFraction is below this threshold the content is close enough to one
 * page that auto-compression kicks in automatically.  Above it the content
 * genuinely needs two pages and the balanced-two-page expander runs instead.
 */
export const AUTO_ONE_PAGE_THRESHOLD = 1.3;

/**
 * The balanced-two-page expander stops once page 2 is at least this full.
 * 1.75 = page 2 is 75 % filled — looks polished without over-stretching.
 */
export const TWO_PAGE_EXPAND_FLOOR = 1.75;

/** Maximum expansion step index (0-based).  Steps map to spacingLevel -1 → -3. */
export const MAX_EXPANSION_STEPS = 3;

/**
 * Ordered density steps the convergence loop walks through.
 * Floor is 0.85 — below this text becomes unreadable.
 * Applied via CSS `zoom` on the template root so every dimension
 * (font-size, padding, line-height, borders) scales proportionally.
 */
export const DENSITY_STEPS = [1, 0.96, 0.92, 0.88, 0.85] as const;
export type DensityStep = (typeof DENSITY_STEPS)[number];

// ─── Two-phase compression ───────────────────────────────────────────────────
//
// Phase 1 — spacing compression: reduces inter-section gap, experience entry
// gap, and bullet line-height without touching font sizes at all. A "tiny
// overflow" of 50–100 px is fixed at level 1 or 2 with no visible text change.
//
// Phase 2 — zoom (last resort): uniform CSS zoom after spacing is maxed out.
//
// COMPRESSION_STEPS is the single ordered list the convergence loop walks
// through. Derive density and spacingLevel from the current step index rather
// than managing two separate states.

export interface CompressionStep {
  spacingLevel: 0 | 1 | 2 | 3;
  density: DensityStep;
}

export const COMPRESSION_STEPS: readonly CompressionStep[] = [
  { spacingLevel: 0, density: 1    },   // 0 — no compression
  { spacingLevel: 1, density: 1    },   // 1 — tight spacing  (~52 px recovered)
  { spacingLevel: 2, density: 1    },   // 2 — compact spacing (~89 px recovered)
  { spacingLevel: 3, density: 1    },   // 3 — ultra spacing  (~132 px recovered)
  { spacingLevel: 3, density: 0.96 },   // 4 — zoom begins
  { spacingLevel: 3, density: 0.92 },   // 5
  { spacingLevel: 3, density: 0.88 },   // 6
  { spacingLevel: 3, density: 0.85 },   // 7 — floor
] as const;

/**
 * Pixel values for the three key spacing axes at each compression level.
 * Level 0 matches the current Tailwind defaults (space-y-3.5, space-y-2.5,
 * leading-snug) exactly so switching from Tailwind classes to inline styles
 * is a no-op at level 0.
 *
 * @param level 0–3
 * @returns { secGap, entryGap, lh }
 *   secGap   — gap between major sections (px)
 *   entryGap — gap between experience/project entries (px)
 *   lh       — CSS line-height on bullet text
 */
/**
 * Spacing values for each level.
 *
 * Negative levels = expansion (balanced two-page mode).
 * Positive levels = compression (fit-to-one-page mode).
 * Level 0          = default layout (no adjustment).
 *
 * @param level  -3 … 3
 */
export function getSpacingValues(level: number): { secGap: number; entryGap: number; lh: number } {
  // clamped lookup: index 0 = level -3, 3 = level 0, 6 = level 3
  const table = [
    { secGap: 38, entryGap: 28, lh: 1.70 }, // -3 — generous expand
    { secGap: 28, entryGap: 20, lh: 1.60 }, // -2 — moderate expand
    { secGap: 20, entryGap: 14, lh: 1.50 }, // -1 — gentle expand
    { secGap: 14, entryGap: 10, lh: 1.375 }, //  0 — default (leading-snug)
    { secGap: 10, entryGap:  7, lh: 1.3   }, //  1 — tight
    { secGap:  6, entryGap:  4, lh: 1.25  }, //  2 — compact
    { secGap:  3, entryGap:  2, lh: 1.2   }, //  3 — ultra
  ];
  const idx = Math.max(0, Math.min(6, level + 3));
  return table[idx] ?? table[3];
}

/**
 * Build a CSS string that overrides Tailwind `space-y-*`, `mb-*`, and
 * `leading-*` classes inside a `[data-cv-spacing="N"]` wrapper.
 *
 * Negative levels expand spacing (balanced-two-page).
 * Positive levels compress it (fit-to-one-page).
 * Level 0 returns an empty string (no override needed).
 *
 * The style tag is injected into CVPreview and is cloned verbatim by
 * getCVHtml → Playwright so the PDF matches the live preview exactly.
 */
export function buildSpacingCSS(level: number): string {
  if (level === 0) return '';

  // Space-y multiplier: how much to scale each Tailwind space-y-* value.
  const spaceMulTable: Record<number, number> = {
    '-3': 2.7, '-2': 2.0, '-1': 1.45,
    '1': 0.72, '2': 0.45, '3': 0.22,
  };
  const spaceMul = spaceMulTable[level];
  if (spaceMul === undefined) return '';

  // Tailwind space-y class → default pixel value
  const twSpacings: [string, number][] = [
    ['1', 4], ['1\\.5', 6], ['2', 8], ['2\\.5', 10],
    ['3', 12], ['3\\.5', 14], ['4', 16], ['5', 20], ['6', 24], ['8', 32],
  ];
  const sel = `[data-cv-spacing="${level}"]`;
  const parts: string[] = [];

  // Override space-y-* (gap between siblings in a flex/block stack)
  for (const [cls, px] of twSpacings) {
    const newPx = Math.round(px * spaceMul);
    parts.push(
      `${sel} .space-y-${cls}>:not([hidden])~:not([hidden]){--tw-space-y-reverse:0;margin-top:${newPx}px!important;margin-bottom:0px!important}`,
    );
  }

  // Override mb-* (section-header bottom margin)
  const mbBase: [number, number][] = [[2, 8], [3, 12], [4, 16], [6, 24], [8, 32]];
  for (const [n, px] of mbBase) {
    parts.push(`${sel} .mb-${n}{margin-bottom:${Math.round(px * spaceMul)}px!important}`);
  }

  // Override leading-* (line-height on bullet text)
  const lhDelta = level < 0 ? (-level) * 0.085 : level * -0.055;
  const lhBase: [string, number][] = [
    ['snug', 1.375], ['normal', 1.5], ['relaxed', 1.625], ['tight', 1.25],
  ];
  for (const [name, base] of lhBase) {
    parts.push(`${sel} .leading-${name}{line-height:${(base + lhDelta).toFixed(3)}!important}`);
  }

  return parts.join('');
}
