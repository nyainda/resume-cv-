/**
 * Template completeness guard — prevents the "silent fallback" bug where a
 * TemplateName is registered in types.ts / TemplateGallery.tsx but has no
 * render path in CVPreview.tsx, silently showing TemplateProfessional instead.
 *
 * Run: npm run test:unit
 */
import { describe, it, expect } from 'vitest';
import { templateDisplayNames } from '../../types';
import { V2_TEMPLATE_IDS } from '../templates/engine/templateThemes';

// ── All template IDs we claim to support ─────────────────────────────────────
// Excludes 'custom' which is a special UI-only sentinel, not a real template.
const ALL_TEMPLATE_NAMES = Object.keys(templateDisplayNames).filter(
  id => id !== 'custom',
);

// ── Legacy templates wired into CVPreview.tsx switch statement ────────────────
// Keep this list in sync with the switch cases in CVPreview.tsx.
// The test will fail if a case is added to types.ts but not here (or vice versa).
const LEGACY_SWITCH_CASES = new Set([
  'professional', 'minimalist', 'creative', 'timeline', 'infographic',
  'harvard-gold', 'tokyo-night', 'paris-vibe', 'london-finance', 'berlin-design',
  'medical-standard', 'swe-elite', 'ats-clean-pro', 'swe-neon', 'swe-clean',
]);

// ── V2 engine IDs ─────────────────────────────────────────────────────────────
const V2_IDS = new Set(V2_TEMPLATE_IDS);

describe('Template registry completeness', () => {
  it('every TemplateName has a render path (V2 engine or CVPreview switch case)', () => {
    const missing: string[] = [];
    for (const id of ALL_TEMPLATE_NAMES) {
      if (!V2_IDS.has(id) && !LEGACY_SWITCH_CASES.has(id)) {
        missing.push(id);
      }
    }
    expect(missing, `Templates registered in types.ts but missing a render path:\n  ${missing.join('\n  ')}\n\nFix: either add them to the V2 THEMES array in templateThemes.ts, or add a case in CVPreview.tsx switch statement.`).toHaveLength(0);
  });

  it('every V2 theme ID is registered in TemplateName (types.ts)', () => {
    const unregistered: string[] = [];
    for (const id of V2_TEMPLATE_IDS) {
      if (!(id in templateDisplayNames)) {
        unregistered.push(id);
      }
    }
    expect(unregistered, `V2 themes exist in templateThemes.ts but are missing from templateDisplayNames in types.ts:\n  ${unregistered.join('\n  ')}`).toHaveLength(0);
  });

  it('every legacy switch case is registered in TemplateName (types.ts)', () => {
    const unregistered: string[] = [];
    for (const id of LEGACY_SWITCH_CASES) {
      if (!(id in templateDisplayNames)) {
        unregistered.push(id);
      }
    }
    expect(unregistered, `Legacy templates have a switch case but are missing from templateDisplayNames in types.ts:\n  ${unregistered.join('\n  ')}`).toHaveLength(0);
  });
});
