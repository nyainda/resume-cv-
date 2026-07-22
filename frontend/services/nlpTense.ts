/**
 * nlpTense.ts — NLP-backed tense detection and conjugation using compromise.js.
 *
 * Loaded lazily (dynamic import) so the ~200KB library never hits the initial
 * bundle. Call `initNlp()` once at the start of any async pipeline stage that
 * needs tense operations; after that the sync helpers work immediately.
 *
 * Designed as a DROP-IN supplement to the existing VERB_TENSE_MAP lookup table:
 *   - VERB_TENSE_MAP wins for any verb it knows (deterministic, zero-cost).
 *   - These NLP helpers fire only for verbs NOT in the table, catching irregular
 *     forms (drove, fought, built, ran) that would otherwise slip through silently.
 *
 * Key advantage over the old PRESENT_VERB_HINTS / PAST_VERB_HINTS regex approach:
 *   - Understands that "talented" is an adjective, not a past-tense verb.
 *   - Handles irregular verbs without a lookup table (led, drove, fought, ran…).
 *   - Returns 'unknown' cleanly rather than false-positiving on mid-sentence words.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nlp: ((input: string) => any) | null = null;

/**
 * Pre-loads compromise.js. Must be awaited before calling any sync helper.
 * Idempotent — safe to call multiple times; the library is only fetched once.
 * Never throws — if loading fails, sync helpers return graceful fallbacks.
 */
export async function initNlp(): Promise<void> {
    if (nlp) return;
    try {
        const mod = await import('compromise');
        nlp = (mod.default ?? mod) as (input: string) => unknown;
    } catch (e) {
        // Non-fatal: VERB_TENSE_MAP handles the common verbs; NLP is a fallback.
        console.debug('[nlpTense] compromise.js load failed (non-fatal):', e);
    }
}

/**
 * Detect the grammatical tense of a single word (the leading verb of a bullet).
 * Returns 'unknown' when compromise is not yet loaded or the word is not a verb
 * (e.g. an adjective like "talented" that ends in -ed).
 */
export function detectWordTense(word: string): 'present' | 'past' | 'unknown' {
    if (!nlp) return 'unknown';
    try {
        const doc = nlp(word);
        if (doc.has('#PastTense')) return 'past';
        // Infinitive + PresentTense cover both "manage" (bare) and "manages" (3ps)
        if (doc.has('#Infinitive') || doc.has('#PresentTense')) return 'present';
        // Word is not a verb at all (adjective, noun…) — return unknown to avoid
        // false-positives from things like "designed" (past) vs "talented" (adj).
        if (!doc.has('#Verb')) return 'unknown';
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * Conjugate a single verb word to the target tense.
 *
 * - target 'past'    → simple past tense   ("manage" → "managed", "lead" → "led")
 * - target 'present' → bare infinitive      ("managed" → "manage",  "led" → "lead")
 *                      (NOT 3rd-person "manages" — CV convention uses imperatives)
 *
 * Returns `null` when compromise is not loaded, the word is not a verb, or the
 * library cannot produce a confident conjugation. The caller should fall back to
 * the existing VERB_TENSE_MAP in that case.
 */
export function conjugateWord(word: string, target: 'present' | 'past'): string | null {
    if (!nlp) return null;
    try {
        const doc = nlp(word);
        if (!doc.has('#Verb') && !doc.has('#PastTense') && !doc.has('#Infinitive')) return null;

        let result: string;
        if (target === 'past') {
            result = doc.verbs().toPastTense().text().trim();
        } else {
            // toInfinitive() gives the bare form ("manage", "lead") — exactly the
            // imperative style CVs use for current roles.
            result = doc.verbs().toInfinitive().text().trim();
        }

        if (!result) return null;
        // Return null when compromise echoed the word unchanged AND we know it's
        // already in the wrong tense — that means the library couldn't conjugate.
        const lower = word.toLowerCase();
        const resultLower = result.toLowerCase();
        if (resultLower === lower) {
            // Only useful if the word is already in the target tense.
            const currentTense = detectWordTense(word);
            if (currentTense !== target && currentTense !== 'unknown') return null;
        }
        return result;
    } catch {
        return null;
    }
}

/**
 * Returns true once compromise.js has been successfully loaded.
 * Use as a guard to avoid spamming debug logs about NLP being unavailable.
 */
export function isNlpReady(): boolean {
    return nlp !== null;
}
