/**
 * Pipeline-safe banned-phrases helper for AI prompt injection.
 */

import { getCachedBannedPhrases } from '../cvEngineClient';

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
