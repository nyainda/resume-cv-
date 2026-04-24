# ProCV — Your Personal Career Consultant

A full-featured React + Vite PWA for building, managing, and downloading professional CVs with AI assistance.

## Brand / Design System
- **Name**: ProCV — "Your Personal Career Consultant"
- **Primary color**: Deep Corporate Navy `#1B2B4B`
- **Accent color**: Muted Gold `#C9A84C`
- **Background**: Warm Off-White `#F8F7F4`
- **Typography**: Playfair Display (headings) + DM Sans (body)
- **Rules**: See `CLAUDE.md` for complete design system rules — no indigo/purple, no AI vibes

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6
- **Styling**: Tailwind CSS (CDN), custom CSS variables for theming
- **AI — Text Generation**: Groq API (OpenAI-compatible, direct fetch)
  - `llama-3.3-70b-versatile` → CV generation, cover letters, rewriting, essays
  - `llama-3.1-8b-instant` → Fast ATS analysis, keyword extraction, CV scoring
- **AI — Vision/Multimodal + Market Research**: Google Gemini 2.5 Flash / 2.0 Flash via `@google/genai`
  - PDF upload, image parsing (file text extraction only)
  - **Google Search grounding** (gemini-2.0-flash): Pre-generation market research via `services/marketResearch.ts`
- **PDF Generation**: jsPDF (CDN) + html2canvas (CDN) — legacy; `@react-pdf/renderer` for Professional/Standard Pro/Minimalist templates
- **Sharing**: Privacy-first shareable links via `lz-string` URL hash encoding (no backend)
- **GitHub Sync**: PAT-based CV backup to private GitHub repos via REST API
- **Email**: Brevo (Sendinblue) REST API (direct browser calls)
- **Job Search**: Tavily Search API + JSearch (RapidAPI) for real-time listings
- **Storage**: Write-through triple-layer storage — localStorage + IndexedDB + optional Google Drive sync (via WriteThroughDriveService in StorageRouter)
- **PDF Tools**: `pdf-lib` for merge, split, remove pages, extract pages, image→PDF, sign PDF; `mammoth` for Word→PDF
- **Playwright PDF Server**: Headless Chromium on port 3001 (Express `server-pdf.cjs`) for pixel-perfect HD PDF export
- **Analytics**: `@vercel/analytics/react` — auto-tracks page views when deployed to Vercel
- **Auth**: Google OAuth (PKCE flow via custom GoogleAuthContext)

## Project Structure

```
App.tsx              — Root component, multi-profile state, settings, routing
index.tsx            — Entry point, boot-time IDB restore, service worker
index.html           — PWA manifest, CDN scripts (Tailwind, jsPDF, html2canvas)
types.ts             — All shared TypeScript types

components/
  CVGenerator.tsx       — Main CV generation UI with Share/AI Coach/GitHub buttons; auto-scores CV after generation; 🎤 Interview Prep shortcut button
  LinkedInGenerator.tsx — LinkedIn profile package generator (headline, About, skills, post, connection message, tips)
  InterviewPrep.tsx     — Interview prep tool: 10 tailored Q&A, practice mode, category filters, + thank-you letter generator
  CVPreview.tsx         — Renders selected template (React components)
  GitHubImportPanel.tsx — Fetches GitHub repos, lets user select & import as projects + skills
  SharedCVView.tsx      — Full-screen view for opened shared CV links
  ShareCVModal.tsx      — Generates shareable lz-string URL hash links
  AIImprovementPanel.tsx — AI chat panel for CV improvement (Gemini)
  GitHubSyncModal.tsx   — GitHub PAT-based CV backup modal
  PDFDownloadButton.tsx — react-pdf download button (lazy-loaded)
  TemplateThumbnail.tsx — Scaled live CV thumbnail preview
  ProfileManager.tsx    — Multi-profile switcher with add/edit/delete
  SettingsModal.tsx     — API keys (Groq primary + Gemini optional, Tavily, Brevo) + Google Drive sync
  EmailApply.tsx        — Email application wizard (Brevo or mailto fallback)
  templates/            — 26+ named CV template components (incl. TemplateSWEElite.tsx)
  ...

services/
  groqService.ts        — Groq AI client (OpenAI-compatible fetch) for all text generation
  geminiService.ts      — Routes text tasks to Groq; keeps Gemini only for PDF/image vision; accepts optional MarketResearchResult to inject market context into CV generation prompt
  marketResearch.ts     — Pre-generation market intelligence service: Gemini 2.0 Flash + Google Search grounding; detects Scenario A/B/C; returns topSkills, atsKeywords, expectedTools, industryInsights; always fails silently
  pdfService.ts         — Legacy programmatic jsPDF (kept but superseded by html2canvas)
  brevoService.ts       — Brevo email sending
  tavilyService.ts      — Job board search + full JD fetch
  wordImportService.ts  — Word (.docx) parsing via mammoth + Groq profile extraction (extractTextFromDocx, extractTextFromArrayBuffer, parseWordTextToProfile)
  oneDriveService.ts    — Microsoft Graph API client (listWordFiles, downloadFile, getFileLastModified)
  storage/              — LocalStorage + IndexedDB + Google Drive storage layer

hooks/
  useStorage.ts      — Auth-aware async storage hook (LocalStorage or Drive)
  useLocalStorage.ts — Simple synchronous localStorage hook
  useToast.ts        — Toast notification hook

auth/
  GoogleAuthContext.tsx — Google OAuth context and token management
```

## Key Features

- **Multiple profiles** — Create, switch, rename, color-code, and delete named profiles
- **AI CV Generation** — Two-phase: Gemini Google Search grounding researches live market trends first (topSkills, ATS keywords, expected tools), then Groq generates the CV using that market intelligence. Three scenarios: A (no JD — profile-based research), B (short hint — builds virtual JD), C (full JD — enriches implicit expectations). Supports honest/boosted/aggressive modes
- **32 Templates** — All categories (professional, modern, creative, academic, technical). Color customization (`cvData.accentColor`) wired in 30/32 templates via `const accent = cvData.accentColor ?? '<default-hex>'` + inline styles. TemplateMinimalist and TemplateSWEClean intentionally neutral (no brand accent).
- **WYSIWYG PDF** — html2canvas captures the exact preview, ensuring download matches preview
- **Email Apply** — Paste a JD, AI composes email + cover letter, send via Brevo directly
- **Job Board** — Live job search via Tavily with full JD fetch and company research
- **Google Drive Sync** — Optional cloud backup via Google OAuth
- **PWA** — Service worker, offline capable, installable

### CV Toolkit (enhanced)
- **CV Checker** — ATS score, keyword match analysis, strengths/weaknesses, Fix & Regenerate loop
- **Fix & Regenerate** — CV Checker sends missing keywords + weaknesses directly to CV Generator as a pre-filled suggestion banner
- **Cover Letter** — Smart AI generation with "Send to Generator" shortcut
- **Paraphraser** — 4 tone modes with "Use in Generator" shortcut; JD-aware context
- **Word Import (Upload)** — Upload any .docx file; mammoth parses it, Groq AI extracts structured profile data; imported directly into user profile
- **Word Online Sync** — Paste a OneDrive sharing link (no Azure account needed); app fetches the .docx directly via Microsoft Graph shares API; AI-parses into profile; Live Sync toggle polls every 30s for changes; saved URL persists in localStorage (`cv_builder:word_sync_url`)
- **Live Status Banner** — Shows active profile name and active job at all times in the Toolkit
- **Microsoft / OneDrive** — Settings: Azure Client ID + Microsoft OAuth implicit flow popup; token stored in localStorage + IDB

## CV Engine Worker (`cv-engine-worker/`)

A Cloudflare Worker that owns the **deterministic** half of CV generation: voice profiles, verb pools, banned phrases, field detection, openers, and seniority/section briefs. Every CV generation in the app calls `POST /api/cv/brief` first to fetch a JD-aware brief that is fed into the Groq prompt, then `POST /api/cv/clean` and `POST /api/cv/validate-voice` after generation to enforce voice consistency.

- **Stack**: Cloudflare Workers + D1 (SQLite, db `cv-engine-db`) + KV (`CV_KV` for hot lookups) + Workers AI (`@cf/meta/llama-3.1-8b-instruct`) for the AI Auditor.
- **Vocab is DB-driven, not hardcoded** — `cv_verbs`, `cv_banned_phrases`, `cv_field_profiles` (with `jd_keywords`), `cv_voice_profiles`, `cv_section_openers`, `cv_seniority_field_combos`. KV mirrors are rebuilt by the admin **Sync KV** button or auto-resync after any write.
- **Self-improving vocabulary**:
  - **Leak Queue (Phase I)** — Frontend reports any banned phrase that slips through to `POST /api/cv/leak-report`; rows accumulate in `cv_leak_candidates`; cron `15 3 * * *` auto-promotes anything with `count >= 5` into `cv_banned_phrases`.
  - **AI Auditor** — Admin tab runs Workers AI as a second pass on top of the deterministic regex rules, surfaces *novel* AI-isms not yet banned, one-click promote into the banned list.
  - **Voice Tester (Phase J)** — Admin tab forces a specific voice/field/seniority brief, paste candidate bullets, get per-bullet pass/fail with severity-coded issues — used to tune voice profiles before they ship.
  - **Telemetry (Phase K)** — `cv_request_telemetry` records seniority/field/voice/section/jd_present/field_source for every brief; `field_source` distinguishes `requested` vs `jd_keywords` vs `fallback` vs `none` so we can see exactly when JD detection has signal.
- **Admin auth (Phase H)** — `cv_admin_tokens` table with hierarchical roles (`viewer` < `editor` < `admin`). Tokens are SHA-256 hashed; plaintext (`cvk_…`) shown exactly once on creation. Bootstrap `env.ADMIN_TOKEN` secret remains a permanent admin so we never lock ourselves out. Manage from the admin **Tokens** tab.
- **Deploy**: `cd cv-engine-worker && CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npx wrangler deploy`. Migrations live in `cv-engine-worker/migrations/` and are applied with `wrangler d1 execute cv-engine-db --remote --file=migrations/NNN_name.sql`. Rolling phase tracker is `BUILD_PROGRESS.md`.

## Environment

- Port: **5000** (Replit webview requirement)
- App API keys stored in browser localStorage under `cv_builder:apiSettings`
- App is client-side; the only server-side piece is the CV Engine Worker described above
- Worker URL configured via `VITE_CV_ENGINE_URL` (set in `.replit`)

## API Keys (all stored in Settings modal)

### Multi-Model AI Architecture
- **Groq API key** (primary — required for all text AI features)
  - Free tier with very generous limits: https://console.groq.com/keys
  - Powers: CV generation, cover letters, rewriting, scholarship essays, ATS analysis, CV scoring
  - `llama-3.3-70b-versatile` for quality tasks; `llama-3.1-8b-instant` for fast keyword/scoring tasks
  - Stored in `apiSettings.groqApiKey`
- **Gemini API key** (optional — enables file uploads AND market research)
  - https://aistudio.google.com/app/apikey
  - Powers: PDF upload → text extraction, image parsing, pre-generation market research (Google Search grounding via gemini-2.0-flash)
  - Market research always fails silently — CV generation proceeds with or without it
  - Stored in `apiSettings.apiKey`
- Tavily API key — For job board search (optional)
- Brevo API key — For direct email sending (optional, falls back to mailto)
- Microsoft Azure Client ID — For Microsoft/OneDrive integration (optional, user registers Azure app)

### `apiKeySet` flag
Checks `!!apiSettings?.groqApiKey` — gates all AI generation buttons (Generate CV, Cover Letter, etc.).
