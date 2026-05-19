/**
 * coverLetterHtmlService.ts
 *
 * Generates a complete, self-contained HTML document for a cover letter PDF.
 * Used by the Playwright PDF renderer (local dev) and Cloudflare Worker (prod).
 *
 * Five templates: modern, professional, executive, academic, creative.
 * Each is engineered for one A4 page with 200–240 word content.
 */

import { PersonalInfo } from '../types';

export type CoverLetterTemplate = 'modern' | 'professional' | 'executive' | 'academic' | 'creative';

const GOOGLE_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">`;

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

function formatDate(): string {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
    const today       = formatDate();

    // ── Modern ────────────────────────────────────────────────────────────────
    if (template === 'modern') {
        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
@page { size: A4 portrait; margin: 0; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'DM Sans', Arial, sans-serif;
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
.body p { margin-bottom: 9pt; }
.body p:last-child { margin-bottom: 0; }
</style></head>
<body>
<div class="accent-top"></div>
<div class="content">
<div class="header">
    <div class="header-left">
        ${name ? `<h1>${esc(name)}</h1>` : ''}
        ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
        ${linksLine   ? `<p class="links">${linksLine}</p>` : ''}
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
<html lang="en"><head><meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
@page { size: A4 portrait; margin: 0; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'EB Garamond', Georgia, serif;
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
</style></head>
<body>
<div class="header-row">
    <div class="header-left">
        ${name ? `<h1>${esc(name)}</h1>` : ''}
        ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
        ${linksLine   ? `<p class="links">${linksLine}</p>` : ''}
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
<html lang="en"><head><meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
@page { size: A4 portrait; margin: 0; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'DM Sans', Arial, sans-serif;
    width: 210mm; height: 297mm; overflow: hidden;
    background: #fff; color: #1f2937;
}
.header-band {
    background: #1B2B4B;
    padding: 10mm 17mm 9mm;
}
.header-inner {
    display: flex; justify-content: space-between; align-items: flex-start;
}
.header-inner h1 {
    font-family: 'Playfair Display', Georgia, serif;
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
</style></head>
<body>
<div class="header-band">
    <div class="header-inner">
        <div>
            ${name ? `<h1>${esc(name)}</h1>` : ''}
            ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
            ${linksLine   ? `<p class="links">${linksLine}</p>` : ''}
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
<html lang="en"><head><meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
@page { size: A4 portrait; margin: 0; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'EB Garamond', 'Times New Roman', serif;
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
</style></head>
<body>
${name ? `<div class="header">
    <h1>${esc(name)}</h1>
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
    ${linksLine   ? `<p class="links">${linksLine}</p>` : ''}
</div>` : ''}
<div class="date-line">${today}</div>
<div class="double-rule"><div class="r1"></div><div class="r2"></div></div>
<div class="body">
${bodyHtml}
</div>
</body></html>`;
    }

    // ── Creative ──────────────────────────────────────────────────────────────
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
${GOOGLE_FONTS}
<style>
@page { size: A4 portrait; margin: 0; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'DM Sans', Arial, sans-serif;
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
</style></head>
<body>
<div class="sidebar"></div>
<div class="main">
<div class="header">
    ${name ? `<h1>${esc(name)}</h1>` : ''}
    ${contactLine ? `<p class="contact">${contactLine}</p>` : ''}
    ${linksLine   ? `<p class="links">${linksLine}</p>` : ''}
    <p class="date">${today}</p>
</div>
<div class="body">
${bodyHtml}
</div>
</div>
</body></html>`;
}
