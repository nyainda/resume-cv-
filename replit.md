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
    - **Vision Extract**: `cv-engine-worker` (`@cf/meta/llama-3.2-11b-vision-instruct`) is used for extracting text from images, falling back to Gemini for PDFs and other vision tasks.
    - **Word Import**: `mammoth` parses `.docx` files, and Groq extracts structured profile data.
- **PDF Generation**: `@react-pdf/renderer` for professional templates, with `jsPDF` and `html2canvas` as legacy options. Pixel-perfect HD PDF export is handled by a Playwright PDF server.
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