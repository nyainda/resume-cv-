/**
 * Pipeline-safe banned-phrases helper for AI prompts.
 * Extracted from geminiService — logic unchanged.
 */

import { getCachedBannedPhrases } from './cvEngineClient';

// ── Pipeline-safe banned-phrases helper ──────────────────────────────────────
// Used by every AI call that generates or rewrites CV content to ensure
// they respect the same banned-phrase list as the main generation pipeline.
// Falls back to a hardcoded set when the CF worker is unreachable.
const _BANNED_PHRASES_FALLBACK =
    'spearheaded, leveraged, orchestrated, utilized, facilitated, synergized, ' +
    'catalyzed, responsible for, helped with, assisted in, tasked with, worked on, ' +
    'passionate about, dynamic, results-driven, detail-oriented, innovative, ' +
    'cutting-edge, robust, seamlessly, delve, harnessed, navigated';

export async function _getBannedPhrasesForPrompt(): Promise<string> {
    try {
        const entries = await getCachedBannedPhrases();
        if (entries && entries.length > 0) {
            return entries.slice(0, 25).map(b => `"${b.phrase}"`).join(', ');
        }
    } catch { /* silent fallback */ }
    return _BANNED_PHRASES_FALLBACK;
}

