#!/usr/bin/env node
/**
 * scripts/test-pdf-download.mjs
 *
 * Smoke test for the PDF download pipeline. Posts a self-contained HTML
 * document to BOTH the local Playwright server (port 3001) AND the
 * Cloudflare worker (if VITE_PDF_WORKER_URL is set), then asserts:
 *
 *   1. HTTP 200 response
 *   2. Body starts with the "%PDF-" magic header (real PDF, not error JSON)
 *   3. Body is at least 5 KB (sanity floor — empty templates are smaller)
 *   4. Round-trip is under MAX_MS (default 12 000 ms)
 *
 * Run with:
 *   node scripts/test-pdf-download.mjs
 *   node scripts/test-pdf-download.mjs --worker https://my-pdf.workers.dev
 *
 * Exit code is 0 on success, 1 on any failure — wire into CI when ready.
 *
 * NB: this test only validates the rendering chain itself. It does NOT
 * assert pixel-perfect template fidelity (that would need a visual diff).
 * Its job is to catch the regressions the user actually sees: broken/empty
 * downloads, slow downloads, and "renderer unreachable" errors.
 */

'use strict';

const LOCAL_URL    = 'http://localhost:3001';
const ARG_WORKER   = process.argv.find((a) => a.startsWith('--worker='))?.split('=')[1]
                    ?? (process.argv.includes('--worker')
                        ? process.argv[process.argv.indexOf('--worker') + 1]
                        : undefined);
const WORKER_URL   = ARG_WORKER || process.env.VITE_PDF_WORKER_URL || '';
const MAX_MS       = Number(process.env.PDF_TEST_MAX_MS || 12000);
const MIN_BYTES    = 5 * 1024;

// Sample HTML — minimal but uses real Google Fonts + bullet glyphs + emoji
// so a missing-glyph regression would show up as fallback boxes in the
// rendered PDF (we only check size + magic header here, but the assets
// exercise the same code path the user hits).
const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 0mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 24mm; font-family: 'DM Sans', sans-serif; color: #1B2B4B; }
    h1 { font-family: 'Playfair Display', serif; font-size: 40px; margin: 0 0 4mm; color: #1B2B4B; }
    h2 { font-family: 'Playfair Display', serif; font-size: 18px; color: #C9A84C; margin: 8mm 0 2mm; border-bottom: 1px solid #C9A84C; padding-bottom: 1mm; }
    p, li { font-size: 11pt; line-height: 1.5; }
    ul { padding-left: 5mm; }
    .meta { color: #555; margin-bottom: 4mm; }
  </style>
</head>
<body>
  <h1>Jane Doe</h1>
  <p class="meta">jane@example.com — +254 700 000 000 — Nairobi, KE</p>

  <h2>Summary</h2>
  <p>Senior platform engineer with 8+ years building "high-throughput" data services across fintech and health-tech — shipped products serving 2M+ users daily.</p>

  <h2>Experience</h2>
  <ul>
    <li>Designed real-time fraud detection saving KES 8,400,000/month.</li>
    <li>Led migration of 14 micro-services from monolith — zero downtime.</li>
    <li>Mentored 6 engineers; promoted 3 to senior in 18 months.</li>
  </ul>

  <h2>Skills</h2>
  <p>TypeScript • Go • PostgreSQL • Kafka • Kubernetes • Terraform</p>
</body>
</html>`;

const FILENAME = 'smoke-test.pdf';

// ── tiny helpers ──────────────────────────────────────────────────────────

function fmtMs(ms) { return `${ms.toString().padStart(5)}ms`; }
function ok(label)  { console.log(`  ✓ ${label}`); }
function bad(label, detail) {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function fetchPdf(label, url, init) {
    const t0 = Date.now();
    let res;
    try {
        res = await fetch(url, init);
    } catch (err) {
        const ms = Date.now() - t0;
        return { ok: false, label, ms, error: err.message || String(err) };
    }
    const ms = Date.now() - t0;

    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j.error) detail += ` — ${j.error}`; } catch { /* noop */ }
        return { ok: false, label, ms, error: detail };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const head = buf.subarray(0, 5).toString('utf8');
    return { ok: true, label, ms, bytes: buf.length, head, buf };
}

function assertPdf(result) {
    let allPass = true;

    if (!result.ok) {
        bad(`request failed`, result.error);
        return false;
    }

    if (result.head !== '%PDF-') {
        bad(`not a PDF`, `head bytes were "${result.head}"`);
        allPass = false;
    } else {
        ok(`magic header present (%PDF-)`);
    }

    if (result.bytes < MIN_BYTES) {
        bad(`PDF too small`, `${result.bytes} bytes (min ${MIN_BYTES})`);
        allPass = false;
    } else {
        ok(`size ${(result.bytes / 1024).toFixed(1)} KB ≥ ${MIN_BYTES / 1024} KB`);
    }

    if (result.ms > MAX_MS) {
        bad(`too slow`, `${result.ms}ms (max ${MAX_MS}ms)`);
        allPass = false;
    } else {
        ok(`completed in ${result.ms}ms`);
    }

    return allPass;
}

// ── main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log('━━━ PDF download smoke test ━━━');
    console.log(`local  : ${LOCAL_URL}`);
    console.log(`worker : ${WORKER_URL || '(skipped — no VITE_PDF_WORKER_URL)'}`);
    console.log(`max ms : ${MAX_MS}`);
    console.log('');

    let passed = 0;
    let failed = 0;

    // ── 1. Local Playwright health ─────────────────────────────────────────
    console.log(`[1/${WORKER_URL ? 4 : 2}] local /health`);
    try {
        const h = await fetch(`${LOCAL_URL}/health`, { signal: AbortSignal.timeout(3000) });
        if (h.ok) {
            const body = await h.json();
            if (body.engine === 'playwright-chromium') {
                ok(`engine = playwright-chromium`);
                ok(`browser connected = ${body.browserConnected}`);
                passed++;
            } else {
                bad('unexpected engine field', body.engine || '(missing)');
                failed++;
            }
        } else {
            bad('health endpoint not OK', `HTTP ${h.status}`);
            failed++;
        }
    } catch (err) {
        bad('local PDF server unreachable', err.message);
        failed++;
    }
    console.log('');

    // ── 2. Local Playwright /api/generate-pdf ──────────────────────────────
    console.log(`[2/${WORKER_URL ? 4 : 2}] local /api/generate-pdf`);
    const localResult = await fetchPdf('local', `${LOCAL_URL}/api/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullHtml: SAMPLE_HTML, filename: FILENAME }),
        signal: AbortSignal.timeout(MAX_MS + 5000),
    });
    if (assertPdf(localResult)) {
        passed++;
        console.log(`  → ${fmtMs(localResult.ms)}  ${(localResult.bytes / 1024).toFixed(1)} KB`);
    } else {
        failed++;
    }
    console.log('');

    // ── 3 & 4. Cloudflare worker (if configured) ───────────────────────────
    if (WORKER_URL) {
        console.log(`[3/4] worker /health`);
        try {
            const h = await fetch(`${WORKER_URL}/health`, { signal: AbortSignal.timeout(4000) });
            if (h.ok) { ok('reachable'); passed++; }
            else { bad('not reachable', `HTTP ${h.status}`); failed++; }
        } catch (err) {
            bad('worker /health failed', err.message);
            failed++;
        }
        console.log('');

        console.log(`[4/4] worker /pdf`);
        const cfResult = await fetchPdf('worker', `${WORKER_URL}/pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: SAMPLE_HTML, filename: FILENAME, format: 'A4' }),
            signal: AbortSignal.timeout(MAX_MS + 5000),
        });
        if (assertPdf(cfResult)) {
            passed++;
            console.log(`  → ${fmtMs(cfResult.ms)}  ${(cfResult.bytes / 1024).toFixed(1)} KB`);
        } else {
            failed++;
        }
        console.log('');
    }

    console.log('━━━ summary ━━━');
    console.log(`passed: ${passed}`);
    console.log(`failed: ${failed}`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error('Unexpected test runner error:', err);
    process.exit(1);
});
