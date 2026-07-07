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
import {
  canDownloadPdf,
  needsWatermark,
  isPureFreeTier,
  incrementPdfDownloadCount,
} from './accountTierService';
import CVPreview from '../components/CVPreview';
import type { CVData, PersonalInfo, TemplateName } from '../types';
import { buildCoverLetterHtml, type CoverLetterTemplate } from './coverLetterHtmlService';

// ── Cover letter text normaliser ─────────────────────────────────────────────
// Ensures the raw AI-generated letter text has proper paragraph breaks before
// it is passed to buildCoverLetterHtml(). This mirrors the formatLetterForDisplay()
// logic in CoverLetterPreview.tsx so on-screen and PDF output always match.
function normaliseCoverLetterText(raw: string): string {
  if (!raw) return raw;
  // Already has double-newline paragraphs → nothing to do
  if (/\n\n/.test(raw)) return raw;

  // Flatten any single newlines into one string, then reconstruct paragraphs
  const flat = raw.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Extract salutation ("Dear Hiring Manager,")
  let salutation = '';
  let rest = flat;
  const salMatch = flat.match(/^(Dear\s[^,:]+[,:])\s*/i);
  if (salMatch) { salutation = salMatch[1]; rest = flat.slice(salMatch[0].length).trim(); }

  // Extract closing ("Sincerely, / Best regards,")
  let closing = '';
  const closingIdx = rest.search(
    /\b(Sincerely|Best regards|Kind regards|Warm regards|Yours faithfully|Yours sincerely|Yours truly|With regards|Regards|Respectfully|Thank you)[,.]?(\s|$)/i
  );
  if (closingIdx !== -1) { closing = rest.slice(closingIdx).trim(); rest = rest.slice(0, closingIdx).trim(); }

  // Split body into ~3-sentence paragraphs
  const sentences = rest
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map(s => s.trim())
    .filter(Boolean);
  const bodyParas: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    bodyParas.push(sentences.slice(i, i + 3).join(' '));
  }

  const parts: string[] = [];
  if (salutation) parts.push(salutation);
  parts.push(...bodyParas);
  if (closing)    parts.push(closing);
  return parts.join('\n\n');
}

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
  /**
   * Force the watermark on/off regardless of the viewer's own tier.
   * Use this when the watermark decision was made by the CV *creator*
   * (e.g. shared-link downloads) rather than the current viewer.
   */
  forceWatermark?: boolean;
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
    probeMs?: number;
    htmlMs?: number;
    renderMs?: number;
  };
  /**
   * True when the download was blocked before any render attempt.
   * Callers should open the pricing/upgrade modal when this is set.
   */
  blocked?: boolean;
  /** Why the download was blocked — used to show the right upgrade message. */
  blockedReason?: 'pdf_limit';
  /** True when the PDF includes a ProCV watermark (free / BYOK users). */
  watermarked?: boolean;
}

// ── Health probe cache ───────────────────────────────────────────────────────
// Avoids hitting `/health` on every download click (saved ~2s on the slow path).
let playwrightHealthCache: { ok: boolean; checkedAt: number } | null = null;
let cfHealthCache: { ok: boolean; checkedAt: number } | null = null;
const HEALTH_CACHE_MS = 30_000;

// ── PDF bytes cache ──────────────────────────────────────────────────────────
// Keyed by a fast hash of the exact HTML sent to the renderer. If the user
// downloads the same CV twice in a row (double-click, re-download after
// switching tabs, etc.) with nothing changed, we skip the render round-trip
// entirely and re-serve the same bytes instantly. Purely additive — the
// render path itself is untouched, this only short-circuits repeat work.
interface PdfCacheEntry { bytes: Uint8Array; via: 'playwright' | 'cloudflare'; cachedAt: number }
const pdfBytesCache = new Map<string, PdfCacheEntry>();
const PDF_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a re-click, short enough to never serve stale content after real edits
const PDF_CACHE_MAX_ENTRIES = 3; // bounded so embedded-font HTML + PDF bytes never accumulate unbounded memory

/** Cheap, fast, non-cryptographic hash (FNV-1a) — collision risk is irrelevant here since a false hit just re-serves identical bytes for identical HTML. */
function hashHtml(html: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < html.length; i++) {
    h1 ^= html.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return `${html.length}:${(h1 >>> 0).toString(36)}`;
}

function getCachedPdf(key: string): PdfCacheEntry | null {
  const entry = pdfBytesCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > PDF_CACHE_TTL_MS) {
    pdfBytesCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedPdf(key: string, bytes: Uint8Array, via: 'playwright' | 'cloudflare'): void {
  pdfBytesCache.set(key, { bytes, via, cachedAt: Date.now() });
  // Evict oldest entries beyond the cap (Map preserves insertion order).
  while (pdfBytesCache.size > PDF_CACHE_MAX_ENTRIES) {
    const oldestKey = pdfBytesCache.keys().next().value;
    if (oldestKey === undefined) break;
    pdfBytesCache.delete(oldestKey);
  }
}

/** Clear the in-memory PDF bytes cache — call after any CV edit so a stale render is never re-served. */
export function invalidatePdfCache(): void {
  pdfBytesCache.clear();
}

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

  // ── Free-tier PDF gate ────────────────────────────────────────────────────
  // Pure free users (no BYOK keys, no premium) are capped at FREE_PDF_LIMIT
  // lifetime downloads. BYOK and premium users always proceed.
  if (!canDownloadPdf()) {
    return {
      ok: false,
      blocked: true,
      blockedReason: 'pdf_limit',
      error: 'Free PDF download limit reached. Upgrade to download more.',
      totalMs: 0,
    };
  }

  // Determine if a watermark footer should be added to this PDF.
  // forceWatermark (from shared-link downloads) takes priority over the
  // viewer's own tier so the creator's decision is always honoured.
  const watermark = opts.forceWatermark !== undefined ? opts.forceWatermark : needsWatermark();

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

  // ── Capture the exact HTML once, up front ───────────────────────────────
  // Previously each tier ran its own getCVHtml() pass (extra DOM clone +
  // stylesheet capture on every fallback). Capturing once means: (a) a single
  // cost regardless of how many tiers we try, and (b) a stable cache key so
  // repeat downloads of an unchanged CV can skip rendering entirely.
  const tHtml = performance.now();
  const html = await getCVHtml({
    containerEl,
    extraStyles: `
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      body { margin: 0; padding: 0; }
    `,
    watermark,
  });
  timing.htmlMs = Math.round(performance.now() - tHtml);

  if (!html) {
    return finish({
      ok: false,
      error: 'CV preview element not found. Please ensure the CV is visible on screen.',
    });
  }

  // ── Cache short-circuit ──────────────────────────────────────────────────
  const cacheKey = hashHtml(html);
  const cached = getCachedPdf(cacheKey);
  if (cached) {
    onStatus?.('Preparing your PDF…');
    triggerPdfDownload(cached.bytes, fileName);
    if (isPureFreeTier()) incrementPdfDownloadCount();
    return finish({ ok: true, via: cached.via, watermarked: watermark });
  }

  // ── Tier 1: Local Playwright ────────────────────────────────────────────
  try {
    const tProbe = performance.now();
    const playwrightUp = await probePlaywright();
    timing.probeMs = Math.round(performance.now() - tProbe);

    if (playwrightUp) {
      onStatus?.('Rendering preview…');
      const tRender = performance.now();
      const r = await renderHtmlToPdfBytes(html, fileName);
      timing.renderMs = Math.round(performance.now() - tRender);
      if (r.ok && r.bytes) {
        triggerPdfDownload(r.bytes, fileName);
        setCachedPdf(cacheKey, r.bytes, 'playwright');
        if (isPureFreeTier()) incrementPdfDownloadCount();
        return finish({ ok: true, via: 'playwright', watermarked: watermark });
      }
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
      const tRender2 = performance.now();
      const r = await renderHtmlToPdfBytesViaCF({
        html,
        filename: fileName,
        format: 'A4',
        onStatus,
      });
      timing.renderMs = Math.round(performance.now() - tRender2);
      if (r.ok && r.bytes) {
        triggerPdfDownload(r.bytes, fileName);
        setCachedPdf(cacheKey, r.bytes, 'cloudflare');
        if (isPureFreeTier()) incrementPdfDownloadCount();
        return finish({ ok: true, via: 'cloudflare', watermarked: watermark });
      }
      console.warn('[cvDownloadService] Cloudflare failed:', r.error);
      cfHealthCache = null;
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
// Cover Letter → PDF  (Playwright → Cloudflare → jsPDF fallback)
// ────────────────────────────────────────────────────────────────────────────

function triggerPdfDownload(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface DownloadCoverLetterResult {
  ok: boolean;
  via?: 'playwright' | 'cloudflare' | 'jspdf';
  error?: string;
}

/**
 * Download a cover letter as a high-quality PDF.
 * Attempts Playwright (local dev server), then the Cloudflare Worker, then
 * falls back to the legacy jsPDF path so it always produces a file.
 */
export async function downloadCoverLetterViaWorker(
  letterText: string,
  fileName: string,
  template: CoverLetterTemplate = 'modern',
  personalInfo?: PersonalInfo,
  onStatus?: (msg: string) => void,
): Promise<DownloadCoverLetterResult> {
  // Always normalise first so flat AI output gets proper paragraph breaks
  // before HTML building — this guarantees PDF matches on-screen preview.
  const normalisedText = normaliseCoverLetterText(letterText);
  const html = buildCoverLetterHtml(normalisedText, template, personalInfo);

  // ── Tier 1: Local Playwright ─────────────────────────────────────────────
  try {
    const playwrightUp = await probePlaywright();
    if (playwrightUp) {
      onStatus?.('Generating your PDF…');
      const r = await renderHtmlToPdfBytes(html, fileName);
      if (r.ok && r.bytes) {
        onStatus?.('Saving your PDF…');
        triggerPdfDownload(r.bytes, fileName);
        return { ok: true, via: 'playwright' };
      }
      playwrightHealthCache = null;
    }
  } catch {
    playwrightHealthCache = null;
  }

  // ── Tier 2: Cloudflare Worker ────────────────────────────────────────────
  try {
    const cfUp = await probeCloudflare();
    if (cfUp) {
      onStatus?.('Rendering your PDF…');
      const r = await generateAndDownloadViaCF({ html, filename: fileName, format: 'A4', onStatus });
      if (r.ok) {
        onStatus?.('Saving your PDF…');
        return { ok: true, via: 'cloudflare' };
      }
      cfHealthCache = null;
    }
  } catch {
    cfHealthCache = null;
  }

  // ── Tier 3: jsPDF fallback ───────────────────────────────────────────────
  try {
    const { downloadCoverLetterAsPDF } = await import('./pdfService');
    onStatus?.('Saving your PDF…');
    downloadCoverLetterAsPDF(normalisedText, fileName, template as 'modern' | 'professional' | 'executive' | 'academic' | 'creative', personalInfo);
    return { ok: true, via: 'jspdf' };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'PDF generation failed.',
    };
  }
}

/**
 * Get cover letter PDF as bytes (for merging / preview). Same renderer chain
 * as downloadCoverLetterViaWorker but returns Uint8Array instead of saving.
 */
export async function getCoverLetterPdfBytes(
  letterText: string,
  fileName: string,
  template: CoverLetterTemplate = 'modern',
  personalInfo?: PersonalInfo,
): Promise<{ ok: boolean; bytes?: Uint8Array; error?: string }> {
  const html = buildCoverLetterHtml(letterText, template, personalInfo);

  if (await probePlaywright()) {
    const r = await renderHtmlToPdfBytes(html, fileName);
    if (r.ok) return { ok: true, bytes: r.bytes };
    playwrightHealthCache = null;
  }

  if (await probeCloudflare()) {
    const r = await renderHtmlToPdfBytesViaCF({ html, filename: fileName, format: 'A4' });
    if (r.ok) return { ok: true, bytes: r.bytes };
    cfHealthCache = null;
  }

  return { ok: false, error: 'PDF renderer unavailable.' };
}

// ────────────────────────────────────────────────────────────────────────────
// Off-screen CV → PDF bytes
//
// Renders a saved CV that is NOT currently visible on screen: mounts
// <CVPreview> into a hidden off-screen container, captures the same HTML the
// on-screen download path uses, renders via Playwright / Cloudflare, and
// returns the bytes. Same renderer = pixel-perfect output.
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
