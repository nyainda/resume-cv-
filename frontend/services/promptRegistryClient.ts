/**
 * S4 — Prompt Registry client.
 *
 * Fetches the active prompt version numbers from the cv-engine-worker and
 * caches them in localStorage so every generation call can tag its trace
 * with the exact prompt versions used — without a network round-trip on
 * the critical path.
 *
 * The version map is intentionally lightweight: it only stores
 * { section_key → version_number } so it can be included in the
 * GenerationTrace without ballooning its size.
 *
 * Public API:
 *   getPromptVersions()  — returns cached version map, refetching if stale
 *   prefetchVersions()   — fire-and-forget pre-warm (call on app boot)
 *   getPromptDetail(section) — full prompt text for debug/admin panel
 */

const WORKER_URL = import.meta.env.VITE_CV_ENGINE_URL ?? '';
const CACHE_KEY  = 'procv:prompt_versions';
const CACHE_TTL  = 60 * 60 * 1000; // 1 hour — prompt versions change rarely

export interface PromptVersionMap {
  /** e.g. { summary: 14, experience: 9, skills: 3 } */
  [sectionKey: string]: number;
}

interface CacheEntry {
  versions: PromptVersionMap;
  fetchedAt: number;
}

// ─── Local cache ─────────────────────────────────────────────────────────────

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry.versions || !entry.fetchedAt) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(versions: PromptVersionMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ versions, fetchedAt: Date.now() }));
  } catch { /* quota exceeded — skip */ }
}

// ─── Network fetch ────────────────────────────────────────────────────────────

async function fetchFromWorker(): Promise<PromptVersionMap> {
  if (!WORKER_URL) return {};
  const res = await fetch(`${WORKER_URL}/api/cv/prompt-registry`, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`prompt-registry ${res.status}`);
  const data = await res.json() as { versions: Record<string, { version: number }> };
  // Flatten to { sectionKey: versionNumber }
  const flat: PromptVersionMap = {};
  for (const [k, v] of Object.entries(data.versions ?? {})) {
    flat[k] = v.version;
  }
  return flat;
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _inFlight: Promise<PromptVersionMap> | null = null;

/**
 * Returns the active prompt version map.
 * Uses the localStorage cache if it's < 1 hour old.
 * Falls back to an empty map if the worker is unreachable — graceful degradation.
 */
export async function getPromptVersions(): Promise<PromptVersionMap> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.versions;
  }

  // Deduplicate concurrent calls
  if (!_inFlight) {
    _inFlight = fetchFromWorker()
      .then(v => { writeCache(v); return v; })
      .catch(() => {
        // Return stale data if available, otherwise empty map
        return readCache()?.versions ?? {};
      })
      .finally(() => { _inFlight = null; });
  }
  return _inFlight;
}

/**
 * Fire-and-forget pre-warm — call on app boot so the first generation
 * already has versions in cache.
 */
export function prefetchVersions(): void {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return; // still fresh
  void getPromptVersions();
}

/**
 * Invalidate the local cache (call after an admin writes a new version).
 */
export function invalidateVersionCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

/**
 * Fetch the full prompt text + history for one section.
 * Only used in the admin panel or debug trace — not on the generation path.
 */
export async function getPromptDetail(section: string): Promise<{
  section_key: string;
  active: { id: number; version: number; prompt_text: string; notes: string; created_at: number; created_by: string };
  history: Array<{ id: number; version: number; notes: string; created_at: number; created_by: string; is_active: number }>;
} | null> {
  if (!WORKER_URL) return null;
  try {
    const res = await fetch(`${WORKER_URL}/api/cv/prompt-registry/${encodeURIComponent(section)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
