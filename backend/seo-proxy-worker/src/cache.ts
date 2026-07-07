/**
 * cache.ts — Cache strategy helpers for the SEO proxy worker.
 *
 * Strategy:
 *   HTML pages     → edge cache 5 min (s-maxage=300), browser 1 min
 *                    Cache key includes country code so each market gets its own
 *                    country-specific meta-enriched HTML
 *   Static assets  → edge cache 1 year when filename is hashed (immutable)
 *                    Plain asset names get 1 hour
 *   API routes     → no caching; always pass-through to origin
 *   Fonts          → edge cache 1 year (always immutable)
 */

const ONE_MINUTE = 60;
const ONE_HOUR   = 3_600;
const ONE_YEAR   = 31_536_000;

export type AssetKind = 'html' | 'static-hashed' | 'static' | 'font' | 'api' | 'other';

/** Classify a URL path into an asset kind */
export function classifyPath(pathname: string): AssetKind {
  if (pathname.startsWith('/api/')) return 'api';

  const ext = pathname.split('.').pop()?.toLowerCase() ?? '';

  if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) return 'font';

  if (['js', 'css', 'mjs'].includes(ext)) {
    // Vite hashes assets: main-BcX7hAbQ.js — detect 8-char hex hash in filename
    return /[.-][a-f0-9]{8,}\.(js|css|mjs)$/i.test(pathname)
      ? 'static-hashed'
      : 'static';
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif'].includes(ext)) {
    // Treat versioned images as hashed
    return /[.-][a-f0-9]{8,}\.(png|jpg|jpeg|gif|webp|svg|avif)$/i.test(pathname)
      ? 'static-hashed'
      : 'static';
  }

  if (ext === 'html' || ext === '' || pathname === '/') return 'html';

  return 'other';
}

/** Build Cache-Control header value for an asset kind */
export function cacheControlHeader(kind: AssetKind): string | null {
  switch (kind) {
    case 'html':           return `public, max-age=${ONE_MINUTE}, s-maxage=300, stale-while-revalidate=60`;
    case 'static-hashed': return `public, max-age=${ONE_YEAR}, immutable`;
    case 'static':        return `public, max-age=${ONE_HOUR}, s-maxage=${ONE_HOUR}`;
    case 'font':          return `public, max-age=${ONE_YEAR}, immutable`;
    case 'api':           return null; // no caching
    case 'other':         return `public, max-age=${ONE_HOUR}`;
  }
}

/**
 * Build a CF Cache API cache key.
 * For HTML, we include the country code so each market gets its own edge-cached copy.
 */
export function buildCacheKey(request: Request, country: string): Request {
  const url = new URL(request.url);
  const kind = classifyPath(url.pathname);
  if (kind === 'html') {
    url.searchParams.set('_cc', country.toLowerCase());
  }
  return new Request(url.toString(), request);
}

/** Add security headers to any outgoing response */
export function addSecurityHeaders(headers: Headers): void {
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
