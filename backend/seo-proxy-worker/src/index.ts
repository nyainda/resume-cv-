/**
 * ProCV SEO Proxy Worker
 *
 * Sits in front of the origin app at Cloudflare's edge.
 * For every HTML request it:
 *   1. Detects the visitor's country (request.cf.country)
 *   2. Fetches the origin page
 *   3. Injects country-specific meta tags, JSON-LD, hreflang via HTMLRewriter
 *   4. Returns the enriched HTML from the nearest CF PoP
 *
 * Static assets are served directly from CF's cache — no origin round-trip
 * after the first request from each PoP.
 *
 * Environment variables (set via wrangler.toml [vars] or `wrangler secret put`):
 *   ORIGIN_URL       — full URL of the upstream app, e.g. https://your-app.vercel.app
 *   HTML_CACHE_TTL   — seconds to cache HTML at CF edge (default 300)
 *   ASSET_CACHE_TTL  — seconds to cache static assets (default 31536000)
 */

import { applySeoRewrite }                     from './rewriter';
import { classifyPath, cacheControlHeader,
         buildCacheKey, addSecurityHeaders }   from './cache';

export interface Env {
  ORIGIN_URL:      string;
  HTML_CACHE_TTL:  string;
  ASSET_CACHE_TTL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const originUrl = (env.ORIGIN_URL ?? '').trim().replace(/\/$/, '');

    if (!originUrl) {
      return new Response(
        'seo-proxy-worker: ORIGIN_URL is not configured. ' +
        'Run: wrangler secret put ORIGIN_URL\n' +
        'or add it to wrangler.toml [vars].',
        { status: 503 },
      );
    }

    const url      = new URL(request.url);
    const country  = (request as any).cf?.country ?? 'US';
    const kind     = classifyPath(url.pathname);

    // ── API routes: pass-through, no caching ──────────────────────────────────
    if (kind === 'api') {
      return passThrough(request, originUrl);
    }

    // ── Static assets: serve from CF cache, long TTL ──────────────────────────
    if (kind !== 'html') {
      return serveAsset(request, originUrl, kind, ctx);
    }

    // ── HTML: inject SEO meta, cache per country ───────────────────────────────
    return serveHtml(request, originUrl, country, ctx);
  },
} satisfies ExportedHandler<Env>;

// ─────────────────────────────────────────────────────────────────────────────
// HTML handler
// ─────────────────────────────────────────────────────────────────────────────

async function serveHtml(
  request: Request,
  originUrl: string,
  country: string,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache    = caches.default;
  const cacheKey = buildCacheKey(request, country);

  // Check CF edge cache first (keyed per country)
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Fetch from origin
  const originReq = buildOriginRequest(request, originUrl);
  let originResp: Response;
  try {
    originResp = await fetch(originReq, { cf: { cacheTtl: 0 } });
  } catch (e: any) {
    return new Response(`seo-proxy-worker: origin fetch failed — ${e?.message}`, { status: 502 });
  }

  // Only rewrite successful HTML responses
  if (!originResp.ok || !isHtml(originResp)) {
    return addHeaders(originResp, 'html');
  }

  const canonicalUrl = `${new URL(request.url).origin}${new URL(request.url).pathname}`.replace(/\/$/, '') || new URL(request.url).origin;

  const rewritten = applySeoRewrite(originResp, {
    country,
    canonicalUrl,
    originUrl,
  });

  // Clone for caching (Response body can only be consumed once)
  const toCache   = rewritten.clone();
  const toSend    = addHeaders(rewritten, 'html');

  // Store at CF edge — background so we don't block the response
  ctx.waitUntil(cache.put(cacheKey, toCache));

  return toSend;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static asset handler
// ─────────────────────────────────────────────────────────────────────────────

async function serveAsset(
  request: Request,
  originUrl: string,
  kind: ReturnType<typeof classifyPath>,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = caches.default;

  const cached = await cache.match(request);
  if (cached) return cached;

  const originReq = buildOriginRequest(request, originUrl);
  let resp: Response;
  try {
    resp = await fetch(originReq);
  } catch (e: any) {
    return new Response(`seo-proxy-worker: asset fetch failed — ${e?.message}`, { status: 502 });
  }

  if (!resp.ok) return resp;

  const toSend = addHeaders(resp, kind);
  ctx.waitUntil(cache.put(request, toSend.clone()));
  return toSend;
}

// ─────────────────────────────────────────────────────────────────────────────
// API / misc pass-through
// ─────────────────────────────────────────────────────────────────────────────

async function passThrough(request: Request, originUrl: string): Promise<Response> {
  try {
    return await fetch(buildOriginRequest(request, originUrl));
  } catch (e: any) {
    return new Response(`seo-proxy-worker: upstream error — ${e?.message}`, { status: 502 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Rewrite the incoming request URL to point at the origin */
function buildOriginRequest(request: Request, originUrl: string): Request {
  const url    = new URL(request.url);
  const target = new URL(url.pathname + url.search, originUrl);
  return new Request(target.toString(), {
    method:  request.method,
    headers: request.headers,
    body:    ['GET', 'HEAD'].includes(request.method) ? null : request.body,
    redirect: 'follow',
  });
}

function isHtml(resp: Response): boolean {
  const ct = resp.headers.get('content-type') ?? '';
  return ct.includes('text/html');
}

/** Return a new Response with correct Cache-Control + security headers */
function addHeaders(
  resp: Response,
  kind: ReturnType<typeof classifyPath>,
): Response {
  const headers = new Headers(resp.headers);
  const cc = cacheControlHeader(kind);
  if (cc) headers.set('Cache-Control', cc);
  addSecurityHeaders(headers);
  headers.set('X-ProCV-Edge', '1');
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}
