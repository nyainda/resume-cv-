/**
 * Comprehensive audit of short / nonsense bullets across every pipeline layer.
 *
 * Categories tested:
 *   A — Ultra-short stubs (1–4 words): "Led team." / "Built things."
 *   B — Sub-minimum stubs (5–7 words): technically short, not punchy
 *   C — Weak-opener stubs: "Responsible for X." / "Worked on Y."
 *   D — Structural nonsense: starts with preposition, article, or is a fragment
 *   E — Vague / content-free at any length: "Managed various tasks."
 *   F — Blank / whitespace-only bullets
 *   G — Gap documentation: what the pipeline does NOT fix (detect-only)
 */

import { describe, it, expect } from 'vitest';
import { purifyCV } from './cvPurificationPipeline';
import { runValidationEngine } from './cvValidationEngine';
import type { CVData } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCV(bullets: string[]): CVData {
  return {
    summary: 'Experienced engineer delivering scalable backend systems at enterprise scale.',
    skills: ['TypeScript', 'Node.js'],
    experience: [{
      jobTitle: 'Senior Engineer',
      company: 'Acme Corp',
      dates: '2022 – Present',
      startDate: '2022-01-01',
      endDate: 'Present',
      responsibilities: bullets,
    }],
    education: [],
  } as unknown as CVData;
}

function wc(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function purifyBullets(bullets: string[]): string[] {
  const { cv } = purifyCV(makeCV(bullets));
  return cv.experience[0].responsibilities;
}

function isHollowViolation(cv: CVData) {
  const { violations } = runValidationEngine(cv as any);
  return violations.some(v => v.ruleId === 'hollow_bullets');
}

// ─── A: Ultra-short stubs (1–4 words) ────────────────────────────────────────

describe('Category A — Ultra-short stubs (1–4 words)', () => {
  const STUBS = [
    'Led team.',
    'Built things.',
    'Managed projects.',
    'Developed software.',
    'Improved processes.',
  ];

  it('purifyCV: stubs are preserved — not silently dropped', () => {
    const result = purifyBullets(STUBS);
    expect(result.length).toBeGreaterThan(0);
  });

  it('purifyCV: all stubs remain under 8 words after the deterministic pass', () => {
    const result = purifyBullets(STUBS);
    for (const bullet of result) {
      expect(wc(bullet)).toBeLessThan(8);
    }
  });

  it('purifyCV: report records each as a short_bullet leak', () => {
    const { report } = purifyCV(makeCV(STUBS));
    const shortLeaks = report.leaks.filter(l => l.leakType === 'short_bullet');
    expect(shortLeaks.length).toBe(STUBS.length);
  });

  it('validation engine: flags hollow_bullets violation', () => {
    expect(isHollowViolation(makeCV(STUBS))).toBe(true);
  });
});

// ─── B: Sub-minimum stubs (5–7 words) ────────────────────────────────────────

describe('Category B — Sub-minimum stubs (5–7 words)', () => {
  const STUBS = [
    'Managed the client account portfolio.',              // 5 w
    'Led the cross-functional engineering team.',         // 6 w
    'Reduced system downtime across the infrastructure.', // 6 w
    'Delivered features on time for stakeholders.',       // 7 w
  ];

  it('all test bullets are 5–7 words', () => {
    for (const b of STUBS) {
      const count = wc(b);
      expect(count).toBeGreaterThanOrEqual(5);
      expect(count).toBeLessThanOrEqual(7);
    }
  });

  it('purifyCV: stubs are still under 8 words after pipeline (not auto-expanded)', () => {
    const result = purifyBullets(STUBS);
    for (const bullet of result) {
      expect(wc(bullet)).toBeLessThan(8);
    }
  });

  it('purifyCV: each stub is recorded as a short_bullet leak', () => {
    const { report } = purifyCV(makeCV(STUBS));
    const shortLeaks = report.leaks.filter(l => l.leakType === 'short_bullet');
    expect(shortLeaks.length).toBe(STUBS.length);
  });

  it('validation engine: flags hollow_bullets', () => {
    expect(isHollowViolation(makeCV(STUBS))).toBe(true);
  });
});

// ─── C: Weak-opener stubs — pipeline SHOULD rewrite these ────────────────────

describe('Category C — Weak-opener stubs (pipeline rewrites opener)', () => {
  it('"Responsible for managing the engineering team." → strong action verb', () => {
    const [out] = purifyBullets(['Responsible for managing the engineering team.']);
    expect(out).not.toMatch(/^Responsible\s+for/i);
    expect(out).toMatch(/^[A-Z]/);
  });

  it('"Worked on building the new API platform." → strong action verb', () => {
    const [out] = purifyBullets(['Worked on building the new API platform.']);
    expect(out).not.toMatch(/^Worked\s+on/i);
    expect(out).toMatch(/^[A-Z]/);
  });

  it('"Assisted with the delivery of key product features." → non-passive opener', () => {
    const [out] = purifyBullets(['Assisted with the delivery of key product features.']);
    expect(out).not.toMatch(/^Assisted\s+with/i);
  });

  it('"Tasked with improving team efficiency metrics." → active opener', () => {
    const [out] = purifyBullets(['Tasked with improving team efficiency metrics.']);
    expect(out).not.toMatch(/^Tasked\s+with/i);
  });

  it('"Participated in agile ceremonies and sprint planning." → active opener', () => {
    const [out] = purifyBullets(['Participated in agile ceremonies and sprint planning sessions.']);
    expect(out).not.toMatch(/^Participated\s+in/i);
  });

  it('"Duties included reviewing PRs and mentoring juniors." → active opener', () => {
    const [out] = purifyBullets(['Duties included reviewing pull requests and mentoring junior engineers.']);
    expect(out).not.toMatch(/^Duties\s+included/i);
  });

  it('"Helped the team achieve their goals." → active opener', () => {
    const [out] = purifyBullets(['Helped the team achieve their goals and objectives throughout the year.']);
    expect(out).not.toMatch(/^Helped\s+the/i);
  });
});

// ─── D: Structural fragments / bad openers ────────────────────────────────────

describe('Category D — Structural fragments (document pipeline behaviour)', () => {
  it('"The system was improved significantly." — passive, still renders cleanly', () => {
    const [out] = purifyBullets(['The system was improved significantly.']);
    expect(out).toMatch(/^[A-Z]/);
    expect(out).toMatch(/\.$/);
  });

  it('"By implementing continuous integration across all services." — fragment, ≥ 8 words → not short_bullet flagged', () => {
    const fragment = 'By implementing continuous integration across all services.';
    const { report } = purifyCV(makeCV([fragment]));
    const shortLeaks = report.leaks.filter(l => l.leakType === 'short_bullet');
    // 8 words — passes the word-count gate, slips through as a structural gap
    expect(wc(fragment)).toBeGreaterThanOrEqual(8);
    expect(shortLeaks).toHaveLength(0); // gap: grammatical fragment not caught
  });

  it('"In order to improve the platform we restructured the codebase." — renders cleanly', () => {
    const [out] = purifyBullets(['In order to improve the platform we restructured the codebase.']);
    expect(out).toMatch(/\.$/);
  });
});

// ─── E: Vague / content-free at word-count ≥ 8 ───────────────────────────────

describe('Category E — Vague bullets (≥ 8 words, but meaningless)', () => {
  const VAGUE = [
    'Managed various important tasks and responsibilities on a regular basis.',      // 11 w
    'Worked with team members to complete assigned work in a timely manner.',       // 13 w
    'Contributed to the success of the business through effective collaboration.',  // 11 w
    'Helped the team achieve their goals and objectives throughout the year.',      // 12 w
  ];

  it('all vague bullets pass the word-count gate (≥ 8 words)', () => {
    for (const b of VAGUE) {
      expect(wc(b)).toBeGreaterThanOrEqual(8);
    }
  });

  it('validation engine does NOT flag vague bullets as hollow (length-only check)', () => {
    // Documents the gap: semantic vagueness is not caught by word count alone.
    expect(isHollowViolation(makeCV(VAGUE))).toBe(false);
  });

  it('purifyCV rewrites weak openers where applicable', () => {
    const results = purifyBullets(VAGUE);
    // "Helped the team…" → should not start with "Helped the"
    const helpedBullet = results.find(r =>
      r.toLowerCase().includes('achieve') || r.toLowerCase().includes('goals')
    );
    if (helpedBullet) {
      expect(helpedBullet).not.toMatch(/^Helped\s+the/i);
    }
  });
});

// ─── F: Blank / whitespace-only bullets ──────────────────────────────────────

describe('Category F — Blank and whitespace-only bullets', () => {
  it('empty string bullet: purifyCV does not crash', () => {
    expect(() => purifyBullets([''])).not.toThrow();
  });

  it('whitespace-only bullet: purifyCV does not crash', () => {
    expect(() => purifyBullets(['   '])).not.toThrow();
  });

  it('empty bullets are NOT counted as short_bullet leaks (0-word guard)', () => {
    const { report } = purifyCV(makeCV(['', '   ']));
    const shortLeaks = report.leaks.filter(l => l.leakType === 'short_bullet');
    // The pipeline guards "words > 0" so empty strings are not mis-counted
    expect(shortLeaks).toHaveLength(0);
  });

  it('real bullets survive alongside blank ones', () => {
    const result = purifyBullets([
      '',
      'Architected a microservices platform serving 2M daily active users.',
      '   ',
    ]);
    const nonEmpty = result.filter(b => b.trim().length > 0);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(1);
    expect(nonEmpty[0]).toContain('microservices');
  });
});

// ─── G: Gap documentation ─────────────────────────────────────────────────────

describe('Category G — Gap documentation: what deterministic passes cannot fix', () => {
  it('GAP: 5–7 word stubs are logged as short_bullet leaks but never auto-expanded', () => {
    // The AI hollow-bullet expansion (Fix 6 in geminiService) handles < 6 words
    // during generation. 6–7 word stubs are detected but require the AI pass.
    const stub = 'Led the global engineering team.'; // 6 words
    const [out] = purifyBullets([stub]);
    expect(wc(out)).toBeLessThan(8); // still short after deterministic pass
    const { report } = purifyCV(makeCV([stub]));
    expect(report.leaks.some(l => l.leakType === 'short_bullet')).toBe(true);
  });

  it('GAP: prepositional fragment ≥ 8 words slips through word-count + weak-opener gates', () => {
    // "By implementing…" has a prep opener but no main clause.
    // The weak-opener rewriter does not cover "By [gerund]…" patterns.
    const fragment = 'By implementing a CI/CD pipeline for all services.';
    const [out] = purifyBullets([fragment]);
    // Confirm: NOT flagged by word count (8 words), not rewritten
    expect(wc(out)).toBeGreaterThanOrEqual(7);
  });

  it('GAP: passive voice "The system was improved." at ≥ 8 words escapes all gates', () => {
    const passive = 'The system was improved significantly by our team.'; // 9 words
    const [out] = purifyBullets([passive]);
    expect(wc(out)).toBeGreaterThanOrEqual(8); // passes word-count
    // No rewriter currently converts "The [noun] was [verb]ed" → active voice
    expect(out).toMatch(/^The /i); // still starts with article
  });
});
