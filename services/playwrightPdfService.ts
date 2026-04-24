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
 */
export const isPlaywrightServerAvailable = async (): Promise<boolean> => {
    try {
        const res = await fetch(`${PDF_SERVER_URL}/health`, {
            signal: AbortSignal.timeout(2000),
        });
        return res.ok;
    } catch {
        return false;
    }
};

/**
 * Capture the current CV preview — including ALL CSS from the live app — and
 * send it as a self-contained HTML document to the Playwright server.
 * This guarantees the downloaded PDF matches the on-screen preview exactly:
 * colours, sidebar layouts, partitions, gradients, fonts — everything.
 */
export const downloadViaPlaywright = async (
    filename = 'cv.pdf',
): Promise<{ success: boolean; error?: string }> => {
    const fullHtml = await getCVHtml({
        extraStyles: `
            /* Force background colours to print */
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
            body { margin: 0; padding: 0; }
        `,
    });

    if (!fullHtml) {
        return { success: false, error: 'CV preview element not found. Please ensure the CV is visible on screen.' };
    }

    try {
        const res = await fetch(`${PDF_SERVER_URL}/api/generate-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullHtml, filename }),
            signal: AbortSignal.timeout(45000),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Server error' }));
            return { success: false, error: err.error || 'PDF server returned an error' };
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return { success: true };
    } catch (err: any) {
        if (err?.name === 'TimeoutError') {
            return { success: false, error: 'PDF server timed out.' };
        }
        return { success: false, error: err?.message || 'Failed to connect to PDF server' };
    }
};
