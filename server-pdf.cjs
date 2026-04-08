/**
 * Playwright PDF Generation Server — port 5001
 * Receives HTML + CSS from the frontend, renders via Chromium headless,
 * and returns a pixel-perfect A4 PDF.
 */

const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', engine: 'playwright-chromium' });
});

/**
 * GET /api/fetch-file?url={encoded}
 * Server-side fetch proxy for CORS-restricted sources (e.g. Google Docs export).
 * Only allows requests to trusted document-hosting domains.
 */
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

    const allowed = ALLOWED_PROXY_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
    if (!allowed) {
        return res.status(403).json({ error: 'Domain not allowed' });
    }

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
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/generate-pdf
 * Body: { html: string, css?: string, filename?: string }
 * Returns: PDF binary (application/pdf)
 */
app.post('/api/generate-pdf', async (req, res) => {
    const { html, css = '', fullHtml, filename = 'cv.pdf' } = req.body;

    if (!html && !fullHtml) {
        return res.status(400).json({ error: 'html or fullHtml is required' });
    }

    let browser = null;
    try {
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
            ]
        });

        const page = await browser.newPage();

        // If a complete self-contained HTML document is provided (preferred path),
        // use it directly so the PDF exactly matches the on-screen preview including
        // all colours, sidebars, partitions, fonts and gradients.
        // Legacy path: plain html + optional css snippet, wrapped in a basic shell.
        const pageContent = fullHtml || `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1e293b; }
    ${css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

        await page.setContent(pageContent, { waitUntil: 'networkidle' });

        // Wait for all fonts and images to fully load before capturing
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(800);

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
            preferCSSPageSize: false,
        });

        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': pdfBuffer.length,
        });
        res.send(pdfBuffer);

    } catch (err) {
        if (browser) await browser.close().catch(() => {});
        console.error('[PDF Server] Error:', err);
        res.status(500).json({ error: err.message || 'PDF generation failed' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PDF Server] Playwright PDF server running on port ${PORT}`);
    console.log(`[PDF Server] Health check: http://localhost:${PORT}/health`);
});
