/**
 * CV score / match analysis.
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

// ── CV Score / Match Analysis ─────────────────────────────────────────────────
export interface CVScore {
    overall: number;
    ats: number;
    impact: number;
    relevance: number;
    clarity: number;
    missingKeywords: string[];
    strengths: string[];
    improvements: string[];
    verdict: string;
}

export const scoreCV = async (cvData: CVData, jobDescription: string): Promise<CVScore> => {
    const cvText = [
        cvData.summary,
        ...cvData.experience.flatMap(e => [e.jobTitle, e.company, ...e.responsibilities]),
        ...cvData.skills,
        ...cvData.education.map(e => `${e.degree} ${e.school}`),
        ...(cvData.projects || []).map(p => p.description),
    ].join(' ').substring(0, 2000);

    const prompt = `
You are an expert ATS system and senior hiring manager scoring a CV against a job description.

CV TEXT:
${cvText}

JOB DESCRIPTION:
${jobDescription.substring(0, 1200)}

Scoring rubric:
- "ats" (0-100): How many of the JD's key terms/phrases appear in the CV?
- "impact" (0-100): What % of bullet points have a quantified result?
- "relevance" (0-100): How closely does the candidate's experience/skills match the role requirements?
- "clarity" (0-100): Is the writing concise, free of clichés, and easy to skim?
- "overall" (0-100): Weighted average — ats×0.35 + impact×0.25 + relevance×0.30 + clarity×0.10.
- "missingKeywords": List up to 8 important JD keywords/phrases NOT found in the CV.
- "strengths": Exactly 2 specific things this CV does well.
- "improvements": Exactly 3 specific, immediately actionable fixes.
- "verdict": One punchy sentence a recruiter would say about this CV.

Return ONLY a JSON object:
{
  "overall": number,
  "ats": number,
  "impact": number,
  "relevance": number,
  "clarity": number,
  "missingKeywords": ["string"],
  "strengths": ["string"],
  "improvements": ["string"],
  "verdict": "string"
}
`;

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.2, json: true, maxTokens: 900 });
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let raw: CVScore;
    try {
        raw = JSON.parse(stripped) as CVScore;
    } catch {
        // Attempt basic repair: close open strings, strip trailing commas, close brackets
        const repaired = stripped
            .replace(/,\s*"[^"]*$/, '')
            .replace(/[,:\s]+$/, '')
            .replace(/\}\s*$/, '') + '}';
        try { raw = JSON.parse(repaired) as CVScore; }
        catch { throw new Error('Could not parse score response — please try again.'); }
    }

    // Sanitize: ensure no field contains a raw JSON string (LLM sometimes wraps a
    // value in {} or []) — strip anything that looks like a JSON object/array dump
    const cleanStr = (v: unknown): string => {
        if (typeof v !== 'string') return '';
        const t = v.trim();
        if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) return '';
        return t;
    };
    const cleanArr = (arr: unknown[]): string[] =>
        (arr || []).map(cleanStr).filter(Boolean);

    return {
        ...raw,
        verdict: cleanStr(raw.verdict) || 'Score computed.',
        strengths:       cleanArr(raw.strengths),
        improvements:    cleanArr(raw.improvements),
        missingKeywords: cleanArr(raw.missingKeywords),
    } as CVScore;
};

