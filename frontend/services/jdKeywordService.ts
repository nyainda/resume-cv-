/**
 * Job description keyword analysis + D1 cache helpers.
 * Extracted from geminiService — logic unchanged.
 */

import type { JobAnalysisResult } from '../types';
import { groqChat, GROQ_FAST } from './groqService';
import { SYSTEM_INSTRUCTION_PARSER } from './pipelineRules';
import { quickHash } from './telemetryService';

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

export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    // Check D1 cache first — same JD text always produces the same result so
    // we can skip the AI call entirely on repeated generations.
    // SHA-256 (first 16 hex chars) is used instead of quickHash (djb2 32-bit)
    // to eliminate collision risk — two different JDs mapping to the same key
    // would return a cached analysis for the wrong job.
    const jdSnippet = jobDescription.substring(0, 1500);
    const jdHash = await sha256CacheKey(jdSnippet.replace(/\s+/g, ' ').trim());
    const cached = await checkJdAnalysisCache(jdHash);
    if (cached) return cached;

    const prompt = `
        Analyze the following job description with the goal of strategic resume tailoring. 
        1. Extract the top 10 most important technical keywords (specific technologies, tools, platforms, methodologies like Agile).
        2. Extract the top 10 essential soft skills and non-technical abilities (communication, leadership, business acumen).
        3. Identify the name of the Company or Organization hiring. If it is not explicitly stated, return "Unknown".
        4. Identify the specific Job Title or Position being advertised. If it's not clear, return "General Application".

        JOB DESCRIPTION:
        ${jobDescription.substring(0, 1500)}

        Return ONLY a JSON object with this structure:
        {
          "keywords": ["string"],
          "skills": ["string"],
          "companyName": "string",
          "jobTitle": "string"
        }
    `;

    const stripFencesJd = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    // Route through the selected provider only — no internal fallback.
    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true, maxTokens: 512 });
    const result = JSON.parse(stripFencesJd(text));
    storeJdAnalysisCache(jdHash, result);
    return result;
};
