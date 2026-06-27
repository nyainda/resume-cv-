// services/shareService.ts
//
// Manages short-link CV sharing via the cv-engine-worker D1 cv_shares table.
// POST /api/cv/share  →  { id: "abc12345" }
// GET  /api/cv/share?id=abc12345  →  { payload: "<lz-compressed>" }
//
// Falls back to the legacy long-hash URL if the worker is unreachable.

const ENGINE_BASE: string = (import.meta.env.VITE_CV_ENGINE_URL ?? '').replace(/\/$/, '');

const TIMEOUT_MS = 5000;

// ─── Client-side rate limiting ───────────────────────────────────────────────
// Mirrors the server's 10 requests per hour per device.
// Gives instant feedback instead of waiting for a server rejection.

const RATE_LIMIT_KEY    = 'procv:share_attempts';
const RATE_WINDOW_MS    = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX    = 10;

export interface ShareRateLimitResult {
  allowed: boolean;
  /** How many ms until the oldest attempt expires and frees a slot. */
  retryAfterMs: number;
  /** How many requests remain in the current window. */
  remaining: number;
}

/**
 * Check and record a share attempt against the client-side rate limit.
 * Returns `allowed: false` if the limit is reached.
 * This is a best-effort client-side guard — the server enforces the same limit.
 */
export function checkShareRateLimit(): ShareRateLimitResult {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    const attempts: number[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    // Keep only attempts within the current window
    const recent = attempts.filter(t => now - t < RATE_WINDOW_MS);

    if (recent.length >= RATE_LIMIT_MAX) {
      const oldest = Math.min(...recent);
      return {
        allowed: false,
        retryAfterMs: RATE_WINDOW_MS - (now - oldest),
        remaining: 0,
      };
    }

    // Record this attempt
    recent.push(now);
    try { localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(recent)); } catch { /* quota */ }

    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: RATE_LIMIT_MAX - recent.length,
    };
  } catch {
    // Fail open — never block a user due to a storage error
    return { allowed: true, retryAfterMs: 0, remaining: RATE_LIMIT_MAX };
  }
}

/** How many share link creations remain in the current hour. */
export function getShareRemainingCount(): number {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    const attempts: number[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const recent = attempts.filter(t => now - t < RATE_WINDOW_MS);
    return Math.max(0, RATE_LIMIT_MAX - recent.length);
  } catch {
    return RATE_LIMIT_MAX;
  }
}

// ─── Network helpers ──────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload a compressed payload and return the short 8-char ID.
 *
 * Returns `null` when:
 *  - The client-side rate limit is reached (10/hour)
 *  - The server is unreachable or returns an error
 *
 * Callers should check `checkShareRateLimit()` first if they want to show
 * the rate-limit message before attempting the network call.
 */
export interface CreateShareResult {
  id: string;
  expires_at: number; // unix seconds
}

export async function createShareLink(compressedPayload: string): Promise<CreateShareResult | null> {
  try {
    if (!ENGINE_BASE) return null;

    const rateCheck = checkShareRateLimit();
    if (!rateCheck.allowed) {
      const minutesLeft = Math.ceil(rateCheck.retryAfterMs / 60_000);
      console.warn(`[shareService] Rate limit reached — try again in ${minutesLeft} min`);
      return null;
    }

    const res = await fetchWithTimeout(`${ENGINE_BASE}/api/cv/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: compressedPayload }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { id?: string; expires_at?: number };
    if (!data.id) return null;
    return {
      id: data.id,
      // Fall back to 30-day TTL if server omits expires_at (older deployed worker)
      expires_at: data.expires_at ?? (Math.floor(Date.now() / 1000) + 30 * 86400),
    };
  } catch {
    return null;
  }
}

/** Fetch the compressed payload for a short ID. Returns null on miss/error. */
export async function fetchSharePayload(id: string): Promise<string | null> {
  try {
    if (!ENGINE_BASE) return null;
    const res = await fetchWithTimeout(`${ENGINE_BASE}/api/cv/share?id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = await res.json() as { payload?: string };
    return data.payload ?? null;
  } catch {
    return null;
  }
}

/** Build a short share URL from a short ID. */
export function buildShortShareUrl(id: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}#s=${id}`;
}

// ─── Stored share links (localStorage) ───────────────────────────────────────

export interface StoredShareLink {
  id: string;
  created_at: number; // unix ms (client clock when created)
  expires_at: number; // unix seconds (from server)
}

const SHARE_LINKS_KEY = 'procv:shareLinks';
const MAX_STORED_LINKS = 20;

/** Read all locally stored share links, filtering out any that have expired. */
export function getStoredShareLinks(): StoredShareLink[] {
  try {
    const raw = localStorage.getItem(SHARE_LINKS_KEY);
    if (!raw) {
      // Migrate legacy single-ID key if present
      const legacyId = localStorage.getItem('procv:latestShareId');
      if (legacyId) return [{ id: legacyId, created_at: Date.now(), expires_at: Math.floor(Date.now() / 1000) + 30 * 86400 }];
      return [];
    }
    const arr = JSON.parse(raw) as StoredShareLink[];
    const nowSec = Math.floor(Date.now() / 1000);
    return arr.filter(l => l.expires_at > nowSec);
  } catch { return []; }
}

/** Persist a newly created share link. Also keeps legacy key in sync. */
export function addStoredShareLink(id: string, expires_at: number): void {
  try {
    const links = getStoredShareLinks();
    const deduped = links.filter(l => l.id !== id);
    deduped.unshift({ id, created_at: Date.now(), expires_at });
    localStorage.setItem(SHARE_LINKS_KEY, JSON.stringify(deduped.slice(0, MAX_STORED_LINKS)));
    localStorage.setItem('procv:latestShareId', id);
  } catch { /* quota */ }
}

/** Fetch live stats for an array of IDs in parallel (max 10 at once). */
export async function fetchAllShareStats(ids: string[]): Promise<Map<string, ShareStats>> {
  const results = new Map<string, ShareStats>();
  await Promise.allSettled(
    ids.slice(0, 10).map(async id => {
      const stats = await fetchShareStats(id);
      if (stats) results.set(id, stats);
    })
  );
  return results;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface ShareStats {
  view_count: number;
  created_at: number;   // unix seconds
  expires_at: number;   // unix seconds
}

/**
 * Fetch view stats for a short share ID.
 * Read-only — does NOT increment the view counter.
 * Returns null when the link is not found, expired, or worker is unreachable.
 */
export async function fetchShareStats(id: string): Promise<ShareStats | null> {
  try {
    if (!ENGINE_BASE || !id) return null;
    const res = await fetchWithTimeout(
      `${ENGINE_BASE}/api/cv/share/stats?id=${encodeURIComponent(id)}`
    );
    if (!res.ok) return null;
    const data = await res.json() as { ok?: boolean; view_count?: number; created_at?: number; expires_at?: number };
    if (!data.ok) return null;
    return {
      view_count: data.view_count ?? 0,
      created_at: data.created_at ?? 0,
      expires_at: data.expires_at ?? 0,
    };
  } catch {
    return null;
  }
}
