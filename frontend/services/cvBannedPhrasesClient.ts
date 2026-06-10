/**
 * cvBannedPhrasesClient.ts
 *
 * Fetches the live banned-phrases list from the CV Engine Worker and returns
 * two lists that the HR Detector Simulation uses for scoring:
 *   - bannedOpenerPhrases: multi-word phrases that should never start a bullet
 *   - summaryAiisms: phrases that indicate AI-generated summaries
 *
 * Falls back silently to empty arrays when the worker is unreachable so the
 * scorer always works offline using its built-in hardcoded lists.
 *
 * In-memory cache (5-minute TTL) avoids repeated fetches during a session.
 */

const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';

interface BannedRow {
    phrase: string;
    replacement?: string;
    severity?: string;
}

interface BannedPhrasesCache {
    fetchedAt: number;
    openers: string[];   // phrases likely to open bullets
    aiisms: string[];    // summary / general AI-ism phrases
}

let _cache: BannedPhrasesCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** True if phrase looks like a bullet opener (single word ending -ed or known pattern) */
function looksLikeBulletOpener(phrase: string): boolean {
    const w = phrase.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    // Single word openers ending in -ed are the strongest signal
    if (w.endsWith('ed') || w.endsWith('ied')) return true;
    // Known multi-word openers
    if (/^(responsible for|worked on|helped to|assisted with|tasked with)/i.test(phrase)) return true;
    // Very short phrases (1-2 words) that look like openers
    if (phrase.trim().split(/\s+/).length <= 2) return true;
    return false;
}

/** True if phrase looks like a summary AI-ism (longer phrase, not a verb) */
function looksLikeSummaryAiism(phrase: string): boolean {
    const words = phrase.trim().split(/\s+/);
    if (words.length >= 2) return true; // Multi-word phrases go in summary check
    const w = words[0]?.toLowerCase() ?? '';
    // Adjectives and adverbs are summary AI-isms
    if (/^(highly|deeply|extremely|very|truly|exceptionally|remarkably|uniquely)/i.test(w)) return true;
    return false;
}

/**
 * Fetch and cache the live banned phrases list from the CF worker.
 * Returns { openers, aiisms } — both may be empty if worker unreachable.
 */
export async function fetchCFBannedPhrases(): Promise<{ openers: string[]; aiisms: string[] }> {
    // Return cache if fresh
    if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
        return { openers: _cache.openers, aiisms: _cache.aiisms };
    }

    if (!ENGINE_URL) {
        return { openers: [], aiisms: [] };
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

        const res = await fetch(`${ENGINE_URL}/api/cv/banned`, {
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
        });
        clearTimeout(timeout);

        if (!res.ok) return { openers: [], aiisms: [] };

        const data = await res.json() as { banned?: BannedRow[] };
        const rows: BannedRow[] = Array.isArray(data?.banned) ? data.banned : [];

        const openers: string[] = [];
        const aiisms: string[] = [];

        for (const row of rows) {
            const phrase = (row.phrase || '').trim().toLowerCase();
            if (!phrase || phrase.length < 3) continue;

            if (looksLikeBulletOpener(phrase)) {
                openers.push(phrase);
            }
            if (looksLikeSummaryAiism(phrase)) {
                aiisms.push(phrase);
            }
        }

        _cache = { fetchedAt: Date.now(), openers, aiisms };
        return { openers, aiisms };
    } catch {
        // Worker unreachable or timed out — return empty arrays, fall back to built-ins
        return { openers: [], aiisms: [] };
    }
}

/** Invalidate the cache (e.g. after syncing new banned phrases from admin) */
export function invalidateBannedPhrasesCache(): void {
    _cache = null;
}
