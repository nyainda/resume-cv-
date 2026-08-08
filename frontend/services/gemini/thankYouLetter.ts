/**
 * Thank-you letter generator.
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

export const generateThankYouLetter = async (
    profile: UserProfile,
    jobDescription: string,
    interviewerName?: string,
    interviewType?: string
): Promise<string> => {
    const interviewer = interviewerName?.trim() || 'the hiring team';
    const type = interviewType || 'interview';
    const name = profile.personalInfo?.name || 'Candidate';

    const prompt = `
You are a top executive career coach. Write a compelling, human-sounding post-${type} thank-you letter that stands out and reinforces the candidate's candidacy.

CANDIDATE NAME: ${name}
INTERVIEWER: ${interviewer}

CANDIDATE PROFILE:
${compactProfile(profile)}

JOB DESCRIPTION:
${jobDescription.substring(0, 1500)}

STRICT INSTRUCTIONS:
1. Start DIRECTLY with "Dear ${interviewer}," — no header block.
2. Opening (1 sentence): Thank them warmly and reference something specific from the ${type}.
3. Reinforcement paragraph: Tie one specific thing discussed to a concrete achievement from the profile. Show you were listening and thinking.
4. Value-add paragraph: Briefly mention one additional reason you are the right fit that didn't come up, or expand on something that was covered too briefly.
5. Closing (1 sentence): Express genuine enthusiasm, confirm interest, offer next steps.
6. Sign-off: "Warm regards," then the candidate's name on the next line: ${name}
7. Length: 180-250 words. Concise, human, specific.
8. Tone: Professional, warm, confident. NOT generic or gushing.
9. NO AI clichés: no "excited", "thrilled", "leverage", "passionate".
10. Return ONLY the letter text. No commentary.
`;
    return groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.7 });
};

