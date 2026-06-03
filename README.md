# ProCV — Your Personal Career Consultant

> 14 AI-powered career tools in your browser. ATS-optimised CVs, interview prep, job search, and salary negotiation. No account. No cloud. Free forever.

---

## What is ProCV?

ProCV is a complete career suite built entirely in your browser. It generates tailored, ATS-optimised CVs that match each job description you target, while giving you the full toolkit to land the role — from interview prep to salary negotiation scripts.

**No accounts. No server storage. No subscriptions.** Every tool works from a single profile you fill in once.

---

## The 14 Tools

| # | Tool | What it does |
|---|------|-------------|
| 01 | **CV Generator** | Tailors every CV to the exact job — keywords, tone, ATS score — in under 5 minutes |
| 02 | **LinkedIn Optimizer** | Rewrites your headline, About section, and top 20 skills to match your target role |
| 03 | **Interview Prep** | 10 tailored questions with model answers (Behavioural, Technical, Situational) + thank-you letter |
| 04 | **Portal Scanner** | 150+ company career portals scanned in one click — Greenhouse, Ashby, Lever, and direct pages |
| 05 | **Job Board** | Live job listings filtered by role and location from real-time search |
| 06 | **CV Toolkit** | Deep ATS analysis — weak bullets flagged, missing keywords identified, rewrites suggested |
| 07 | **Scholarship Essays** | Personal statements and funding essays tailored to each institution's prompts |
| 08 | **Negotiation Coach** | Market-rate data, counter-offer scripts, and walk-away strategies |
| 09 | **Email Apply** | One-click application emails personalised from your profile and the JD |
| 10 | **Application Tracker** | Kanban pipeline — interviews, follow-ups, deadlines, all in one place |
| 11 | **Analytics** | Application velocity, response rates, and story coverage — your search quantified |
| 12 | **PDF Merger** | Combine CV, cover letter, and portfolio into a single polished document |
| 13 | **Profile Manager** | Multiple career identities (software, finance, design) with full data separation |
| 14 | **Cloud Backup** | Optional Google Drive encrypted backup — data stays local by default |

---

## Quick Start (5 minutes)

### 1. Get your API keys

ProCV uses AI providers you connect yourself. Your keys are stored only in your browser.

| Provider | Purpose | Cost |
|----------|---------|------|
| [Google Gemini](https://aistudio.google.com/app/apikey) | CV generation, ATS analysis, essay writing | Free tier generous |
| [Tavily](https://app.tavily.com/home) | Portal Scanner + Job Board | 1,000 free searches/month |
| [Groq](https://console.groq.com/keys) *(optional)* | Faster generation alternative | Free tier |
| [Claude](https://console.anthropic.com/keys) *(optional)* | Long-form essays and cover letters | Pay-as-you-go |

### 2. Fill your profile once

Go to **Profile** and enter your experience, education, skills, and career goals. ProCV can also:
- Parse an existing CV (PDF or Word upload)
- Import from a GitHub URL
- Extract from a pasted LinkedIn profile

### 3. Target a role and generate

Paste a job description into the CV Generator. ProCV will:
1. Analyse the JD for required keywords
2. Find gaps in your current CV
3. Generate a tailored, ATS-optimised CV pinning the missing terms
4. Score it against the JD before you download

### 4. Download and apply

- Choose from **35 CV templates** across 8 design families
- Download a pixel-perfect PDF (WYSIWYG — what you see is what prints)
- Use Email Apply to send a pre-drafted application in one click
- Track the application in your pipeline

---

## ATS Scores: Before vs After

ProCV consistently moves CVs from the 20–50 range into the 85–97 range. These are typical results:

| Role | Before | After | Time |
|------|--------|-------|------|
| Product Manager (Fintech → FAANG) | 31/100 | 94/100 | 4 min |
| Software Engineer (Agency → Stripe) | 44/100 | 97/100 | 3 min |
| Marketing Director (SME → Fortune 500) | 27/100 | 91/100 | 5 min |

---

## Privacy Guarantees

| Guarantee | Detail |
|-----------|--------|
| **No server storage** | Everything lives in your browser. Nothing uploaded without your consent. |
| **Your keys, your calls** | ProCV never proxies, logs, or stores API keys server-side. |
| **No tracking** | Zero telemetry — no session recordings, no event logging, no ad pixels. |
| **Free forever** | No subscription, no paywall, no freemium bait-and-switch. |

---

## CV Templates

35 templates across 8 families:

- **Professional**: Standard Pro, Executive Bold, London Finance, Consulting Pro
- **Modern**: Modern Minimal, Startup Founder, SWE Elite, Operations Lead
- **Creative**: Creative Director, UX Designer, Journalist, Architect
- **Academic**: Academic Classic, Research Fellow, Scholarship Pro
- **Technical**: Data Scientist, Embedded Engineer, Biotech Researcher
- **Sidebar (Navy)**: Two-Column Blue, Navy Sidebar, Executive Sidebar
- **Sidebar (Photo)**: Photo Sidebar, Modern Tech
- **Compact Sidebar**: Compact Slate, Compact Sage, Compact Charcoal

All sidebar templates are compressed to fit a single A4 page. All templates produce WYSIWYG PDFs — the preview matches the download exactly.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS |
| PDF generation | Playwright (local) + Cloudflare Worker (production) |
| AI providers | Google Gemini, Groq, Cloudflare Workers AI, Claude, OpenRouter |
| Storage | Browser localStorage + IndexedDB (local-first) |
| Cloud backup | Google Drive API (optional, OAuth PKCE) |
| CV Engine | Cloudflare Worker + D1 (SQLite) + KV |
| Job search | Tavily Search API, JSearch (RapidAPI) |

---

## Running Locally

```bash
# Install dependencies
npm install

# Start the frontend (port 5000)
npm run dev

# Start the PDF server (port 3001, separate terminal)
npm run pdf-server
```

Open [http://localhost:5000](http://localhost:5000) and add your API keys in **Settings**.

The PDF server uses Playwright + Chromium to generate pixel-perfect PDFs. It starts automatically when you run `npm run pdf-server`. Chromium is installed via `replit.nix`.

---

## Project Structure

```
backend/
  cv-engine-worker/     Cloudflare Worker — CV engine, verb pools, banned phrases, D1, KV
  resume-pdf-worker/    Cloudflare Worker — headless browser PDF rendering
  migrations/           PostgreSQL migration SQL files
  scripts/              Audit, test, and seeding scripts
  server-pdf.cjs        Local Playwright PDF server (port 3001)

frontend/
  components/           React UI components — 35+ CV templates + all tool panels
  services/             AI calls, storage routing, PDF generation, security
  hooks/                Custom React hooks (storage, auto-save, auto-sync)
  auth/                 Google OAuth context (Drive backup)
  data/                 Static data — job portals, role tracks
  utils/                Pure utility helpers
  public/               PWA assets — icons, manifest, service worker
  App.tsx               Root component
  types.ts              Shared TypeScript types

api/                    Vercel serverless functions
vite.config.ts          Vite config (root: frontend/)
```

---

## Deployment

The frontend builds to a static site and deploys to Vercel or any CDN:

```bash
npm run build       # outputs to dist/
```

The CV Engine and PDF Worker deploy to Cloudflare:

```bash
cd backend/cv-engine-worker && npx wrangler deploy
cd backend/resume-pdf-worker && npx wrangler deploy
```

---

## Scripts

```bash
npm run test:pdf          # Smoke-test PDF generation (both local and CF worker)
npm run test:cv-quality   # CV quality pipeline tests
npm run test:gap-pin      # ATS gap-pin feature tests
npm run test:pipeline     # Full end-to-end pipeline test
npm run test:variance     # CV variance and diversity tests
npm run audit:rules       # Count active rules in the CV engine
```

---

*ProCV — Your Personal Career Consultant. Built with care. Offered free. Always.*
