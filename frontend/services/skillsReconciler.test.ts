import { describe, expect, it } from 'vitest';
import {
    inferSkillSeniority,
    reconcileSkills,
} from './skillsReconciler';

describe('reconcileSkills seniority-aware ordering', () => {
    it('keeps JD-confirmed skills ahead of defaults, including generic defaults', () => {
        const result = reconcileSkills(
            ['Agile', 'Roadmap Strategy', 'TypeScript', 'Scrum'],
            ['TypeScript'],
            ['Built TypeScript services'],
            undefined,
            false,
            { seniority: 'senior' },
        );

        expect(result.finalSkills.slice(0, 4)).toEqual([
            'TypeScript',
            'Roadmap Strategy',
            'Agile',
            'Scrum',
        ]);
    });

    it('uses stronger scope signals before foundational defaults for senior candidates', () => {
        const result = reconcileSkills(
            ['Agile', 'Architecture', 'Scrum', 'Stakeholder Management', 'Python'],
            [],
            [],
            undefined,
            false,
            { seniority: 'senior' },
        );

        expect(result.finalSkills).toEqual([
            'Architecture',
            'Stakeholder Management',
            'Python',
            'Agile',
            'Scrum',
        ]);
    });

    it('does not apply senior demotion to junior candidates', () => {
        const result = reconcileSkills(
            ['Agile', 'Architecture', 'Scrum'],
            [],
            [],
            undefined,
            false,
            { seniority: 'junior' },
        );

        expect(result.finalSkills).toEqual(['Agile', 'Architecture', 'Scrum']);
    });

    it('keeps JD-only output limited to JD-relevant skills', () => {
        const result = reconcileSkills(
            ['Agile', 'TypeScript'],
            ['TypeScript', 'React'],
            ['Built TypeScript and React applications'],
            undefined,
            true,
            { seniority: 'senior' },
        );

        expect(result.finalSkills).toEqual(['TypeScript', 'React']);
        expect(result.finalSkills).not.toContain('Agile');
    });
});

describe('inferSkillSeniority', () => {
    it('recognizes a senior-level profile from experience duration', () => {
        expect(inferSkillSeniority([
            { jobTitle: 'Software Engineer', startDate: '2017-01-01', endDate: '2025-01-01' },
        ])).toBe('senior');
    });

    it('recognizes executive titles only when supported by experience', () => {
        expect(inferSkillSeniority([
            { jobTitle: 'Director of Product', startDate: '2014-01-01', endDate: '2025-01-01' },
        ])).toBe('executive');
    });
});