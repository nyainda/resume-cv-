/**
 * Humanize plain text (remove AI patterns).
 * Extracted from geminiService — logic unchanged.
 */

import { groqChat, GROQ_LARGE } from './groqService';
import { SYSTEM_INSTRUCTION_HUMANIZER } from './pipelineRules';

// --- Humanize a block of plain text to remove AI patterns ---
export const humanizeText = async (text: string): Promise<string> => {
    const prompt = `Rewrite the following professional text so it sounds naturally human-written. Preserve all facts, dates, names, and numbers. Only change phrasing and style.\n\nTEXT TO REWRITE:\n${text}`;
    // Use Cloudflare Workers AI only when it is the selected provider.
    if (getSelectedProvider() === 'workers-ai') {
        try {
            const cf = await workerTieredLLM('humanize', prompt, {
                system: SYSTEM_INSTRUCTION_HUMANIZER,
                temperature: 0.8,
                maxTokens: 2500,
            });
            if (cf && cf.trim()) return cf;
        } catch (cfErr) {
            console.warn('[humanizeText] Worker call failed, falling back to selected provider:', cfErr);
        }
    }
    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.8, maxTokens: 2500 });
};
