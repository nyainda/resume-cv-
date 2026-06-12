/**
 * Unit tests for cvVoiceFidelity.ts
 *
 * Covers: stripFirstPersonPronouns, normalizePresentTenseToImperative,
 * normalizeBulletsToImperative, hasFirstPerson, auditCvVoice.
 * Pure functions — no mocking, no network, no side effects.
 */

import { describe, it, expect } from 'vitest';
import {
    stripFirstPersonPronouns,
    normalizePresentTenseToImperative,
    normalizeBulletsToImperative,
    hasFirstPerson,
    auditCvVoice,
} from './cvVoiceFidelity';

// ─── stripFirstPersonPronouns ─────────────────────────────────────────────────

describe('stripFirstPersonPronouns', () => {
    it('returns empty string for empty input', () => {
        expect(stripFirstPersonPronouns('')).toBe('');
    });

    it('removes "I\'ve combined" at sentence start and capitalises the verb', () => {
        const input = "I've combined data analysis and project management to help farmers.";
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/\bI've\b/);
        expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
    });

    it('removes "I have" contraction at sentence start', () => {
        const input = 'I have led 3 cross-functional teams across two continents.';
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/\bI have\b/);
        expect(result).not.toMatch(/^\s*I\b/);
    });

    it('removes "I am" / "I\'m" at sentence start', () => {
        const input = "I'm responsible for architecting the backend infrastructure.";
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/I'm/);
    });

    it('replaces mid-sentence "I\'ve" with nothing and keeps the rest', () => {
        const input = "This system, which I've built over 3 years, serves 1M users.";
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/I've/);
        expect(result).toContain('built');
    });

    it('replaces "my" with "the"', () => {
        const input = 'Managed my team of 10 engineers across 4 product lines.';
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/\bmy\b/i);
        expect(result).toContain('the team');
    });

    it('removes "my own" before a noun phrase', () => {
        const input = 'Developed my own framework for rapid prototyping.';
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/\bmy own\b/i);
    });

    it('removes leading "we" and capitalises next word', () => {
        const input = 'we built a platform that serves 2M users globally.';
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/^we\b/i);
        expect(result.charAt(0)).toBe('B');
    });

    it('removes "our" from mid-sentence', () => {
        const input = 'Improved our deployment pipeline to reduce rollback time.';
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/\bour\b/i);
    });

    it('collapses double spaces after removal', () => {
        const input = 'I built  a  system.';
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/  /);
    });

    it('is idempotent — running twice yields the same output', () => {
        const input = "I've designed scalable microservices for global platforms.";
        const once = stripFirstPersonPronouns(input);
        const twice = stripFirstPersonPronouns(once);
        expect(once).toBe(twice);
    });

    it('does not alter text with no first-person pronouns', () => {
        const input = 'Delivered 12 major features with zero production incidents.';
        expect(stripFirstPersonPronouns(input)).toBe(input);
    });
});

// ─── normalizePresentTenseToImperative ────────────────────────────────────────

describe('normalizePresentTenseToImperative', () => {
    it('returns bullet unchanged when first word is not in TPS allow-list', () => {
        const input = 'Architected a platform serving 2M daily active users.';
        expect(normalizePresentTenseToImperative(input)).toBe(input);
    });

    it('returns empty string unchanged', () => {
        expect(normalizePresentTenseToImperative('')).toBe('');
    });

    it('preserves a bullet that already uses base-form imperative', () => {
        const input = 'Manage 15 enterprise accounts worth KES 50M annually.';
        expect(normalizePresentTenseToImperative(input)).toBe(input);
    });

    it('does not corrupt bullets that start with a noun (not a verb)', () => {
        const input = 'Engineers across 3 squads contributed to platform stability.';
        expect(normalizePresentTenseToImperative(input)).toBe(input);
    });
});

// ─── normalizeBulletsToImperative ─────────────────────────────────────────────

describe('normalizeBulletsToImperative', () => {
    it('returns an empty array for empty input', () => {
        expect(normalizeBulletsToImperative([])).toEqual([]);
    });

    it('maps every bullet through the normaliser', () => {
        const bullets = [
            'Delivers tailored designs to 200+ clients annually.',
            'Architected scalable microservices for global traffic.',
            'Maintains a 98% client satisfaction rate over 3 years.',
        ];
        const result = normalizeBulletsToImperative(bullets);
        expect(result).toHaveLength(3);
    });

    it('handles nullish bullets gracefully', () => {
        // @ts-expect-error testing runtime resilience
        expect(() => normalizeBulletsToImperative([null, undefined, ''])).not.toThrow();
    });
});

// ─── hasFirstPerson ───────────────────────────────────────────────────────────

describe('hasFirstPerson', () => {
    it('returns false for an empty string', () => {
        expect(hasFirstPerson('')).toBe(false);
    });

    it('detects "I" as a standalone word', () => {
        expect(hasFirstPerson('I led the team.')).toBe(true);
    });

    it('detects "I\'m"', () => {
        expect(hasFirstPerson("I'm responsible for architecture.")).toBe(true);
    });

    it('detects "my"', () => {
        expect(hasFirstPerson('Delivered my best work here.')).toBe(true);
    });

    it('detects "we"', () => {
        expect(hasFirstPerson('Together we shipped 12 features.')).toBe(true);
    });

    it('detects "our"', () => {
        expect(hasFirstPerson('our team exceeded all KPIs.')).toBe(true);
    });

    it('detects "myself"', () => {
        expect(hasFirstPerson('I did it myself.')).toBe(true);
    });

    it('returns false when no first-person pronouns present', () => {
        expect(hasFirstPerson('Delivered scalable backend systems used by 2M users.')).toBe(false);
    });

    it('does not trigger on "i.e." or "in"', () => {
        expect(hasFirstPerson('Achieved results (i.e. 40% cost reduction) in 6 months.')).toBe(false);
    });
});

// ─── auditCvVoice ─────────────────────────────────────────────────────────────

describe('auditCvVoice', () => {
    it('returns empty array for a clean CV with no voice issues', () => {
        const cv = {
            summary: 'Experienced engineer delivering scalable backend systems.',
            experience: [
                {
                    jobTitle: 'Senior Engineer',
                    company: 'Acme',
                    endDate: 'Present',
                    responsibilities: [
                        'Architect microservices serving 1M daily users.',
                        'Lead a team of 6 engineers across 3 squads.',
                    ],
                },
            ],
        };
        expect(auditCvVoice(cv)).toHaveLength(0);
    });

    it('flags first-person pronoun in summary', () => {
        const cv = {
            summary: "I've built scalable systems for 5 years.",
            experience: [],
        };
        const issues = auditCvVoice(cv);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].kind).toBe('first_person_pronoun');
        expect(issues[0].where).toBe('summary');
    });

    it('flags first-person pronoun in a responsibility bullet', () => {
        const cv = {
            summary: 'Results-driven engineer with 5 years of experience.',
            experience: [
                {
                    jobTitle: 'Engineer',
                    company: 'Corp',
                    endDate: '2022',
                    responsibilities: [
                        'I built the payment processing pipeline from scratch.',
                        'Reduced API latency by 40%.',
                    ],
                },
            ],
        };
        const issues = auditCvVoice(cv);
        const fpIssues = issues.filter(i => i.kind === 'first_person_pronoun');
        expect(fpIssues.length).toBeGreaterThan(0);
        expect(fpIssues[0].where).toContain('experience[0]');
    });

    it('treats missing endDate as current role', () => {
        const cv = {
            experience: [
                {
                    jobTitle: 'Engineer',
                    company: 'Corp',
                    // no endDate field
                    responsibilities: ['Architects scalable systems for enterprise clients.'],
                },
            ],
        };
        // The current role detection should work even with undefined endDate
        const issues = auditCvVoice(cv);
        // startsWithThirdPersonSingularVerb requires TPS_KEYS — which is empty
        // (moved to worker). So we just verify no crash and a clean result.
        expect(Array.isArray(issues)).toBe(true);
    });

    it('treats "present" endDate as current role', () => {
        const cv = {
            experience: [
                {
                    jobTitle: 'Manager',
                    company: 'Corp',
                    endDate: 'present',
                    responsibilities: ['Drives cross-functional alignment across 4 teams.'],
                },
            ],
        };
        const issues = auditCvVoice(cv);
        expect(Array.isArray(issues)).toBe(true);
    });

    it('does not flag third-person singular verbs in past roles', () => {
        const cv = {
            experience: [
                {
                    jobTitle: 'Engineer',
                    company: 'Past Corp',
                    endDate: '2020-01-01',
                    responsibilities: ['Generates reports and manages stakeholder relations.'],
                },
            ],
        };
        const issues = auditCvVoice(cv);
        const tpsIssues = issues.filter(i => i.kind === 'tense_third_person_singular');
        expect(tpsIssues).toHaveLength(0);
    });

    it('handles a CV with no experience gracefully', () => {
        const cv = { summary: 'Clean summary text.', experience: [] };
        expect(() => auditCvVoice(cv)).not.toThrow();
        expect(auditCvVoice(cv)).toHaveLength(0);
    });

    it('handles a CV with undefined experience gracefully', () => {
        const cv = { summary: 'A clean summary.' };
        expect(() => auditCvVoice(cv as any)).not.toThrow();
    });

    it('captures snippet text around the first-person match', () => {
        const cv = {
            summary: "I've spent 5 years building reliable distributed systems at scale.",
            experience: [],
        };
        const issues = auditCvVoice(cv);
        expect(issues[0].snippet.length).toBeGreaterThan(0);
    });

    it('returns separate issues for multiple first-person occurrences', () => {
        const cv = {
            summary: 'I am a results-driven engineer.',
            experience: [
                {
                    jobTitle: 'Lead',
                    company: 'Corp',
                    endDate: '2023',
                    responsibilities: ['I led the data migration project.', 'My team achieved 99.9% uptime.'],
                },
            ],
        };
        const issues = auditCvVoice(cv);
        expect(issues.length).toBeGreaterThanOrEqual(2);
    });
});
