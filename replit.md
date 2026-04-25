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
- **Vocab is DB-driven, not hardcoded** — `cv_verbs` (1012 rows across technical / management / analysis / communication / financial / creative), `cv_banned_phrases` (197), `cv_field_profiles` (with `jd_keywords`), `cv_voice_profiles`, `cv_section_openers`, `cv_seniority_field_combos`. KV mirrors are rebuilt by the admin **Sync KV** button or auto-resync after any write. Verb pool growth is re-runnable via `node cv-engine-worker/scripts/seed-verbs-bulk.cjs` (idempotent INSERT OR IGNORE + KV refresh).
- **Post-generation enforcement** — `services/geminiService.ts::enforceVoiceConsistency` aggregates worker-reported issues (banned phrases, voice drift) plus a local **word-frequency check** (`services/cvEngine/wordFrequency.ts::findOverusedWords`, stem-collapsing, stopword-aware, threshold = 5) so any non-stopword used 5+ times across the CV bullets is flagged as a `repeated_word` issue and rewritten by the AI fix loop.
- **Hidden ATS keyword PDF layer** — Both PDF paths embed JD tier-1 keywords as selectable-but-invisible text: production jspdf path via `services/pdfService.ts::embedATSData` (4 zones + PDF metadata), `@react-pdf/renderer` path via `services/reactPdfTemplates.tsx::HiddenKeywordLayer` (white text, fontSize 0.1, `fixed` so every page carries it) injected into all 6 templates by `buildReactPDFDocument` when `options.atsKeywords` is supplied.
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

## CI / CD (GitHub Actions, free tier)

Two parallel jobs run on every push/PR to `main`/`master` (defined in `.github/workflows/ci.yml`):

**App job** (~3 min):
1. `node scripts/guard-package-versions.mjs` — fails if `react`, `vite`, `@react-pdf/renderer`, or `@google/genai` are downgraded below known-working minimums.
2. `node scripts/test-banned-phrase-filter.mjs` — 15-case golden test that locks in grammar-preserving behaviour of `applyBannedPhraseFilter` (services/geminiService.ts). Mirror copy of the filter lives in the script — keep both in sync if the filter changes.
3. `npx tsc --noEmit` — informational (continue-on-error) so pre-existing strict-mode warnings don't block urgent fixes.
4. `npm run build` — production build must succeed.

**Worker job** (~2 min, parallel):
1. `node scripts/guard-package-versions.mjs --worker` — pins `@cloudflare/puppeteer >= 1.0.0` (the 0.0.x → 1.x bump fixed the `/v1/acquire` regression in production) and `wrangler >= 3.100.0`.
2. `npx tsc --noEmit` in `resume-pdf-worker/`.

To raise a floor on a new package or new minimum version, edit the `PROTECTED` array in `scripts/guard-package-versions.mjs` and document the reason in the `why` field.

## PDF download → preview color parity

- **Primary path (Playwright server / Cloudflare worker)**: clones the live preview DOM via `services/getCVHtml.ts` and inlines all CSS — `cvData.accentColor` flows through the templates and matches the on-screen preview pixel-for-pixel.
- **Tertiary fallback (`@react-pdf/renderer`, services/reactPdfTemplates.tsx)**: the default `ProfessionalPDF` template now reads `cvData.accentColor` for header border, name, and bullet dots. The other 5 templates (`standard-pro`, `minimalist`, `london-finance`, `ats-clean-pro`, `executive-sidebar`) still use their original hardcoded colors in the react-pdf path — this only matters if BOTH the Playwright server AND the Cloudflare worker are unreachable, which is rare.

## April 2026 — User-Reported Bug Fixes

Five high-priority polish bugs reported by users were addressed in this session:

1. **Empty metric placeholder leaks** — bullets like "Reduced costs by {metric} monthly" or "Grew revenue by XX% in Q4" were leaking the LLM's placeholder tokens into the final CV. Fix: `stripOrphanMetrics` in `services/cvPurificationPipeline.ts` now detects `{metric}`, `[X]`, `XX%`, `$XX`, `___`, `<placeholder>` patterns, drops the leading preposition + token + trailing unit (%, K, M, currency code) but **preserves** real trailing words like "monthly" or "in Q4" so the bullet still reads naturally.

2. **Pronoun scrubber breaking contractions** — the old regex turned "I'm shipping payment systems" into "Mshipping payment systems". Fix: every pronoun pattern in `stripFirstPerson` now uses negative lookahead `(?!['’])` so contractions (`I'm`, `I've`, `we're`, `my'd`, etc.) survive untouched while bare pronouns are still stripped.

3. **Hidden ATS keyword layer becoming visible at zoom** — the inline `text-white text-[1px]` divs would render as faint white text on white when users zoomed past 200%. Fix: created `components/HiddenATSKeywords.tsx` with **five** invisibility guarantees stacked together (off-screen positioning + 1px clip-path + transparent color + opacity 0 + 1px font), then migrated all 28 templates via `/tmp/migrate-hidden-ats.mjs` to use the shared component. ATS scrapers still pick up the text from the DOM; humans never see it at any zoom level.

4. **Degree hallucination** — the LLM was paraphrasing degree names ("BSc Computer Science" → "Bachelor of Science in Computing") and swapping institution names ("University of Nairobi" ↔ "Nairobi University"). Fix: added a binding "DEGREE PRESERVATION" hard-limit clause to the refresh prompt in `services/geminiService.ts` (~line 1445) requiring verbatim copy of both degree and institution strings.

5. **Tense chaos in current roles** — bullets like "Develops and implemented X" mixed present and past tense within a single sentence. Fix: extended `VERB_TENSE_MAP` with 47 new pairs (Conducts/Conducted, Performs/Performed, etc.) and added a new `flipMidBulletVerb` helper that catches mid-sentence tense flips after `and` or `,` conjunctions; integrated into `enforceTenseConsistency`.

### CI Coverage

A new hard gate `scripts/test-bug-fixes.mjs` now mirrors the logic of all four pipeline fixes (12 assertions) and runs in `.github/workflows/ci.yml` alongside the existing `test-banned-phrase-filter.mjs` (15 assertions). Both must pass before any production build is allowed.
