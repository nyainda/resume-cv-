/**
 * Regression suite for the "ProCV Purification Pipeline Audit — Silent
 * No-Ops & Grammar Bugs" report.
 *
 * Each `describe` block below is named after the audit finding it guards
 * against, so a future refactor that reintroduces one of these bugs fails
 * CI immediately instead of shipping a silent no-op.
 *
 * Pure functions only — no network, no mocking.
 */

import { describe, it, expect } from 'vitest';
import { stripFirstPersonPronouns, normalizePresentTenseToImperative } from './cvVoiceFidelity';
import { cleanImportedText, purifyCV } from './cvPurificationPipeline';
import { auditStyleGovernance } from './cvStyleGovernance';
import type { CVData } from '../types';

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

// ─── §2 — mid-sentence "I" deletion ─────────────────────────────────────────

describe('audit §2 — stripFirstPersonPronouns must not corrupt mid-sentence "I"', () => {
    it('does not delete "I" when it appears mid-clause as part of a relative clause', () => {
        const input = 'Managed the team I led through a critical product launch.';
        const result = stripFirstPersonPronouns(input);
        expect(result).toContain('the team I led');
    });

    it('still strips a genuine sentence-initial "I" statement', () => {
        const input = 'I led a team of 5 engineers across two continents.';
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/^\s*I\b/);
    });

    it('strips a clause-initial "I" following a period without touching mid-sentence "I"', () => {
        const input = 'Shipped the release. I personally verified every rollback path the team I trained had prepared.';
        const result = stripFirstPersonPronouns(input);
        expect(result).not.toMatch(/[.!?]\s+I\b/);
        expect(result).toContain('the team I trained');
    });
});

// ─── §0/§1/§3 — empty stub tables causing silent no-ops ────────────────────

describe('audit §0/§1/§3 — purification data tables must not be empty stubs', () => {
    it('cleanImportedText actually rewrites a known banned AI-ism phrase', () => {
        const { cleaned, changes } = cleanImportedText(
            'Leveraged synergies to spearhead cutting-edge initiatives.',
        );
        expect(changes.length).toBeGreaterThan(0);
        expect(cleaned).not.toMatch(/leverage(d)?/i);
    });

    it('purifyCV actually flips past-tense verbs to present in a current role (VERB_TENSE_MAP is populated)', () => {
        const cv = makeCV({
            experience: [
                {
                    jobTitle: 'Engineer',
                    company: 'Acme',
                    dates: '2021 – Present',
                    startDate: '2021-01-01',
                    endDate: 'Present',
                    responsibilities: ['Led a team of 5 engineers to deliver quarterly roadmaps.'],
                },
            ],
        });
        const { report } = purifyCV(cv);
        expect(report.bulletsTenseFlipped).toBeGreaterThan(0);
    });

    it('auditStyleGovernance actually reports issues (GOVERNANCE_SUBSTITUTIONS-backed checks are live)', () => {
        const cv = makeCV({
            experience: [
                {
                    jobTitle: 'Engineer',
                    company: 'Acme',
                    dates: '2021 – Present',
                    startDate: '2021-01-01',
                    endDate: 'Present',
                    responsibilities: [
                        'Built the onboarding flow end to end.',
                        'Built the billing dashboard end to end.',
                        'Built the analytics pipeline end to end.',
                        'Built the search index end to end.',
                    ],
                },
            ],
        });
        const report = auditStyleGovernance(cv);
        expect(report.issues.length).toBeGreaterThan(0);
    });
});

// ─── Noun/verb ambiguity guard (found while restoring VERB_TENSE_MAP) ──────

describe('regression — noun/verb ambiguity guard in normalizePresentTenseToImperative', () => {
    it('does not convert a plural job-title noun phrase followed by a preposition', () => {
        const result = normalizePresentTenseToImperative('Engineers across 3 squads shipped the migration.');
        expect(result).toMatch(/^Engineers across/);
    });

    it('still converts a genuine 3rd-person verb opener to imperative', () => {
        const result = normalizePresentTenseToImperative('Leads a team of 5 engineers to deliver quarterly roadmaps.');
        expect(result.startsWith('Lead ')).toBe(true);
    });

    it('does not convert "Reports" when used as a noun followed by a preposition', () => {
        const result = normalizePresentTenseToImperative('Reports across 4 business units are reviewed monthly.');
        expect(result).toMatch(/^Reports across/);
    });
});

// ─── §6.3 — certifications free-text cleaning gap ──────────────────────────
// Covered end-to-end in cvFinalGuard.test.ts style via the shared cleanText
// helper's public surface (purifyCV / cleanImportedText); the guard function
// itself is exercised indirectly since cleanText is module-private.

describe('audit §6.3 — certifications should be subject to the same free-text cleaning as achievements', () => {
    it('cleanImportedText (the shared cleaning primitive) collapses duplicate words in certification-like text', () => {
        const { cleaned } = cleanImportedText('AWS Certified Certified Solutions Architect');
        expect(cleaned).not.toMatch(/Certified\s+Certified/i);
    });
});

// ─── Worker/frontend duplication — skipWorkerDuplicatePasses ───────────────

describe('regression — purifyCV must not double-run substitution/tense passes already done by the Worker', () => {
    it('skips the local substitution pass when skipWorkerDuplicatePasses is true', () => {
        const cv = makeCV({
            summary: 'Leveraged synergies to spearhead cutting-edge initiatives.',
        });
        const { cv: result, report } = purifyCV(cv, { skipWorkerDuplicatePasses: true });
        expect(result.summary).toBe(cv.summary);
        expect(report.substitutionsMade).toBe(0);
    });

    it('still runs the local substitution pass when skipWorkerDuplicatePasses is false (fallback path)', () => {
        const cv = makeCV({
            summary: 'Leveraged synergies to spearhead cutting-edge initiatives.',
        });
        const { report } = purifyCV(cv, { skipWorkerDuplicatePasses: false });
        expect(report.substitutionsMade).toBeGreaterThan(0);
    });

    it('still runs local-only passes (skill dedupe) even when skipWorkerDuplicatePasses is true', () => {
        const cv = makeCV({ skills: ['TypeScript', 'typescript', 'Node.js'] });
        const { cv: result } = purifyCV(cv, { skipWorkerDuplicatePasses: true });
        expect(result.skills.length).toBe(2);
    });

    it('defaults to running the full local pipeline when opts is omitted (no regression for existing callers)', () => {
        const cv = makeCV({
            experience: [
                {
                    jobTitle: 'Engineer',
                    company: 'Acme',
                    dates: '2021 – Present',
                    startDate: '2021-01-01',
                    endDate: 'Present',
                    responsibilities: ['Led a team of 5 engineers to deliver quarterly roadmaps.'],
                },
            ],
        });
        const { report } = purifyCV(cv);
        expect(report.bulletsTenseFlipped).toBeGreaterThan(0);
    });
});
