/**
 * Template Analyzer Service
 *
 * Two-phase pipeline:
 *   Phase 1 — Vision Analysis: Gemini 2.0 Flash analyses an uploaded CV template
 *             image and extracts a structural/visual specification JSON.
 *   Phase 2 — Component Spec: Gemini refines the spec into a render-ready
 *             configuration that drives TemplateCustomGenerated.tsx directly
 *             (no eval, no arbitrary code execution).
 */

import { GoogleGenAI } from '@google/genai';
import { getGeminiKey } from './security/RuntimeKeys';
import { groqChat, GROQ_LARGE } from './groqService';
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

// ── Phase 1 — Vision Analysis ─────────────────────────────────────────────────

export async function analyzeTemplateImage(
  base64Image: string,
  mimeType: string
): Promise<TemplateSpec> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error('Gemini API key required for template analysis. Add it in Settings.');

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: VISION_ANALYSIS_PROMPT },
      ],
    },
  } as Parameters<typeof ai.models.generateContent>[0]);

  const raw = ((response as unknown as { text?: string }).text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  if (!raw) throw new Error('Gemini returned empty response during vision analysis.');

  let spec: TemplateSpec;
  try {
    spec = JSON.parse(raw) as TemplateSpec;
  } catch {
    throw new Error('Could not parse template spec from Gemini response. Please try a clearer image.');
  }

  // Validate sectionOrder has at least some entries
  if (!Array.isArray(spec.sectionOrder) || spec.sectionOrder.length === 0) {
    throw new Error('This image does not appear to be a CV template. Please upload a CV/resume screenshot.');
  }

  return spec;
}

// ── Phase 2 — Spec Refinement ─────────────────────────────────────────────────

export async function refineTemplateSpec(rawSpec: TemplateSpec): Promise<TemplateSpec> {
  const prompt = SPEC_REFINEMENT_PROMPT(JSON.stringify(rawSpec, null, 2));

  // Try Gemini first (free tier, fast)
  const apiKey = getGeminiKey();
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: { temperature: 0.1, maxOutputTokens: 2048 },
      } as Parameters<typeof ai.models.generateContent>[0]);

      const raw = ((response as unknown as { text?: string }).text ?? '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

      if (raw) {
        try {
          return JSON.parse(raw) as TemplateSpec;
        } catch { /* fall through to Groq */ }
      }
    } catch (err) {
      console.warn('[TemplateAnalyzer] Gemini refinement failed, using raw spec:', err);
    }
  }

  // Fall back to Groq
  try {
    const result = await groqChat(
      GROQ_LARGE,
      'You are a JSON validator and corrector. Return only valid JSON.',
      prompt,
      { temperature: 0.1, maxTokens: 2048 }
    );
    if (result) {
      const clean = result.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      return JSON.parse(clean) as TemplateSpec;
    }
  } catch (err) {
    console.warn('[TemplateAnalyzer] Groq refinement also failed, using raw spec:', err);
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
