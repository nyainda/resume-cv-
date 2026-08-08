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
export const fixBulletsForSignal = async (
    bullets: string[],
    signalId: string,
): Promise<string[]> => {
    const instruction = BULLET_FIX_INSTRUCTIONS[signalId];
    if (!instruction || bullets.length === 0) return bullets;

    const banned = await _getBannedPhrasesForPrompt();
    const numbered = bullets.map((b, i) => `[${i}] ${b}`).join('\n');

    // Prefer the full Worker-fetched rules; fall back to the static subset
    const activeRules = HUMANIZATION_RULES || _COACHING_VOICE_RULES;

    const systemInstruction = SYSTEM_INSTRUCTION_HUMANIZER
        ? `${SYSTEM_INSTRUCTION_HUMANIZER}\n\n${activeRules}`
        : activeRules;

    const prompt = `You are a senior CV editor applying a targeted fix to a set of CV bullet points.

TASK:
${instruction}

PROCV WRITING RULES — follow these exactly, same as during CV generation:
${activeRules}
- Do NOT use these additionally banned phrases: ${banned.slice(0, 80)}
- Do NOT invent new metrics or facts — only change wording or structure
- Return ONLY a valid JSON object: { "rewrites": { "<index>": "<rewritten bullet>", ... } }
- Include ONLY bullets you actually changed — omit unchanged ones
- Indices correspond to the [N] prefix in the input

BULLETS:
${numbered}`;

    try {
        const { purifiedCompletion } = await import('../purifiedLLMGateway');
        const raw = await groqChat(GROQ_FAST, systemInstruction, prompt, { temperature: 0.45, json: true, maxTokens: 2400 });
        const _stripped = (raw ?? '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const parsed = JSON.parse(_stripped || '{}') as { rewrites?: Record<string, string> };
        const rewrites = parsed.rewrites ?? {};
        const result = [...bullets];
        // Run each rewrite through purifiedCompletion to strip any surviving banned phrases
        await Promise.all(
            Object.entries(rewrites).map(async ([idxStr, text]) => {
                const idx = parseInt(idxStr, 10);
                if (!isNaN(idx) && idx >= 0 && idx < result.length && typeof text === 'string' && text.trim()) {
                    const { text: clean } = await purifiedCompletion(() => Promise.resolve(text.trim()));
                    result[idx] = clean;
                }
            })
        );
        return result;
    } catch {
        return bullets;
    }
};

/**
 * Fix summary for a given signal — returns the corrected summary string.
 * Uses the full Worker-fetched HUMANIZATION_RULES (same as CV generation) and
 * passes the result through purifiedCompletion so banned phrases are scrubbed.
 */
