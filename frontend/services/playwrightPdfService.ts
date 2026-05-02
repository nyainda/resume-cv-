/**
 * Playwright PDF Service
 * Calls the server-side Playwright PDF generator (port 3001) for pixel-perfect PDFs.
 * Captures the full live DOM including all CSS so the output matches the preview exactly.
 * Falls back gracefully if the server is not running.
 */

import { getCVHtml } from './getCVHtml';

// Same-origin proxy path. Vite (dev) proxies /__pdf -> http://localhost:3001.
// In production builds, configure the same proxy on your server / hosting provider.
const PDF_SERVER_URL = '/__pdf';

export interface PlaywrightPdfOptions {
    previewElementId?: string;
    filename?: string;
}

/**
 * Check if the Playwright PDF server is available.
 *
 * IMPORTANT: a bare `res.ok` check is not enough. In production (e.g. Vercel),
 * any unknown path is rewritten to `/index.html` and returns `200 OK` — which
 * would falsely report the local PDF server as available and cause downstream
 * POSTs to `/__pdf/api/generate-pdf` to fail with 405. We therefore verify the
 * response body actually comes from the Playwright PDF server.
 */
export const isPlaywrightServerAvailable = async (): Promise<boolean> => {
    try {
        const res = await fetch(`${PDF_SERVER_URL}/health`, {
            signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) return false;
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return false;
        const body = await res.json().catch(() => null);
        return Boolean(body && body.engine === 'playwright-chromium');
    } catch {
        return false;
    }
};

export interface PdfBytesResult {
    ok: boolean;
    bytes?: Uint8Array;
    error?: string;
}

/**
 * POST a self-contained HTML document to the Playwright server and return the
 * resulting PDF bytes. Used by both the download flow (downloadViaPlaywright)
 * and the merge flow (PDFMerger via cvDownloadService.getCVPdfBytes).
 */
export const renderHtmlToPdfBytes = async (
    fullHtml: string,
    filename = 'cv.pdf',
): Promise<PdfBytesResult> => {
    try {
        const res = await fetch(`${PDF_SERVER_URL}/api/generate-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullHtml, filename }),
            signal: AbortSignal.timeout(45000),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Server error' }));
            return { ok: false, error: err.error || 'PDF server returned an error' };
        }

        const buf = await res.arrayBuffer();
        return { ok: true, bytes: new Uint8Array(buf) };
    } catch (err: any) {
        if (err?.name === 'TimeoutError') {
            return { ok: false, error: 'PDF server timed out.' };
        }
        return { ok: false, error: err?.message || 'Failed to connect to PDF server' };
    }
};

/**
 * Capture the current CV preview — including ALL CSS from the live app — and
 * send it as a self-contained HTML document to the Playwright server.
 * This guarantees the downloaded PDF matches the on-screen preview exactly:
 * colours, sidebar layouts, partitions, gradients, fonts — everything.
 *
 * Pass `containerEl` from modals/portals so we capture the right CVPreview when
 * multiple are mounted (editor + preview modal).
 */
export const downloadViaPlaywright = async (
    filename = 'cv.pdf',
    containerEl?: HTMLElement | null,
): Promise<{ success: boolean; error?: string }> => {
    const fullHtml = await getCVHtml({
        containerEl,
        extraStyles: `
            /* Force background colours to print */
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
            body { margin: 0; padding: 0; }
        `,
    });

    if (!fullHtml) {
        return { success: false, error: 'CV preview element not found. Please ensure the CV is visible on screen.' };
    }

    const result = await renderHtmlToPdfBytes(fullHtml, filename);
    if (!result.ok) {
        return { success: false, error: result.error };
    }

    const blob = new Blob([result.bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true };
};
