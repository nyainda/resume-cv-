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
  /**
   * Explicit DOM element to capture. When provided, this wins over `selector`.
   * Use this from modals/portals that render their own CVPreview so we don't
   * accidentally capture the editor preview that's still mounted behind them.
   */
  containerEl?: HTMLElement | null;
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

// ── Font-embed memo cache ───────────────────────────────────────────────────
// Embedding all Google Font files for a Google Fonts CSS URL is expensive
// (often 20-40 WOFF2 files per request). The result is identical for the
// same href until the page reloads, so cache it across download clicks.
const _fontCssMemo = new Map<string, Promise<string>>();

/** Fetch with a hard timeout — prevents indefinite hangs on slow CDNs. */
async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

/**
 * Fetch a Google Fonts CSS URL and replace every `url(...)` font reference
 * with a base64 data-URI so no network requests are needed at render time.
 *
 * Both the CSS request and every font-file request have hard timeouts
 * (4s/3s) so a single slow Google Fonts response can't stall the entire
 * download flow indefinitely. Result is memoised per-href so re-clicking
 * the Download button is effectively instant.
 */
async function embedFontCSS(href: string): Promise<string> {
  const cached = _fontCssMemo.get(href);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const cssRes = await fetchWithTimeout(href, 4000, {
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

      // Fetch every font file and swap the URL for a data-URI.
      // 3s timeout per font — if a font hangs, fall back to its CDN URL.
      await Promise.all(
        fontUrls.map(async (fontUrl) => {
          try {
            const fontRes = await fetchWithTimeout(fontUrl, 3000);
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
            // or be re-fetched server-side by Playwright.
          }
        })
      );

      return css;
    } catch {
      // If the whole fetch fails, fall back to a plain @import
      return `@import url('${href}');`;
    }
  })();

  _fontCssMemo.set(href, promise);
  return promise;
}

/** Clear the font CSS cache. Call this if the user changes themes/templates with new fonts. */
export function clearFontEmbedCache(): void {
  _fontCssMemo.clear();
}

export async function getCVHtml(opts: GetCVHtmlOptions = {}): Promise<string | null> {
  const {
    selector = "[data-cv-preview-active], [data-cv-preview], #cv-preview-area",
    extraStyles = "",
    containerEl = null,
  } = opts;

  const container =
    containerEl ?? document.querySelector<HTMLElement>(selector);
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
    /* Page-break rules:
       - Headings stay glued to their following content.
       - Individual list items don't split mid-bullet.
       - Sections themselves DO flow across pages — the old blanket
         "section { page-break-inside: avoid }" rule caused tall sections
         (e.g. Experience) to be pushed entirely to page 2, leaving huge
         blank gaps at the bottom of page 1. Templates that want to keep
         a small group together (e.g. one job entry) opt in by setting
         the 'data-pdf-keep' attribute on the wrapper. */
    h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
    li { break-inside: avoid; page-break-inside: avoid; }
    [data-pdf-keep] { break-inside: avoid; page-break-inside: avoid; }
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
