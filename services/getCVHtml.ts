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
 * - We strip contenteditable focus rings, editing UI, and interactive controls
 *   from the clone so the PDF matches the clean preview — not the editing state.
 */

export interface GetCVHtmlOptions {
  selector?: string;
  extraStyles?: string;
}

export function getCVHtml(opts: GetCVHtmlOptions = {}): string | null {
  const { selector = "[data-cv-preview], #cv-preview-area", extraStyles = "" } = opts;

  // Locate the outermost preview wrapper
  const container = document.querySelector<HTMLElement>(selector);
  if (!container) {
    console.warn(`[getCVHtml] Element not found: "${selector}"`);
    console.warn('Add data-cv-preview="true" to the CV preview wrapper div.');
    return null;
  }

  // Deep clone — we will mutate the clone freely
  const clone = container.cloneNode(true) as HTMLElement;

  // ── Strip UI-only nodes ───────────────────────────────────────────────────
  // Remove buttons, editing controls, no-print helpers
  [
    "button",
    "[data-pdf-hide]",
    ".no-print",
    // Remove the scroll wrapper but keep the inner template div
  ].forEach((sel) => clone.querySelectorAll(sel).forEach((el) => el.remove()));

  // Strip contenteditable attributes and their focus-ring classes from all nodes
  clone.querySelectorAll("[contenteditable]").forEach((el) => {
    el.removeAttribute("contenteditable");
    // Remove Tailwind focus-ring / editing-mode classes injected by editableProps()
    el.classList.remove(
      "outline-none",
      "ring-1",
      "ring-transparent",
      "focus:ring-blue-400",
      "focus:bg-blue-100/50",
      "dark:focus:bg-blue-900/50",
      "rounded",
      "px-1",
      "-mx-1",
      "transition-all"
    );
  });

  // Force the clone's root element to exactly A4 width so Playwright renders
  // it the same as the browser preview (794px = ~210mm at 96dpi).
  // Also remove min-width / max-width from the outer scroll wrapper if present.
  clone.style.cssText = `
    width: 794px !important;
    min-width: 794px !important;
    max-width: 794px !important;
    overflow: visible !important;
    box-sizing: border-box !important;
  `;

  // ── Stylesheet collection ─────────────────────────────────────────────────
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
  const wellKnownFontOrigins = [
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://rsms.me",
  ];

  const preconnectTags = wellKnownFontOrigins
    .map((origin) => {
      const crossorigin = origin.includes("gstatic") ? ' crossorigin=""' : "";
      return `  <link rel="preconnect" href="${origin}"${crossorigin}>`;
    })
    .join("\n");

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
    @page { size: A4; margin: 0mm; }
    *, *::before, *::after { box-sizing: border-box; }
    html {
      margin: 0;
      padding: 0;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      padding: 0;
      background: white;
      width: 210mm;
      max-width: 210mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Remove any outer scroll-wrapper constraints — let the template breathe */
    body > div {
      width: 210mm !important;
      min-width: unset !important;
      overflow: visible !important;
    }
    h2, h3, h4 { page-break-after: avoid; }
    section { page-break-inside: avoid; }
    li { page-break-inside: avoid; }
    /* Force ALL backgrounds and colours to render in print/headless */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .no-print, [data-pdf-hide] { display: none !important; }
    /* Strip editing focus rings entirely */
    [contenteditable] {
      outline: none !important;
      box-shadow: none !important;
      border: none !important;
    }
    ${inlinedCSS}
    ${extraStyles}
  </style>
</head>
<body>
  ${clone.outerHTML}
</body>
</html>`;
}
