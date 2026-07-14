/**
 * Shared text truncation utility.
 *
 * Two truncation limits intentionally coexist:
 *  - Compaction (profileCacheClient / geminiService): 200 chars — controls the
 *    LLM context budget fed to the AI pipeline.
 *  - Template display (e.g. TemplateExecutiveEditorial): 140 chars — controls
 *    layout fit in the rendered CV.
 *
 * They serve different purposes, so the numbers are INTENTIONALLY different.
 * Do NOT "fix" the mismatch by unifying them — that comment is here for a reason.
 */

/**
 * Truncate `text` to at most `max` characters, breaking on a word boundary
 * and appending an ellipsis. Returns the original string if it fits.
 */
export function truncate(text: string, max: number): string {
    if (!text || text.length <= max) return text;
    return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}
