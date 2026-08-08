/**
 * Job description keyword analysis.
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

