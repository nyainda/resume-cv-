/**
 * Template Analyzer Service
 *
 * Two-phase pipeline:
 *   Phase 1 — Vision Analysis:
 *     (a) Worker AI Llama 3.2 Vision (free, via /api/cv/vision-extract) — tried first
 *     (b) Gemini 2.0 Flash Vision (if Gemini key is set in Settings)
 *     (c) Throws a clear error if neither is configured
 *   Phase 2 — Spec Refinement:
 *     (a) Gemini 2.0 Flash (text, if key set)
 *     (b) Claude via proxy (if Claude key set)
 *     (c) Groq / Worker AI (groqChat auto-fallback chain)
 *     (d) Returns raw spec unchanged if all fail
 */

import { GoogleGenAI } from '@google/genai';
import { getGeminiKey, getClaudeKey } from './security/RuntimeKeys';
import { groqChat, GROQ_LARGE, callProviderViaProxy } from './groqService';
import { workerVisionExtract, isCVEngineConfigured } from './cvEngineClient';
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

// ── Phase 1 — Vision Analysis ─────────────────────────────────────────────────

export async function analyzeTemplateImage(
  base64Image: string,
  mimeType: string
): Promise<TemplateSpec> {

  // ── Attempt 1: Worker AI Llama Vision (free, no user key needed) ──────────
  if (isCVEngineConfigured()) {
    try {
      const workerText = await workerVisionExtract(base64Image, mimeType, VISION_ANALYSIS_PROMPT, { maxTokens: 2048, timeoutMs: 30_000 });
      if (workerText) {
        const raw = stripJsonFences(workerText);
        const spec = JSON.parse(raw) as TemplateSpec;
        if (Array.isArray(spec.sectionOrder) && spec.sectionOrder.length > 0) {
          console.log('[TemplateAnalyzer] Phase 1 via Worker AI Llama Vision ✓');
          return spec;
        }
      }
    } catch (err) {
      console.warn('[TemplateAnalyzer] Worker AI vision failed, trying Gemini:', err);
    }
  }

  // ── Attempt 2: Gemini 2.0 Flash Vision ───────────────────────────────────
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: VISION_ANALYSIS_PROMPT },
        ],
      },
    } as Parameters<typeof ai.models.generateContent>[0]);

    const raw = stripJsonFences(
      ((response as unknown as { text?: string }).text ?? '')
    );

    if (!raw) throw new Error('Gemini returned empty response during vision analysis.');

    let spec: TemplateSpec;
    try {
      spec = JSON.parse(raw) as TemplateSpec;
    } catch {
      throw new Error('Could not parse template spec from Gemini response. Please try a clearer image.');
    }

    if (!Array.isArray(spec.sectionOrder) || spec.sectionOrder.length === 0) {
      throw new Error('This image does not appear to be a CV template. Please upload a CV/resume screenshot.');
    }

    console.log('[TemplateAnalyzer] Phase 1 via Gemini Vision ✓');
    return spec;
  }

  // ── No provider available ─────────────────────────────────────────────────
  throw new Error(
    'No AI vision provider available. Please either:\n' +
    '• Add a Gemini API key in Settings → AI Keys → Gemini\n' +
    '• Or ensure your CV Engine Worker URL is set in Settings'
  );
}

// ── Phase 2 — Spec Refinement ─────────────────────────────────────────────────

export async function refineTemplateSpec(rawSpec: TemplateSpec): Promise<TemplateSpec> {
  const prompt = SPEC_REFINEMENT_PROMPT(JSON.stringify(rawSpec, null, 2));

  // ── Attempt 1: Gemini 2.0 Flash (text) ──────────────────────────────────
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: { temperature: 0.1, maxOutputTokens: 2048 },
      } as Parameters<typeof ai.models.generateContent>[0]);

      const raw = stripJsonFences(
        ((response as unknown as { text?: string }).text ?? '')
      );

      if (raw) {
        try {
          console.log('[TemplateAnalyzer] Phase 2 via Gemini ✓');
          return JSON.parse(raw) as TemplateSpec;
        } catch { /* fall through */ }
      }
    } catch (err) {
      console.warn('[TemplateAnalyzer] Gemini refinement failed:', err);
    }
  }

  // ── Attempt 2: Claude via proxy ───────────────────────────────────────────
  const claudeKey = getClaudeKey();
  if (claudeKey) {
    try {
      const result = await callProviderViaProxy(
        'claude',
        claudeKey,
        'You are a JSON validator and corrector. Return only valid JSON.',
        prompt,
        { temperature: 0.1, maxTokens: 2048 }
      );
      if (result) {
        const clean = stripJsonFences(result);
        try {
          console.log('[TemplateAnalyzer] Phase 2 via Claude ✓');
          return JSON.parse(clean) as TemplateSpec;
        } catch { /* fall through */ }
      }
    } catch (err) {
      console.warn('[TemplateAnalyzer] Claude refinement failed:', err);
    }
  }

  // ── Attempt 3: Groq / Worker AI (groqChat auto-chain) ────────────────────
  try {
    const result = await groqChat(
      GROQ_LARGE,
      'You are a JSON validator and corrector. Return only valid JSON.',
      prompt,
      { temperature: 0.1, maxTokens: 2048 }
    );
    if (result) {
      const clean = stripJsonFences(result);
      try {
        console.log('[TemplateAnalyzer] Phase 2 via Groq/Worker ✓');
        return JSON.parse(clean) as TemplateSpec;
      } catch { /* fall through */ }
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
