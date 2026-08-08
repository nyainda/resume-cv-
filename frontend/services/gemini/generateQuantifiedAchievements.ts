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

