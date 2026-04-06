/**
 * Playwright PDF Service
 * Calls the server-side Playwright PDF generator (port 5001) for pixel-perfect PDFs.
 * Falls back gracefully if the server is not running.
 */

const PDF_SERVER_URL = `${window.location.protocol}//${window.location.hostname}:3001`;

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
 * Capture the current CV preview HTML from the DOM and send to the Playwright server.
 * Returns true if successful, false if the server is not available.
 */
export const downloadViaPlaywright = async (
    filename = 'cv.pdf',
    previewElementId = 'cv-preview-area'
): Promise<{ success: boolean; error?: string }> => {
    const el = document.getElementById(previewElementId);
    if (!el) {
        return { success: false, error: 'Preview element not found. Please ensure the CV preview is visible.' };
    }

    const html = el.outerHTML;

    try {
        const res = await fetch(`${PDF_SERVER_URL}/api/generate-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html, filename }),
            signal: AbortSignal.timeout(30000),
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
            return { success: false, error: 'PDF server timed out. The server may not be running.' };
        }
        return { success: false, error: err?.message || 'Failed to connect to PDF server' };
    }
};
