/**
 * getCVHtml.ts
 *
 * Captures the rendered CV from the live DOM and returns a self-contained
 * HTML string suitable for sending to the Playwright PDF server (headless Chrome).
 *
 * The outermost CV preview wrapper must have data-cv-preview="true" OR
 * an id of "cv-preview-area" so this function can locate it.
 *
 * Key design decisions:
 * - Cross-origin stylesheets (Google Fonts, rsms.me, etc.) are emitted as
 *   <link rel="stylesheet"> tags — NOT as @import inside <style>. CSS @import
 *   rules must appear before any other rules in a style block; placing them
 *   after compiled CSS (as a fallback loop would do) causes browsers and
 *   Playwright to silently ignore them, breaking all font loading.
 * - Same-origin / readable stylesheets are fully inlined as CSS text so
 *   Tailwind utility classes, template colours, gradients, etc. are
 *   self-contained and need zero network requests to render.
 */

export interface GetCVHtmlOptions {
  selector?: string;
  extraStyles?: string;
}

export function getCVHtml(opts: GetCVHtmlOptions = {}): string | null {
  const { selector = "[data-cv-preview], #cv-preview-area", extraStyles = "" } = opts;

  const container = document.querySelector<HTMLElement>(selector);
  if (!container) {
    console.warn(`[getCVHtml] Element not found: "${selector}"`);
    console.warn('Add data-cv-preview="true" to the CV preview wrapper div.');
    return null;
  }

  const clone = container.cloneNode(true) as HTMLElement;

  ["button", "[data-pdf-hide]", ".no-print", '[contenteditable="true"]'].forEach((sel) =>
    clone.querySelectorAll(sel).forEach((el) => el.remove())
  );

  // Separate readable (same-origin) sheets from cross-origin sheets.
  // Cross-origin sheets (Google Fonts, rsms.me) throw on .cssRules access —
  // emit them as <link> tags so headless Chrome can fetch them normally.
  // Same-origin sheets (Vite/Tailwind compiled CSS, inline <style> blocks)
  // are fully inlined so the PDF needs no external stylesheet requests.
  const inlineCssBlocks: string[] = [];
  const externalLinkHrefs: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules ?? []);
      if (rules.length === 0) continue;
      inlineCssBlocks.push(rules.map((r) => r.cssText).join("\n"));
    } catch {
      // Cross-origin sheet — collect the URL for a <link> tag
      if (sheet.href) {
        externalLinkHrefs.push(sheet.href);
      }
    }
  }

  // Always include preconnect hints + <link> tags for well-known font CDNs
  // that might not be in document.styleSheets yet (e.g. dynamic injection).
  // Deduplication ensures no duplicates if they were already found above.
  const wellKnownFontOrigins = [
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://rsms.me",
  ];

  // Build preconnect tags (always safe to include)
  const preconnectTags = wellKnownFontOrigins
    .map((origin) => {
      const crossorigin = origin.includes("gstatic") ? ' crossorigin=""' : "";
      return `  <link rel="preconnect" href="${origin}"${crossorigin}>`;
    })
    .join("\n");

  // Build <link rel="stylesheet"> tags for all external sheets
  const linkTags = externalLinkHrefs
    .map((href) => `  <link rel="stylesheet" href="${href}">`)
    .join("\n");

  // Inline CSS — all Tailwind utilities, template colours, gradients, etc.
  const inlinedCSS = inlineCssBlocks.join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${preconnectTags}
${linkTags}
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    p, li, h1, h2, h3, h4, section, .cv-section { page-break-inside: avoid; }
    .no-print, [data-pdf-hide] { display: none !important; }
    ${inlinedCSS}
    ${extraStyles}
  </style>
</head>
<body>
  ${clone.outerHTML}
</body>
</html>`;
}
