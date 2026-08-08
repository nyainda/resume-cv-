/**
 * Interview Q&A generation.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile } from '../types';
import { groqChat, GROQ_FAST } from './groqService';
import { compactProfile } from './profilePromptUtils';
import { SYSTEM_INSTRUCTION_PROFESSIONAL } from './pipelineRules';

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
