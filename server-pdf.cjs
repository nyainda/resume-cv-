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
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', engine: 'playwright-chromium' });
});

/**
 * POST /api/generate-pdf
 * Body: { html: string, css?: string, filename?: string }
 * Returns: PDF binary (application/pdf)
 */
app.post('/api/generate-pdf', async (req, res) => {
    const { html, css = '', filename = 'cv.pdf' } = req.body;

    if (!html) {
        return res.status(400).json({ error: 'html is required' });
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

        // Build a complete HTML document with all required styles
        const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Base reset */
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: white; }

    /* Tailwind-compatible base classes used by CV templates */
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1e293b; }

    /* Font weight utilities */
    .font-black { font-weight: 900; }
    .font-extrabold { font-weight: 800; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-medium { font-weight: 500; }
    .font-normal { font-weight: 400; }

    /* Text size utilities */
    .text-xs { font-size: 0.75rem; line-height: 1rem; }
    .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
    .text-base { font-size: 1rem; line-height: 1.5rem; }
    .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
    .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
    .text-2xl { font-size: 1.5rem; line-height: 2rem; }
    .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
    .text-4xl { font-size: 2.25rem; line-height: 2.5rem; }
    .text-\\[10px\\] { font-size: 10px; }

    /* Spacing */
    .p-10 { padding: 2.5rem; }
    .p-12 { padding: 3rem; }
    .mb-1 { margin-bottom: 0.25rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-5 { margin-bottom: 1.25rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mt-0\\.5 { margin-top: 0.125rem; }
    .gap-2 { gap: 0.5rem; }
    .gap-3 { gap: 0.75rem; }
    .gap-x-3 { column-gap: 0.75rem; }
    .gap-y-1 { row-gap: 0.25rem; }
    .space-y-1 > * + * { margin-top: 0.25rem; }
    .space-y-3 > * + * { margin-top: 0.75rem; }
    .space-y-5 > * + * { margin-top: 1.25rem; }
    .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .pb-1 { padding-bottom: 0.25rem; }

    /* Layout */
    .flex { display: flex; }
    .flex-wrap { flex-wrap: wrap; }
    .items-start { align-items: flex-start; }
    .items-center { align-items: center; }
    .items-baseline { align-items: baseline; }
    .justify-between { justify-content: space-between; }
    .flex-shrink-0 { flex-shrink: 0; }
    .flex-1 { flex: 1 1 0%; }
    .ml-3 { margin-left: 0.75rem; }
    .mt-0\\.5 { margin-top: 0.125rem; }

    /* Colors — slate */
    .text-slate-900 { color: #0f172a; }
    .text-slate-800 { color: #1e293b; }
    .text-slate-700 { color: #334155; }
    .text-slate-600 { color: #475569; }
    .text-slate-500 { color: #64748b; }
    .text-slate-400 { color: #94a3b8; }
    .text-slate-300 { color: #cbd5e1; }
    .text-slate-200 { color: #e2e8f0; }
    .bg-white { background-color: #ffffff; }

    /* Colors — cyan */
    .text-cyan-700 { color: #0e7490; }
    .text-cyan-600 { color: #0891b2; }
    .bg-cyan-50 { background-color: #ecfeff; }

    /* Colors — purple */
    .text-purple-600 { color: #9333ea; }

    /* Borders */
    .border { border-width: 1px; border-style: solid; border-color: #e2e8f0; }
    .border-b { border-bottom-width: 1px; border-bottom-style: solid; }
    .border-slate-200 { border-color: #e2e8f0; }
    .rounded { border-radius: 0.25rem; }
    .rounded-sm { border-radius: 0.125rem; }
    .rounded-full { border-radius: 9999px; }

    /* Tracking */
    .tracking-tight { letter-spacing: -0.025em; }
    .tracking-widest { letter-spacing: 0.1em; }

    /* Leading */
    .leading-tight { line-height: 1.25; }
    .leading-relaxed { line-height: 1.625; }

    /* Height */
    .h-0\\.5 { height: 0.125rem; }

    /* Misc */
    .uppercase { text-transform: uppercase; }
    .relative { position: relative; }
    .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }

    /* Injected user styles */
    ${css}

    /* Print/PDF overrides */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

        await page.setContent(fullHtml, { waitUntil: 'networkidle' });

        // Wait for fonts and images to settle
        await page.waitForTimeout(500);

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
