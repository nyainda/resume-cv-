# AI-Powered CV Builder

A full-featured React + Vite PWA for building, managing, and downloading professional CVs with AI assistance.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6
- **Styling**: Tailwind CSS (CDN), custom CSS variables for theming
- **AI**: Google Gemini via `@google/genai`
- **PDF Generation**: jsPDF (CDN) + html2canvas (CDN) — WYSIWYG screenshot-based
- **Email**: Brevo (Sendinblue) REST API (direct browser calls)
- **Job Search**: Tavily Search API
- **Storage**: localStorage + IndexedDB (via custom StorageRouter), optional Google Drive sync
- **Auth**: Google OAuth (PKCE flow via custom GoogleAuthContext)

## Project Structure

```
App.tsx              — Root component, multi-profile state, settings, routing
index.tsx            — Entry point, boot-time IDB restore, service worker
index.html           — PWA manifest, CDN scripts (Tailwind, jsPDF, html2canvas)
types.ts             — All shared TypeScript types

components/
  CVGenerator.tsx    — Main CV generation UI (WYSIWYG html2canvas PDF download)
  CVPreview.tsx      — Renders selected template (React components)
  ProfileManager.tsx — Multi-profile switcher with add/edit/delete
  SettingsModal.tsx  — API keys (Gemini, Tavily, Brevo) + Google Drive sync
  EmailApply.tsx     — Email application wizard (Brevo or mailto fallback)
  templates/         — 25+ named CV template components
  ...

services/
  geminiService.ts   — All Gemini AI calls (CV generation, cover letters, etc.)
  pdfService.ts      — Legacy programmatic jsPDF (kept but superseded by html2canvas)
  brevoService.ts    — Brevo email sending
  tavilyService.ts   — Job board search + full JD fetch
  storage/           — LocalStorage + IndexedDB + Google Drive storage layer

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

## Environment

- Port: **5000** (Replit webview requirement)
- All API keys stored in browser localStorage under `cv_builder:apiSettings`
- No server-side backend — everything runs client-side

## API Keys (all stored in Settings modal)

- `GEMINI_API_KEY` — Google AI Studio (required for all AI features)
- Tavily API key — For job board search (optional)
- Brevo API key — For direct email sending (optional, falls back to mailto)
