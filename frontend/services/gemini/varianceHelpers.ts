/**
 * Variance helpers — controlled randomness at the prompt level.
 */

// ── Variance helpers ──────────────────────────────────────────────────────────
// These inject controlled randomness at the prompt level so each generation
// feels like a different person wrote it, while facts stay identical.

/** Fisher-Yates shuffle — always returns a NEW array, never mutates. */
export function shuffleArray<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
