/**
 * coverLetterHtmlService.ts
 *
 * Generates a complete, self-contained HTML document for a cover letter.
 * Used by the Playwright / Cloudflare Worker PDF renderer to produce
 * pixel-perfect, template-styled cover letter PDFs.
 *
 * Five templates: modern, professional, executive, academic, creative.
 * Each template uses distinct typography, layout, and colour treatment.
 */

import { PersonalInfo } from '../types';

export type CoverLetterTemplate = 'modern' | 'professional' | 'executive' | 'academic' | 'creative';

const GOOGLE_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">`;

function esc(s: string): string {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textToHtml(raw: string): string {
    return raw
        .split(/\n{2,}/)
        .filter(p => p.trim())
        .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
        .join('\n');
}

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

    // ── Modern ────────────────────────────────────────────────────────────────
    if (template === 'modern') {
        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'DM Sans', Arial, sans-serif;
    width: 210mm; min-height: 297mm;
    background: #fff;
    padding: 14mm 18mm 18mm;
    color: #1f2937; font-size: 10.5pt; line-height: 1.78;
}
.accent-bar { height: 4px; background: #1B2B4B; margin: 0 -18mm 12mm; }
.header { margin-bottom: 22pt; padding-bottom: 14pt; border-bottom: 1px solid #e4e4e7; }
.header h1 { font-size: 20pt; font-weight: 700; color: #1B2B4B; letter-spacing: -0.02em; margin-bottom: 4pt; }
.header .contact { font-size: 8.5pt; color: #6b7280; }
.header .links   { font-size: 8.5pt; color: #2563eb; margin-top: 2pt; }
p { margin-bottom: 11pt; }
p:last-child { margin-bottom: 0; }
</style></head>
<body>
<div class="accent-bar"></div>
${name ? `<div class="header">
    <h1>${esc(name)}</h1>
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
    ${linksLine   ? `<p class="links">${linksLine}</p>`     : ''}
</div>` : ''}
${bodyHtml}
</body></html>`;
    }

    // ── Professional ──────────────────────────────────────────────────────────
    if (template === 'professional') {
        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'EB Garamond', Georgia, serif;
    width: 210mm; min-height: 297mm;
    background: #fff;
    padding: 18mm 20mm;
    color: #1c1c1c; font-size: 11.5pt; line-height: 1.82;
}
.header { margin-bottom: 20pt; }
.header h1 { font-size: 19pt; font-weight: 600; color: #111; margin-bottom: 4pt; }
.header .contact { font-size: 9pt; color: #4b5563; }
.header .links   { font-size: 9pt; color: #374151; font-style: italic; margin-top: 2pt; }
.rule-top    { border: none; border-top: 1.5px solid #6b7280; margin: 10pt 0 16pt; }
.rule-bottom { border: none; border-top: 1px   solid #d1d5db; margin: 10pt 0 16pt; }
p { margin-bottom: 12pt; }
p:last-child { margin-bottom: 0; }
</style></head>
<body>
${name ? `<div class="header">
    <h1>${esc(name)}</h1>
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
    ${linksLine   ? `<p class="links">${linksLine}</p>`     : ''}
</div>
<hr class="rule-top">` : ''}
${bodyHtml}
</body></html>`;
    }

    // ── Executive ─────────────────────────────────────────────────────────────
    if (template === 'executive') {
        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'DM Sans', Arial, sans-serif;
    width: 210mm; min-height: 297mm;
    background: #fff;
    color: #1f2937; font-size: 10.5pt; line-height: 1.78;
}
.header-band {
    background: #1B2B4B;
    padding: 18mm 20mm 16mm;
    position: relative;
}
.header-band h1 {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 22pt; font-weight: 700; color: #fff;
    letter-spacing: 0.01em; margin-bottom: 5pt;
}
.header-band .contact { font-size: 8.5pt; color: rgba(255,255,255,0.72); }
.header-band .links   { font-size: 8.5pt; color: #C9A84C; margin-top: 3pt; }
.gold-rule { height: 3px; background: #C9A84C; }
.body-wrap { padding: 18mm 20mm; }
p { margin-bottom: 11pt; }
p:last-child { margin-bottom: 0; }
</style></head>
<body>
<div class="header-band">
    ${name ? `<h1>${esc(name)}</h1>` : ''}
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
    ${linksLine   ? `<p class="links">${linksLine}</p>`     : ''}
</div>
<div class="gold-rule"></div>
<div class="body-wrap">
${bodyHtml}
</div>
</body></html>`;
    }

    // ── Academic ──────────────────────────────────────────────────────────────
    if (template === 'academic') {
        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'EB Garamond', 'Times New Roman', serif;
    width: 210mm; min-height: 297mm;
    background: #fff;
    padding: 20mm 22mm;
    color: #1c1c1c; font-size: 12pt; line-height: 1.85;
}
.header { text-align: center; margin-bottom: 6pt; }
.header h1 { font-size: 18pt; font-weight: 600; margin-bottom: 4pt; letter-spacing: 0.03em; }
.header .contact { font-size: 9.5pt; color: #374151; }
.header .links   { font-size: 9.5pt; color: #374151; font-style: italic; margin-top: 2pt; }
.double-rule { margin: 10pt 0 18pt; border: none; }
.double-rule::before {
    content: '';
    display: block;
    border-top: 2px solid #1c1c1c;
    margin-bottom: 2pt;
}
.double-rule::after {
    content: '';
    display: block;
    border-top: 1px solid #1c1c1c;
}
p { margin-bottom: 14pt; text-indent: 0; }
p:last-child { margin-bottom: 0; }
</style></head>
<body>
${name ? `<div class="header">
    <h1>${esc(name)}</h1>
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
    ${linksLine   ? `<p class="links">${linksLine}</p>`     : ''}
</div>
<div class="double-rule"></div>` : ''}
${bodyHtml}
</body></html>`;
    }

    // ── Creative ──────────────────────────────────────────────────────────────
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'DM Sans', Arial, sans-serif;
    width: 210mm; min-height: 297mm;
    background: #fff;
    padding: 16mm 18mm 18mm 24mm;
    border-left: 7px solid #1B2B4B;
    color: #1f2937; font-size: 10.5pt; line-height: 1.78;
}
.header { margin-bottom: 22pt; padding-bottom: 14pt; border-bottom: 1px solid #e4e4e7; }
.header h1 { font-size: 20pt; font-weight: 700; color: #C9A84C; letter-spacing: -0.01em; margin-bottom: 4pt; }
.header .contact { font-size: 8.5pt; color: #6b7280; }
.header .links   { font-size: 8.5pt; color: #1B2B4B; margin-top: 2pt; font-weight: 500; }
p { margin-bottom: 11pt; }
p:last-child { margin-bottom: 0; }
</style></head>
<body>
${name ? `<div class="header">
    <h1>${esc(name)}</h1>
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
    ${linksLine   ? `<p class="links">${linksLine}</p>`     : ''}
</div>` : ''}
${bodyHtml}
</body></html>`;
}
