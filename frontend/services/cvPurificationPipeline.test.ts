/**
 * Unit tests for cvPurificationPipeline.ts
 *
 * Covers: removeDuplicateWords, cleanImportedText, detectPhraseRepetition.
 * The async functions (cleanImportedTextRemote, purifyCV) require network/AI
 * and are integration-tested separately.
 *
 * Pure functions — no mocking, no network, no side effects.
 */

import { describe, it, expect } from 'vitest';
import {
    removeDuplicateWords,
    cleanImportedText,
    detectPhraseRepetition,
} from './cvPurificationPipeline';
import type { CVData } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCV(overrides: Partial<CVData> = {}): CVData {
    return {
        summary: 'Experienced software engineer delivering scalable backend systems.',
        skills: ['TypeScript', 'Node.js'],
        experience: [
            {
                jobTitle: 'Senior Engineer',
                company: 'Acme',
                dates: '2020 – Present',
                startDate: '2020-01-01',
                endDate: 'Present',
                responsibilities: [
                    'Architected a microservices platform serving 2M daily active users.',
                    'Reduced API latency by 40% through query optimisation and caching.',
                ],
            },
        ],
        education: [],
        ...overrides,
    } as CVData;
}

// ─── removeDuplicateWords ─────────────────────────────────────────────────────

describe('removeDuplicateWords', () => {
    it('removes adjacent duplicate words', () => {
        expect(removeDuplicateWords('the the team')).toBe('the team');
    });

    it('removes case-insensitive adjacent duplicates', () => {
        expect(removeDuplicateWords('documentation and Documentation')).toBe('documentation');
    });

    it('removes duplicates separated by "and"', () => {
        expect(removeDuplicateWords('knowledge and knowledge')).toBe('knowledge');
    });

    it('removes duplicates separated by "or"', () => {
        expect(removeDuplicateWords('strategy or strategy')).toBe('strategy');
    });

    it('removes duplicates separated by "," with spaces around it', () => {
        // The regex matches "word , word" (with spaces), not "word,word".
        // "data, data" has a trailing space after the comma — this matches.
        expect(removeDuplicateWords('data , data')).toBe('data');
    });

    it('collapses triple duplicates', () => {
        expect(removeDuplicateWords('a a a')).toBe('a');
    });

    it('does not alter text with no duplicates', () => {
        const clean = 'Delivered quality software on schedule.';
        expect(removeDuplicateWords(clean)).toBe(clean);
    });

    it('returns empty string for empty input', () => {
        expect(removeDuplicateWords('')).toBe('');
    });

    it('handles non-string gracefully', () => {
        // @ts-expect-error testing runtime resilience
        expect(() => removeDuplicateWords(null)).not.toThrow();
    });

    it('is idempotent', () => {
        const input = 'the the team the';
        const once = removeDuplicateWords(input);
        const twice = removeDuplicateWords(once);
        expect(once).toBe(twice);
    });
});

// ─── cleanImportedText ────────────────────────────────────────────────────────

describe('cleanImportedText', () => {
    it('returns the same text when no substitutions apply', () => {
        const input = 'Delivered scalable backend systems used by 2M daily active users.';
        const { cleaned, changes } = cleanImportedText(input);
        expect(cleaned).toBe(input);
        expect(changes).toHaveLength(0);
    });

    it('removes tilde-before-number AI tell', () => {
        const input = 'Achieved ~40% cost reduction and ~3x speed improvement.';
        const { cleaned, changes } = cleanImportedText(input);
        expect(cleaned).not.toContain('~');
        expect(cleaned).toContain('40%');
        expect(changes.some(c => c.includes('~'))).toBe(true);
    });

    it('collapses double spaces after substitutions', () => {
        const { cleaned } = cleanImportedText('Built  the  platform.');
        expect(cleaned).not.toMatch(/\s{2,}/);
    });

    it('removes space before punctuation', () => {
        const { cleaned } = cleanImportedText('Delivered results , on time .');
        expect(cleaned).not.toMatch(/\s[,\.]/);
    });

    it('returns { cleaned, changes } shape', () => {
        const result = cleanImportedText('Some input text.');
        expect(result).toHaveProperty('cleaned');
        expect(result).toHaveProperty('changes');
        expect(Array.isArray(result.changes)).toBe(true);
    });

    it('handles empty string', () => {
        const { cleaned, changes } = cleanImportedText('');
        expect(cleaned).toBe('');
        expect(changes).toHaveLength(0);
    });

    it('handles non-string gracefully', () => {
        // @ts-expect-error testing runtime resilience
        expect(() => cleanImportedText(null)).not.toThrow();
    });

    it('is idempotent — running twice gives the same cleaned output', () => {
        const input = 'Achieved ~40% improvement and built the the platform.';
        const { cleaned: once } = cleanImportedText(input);
        const { cleaned: twice } = cleanImportedText(once);
        expect(once).toBe(twice);
    });

    it('runs removeDuplicateWords as a final guard', () => {
        // After substitutions, adjacent duplicates could appear — this guard catches them.
        const { cleaned } = cleanImportedText('knowledge and knowledge sharing');
        expect(cleaned).not.toMatch(/\bknowledge\s+and\s+knowledge\b/i);
    });
});

// ─── detectPhraseRepetition ───────────────────────────────────────────────────

describe('detectPhraseRepetition', () => {
    it('returns empty array when no repeated phrases', () => {
        const cv = makeCV();
        expect(detectPhraseRepetition(cv)).toHaveLength(0);
    });

    it('detects a 4-word phrase repeated twice across the CV', () => {
        const cv = makeCV({
            summary: 'Delivered business value through stakeholder collaboration and strategic alignment.',
            experience: [
                {
                    jobTitle: 'Manager',
                    company: 'Corp',
                    dates: '2020 – 2022',
                    startDate: '2020-01-01',
                    endDate: '2022-01-01',
                    responsibilities: [
                        'Delivered business value through stakeholder collaboration across EMEA.',
                        'Improved deployment reliability and reduced rollback rates.',
                    ],
                },
            ],
        } as any);
        const repeated = detectPhraseRepetition(cv);
        // "delivered business value through" (or similar 4-word phrase) should be detected
        expect(repeated.length).toBeGreaterThan(0);
        expect(repeated[0]).toHaveProperty('phrase');
        expect(repeated[0]).toHaveProperty('count');
        expect(repeated[0].count).toBeGreaterThanOrEqual(2);
    });

    it('does not flag stop-word-only phrases', () => {
        const cv = makeCV({
            summary: 'and the team and the team and the team.',
        });
        // All-stopword phrases should be filtered out
        const repeated = detectPhraseRepetition(cv);
        const allStopwords = repeated.filter(r =>
            r.phrase.split(' ').every(w => ['and', 'the', 'a', 'an', 'of', 'in', 'to'].includes(w))
        );
        expect(allStopwords).toHaveLength(0);
    });

    it('returns empty array for a CV with very little text', () => {
        const cv = makeCV({
            summary: 'Short CV.',
            experience: [],
        });
        expect(detectPhraseRepetition(cv)).toHaveLength(0);
    });

    it('returns items with phrase and count properties', () => {
        const cv = makeCV({
            summary: 'Delivered business value through strategic alignment across the org.',
            experience: [
                {
                    jobTitle: 'Lead',
                    company: 'Corp',
                    dates: '2020 – 2022',
                    startDate: '2020-01-01',
                    endDate: '2022-01-01',
                    responsibilities: [
                        'Delivered business value through strategic alignment for the board.',
                        'Reduced delivery time and improved team velocity.',
                    ],
                },
            ],
        } as any);
        const repeated = detectPhraseRepetition(cv);
        for (const item of repeated) {
            expect(typeof item.phrase).toBe('string');
            expect(typeof item.count).toBe('number');
            expect(item.count).toBeGreaterThanOrEqual(2);
        }
    });

    it('handles a CV with no experience gracefully', () => {
        const cv = makeCV({ experience: [] });
        expect(() => detectPhraseRepetition(cv)).not.toThrow();
    });
});
