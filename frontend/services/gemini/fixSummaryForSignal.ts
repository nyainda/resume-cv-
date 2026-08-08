/**
 * One-click coaching fixes: verb saturation, signal bullets, summary.
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

// ── Verb-Saturation One-Click Fix ─────────────────────────────────────────────
/**
 * Rewrites verb-led bullets to diversify openers.
 * Targets only bullets starting with action verbs; leaves all other bullets untouched.
 * Rewrites ~40% of verb-led bullets (the first N to stay within prompt budget).
 * Returns the full bullets array with rewrites applied in place.
 */
export const fixSummaryForSignal = async (
    summary: string,
    signalId: string,
): Promise<string> => {
    const instruction = SUMMARY_FIX_INSTRUCTIONS[signalId];
    if (!instruction || !summary.trim()) return summary;

    const banned = await _getBannedPhrasesForPrompt();

    // Prefer the full Worker-fetched rules; fall back to the static subset
    const activeRules = HUMANIZATION_RULES || _COACHING_VOICE_RULES;

    const systemInstruction = SYSTEM_INSTRUCTION_HUMANIZER
        ? `${SYSTEM_INSTRUCTION_HUMANIZER}\n\n${activeRules}`
        : activeRules;

    const prompt = `You are a senior CV editor improving a professional summary section.

TASK:
${instruction}

PROCV WRITING RULES — follow these exactly, same as during CV generation:
${activeRules}
- Do NOT use these additionally banned phrases: ${banned.slice(0, 60)}
- Do NOT invent new facts or metrics
- Return ONLY a valid JSON object: { "summary": "<rewritten summary>" }

SUMMARY TO FIX:
${summary}`;

    try {
        const { purifiedCompletion } = await import('./purifiedLLMGateway');
        const raw = await groqChat(GROQ_FAST, systemInstruction, prompt, { temperature: 0.45, json: true, maxTokens: 600 });
        const _stripped = (raw ?? '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const parsed = JSON.parse(_stripped || '{}') as { summary?: string };
        const rawSummary = parsed.summary?.trim();
        if (!rawSummary) return summary;
        const { text: clean } = await purifiedCompletion(() => Promise.resolve(rawSummary));
        return clean;
    } catch {
        return summary;
    }
};

