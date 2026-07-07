---
name: SEO Proxy Worker
description: CF Worker reverse proxy that injects SEO meta at the edge for ProCV; lives at backend/seo-proxy-worker/
---

# CF SEO Proxy Worker

## What it does
Sits in front of the origin app at Cloudflare's 300+ edge PoPs.
For HTML requests: fetches origin → HTMLRewriter injects rich meta → caches per country.
For static assets: aggressive edge caching (1yr for hashed, 1hr for unhashed).
For /api/* routes: transparent pass-through, no cache.

## Key files
- `backend/seo-proxy-worker/wrangler.toml` — CF config, account_id already set
- `backend/seo-proxy-worker/src/index.ts` — main worker entrypoint
- `backend/seo-proxy-worker/src/geo.ts` — 35+ country configs (tier, locale, title, description, keywords)
- `backend/seo-proxy-worker/src/meta.ts` — base meta, JSON-LD SoftwareApplication + FAQ schemas
- `backend/seo-proxy-worker/src/rewriter.ts` — HTMLRewriter pipeline (title, meta, OG, Twitter, hreflang, JSON-LD)
- `backend/seo-proxy-worker/src/cache.ts` — cache key builder, Cache-Control helpers, security headers
- `backend/seo-proxy-worker/SEO-STRATEGY.md` — full market analysis, keyword strategy, domain plug-in instructions

## Deployment (no domain yet)
```bash
cd backend/seo-proxy-worker
npx wrangler secret put ORIGIN_URL   # paste deployed app URL
npm run deploy                        # → procv-seo.dripstech.workers.dev
```

## Domain plug-in (when ready)
Add [[routes]] to wrangler.toml pointing to domain, redeploy. Zero code changes.
CF manages SSL automatically. See SEO-STRATEGY.md for full instructions.

**Why:** React SPA is invisible to crawlers (empty HTML shell). Worker injects meta at edge without SSR rewrite. Also speeds up global load times → Core Web Vitals boost → ranking improvement.

**Country cache key:** HTML cache is keyed by URL + country code (`_cc` param) so each market gets its own country-specific meta-enriched cached copy.

**Target markets:** Tier1=US/GB/CA/AU/NZ/IE, Tier2=DE/NL/SE/NO/CH/DK/FI/AT/BE/FR, Tier3=AE/SA/QA/KW/BH/OM, Tier4=SG/HK/MY/JP/KR/TW, Tier5=IN/NG/ZA/PH/GH/KE
