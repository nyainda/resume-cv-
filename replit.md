# AI-Powered CV Builder

A full-featured React + Vite PWA for building, managing, and downloading professional CVs with AI assistance.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6
- **Styling**: Tailwind CSS (CDN), custom CSS variables for theming
- **AI — Text Generation**: Groq API (OpenAI-compatible, direct fetch)
  - `llama-3.3-70b-versatile` → CV generation, cover letters, rewriting, essays
  - `llama-3.1-8b-instant` → Fast ATS analysis, keyword extraction, CV scoring
- **AI — Vision/Multimodal**: Google Gemini 2.5 Flash via `@google/genai`
  - PDF upload, image parsing (file text extraction only)
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
  CVGenerator.tsx       — Main CV generation UI with Share/AI Coach/GitHub buttons
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
  geminiService.ts      — Routes text tasks to Groq; keeps Gemini only for PDF/image vision
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
- **AI CV Generation** — Tailored CVs using Gemini with honest/boosted/aggressive modes
- **25+ Templates** — All categories (professional, modern, creative, academic, technical)
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

## Environment

- Port: **5000** (Replit webview requirement)
- All API keys stored in browser localStorage under `cv_builder:apiSettings`
- No server-side backend — everything runs client-side

## API Keys (all stored in Settings modal)

### Multi-Model AI Architecture
- **Groq API key** (primary — required for all text AI features)
  - Free tier with very generous limits: https://console.groq.com/keys
  - Powers: CV generation, cover letters, rewriting, scholarship essays, ATS analysis, CV scoring
  - `llama-3.3-70b-versatile` for quality tasks; `llama-3.1-8b-instant` for fast keyword/scoring tasks
  - Stored in `apiSettings.groqApiKey`
- **Gemini API key** (optional — only for file/image uploads)
  - https://aistudio.google.com/app/apikey
  - Powers: PDF upload → text extraction, image parsing
  - Stored in `apiSettings.apiKey`
- Tavily API key — For job board search (optional)
- Brevo API key — For direct email sending (optional, falls back to mailto)
- Microsoft Azure Client ID — For Microsoft/OneDrive integration (optional, user registers Azure app)

### `apiKeySet` flag
Checks `!!apiSettings?.groqApiKey` — gates all AI generation buttons (Generate CV, Cover Letter, etc.).
