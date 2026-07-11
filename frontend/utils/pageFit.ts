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
