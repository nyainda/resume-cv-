/**
 * coverLetterHtmlService.ts
 *
 * Generates a complete, self-contained HTML document for a cover letter PDF.
 * Used by the Playwright PDF renderer (local dev) and Cloudflare Worker (prod).
 *
 * Five templates: modern, professional, executive, academic, creative.
 *
 * Font strategy:
 *   - Google Fonts CDN is loaded first so the PDF renderer picks them up.
 *   - Every font rule has an excellent system-font fallback, so if the CDN is
 *     unreachable in headless Chromium the PDF still looks professional.
 *   - `print-color-adjust: exact` is applied globally so background colours
 *     and gradients print correctly in Chromium's PDF engine.
 *
 * Paragraph strategy:
 *   - `textToHtml()` detects whether the incoming text uses double-newline or
 *     single-newline paragraph separators and renders each block as a <p> tag.
 *   - Within a block, single newlines (e.g. sign-off "Sincerely,\nJohn") become <br>.
 */

import { PersonalInfo } from '../types';

export type CoverLetterTemplate = 'modern' | 'professional' | 'executive' | 'academic' | 'creative';

// Google Fonts — loaded via CDN with excellent system-font fallbacks in every
// font-family declaration so the PDF looks great even when the CDN is offline.
const GOOGLE_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">`;

// ─── Shared CSS added to every template ──────────────────────────────────────
// Forces colour fidelity and resets browser/Chromium print defaults.
const PRINT_BASE_CSS = `
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0; padding: 0;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}
@page { size: A4 portrait; margin: 0; }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Smart paragraph normaliser — mirrors the formatLetterForDisplay() logic in
 * CoverLetterPreview.tsx so the PDF always matches the on-screen preview.
 *
 * Handles four incoming formats from the AI:
 *   1. Double-newline paragraphs (ideal)   → split on \n\n
 *   2. Single-newline blocks               → split on \n
 *   3. Completely flat (no newlines)       → sentence-split heuristic
 *   4. Mixed sign-off ("Sincerely,\nName") → inner \n → <br>
 */
function textToHtml(raw: string): string {
    if (!raw) return '';

    // Normalise line endings
    const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    let blocks: string[];

    if (/\n\n/.test(text)) {
        // ── Case 1: well-formed double-newline paragraphs ────────────────────
        blocks = text.split(/\n{2,}/);
    } else if (/\n/.test(text)) {
        // ── Case 2: single-newline separated ────────────────────────────────
        blocks = text.split('\n');
    } else {
        // ── Case 3: flat single-line text — reconstruct paragraphs ──────────
        // Extract salutation ("Dear Hiring Manager,")
        let salutation = '';
        let rest = text;
        const salutationMatch = text.match(/^(Dear\s[^,:]+[,:])\s*/i);
        if (salutationMatch) {
            salutation = salutationMatch[1];
            rest = text.slice(salutationMatch[0].length).trim();
        }

        // Extract closing ("Sincerely,\nName")
        let closing = '';
        const closingIdx = rest.search(
            /\b(Sincerely|Best regards|Kind regards|Warm regards|Yours faithfully|Yours sincerely|Yours truly|With regards|Regards|Respectfully|Thank you)[,.]?(\s|$)/i
        );
        if (closingIdx !== -1) {
            closing = rest.slice(closingIdx).trim();
            rest = rest.slice(0, closingIdx).trim();
        }

        // Split body into paragraphs of ~3 sentences
        const sentences = rest
            .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
            .map(s => s.trim())
            .filter(Boolean);
        const SENTENCES_PER_PARA = 3;
        const bodyParas: string[] = [];
        for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARA) {
            bodyParas.push(sentences.slice(i, i + SENTENCES_PER_PARA).join(' '));
        }

        blocks = [];
        if (salutation) blocks.push(salutation);
        blocks.push(...bodyParas);
        if (closing) blocks.push(closing);
    }

    return blocks
        .map(b => b.trim())
        .filter(Boolean)
        .map((block, idx, arr) => {
            // Inner newlines (e.g. "Sincerely,\nJohn") → <br>
            const inner = esc(block).replace(/\n/g, '<br>');
            // Inline margin so CF worker Chromium cannot override it
            const mb = idx < arr.length - 1 ? 'margin-bottom:11pt;' : 'margin-bottom:0;';
            return `<p style="margin:0;${mb}">${inner}</p>`;
        })
        .join('\n');
}

function formatDate(): string {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildCoverLetterHtml(
    letterText: string,
    template: CoverLetterTemplate = 'modern',
    personalInfo?: PersonalInfo,
): string {
    const name     = personalInfo?.name     ?? '';
    const email    = personalInfo?.email    ?? '';
    const phone    = personalInfo?.phone    ?? '';
    const location = personalInfo?.location ?? '';
    const linkedin = personalInfo?.linkedin ?? '';
    const website  = personalInfo?.website  ?? '';

    const contactLine = [email, phone, location].filter(Boolean).map(esc).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
    const linksLine   = [linkedin, website].filter(Boolean).map(esc).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
    const bodyHtml    = textToHtml(letterText);
    const today       = formatDate();

    // ── Modern ────────────────────────────────────────────────────────────────
    if (template === 'modern') {
        return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
${PRINT_BASE_CSS}
body {
    font-family: 'DM Sans', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
    width: 210mm; height: 297mm; overflow: hidden;
    background: #fff; color: #1f2937;
}
.accent-top {
    height: 5px;
    background: linear-gradient(90deg, #1B2B4B 0%, #1B2B4B 65%, #C9A84C 100%);
}
.content { padding: 11mm 17mm 10mm; }
.header {
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 6mm; padding-bottom: 5mm;
    border-bottom: 1px solid #e5e7eb;
}
.header-left h1 {
    font-size: 19.5pt; font-weight: 700; color: #1B2B4B;
    letter-spacing: -0.025em; margin-bottom: 3pt; line-height: 1.1;
}
.header-left .contact { font-size: 8pt; color: #6b7280; line-height: 1.7; margin-top: 1pt; }
.header-left .links   { font-size: 8pt; color: #2563eb; margin-top: 2pt; }
.header-right { text-align: right; padding-top: 2pt; flex-shrink: 0; margin-left: 8mm; }
.header-right .date   { font-size: 8.5pt; color: #9ca3af; white-space: nowrap; }
.body { font-size: 10.5pt; line-height: 1.76; color: #1f2937; }
.body p { margin-bottom: 10pt; }
.body p:last-child { margin-bottom: 0; }
</style>
</head>
<body>
<div class="accent-top"></div>
<div class="content">
<div class="header">
    <div class="header-left">
        ${name ? `<h1>${esc(name)}</h1>` : ''}
        ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
        ${linksLine   ? `<p class="links">${linksLine}</p>`   : ''}
    </div>
    <div class="header-right"><p class="date">${today}</p></div>
</div>
<div class="body">
${bodyHtml}
</div>
</div>
</body></html>`;
    }

    // ── Professional ──────────────────────────────────────────────────────────
    if (template === 'professional') {
        return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
${PRINT_BASE_CSS}
body {
    font-family: 'EB Garamond', Georgia, 'Times New Roman', Times, serif;
    width: 210mm; height: 297mm; overflow: hidden;
    background: #fff;
    padding: 15mm 20mm 13mm;
    color: #1c1c1c;
}
.header-row {
    display: flex; justify-content: space-between; align-items: flex-start;
    margin-bottom: 4mm;
}
.header-left h1 {
    font-size: 17.5pt; font-weight: 600; color: #111;
    margin-bottom: 3pt; letter-spacing: 0.01em;
}
.header-left .contact { font-size: 9pt; color: #4b5563; line-height: 1.6; margin-top: 1pt; }
.header-left .links   { font-size: 9pt; color: #374151; font-style: italic; margin-top: 2pt; }
.header-right { text-align: right; padding-top: 2pt; flex-shrink: 0; margin-left: 8mm; }
.header-right .date   { font-size: 9.5pt; color: #4b5563; white-space: nowrap; }
.rule { margin: 3.5mm 0; }
.rule .r1 { border-top: 1.5px solid #374151; margin-bottom: 2.5pt; }
.rule .r2 { border-top: 0.75px solid #9ca3af; }
.body { font-size: 11pt; line-height: 1.82; color: #1c1c1c; }
.body p { margin-bottom: 10pt; }
.body p:last-child { margin-bottom: 0; }
</style>
</head>
<body>
<div class="header-row">
    <div class="header-left">
        ${name ? `<h1>${esc(name)}</h1>` : ''}
        ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
        ${linksLine   ? `<p class="links">${linksLine}</p>`   : ''}
    </div>
    <div class="header-right"><p class="date">${today}</p></div>
</div>
<div class="rule"><div class="r1"></div><div class="r2"></div></div>
<div class="body">
${bodyHtml}
</div>
</body></html>`;
    }

    // ── Executive ─────────────────────────────────────────────────────────────
    if (template === 'executive') {
        return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
${PRINT_BASE_CSS}
body {
    font-family: 'DM Sans', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
    width: 210mm; height: 297mm; overflow: hidden;
    background: #fff; color: #1f2937;
}
.header-band { background: #1B2B4B; padding: 10mm 17mm 9mm; }
.header-inner { display: flex; justify-content: space-between; align-items: flex-start; }
.header-inner h1 {
    font-family: 'Playfair Display', Georgia, 'Cambria', 'Times New Roman', serif;
    font-size: 20pt; font-weight: 700; color: #fff;
    letter-spacing: 0.01em; margin-bottom: 4pt; line-height: 1.15;
}
.header-inner .contact { font-size: 8.5pt; color: rgba(255,255,255,0.68); line-height: 1.6; margin-top: 1pt; }
.header-inner .links   { font-size: 8.5pt; color: #C9A84C; margin-top: 2pt; }
.header-right { text-align: right; padding-top: 2pt; flex-shrink: 0; margin-left: 8mm; }
.header-right .date    { font-size: 8.5pt; color: rgba(255,255,255,0.55); white-space: nowrap; }
.gold-rule { height: 3px; background: linear-gradient(90deg, #C9A84C 0%, #e8c96e 50%, #C9A84C 100%); }
.body-wrap { padding: 11mm 17mm 11mm; }
.body { font-size: 10.5pt; line-height: 1.78; }
.body p { margin-bottom: 10pt; }
.body p:last-child { margin-bottom: 0; }
</style>
</head>
<body>
<div class="header-band">
    <div class="header-inner">
        <div>
            ${name ? `<h1>${esc(name)}</h1>` : ''}
            ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
            ${linksLine   ? `<p class="links">${linksLine}</p>`   : ''}
        </div>
        <div class="header-right"><p class="date">${today}</p></div>
    </div>
</div>
<div class="gold-rule"></div>
<div class="body-wrap">
<div class="body">
${bodyHtml}
</div>
</div>
</body></html>`;
    }

    // ── Academic ──────────────────────────────────────────────────────────────
    if (template === 'academic') {
        return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
${PRINT_BASE_CSS}
body {
    font-family: 'EB Garamond', Georgia, 'Times New Roman', Times, serif;
    width: 210mm; height: 297mm; overflow: hidden;
    background: #fff;
    padding: 15mm 20mm 13mm;
    color: #1c1c1c;
}
.header { text-align: center; margin-bottom: 3mm; }
.header h1 {
    font-size: 17.5pt; font-weight: 600;
    letter-spacing: 0.04em; margin-bottom: 3pt;
}
.header .contact { font-size: 9.5pt; color: #374151; line-height: 1.6; }
.header .links   { font-size: 9.5pt; color: #374151; font-style: italic; margin-top: 2pt; }
.date-line { text-align: right; font-size: 9.5pt; color: #4b5563; margin-bottom: 2.5mm; margin-top: 2.5mm; }
.double-rule { margin: 2.5mm 0; }
.double-rule .r1 { border-top: 2px solid #1c1c1c; margin-bottom: 2.5pt; }
.double-rule .r2 { border-top: 1px solid #1c1c1c; }
.body { font-size: 11.5pt; line-height: 1.84; margin-top: 5mm; }
.body p { margin-bottom: 11pt; }
.body p:last-child { margin-bottom: 0; }
</style>
</head>
<body>
${name ? `<div class="header">
    <h1>${esc(name)}</h1>
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
    ${linksLine   ? `<p class="links">${linksLine}</p>`   : ''}
</div>` : ''}
<div class="date-line">${today}</div>
<div class="double-rule"><div class="r1"></div><div class="r2"></div></div>
<div class="body">
${bodyHtml}
</div>
</body></html>`;
    }

    // ── Creative (default) ────────────────────────────────────────────────────
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
${PRINT_BASE_CSS}
body {
    font-family: 'DM Sans', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
    width: 210mm; height: 297mm; overflow: hidden;
    background: #fff;
    display: flex;
    color: #1f2937;
}
.sidebar {
    width: 8px;
    background: linear-gradient(180deg, #1B2B4B 0%, #243d6b 55%, #C9A84C 100%);
    flex-shrink: 0;
}
.main { flex: 1; padding: 12mm 15mm 11mm 14mm; }
.header { margin-bottom: 6mm; padding-bottom: 5mm; border-bottom: 1.5px solid #f3f4f6; }
.header h1 {
    font-size: 19pt; font-weight: 700; color: #C9A84C;
    letter-spacing: -0.01em; margin-bottom: 3pt;
}
.header .contact { font-size: 8pt; color: #6b7280; line-height: 1.7; margin-top: 1pt; }
.header .links   { font-size: 8pt; color: #1B2B4B; margin-top: 2pt; font-weight: 500; }
.header .date    { font-size: 8.5pt; color: #9ca3af; margin-top: 3pt; }
.body { font-size: 10.5pt; line-height: 1.78; }
.body p { margin-bottom: 9pt; }
.body p:last-child { margin-bottom: 0; }
</style>
</head>
<body>
<div class="sidebar"></div>
<div class="main">
<div class="header">
    ${name ? `<h1>${esc(name)}</h1>` : ''}
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
    ${linksLine   ? `<p class="links">${linksLine}</p>`   : ''}
    <p class="date">${today}</p>
</div>
<div class="body">
${bodyHtml}
</div>
</div>
</body></html>`;
}
