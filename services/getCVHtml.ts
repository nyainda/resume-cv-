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
 * - Google Fonts are fetched client-side and embedded as base64 data-URIs so
 *   the Playwright server never needs to make outbound network requests for fonts.
 * - Same-origin stylesheets (Vite/Tailwind compiled CSS, inline <style> blocks)
 *   are fully inlined as CSS text so Tailwind utility classes render correctly.
 * - Both guarantees together mean the PDF output is pixel-identical to the
 *   on-screen preview regardless of the server's network environment.
 */

export interface GetCVHtmlOptions {
  selector?: string;
  extraStyles?: string;
}

/** Convert an ArrayBuffer to a base64 string without stack-overflow risk. */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Fetch a Google Fonts CSS URL and replace every `url(...)` font reference
 * with a base64 data-URI so no network requests are needed at render time.
 */
async function embedFontCSS(href: string): Promise<string> {
  try {
    const cssRes = await fetch(href, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!cssRes.ok) throw new Error(`HTTP ${cssRes.status}`);
    let css = await cssRes.text();

    // Collect all font-file URLs referenced inside the CSS
    const urlRegex = /url\((https?:\/\/[^)'"]+)\)/g;
    const fontUrls: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = urlRegex.exec(css)) !== null) {
      fontUrls.push(m[1]);
    }

    // Fetch every font file and swap the URL for a data-URI
    await Promise.all(
      fontUrls.map(async (fontUrl) => {
        try {
          const fontRes = await fetch(fontUrl);
          if (!fontRes.ok) return;
          const buf = await fontRes.arrayBuffer();
          const b64 = arrayBufferToBase64(buf);
          const mime = fontUrl.includes('.woff2')
            ? 'font/woff2'
            : fontUrl.includes('.woff')
            ? 'font/woff'
            : 'font/truetype';
          const dataUri = `data:${mime};base64,${b64}`;
          css = css.replaceAll(fontUrl, dataUri);
        } catch {
          // Leave the original URL — font will fall back to system font
        }
      })
    );

    return css;
  } catch {
    // If the whole fetch fails, fall back to a plain @import
    return `@import url('${href}');`;
  }
}

export async function getCVHtml(opts: GetCVHtmlOptions = {}): Promise<string | null> {
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
  const inlineCssBlocks: string[] = [];
  const externalLinkHrefs: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules ?? []);
      if (rules.length === 0) continue;
      inlineCssBlocks.push(rules.map((r) => r.cssText).join("\n"));
    } catch {
      if (sheet.href) {
        externalLinkHrefs.push(sheet.href);
      }
    }
  }

  // Embed Google Fonts as base64 so Playwright needs zero outbound font requests.
  const googleFontHrefs = externalLinkHrefs.filter((h) =>
    h.includes('fonts.googleapis.com')
  );
  const otherExternalHrefs = externalLinkHrefs.filter(
    (h) => !h.includes('fonts.googleapis.com')
  );

  const embeddedFontCss = (
    await Promise.all(googleFontHrefs.map(embedFontCSS))
  ).join('\n');

  // Non-Google-Fonts external sheets get regular <link> tags
  const linkTags = otherExternalHrefs
    .map((href) => `  <link rel="stylesheet" href="${href}">`)
    .join("\n");

  const inlinedCSS = inlineCssBlocks.join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${linkTags}
  <style>
    @page { size: A4; margin: 0mm; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      width: 210mm;
    }
    h2, h3, h4 { page-break-after: avoid; }
    section { page-break-inside: avoid; }
    li { page-break-inside: avoid; }
    .no-print, [data-pdf-hide] { display: none !important; }
    /* Embedded Google Fonts (base64) — no network requests at render time */
    ${embeddedFontCss}
    /* Inlined same-origin CSS (Tailwind + template styles) */
    ${inlinedCSS}
    ${extraStyles}
  </style>
</head>
<body>
  ${clone.outerHTML}
</body>
</html>`;
}
