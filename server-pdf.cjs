/**
 * Playwright PDF Generation Server — port 3001
 *
 * Improvements over v1:
 * - Persistent Chromium browser: launched once at startup and reused across
 *   all requests — eliminates the ~2s per-request browser startup penalty.
 * - Page-level isolation: each request opens a new page, renders, then closes
 *   it — no shared state between requests.
 * - Concurrency limiter: at most MAX_CONCURRENT pages render simultaneously;
 *   excess requests queue rather than spawning unlimited pages.
 * - Auto-recovery: if the browser crashes the server automatically relaunches
 *   it before the next request.
 * - Performance logging: every request logs its duration so slow renders are
 *   immediately visible in the console.
 */

'use strict';

const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const PORT = 3001;
const MAX_CONCURRENT = 3; // max simultaneous Playwright pages

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// ─── Browser pool ──────────────────────────────────────────────────────────────

let browser = null;
let activePgs = 0;
let waitQueue = [];   // array of () => void resolve callbacks

async function getBrowserArgs() {
    const { execSync } = require('child_process');
    let executablePath;
    try {
        executablePath = execSync('which chromium').toString().trim();
    } catch {
        executablePath = undefined;
    }
    return {
        headless: true,
        ...(executablePath ? { executablePath } : {}),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions',
            '--disable-background-networking',
        ],
    };
}

async function ensureBrowser() {
    if (browser && browser.isConnected()) return browser;
    console.log('[PDF Server] Launching Chromium browser…');
    const args = await getBrowserArgs();
    browser = await chromium.launch(args);
    browser.on('disconnected', () => {
        console.warn('[PDF Server] Browser disconnected — will relaunch on next request.');
        browser = null;
    });
    console.log('[PDF Server] Browser ready.');
    return browser;
}

/** Acquire a concurrency slot — waits if MAX_CONCURRENT is reached. */
function acquireSlot() {
    return new Promise((resolve) => {
        if (activePgs < MAX_CONCURRENT) {
            activePgs++;
            resolve();
        } else {
            waitQueue.push(() => { activePgs++; resolve(); });
        }
    });
}

/** Release a concurrency slot and wake the next queued request (if any). */
function releaseSlot() {
    activePgs = Math.max(0, activePgs - 1);
    const next = waitQueue.shift();
    if (next) next();
}

/**
 * Render HTML to a PDF buffer using a Playwright page.
 * The browser is reused; only the page is opened/closed per request.
 */
async function renderPdf(pageContent) {
    await acquireSlot();
    const b = await ensureBrowser();
    const page = await b.newPage();
    try {
        // 794 × 1123 px ≈ A4 at 96 dpi — matches the browser preview exactly
        await page.setViewportSize({ width: 794, height: 1123 });
        await page.setContent(pageContent, { waitUntil: 'networkidle', timeout: 25000 });
        // Wait for all web fonts to load before snapshotting
        await page.evaluate(() => document.fonts.ready);
        // Extra stabilisation: CSS transitions, lazy images, font swap
        await page.waitForTimeout(600);
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
            preferCSSPageSize: true,
        });
        return pdfBuffer;
    } finally {
        await page.close().catch(() => { });
        releaseSlot();
    }
}

// ─── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        engine: 'playwright-chromium',
        browserConnected: !!(browser && browser.isConnected()),
        activePages: activePgs,
        queued: waitQueue.length,
    });
});

// ─── CORS-proxy for trusted document sources ───────────────────────────────────

const ALLOWED_PROXY_HOSTS = [
    'docs.google.com',
    'drive.google.com',
    'doc-0a-6o-docs.googleusercontent.com',
    'doc-14-6o-docs.googleusercontent.com',
];

app.get('/api/fetch-file', async (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
        return res.status(400).json({ error: 'url query param required' });
    }
    let parsed;
    try { parsed = new URL(rawUrl); } catch {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    const allowed = ALLOWED_PROXY_HOSTS.some(
        h => parsed.hostname === h || parsed.hostname.endsWith('.' + h)
    );
    if (!allowed) return res.status(403).json({ error: 'Domain not allowed' });

    try {
        const upstream = await fetch(rawUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CVBuilder/1.0)' },
            redirect: 'follow',
        });
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
        }
        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        res.set('Content-Type', contentType);
        res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PDF generation endpoint ───────────────────────────────────────────────────

/**
 * POST /api/generate-pdf
 * Body: { html?: string, css?: string, fullHtml?: string, filename?: string }
 * Returns: PDF binary (application/pdf)
 *
 * Preferred: send `fullHtml` (a complete self-contained HTML document) so
 * colours, fonts, and layouts render exactly as they appear in the preview.
 * Legacy: send `html` + optional `css` snippet — these are wrapped in a
 * minimal shell document.
 */
app.post('/api/generate-pdf', async (req, res) => {
    const t0 = Date.now();
    const { html, css = '', fullHtml, filename = 'cv.pdf' } = req.body;

    if (!html && !fullHtml) {
        return res.status(400).json({ error: 'html or fullHtml is required' });
    }

    const pageContent = fullHtml || `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1e293b; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    ${css}
  </style>
</head>
<body>${html}</body>
</html>`;

    try {
        const pdfBuffer = await renderPdf(pageContent);
        const elapsed = Date.now() - t0;
        console.log(`[PDF Server] Generated "${filename}" in ${elapsed}ms (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': pdfBuffer.length,
        });
        res.send(pdfBuffer);
    } catch (err) {
        const elapsed = Date.now() - t0;
        console.error(`[PDF Server] Error after ${elapsed}ms:`, err.message);
        res.status(500).json({ error: err.message || 'PDF generation failed' });
    }
});

// ─── Start server & pre-warm browser ──────────────────────────────────────────

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[PDF Server] Playwright PDF server running on port ${PORT}`);
    console.log(`[PDF Server] Health check: http://localhost:${PORT}/health`);
    // Pre-warm the browser so the first real request is fast
    try {
        await ensureBrowser();
        console.log('[PDF Server] Browser pre-warmed and ready.');
    } catch (err) {
        console.warn('[PDF Server] Pre-warm failed — will retry on first request:', err.message);
    }
});
