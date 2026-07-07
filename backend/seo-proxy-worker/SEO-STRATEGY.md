# ProCV — Cloudflare Edge SEO Strategy

## Why This Exists

ProCV is a React SPA (Single Page Application). When Google's crawler visits the
site today, it receives essentially:

```html
<body><div id="root"></div></body>
```

React renders in the browser — not on the server — so crawlers get an empty shell.
There is no meta description, no OG image, no structured data, and no hreflang.
ProCV is largely invisible to search engines regardless of the quality of the product.

The CF SEO proxy worker fixes this without changing any React code. It intercepts
every request at Cloudflare's edge, fetches the real page from the origin, uses
HTMLRewriter to inject all SEO-critical tags as the HTML streams through, and
returns the enriched page — from the nearest of CF's 300+ global PoPs.

---

## Architecture

```
User (any country)
       ↓
Cloudflare Edge  (300+ cities — serving from the nearest PoP)
       ↓
seo-proxy-worker
  ├─ Detect country (request.cf.country — no latency, CF metadata)
  ├─ Check CF edge cache (hit → return immediately, ~5ms TTFB globally)
  ├─ Miss → fetch origin (Vercel / Replit deployment)
  ├─ HTMLRewriter pipeline (streaming, zero DOM parse overhead):
  │    ├─ Replace <title> with country-specific title
  │    ├─ Inject meta description, keywords, robots, canonical
  │    ├─ Inject Open Graph tags (og:title, og:description, og:image, og:locale)
  │    ├─ Inject Twitter/X Card tags
  │    ├─ Inject hreflang <link> for all 35+ target markets
  │    ├─ Inject JSON-LD SoftwareApplication structured data
  │    ├─ Inject JSON-LD FAQ structured data
  │    └─ Inject preconnect / DNS-prefetch performance hints
  └─ Store enriched HTML in CF edge cache (keyed by URL + country code)
       ↓
Browser / Google crawler receives fully SEO-rich HTML
```

---

## Target Markets (Tiered by Subscription LTV)

| Tier | Countries | Why |
|------|-----------|-----|
| **1** — Highest ARPU | US, GB, CA, AU, NZ, IE | English-speaking, high income, established SaaS subscription culture |
| **2** — European professionals | DE, NL, SE, NO, CH, DK, FI, AT, BE, FR | High income, strong job mobility, comfortable paying for career tools |
| **3** — Gulf / MENA | AE, SA, QA, KW, BH, OM | High income, rapidly growing professional class, Vision 2030 workforce push |
| **4** — APAC hubs | SG, HK, MY, JP, KR, TW | Competitive job markets, high English proficiency, subscription-familiar |
| **5** — High volume | IN, NG, ZA, PH, GH, KE | Lower ARPU individually but massive volume; strong diaspora who pay in Tier 1 currencies |

Every country in the config has:
- A localized `<title>` (e.g. "ProCV — AI CV Builder for the UK Job Market")
- A market-specific `<meta description>` with local employer names / keywords
- Country-relevant keywords fed into JSON-LD
- The correct `og:locale` for social sharing
- Local currency symbol in descriptions where relevant

---

## SEO Features Injected at the Edge

### 1. Rich Meta Tags
Every country gets a distinct, non-generic title and description. Google penalises
duplicate or thin meta across pages — all 35+ country variants point to the same
URL but with relevant differentiation (this is valid international SEO).

### 2. Open Graph / Twitter Cards
Without OG tags, sharing ProCV on LinkedIn, X, or WhatsApp shows a blank link.
With OG tags, it shows the branded image, title, and description — free acquisition.

### 3. hreflang Tags
Tells Google exactly which countries this URL serves. Prevents "duplicate content"
penalties and ensures the right title/description appears in each market's SERPs.
All 35+ markets have an entry. The `x-default` fallback points to the English version.

### 4. JSON-LD Structured Data — SoftwareApplication
Enables Google rich results: star rating, pricing, feature list directly in search
results. Higher click-through rate even at the same ranking position.

### 5. JSON-LD FAQ
Enables FAQ rich results for high-intent queries ("is ProCV free?", "does ProCV
pass ATS?"). These appear as expandable Q&A blocks in search results — enormous
click-through advantage for bottom-of-funnel queries.

### 6. Performance (Core Web Vitals)
CF edge cache means HTML arrives in ~10-30ms globally instead of 200-500ms from a
single origin. LCP (Largest Contentful Paint) and TTFB are direct Google ranking
factors since 2021. Serving from the nearest PoP improves both.

Static assets (Vite-hashed JS/CSS) are cached at CF edge for 1 year. Fonts for 1
year. Unhashed assets for 1 hour.

### 7. Security Headers
X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy
are added at the edge to every response — good for trust signals and some crawlers.

---

## Keyword Strategy per Market

### Tier 1: English-speaking
- **US**: "AI resume builder", "ATS resume", "resume maker USA", "cover letter generator"
- **GB**: "CV builder UK", "AI CV maker", "professional CV", "ATS CV template"
- **CA**: "resume builder Canada", "CV maker Canada", "Canadian resume format"
- **AU**: "CV builder Australia", "resume Australia", "ATS CV Australia"

### Tier 2: European
- **DE**: "Lebenslauf erstellen", "Lebenslauf KI", "Bewerbung KI", "ATS Lebenslauf"
- **FR**: "créer CV en ligne", "CV IA", "générateur CV", "lettre de motivation IA"
- **NL, SE, NO, DK, FI**: English keywords (high English proficiency in Nordic/Benelux)

### Tier 3: Gulf
- **AE**: "CV builder Dubai", "resume builder UAE", "Gulf job CV", "MENA resume"
- **SA**: "CV builder Saudi Arabia", "سيرة ذاتية احترافية", "Vision 2030 career"

### Tier 4: APAC
- **SG**: "CV builder Singapore", "ATS resume Singapore", "MAS job CV"
- **IN**: "resume builder India", "AI resume India", "Naukri resume", "job application India"

---

## Domain Plug-In (When Ready)

Currently the worker deploys to:
```
https://procv-seo.dripstech.workers.dev
```

When you have your domain (e.g. `procv.com`):

**Step 1** — Add the domain to Cloudflare (DNS managed by CF, or add a CNAME):
```
CNAME procv.com → your-vercel-app.vercel.app
```
Then set the Cloudflare proxy (orange cloud ☁) on that DNS record — this routes
all traffic through CF Workers automatically.

**Step 2** — Add routes to `wrangler.toml`:
```toml
[[routes]]
pattern = "procv.com/*"
zone_name = "procv.com"

[[routes]]
pattern = "www.procv.com/*"
zone_name = "procv.com"
```

**Step 3** — Deploy:
```bash
cd backend/seo-proxy-worker
npx wrangler deploy
```

That's it. SSL is automatic (CF manages certificates). Zero code changes needed.
The worker immediately starts serving from 300+ global edge locations.

---

## Deployment Commands

```bash
# Install deps
cd backend/seo-proxy-worker
npm install

# Set your origin URL (the upstream Vercel / Replit deploy URL)
npx wrangler secret put ORIGIN_URL
# → paste your URL when prompted, e.g.: https://procv.vercel.app

# Test locally (proxies to origin, runs on localhost:8788)
npm run dev

# Deploy to workers.dev (before custom domain)
npm run deploy

# Check TypeScript without deploying
npm run check
```

---

## Monitoring

Once deployed, CF provides:
- **Analytics → Workers → procv-seo-proxy**: requests/sec, CPU time, error rate
- **Cache Analytics**: hit rate per country — aim for >80% HTML cache hit rate
- **Web Analytics** (free): can be added to the injected `<head>` for real browser metrics
- **Google Search Console**: add property for your domain to see indexing, impressions,
  clicks per country — this is the ground truth for whether the SEO is working

---

## What to Build Next (Phase 2)

1. **OG image generation** — CF Worker can generate dynamic OG images (using
   `@cloudflare/puppeteer` or Satori) with country-specific text. Higher CTR on social.

2. **Sitemap injection** — serve a `sitemap.xml` from the worker that lists the canonical
   URL with `<xhtml:link rel="alternate">` hreflang entries — redundant hreflang signal
   that Google recommends alongside head tags.

3. **Country-specific landing pages** — create `/uk`, `/de`, `/ae` subpaths that the
   worker serves with fully country-specific content (longer text, local employer names,
   local salary data). This creates separate indexable pages per market.

4. **Blog / content at the edge** — CF KV can store markdown blog posts. The worker
   serves them as HTML at `/blog/...` — fully SEO-friendly, zero origin load.

5. **Real-time rank tracking** — integrate a rank tracking API (e.g. DataForSEO)
   and surface top-10 keyword positions in the admin panel.
