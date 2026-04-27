# ProCV — Your Personal Career Consultant

## Overview

ProCV is a full-featured PWA designed to help users build, manage, and download professional CVs with advanced AI assistance. The project aims to be a personal career consultant, leveraging AI for CV generation, cover letter creation, ATS analysis, and interview preparation. It integrates market intelligence to create highly relevant and impactful CVs, providing a comprehensive toolkit for job seekers. The business vision is to empower individuals in their job search journey, offering a competitive edge through AI-driven personalization and optimization.

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
- **Templates**: Offers 32 customizable CV templates across various categories (professional, modern, creative, academic, technical) with color customization options.
- **WYSIWYG PDF**: Utilizes `html2canvas` for precise PDF generation matching on-screen previews.

### Technical Implementations
- **AI CV Generation**: A two-phase process:
    1. **Market Research**: Google Gemini 2.0 Flash (via `marketResearch.ts`) with Google Search grounding researches live market trends (top skills, ATS keywords, expected tools). This can adapt to scenarios with no JD, short hints, or full JDs.
    2. **CV Generation**: Groq's `llama-3.3-70b-versatile` generates the CV using the gathered market intelligence. Supports honest, boosted, or aggressive generation modes.
- **AI CV Toolkit**:
    - **CV Checker**: Provides ATS score, keyword match analysis (semantic matching via Cloudflare Workers AI), strengths/weaknesses, and a "Fix & Regenerate" loop.
    - **Humanization Audit**: Uses `cv-engine-worker` with Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) to enforce voice consistency and identify banned phrases, falling back to Groq.
    - **Quality Polish (single source of truth)**: One `runQualityPolishPasses` helper in `geminiService.ts` is THE place where post-Groq CV polish lives. Every generation path — `generateCV`, `improveCV` (Auto Optimize), and `optimizeCVForJob` — calls into it, so all three flows produce CVs at strict parity. The helper runs (in order): humanizer (with corrupt-metric revert) → bullet-count enforcer → banned-phrase filter → optional profile customSections/sectionOrder carry-through → experience sort → deterministic purify (with telemetry hook for caller-owned reporting) → optional voice-consistency enforcement against the CV-engine brief (with revert) → **second deterministic purify pass** (catches anything the voice-fix LLM reintroduced — orphan metrics, weird verbs, etc.) → finalize (source-fidelity vs profile or vs source CV) → pronoun safety net. Bullet-count strategy is selectable: `profile-pointcount` (Generate path — honours user's `pointCount` from `UserProfile`) or `preserve-cv` (Improve / Optimize paths — never silently changes structure). Every AI step is wrapped so a worker / Groq hiccup never aborts the polish; the deterministic passes still run and the user gets a finished CV. Tune CV quality here — nowhere else.
    - **Bullet hygiene helpers** (in `services/cvPurificationPipeline.ts`): `stripOrphanMetrics` catches placeholder bullets the LLM forgot to fill (e.g. `KES ,000`, `a %`, `the % retention rate`, currency-followed-by-orphan-thousands). `rewriteWeirdOpeners` swaps low-quality CF Workers AI verbs (`Re-framed`, `Re-positioned`, `Moderated`, `Advocated for`, `Discussed`, `Engaged`, `Liaised`, `Utilised`, `Leveraged`, `Spearheaded`, `Orchestrated`) for canonical pool verbs. Both are wired into `polishBullet` so every bullet that flows through purify gets them.
    - **Resilience: session-level circuit breakers**: The frontend assumes any infra dependency may be wedged. `services/groqCacheClient.ts` opens a single circuit on the first 5xx/timeout/network error and short-circuits all subsequent `lookupGroqCache`/`storeGroqCache` calls for the rest of the session. `services/cvEngineClient.ts` keeps a per-endpoint `deadEndpoints` Set covering `getJSON`, `postJSON`, `workerLLM`, and `workerTieredLLM`, so one dead worker route never costs the user repeated round-trips. Each circuit logs `Circuit opened for <endpoint> (<reason>) — skipping subsequent calls this session.` exactly once. **Pre-size routing**: in `geminiService.ts` main generation, prompts where `system + user > 90,000` chars skip the Groq attempt entirely (it would 413) and route straight to `workerLLM`, saving ~3s per generation.
    - **Vision Extract**: `cv-engine-worker` (`@cf/meta/llama-3.2-11b-vision-instruct`) is used for extracting text from images, falling back to Gemini for PDFs and other vision tasks.
    - **Word Import**: `mammoth` parses `.docx` files, and Groq extracts structured profile data.
- **PDF Generation**: All CV downloads route through a single shared service (`services/cvDownloadService.ts`) that renders the live preview DOM via headless Chrome — Playwright (local dev, port 3001) → Cloudflare `resume-pdf-worker` (production). What you see in the preview is what you get in the PDF, for all 32 templates. The legacy hand-coded jsPDF templates in `services/pdfService.ts` are no longer used for CV rendering and are queued for cleanup; cover-letter rendering and the PDF merger still use `pdfService.ts` and have not been migrated yet.
- **Storage**: A write-through triple-layer storage system utilizing `localStorage`, `IndexedDB`, and optional Google Drive sync.
- **Multi-Profile Management**: Users can create, switch, rename, color-code, and delete multiple CV profiles.
- **PWA Capabilities**: Offline capable and installable through a service worker.
- **ATS Keyword Embedding**: Critical JD tier-1 keywords are embedded as selectable-but-invisible text in generated PDFs to improve ATS parsing.
- **Self-improving vocabulary**: The `cv-engine-worker` includes features like "Leak Queue" for identifying new banned phrases, an AI Auditor for novel AI-isms, and a Voice Tester for fine-tuning voice profiles.

### System Design Choices
- **Client-Side Application**: The main application logic resides entirely on the client-side.
- **CV Engine Worker**: A Cloudflare Worker (`cv-engine-worker`) handles the deterministic aspects of CV generation, such as voice profiles, verb pools, banned phrases, and field detection. It uses Cloudflare Workers AI, D1, and KV for its operations. This worker also performs post-generation enforcement and AI auditing.
- **Authentication**: Google OAuth (PKCE flow) for Google Drive sync and other Google services. Microsoft OAuth for OneDrive integration.
- **API Key Management**: API keys are stored in the browser's `localStorage` and managed via a Settings modal.

## External Dependencies

- **AI Text Generation**:
    - **Groq API**: For CV generation, cover letters, rewriting, ATS analysis, and scoring (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`).
- **AI Vision/Multimodal & Market Research**:
    - **Google Gemini API**: For PDF/image parsing, text extraction, and Google Search grounded market research (`gemini-2.5-flash`, `gemini-2.0-flash`).
- **PDF Generation**:
    - **jsPDF**: Legacy PDF generation.
    - **html2canvas**: For capturing DOM elements as images for PDF.
    - **@react-pdf/renderer**: For generating PDF documents from React components.
    - **pdf-lib**: For advanced PDF manipulation (merge, split, sign).
    - **mammoth**: For converting Word documents (`.docx`) to HTML.
- **Sharing**:
    - **lz-string**: For URL hash encoding to create privacy-first shareable links.
- **GitHub Integration**:
    - **GitHub REST API**: For PAT-based CV backup and importing project data.
- **Email Services**:
    - **Brevo (Sendinblue) REST API**: For direct email sending.
- **Job Search**:
    - **Tavily Search API**: For real-time job listings and detailed job descriptions.
    - **JSearch (RapidAPI)**: Complementary job search service.
- **Cloud Storage/Sync**:
    - **Google Drive (via Google OAuth)**: For optional cloud backup.
    - **Microsoft Graph API**: For OneDrive integration (Word file access).
- **Analytics**:
    - **@vercel/analytics/react**: For tracking page views when deployed on Vercel.
- **Cloudflare Services (for `cv-engine-worker`)**:
    - **Cloudflare Workers AI**: For semantic keyword matching, LLM-based validation/humanization, and vision extraction (`@cf/baai/bge-large-en-v1.5`, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/meta/llama-3.2-11b-vision-instruct`).
    - **Cloudflare D1**: SQLite database for deterministic CV engine data.
    - **Cloudflare KV**: Key-Value store for hot lookups in the worker.