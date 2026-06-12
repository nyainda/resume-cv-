/**
 * Unit tests for cvStyleGovernance.ts
 *
 * Covers: classifyOpener, auditStyleGovernance (all 5 active checks):
 *   - opener_category_monotone
 *   - all_verb_led
 *   - verb_cluster_dominance
 *   - bare_metric_opener
 *   - context_missing
 *   - meaning_cluster_repetition
 *
 * Pure functions — no mocking, no network, no side effects.
 */

import { describe, it, expect } from 'vitest';
import { classifyOpener, auditStyleGovernance } from './cvStyleGovernance';
import type { CVData } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRole(bullets: string[], endDate = '2022-01-01') {
    return {
        jobTitle: 'Senior Engineer',
        company: 'Acme Corp',
        dates: '2020 – 2022',
        startDate: '2020-01-01',
        endDate,
        responsibilities: bullets,
    };
}

function makeCV(roles: CVData['experience']): CVData {
    return {
        summary: 'Clean summary text.',
        skills: ['TypeScript', 'React'],
        experience: roles,
        education: [],
    } as CVData;
}

// ─── classifyOpener ───────────────────────────────────────────────────────────

describe('classifyOpener', () => {
    it('classifies a verb-led bullet as "verb"', () => {
        expect(classifyOpener('Built a distributed caching layer for the API gateway.')).toBe('verb');
    });

    it('classifies a digit-first bullet as "number"', () => {
        expect(classifyOpener('3 patents filed in 2024 covering ML inference pipelines.')).toBe('number');
    });

    it('classifies a currency-first bullet as "number"', () => {
        expect(classifyOpener('$2M in new ARR generated through enterprise outreach.')).toBe('number');
    });

    it('classifies a written-number-first bullet as "number"', () => {
        expect(classifyOpener('Twenty engineers onboarded within the first quarter.')).toBe('number');
    });

    it('classifies "As the sole engineer…" as "context"', () => {
        expect(classifyOpener('As the sole engineer, owned the entire backend infrastructure.')).toBe('context');
    });

    it('classifies "After acquiring funding…" as "context"', () => {
        expect(classifyOpener('After acquiring Series A funding, scaled the team from 3 to 15.')).toBe('context');
    });

    it('classifies "In Q3 2023…" as "timeframe"', () => {
        expect(classifyOpener('In Q3 2023, launched the mobile application across 5 markets.')).toBe('timeframe');
    });

    it('classifies "Over 2 years…" as "timeframe"', () => {
        expect(classifyOpener('Over 2 years, grew the platform from 10K to 500K monthly users.')).toBe('timeframe');
    });

    it('classifies "With the security team…" as "collaboration"', () => {
        expect(classifyOpener('With the security team, designed the zero-trust network architecture.')).toBe('collaboration');
    });

    it('classifies "Partnering with…" as "collaboration"', () => {
        expect(classifyOpener('Partnering with product managers to translate requirements into specifications.')).toBe('collaboration');
    });

    it('classifies "Across 5 regions…" as "scope"', () => {
        expect(classifyOpener('Across 5 regions, standardised the deployment pipeline to reduce variance.')).toBe('scope');
    });

    it('classifies "Top performer…" as "outcome"', () => {
        expect(classifyOpener('Top performer in the engineering org for two consecutive quarters.')).toBe('outcome');
    });

    it('classifies a very short bullet as "fragment"', () => {
        expect(classifyOpener('Zero downtime.')).toBe('fragment');
        expect(classifyOpener('Led team.')).toBe('fragment');
    });

    it('handles an empty string without throwing', () => {
        expect(() => classifyOpener('')).not.toThrow();
        expect(classifyOpener('')).toBe('fragment');
    });

    it('handles a bullet with a leading bullet glyph', () => {
        expect(classifyOpener('• Built a platform serving 2M daily users.')).toBe('verb');
    });
});

// ─── auditStyleGovernance ─────────────────────────────────────────────────────

describe('auditStyleGovernance — clean CV produces no issues', () => {
    it('returns zero issues for a well-written CV', () => {
        // Bullets carefully crafted to avoid every check:
        // - no 3+ consecutive same-category openers
        // - not >85% verb-led (2 non-verb openers out of 6)
        // - no single verb cluster dominates
        // - no bare metric opener (≥8 words with scaled metric at start)
        // - no early digits in words 2-6 (context_missing rule)
        // - no 3+ same-meaning-family bullets
        const cv = makeCV([makeRole([
            'Built the event-driven microservices platform from scratch.',
            'In Q2 2021, launched the mobile application across five markets.',
            'Partnering with the product team to define the roadmap and OKRs.',
            'Led the migration from a monolith to containerised services on AWS.',
            'Overhauled the deployment pipeline to eliminate rollback failures entirely.',
            'Across the engineering org, standardised on a shared component library.',
        ])]);
        const report = auditStyleGovernance(cv);
        expect(report.totalIssues).toBe(0);
        expect(report.issues).toHaveLength(0);
    });
});

// ─── opener_category_monotone ─────────────────────────────────────────────────

describe('opener_category_monotone', () => {
    it('fires when 3+ consecutive bullets share the same opener category', () => {
        const cv = makeCV([makeRole([
            'Built microservices platform for global traffic.',
            'Developed authentication module using OAuth 2.0.',
            'Designed database schema for the new billing system.',
            'Shipped 12 major features in 18 months with zero incidents.',
            'Architected a caching layer reducing DB load by 60%.',
        ])]);
        const report = auditStyleGovernance(cv);
        const monotone = report.issues.filter(i => i.kind === 'opener_category_monotone');
        expect(monotone.length).toBeGreaterThan(0);
    });

    it('does not fire when openers alternate categories', () => {
        const cv = makeCV([makeRole([
            'Built the event-driven microservices platform.',
            '3 patents filed in 2024 covering ML inference.',
            'Across 5 regions, standardised the deployment pipeline.',
            'Led the migration from a monolith to AWS ECS.',
            'In Q2 2022, launched the mobile product across EMEA.',
            '$500K in cost savings through infrastructure optimisation.',
        ])]);
        const report = auditStyleGovernance(cv);
        const monotone = report.issues.filter(i => i.kind === 'opener_category_monotone');
        expect(monotone).toHaveLength(0);
    });

    it('does not fire for a role with fewer than 3 bullets', () => {
        const cv = makeCV([makeRole([
            'Built the platform.',
            'Designed the architecture.',
        ])]);
        const report = auditStyleGovernance(cv);
        const monotone = report.issues.filter(i => i.kind === 'opener_category_monotone');
        expect(monotone).toHaveLength(0);
    });
});

// ─── all_verb_led ──────────────────────────────────────────────────────────────

describe('all_verb_led', () => {
    it('fires when >85% of bullets are verb-led in a role with ≥4 bullets', () => {
        const cv = makeCV([makeRole([
            'Built microservices platform for global traffic.',
            'Designed database schema for billing system.',
            'Reduced API latency by 40% through optimisation.',
            'Led a cross-functional team of 8 engineers.',
            'Shipped 12 major features with zero incidents.',
            'Managed relationships with 20+ enterprise clients.',
        ])]);
        const report = auditStyleGovernance(cv);
        const verbLed = report.issues.filter(i => i.kind === 'all_verb_led');
        expect(verbLed.length).toBeGreaterThan(0);
        expect(verbLed[0].severity).toBe('warn');
    });

    it('does not fire when a role has fewer than 4 bullets', () => {
        const cv = makeCV([makeRole([
            'Built the platform.',
            'Designed the architecture.',
            'Led the team.',
        ])]);
        const report = auditStyleGovernance(cv);
        const verbLed = report.issues.filter(i => i.kind === 'all_verb_led');
        expect(verbLed).toHaveLength(0);
    });

    it('does not fire when 2+ bullets use non-verb openers', () => {
        const cv = makeCV([makeRole([
            'Built microservices platform for global traffic.',
            '$500K savings in first year through infrastructure work.',
            'Designed database schema for billing system.',
            'Across 5 regions, standardised deployment pipeline.',
            'Led cross-functional team of 8 engineers.',
        ])]);
        const report = auditStyleGovernance(cv);
        const verbLed = report.issues.filter(i => i.kind === 'all_verb_led');
        expect(verbLed).toHaveLength(0);
    });
});

// ─── verb_cluster_dominance ───────────────────────────────────────────────────

describe('verb_cluster_dominance', () => {
    it('fires when one semantic verb cluster exceeds 50% of role bullets', () => {
        const cv = makeCV([makeRole([
            'Led the data engineering team across 3 squads.',
            'Managed a portfolio of 15 enterprise accounts.',
            'Directed the product roadmap for the core platform.',
            'Supervised 6 junior engineers over 18 months.',
            '$500K in cost savings through infrastructure optimisation.',
        ])]);
        const report = auditStyleGovernance(cv);
        const dominance = report.issues.filter(i => i.kind === 'verb_cluster_dominance');
        expect(dominance.length).toBeGreaterThan(0);
        expect(dominance[0].detail).toContain('leadership');
    });

    it('does not fire for roles with fewer than 4 bullets', () => {
        const cv = makeCV([makeRole([
            'Led the team.',
            'Managed the project.',
            'Directed the roadmap.',
        ])]);
        const report = auditStyleGovernance(cv);
        expect(report.issues.filter(i => i.kind === 'verb_cluster_dominance')).toHaveLength(0);
    });

    it('does not fire when no cluster dominates', () => {
        const cv = makeCV([makeRole([
            'Built the platform.',
            'Led the cross-functional team.',
            'Analysed the performance data and reduced latency.',
            'Presented findings to the executive committee.',
            'In Q2, launched mobile app across EMEA.',
        ])]);
        const report = auditStyleGovernance(cv);
        expect(report.issues.filter(i => i.kind === 'verb_cluster_dominance')).toHaveLength(0);
    });
});

// ─── bare_metric_opener ───────────────────────────────────────────────────────

describe('bare_metric_opener', () => {
    it('fires for a bullet that opens with a digit-scaled metric and is ≥8 words', () => {
        const cv = makeCV([makeRole([
            '40% increase in deployment frequency achieved through pipeline automation.',
            'Built the CI/CD infrastructure supporting the new release cadence.',
        ])]);
        const report = auditStyleGovernance(cv);
        const bare = report.issues.filter(i => i.kind === 'bare_metric_opener');
        expect(bare.length).toBeGreaterThan(0);
        expect(bare[0].severity).toBe('info');
    });

    it('does not fire for a short factual bullet (≤7 words)', () => {
        const cv = makeCV([makeRole([
            '3 patents filed in 2024.',
            'Built the payments platform from scratch.',
        ])]);
        const report = auditStyleGovernance(cv);
        expect(report.issues.filter(i => i.kind === 'bare_metric_opener')).toHaveLength(0);
    });

    it('fires for a currency-first metric bullet', () => {
        const cv = makeCV([makeRole([
            '$2M generated through new enterprise contract negotiations in EMEA.',
            'Built the account management framework that enabled the deals.',
        ])]);
        const report = auditStyleGovernance(cv);
        const bare = report.issues.filter(i => i.kind === 'bare_metric_opener');
        expect(bare.length).toBeGreaterThan(0);
    });
});

// ─── context_missing ─────────────────────────────────────────────────────────

describe('context_missing', () => {
    it('fires when a metric appears too early after a verb opener', () => {
        const cv = makeCV([makeRole([
            'Increased revenue by 40% in the first half of the fiscal year.',
            'Built the microservices architecture underpinning the platform.',
        ])]);
        const report = auditStyleGovernance(cv);
        const ctx = report.issues.filter(i => i.kind === 'context_missing');
        expect(ctx.length).toBeGreaterThan(0);
        expect(ctx[0].severity).toBe('info');
    });

    it('does not fire when a context clause separates the verb from the metric', () => {
        // context_missing checks words 2-6 for any digit token.
        // To avoid false positives, ensure the metric only appears after word 6.
        const cv = makeCV([makeRole([
            'Rebuilt the pricing engine by rewriting the core algorithm from scratch, increasing conversion considerably.',
            'Led the infrastructure migration across all regions, achieving a dramatic latency reduction enterprise-wide.',
        ])]);
        const report = auditStyleGovernance(cv);
        expect(report.issues.filter(i => i.kind === 'context_missing')).toHaveLength(0);
    });

    it('does not fire for short bullets (≤7 words)', () => {
        const cv = makeCV([makeRole([
            'Reduced churn by 10%.',
        ])]);
        const report = auditStyleGovernance(cv);
        expect(report.issues.filter(i => i.kind === 'context_missing')).toHaveLength(0);
    });

    it('does not fire when bullet starts with a digit (number opener, not verb)', () => {
        const cv = makeCV([makeRole([
            '40% reduction in deployment failures achieved in Q3 2023 through CI/CD hardening.',
        ])]);
        const report = auditStyleGovernance(cv);
        expect(report.issues.filter(i => i.kind === 'context_missing')).toHaveLength(0);
    });
});

// ─── meaning_cluster_repetition ───────────────────────────────────────────────

describe('meaning_cluster_repetition', () => {
    it('fires when the same outcome meaning appears 3+ times in a role', () => {
        const cv = makeCV([makeRole([
            'Improved the deployment pipeline to reduce rollback time.',
            'Enhanced the monitoring stack for better incident detection.',
            'Optimised the database queries to reduce P99 latency.',
            'Refined the CI/CD process for faster iteration cycles.',
        ])]);
        const report = auditStyleGovernance(cv);
        const rep = report.issues.filter(i => i.kind === 'meaning_cluster_repetition');
        expect(rep.length).toBeGreaterThan(0);
        expect(rep[0].detail).toContain('improvement');
    });

    it('does not fire for roles with fewer than 3 bullets', () => {
        const cv = makeCV([makeRole([
            'Improved pipeline reliability.',
            'Enhanced monitoring coverage.',
        ])]);
        const report = auditStyleGovernance(cv);
        expect(report.issues.filter(i => i.kind === 'meaning_cluster_repetition')).toHaveLength(0);
    });

    it('does not fire when each bullet expresses a different outcome family', () => {
        const cv = makeCV([makeRole([
            'Built the event-driven microservices platform from scratch.',
            'Led the cross-functional team of 8 engineers.',
            'Reduced API latency by 40% through profiling and caching.',
            'In Q2, launched the mobile app across 5 EMEA markets.',
            'Partnering with product to define OKRs and the quarterly roadmap.',
        ])]);
        const report = auditStyleGovernance(cv);
        expect(report.issues.filter(i => i.kind === 'meaning_cluster_repetition')).toHaveLength(0);
    });
});

// ─── report shape and metadata ────────────────────────────────────────────────

describe('auditStyleGovernance — report shape', () => {
    it('returns a valid report object with all required fields', () => {
        const cv = makeCV([]);
        const report = auditStyleGovernance(cv);
        expect(report).toHaveProperty('issues');
        expect(report).toHaveProperty('totalIssues');
        expect(report).toHaveProperty('issuesByKind');
        expect(report).toHaveProperty('durationMs');
        expect(typeof report.durationMs).toBe('number');
    });

    it('issuesByKind counts match the issues array', () => {
        const cv = makeCV([makeRole([
            'Built microservices platform.',
            'Designed database schema.',
            'Reduced API latency by 40% across all services.',
            'Led a cross-functional team of 8 engineers.',
            'Shipped 12 major features with zero incidents.',
            'Managed relationships with 20+ enterprise clients.',
        ])]);
        const report = auditStyleGovernance(cv);
        let total = 0;
        for (const count of Object.values(report.issuesByKind)) total += count;
        expect(total).toBe(report.totalIssues);
    });

    it('skips roles with fewer than 2 bullets', () => {
        const cv = makeCV([makeRole(['Single bullet.'])]);
        const report = auditStyleGovernance(cv);
        expect(report.totalIssues).toBe(0);
    });

    it('handles a CV with empty experience array gracefully', () => {
        expect(() => auditStyleGovernance(makeCV([]))).not.toThrow();
    });

    it('fieldLocation uses the correct index format', () => {
        const cv = makeCV([makeRole([
            'Built microservices.',
            'Designed schema.',
            'Reduced latency.',
            'Led team.',
            'Shipped features.',
            'Managed clients.',
        ])]);
        const report = auditStyleGovernance(cv);
        for (const issue of report.issues) {
            expect(issue.fieldLocation).toMatch(/^experience\[\d+\]\.responsibilities$/);
        }
    });

    it('each issue has a where string identifying the role', () => {
        const cv = makeCV([makeRole([
            'Built microservices.',
            'Designed schema.',
            'Reduced latency.',
            'Led team.',
            'Shipped features.',
            'Managed clients.',
        ])]);
        const report = auditStyleGovernance(cv);
        for (const issue of report.issues) {
            expect(issue.where).toContain('Senior Engineer');
            expect(issue.where).toContain('Acme Corp');
        }
    });
});

// ─── multi-role CV ────────────────────────────────────────────────────────────

describe('auditStyleGovernance — multi-role CV', () => {
    it('audits all roles independently', () => {
        const cv = makeCV([
            makeRole([
                'Built microservices platform.',
                'Designed schema.',
                'Reduced latency.',
                'Led team.',
                'Shipped features.',
                'Managed clients.',
            ], '2022-01-01'),
            {
                jobTitle: 'Junior Engineer',
                company: 'StartupXYZ',
                dates: '2018 – 2020',
                startDate: '2018-01-01',
                endDate: '2020-01-01',
                responsibilities: [
                    'In Q1 2019, launched initial product to 500 beta users.',
                    'Partnering with design to build the first onboarding flow.',
                    '$50K in seed revenue generated in the first 3 months.',
                    'As the sole engineer, owned the entire backend infrastructure.',
                    'Built REST API consumed by the mobile client application.',
                ],
            },
        ]);
        const report = auditStyleGovernance(cv);
        // Each role is checked independently — issues from both roles aggregate
        expect(Array.isArray(report.issues)).toBe(true);
        for (const issue of report.issues) {
            expect(['Senior Engineer @ Acme Corp', 'Junior Engineer @ StartupXYZ']).toContain(issue.where);
        }
    });
});
