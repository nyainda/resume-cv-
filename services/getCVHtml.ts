/**
 * getCVHtml.ts
 *
 * Captures the rendered CV from the live DOM and returns a self-contained
 * HTML string suitable for sending to the Cloudflare Worker (headless Chrome).
 *
 * The outermost CV preview wrapper must have data-cv-preview="true" OR
 * an id of "cv-preview-area" so this function can locate it.
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

  const cssBlocks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      cssBlocks.push(
        Array.from(sheet.cssRules ?? [])
          .map((r) => r.cssText)
          .join("\n")
      );
    } catch {
      if (sheet.href) cssBlocks.push(`@import url("${sheet.href}");`);
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
    ${cssBlocks.join("\n")}
    ${extraStyles}
  </style>
</head>
<body>
  ${clone.outerHTML}
</body>
</html>`;
}
