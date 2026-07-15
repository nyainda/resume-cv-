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
  /**
   * When true, injects a ProCV branding footer strip into the exported HTML.
   * Applied to free-tier and BYOK users; removed for Pro (premium) users.
   */
  watermark?: boolean;
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
 * Timeouts are generous (8s CSS, 6s per font) so a slow connection on the
 * first click doesn't leave font URLs un-embedded — that was the cause of
 * the "box-like glyphs" the user saw in downloaded PDFs (the headless
 * browser fell back to a system font that lacked the right characters).
 *
 * Result is memoised per-href so subsequent download clicks are instant,
 * and `prewarmFontEmbedCache()` populates this cache during browser idle
 * time so even the FIRST click pays no font-fetch latency.
 */
async function embedFontCSS(href: string): Promise<string> {
  const cached = _fontCssMemo.get(href);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const cssRes = await fetchWithTimeout(href, 8000, {
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
      // 6s timeout per font — if a single weight hangs, the others still
      // embed and the CV gets a working font; the missing weight falls
      // back via Playwright's outbound network (same-origin to CDN).
      await Promise.all(
        fontUrls.map(async (fontUrl) => {
          try {
            const fontRes = await fetchWithTimeout(fontUrl, 6000);
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

/**
 * Pre-warm the font embed cache during browser idle time. Walks the page's
 * stylesheets, finds every Google Fonts URL, and starts embedding them in
 * the background so the first Download-PDF click no longer pays the
 * ~2-5 second font-fetch latency.
 *
 * Safe to call multiple times — embedFontCSS memoises per-href.
 * Call once after app boot (e.g. from App.tsx in a useEffect).
 */
export function prewarmFontEmbedCache(): void {
  if (typeof window === 'undefined') return;
  const start = () => {
    const hrefs = new Set<string>();
    // <link rel="stylesheet"> Google Fonts in <head>.
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((l) => {
      if (l.href && l.href.includes('fonts.googleapis.com')) hrefs.add(l.href);
    });
    // Stylesheets we can read via the CSSOM (covers @import declarations).
    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.href && sheet.href.includes('fonts.googleapis.com')) hrefs.add(sheet.href);
    }
    for (const href of hrefs) {
      // Fire-and-forget — embedFontCSS catches its own errors.
      void embedFontCSS(href).catch(() => {/* swallow */});
    }
  };
  // Wait for the browser to be idle; fall back to a 1s timeout in browsers
  // (Safari) without requestIdleCallback.
  const ric: ((cb: () => void, opts?: { timeout?: number }) => void) | undefined =
    (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => void }).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(start, { timeout: 5000 });
  } else {
    setTimeout(start, 1000);
  }
}

export async function getCVHtml(opts: GetCVHtmlOptions = {}): Promise<string | null> {
  const {
    selector = "[data-cv-preview-active], [data-cv-preview], #cv-preview-area",
    extraStyles = "",
    containerEl = null,
    watermark = false,
  } = opts;

  const container =
    containerEl ?? document.querySelector<HTMLElement>(selector);
  if (!container) {
    console.warn(`[getCVHtml] Element not found: "${selector}"`);
    console.warn('Add data-cv-preview="true" to the CV preview wrapper div.');
    return null;
  }

  const clone = container.cloneNode(true) as HTMLElement;

  // Strip UI-only padding from the outermost wrapper element. CVPreview renders
  // a `pb-4` (16 px) gap below the CV page — useful for editor spacing but it
  // inflates the captured HTML height and can push a tightly-fitted single-page
  // CV just past the A4 boundary in Playwright, producing a nearly-blank page 2.
  const outerWrapper = clone.firstElementChild as HTMLElement | null;
  if (outerWrapper) {
    outerWrapper.style.paddingBottom = '0';
    outerWrapper.style.paddingTop = '0';
  }

  // Remove UI chrome — buttons and elements explicitly marked for PDF exclusion.
  ["button", "[data-pdf-hide]", ".no-print"].forEach((sel) =>
    clone.querySelectorAll(sel).forEach((el) => el.remove())
  );

  // Strip contenteditable attributes WITHOUT removing the elements.
  // IMPORTANT: do NOT remove these elements — they contain the actual CV content
  // (name, job title, summary, bullet points, education fields, etc.). When the
  // user is in edit mode every editable span has contentEditable:true, so removing
  // the elements would silently wipe the content from the downloaded PDF.
  clone.querySelectorAll<HTMLElement>('[contenteditable]').forEach((el) => {
    el.removeAttribute('contenteditable');
    el.style.outline = '';   // was 'none' — harmless to clear
    el.style.cursor = '';    // was 'text' — harmless to clear
  });

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

  let embeddedFontCss = (
    await Promise.all(googleFontHrefs.map(embedFontCSS))
  ).join('\n');

  // Base64-embedding every font weight for a template with 2+ font families
  // can add several MB to the payload. If it's gotten out of hand, fall back
  // to plain @import statements instead — the PDF renderer (Playwright /
  // Cloudflare's headless browser) has outbound network access and can fetch
  // Google Fonts directly, so this only costs a little render latency, not
  // a failed download. This also protects the Cloudflare worker's request
  // size ceiling from being blown out by pathological font combinations.
  const FONT_EMBED_BUDGET = 3_000_000; // ~3MB of base64 font data
  if (embeddedFontCss.length > FONT_EMBED_BUDGET && googleFontHrefs.length > 0) {
    console.warn(
      `[getCVHtml] Embedded font CSS is ${(embeddedFontCss.length / 1_000_000).toFixed(1)}MB — ` +
      `falling back to @import for Google Fonts to keep the PDF payload small.`
    );
    embeddedFontCss = googleFontHrefs.map((href) => `@import url('${href}');`).join('\n');
  }

  // Non-Google-Fonts external sheets get regular <link> tags
  const linkTags = otherExternalHrefs
    .map((href) => `  <link rel="stylesheet" href="${href}">`)
    .join("\n");

  const inlinedCSS = inlineCssBlocks.join("\n");

  // Centred logo watermark — rendered via position:fixed so Puppeteer/Chromium
  // repeats it on every printed page automatically. Opacity is kept low (0.07)
  // so it reads as a background brand mark, not an obstruction.
  const watermarkHtml = watermark ? `
  <div data-procv-watermark style="position:fixed;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;z-index:99999;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;opacity:0.18;transform:rotate(-20deg);">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="160" height="160">
        <rect width="512" height="512" rx="110" ry="110" fill="#EBFF38"/>
        <rect x="96" y="96" width="44" height="320" rx="18" fill="#1a1a1a"/>
        <rect x="96" y="96" width="136" height="44" rx="18" fill="#1a1a1a"/>
        <rect x="96" y="372" width="136" height="44" rx="18" fill="#1a1a1a"/>
        <rect x="372" y="96" width="44" height="320" rx="18" fill="#1a1a1a"/>
        <rect x="280" y="96" width="136" height="44" rx="18" fill="#1a1a1a"/>
        <rect x="280" y="372" width="136" height="44" rx="18" fill="#1a1a1a"/>
        <text x="256" y="308" text-anchor="middle" fill="#1a1a1a" font-size="132" font-weight="900" font-family="system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif" letter-spacing="-6">CV</text>
      </svg>
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:900;letter-spacing:0.18em;color:#1a1a1a;">PROCV.APP</span>
    </div>
  </div>` : '';

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
  ${watermarkHtml}
</body>
</html>`;
}
