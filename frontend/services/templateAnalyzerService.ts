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

const VISION_ANALYSIS_PROMPT = `You are a precise CV template reverse-engineer. Your task: analyze this image and extract every visual and structural detail needed to reproduce it as a React component.

STEP 1 — VALIDATION: Confirm this is a CV/resume. It must contain at least two of: a name/header area, work experience section, education section, skills section, or contact information. If the image is NOT a CV/resume (e.g. poster, flyer, certificate, business card, infographic, presentation slide, or any non-resume document), return ONLY this exact JSON and nothing else:
{"error":"NOT_A_CV","reason":"<one sentence explaining what the image actually is>"}

STEP 2 — ANALYSIS: If it IS a CV, return ONLY raw JSON matching this schema exactly. No markdown fences, no explanation, no commentary — just the JSON object.

{
  "layout": {
    "columns": "<single | two-column | sidebar-left | sidebar-right>",
    "sidebarWidthPercent": <number 20-45 if sidebar present, else null>,
    "pageMargins": "<tight=under 15mm | normal=15-25mm | generous=over 25mm>",
    "contentDensity": "<compact | balanced | spacious>",
    "sidebarSections": ["<exact section keys that appear INSIDE the sidebar column — e.g. contact, skills, education, languages, certifications>"] 
  },
  "colorScheme": {
    "primary": "<most dominant brand/accent hex color — used for headings, accents, sidebar>",
    "secondary": "<secondary accent hex, or same as primary if only one accent>",
    "background": "<main page/content area background hex>",
    "sidebarBackground": "<sidebar background hex, or null if no sidebar>",
    "textPrimary": "<main body text hex>",
    "textSecondary": "<muted/date/subtitle text hex>",
    "headingColor": "<section heading text hex>",
    "dividerColor": "<horizontal rule/border line hex, or null>",
    "headerBarColor": "<full-width colored bar behind the name/header, or null>",
    "sectionHeadingBgColor": "<background fill color of the shaded bar behind section headings — ONLY if sectionHeadingDecoration is background, else null>"
  },
  "typography": {
    "nameStyle": "<large=22-26px | extra-large=28px+ | bold=heavy weight | uppercase=all-caps | normal>",
    "nameFontWeight": "<400 | 600 | 700 | 800 | 900>",
    "titleStyle": "<describe the professional title line: e.g. 'small-caps subtitle', 'italic below name', 'spaced uppercase'>",
    "sectionHeadingStyle": "<uppercase | capitalized | normal>",
    "sectionHeadingFontStyle": "<italic | normal>",
    "sectionHeadingDecoration": "<underline=text underline | border-bottom=full-width line under heading | background=shaded bar fills behind heading text | dot=colored dot before heading | none>",
    "bodyTextSize": "<small=under 9pt | normal=9-10pt | large=11pt+>",
    "bulletStyle": "<dot=• | dash=– | square=▪ | none>",
    "fontFamily": "<serif | sans-serif | monospace>"
  },
  "sectionOrder": ["<list ONLY keys from this set in the ORDER they appear in the template: summary, experience, education, skills, projects, certifications, achievements, awards, languages, contact, additional-info>"],
  "decorativeElements": {
    "hasPhoto": <true if a photo placeholder/circle/avatar is present>,
    "photoShape": "<circle | square | rounded | none>",
    "hasHeaderBar": <true if there is a solid colored band spanning full width behind the name>,
    "hasVerticalDivider": <true if there is a vertical line between sidebar and main column>,
    "hasSectionIcons": <true if small icons or symbols appear next to section heading labels>,
    "sectionIconStyle": "<square-filled=solid colored square | circle-filled=solid colored circle | outline=stroked icon | none>",
    "hasProgressBars": <true if horizontal progress/skill bars are present>,
    "hasTimeline": <true if experience items have a vertical timeline connector>,
    "otherDecorations": "<describe any notable visual element not covered — e.g. 'gold double-rule under name', 'monogram initial in sidebar', 'colored left border on experience items'>"
  },
  "contactInfoStyle": "<inline-row=all on one line | stacked=one per line | sidebar=contact in sidebar column | icons-only=just icons no labels>",
  "skillsStyle": "<tags=pill/badge chips | list=bullet list | progress-bars=bar per skill | two-column=2 equal columns | three-column=3 equal columns | inline=comma/dot separated>",
  "sectionIcons": {
    "<section-key>": "<icon name for sections that have a visible icon — use exactly: briefcase | graduation | gear | folder | trophy | globe | envelope | wrench | badge | star | document | none>"
  },
  "experienceBulletIndent": "<none | small | standard>",
  "overallStyle": "<modern-minimal | classic-professional | creative-bold | sidebar-accent | executive | academic>",
  "reproductionNotes": "<3-5 sentences describing the most critical visual details: header layout, section heading treatment, any spacing/border/icon details essential to reproduction>"
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
const CANONICAL_SECTIONS = [
  'summary', 'experience', 'education', 'skills', 'projects',
  'languages', 'contact', 'certifications', 'achievements', 'awards', 'additional-info',
] as const;
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
  'abilities': 'skills', 'technical competencies': 'skills',
  // summary
  'profile': 'summary', 'objective': 'summary', 'about': 'summary',
  'about me': 'summary', 'professional summary': 'summary',
  'career objective': 'summary', 'personal statement': 'summary',
  'executive summary': 'summary', 'career summary': 'summary',
  // projects
  'personal projects': 'projects', 'key projects': 'projects',
  'selected projects': 'projects', 'portfolio': 'projects',
  'featured projects': 'projects', 'notable projects': 'projects',
  // languages
  'language': 'languages', 'spoken languages': 'languages',
  'language skills': 'languages',
  // contact
  'contact information': 'contact', 'contact details': 'contact',
  'personal information': 'contact', 'personal details': 'contact',
  'contact info': 'contact',
  // certifications
  'certifications': 'certifications', 'certificates': 'certifications',
  'credentials': 'certifications', 'professional certifications': 'certifications',
  'licenses': 'certifications', 'licences': 'certifications',
  'professional development': 'certifications', 'training': 'certifications',
  // achievements
  'achievements': 'achievements', 'accomplishments': 'achievements',
  'key achievements': 'achievements', 'notable achievements': 'achievements',
  'highlights': 'achievements', 'career highlights': 'achievements',
  // awards
  'awards': 'awards', 'honors': 'awards', 'honours': 'awards',
  'awards & honors': 'awards', 'recognition': 'awards',
  // additional-info
  'additional information': 'additional-info', 'additional info': 'additional-info',
  'other information': 'additional-info', 'miscellaneous': 'additional-info',
  'interests': 'additional-info', 'hobbies': 'additional-info',
  'personal interests': 'additional-info', 'activities': 'additional-info',
  'extracurricular activities': 'additional-info', 'volunteer work': 'additional-info',
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
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  // Handle NOT_A_CV rejection signal from the AI
  if (parsed.error === 'NOT_A_CV') {
    const reason = typeof parsed.reason === 'string' ? parsed.reason : 'Not a CV template.';
    throw new Error(`Image rejected: ${reason}\n\nPlease upload a CV or resume screenshot.`);
  }

  const spec = parsed as unknown as TemplateSpec;
  if (!Array.isArray(spec.sectionOrder) || spec.sectionOrder.length === 0) {
    throw new Error('This image does not appear to be a CV template. Please upload a CV/resume screenshot.');
  }

  // Normalize section keys so the renderer always gets canonical values.
  spec.sectionOrder = normalizeSectionOrder(spec.sectionOrder);

  // Also normalize sidebarSections if present
  if (Array.isArray(spec.layout?.sidebarSections)) {
    spec.layout.sidebarSections = normalizeSectionOrder(spec.layout.sidebarSections as string[]);
  }

  // Normalize sectionIcons keys
  if (spec.sectionIcons && typeof spec.sectionIcons === 'object') {
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(spec.sectionIcons)) {
      const canonical = normalizeSectionKey(k) ?? k;
      normalized[canonical] = String(v);
    }
    spec.sectionIcons = normalized;
  }

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
      const result = await workerTieredLLM('cvAudit', prompt, { temperature: 0.1, maxTokens: 2048, system: sysPrompt });
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
    layout: { columns: 'single', sidebarWidthPercent: null, pageMargins: 'normal', contentDensity: 'balanced', sidebarSections: null },
    colorScheme: {
      primary: '#1B2B4B', secondary: '#C9A84C', background: '#FFFFFF',
      sidebarBackground: null, textPrimary: '#1e293b', textSecondary: '#64748b',
      headingColor: '#1B2B4B', dividerColor: '#e2e8f0', headerBarColor: null,
      sectionHeadingBgColor: null,
    },
    typography: {
      nameStyle: 'bold', nameFontWeight: '700', titleStyle: 'subtitle below name',
      sectionHeadingStyle: 'uppercase', sectionHeadingDecoration: 'border-bottom',
      sectionHeadingFontStyle: 'normal',
      bodyTextSize: 'normal', bulletStyle: 'dot', fontFamily: 'sans-serif',
    },
    sectionOrder: ['summary', 'experience', 'education', 'skills', 'projects', 'languages'],
    decorativeElements: {
      hasPhoto: false, photoShape: 'none', hasHeaderBar: false,
      hasVerticalDivider: false, hasSectionIcons: false, sectionIconStyle: 'none',
      hasProgressBars: false, hasTimeline: false, otherDecorations: '',
    },
    contactInfoStyle: 'inline-row',
    skillsStyle: 'tags',
    sectionIcons: {},
    experienceBulletIndent: 'small',
    overallStyle: 'classic-professional',
    reproductionNotes: '',
  };
}
