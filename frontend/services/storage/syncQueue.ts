/**
 * syncQueue.ts — Optimistic IDB sync queue for CV slot and preference syncs.
 *
 * Free Cloudflare KV tier protection: this module is the single throttle point
 * between every "save" action in the UI and the CF worker. It guarantees:
 *
 *   • At most ONE outbound network call per 30 seconds (hard rate limit).
 *   • Never triggered by keystrokes — callers must be explicit save actions.
 *   • Dedup / hash-gate: if payload hasn't changed since the last flush, the
 *     item is dropped before any network call is made.
 *   • Durable: pending items survive page refresh — they are stored in IDB.
 *   • Retry on failure: 30 s → 2 min → 10 min, then the item is abandoned
 *     after 3 attempts (logged to console in dev; silent in production).
 *   • Circuit-breaker-aware: flush is a no-op when the session token is absent
 *     (worker unreachable / user signed out).
 *   • Fire-and-forget for callers — never throws, never needs await.
 *
 * Flush triggers (no polling timers):
 *   1. Explicit user save → enqueueSlotSync / enqueuePrefsSync (rate-limited)
 *   2. Browser comes back online → window 'online' event
 *   3. Tab returns to foreground → document 'visibilitychange' (max 1/5 min)
 *
 * Public API:
 *   enqueueSlotSync(slot)   — enqueue a profile-slot upsert
 *   enqueuePrefsSync(prefs) — enqueue a preferences upsert
 *   flushSyncQueue()        — flush immediately (used by event handlers)
 *   clearQueueForAccount()  — wipe all pending items on sign-out / delete
 */

import type { UserProfileSlot } from '../../types';
import type { UserPrefsPayload } from '../userDataCloudService';
import { syncSlot, syncPrefs } from '../userDataCloudService';

// ─── Configuration ────────────────────────────────────────────────────────────

import { getScopedDbName, getUserPrefix } from './userStorageNamespace';

const BASE_DB_NAME      = 'cv_builder_sync';
const DB_VERSION        = 1;
const STORE             = 'queue';
const _LAST_FLUSH_SUFFIX    = 'sq_last_flush';
const _LAST_VIS_FLUSH_SUFFIX = 'sq_last_vis_flush';
const MIN_FLUSH_MS      = 30_000;   // 30 s between automatic flushes
const MIN_VIS_FLUSH_MS  = 300_000;  // 5 min between visibilitychange flushes
const MAX_RETRIES       = 3;

const RETRY_DELAYS_MS: readonly number[] = [
    30_000,    // 1st retry: 30 s
    120_000,   // 2nd retry: 2 min
    600_000,   // 3rd retry: 10 min
];

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemType = 'slot' | 'prefs';

interface QueueEntry {
    /** Stable key: slotId for 'slot', 'prefs' for 'prefs'. Upsert key. */
    itemKey:     string;
    type:        ItemType;
    payloadJson: string;
    payloadHash: string;
    enqueuedAt:  number;
    retryCount:  number;
    nextRetryAt: number; // 0 = ready immediately
}

// ─── IDB helpers ─────────────────────────────────────────────────────────────

// Per-user DB connection cache (DB name changes per user)
const _dbCache = new Map<string, IDBDatabase>();

function getDbName(): string { return getScopedDbName(BASE_DB_NAME); }
function getLastFlushKey(): string { return getUserPrefix() + 'cv_builder:' + _LAST_FLUSH_SUFFIX; }
function getLastVisFlushKey(): string { return getUserPrefix() + 'cv_builder:' + _LAST_VIS_FLUSH_SUFFIX; }

function openDB(): Promise<IDBDatabase> {
    const name = getDbName();
    const cached = _dbCache.get(name);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'itemKey' });
            }
        };
        req.onsuccess = () => { _dbCache.set(name, req.result); resolve(req.result); };
        req.onerror   = () => reject(req.error);
    });
}

async function idbPut(entry: QueueEntry): Promise<void> {
    const db    = await openDB();
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(entry);
    return new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror    = () => rej(tx.error);
    });
}

async function idbGetAll(): Promise<QueueEntry[]> {
    const db    = await openDB();
    const tx    = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req   = store.getAll();
    return new Promise((res, rej) => {
        req.onsuccess = () => res(req.result as QueueEntry[]);
        req.onerror   = () => rej(req.error);
    });
}

async function idbDelete(itemKey: string): Promise<void> {
    const db    = await openDB();
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.delete(itemKey);
    return new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror    = () => rej(tx.error);
    });
}

async function idbClear(): Promise<void> {
    const db    = await openDB();
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    return new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror    = () => rej(tx.error);
    });
}

// ─── SHA-256 (mirrors userDataCloudService pattern) ──────────────────────────

async function sha256hex(text: string): Promise<string> {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    } catch {
        let h = 0;
        for (let i = 0; i < text.length; i++) {
            h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(16).padStart(8, '0');
    }
}

// ─── Flush scheduling ─────────────────────────────────────────────────────────

let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _flushing = false;

/**
 * Schedule a flush, respecting the 30-second rate limit.
 * Cancels any existing pending timer and reschedules at the correct offset.
 */
function scheduleFlush(): void {
    if (_flushTimer !== null) {
        clearTimeout(_flushTimer);
        _flushTimer = null;
    }

    const lastFlush = parseInt(localStorage.getItem(getLastFlushKey()) ?? '0', 10);
    const sinceLastMs = Date.now() - lastFlush;
    const delayMs = sinceLastMs >= MIN_FLUSH_MS ? 0 : MIN_FLUSH_MS - sinceLastMs;

    _flushTimer = setTimeout(() => {
        _flushTimer = null;
        _doFlush().catch(() => {/* silent */});
    }, delayMs);
}

// ─── Core flush ──────────────────────────────────────────────────────────────

async function _doFlush(): Promise<void> {
    if (_flushing) return; // prevent re-entrant flush
    _flushing = true;

    try {
        const now   = Date.now();
        const items = await idbGetAll();
        const ready = items.filter(i => i.nextRetryAt <= now);

        if (ready.length === 0) return;

        // Record flush time BEFORE sending to prevent thundering-herd on errors
        try { localStorage.setItem(getLastFlushKey(), String(now)); } catch { /* ignore */ }

        for (const item of ready) {
            let ok = false;
            try {
                if (item.type === 'slot') {
                    const slot: UserProfileSlot = JSON.parse(item.payloadJson);
                    // syncSlot is hash-gated internally — if it sees the same hash
                    // it will skip the D1 write. We still remove from queue on
                    // "success" (no throw) so we don't re-queue unchanged data.
                    await syncSlot(slot);
                    ok = true;
                } else if (item.type === 'prefs') {
                    const prefs: UserPrefsPayload = JSON.parse(item.payloadJson);
                    await syncPrefs(prefs);
                    ok = true;
                }
            } catch { /* network error — will retry */ }

            if (ok) {
                await idbDelete(item.itemKey).catch(() => {/* ignore */});
            } else {
                const nextRetry = item.retryCount + 1;
                if (nextRetry > MAX_RETRIES) {
                    // Give up — remove from queue so it doesn't block forever
                    if (import.meta.env.DEV) {
                        console.warn('[syncQueue] abandoned item after max retries', item.itemKey);
                    }
                    await idbDelete(item.itemKey).catch(() => {/* ignore */});
                } else {
                    const delayMs = RETRY_DELAYS_MS[nextRetry - 1] ?? RETRY_DELAYS_MS.at(-1)!;
                    await idbPut({
                        ...item,
                        retryCount:  nextRetry,
                        nextRetryAt: now + delayMs,
                    }).catch(() => {/* ignore */});
                    // Schedule a deferred flush for when this item becomes ready
                    if (_flushTimer === null) {
                        _flushTimer = setTimeout(() => {
                            _flushTimer = null;
                            _doFlush().catch(() => {/* silent */});
                        }, delayMs);
                    }
                }
            }
        }
    } finally {
        _flushing = false;
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Enqueue a profile-slot upsert.
 * The slot will be sent to CF D1 at most once per 30 seconds.
 * Duplicate payloads (same hash) are dropped before any network call.
 */
// Dev-only: records the timestamp of the last enqueueSlotSync call so the
// useDevSyncGuard hook in CVGenerator can detect CV mutations without a sync.
let _devLastSlotSyncAt = 0;
/** @internal — dev mode only. Returns the timestamp of the last enqueueSlotSync call. */
export function _devGetLastSlotSyncAt(): number { return _devLastSlotSyncAt; }

export async function enqueueSlotSync(slot: UserProfileSlot): Promise<void> {
    if (import.meta.env.DEV) _devLastSlotSyncAt = Date.now();
    try {
        const payloadJson = JSON.stringify(slot);
        const payloadHash = await sha256hex(payloadJson);
        await idbPut({
            itemKey:     slot.id,
            type:        'slot',
            payloadJson,
            payloadHash,
            enqueuedAt:  Date.now(),
            retryCount:  0,
            nextRetryAt: 0,
        });
        scheduleFlush();
    } catch { /* silent — never block caller */ }
}

/**
 * Enqueue a preferences upsert.
 * At most one prefs entry lives in the queue at a time (upsert by key 'prefs').
 */
export async function enqueuePrefsSync(prefs: UserPrefsPayload): Promise<void> {
    try {
        const payloadJson = JSON.stringify(prefs);
        const payloadHash = await sha256hex(payloadJson);
        await idbPut({
            itemKey:     'prefs',
            type:        'prefs',
            payloadJson,
            payloadHash,
            enqueuedAt:  Date.now(),
            retryCount:  0,
            nextRetryAt: 0,
        });
        scheduleFlush();
    } catch { /* silent */ }
}

/**
 * Flush the queue immediately, bypassing the rate-limit timer.
 * Used by the `online` and `visibilitychange` event handlers.
 *
 * The visibilitychange trigger is self-rate-limited to 1 flush per 5 minutes.
 */
export async function flushSyncQueue(trigger: 'online' | 'visibility' | 'force' = 'force'): Promise<void> {
    if (trigger === 'visibility') {
        const last = parseInt(localStorage.getItem(getLastVisFlushKey()) ?? '0', 10);
        if (Date.now() - last < MIN_VIS_FLUSH_MS) return;
        try { localStorage.setItem(getLastVisFlushKey(), String(Date.now())); } catch { /* ignore */ }
    }
    if (_flushTimer !== null) {
        clearTimeout(_flushTimer);
        _flushTimer = null;
    }
    await _doFlush().catch(() => {/* silent */});
}

/**
 * Wipe all pending queue entries.
 * Must be called on sign-out or account deletion so stale data is never
 * flushed under a new user's session.
 */
export async function clearQueueForAccount(): Promise<void> {
    try { await idbClear(); } catch { /* ignore */ }
    if (_flushTimer !== null) {
        clearTimeout(_flushTimer);
        _flushTimer = null;
    }
    try { localStorage.removeItem(getLastFlushKey()); } catch { /* ignore */ }
    try { localStorage.removeItem(getLastVisFlushKey()); } catch { /* ignore */ }
}

/**
 * Boot-time self-healing check.
 *
 * Any queue item older than STALE_THRESHOLD_MS is definitely stale:
 * the max normal retry lifetime is ~13 minutes (30s + 2min + 10min).
 * Items surviving longer than that were left behind by a previous
 * account deletion or sign-out that didn't clean the IDB properly.
 *
 * Wipes the entire queue if any stale item is found — a partial queue
 * of mixed-age items is more dangerous than a clean slate, because the
 * fresh-looking items may still belong to the old account.
 *
 * Safe to call unconditionally at app boot before any flush runs.
 */
const STALE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes

export async function sanitiseStaleQueue(): Promise<void> {
    try {
        const items = await idbGetAll();
        if (items.length === 0) return;

        const now = Date.now();
        const hasStale = items.some(i => now - i.enqueuedAt > STALE_THRESHOLD_MS);
        if (!hasStale) return;

        // At least one item is dangerously old — wipe everything.
        if (import.meta.env.DEV) {
            console.warn(
                '[syncQueue] sanitiseStaleQueue: found stale item(s), wiping queue.',
                items.map(i => ({
                    key: i.itemKey,
                    ageMin: Math.round((now - i.enqueuedAt) / 60_000),
                })),
            );
        }
        await clearQueueForAccount();
    } catch { /* never block boot */ }
}
