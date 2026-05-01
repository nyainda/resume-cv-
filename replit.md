# ProCV — Your Personal Career Consultant

## Overview

ProCV is a full-featured PWA designed to help users build, manage, and download professional CVs with advanced AI assistance. It acts as a personal career consultant, leveraging AI for CV generation, cover letter creation, ATS analysis, and interview preparation. The project integrates market intelligence to create highly relevant and impactful CVs, providing a comprehensive toolkit for job seekers. The business vision is to empower individuals in their job search journey, offering a competitive edge through AI-driven personalization and optimization.

## User Preferences

- I want iterative development.
- I prefer detailed explanations.
- Ask before making major changes.
- I do not want any changes to the `CLAUDE.md` file.
- I prefer simple language.
- I want to be informed about all changes.

## System Architecture

ProCV is built as a React 19, TypeScript, and Vite 6 PWA, styled using Tailwind CSS and custom CSS variables.

### UI/UX Decisions
- **Brand Name**: ProCV — "Your Personal Career Consultant"
- **Color Scheme**: Primary Deep Corporate Navy (`#1B2B4B`), Accent Muted Gold (`#C9A84C`), Background Warm Off-White (`#F8F7F4`).
- **Typography**: Playfair Display (headings) and DM Sans (body).
- **Templates**: Offers 35 customizable CV templates across various categories (professional, modern, creative, academic, technical, compact sidebar) with color customization options.
- **Split-template sidebar fillers**: The eight gradient-sidebar templates (`TwoColumnBlue`, `NavySidebar`, `ExecutiveSidebar`, `PhotoSidebar`, `ModernTech`, `CompactSlate`, `CompactSage`, `CompactCharcoal`) all extract quantitative wins from `cvData.experience` (regex on %, currency, large numbers) into a "Key Achievements / Career Highlights / Notable Achievements / Impact / Highlights" section, surface project titles into a sidebar "Selected Projects / Recognized Projects / Featured Work / Repos / Selected Work / Featured" mini-list, and pin a decorative footer to the bottom via `flex flex-col` + `mt-auto` so the sidebar never has awkward empty space when the right column is taller. Each template uses a *different* aesthetic for its filler so the templates remain visually distinct. PhotoSidebar's previously-hardcoded "Personal Attributes" canned strings were removed in favor of real CV data.
- **Sidebar Section Picker**: A compact toolbar in the editor (visible only when a sidebar template is selected) lets the user toggle the three auto-generated sidebar sections (Key Achievements, Selected Projects, References) on or off. Choice persists in `localStorage` (`sidebarSections` key, see `SidebarSectionsVisibility`/`DEFAULT_SIDEBAR_SECTIONS`/`SIDEBAR_TEMPLATES` in `types.ts`). Wired through `CVPreview` → individual sidebar templates via an optional `sidebarSections` prop that defaults to all-on.
- **Compact one-page sidebar templates**: `compact-slate` (slate, dense Inter), `compact-sage` (sage-green with serif Georgia headings + monogram), and `compact-charcoal` (charcoal with gold accent stripe + bold geometric headings) are engineered to fit a single A4 page (`min-h-[280mm]`, 9-10px typography, capped lists: skills 12-14, projects 3, achievements 2). Listed under the "Compact Sidebar" gallery category and rated ATS Friendly.
- **All sidebar templates compressed to one page**: As of Apr 2026, the original 5 sidebar templates (`twoColumnBlue`, `navy-sidebar`, `executive-sidebar`, `photo-sidebar`, `modern-tech`) were also compressed to fit a single A4 page using the same compact recipe — `min-h-[280mm]`, sidebar widths shrunk from 33-38% → 30-32%, padding tightened (`p-4` sidebar, `px-5 py-4` main), text scaled down to 9-10.5px, photo avatars shrunk from `w-28` → `w-20`, and lists capped (skills 12-14, education 2, projects 3, achievements 2). Each template's unique visual identity (gradient color, photo treatment, monogram crest, "Est. YYYY" gold double-rule, terminal `$ generated --on=` footer, etc.) was preserved; only sizing was tightened.
- **WYSIWYG PDF**: Utilizes `html2canvas` for precise PDF generation matching on-screen previews.

### Technical Implementations
- **AI CV Generation**: A two-phase process: Market Research (Google Gemini 2.0 Flash with Google Search grounding) and CV Generation (Groq's `llama-3.3-70b-versatile` or tiered models via Cloudflare Workers AI). It supports various generation modes (honest, boosted, aggressive).
- **Multi-model CV Pipeline**: Uses a tiered endpoint in the `cv-engine-worker` to route tasks to specific, cost-optimized LLMs (e.g., Llama 4 Scout 17B for `cvGenerate`, GLM 4.7 Flash 131K for `cvGenerateLong`). A race endpoint fires multiple generation models in parallel for speed.
- **AI CV Toolkit**: Includes CV Checker (ATS score, keyword analysis), Humanization Audit (voice consistency, banned phrases), and Quality Polish passes (`runQualityPolishPasses`) for post-generation refinement, applying bullet hygiene, pronoun fixes, and advanced leak detection (e.g., round numbers, orphan metrics, rhythm monotony, unquantified metric verbs).
- **JD Pipeline Audit**: Implements a scoring-based industry detection and robust JD parsing, including smart truncation and similarity assessment.
- **PDF Generation**: All CV downloads route through a shared service (`cvDownloadService.downloadCV`) that renders the live preview DOM via headless Chrome (Playwright for dev, Cloudflare `resume-pdf-worker` for production) to ensure WYSIWYG output. Both renderers use `0mm` page margins with `preferCSSPageSize: true` so the template's own internal padding controls layout — adding renderer-side margins compresses the design and breaks WYSIWYG. Google Fonts are inlined as base64 data URIs by `getCVHtml` (8s/6s fetch budgets) and `prewarmFontEmbedCache()` is called during browser idle on app boot so the first Download-PDF click does not pay font-fetch latency. Run `npm run test:pdf` for a smoke test against both renderers (asserts magic header, ≥5 KB body, <12 s round-trip). The legacy `@react-pdf/renderer` fallback (`PDFDownloadButton.tsx` + `services/reactPdfTemplates.tsx`) was removed because its hand-coded layouts only covered 6 templates and silently rendered every other template as the default Professional layout — a long-standing source of "downloaded PDF doesn't match preview" bugs. Now if both headless-Chrome renderers are unreachable, the UI surfaces a clear error rather than producing a wrong-looking PDF.
- **CV Structural Examples / Reference-Guided Generation** (May 2026): After every successful CV generation + full quality pipeline, a compact structural blueprint (summary word count, skills count, per-role bullet word-count rhythm) is stored in the `cv_examples` D1 table keyed by `SHA-256(normalised_role:seniority:purpose:mode)` — never user-specific. Before the next generation for a matching role type, the blueprint is fetched in parallel with `buildBrief` (zero added latency on a miss) and injected as a `===STRUCTURAL REFERENCE===` block (~150 tokens) at the top of `mainPromptInstruction`. The LLM mirrors proven bullet-rhythm patterns (punchy/standard/narrative distribution) and section sizes instead of inventing structure from scratch, reducing first-pass errors and cutting net token spend by ~30-50% on hits. All quality pipeline rules (purifyCV, cvNumberFidelity, humanizer, voice, validator) are fully preserved. Endpoints: `GET /api/cv/examples?fingerprint=<sha256>` and `POST /api/cv/examples`. Client: `services/cvExamplesClient.ts`. Migration: `cv-engine-worker/migrations/009_cv_examples.sql`.
- **Cloudflare D1 LLM Response Cache** (May 2026): All AI calls through `groqChat` (Workers AI, Groq, Cerebras, OpenRouter, Together.ai, Claude, Gemini) are cached in a `llm_cache` table in the cv-engine-worker's D1 database. A SHA-256 key is computed client-side from `model + temperature + systemPrompt + userPrompt`; the response is fetched with a 2-second timeout (GET `/api/cv/llm-cache?key=<hex>`) and stored fire-and-forget (POST `/api/cv/llm-cache`). Only prompts with temperature ≤ 0.5 and total prompt size ≤ 100K characters are cached; responses up to 200KB are stored. Cache TTL is 30 days from last hit; expired rows are cleaned up automatically on every write (background `ctx.waitUntil` DELETE). Circuit breaker in `groqCacheClient.ts` opens on any HTTP 5xx or timeout so cache failures never slow down generation. Migration: `cv-engine-worker/migrations/008_llm_cache.sql`. Env var required: `VITE_CV_ENGINE_URL` (already set).
- **Real-time Generation Progress + Active Provider Display** (`components/CVGenerationProgress.tsx`, May 2026): The generation modal now listens to two CustomEvents — `procv:provider-trying` (fires before each provider attempt) and `procv:provider-chain` (fires after each result). A "AI Provider" panel inside the modal shows a live list: pulsing dot → "contacting…" for an ongoing attempt, "Racing: Cerebras + OpenRouter" for a parallel race, amber ↩ with live countdown for a short-wait Groq retry, ✓ green on success, struck-through on failure. The `handleAutoOptimize` function also tracks the active provider and displays it as a tiny pulsing label beneath the "Optimizing…" button text. The `procv:provider-trying` event (`PROVIDER_TRYING_EVENT` / `ProviderTryingPayload`) is exported from `groqService.ts` and dispatched before every provider call in `groqChat` and `runFreeProviderChain` (Workers AI, Groq, Groq retry, parallel race, Claude, Gemini).
- **Real-time Provider Status Banner** (`components/WorkerStatusBanner.tsx`, May 2026): A slim amber/zinc bar at the top of the dashboard that appears automatically when CF's daily LLM quota is exhausted OR when any fallback provider (Groq, Cerebras, OpenRouter…) is rate-limited. Shows a row of color-coded pills for each configured provider in the exact fallback order (CF Workers → Groq → Cerebras → OpenRouter → Together.ai → Claude → Gemini) — green (✓ ok), amber (rate limited), red (bad key / error), zinc (not configured / standby). Includes a live countdown to the 00:00 UTC daily reset and a "Currently using: X" line once fallback is active. Updates in real-time via the `procv:provider-chain` CustomEvent dispatched by `_recordProviderResult()` inside `groqService.ts`. CF health uses the startup LLM diagnostic result (`WorkerStatusDetail.healthy`) as source of truth rather than the circuit-breaker state, because non-LLM CF endpoints (e.g. `/api/cv/banned` D1 reads) can close the circuit even when LLM quota is still exhausted. On genuine CF recovery the auto-probe triggers a fresh diagnostic run to confirm health before hiding the banner.
- **Resilience**: Features session-level circuit breakers for API calls and pre-size routing to avoid large prompt errors, ensuring system stability. **Cold-start circuit-breaker fix (May 2026)**: The startup `workerStatusDiagnostic` probe fired 800ms after page load and mistakenly called `markFailure('cf-worker')` when the LLM returned empty text (HTTP 200 but no tokens — a normal cold-model symptom), opening the circuit and blocking all subsequent `workerParallelSections` and `workerTieredLLM` calls before the user ever clicked Generate. Fixed in two places: (1) `services/workerStatusDiagnostic.ts` — added `emptyResponseHttp200` flag to distinguish cold models (HTTP 200 + empty body) from genuine errors (HTTP 5xx / network failure). Cold models now produce `reason: 'cold_model'` which skips `markFailure`. (2) `services/cvEngineClient.ts` — `prewarmOne` now calls `markAlive('/api/cv/prewarm')` immediately on HTTP 200, regardless of whether the LLM produced text, so a successful prewarm closes any circuit that was opened by an earlier genuine error.
- **Worker model wake-up**: On every page load `prewarmCVEngineModels()` (in `services/cvEngineClient.ts`) fires tiny 16-token probes through the public `/api/cv/tiered-llm` endpoint at the three production-critical Cloudflare models — `cvGenerate` (Llama 4 Scout 17B), `cvFallback` (Mistral Small 3.1 24B), and `humanize` (Hermes-2 Pro 7B) — so the first real CV generation hits warm models. `cvGenerateLong` (GLM 4.7 Flash) is deliberately excluded because Cloudflare's current deployment of that model returns empty text for every prompt; the race endpoint and parallel-sections both already fall back to Scout/Mistral when GLM 4.7 is broken at runtime. A `rewarmCVEngineModels()` helper is wired into the runtime "no text" recovery path (in `services/groqService.ts`) and into a manual **"Wake AI models now"** button in the Settings modal (under the green CV Engine banner) that displays per-model latency and status. All warm-up calls go through the public tiered endpoint, so the worker's strict rules (task→model mapping, 100K prompt cap, 6K system cap, 8192 token cap, JSON-format injection) are preserved.
- **Worker vs Groq A/B diagnostics**: Two independent comparison tools are available. (a) `scripts/test-worker-vs-groq.mjs` — a CLI script that fires both providers with the identical prompt (same engine brief, same fixture) and scores each on 7 deterministic metrics: JSON validity, bullet count, zero brief-banned phrases, zero AI-isms, verb variety ≥80%, verb-pool adherence ≥40%, rhythm match ≥50%. Exits 0 only when all checks pass. Run as `node scripts/test-worker-vs-groq.mjs` or `GROQ_API_KEY=gsk_xxx node scripts/test-worker-vs-groq.mjs`. (b) **"Compare worker vs Groq" button** in Settings modal — uses `services/cvCompareDiagnostic.ts` to run the same comparison from the browser. Results shown in side-by-side cards (verdict, model, latency, per-metric scores, sample bullets). **Known finding (May 2026)**: Scout 17B passes 6/7 checks but consistently fails the rhythm-sequence check — it writes uniform-length bullets and does not follow short→long→short→medium sequences. This is a documented quality gap vs Groq (llama-3.3-70b-versatile). **Critical browser-side behavior**: Scout 17B returns empty responses (`llm_empty` HTTP 502) when the user prompt contains a literal JSON blob (e.g. `{"bullets":["..."]}`). Production code avoids this by describing schemas in plain English (see `services/geminiService.ts:2515-2524`). Both the CLI test script and the Settings diagnostic use the same workaround.
- **Vision Extract**: Uses `cv-engine-worker` (Llama 3.2-11b-vision-instruct) for text extraction from images, with Gemini as a fallback for PDFs.
- **Word Import**: Leverages `mammoth` for `.docx` parsing and Groq for structured profile data extraction.

### System Design Choices
- **Client-Side Application**: The main application logic resides entirely on the client-side.
- **CV Engine Worker**: A Cloudflare Worker (`cv-engine-worker`) handles deterministic CV generation aspects, including voice profiles, verb pools, banned phrases, field detection, post-generation enforcement, and AI auditing, utilizing Cloudflare Workers AI, D1, and KV.
- **Authentication**: Google OAuth (PKCE flow) for Google Drive sync and Microsoft OAuth for OneDrive integration.
- **API Key Management**: API keys are stored in the browser's `localStorage` and managed via a Settings modal.

## External Dependencies

- **AI Text Generation**:
    - **Groq API**: For CV generation, cover letters, rewriting, ATS analysis, and scoring.
    - **Cloudflare Workers AI**: For LLM-based validation/humanization, semantic keyword matching, and vision extraction.
    - **OpenRouter**: Free-tier models (e.g., Llama 3.3 70B, Qwen 2.5 72B, Gemma 3 27B) as fallbacks.
    - **Together.ai**: Free-tier models (e.g., Llama 3.3 70B Turbo Free) as fallbacks.
    - **Google Gemini API**: For market research, PDF/image parsing, and text extraction.
- **PDF Generation**:
    - **html2canvas**: For capturing DOM elements as images for PDF.
    - **@react-pdf/renderer**: For generating PDF documents from React components.
    - **pdf-lib**: For advanced PDF manipulation.
    - **mammoth**: For converting Word documents (`.docx`) to HTML.
- **Sharing**:
    - **lz-string**: For URL hash encoding for shareable links.
- **GitHub Integration**:
    - **GitHub REST API**: For PAT-based CV backup and importing project data.
- **Email Services**:
    - **Brevo (Sendinblue) REST API**: For direct email sending.
- **Job Search**:
    - **Tavily Search API**: For real-time job listings and detailed job descriptions.
    - **JSearch (RapidAPI)**: Complementary job search service.
- **Cloud Storage/Sync**:
    - **Google Drive (via Google OAuth)**: For optional cloud backup.
    - **Microsoft Graph API**: For OneDrive integration.
- **Analytics**:
    - **@vercel/analytics/react**: For tracking page views.
- **Cloudflare Services (for `cv-engine-worker`)**:
    - **Cloudflare D1**: SQLite database for deterministic CV engine data (LLM cache, CV examples, profile cache).
    - **Cloudflare KV**: Key-Value store for hot lookups in the worker.

## Profile Caching (D1)

Added in May 2026 to reduce heavy prompt payloads that caused 413 (Prompt Too Large) errors with Groq.

### How it works
1. When a user saves or imports a profile, `syncProfileToCache()` (in `services/profileCacheClient.ts`) computes a SHA-256 hash of the compact profile JSON (mirrors `compactProfile()` logic from `geminiService.ts`).
2. If the hash matches the last stored hash for that slot (in `localStorage`), no network call is made.
3. Otherwise, the compact JSON is uploaded to `POST /api/cv/profile` on the cv-engine-worker, stored in the `profile_cache` D1 table keyed by hash.
4. At app boot, a 3-second delayed sync uploads any profile that hasn't been cached yet.
5. Generation requests can reference `{ slot_id, profile_hash }` instead of re-embedding the full profile in the prompt — the worker fetches it from D1 on demand.

### Key files
- `cv-engine-worker/migrations/010_profile_cache.sql` — D1 table schema
- `cv-engine-worker/src/index.ts` — `handleProfileCacheGet` / `handleProfileCachePost` endpoints
- `services/profileCacheClient.ts` — client service: `syncProfileToCache`, `getProfileCacheHash`, `ensureProfileCached`
- `App.tsx` — sync triggered in `handleProfileSave`, `handleWordProfileImported`, and boot-time effect

### Graceful fallback
All caching operations are fire-and-forget. If the worker is unreachable (circuit open, 502, timeout), the app continues using the current inline-profile approach without any visible error.