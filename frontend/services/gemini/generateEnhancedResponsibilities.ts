/**
 * Field-level AI enhancers: summary, responsibilities, achievements, projects.
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

import { _getBannedPhrasesForPrompt } from './bannedPhrasesPrompt';
export const generateEnhancedResponsibilities = async (jobTitle: string, company: string, currentResponsibilities: string, jobDescription?: string, duration?: string, pointCount: number = 5): Promise<string> => {
    const banned = await _getBannedPhrasesForPrompt();
    const prompt = `
      You are an expert resume writer and career coach specializing in creating HIGH-IMPACT, ATS-OPTIMIZED bullet points.
      
      **Goal:** Transform the user's responsibilities into strong, credible achievement bullets grounded in the draft provided. Keep all real numbers, dates, and specifics exactly as given.

      **Input Context:**
      - **Role:** ${jobTitle} at ${company}
      - **Duration/Tenure:** ${duration || "Not specified"}
      - **Target Job Description (JD):** ${jobDescription ? jobDescription.substring(0, 500) + '...' : "None provided"}
      - **Current Draft:** "${currentResponsibilities}"
      - **REQUIRED BULLET COUNT: EXACTLY ${pointCount} bullet points** — no more, no fewer.

      **Instructions:**
      1. **Reframe from the draft:** Use only facts, numbers, and scope present in the draft. Do NOT invent metrics, percentages, team sizes, or figures not in the draft.
      2. **Tailor to JD:** If a JD is provided, weave in relevant keywords naturally — never force them.
      3. **Metrics:** Surface any numbers already in the draft prominently. If no numbers are present, describe observable scope (e.g. "across 3 regions", "for 200-seat deployment") without inventing figures.
      4. **Action Verbs:** Start each bullet with a strong past-tense verb. Good examples: Led, Built, Delivered, Improved, Deployed, Designed, Managed, Reduced, Launched, Negotiated.
      5. **STRICT COUNT:** Output EXACTLY ${pointCount} bullet points.
      6. **Format:** Return ONLY the bullet points as a single string. Each point must start with a newline and the '•' character.

      **BANNED PHRASES — never use any of these:** ${banned}
      Never use approximation markers like "~", "approx.", or "roughly X%".
    `;
    const result = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, maxTokens: 900 });
    return purifyText(result.trim().replace(/^- /gm, '• '));
};

