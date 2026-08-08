/**
 * Field-level AI enhancers: summary, responsibilities, achievements, projects.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile } from '../types';
import { groqChat, GROQ_LARGE } from './groqService';
import { purifyProfile, purifyText } from './cvPurificationPipeline';
import { compactProfile } from './profilePromptUtils';
import { SYSTEM_INSTRUCTION_PROFESSIONAL } from './pipelineRules';
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

export const generateQuantifiedAchievements = async (
    responsibilities: string,
    jobTitle: string,
    company: string,
): Promise<Array<{ original: string; quantified: string; hasMetric: boolean }>> => {
    const bullets = responsibilities
        .split('\n')
        .map(l => l.replace(/^[\u2022\-\*]|\d+\.\s*/, '').trim())
        .filter(b => b.length > 4);

    if (bullets.length === 0) throw new Error('No bullet points found. Add some responsibilities first.');

    const banned = await _getBannedPhrasesForPrompt();
    const prompt = `
You are a career coach who specialises in surfacing impact from resume bullet points.

For each bullet point from a ${jobTitle} at ${company}, do the following:
- Determine if it already contains a quantifiable metric (%, a number, $, timeframe, team size, etc.).
- If it already HAS a clear metric, return it unchanged and mark hasMetric as true.
- If it does NOT have a metric, reframe it to surface observable scope or output using ONLY language and context already in the bullet — e.g. "across 3 sites", "for the flagship product line". Do NOT invent or estimate any figure, percentage, or count.
- Keep rewrites under 25 words. Preserve the original action verb.
- Do not add commentary. Do not change facts. Never use "~", "approx.", or hedged estimates like "approximately 30%".
- BANNED PHRASES — never use any of these: ${banned}

Bullet points to analyse:
${bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}

Return ONLY a valid JSON array — no markdown fences, no explanation:
[
  { "original": "exact original text", "quantified": "improved version", "hasMetric": false }
]
`;
    const raw = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.55 });
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Could not parse AI response. Please try again.');

    const parsed = JSON.parse(match[0]) as Array<{ original: string; quantified: string; hasMetric: boolean }>;

    // Ensure count matches input + purify each rewrite
    const out = bullets.map((b, i) => {
        const item = parsed[i] ?? { original: b, quantified: b, hasMetric: true };
        return { ...item, quantified: purifyText(item.quantified || b) };
    });
    return out;
};

export const generateEnhancedProjectDescription = async (projectName: string, currentDescription: string): Promise<string> => {
    const prompt = `
      You are a tech portfolio expert. Rewrite and enhance the provided project description into a single, concise, professional paragraph for a technical resume.

      **Instructions:**
      1. **Strict Adherence:** Describe ONLY the project provided. Do not invent features or technologies not implied by the description.
      2. **Structure:** Clearly state the project's purpose, the core technologies used, and the key features/outcomes.
      3. **Specificity:** Mention specific frameworks, languages, or tools.
      4. **Highlight Impact:** Briefly explain the problem solved or the project's main achievement.
      5. **Format:** Return ONLY a single, professional paragraph.

      **Input:**
      - Project Name: '${projectName}'
      - Current Description: "${currentDescription}"
    `;
    const desc = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5 });
    return purifyText(desc);
};
