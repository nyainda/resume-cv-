/**
 * Profile/JD serialization helpers for prompts.
 * Extracted from geminiService — logic unchanged.
 * Nested helpers stay non-exported (e.g. strip inside compactProfile).
 */

import type { UserProfile } from '../types';
import { truncate } from '../utils/textTruncate';

// --- Compact-serialize a profile for embedding in Groq prompts.
//     Aggressively strips empty fields, redundant IDs, and oversized text to
//     keep input tokens well under Groq's per-request limits while preserving
//     all information the LLM actually needs.

export function compactProfile(profile: UserProfile, maxResponsibilityChars = 350): string {
    // Remove undefined/null/empty-string/empty-array values recursively
    function strip(obj: any): any {
        if (Array.isArray(obj)) {
            return obj.map(strip).filter(v => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0));
        }
        if (obj && typeof obj === 'object') {
            const out: any = {};
            for (const [k, v] of Object.entries(obj)) {
                // Skip internal IDs — LLM doesn't need them in the prompt
                if (k === 'id') continue;
                const stripped = strip(v);
                if (stripped !== null && stripped !== undefined && stripped !== '' && !(Array.isArray(stripped) && stripped.length === 0)) {
                    out[k] = stripped;
                }
            }
            return out;
        }
        return obj;
    }

    const p = strip({
        personalInfo: profile.personalInfo,
        // Cap skills to 20 most relevant — LLM doesn't benefit from 50+ skills
        skills: (profile.skills || []).slice(0, 20),
        // Cap projects to 6 most recent/relevant
        projects: (profile.projects || []).slice(0, 6).map(pr => ({
            name: pr.name,
            description: typeof pr.description === 'string'
                ? truncate(pr.description, 200) // LLM context budget; see textTruncate.ts for why display cap differs
                : pr.description,
            link: pr.link,
            startDate: pr.startDate,
            endDate: pr.endDate,
        })),
        workExperience: (profile.workExperience || []).map((exp, idx) => ({
            _role: `ROLE_${idx + 1}`,
            company: exp.company,
            jobTitle: exp.jobTitle,
            startDate: exp.startDate,
            endDate: exp.endDate,
            pointCount: exp.pointCount,
            responsibilities: typeof exp.responsibilities === 'string'
                ? exp.responsibilities.substring(0, maxResponsibilityChars)
                : (Array.isArray(exp.responsibilities)
                    ? (exp.responsibilities as string[]).slice(0, 6).join('\n').substring(0, maxResponsibilityChars)
                    : ''),
        })),
        education: (profile.education || []).map(edu => ({
            degree: edu.degree,
            school: edu.school,
            graduationYear: edu.graduationYear,
            description: typeof (edu as any).description === 'string'
                ? (edu as any).description.substring(0, 150)
                : undefined,
        })),
        languages: profile.languages,
        customSections: profile.customSections,
        sectionOrder: profile.sectionOrder,
    });

    return JSON.stringify(p);
}


export function slimPromptProfile(prompt: string, profile: UserProfile): string {
    const full = compactProfile(profile, 350);
    const slim = compactProfile(profile, 120);
    if (full === slim) return prompt;
    const idx = prompt.indexOf(full);
    if (idx === -1) return prompt;
    return prompt.slice(0, idx) + slim + prompt.slice(idx + full.length);
}


export function smartTruncateJD(jd: string, maxChars = 3200): string {
    const clean = (jd || '').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!clean || clean.length <= maxChars) return clean;

    // Break JD into meaningful chunks (headings, bullets, paragraphs).
    const chunks = clean
        .split(/\n+/)
        .map(s => s.trim())
        .filter(Boolean)
        .flatMap(s => s.length > 420 ? s.split(/(?<=[.;])\s+/).map(x => x.trim()).filter(Boolean) : [s]);

    const weakBoilerplate = /\b(equal opportunity|eeo|accommodation|background check|drug test|benefits|perks|about us|our culture|privacy policy|cookie|applicants with disabilities|all qualified applicants|do not discriminat\w*|authorized to work|protected status|veteran status|gender identity|sexual orientation|paid time off|pto\b|401k|401\(k\))\b/i;
    const highSignal = /\b(requirements?|qualifications?|responsibilities?|must have|nice to have|key skills?|experience with|proficient|degree|certification|tools?|tech stack|kubernetes|python|java|sql|aws|gcp|azure)\b/i;

    const scored = chunks.map((c, idx) => {
        const lower = c.toLowerCase();
        const wordCount = lower.split(/\s+/).length;
        const keywordHits = (lower.match(/\b(requirements?|qualifications?|responsibilities?|must|experience|skills?|tools?|degree|certification)\b/g) || []).length;
        const techHits = (lower.match(/\b(python|java|sql|aws|gcp|azure|kubernetes|docker|react|node|ci\/cd|terraform)\b/g) || []).length;
        const numberHits = (lower.match(/\d+/g) || []).length;
        const isWeak = weakBoilerplate.test(lower);
        let score = keywordHits * 3 + techHits * 4 + numberHits;
        if (highSignal.test(lower)) score += 8;
        if (idx < 2) score += 6; // keep role-context intro
        if (wordCount < 3) score -= 4;
        if (isWeak) score -= 14;
        return { idx, text: c, score };
    });

    // Keep highest-signal chunks, then restore original order.
    const picked = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(8, Math.ceil(scored.length * 0.55)))
        .sort((a, b) => a.idx - b.idx);

    let out = '';
    for (const p of picked) {
        if ((out + '\n' + p.text).length > maxChars) continue;
        out += (out ? '\n' : '') + p.text;
    }

    // Safety fallback if scoring discarded too much.
    if (out.length < 800) {
        const head = clean.substring(0, Math.floor(maxChars * 0.7));
        const tail = clean.substring(clean.length - Math.floor(maxChars * 0.2));
        return `${head}\n…\n${tail}`.slice(0, maxChars + 3);
    }
    return out;
}


export function jdProfileSimilarity(profile: UserProfile, jd: string): number {
    if (!jd.trim()) return 0;
    const jdTokens = new Set(
        jd.toLowerCase()
            .replace(/[^\w\s/+-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 4)
    );
    if (jdTokens.size === 0) return 0;

    const profileText = [
        ...(profile.skills || []),
        ...(profile.workExperience || []).flatMap(e => [e.jobTitle, e.company, ...(typeof e.responsibilities === 'string' ? e.responsibilities.split('\n') : (e.responsibilities || []))]),
        ...(profile.education || []).flatMap(e => [e.degree, e.school]),
    ].join(' ').toLowerCase();

    const pTokens = new Set(
        profileText.replace(/[^\w\s/+-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 4)
    );
    if (pTokens.size === 0) return 0;

    let overlap = 0;
    for (const t of pTokens) if (jdTokens.has(t)) overlap++;
    return overlap / Math.min(jdTokens.size, pTokens.size);
}

