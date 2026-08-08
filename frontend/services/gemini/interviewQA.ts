/**
 * Interview Q&A generation.
 */

import { UserProfile, CVData, PersonalInfo, JobAnalysisResult, EnhancedJobAnalysis } from '../../types';
import { groqChat, GROQ_LARGE, GROQ_FAST } from '../groqService';
import {
  SYSTEM_INSTRUCTION_PROFESSIONAL,
  SYSTEM_INSTRUCTION_PARSER,
  HUMANIZATION_CHECKLIST,
  CV_DATA_SCHEMA,
} from './rulesState';
import { compactProfile, smartTruncateJD } from './profileSerialize';
import { purifyProfile, purifyText, purifyInboundCV, purifyCV, type PurifyReport } from '../cvPurificationPipeline';

export const generateInterviewQA = async (
    profile: UserProfile,
    jd: string,
    companyName?: string,
    count: number = 10
): Promise<Array<{ question: string; answer: string; category: string }>> => {
    const jdCapped = jd.substring(0, 2000);
    const company = companyName || 'the company';
    const n = Math.max(5, Math.min(20, count));
    // Distribute categories proportionally
    const behav = Math.max(1, Math.round(n * 0.2));
    const tech   = Math.max(1, Math.round(n * 0.2));
    const sit    = Math.max(1, Math.round(n * 0.2));
    const cult   = Math.max(1, Math.round(n * 0.2));
    const str    = n - behav - tech - sit - cult;
    const prompt = `
You are an expert interview coach preparing a candidate for a specific job interview.

CANDIDATE PROFILE (compact):
${compactProfile(profile)}

JOB DESCRIPTION:
${jdCapped}

TARGET COMPANY: ${company}

Generate exactly ${n} tailored interview questions with model answers. Questions must be specific to this role and company — NOT generic. Mix these categories:
- ${behav} Behavioural (STAR format — "Tell me about a time when...")
- ${tech} Technical / Role-specific (test core skills from JD)
- ${sit} Situational (hypothetical scenarios from the JD)
- ${cult} Culture / Motivation (why this company, role, why now)
- ${str} Strength / Weakness probes (digging into the CV)

For each question, write a TAILORED model answer based on the candidate's ACTUAL experience. Reference real companies, skills, and achievements from their profile. Model answers should be 3–5 sentences.

Return ONLY a JSON array of ${n} objects:
[{ "question": "string", "answer": "string", "category": "Behavioural|Technical|Situational|Culture|Strength" }]
`;
    const tokens = Math.min(4000, n * 350);
    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { task: 'coaching', temperature: 0.6, json: true, maxTokens: tokens });
    return JSON.parse(text.trim());
};

// ─── D1 JD analysis cache ─────────────────────────────────────────────────────

const _JD_CACHE_ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';
const _JD_CACHE_TIMEOUT_MS = 3500;

/**
 * Collision-resistant SHA-256 hash for D1 cache keys.
 * Returns the first 16 hex chars of the digest — 64-bit key space, negligible
 * collision risk vs the 32-bit djb2 quickHash previously used here.
 * Falls back to quickHash if SubtleCrypto is unavailable (SSR / very old browsers).
 */
async function sha256CacheKey(input: string): Promise<string> {
    try {
        const encoded = new TextEncoder().encode(input);
        const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
        const hex = Array.from(new Uint8Array(hashBuf))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return hex.slice(0, 16);
    } catch {
        return quickHash(input);
    }
}

/** Check D1 cache for a prior JD analysis result. Returns null on miss or any error. */
async function checkJdAnalysisCache(jdHash: string): Promise<JobAnalysisResult | null> {
    if (!_JD_CACHE_ENGINE_URL) return null;
    try {
        const res = await fetch(
            `${_JD_CACHE_ENGINE_URL}/api/cv/jd-analysis?key=${encodeURIComponent(jdHash)}`,
            { signal: AbortSignal.timeout(_JD_CACHE_TIMEOUT_MS) },
        );
        if (!res.ok) return null;
        const data = await res.json() as { found?: boolean; result?: JobAnalysisResult };
        if (!data.found || !data.result) return null;
        console.log('[JD Analysis Cache] Hit — skipping AI call');
        return data.result;
    } catch {
        return null;
    }
}

/** Store a JD analysis result in D1 — fire-and-forget, never blocks generation. */
function storeJdAnalysisCache(jdHash: string, result: JobAnalysisResult): void {
    if (!_JD_CACHE_ENGINE_URL) return;
    fetch(`${_JD_CACHE_ENGINE_URL}/api/cv/jd-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: jdHash, result_json: JSON.stringify(result) }),
        signal: AbortSignal.timeout(5000),
    }).catch(() => {});
}

// ── HR-compliant application email generator ────────────────────────────────
// Rules based on recruiter research:
// • 150-200 word body — recruiters spend ~7 seconds scanning
// • Never open with "I am writing to apply" or any cliché
// • One concrete metric / achievement in the body
// • Reference the specific role and company
// • Clear CTA in the closing line
// • No banned phrases (same list as cover letter)
// Curated tone presets for the email composer.
// Each maps a user-facing label to a tone instruction injected into the prompt.
