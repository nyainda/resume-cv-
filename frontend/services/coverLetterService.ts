/**
 * Cover letter generation (standard + smart + thank-you).
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile } from '../types';
import { groqChat, groqChatStream, GROQ_LARGE, GROQ_FAST, getSelectedProvider } from './groqService';
import { purifyProfile, purifyText } from './cvPurificationPipeline';
import { compactProfile } from './profilePromptUtils';
import { buildBrief, workerTieredLLM } from './cvEngineClient';
import {
  SYSTEM_INSTRUCTION_PROFESSIONAL,
  SYSTEM_INSTRUCTION_HUMANIZER,
} from './pipelineRules';

export const generateCoverLetter = async (
    profileInput: UserProfile,
    jobDescription: string,
    onChunk?: (delta: string) => void,
): Promise<string> => {
    const profile = purifyProfile(profileInput);
    const name = profile.personalInfo?.name || 'Applicant';

    // 3.5 — Cover letter brief injection.
    // Fire buildBrief in parallel with prompt construction (zero added latency on
    // a miss). If the worker is unreachable, briefResult stays null and we fall
    // back to the prompt-only path with no degradation.
    const briefPromise = buildBrief({
        jd: jobDescription,
        profile: profile as unknown,
        section: 'summary',
    }).catch(() => null);

    // Build the base prompt while the brief fetches concurrently.
    const [brief] = await Promise.all([briefPromise]);

    // Compose a voice block only when the brief resolved successfully.
    let voiceBriefBlock = '';
    if (brief?.voice?.primary) {
        const v = brief.voice.primary;
        const extraForbidden = (brief.forbidden_phrases || []).slice(0, 10).join(', ');
        voiceBriefBlock = `
### VOICE BRIEF (match this throughout the letter)
- Voice profile: ${v.name} — ${v.tone}
- Verbosity target: ${v.verbosity_level <= 2 ? 'terse and punchy' : v.verbosity_level >= 4 ? 'expansive and narrative' : 'balanced'} (level ${v.verbosity_level}/5)
- Metric preference: ${v.metric_preference}${extraForbidden ? `\n- Additional banned phrases (same list used for the CV): ${extraForbidden}` : ''}

This voice must be consistent with the candidate's CV — they should read like the same person wrote both documents.
`;
    }

    const prompt = `
You are a professional ghostwriter who writes winning cover letters for competitive roles. Your output is always polished, specific, and human — never generic or AI-sounding.

### APPLICANT
Name: ${name}
${voiceBriefBlock}
### PROFILE (for content and achievements only)
${compactProfile(profile)}

### JOB DESCRIPTION
${jobDescription || 'General application — highlight the strongest transferable skills and most recent impactful achievement.'}

### MANDATORY OUTPUT RULES — EVERY RULE IS NON-NEGOTIABLE

1. **WORD COUNT**: Write EXACTLY 200–240 words for the ENTIRE letter body (from salutation to the applicant's name on the last line). Count every word carefully. This must fit on one A4 page — precision matters.

2. **NO LETTERHEAD OR HEADERS**: Do NOT include name, address, date, or contact info. The template handles this. Start DIRECTLY with the salutation.

3. **SALUTATION**: "Dear Hiring Manager," — use a specific name only if clearly stated in the JD.

4. **FOUR TIGHT PARAGRAPHS**:
   - **Opening** (~45 words): Lead with a bold hook — a specific result, a scoped claim, or a compelling value statement. Name the role and company. DO NOT open with "I", "I am writing", or any cliché.
   - **Body 1** (~55 words): One specific achievement with a concrete metric (number, %, $ amount, team size, or measurable outcome) that directly addresses a top JD requirement.
   - **Body 2** (~55 words): A second accomplishment or skill that demonstrates cultural or technical fit. Weave in JD keywords naturally — no forced stuffing.
   - **Closing** (~45 words): One sentence restating fit, then a clear CTA: "I would welcome the opportunity to discuss how I can contribute to [Company/Team]." Never use "I look forward to hearing from you" as a standalone closer.

5. **SIGN-OFF**: End with exactly:
   Sincerely,
   ${name}

6. **BANNED — NEVER USE ANY OF THESE**:
   "I am writing to apply", "I am passionate about", "excited to leverage", "team player", "self-starter", "results-driven", "detail-oriented", "dynamic professional", "proven track record", "fast learner", "go-getter", "synergize", "utilize", "delve", "please find attached", "to whom it may concern", "I look forward to hearing from you" (as a standalone sentence)

7. **TONE**: Confident, direct, human. Vary sentence length. Maximum one "I" per sentence. No filler words. No sycophancy.

8. **METRIC REQUIREMENT**: The letter MUST contain at least one specific number, percentage, dollar figure, or concrete measurable outcome in the body paragraphs.

9. **RETURN FORMAT**: Plain text ONLY. No markdown, no bold, no bullet points, no headers, no commentary. Start with "Dear Hiring Manager," and end with the applicant's name.
    `;

    let letter: string | null = null;
    if (getSelectedProvider() === 'workers-ai') {
        try {
            const cf = await workerTieredLLM('coverLetter', prompt, {
                system: SYSTEM_INSTRUCTION_PROFESSIONAL,
                temperature: 0.65,
                maxTokens: 1200,
            });
            if (cf && cf.trim()) letter = cf;
        } catch (cfErr) {
            console.warn('[generateCoverLetter] Worker call failed, falling back to selected provider:', cfErr);
        }
    }
    if (!letter) {
        letter = onChunk
            ? await groqChatStream(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, onChunk, { temperature: 0.65, maxTokens: 1200 })
            : await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.65, maxTokens: 1200 });
    }
    return purifyText(letter);
};


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


export const generateSmartCoverLetter = async (
    profile: UserProfile,
    jobDescription: string,
    companyResearch: string = '',
    onChunk?: (delta: string) => void,
): Promise<string> => {
    const companySection = companyResearch
        ? `\n### COMPANY RESEARCH (use this to show you know the company)\n${companyResearch}\n`
        : '';

    const prompt = `
        You are a world-class career coach writing a WINNING cover letter.

        ### CV DATA
        ${compactProfile(profile)}

        ### JOB DESCRIPTION
        ${jobDescription}
        ${companySection}
        ### COVER LETTER INSTRUCTIONS
        1. **Opening**: Name the exact role. If company research is available, mention something specific about the company (recent news, values, product) that excites you.
        2. **Body (2-3 paragraphs)**:
           - Match your 2-3 strongest experiences to the JD's top requirements.
           - Use STAR method briefly (Situation, Task, Action, Result) for at least one example.
           - Include specific metrics/numbers from your CV where possible.
           - If company research is available, connect your values/experience to the company's mission/culture.
        3. **Closing**: Confident call-to-action. Express genuine enthusiasm.
        4. **Tone**: Professional, warm, confident — NOT generic or sycophantic.
        5. **Length**: 250-350 words. Concise is king.
        6. **Format**: Plain text with proper letter formatting. Address to "Dear Hiring Manager" unless a name is known.

        CRITICAL: This letter must feel unique to THIS job at THIS company. No generic templates.
        Return ONLY the cover letter text. No commentary.
    `;

    return onChunk
        ? groqChatStream(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, onChunk, { temperature: 0.7 })
        : groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.7 });
};

