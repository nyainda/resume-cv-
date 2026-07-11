import { groqChat, GROQ_LARGE } from './groqService';
import type { CVData } from '../types';

export interface PivotBrief {
  headline: string;
  narrative: string;
  linkedinHeadline: string;
  topTips: string[];
}

export async function generatePivotBrief(
  cv: CVData,
  jobDescription: string,
  fromLabel: string,
  toLabel: string
): Promise<PivotBrief> {
  const cvSummary = [
    cv.summary ? `CV Summary: ${cv.summary}` : '',
    (cv.experience || []).slice(0, 3)
      .map(e => `${e.jobTitle} at ${e.company}`)
      .join(', '),
    `Skills: ${(cv.skills || []).slice(0, 15).join(', ')}`,
  ].filter(Boolean).join('\n');

  const prompt = `You are a career transition coach. Analyse this career pivot and provide targeted, specific advice.

FROM FIELD: ${fromLabel}
TO FIELD: ${toLabel}

CANDIDATE CV SUMMARY:
${cvSummary.substring(0, 1500)}

TARGET ROLE DESCRIPTION:
${jobDescription.substring(0, 1000)}

Return a JSON object with exactly these keys:
{
  "headline": "One punchy sentence (15 words max) that frames this specific ${fromLabel} → ${toLabel} pivot as a competitive STRENGTH, not a gap. No generic phrases like 'unique perspective' or 'diverse background'.",
  "narrative": "A 3-4 sentence pivot narrative the candidate can use in interviews and their CV summary. First person. Explain specifically why ${fromLabel} experience makes them BETTER for ${toLabel} roles — reference actual transferable skills. End with a forward-looking statement.",
  "linkedinHeadline": "A LinkedIn headline (under 220 characters) that positions them as transitioning to ${toLabel} while honouring their ${fromLabel} background. Use this format: [Target role] | [Key transferable value] | [Background leveraged]. Be specific.",
  "topTips": ["4 highly specific, actionable tips for THIS particular ${fromLabel} → ${toLabel} pivot. Each tip under 30 words. Concrete actions only — no generic 'network more' or 'update your CV' advice."]
}

Return ONLY valid JSON. No markdown code fences.`;

  const raw = await groqChat(
    GROQ_LARGE,
    'You are an expert career coach specialising in industry transitions. Be specific, strategic, and direct. Avoid clichés.',
    prompt,
    { json: true, temperature: 0.7, maxTokens: 1000 }
  );

  return JSON.parse(raw) as PivotBrief;
}
