/**
 * pageFit.ts
 *
 * Shared page-math constants and helpers used by both the live preview
 * (CVGenerator.tsx) and the PDF-export pipeline (getCVHtml / PDF worker).
 *
 * Keep A4_PAGE_HEIGHT_PX in sync with the resume-pdf-worker viewport height
 * (backend/resume-pdf-worker/src/index.ts → page.setViewport { height: 1123 }).
 */

/** A4 page height at 794 px wide / 96 dpi — matches the Chromium PDF worker viewport. */
export const A4_PAGE_HEIGHT_PX = 1123;

/**
 * How many A4 pages will content of `contentHeightPx` pixels require?
 * Returns at least 1.
 */
export function getPageCount(contentHeightPx: number): number {
  if (contentHeightPx <= 0) return 1;
  return Math.ceil(contentHeightPx / A4_PAGE_HEIGHT_PX);
}

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
export function getSpacingValues(level: number): { secGap: number; entryGap: number; lh: number } {
  const table = [
    { secGap: 14, entryGap: 10, lh: 1.375 }, // 0 — space-y-3.5, space-y-2.5, leading-snug
    { secGap: 10, entryGap:  7, lh: 1.3   }, // 1 — tight
    { secGap:  6, entryGap:  4, lh: 1.25  }, // 2 — compact
    { secGap:  3, entryGap:  2, lh: 1.2   }, // 3 — ultra
  ];
  return table[Math.max(0, Math.min(3, level))] ?? table[0];
}
