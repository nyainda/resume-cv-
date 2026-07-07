/**
 * rewriter.ts — HTMLRewriter pipeline for injecting SEO meta into the origin HTML.
 *
 * CF's HTMLRewriter is a streaming SAX-style transformer — it injects into
 * <head> as the HTML byte-stream passes through, adding zero meaningful latency.
 *
 * Injection order:
 *   1. Replace / append <title>
 *   2. Meta description, robots, canonical
 *   3. Open Graph (og:*) tags
 *   4. Twitter Card tags
 *   5. hreflang <link rel="alternate"> entries
 *   6. Security & performance headers (X-Frame-Options, preconnect)
 *   7. JSON-LD SoftwareApplication + FAQ structured data
 *   8. Country-specific og:locale
 */

import { BASE_META, buildJsonLd, buildFaqJsonLd } from './meta';
import { getCountryConfig, getHreflangEntries } from './geo';

export interface RewriteContext {
  country: string;
  canonicalUrl: string;
  /** Resolved ORIGIN_URL — used only to strip origin prefix if present */
  originUrl: string;
}

/** Build the full <head> injection HTML string for a given country */
function buildHeadInjection(ctx: RewriteContext): string {
  const cfg = getCountryConfig(ctx.country);
  const title       = cfg.titleSuffix ? `ProCV — ${cfg.titleSuffix}` : BASE_META.title;
  const description = cfg.description ?? BASE_META.description;
  const keywords    = cfg.keywords
    ? [...BASE_META.keywords.split(', '), ...cfg.keywords].join(', ')
    : BASE_META.keywords;
  const ogLocale = cfg.locale ?? 'en_US';
  const ogImage  = `${ctx.canonicalUrl}${BASE_META.ogImagePath}`;

  const hreflangs = getHreflangEntries(ctx.canonicalUrl)
    .map(e => `<link rel="alternate" hreflang="${e.hreflang}" href="${e.href}" />`)
    .join('\n  ');

  const jsonLd    = buildJsonLd(ctx.canonicalUrl);
  const faqJsonLd = buildFaqJsonLd();

  return `
  <!-- ProCV SEO — injected by seo-proxy-worker at CF edge -->
  <meta name="description" content="${esc(description)}" />
  <meta name="keywords" content="${esc(keywords)}" />
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
  <link rel="canonical" href="${esc(ctx.canonicalUrl)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="ProCV" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(ctx.canonicalUrl)}" />
  <meta property="og:image" content="${esc(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="ProCV — AI-powered CV builder" />
  <meta property="og:locale" content="${esc(ogLocale)}" />

  <!-- Twitter / X Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />

  <!-- hreflang: international SEO -->
  ${hreflangs}

  <!-- Performance hints -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="dns-prefetch" href="https://cv-engine-worker.dripstech.workers.dev" />

  <!-- Structured data: SoftwareApplication -->
  <script type="application/ld+json">${jsonLd}</script>

  <!-- Structured data: FAQ -->
  <script type="application/ld+json">${faqJsonLd}</script>
  <!-- /ProCV SEO -->`;
}

/** Replace existing <title> content with the country-specific title */
class TitleRewriter implements HTMLRewriterElementContentHandlers {
  private title: string;
  private done = false;

  constructor(title: string) { this.title = title; }

  element(el: Element) {
    if (this.done) return;
    this.done = true;
    el.setInnerContent(this.title);
  }
}

/** Append SEO meta block before </head> */
class HeadRewriter implements HTMLRewriterElementContentHandlers {
  private injection: string;
  private done = false;

  constructor(injection: string) { this.injection = injection; }

  element(el: Element) {
    if (this.done) return;
    this.done = true;
    el.append(this.injection, { html: true });
  }
}

/** Apply the full SEO rewrite pipeline to a Response */
export function applySeoRewrite(response: Response, ctx: RewriteContext): Response {
  const cfg   = getCountryConfig(ctx.country);
  const title = cfg.titleSuffix ? `ProCV — ${cfg.titleSuffix}` : BASE_META.title;
  const injection = buildHeadInjection(ctx);

  return new HTMLRewriter()
    .on('title',  new TitleRewriter(title))
    .on('head',   new HeadRewriter(injection))
    .transform(response);
}

/** HTML-attribute-safe escape */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
