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
export const generateEnhancedSummary = async (profileInput: UserProfile): Promise<string> => {
    const profile = purifyProfile(profileInput);
    const banned = await _getBannedPhrasesForPrompt();
    const prompt = `
      You are a professional career coach. Based STRICTLY on the provided user profile, write a concise and powerful professional summary (2-4 sentences) that highlights their key strengths and experience.
      
      **CRITICAL:** Do NOT invent skills, experiences, or achievements not present in the profile. If the profile is sparse, write a strong summary based ONLY on what is there.
      **BANNED PHRASES — never use any of these:** ${banned}
      Write in confident, direct third-person. No first-person pronouns. No clichés.
      Return only the summary text.
      USER PROFILE:
      ${compactProfile(profile)}
    `;
    const summary = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5 });
    const purified = purifyText(summary);
    // Final guard: strip any generic opener the AI snuck in despite instructions
    return purgeSummarySeekingLanguage(fixSummaryOpener(purified));
};

