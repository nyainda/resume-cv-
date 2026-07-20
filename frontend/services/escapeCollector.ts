/**
 * escapeCollector.ts — Feature 2: Pipeline Learning Loop (frontend).
 *
 * Lightweight, non-blocking collector that:
 *  1. Accepts escape signals from ARE events, user Skip actions, and manual edits.
 *  2. Sanitises ALL personal data from patterns before storage (PII-safe).
 *  3. Queues events in IDB and flushes to the CF Worker in batches.
 *
 * Privacy rule (non-negotiable): stored `pattern` is a sanitised structural
 * fragment — numbers → [NUM], proper nouns → [NAME], orgs → [ORG].
 * No raw CV text ever leaves the client via this path.
 */

// Uses the same env var as cvEngineClient — no circular import needed
const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EscapeType =
  | 'banned_phrase'
  | 'weak_verb'
  | 'passive'
  | 'ai_language'
  | 'metric'
  | 'cert'
  | 'other';

export type EscapeSource =
  | 'tier1_fix'
  | 'tier2_fix'
  | 'user_skip'
  | 'user_edit'
  | 'build_warn'
  | 'gateway';

export interface EscapeSignal {
  id:          string;
  escape_type: EscapeType;
  pattern:     string;
  source:      EscapeSource;
  created_at:  number;
}

// ─── PII sanitiser ────────────────────────────────────────────────────────────

const NUMBERS_RX    = /\b[\d,]+(\.\d+)?(%|[kKmMbBtT](?:\b))?/g;
const PROPER_NOUN   = /\b[A-Z][a-z]{2,}\b(?:\s+[A-Z][a-z]{2,}\b)*/g;
// Common org patterns: Acme Corp, Ltd, Inc, LLC, PLC, LLP
const ORG_SUFFIX_RX = /\b[A-Z][A-Za-z &'-]{1,30}(?:\s+(?:Ltd|Inc|LLC|PLC|LLP|Corp|Co\.|Group|Holdings|Technologies|Solutions|Services|Consulting|Partners|Ventures|Labs|AI|UK|US|EU))\b/g;

function sanitisePattern(raw: string): string {
  return raw
    .replace(ORG_SUFFIX_RX, '[ORG]')
    .replace(PROPER_NOUN, '[NAME]')
    .replace(NUMBERS_RX, '[NUM]')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 120); // hard cap
}

// ─── IDB queue ────────────────────────────────────────────────────────────────

const DB_NAME    = 'procv_escapes';
const STORE_NAME = 'queue';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function enqueue(signal: EscapeSignal): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(signal);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function drainQueue(max = 50): Promise<EscapeSignal[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx      = db.transaction(STORE_NAME, 'readwrite');
    const store   = tx.objectStore(STORE_NAME);
    const results: EscapeSignal[] = [];
    const req     = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || results.length >= max) { resolve(results); return; }
      results.push(cursor.value as EscapeSignal);
      cursor.delete();
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── Flush to worker ──────────────────────────────────────────────────────────

let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY_MS = 10_000; // 10 s debounce after last recordEscape()

function scheduleFlush(): void {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(flushEscapes, FLUSH_DELAY_MS);
}

export async function flushEscapes(): Promise<void> {
  _flushTimer = null;
  let escapes: EscapeSignal[];
  try {
    escapes = await drainQueue(50);
  } catch {
    return; // IDB unavailable — silently skip
  }
  if (escapes.length === 0) return;

  if (!ENGINE_URL) return; // worker not configured — discard
  const url = `${ENGINE_URL}/api/pipeline/escapes`;

  try {
    await fetch(url, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ escapes }),
    });
  } catch {
    // Worker unreachable — signals are lost (acceptable, non-critical telemetry)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a pipeline escape signal.
 *
 * Non-blocking — always returns immediately. Sanitises the pattern first.
 * Batches and flushes to the worker on a debounced schedule.
 *
 * @param escape_type  Category of the escape (what kind of issue)
 * @param rawPattern   Raw fragment that escaped the pipeline (will be sanitised)
 * @param source       Where the signal came from
 */
export function recordEscape(
  escape_type: EscapeType,
  rawPattern:  string,
  source:      EscapeSource,
): void {
  const pattern = sanitisePattern(rawPattern);
  if (!pattern || pattern.length < 3) return; // noise gate

  const signal: EscapeSignal = {
    id:          `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    escape_type,
    pattern,
    source,
    created_at:  Math.floor(Date.now() / 1000),
  };

  enqueue(signal).catch(() => {}); // fire-and-forget
  scheduleFlush();
}

/**
 * Flush any queued escapes immediately (call before sign-out / page unload).
 */
export { flushEscapes as flushEscapesNow };
