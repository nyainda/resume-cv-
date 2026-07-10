// utils/cvCompleteness.ts
// Calculates a CV completeness percentage based on filled fields.
// Used to guide users towards a stronger, ATS-ready CV.

import { CVData } from '../types';
import { UserProfile } from '../types';

export interface CompletenessResult {
    percent: number;        // 0–100
    missing: string[];      // Human-readable list of what's missing
    grade: 'weak' | 'fair' | 'good' | 'strong';
}

interface CheckItem {
    label: string;
    weight: number;
    filled: boolean;
}

export function scoreCVCompleteness(cv: CVData | null, profile: UserProfile | null): CompletenessResult {
    const checks: CheckItem[] = [
        // Profile / personal info
        { label: 'Full name',        weight: 5,  filled: !!(profile?.personalInfo?.name?.trim()) },
        { label: 'Email address',    weight: 5,  filled: !!(profile?.personalInfo?.email?.trim()) },
        { label: 'Phone number',     weight: 3,  filled: !!(profile?.personalInfo?.phone?.trim()) },
        { label: 'Location / city',  weight: 3,  filled: !!(profile?.personalInfo?.location?.trim()) },
        { label: 'LinkedIn URL',     weight: 4,  filled: !!(profile?.personalInfo?.linkedin?.trim()) },

        // CV content
        { label: 'Professional summary', weight: 10, filled: !!(cv?.summary?.trim() && cv.summary.length > 30) },
        // Note: forms seed these arrays with one placeholder entry (all fields
        // blank) so users have a row to type into. Checking `.length` alone
        // would count that empty placeholder as "filled" and hand out points
        // for nothing — every check below requires actual non-empty content.
        { label: 'Work experience',      weight: 20, filled: !!(cv?.experience?.some(e => e.company?.trim() || e.jobTitle?.trim())) },
        { label: 'Education',            weight: 10, filled: !!(cv?.education?.some(e => e.degree?.trim() || e.school?.trim())) },
        { label: 'Skills (at least 5)',  weight: 10, filled: (Array.isArray(cv?.skills) ? cv.skills.filter(s => typeof s === 'string' && s.trim()).length : 0) >= 5 },
        { label: 'Projects',             weight: 8,  filled: !!(cv?.projects?.some(p => p.name?.trim())) },
        { label: 'Languages',            weight: 5,  filled: !!(cv?.languages?.some(l => l.name?.trim())) },

        // Quality checks
        {
            label: 'Experience with bullet points',
            weight: 10,
            filled: !!(cv?.experience?.some(e => e.responsibilities?.length > 0)),
        },
        {
            label: 'Experience dates',
            weight: 4,
            filled: !!(cv?.experience?.some(e => e.startDate?.trim())),
        },
        {
            label: 'Education institution',
            weight: 3,
            filled: !!(cv?.education?.some(e => e.institution?.trim())),
        },
    ];

    const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
    const earnedWeight = checks.filter(c => c.filled).reduce((sum, c) => sum + c.weight, 0);
    const percent = Math.round((earnedWeight / totalWeight) * 100);
    const missing = checks.filter(c => !c.filled).map(c => c.label);

    const grade: CompletenessResult['grade'] =
        percent >= 85 ? 'strong' :
        percent >= 65 ? 'good' :
        percent >= 40 ? 'fair' : 'weak';

    return { percent, missing, grade };
}
