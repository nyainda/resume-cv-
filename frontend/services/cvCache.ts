// services/cvCache.ts
// Tiny shared cache store — kept separate so hooks that only need
// to invalidate the cache don't pull in the full geminiService bundle.

export interface CacheEntry { result: object; ts: number; }
export const cvCache = new Map<string, CacheEntry>();

/** Remove one profile/JD cache entry for an explicit regeneration. */
export function deleteCVCacheEntry(key: string): void {
  cvCache.delete(key);
}

/** Call this when the user saves their profile — invalidates all cached CVs. */
export function invalidateCVCache(): void {
  cvCache.clear();
}
