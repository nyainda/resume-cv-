/**
 * Template Analyzer Service
 *
 * Respects the provider selected in Settings → AI Provider.
 * Whichever provider the user has chosen powers the entire pipeline —
 * no silent fallback to a second provider they haven't subscribed to.
 *
 *   Phase 1 — Vision Analysis (reads the uploaded image):
 *     • Workers AI  → Cloudflare Llama 3.2 Vision (free, no key needed)
 *     • Gemini      → Gemini 2.0 Flash Vision
 *     • Claude      → Claude multimodal via CF Worker proxy
 *
 *   Phase 2 — Spec Refinement (cleans up the JSON):
 *     • Workers AI  → Cloudflare tiered LLM
 *     • Gemini      → Gemini 2.0 Flash text
 *     • Claude      → Claude via CF Worker proxy
 *
 * If the selected provider is not configured (missing key / worker URL),
 * a clear error is thrown — the user is directed to Settings to fix it.
 */

import { GoogleGenAI } from '@google/genai';
import { getGeminiKey, getClaudeKey } from './security/RuntimeKeys';
import {
  getSelectedProvider,
  callProviderViaProxy,
  callProviderViaProxyMultimodal,
} from './groqService';
import { workerVisionExtract, workerTieredLLM, isCVEngineConfigured } from './cvEngineClient';
import type {
  TemplateSpec,
  TemplateColorScheme,
  TemplateTypography,
  TemplateLayout,
  TemplateDecorativeElements,
} from '../types';

export type {
  TemplateSpec,
  TemplateColorScheme,
  TemplateTypography,
  TemplateLayout,
  TemplateDecorativeElements,
};

// ── Prompts ───────────────────────────────────────────────────────────────────

const VISION_ANALYSIS_PROMPT = `Analyze this CV template image thoroughly. Extract and return a JSON specification covering every visual and structural detail needed to reproduce it as a React component. Return ONLY raw JSON, no markdown fences, no commentary, no explanation.

{
  "layout": {
    "columns": "single | two-column | sidebar-left | sidebar-right",
    "sidebarWidthPercent": number_or_null,
    "pageMargins": "tight | normal | generous",
    "contentDensity": "compact | balanced | spacious"
  },
  "colorScheme": {
    "primary": "hex — dominant brand/accent color",
    "secondary": "hex — secondary accent if present, else same as primary",
    "background": "hex — page background",
    "sidebarBackground": "hex or null",
    "textPrimary": "hex — main body text",
    "textSecondary": "hex — secondary/muted text",
    "headingColor": "hex — section headings",
    "dividerColor": "hex or null",
    "headerBarColor": "hex or null"
  },
  "typography": {
    "nameStyle": "large | extra-large | bold | uppercase | normal",
    "nameFontWeight": "400 | 600 | 700 | 800 | 900",
    "titleStyle": "describe style of subtitle under name",
    "sectionHeadingStyle": "uppercase | capitalized | normal",
    "sectionHeadingDecoration": "underline | border-bottom | background | dot | none",
    "bodyTextSize": "small | normal | large",
    "bulletStyle": "dot | dash | square | none | custom",
    "fontFamily": "serif | sans-serif | monospace — best match"
  },
  "sectionOrder": ["list: summary | experience | education | skills | projects | languages | contact — in order they appear"],
  "decorativeElements": {
    "hasPhoto": true_or_false,
    "photoShape": "circle | square | rounded | none",
    "hasHeaderBar": true_or_false,
    "hasVerticalDivider": true_or_false,
    "hasSectionIcons": true_or_false,
    "hasProgressBars": true_or_false,
    "hasTimeline": true_or_false,
    "otherDecorations": "describe any notable visual elements not covered above"
  },
  "contactInfoStyle": "inline-row | stacked | sidebar | icons-only",
  "skillsStyle": "tags | list | progress-bars | two-column | inline",
  "experienceBulletIndent": "none | small | standard",
  "overallStyle": "modern-minimal | classic-professional | creative-bold | sidebar-accent | executive | academic",
  "reproductionNotes": "critical details for accurate reproduction"
}`;

const SPEC_REFINEMENT_PROMPT = (rawSpec: string) => `You are a CV template configuration expert. Review this extracted template specification and ensure all values are valid, consistent, and complete. Fix any obvious errors (e.g. invalid hex colors, missing fields). Return ONLY the corrected JSON, no markdown, no commentary.

RAW SPEC:
${rawSpec}

Rules:
- Hex colors must be valid 6-digit hex (e.g. #1B2B4B). Default to #1B2B4B if invalid.
- sectionOrder must only contain: summary, experience, education, skills, projects, languages, contact
- All enum fields must match the listed options exactly
- If sidebarWidthPercent is null but columns is sidebar-*, default to 30
- fontFamily must be one of: serif, sans-serif, monospace
Return only the JSON object.`;

// ── JSON strip helper ─────────────────────────────────────────────────────────

function stripJsonFences(text: string): string {
  return text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

// Canonical section keys the renderer understands.
const CANONICAL_SECTIONS = ['summary', 'experience', 'education', 'skills', 'projects', 'languages', 'contact'] as const;
type CanonicalSection = typeof CANONICAL_SECTIONS[number];

// Maps common AI-generated variants → canonical key.
const SECTION_ALIASES: Record<string, CanonicalSection> = {
  // experience
  'work experience': 'experience', 'professional experience': 'experience',
  'work history': 'experience', 'employment': 'experience',
  'employment history': 'experience', 'career history': 'experience',
  'experience section': 'experience',
  // education
  'academic background': 'education', 'academic history': 'education',
  'qualifications': 'education', 'academic qualifications': 'education',
  'educational background': 'education',
  // skills
  'technical skills': 'skills', 'core skills': 'skills',
  'key skills': 'skills', 'competencies': 'skills',
  'expertise': 'skills', 'skill set': 'skills', 'skillset': 'skills',
  'abilities': 'skills',
  // summary
  'profile': 'summary', 'objective': 'summary', 'about': 'summary',
  'about me': 'summary', 'professional summary': 'summary',
  'career objective': 'summary', 'personal statement': 'summary',
  'executive summary': 'summary',
  // projects
  'personal projects': 'projects', 'key projects': 'projects',
  'selected projects': 'projects', 'portfolio': 'projects',
  // languages
  'language': 'languages', 'spoken languages': 'languages',
  // contact
  'contact information': 'contact', 'contact details': 'contact',
  'personal information': 'contact', 'personal details': 'contact',
  'contact info': 'contact',
};

export function normalizeSectionKey(key: string): CanonicalSection | null {
  const lower = key.toLowerCase().trim();
  if (CANONICAL_SECTIONS.includes(lower as CanonicalSection)) return lower as CanonicalSection;
  return SECTION_ALIASES[lower] ?? null;
}

function normalizeSectionOrder(order: string[]): CanonicalSection[] {
  const seen = new Set<CanonicalSection>();
  const result: CanonicalSection[] = [];
  for (const key of order) {
    const canonical = normalizeSectionKey(key);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }
  // Always guarantee at least experience + education if they were empty
  if (result.length === 0) return ['summary', 'experience', 'education', 'skills'];
  return result;
}

function parseSpec(raw: string): TemplateSpec {
  const cleaned = stripJsonFences(raw);
  if (!cleaned) throw new Error('AI returned an empty response. Please try again.');
  const spec = JSON.parse(cleaned) as TemplateSpec;
  if (!Array.isArray(spec.sectionOrder) || spec.sectionOrder.length === 0) {
    throw new Error('This image does not appear to be a CV template. Please upload a CV/resume screenshot.');
  }
  // Normalize section keys so the renderer always gets canonical values.
  spec.sectionOrder = normalizeSectionOrder(spec.sectionOrder);
  return spec;
}

// ── Phase 1 — Vision Analysis ─────────────────────────────────────────────────

export async function analyzeTemplateImage(
  base64Image: string,
  mimeType: string
): Promise<TemplateSpec> {
  const provider = getSelectedProvider();

  // ── Workers AI ──────────────────────────────────────────────────────────────
  if (provider === 'workers-ai') {
    if (!isCVEngineConfigured()) {
      throw new Error(
        'CV Engine Worker URL is not configured.\n' +
        'Go to Settings → CV Engine and enter your Worker URL, or switch to Gemini / Claude in Settings → AI Provider.'
      );
    }
    const text = await workerVisionExtract(base64Image, mimeType, VISION_ANALYSIS_PROMPT, { maxTokens: 2048, timeoutMs: 30_000 });
    if (!text) throw new Error('Workers AI vision returned no response. Please try again.');
    console.log('[TemplateAnalyzer] Phase 1 via Worker AI Llama Vision ✓');
    return parseSpec(text);
  }

  // ── Gemini ──────────────────────────────────────────────────────────────────
  if (provider === 'gemini') {
    const key = getGeminiKey();
    if (!key) {
      throw new Error(
        'No Gemini API key found.\n' +
        'Go to Settings → AI Keys → Gemini and enter your Google API key.'
      );
    }
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: VISION_ANALYSIS_PROMPT },
        ],
      },
    } as Parameters<typeof ai.models.generateContent>[0]);

    const raw = (response as unknown as { text?: string }).text ?? '';
    console.log('[TemplateAnalyzer] Phase 1 via Gemini Vision ✓');
    return parseSpec(raw);
  }

  // ── Claude ──────────────────────────────────────────────────────────────────
  if (provider === 'claude') {
    const key = getClaudeKey();
    if (!key) {
      throw new Error(
        'No Claude API key found.\n' +
        'Go to Settings → AI Keys → Claude and enter your Anthropic API key.'
      );
    }
    const text = await callProviderViaProxyMultimodal(key, base64Image, mimeType, VISION_ANALYSIS_PROMPT, { maxTokens: 2048 });
    console.log('[TemplateAnalyzer] Phase 1 via Claude Vision ✓');
    return parseSpec(text);
  }

  throw new Error('Unknown AI provider selected. Please check Settings → AI Provider.');
}

// ── Phase 2 — Spec Refinement ─────────────────────────────────────────────────

export async function refineTemplateSpec(rawSpec: TemplateSpec): Promise<TemplateSpec> {
  const provider = getSelectedProvider();
  const prompt   = SPEC_REFINEMENT_PROMPT(JSON.stringify(rawSpec, null, 2));
  const sysPrompt = 'You are a JSON validator and corrector. Return only valid JSON.';

  // ── Workers AI ──────────────────────────────────────────────────────────────
  if (provider === 'workers-ai') {
    if (!isCVEngineConfigured()) return rawSpec; // worker not set — skip refinement silently
    try {
      const result = await workerTieredLLM('cvAudit', sysPrompt, prompt, { temperature: 0.1, maxTokens: 2048 });
      if (result) {
        try {
          console.log('[TemplateAnalyzer] Phase 2 via Worker AI ✓');
          return JSON.parse(stripJsonFences(result)) as TemplateSpec;
        } catch { /* fall through to raw */ }
      }
    } catch (err) {
      console.warn('[TemplateAnalyzer] Worker AI refinement failed, using raw spec:', err);
    }
    return rawSpec;
  }

  // ── Gemini ──────────────────────────────────────────────────────────────────
  if (provider === 'gemini') {
    const key = getGeminiKey();
    if (!key) return rawSpec;
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: { temperature: 0.1, maxOutputTokens: 2048 },
      } as Parameters<typeof ai.models.generateContent>[0]);

      const raw = (response as unknown as { text?: string }).text ?? '';
      if (raw) {
        try {
          console.log('[TemplateAnalyzer] Phase 2 via Gemini ✓');
          return JSON.parse(stripJsonFences(raw)) as TemplateSpec;
        } catch { /* fall through to raw */ }
      }
    } catch (err) {
      console.warn('[TemplateAnalyzer] Gemini refinement failed, using raw spec:', err);
    }
    return rawSpec;
  }

  // ── Claude ──────────────────────────────────────────────────────────────────
  if (provider === 'claude') {
    const key = getClaudeKey();
    if (!key) return rawSpec;
    try {
      const result = await callProviderViaProxy('claude', key, sysPrompt, prompt, { temperature: 0.1, maxTokens: 2048 });
      if (result) {
        try {
          console.log('[TemplateAnalyzer] Phase 2 via Claude ✓');
          return JSON.parse(stripJsonFences(result)) as TemplateSpec;
        } catch { /* fall through to raw */ }
      }
    } catch (err) {
      console.warn('[TemplateAnalyzer] Claude refinement failed, using raw spec:', err);
    }
    return rawSpec;
  }

  return rawSpec;
}

// ── Full pipeline ─────────────────────────────────────────────────────────────

export interface AnalysisResult {
  spec: TemplateSpec;
  templateName: string;
}

export async function analyzeAndGenerateTemplate(
  base64Image: string,
  mimeType: string,
  templateName: string,
  onProgress?: (phase: 'analyzing' | 'refining' | 'done') => void
): Promise<AnalysisResult> {
  onProgress?.('analyzing');
  const rawSpec = await analyzeTemplateImage(base64Image, mimeType);

  onProgress?.('refining');
  const spec = await refineTemplateSpec(rawSpec);

  onProgress?.('done');
  return { spec, templateName };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getDefaultSpec(): TemplateSpec {
  return {
    layout: { columns: 'single', sidebarWidthPercent: null, pageMargins: 'normal', contentDensity: 'balanced' },
    colorScheme: {
      primary: '#1B2B4B', secondary: '#C9A84C', background: '#FFFFFF',
      sidebarBackground: null, textPrimary: '#1e293b', textSecondary: '#64748b',
      headingColor: '#1B2B4B', dividerColor: '#e2e8f0', headerBarColor: null,
    },
    typography: {
      nameStyle: 'bold', nameFontWeight: '700', titleStyle: 'subtitle below name',
      sectionHeadingStyle: 'uppercase', sectionHeadingDecoration: 'border-bottom',
      bodyTextSize: 'normal', bulletStyle: 'dot', fontFamily: 'sans-serif',
    },
    sectionOrder: ['summary', 'experience', 'education', 'skills', 'projects', 'languages'],
    decorativeElements: {
      hasPhoto: false, photoShape: 'none', hasHeaderBar: false,
      hasVerticalDivider: false, hasSectionIcons: false,
      hasProgressBars: false, hasTimeline: false, otherDecorations: '',
    },
    contactInfoStyle: 'inline-row',
    skillsStyle: 'tags',
    experienceBulletIndent: 'small',
    overallStyle: 'classic-professional',
    reproductionNotes: '',
  };
}
