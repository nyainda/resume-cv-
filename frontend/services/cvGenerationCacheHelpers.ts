/**
 * In-process CV generation cache helpers.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile, CVData, CVGenerationMode, ScholarshipFormat } from '../types';
import { cvCache as _cvCache } from './cvCache';
import { compactProfile } from './profilePromptUtils';
import { quickHash } from './telemetryService';

export function cloneCVData(data: CVData): CVData {
    try {
        return structuredClone(data);
    } catch {
        return JSON.parse(JSON.stringify(data)) as CVData;
    }
}

export function cvCacheKey(
    profile: UserProfile,
    jd: string,
    mode: string,
    purpose: string,
    opts?: {
        targetLanguage?: string;
        scholarshipFormat?: ScholarshipFormat;
        marketResearch?: MarketResearchResult | null;
        /** Confirmed-missing ATS keywords to pin — included so gap-targeted runs cache separately. */
        targetKeywords?: string[];
    }
): string {
    const profileSnap = {
        name: profile.personalInfo?.name,
        title: profile.personalInfo?.title,
        location: profile.personalInfo?.location,
        summary: profile.summary,
        exp: (profile.workExperience || []).map(e => `${e.jobTitle}@${e.company}:${e.startDate}-${e.endDate}`),
        edu: (profile.education || []).map(e => `${e.degree}@${e.school}`),
        skills: [...(profile.skills || [])].sort(),
        projects: (profile.projects || []).map(p => `${p.name}|${p.description || ''}`),
        sectionOrder: profile.sectionOrder || [],
        customSections: (profile.customSections || []).map(s => ({
            label: s.label,
            items: (s.items || []).map(i => i.title),
        })),
    };
    const profileHash = quickHash(JSON.stringify(profileSnap));
    const jdHash = quickHash((jd || '').replace(/\s+/g, ' ').trim());
    const marketHash = opts?.marketResearch ? quickHash(JSON.stringify(opts.marketResearch)) : 'none';
    const kwHash = (opts?.targetKeywords?.length)
        ? quickHash([...(opts.targetKeywords)].sort().join(','))
        : 'none';
    return [
        `v${CV_RULES_VERSION}`,
        `p:${profileHash}`,
        `jd:${jdHash}`,
        `m:${mode}`,
        `purpose:${purpose}`,
        `lang:${opts?.targetLanguage || 'default'}`,
        `scholarship:${opts?.scholarshipFormat || 'standard'}`,
        `market:${marketHash}`,
        `kw:${kwHash}`,
    ].join('|');
}

export function cvCacheGet(key: string): CVData | null {
    const entry = cvCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CV_CACHE_TTL_MS) { cvCache.delete(key); return null; }
    return cloneCVData(entry.result);
}

export function cvCacheSet(key: string, result: CVData): void {
    if (cvCache.size >= CV_CACHE_MAX) {
        // Evict the oldest entry
        const oldest = [...cvCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        if (oldest) cvCache.delete(oldest[0]);
    }
    cvCache.set(key, { result: cloneCVData(result), ts: Date.now() });
}

