/**
 * Template governance tests — Layer 3 of the "central command" plan.
 *
 * These tests encode rules that are otherwise advisory (CLAUDE.md, code review).
 * A failing test here means someone introduced a structural problem that would
 * have gone unnoticed until a user hit a broken template or a duplicated design.
 *
 * Complement to template-completeness.test.ts (which checks render-path wiring).
 * These tests focus on the V2 theme REGISTRY itself:
 *   1. Every V2 theme has a display name in templateDisplayNames.
 *   2. No two V2 themes share the same accent + layout combo (near-duplicate detector).
 *   3. Every V2 theme has non-empty fontHeading and fontBody.
 *   4. Every V2 theme's accent is a valid 6-digit hex colour.
 *   5. No V2 theme uses a hex that was banned from the app chrome and isn't in
 *      the approved template palette (catches accidental copy-paste from UI code).
 */

import { describe, it, expect } from 'vitest';
import { THEMES } from '../templates/engine/templateThemes';
import { templateDisplayNames, TemplateName } from '../../types';

// ─── 1. Display names ─────────────────────────────────────────────────────────
describe('template display names (SSOT compliance)', () => {
  it('every V2 theme ID has an entry in templateDisplayNames', () => {
    const missing = THEMES
      .map(t => t.id)
      .filter(id => !templateDisplayNames[id as TemplateName]);

    expect(
      missing,
      `V2 theme IDs missing from templateDisplayNames in types.ts:\n  ${missing.join('\n  ')}\n` +
      `Add these entries — or regenerate templateDisplayNames from THEMES if you've wired up the SSOT migration.`,
    ).toHaveLength(0);
  });
});

// ─── 2. Near-duplicate detector ───────────────────────────────────────────────
describe('template palette discipline (no near-duplicates)', () => {
  it('no two V2 themes share the same accent + layout + sectionDecoration + fontHeading combo', () => {
    // A theme is a "near-duplicate" only when ALL FOUR visual dimensions match.
    // Two themes that share an accent colour but differ in font family or section
    // decoration style are genuinely distinct designs and must not be merged.
    const seen = new Map<string, string>();
    const dupes: string[] = [];

    for (const t of THEMES) {
      const key = [
        t.accent.toLowerCase(),
        t.layout,
        t.sectionDecoration,
        // Normalise font-family: take the first named font as the identity
        t.fontHeading.split(',')[0].replace(/['"]/g, '').trim().toLowerCase(),
      ].join('|');

      if (seen.has(key)) {
        dupes.push(
          `"${t.id}" duplicates "${seen.get(key)}" — ` +
          `accent=${t.accent}, layout=${t.layout}, decoration=${t.sectionDecoration}, ` +
          `headingFont=${t.fontHeading.split(',')[0].trim()}`,
        );
      } else {
        seen.set(key, t.id);
      }
    }

    expect(
      dupes,
      `Near-duplicate V2 themes detected (identical accent + layout + section style + heading font):\n  ${dupes.join('\n  ')}\n` +
      `Either differentiate one theme further, or merge them. ` +
      `Run: npx vitest run templateGovernance`,
    ).toHaveLength(0);
  });
});

// ─── 3. Font completeness ─────────────────────────────────────────────────────
describe('template typography completeness', () => {
  it('every V2 theme has non-empty fontHeading and fontBody', () => {
    const broken = THEMES.filter(t => !t.fontHeading || !t.fontBody);
    const list = broken.map(t => `"${t.id}" (heading="${t.fontHeading}", body="${t.fontBody}")`);

    expect(
      list,
      `V2 themes with missing font declarations:\n  ${list.join('\n  ')}`,
    ).toHaveLength(0);
  });
});

// ─── 4. Hex colour validity ───────────────────────────────────────────────────
describe('template colour validity', () => {
  const HEX_RE = /^#[0-9a-f]{6}$/i;

  it('every V2 theme accent is a valid 6-digit hex', () => {
    const invalid = THEMES
      .filter(t => !HEX_RE.test(t.accent))
      .map(t => `"${t.id}": accent="${t.accent}"`);

    expect(
      invalid,
      `V2 themes with invalid accent hex:\n  ${invalid.join('\n  ')}`,
    ).toHaveLength(0);
  });

  it('every V2 theme sidebarBg is a valid hex or empty string', () => {
    const invalid = THEMES
      .filter(t => t.sidebarBg !== '' && !HEX_RE.test(t.sidebarBg))
      .map(t => `"${t.id}": sidebarBg="${t.sidebarBg}"`);

    expect(
      invalid,
      `V2 themes with invalid sidebarBg:\n  ${invalid.join('\n  ')}`,
    ).toHaveLength(0);
  });
});

// ─── 5. Banned app-chrome colours must not bleed into templates ───────────────
// The app palette bans indigo/purple from the UI chrome. CV templates MAY use
// the special "CV-only" indigo (#4338CA) but never the banned app indigo (#4f46e5).
describe('colour bleed prevention', () => {
  const BANNED_IN_APP_CHROME = [
    '#4f46e5', // app-banned purple-blue
    '#6366f1', // app-banned indigo-500
    '#818cf8', // app-banned indigo-400
    '#a5b4fc', // app-banned indigo-300
  ];

  it('no V2 theme accent uses a colour banned from the app chrome', () => {
    const offending = THEMES
      .filter(t => BANNED_IN_APP_CHROME.includes(t.accent.toLowerCase()))
      .map(t => `"${t.id}": accent="${t.accent}"`);

    expect(
      offending,
      `V2 themes using app-chrome banned colours as accent:\n  ${offending.join('\n  ')}\n` +
      `For tech/SWE templates use the approved CV-only indigo: #4338CA.`,
    ).toHaveLength(0);
  });
});
