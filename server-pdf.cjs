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

const express  = require('express');
const cors     = require('cors');
const { chromium } = require('playwright');
const { Pool }     = require('pg');

const app  = express();
const PORT = 3001;
const MAX_CONCURRENT = 3; // max simultaneous Playwright pages

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// ─── Postgres pool (for telemetry / banned-phrase store) ───────────────────────
// All DB operations are non-blocking with respect to PDF generation. If
// DATABASE_URL is missing the server still works — telemetry endpoints just
// return 503 instead of crashing.
let pgPool = null;
if (process.env.DATABASE_URL) {
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    pgPool.on('error', (err) => console.warn('[Telemetry] pg pool error:', err.message));
    console.log('[Telemetry] Postgres pool initialised.');
} else {
    console.warn('[Telemetry] DATABASE_URL not set — telemetry endpoints disabled.');
}
function requireDb(_req, res, next) {
    if (!pgPool) return res.status(503).json({ error: 'Telemetry DB not configured' });
    next();
}

// ─── Browser pool ──────────────────────────────────────────────────────────────

let browser     = null;
let activePgs   = 0;
let waitQueue   = [];   // array of () => void resolve callbacks

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
        await page.setViewportSize({ width: 794, height: 1123 });
        // 'load' returns as soon as the document and its sub-resources are loaded.
        // We previously used 'networkidle' which adds a guaranteed 500ms wait for
        // network silence — wasteful when fonts are pre-embedded as base64 data-URIs.
        // The fonts.ready check below is the actual correctness guard.
        await page.setContent(pageContent, { waitUntil: 'load', timeout: 15000 });
        // Wait for all @font-face declarations to finish loading (data-URIs resolve
        // instantly; any leftover CDN URLs get a generous-but-bounded window via the
        // race below).
        await Promise.race([
            page.evaluate(() => document.fonts.ready),
            page.waitForTimeout(2500),
        ]);
        // Tiny stabilisation delay — was 600ms, dropped to 100ms now that
        // network idle is no longer the gate.
        await page.waitForTimeout(100);
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
            preferCSSPageSize: false,
        });
        return pdfBuffer;
    } finally {
        await page.close().catch(() => {});
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

// ─── Groq Response Cache ────────────────────────────────────────────────────────
//
// Postgres-backed cache for identical LLM prompts. Keeps hot responses instant
// without burning API quota. All operations are best-effort — failures never
// block CV generation.

const MAX_GROQ_CACHE_PROMPT_SIZE    = 100_000;
const MAX_GROQ_CACHE_RESPONSE_SIZE  = 500_000;

app.get('/api/groq-cache', requireDb, async (req, res) => {
    const key = String(req.query.key || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(key)) {
        return res.status(400).json({ ok: false, error: 'invalid_key' });
    }
    try {
        const r = await pgPool.query(
            `UPDATE groq_cache
                SET hit_count = hit_count + 1, last_hit_at = NOW()
              WHERE key = $1 AND expires_at > NOW()
           RETURNING response, model, hit_count`,
            [key]
        );
        if (r.rows.length === 0) return res.status(404).json({ ok: false, hit: false });
        return res.json({ ok: true, hit: true, response: r.rows[0].response, model: r.rows[0].model, hitCount: r.rows[0].hit_count });
    } catch (err) {
        console.error('[groq-cache] GET error:', err.message);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

app.post('/api/groq-cache', requireDb, async (req, res) => {
    const { key, model, temperature, response, promptSize } = req.body || {};
    if (!/^[a-f0-9]{64}$/i.test(String(key || ''))) return res.status(400).json({ ok: false, error: 'invalid_key' });
    if (typeof model !== 'string' || !model) return res.status(400).json({ ok: false, error: 'missing_model' });
    if (typeof response !== 'string' || !response) return res.status(400).json({ ok: false, error: 'missing_response' });
    const temp = Number(temperature ?? 0.2);
    if (!Number.isFinite(temp) || temp > 0.5) return res.status(400).json({ ok: false, error: 'temperature_too_high' });
    if (response.length > MAX_GROQ_CACHE_RESPONSE_SIZE) return res.status(413).json({ ok: false, error: 'response_too_large' });
    if (Number(promptSize || 0) > MAX_GROQ_CACHE_PROMPT_SIZE) return res.status(413).json({ ok: false, error: 'prompt_too_large' });
    try {
        await pgPool.query(
            `INSERT INTO groq_cache (key, model, temperature, response, prompt_size, response_size)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (key) DO UPDATE
                SET response = EXCLUDED.response, last_hit_at = NOW(),
                    expires_at = NOW() + INTERVAL '7 days'`,
            [key, model, temp, response, Number(promptSize || 0), response.length]
        );
        return res.json({ ok: true });
    } catch (err) {
        console.error('[groq-cache] POST error:', err.message);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

// ─── Telemetry & banned-phrase API ─────────────────────────────────────────────
//
// All endpoints are namespaced under /api/telemetry. The client posts to them
// fire-and-forget — failures never block CV generation. Errors are logged
// server-side only.
//
// SQL is parameterised everywhere ($1, $2…) — no string interpolation of
// client data.

/** GET /api/telemetry/rules — bundle of enabled rules for the client purifier. */
app.get('/api/telemetry/rules', requireDb, async (_req, res) => {
    try {
        const [bp, vp, pp] = await Promise.all([
            pgPool.query(`SELECT pattern, replacement, category, severity, flags
                          FROM banned_phrases WHERE enabled = TRUE ORDER BY id`),
            pgPool.query(`SELECT present_form, past_form FROM verb_pairs
                          WHERE enabled = TRUE ORDER BY id`),
            pgPool.query(`SELECT pattern FROM pursuing_patterns WHERE enabled = TRUE ORDER BY id`),
        ]);
        res.json({
            bannedPhrases:    bp.rows,
            verbPairs:        vp.rows,
            pursuingPatterns: pp.rows.map(r => r.pattern),
            fetchedAt:        new Date().toISOString(),
        });
    } catch (err) {
        console.error('[Telemetry] /rules failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/telemetry/log-generation
 * Body: { cvHash, model?, promptVersion?, generationMode?, outputWordCount?,
 *         roundNumberRatio?, repeatedPhraseCount?, tenseIssueCount?,
 *         bulletsTenseFlipped?, metricsJittered?, substitutionsMade?,
 *         leaks?: [{ leakType, phrase, occurrences?, fieldLocation?, fixedBy?, contextSnippet? }] }
 */
app.post('/api/telemetry/log-generation', requireDb, async (req, res) => {
    const b = req.body || {};
    if (!b.cvHash) return res.status(400).json({ error: 'cvHash required' });
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        const ins = await client.query(`
            INSERT INTO generation_log
              (cv_hash, user_label, model, prompt_version, generation_mode,
               output_word_count, round_number_ratio, repeated_phrase_count,
               tense_issue_count, bullets_tense_flipped, metrics_jittered, substitutions_made)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING id
        `, [
            b.cvHash, b.userLabel || null, b.model || null, b.promptVersion || null,
            b.generationMode || null, b.outputWordCount || null,
            b.roundNumberRatio ?? null, b.repeatedPhraseCount ?? null,
            b.tenseIssueCount ?? null, b.bulletsTenseFlipped ?? 0,
            b.metricsJittered ?? 0, b.substitutionsMade ?? 0,
        ]);
        const generationId = ins.rows[0].id;

        if (Array.isArray(b.leaks) && b.leaks.length) {
            for (const leak of b.leaks) {
                if (!leak || !leak.leakType || !leak.phrase) continue;
                await client.query(`
                    INSERT INTO detected_leaks
                      (generation_id, cv_hash, leak_type, phrase, occurrences,
                       field_location, fixed_by, context_snippet)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                `, [
                    generationId, b.cvHash, leak.leakType,
                    String(leak.phrase).slice(0, 500),
                    leak.occurrences || 1,
                    leak.fieldLocation || null,
                    leak.fixedBy || null,
                    leak.contextSnippet ? String(leak.contextSnippet).slice(0, 1000) : null,
                ]);
                // Bump the hits counter on the matching banned_phrase, if any.
                if (leak.leakType === 'banned_phrase') {
                    await client.query(
                        `UPDATE banned_phrases
                            SET hits = hits + 1, last_seen = NOW()
                          WHERE LOWER(pattern) LIKE '%' || LOWER($1) || '%'
                             OR LOWER(replacement) = LOWER($1)`,
                        [leak.phrase],
                    );
                }
            }
        }
        await client.query('COMMIT');
        res.json({ ok: true, generationId });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[Telemetry] /log-generation failed:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/telemetry/log-edit
 * Captures a user's edit of an AI-generated field. Used to mine common
 * deletions / insertions for new banned phrases.
 * Body: { cvHash, field, originalText, editedText }
 */
app.post('/api/telemetry/log-edit', requireDb, async (req, res) => {
    const { cvHash, field, originalText, editedText } = req.body || {};
    if (!cvHash || !field || originalText == null || editedText == null) {
        return res.status(400).json({ error: 'cvHash, field, originalText, editedText required' });
    }
    if (originalText === editedText) return res.json({ ok: true, skipped: 'no-change' });

    // Token-level diff — naive whitespace split is fine for telemetry.
    const aTokens = String(originalText).split(/\s+/).filter(Boolean);
    const bTokens = String(editedText).split(/\s+/).filter(Boolean);
    const aSet = new Set(aTokens.map(t => t.toLowerCase()));
    const bSet = new Set(bTokens.map(t => t.toLowerCase()));
    const removed = Array.from(aSet).filter(t => !bSet.has(t)).slice(0, 50);
    const added   = Array.from(bSet).filter(t => !aSet.has(t)).slice(0, 50);
    const editDistance = Math.abs(aTokens.length - bTokens.length) + removed.length + added.length;

    try {
        await pgPool.query(`
            INSERT INTO user_edits
              (cv_hash, field, original_text, edited_text, edit_distance, removed_tokens, added_tokens)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [cvHash, field,
            String(originalText).slice(0, 4000),
            String(editedText).slice(0, 4000),
            editDistance, removed, added]);
        res.json({ ok: true });
    } catch (err) {
        console.error('[Telemetry] /log-edit failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/telemetry/leaks-summary?days=7
 * Top leaking phrases over the given window, plus aggregate counts.
 */
app.get('/api/telemetry/leaks-summary', requireDb, async (req, res) => {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 7));
    try {
        const [topPhrases, byType, recent, generations] = await Promise.all([
            pgPool.query(`
                SELECT phrase, leak_type, COUNT(*) AS hits
                  FROM detected_leaks
                 WHERE created_at > NOW() - ($1 || ' days')::interval
                 GROUP BY phrase, leak_type
                 ORDER BY hits DESC
                 LIMIT 30
            `, [String(days)]),
            pgPool.query(`
                SELECT leak_type, COUNT(*) AS hits
                  FROM detected_leaks
                 WHERE created_at > NOW() - ($1 || ' days')::interval
                 GROUP BY leak_type
                 ORDER BY hits DESC
            `, [String(days)]),
            pgPool.query(`
                SELECT id, leak_type, phrase, field_location, fixed_by, created_at
                  FROM detected_leaks
                 ORDER BY created_at DESC
                 LIMIT 30
            `),
            pgPool.query(`
                SELECT COUNT(*) AS total,
                       AVG(round_number_ratio) AS avg_round_ratio,
                       AVG(repeated_phrase_count) AS avg_repeats,
                       AVG(tense_issue_count) AS avg_tense_issues,
                       SUM(bullets_tense_flipped) AS total_tense_flipped,
                       SUM(metrics_jittered) AS total_jittered,
                       SUM(substitutions_made) AS total_subs
                  FROM generation_log
                 WHERE created_at > NOW() - ($1 || ' days')::interval
            `, [String(days)]),
        ]);
        res.json({
            windowDays: days,
            topPhrases:  topPhrases.rows,
            byType:      byType.rows,
            recent:      recent.rows,
            generations: generations.rows[0] || {},
        });
    } catch (err) {
        console.error('[Telemetry] /leaks-summary failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/telemetry/banned-phrases
 * Adds (or upserts) a new banned phrase. Used by the admin page's
 * "promote to banned list" button.
 * Body: { pattern, replacement?, category?, severity?, isRegex?, flags? }
 */
app.post('/api/telemetry/banned-phrases', requireDb, async (req, res) => {
    const { pattern, replacement = '', category = 'user-promoted',
            severity = 2, isRegex = true, flags = 'gi' } = req.body || {};
    if (!pattern || typeof pattern !== 'string') {
        return res.status(400).json({ error: 'pattern required' });
    }
    try {
        const r = await pgPool.query(`
            INSERT INTO banned_phrases (pattern, replacement, category, severity, is_regex, flags)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (pattern) DO UPDATE
              SET replacement = EXCLUDED.replacement,
                  category    = EXCLUDED.category,
                  severity    = EXCLUDED.severity,
                  enabled     = TRUE,
                  updated_at  = NOW()
            RETURNING id, pattern, replacement, category, severity
        `, [pattern, replacement, category, severity, isRegex, flags]);
        res.json({ ok: true, row: r.rows[0] });
    } catch (err) {
        console.error('[Telemetry] /banned-phrases POST failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/** DELETE /api/telemetry/banned-phrases/:id — soft-disables a rule. */
app.delete('/api/telemetry/banned-phrases/:id', requireDb, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    try {
        await pgPool.query(`UPDATE banned_phrases SET enabled = FALSE, updated_at = NOW() WHERE id = $1`, [id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
