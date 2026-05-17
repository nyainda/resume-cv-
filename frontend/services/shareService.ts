// services/shareService.ts
//
// Manages short-link CV sharing via the cv-engine-worker D1 cv_shares table.
// POST /api/cv/share  →  { id: "abc12345" }
// GET  /api/cv/share?id=abc12345  →  { payload: "<lz-compressed>" }
//
// Falls back to the legacy long-hash URL if the worker is unreachable.

const ENGINE_BASE: string = (import.meta.env.VITE_CV_ENGINE_URL ?? '').replace(/\/$/, '');

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Upload a compressed payload and return the short 8-char ID. */
export async function createShareLink(compressedPayload: string): Promise<string | null> {
  try {
    if (!ENGINE_BASE) return null;
    const res = await fetchWithTimeout(`${ENGINE_BASE}/api/cv/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: compressedPayload }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { id?: string };
    return data.id ?? null;
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
