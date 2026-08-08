/**
 * Check CV against job description.
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

// ─── CV Checker: Score CV against JD ──────────────────────────────────────────

export interface CVCheckResult {
    overallScore: number;
    atsScore: number;
    strengths: string[];
    weaknesses: string[];
    missingKeywords: string[];
    matchedKeywords: string[];
    suggestions: string[];
    summary: string;
}

export const checkCVAgainstJob = async (
    profile: UserProfile,
    jobDescription: string,
    rawCVText?: string,
): Promise<CVCheckResult> => {
    const profileText = rawCVText
        ? rawCVText.substring(0, 3000)
        : JSON.stringify(profile, null, 2).substring(0, 2000);
    const prompt = `
        You are an elite CV reviewer and ATS expert. Analyze this CV against the job description.

        ### CV DATA
        ${profileText}

        ### JOB DESCRIPTION
        ${jobDescription.substring(0, 1500)}

        ### ANALYSIS INSTRUCTIONS
        1. **overallScore** (0-100): How well does this CV match the JD?
        2. **atsScore** (0-100): How likely is this CV to pass ATS screening?
        3. **strengths** (3-5 items): What the CV does well relative to this JD.
        4. **weaknesses** (3-5 items): Critical gaps, mismatches, or problems.
        5. **missingKeywords** (5-15 items): Important keywords/skills from the JD that are NOT in the CV.
        6. **matchedKeywords** (5-15 items): Keywords/skills that appear in BOTH the CV and JD.
        7. **suggestions** (3-6 items): Specific, actionable suggestions to improve the CV for this role.
        8. **summary** (2-3 sentences): Overall assessment in plain language.

        Be brutally honest. A 100 score should be near-impossible. Most CVs score 40-70.

        Return ONLY a JSON object with this structure:
        {
          "overallScore": number,
          "atsScore": number,
          "strengths": ["string"],
          "weaknesses": ["string"],
          "missingKeywords": ["string"],
          "matchedKeywords": ["string"],
          "suggestions": ["string"],
          "summary": "string"
        }
    `;

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.2, json: true, maxTokens: 1024, task: 'cvAudit' });
    const parsed = JSON.parse(text.trim());
    return {
        overallScore:    parsed.overallScore    ?? 0,
        atsScore:        parsed.atsScore        ?? 0,
        strengths:       Array.isArray(parsed.strengths)       ? parsed.strengths       : [],
        weaknesses:      Array.isArray(parsed.weaknesses)      ? parsed.weaknesses      : [],
        missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : [],
        matchedKeywords: Array.isArray(parsed.matchedKeywords) ? parsed.matchedKeywords : [],
        suggestions:     Array.isArray(parsed.suggestions)     ? parsed.suggestions     : [],
        summary:         parsed.summary ?? '',
    };
};

