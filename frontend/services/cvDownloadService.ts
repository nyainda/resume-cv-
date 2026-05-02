/**
 * cvDownloadService.ts
 *
 * THE single entry point for downloading a CV as PDF.
 *
 * Replaces the old multi-path mess where:
 *   - CVGenerator used Playwright → Cloudflare → jsPDF (broken Professional)
 *   - SharedCVView used jsPDF directly (broken Professional)
 *   - CVHistory used jsPDF directly (broken Professional)
 *   - JobPipelineModal used jsPDF directly (broken Professional)
 *
 * All four now go through `downloadCV()`, which renders the *real DOM* via
 * Playwright (local dev) or Cloudflare Worker (production). What you see in
 * the preview is exactly what you get in the PDF — no hand-coded duplicates.
 *
 * If both renderers are unreachable, we surface a clear error and let the
 * caller decide what to do (currently the UI shows the error message).
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  downloadViaPlaywright,
  isPlaywrightServerAvailable,
  renderHtmlToPdfBytes,
} from './playwrightPdfService';
import {
  isCloudflareConfigured,
  isCloudflareWorkerOnline,
  generateAndDownloadViaCF,
  renderHtmlToPdfBytesViaCF,
} from './cloudflareWorkerService';
import { getCVHtml } from './getCVHtml';
import CVPreview from '../components/CVPreview';
import type { CVData, PersonalInfo, TemplateName } from '../types';

export interface DownloadCVOptions {
  /** File name for the downloaded PDF (e.g. "Jane_Doe_CV.pdf"). */
  fileName: string;
  /**
   * Optional explicit container element. Pass this from modals (SharedCVView,
   * CVHistory PreviewModal, JobPipelineModal) so we capture the modal's
   * preview, not the editor preview that may still be mounted behind it.
   */
  containerEl?: HTMLElement | null;
  /** Optional progress callback for UI status text. */
  onStatus?: (msg: string) => void;
}

export interface DownloadCVResult {
  ok: boolean;
  /** Which renderer produced the PDF, when ok === true. */
  via?: 'playwright' | 'cloudflare';
  /** Human-readable error when ok === false. */
  error?: string;
  /** Total wall-clock duration in ms for the whole download path. */
  totalMs?: number;
  /** Stage-level timings — undefined keys = stage was skipped. */
  timing?: {
    /** Health probe(s). */
    probeMs?: number;
    /** getCVHtml() — base64-fontified template HTML. */
    htmlMs?: number;
    /** Network + headless-Chrome render + download trigger. */
    renderMs?: number;
  };
}

// ── Health probe cache ───────────────────────────────────────────────────────
// Avoids hitting `/health` on every download click (saved ~2s on the slow path).
let playwrightHealthCache: { ok: boolean; checkedAt: number } | null = null;
let cfHealthCache: { ok: boolean; checkedAt: number } | null = null;
const HEALTH_CACHE_MS = 30_000;

async function probePlaywright(): Promise<boolean> {
  const now = Date.now();
  if (playwrightHealthCache && now - playwrightHealthCache.checkedAt < HEALTH_CACHE_MS) {
    return playwrightHealthCache.ok;
  }
  const ok = await isPlaywrightServerAvailable().catch(() => false);
  playwrightHealthCache = { ok, checkedAt: now };
  return ok;
}

async function probeCloudflare(): Promise<boolean> {
  if (!isCloudflareConfigured()) return false;
  const now = Date.now();
  if (cfHealthCache && now - cfHealthCache.checkedAt < HEALTH_CACHE_MS) {
    return cfHealthCache.ok;
  }
  const ok = await isCloudflareWorkerOnline().catch(() => false);
  cfHealthCache = { ok, checkedAt: now };
  return ok;
}

/**
 * Download the currently-rendered CV as a PDF.
 *
 * Strategy (in order):
 *   1. Local Playwright server (port 3001 via /__pdf proxy) — dev / Replit.
 *   2. Cloudflare resume-pdf-worker — production fallback.
 *
 * No jsPDF reconstruction — that path produced a different layout than the
 * on-screen preview and was the root cause of "Professional template broken
 * when downloaded".
 */
export async function downloadCV(opts: DownloadCVOptions): Promise<DownloadCVResult> {
  const { fileName, containerEl, onStatus } = opts;

  // ── Telemetry: capture per-stage timings so we can show "PDF ready in X.Xs"
  // in the UI and surface a structured log entry for debugging slow downloads.
  // Times are in ms, derived from performance.now() to avoid clock drift.
  const t0 = performance.now();
  const timing: NonNullable<DownloadCVResult['timing']> = {};

  const finish = (
    result: Omit<DownloadCVResult, 'totalMs' | 'timing'>,
  ): DownloadCVResult => {
    const totalMs = Math.round(performance.now() - t0);
    const full: DownloadCVResult = { ...result, totalMs, timing };
    // Single structured log line — easy to grep in browser devtools and to
    // wire into a future analytics sink without re-instrumenting callers.
    // eslint-disable-next-line no-console
    console.info('[pdf-telemetry]', {
      ok: full.ok,
      via: full.via ?? null,
      totalMs,
      probeMs: timing.probeMs ?? null,
      htmlMs: timing.htmlMs ?? null,
      renderMs: timing.renderMs ?? null,
      fileName,
      error: full.error ?? null,
    });
    return full;
  };

  // ── Tier 1: Local Playwright ────────────────────────────────────────────
  try {
    const tProbe = performance.now();
    const playwrightUp = await probePlaywright();
    timing.probeMs = Math.round(performance.now() - tProbe);

    if (playwrightUp) {
      onStatus?.('Rendering preview…');
      const tRender = performance.now();
      const r = await downloadViaPlaywright(fileName, containerEl);
      timing.renderMs = Math.round(performance.now() - tRender);
      if (r.success) return finish({ ok: true, via: 'playwright' });
      console.warn('[cvDownloadService] Playwright failed:', r.error);
      // Invalidate cache — server may have crashed mid-request.
      playwrightHealthCache = null;
    }
  } catch (e) {
    console.warn('[cvDownloadService] Playwright error:', e);
    playwrightHealthCache = null;
  }

  // ── Tier 2: Cloudflare Worker ────────────────────────────────────────────
  try {
    const tProbe2 = performance.now();
    const cfUp = await probeCloudflare();
    // Add CF probe time on top of (any) tier-1 probe — represents total
    // pre-flight overhead for this download.
    timing.probeMs = (timing.probeMs ?? 0) + Math.round(performance.now() - tProbe2);

    if (cfUp) {
      onStatus?.('Sending to Cloudflare renderer…');
      const tHtml = performance.now();
      const html = await getCVHtml({
        containerEl,
        extraStyles: `
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { margin: 0; padding: 0; }
        `,
      });
      timing.htmlMs = Math.round(performance.now() - tHtml);
      if (html) {
        const tRender2 = performance.now();
        const r = await generateAndDownloadViaCF({
          html,
          filename: fileName,
          format: 'A4',
          onStatus,
        });
        timing.renderMs = Math.round(performance.now() - tRender2);
        if (r.ok) return finish({ ok: true, via: 'cloudflare' });
        console.warn('[cvDownloadService] Cloudflare failed:', r.error);
        cfHealthCache = null;
      }
    }
  } catch (e) {
    console.warn('[cvDownloadService] Cloudflare error:', e);
    cfHealthCache = null;
  }

  // ── No renderer available ───────────────────────────────────────────────
  return finish({
    ok: false,
    error:
      'PDF renderer unavailable. Please refresh the page or try again in a moment. ' +
      'If the problem persists, contact support.',
  });
}

/**
 * Reset cached health probes. Call this when a renderer config changes
 * (e.g. user updates VITE_PDF_WORKER_URL via Settings).
 */
export function resetDownloadHealthCache(): void {
  playwrightHealthCache = null;
  cfHealthCache = null;
}

// ────────────────────────────────────────────────────────────────────────────
// Off-screen CV → PDF bytes (used by PDFMerger)
//
// PDFMerger needs PDF bytes for saved CVs that are NOT currently rendered on
// screen. We mount <CVPreview> into a hidden, off-screen container, capture
// the same HTML the on-screen download path uses, render via Playwright /
// Cloudflare, and return the bytes. Same renderer = same pixel output.
// ────────────────────────────────────────────────────────────────────────────

export interface GetCVPdfBytesOptions {
  cvData: CVData;
  personalInfo: PersonalInfo;
  template: TemplateName;
  fileName?: string;
  /**
   * Milliseconds to wait after mounting React before capturing HTML — gives
   * fonts/images a chance to load. Default 350ms which is enough for cached
   * fonts; bump to 800-1200ms if you see missing webfonts in the output.
   */
  settleMs?: number;
}

export interface GetCVPdfBytesResult {
  ok: boolean;
  bytes?: Uint8Array;
  via?: 'playwright' | 'cloudflare';
  error?: string;
}

/** Wait for document fonts to load (best-effort, short ceiling). */
function waitForFonts(maxMs = 800): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.ready?.then !== 'function') {
    return new Promise((r) => setTimeout(r, 100));
  }
  return Promise.race([
    fonts.ready.then(() => undefined),
    new Promise<void>((r) => setTimeout(r, maxMs)),
  ]);
}

/**
 * Render a CV (which may not be on screen) into an off-screen DOM node and
 * return the PDF bytes via the same pixel-perfect renderer chain the live
 * download uses.
 */
export async function getCVPdfBytes(
  opts: GetCVPdfBytesOptions,
): Promise<GetCVPdfBytesResult> {
  const { cvData, personalInfo, template, fileName = 'cv.pdf', settleMs = 350 } = opts;

  // Mount off-screen — kept on the layout tree so widths/heights are real,
  // but visually hidden via clipping + position so the user never sees it.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:210mm',          // A4 width — matches CVPreview's min-w-[210mm]
    'pointer-events:none',
    'opacity:0',
    'z-index:-1',
    'overflow:hidden',
    'clip-path:inset(50%)',
  ].join(';');
  document.body.appendChild(host);

  let root: Root | null = null;
  try {
    root = createRoot(host);
    flushSync(() => {
      root!.render(
        React.createElement(CVPreview, {
          cvData,
          personalInfo,
          template,
          isEditing: false,
          onDataChange: () => {},
          jobDescriptionForATS: '',
        }),
      );
    });

    // Let layout / fonts / images settle before capture.
    await waitForFonts();
    await new Promise((r) => setTimeout(r, settleMs));

    // CVPreview wraps its template in a <div data-cv-preview="true">. Find it
    // INSIDE our off-screen host so we don't accidentally pick up another
    // preview elsewhere in the DOM.
    const previewEl = host.querySelector<HTMLElement>(
      '[data-cv-preview], #cv-preview-area',
    );
    if (!previewEl) {
      return { ok: false, error: 'Off-screen CV preview did not mount.' };
    }

    const fullHtml = await getCVHtml({
      containerEl: previewEl,
      extraStyles: `
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        body { margin: 0; padding: 0; }
      `,
    });
    if (!fullHtml) {
      return { ok: false, error: 'Failed to capture CV HTML.' };
    }

    // ── Tier 1: Local Playwright ─────────────────────────────────────────
    if (await probePlaywright()) {
      const r = await renderHtmlToPdfBytes(fullHtml, fileName);
      if (r.ok) return { ok: true, bytes: r.bytes, via: 'playwright' };
      console.warn('[getCVPdfBytes] Playwright failed:', r.error);
      playwrightHealthCache = null;
    }

    // ── Tier 2: Cloudflare Worker ────────────────────────────────────────
    if (await probeCloudflare()) {
      const r = await renderHtmlToPdfBytesViaCF({
        html: fullHtml,
        filename: fileName,
        format: 'A4',
      });
      if (r.ok) return { ok: true, bytes: r.bytes, via: 'cloudflare' };
      console.warn('[getCVPdfBytes] Cloudflare failed:', r.error);
      cfHealthCache = null;
    }

    return {
      ok: false,
      error:
        'PDF renderer unavailable. Please refresh the page or try again in a moment.',
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // Always clean up — React 19 unmount + DOM removal.
    try { root?.unmount(); } catch { /* noop */ }
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}
