/**
 * JSON fence stripping + best-effort CV JSON repair.
 * Logic unchanged — lifted from generateCV for readability.
 */

export const stripFencesMain = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

/**
 * Best-effort JSON repair for the main CV generation parse.
 *
 * LLMs produce two classes of malformed JSON that need recovery:
 *   1. Trailing commas — ["item1", "item2",]  →  ["item1", "item2"]
 *      These cause the "after array element" / "after object value" error.
 *   2. Truncated output — model hit its token limit mid-object.
 *      Recovery: strip trailing commas, then walk backwards to the last
 *      valid top-level close brace.
 */
export const repairCVJson = (s: string): string => {
    // Pass 1: strip trailing commas before ] and } (covers "after array element")
    const noTrailing = s.replace(/,(\s*[}\]])/g, '$1');
    try { JSON.parse(noTrailing); return noTrailing; } catch { /* continue */ }

    // Pass 2: truncation — walk backwards on the comma-stripped string
    for (let i = noTrailing.length - 1; i >= 0; i--) {
        if (noTrailing[i] === '}') {
            const candidate = noTrailing.slice(0, i + 1);
            try { JSON.parse(candidate); return candidate; } catch { /* keep walking */ }
        }
    }

    // Pass 3: truncation on the original (comma-strip may have shifted offsets)
    for (let i = s.length - 1; i >= 0; i--) {
        if (s[i] === '}') {
            const candidate = s.slice(0, i + 1);
            try { JSON.parse(candidate); return candidate; } catch { /* keep walking */ }
        }
    }

    return s; // return original; caller will throw with a user-facing message
};
