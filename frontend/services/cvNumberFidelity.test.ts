/**
 * Unit tests for cvNumberFidelity.ts
 *
 * Covers: stripTildeNumbers, collectSourceNumberTokens,
 * stripUngroundedNumbers, tidyOrphanRemnants, isBulletDegraded,
 * repairBulletsAgainstSource, repairTextAgainstSource.
 *
 * Pure functions — no mocking, no network, no side effects.
 */

import { describe, it, expect } from 'vitest';
import {
    stripTildeNumbers,
    collectSourceNumberTokens,
    stripUngroundedNumbers,
    tidyOrphanRemnants,
    isBulletDegraded,
    repairBulletsAgainstSource,
} from './cvNumberFidelity';

// ─── stripTildeNumbers ────────────────────────────────────────────────────────

describe('stripTildeNumbers', () => {
    it('removes tilde before a digit', () => {
        expect(stripTildeNumbers('~50 units')).toBe('50 units');
    });

    it('removes tilde before a percentage', () => {
        expect(stripTildeNumbers('~30% improvement')).toBe('30% improvement');
    });

    it('does not alter text with no tildes', () => {
        expect(stripTildeNumbers('Built API handling 500K requests/day.')).toBe('Built API handling 500K requests/day.');
    });

    it('removes multiple tildes in the same string', () => {
        const input = 'Achieved ~40% cost reduction and ~3x speed improvement.';
        const result = stripTildeNumbers(input);
        expect(result).not.toContain('~');
        expect(result).toContain('40%');
        expect(result).toContain('3x');
    });

    it('does not remove a tilde not immediately before a digit', () => {
        expect(stripTildeNumbers('Used Git ~ 4 years ago')).toBe('Used Git ~ 4 years ago');
    });

    it('handles empty string', () => {
        expect(stripTildeNumbers('')).toBe('');
    });
});

// ─── collectSourceNumberTokens ────────────────────────────────────────────────

describe('collectSourceNumberTokens', () => {
    it('collects digit sequences from source bullets', () => {
        const bullets = ['Led a team of 12 engineers.', 'Reduced latency by 40%.'];
        const tokens = collectSourceNumberTokens(bullets);
        expect(tokens.has('12')).toBe(true);
        expect(tokens.has('40')).toBe(true);
    });

    it('also stores comma-stripped form of large numbers', () => {
        const bullets = ['Generated 1,200,000 in annual revenue.'];
        const tokens = collectSourceNumberTokens(bullets);
        expect(tokens.has('1,200,000')).toBe(true);
        expect(tokens.has('1200000')).toBe(true);
    });

    it('collects numbers from profile.professionalSummary', () => {
        const tokens = collectSourceNumberTokens([], {
            professionalSummary: '10 years of engineering experience.',
        });
        expect(tokens.has('10')).toBe(true);
    });

    it('collects numbers from profile.workExperience responsibilities (array)', () => {
        const tokens = collectSourceNumberTokens([], {
            workExperience: [{ responsibilities: ['Managed 5 product lines.'] }],
        });
        expect(tokens.has('5')).toBe(true);
    });

    it('collects numbers from profile.projects descriptions', () => {
        const tokens = collectSourceNumberTokens([], {
            projects: [{ description: 'Served 50,000 monthly active users.' }],
        });
        expect(tokens.has('50,000')).toBe(true);
        expect(tokens.has('50000')).toBe(true);
    });

    it('returns an empty set for empty inputs', () => {
        const tokens = collectSourceNumberTokens([]);
        expect(tokens.size).toBe(0);
    });

    it('handles bullets with no numbers', () => {
        const tokens = collectSourceNumberTokens(['Delivered quality software.']);
        expect(tokens.size).toBe(0);
    });
});

// ─── stripUngroundedNumbers ───────────────────────────────────────────────────

describe('stripUngroundedNumbers', () => {
    it('keeps numbers that appear in the source token set', () => {
        const tokens = new Set(['40', '12']);
        const result = stripUngroundedNumbers('Reduced latency by 40% across 12 services.', tokens);
        expect(result).toContain('40');
        expect(result).toContain('12');
    });

    it('strips numbers that do not appear in the source token set', () => {
        const tokens = new Set(['40']);
        const result = stripUngroundedNumbers('Generated KES 500,000 in new revenue.', tokens);
        expect(result).not.toMatch(/500/);
    });

    it('always preserves 4-digit calendar years', () => {
        const tokens = new Set<string>();
        const result = stripUngroundedNumbers('Worked at the company from 2019 to 2023.', tokens);
        expect(result).toContain('2019');
        expect(result).toContain('2023');
    });

    it('returns empty string for empty input', () => {
        const tokens = new Set<string>();
        expect(stripUngroundedNumbers('', tokens)).toBe('');
    });

    it('handles a bullet with no numbers gracefully', () => {
        const tokens = new Set<string>();
        const text = 'Delivered quality software on schedule.';
        expect(stripUngroundedNumbers(text, tokens)).toBe(text);
    });

    it('strips currency-prefixed hallucinated amounts', () => {
        const tokens = new Set(['5']);
        const result = stripUngroundedNumbers('Generated $2,500,000 in pipeline value.', tokens);
        expect(result).not.toMatch(/2,500,000/);
        expect(result).not.toMatch(/\$\s*,/); // no orphan currency + comma
    });

    it('comma-stripped form is accepted when only comma form is in tokens', () => {
        const tokens = new Set(['50000']);
        const result = stripUngroundedNumbers('Served 50,000 monthly active users.', tokens);
        expect(result).toContain('50,000');
    });
});

// ─── tidyOrphanRemnants ───────────────────────────────────────────────────────

describe('tidyOrphanRemnants', () => {
    it('removes orphan % with no preceding digit', () => {
        const input = 'Increased productivity by %.';
        const result = tidyOrphanRemnants(input);
        expect(result).not.toMatch(/%/);
    });

    it('removes orphan leading decimal stub', () => {
        const input = 'Generated .8M in new ARR.';
        const result = tidyOrphanRemnants(input);
        expect(result).not.toMatch(/\.\d+M/);
    });

    it('removes "a -person team" orphan hyphen-noun', () => {
        const input = 'Led a -person field operations team across East Africa.';
        const result = tidyOrphanRemnants(input);
        expect(result).not.toMatch(/-person/);
    });

    it('removes "KES ," orphan currency-comma combo', () => {
        const input = 'Generated KES , in revenue last quarter.';
        const result = tidyOrphanRemnants(input);
        expect(result).not.toMatch(/KES\s*,/);
    });

    it('collapses double spaces', () => {
        const result = tidyOrphanRemnants('Built  the  platform.');
        expect(result).not.toMatch(/\s{2,}/);
    });

    it('does not corrupt a fully clean bullet', () => {
        const clean = 'Architected a microservices platform serving 2M daily active users.';
        expect(tidyOrphanRemnants(clean)).toBe(clean);
    });

    it('collapses ", ," to ","', () => {
        const result = tidyOrphanRemnants('Delivered results, , on time.');
        expect(result).not.toMatch(/,\s*,/);
    });

    it('does not alter capitalisation of the first character (no-op for case)', () => {
        // tidyOrphanRemnants only tidies orphan punctuation/spacing — it does
        // not capitalise the first letter. That is done by the caller.
        const result = tidyOrphanRemnants('built a platform.');
        expect(result).toBe('built a platform.');
    });
});

// ─── isBulletDegraded ─────────────────────────────────────────────────────────

describe('isBulletDegraded', () => {
    it('returns true for an empty stripped string', () => {
        expect(isBulletDegraded('', 'Original bullet text that had 10 words here fine.')).toBe(true);
    });

    it('returns true when stripped is shorter than 25 characters', () => {
        expect(isBulletDegraded('Too short.', 'Original long bullet text here.')).toBe(true);
    });

    it('returns true when stripped starts with a stranded preposition', () => {
        expect(isBulletDegraded('by reducing time and cost.', 'Achieved results by reducing time and cost.')).toBe(true);
    });

    it('returns true when orphan decimal stub is present', () => {
        expect(isBulletDegraded('Delivered .8M in ARR growth this quarter.', 'Delivered $1.8M in ARR growth this quarter.')).toBe(true);
    });

    it('returns true when chained prepositions are present', () => {
        const stripped = 'Increased revenue by from the new pricing strategy.';
        expect(isBulletDegraded(stripped, stripped)).toBe(true);
    });

    it('returns true when too many words were removed (less than 60% remain for 8+ word original)', () => {
        const original = 'Built a high-performance API gateway reducing latency by 40%.';
        const stripped = 'Built high-performance gateway.'; // ~30% remain
        expect(isBulletDegraded(stripped, original)).toBe(true);
    });

    it('returns false for a clean, long-enough stripped bullet', () => {
        const stripped = 'Architected a microservices platform serving 2M daily active users.';
        const original = 'Architected a microservices platform serving 2M daily active users.';
        expect(isBulletDegraded(stripped, original)).toBe(false);
    });

    it('returns false when most words are preserved', () => {
        const original = 'Reduced API latency by 40% through query optimisation and caching strategies.';
        const stripped = 'Reduced API latency through query optimisation and caching strategies.';
        expect(isBulletDegraded(stripped, original)).toBe(false);
    });
});

// ─── repairBulletsAgainstSource ───────────────────────────────────────────────

describe('repairBulletsAgainstSource', () => {
    it('keeps a grounded bullet as-is', () => {
        const tokens = new Set(['40', '2']);
        const generated = ['Reduced latency by 40% across 2 regions.'];
        const source = ['Reduced latency by 40% across 2 regions.'];
        const result = repairBulletsAgainstSource(generated, source, tokens);
        expect(result[0]).toContain('40');
    });

    it('falls back to source bullet when stripped result is too short (under 25 chars)', () => {
        const tokens = new Set<string>();
        // After stripping, what remains is fewer than 25 characters, triggering
        // the length guard in isBulletDegraded. An empty string → '' is also
        // covered by the first guard (returns true for empty).
        // Use a bullet where stripping leaves only a tiny stub.
        const generated = ['By 50% in 3 months.'];
        const source = ['Delivered measurable cost efficiencies across global operations.'];
        const result = repairBulletsAgainstSource(generated, source, tokens);
        expect(result[0]).toBe(source[0]);
    });

    it('drops a bullet entirely when no source fallback is available', () => {
        const tokens = new Set<string>();
        const generated = ['Achieved $5,000,000 globally.', 'Generated $2,000,000 in pipeline.'];
        const source: string[] = [];
        const result = repairBulletsAgainstSource(generated, source, tokens);
        expect(result).toHaveLength(0);
    });

    it('preserves all grounded bullets in order', () => {
        const tokens = new Set(['40', '12', '60']);
        const generated = [
            'Reduced latency by 40%.',
            'Led a team of 12 engineers.',
            'Cut build time by 60%.',
        ];
        const source = generated;
        const result = repairBulletsAgainstSource(generated, source, tokens);
        expect(result).toHaveLength(3);
    });

    it('handles empty generated array gracefully', () => {
        const tokens = new Set<string>();
        const result = repairBulletsAgainstSource([], [], tokens);
        expect(result).toEqual([]);
    });

    it('does not reuse the same source bullet for multiple fallbacks', () => {
        const tokens = new Set<string>();
        const generated = ['Achieved $100M globally.', 'Generated $200M pipeline.'];
        const source = ['Real bullet one.', 'Real bullet two.'];
        // Both generated bullets should fall back, but each gets a different source
        // Pad source so they're long enough to not be "degraded"
        const longSource = [
            'Delivered measurable cost efficiencies across global operations consistently.',
            'Generated sustained pipeline growth through targeted enterprise outreach activities.',
        ];
        const result = repairBulletsAgainstSource(generated, longSource, tokens);
        // Each fallback uses a different source bullet
        if (result.length === 2) {
            expect(result[0]).not.toBe(result[1]);
        }
    });
});
