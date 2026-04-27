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

import {
  downloadViaPlaywright,
  isPlaywrightServerAvailable,
} from './playwrightPdfService';
import {
  isCloudflareConfigured,
  isCloudflareWorkerOnline,
  generateAndDownloadViaCF,
} from './cloudflareWorkerService';
import { getCVHtml } from './getCVHtml';

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

  // ── Tier 1: Local Playwright ────────────────────────────────────────────
  try {
    if (await probePlaywright()) {
      onStatus?.('Rendering preview…');
      const r = await downloadViaPlaywright(fileName, containerEl);
      if (r.success) return { ok: true, via: 'playwright' };
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
    if (await probeCloudflare()) {
      onStatus?.('Sending to Cloudflare renderer…');
      const html = await getCVHtml({
        containerEl,
        extraStyles: `
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { margin: 0; padding: 0; }
        `,
      });
      if (html) {
        const r = await generateAndDownloadViaCF({
          html,
          filename: fileName,
          format: 'A4',
          onStatus,
        });
        if (r.ok) return { ok: true, via: 'cloudflare' };
        console.warn('[cvDownloadService] Cloudflare failed:', r.error);
        cfHealthCache = null;
      }
    }
  } catch (e) {
    console.warn('[cvDownloadService] Cloudflare error:', e);
    cfHealthCache = null;
  }

  // ── No renderer available ───────────────────────────────────────────────
  return {
    ok: false,
    error:
      'PDF renderer unavailable. Please refresh the page or try again in a moment. ' +
      'If the problem persists, contact support.',
  };
}

/**
 * Reset cached health probes. Call this when a renderer config changes
 * (e.g. user updates VITE_PDF_WORKER_URL via Settings).
 */
export function resetDownloadHealthCache(): void {
  playwrightHealthCache = null;
  cfHealthCache = null;
}
