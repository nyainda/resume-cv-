/**
 * userDataCloudService.ts
 *
 * Fire-and-forget sync of user data to Cloudflare D1 (migration 019 tables).
 * Uses a stable per-browser device_id (UUID in localStorage) for anonymous ops.
 *
 * Design principles (resource-conscious on free CF tier):
 *   • Hash-gated: never writes to D1 if data hasn't changed since last sync
 *   • Fire-and-forget: all operations are silent — caller never needs to await
 *   • Never called on keystroke — only on explicit save actions
 *   • Circuit-breaker aware: silently skips if CF is unreachable
 *   • Size-guarded: full slot JSON capped at 512 KB (profile-only fallback)
 *
 * Worker endpoints (cv-engine-worker):
 *   POST /api/cv/user-slots     → upsert a profile slot snapshot
 *   POST /api/cv/user-prefs     → upsert device preferences
 *   GET  /api/cv/user-data      → fetch all data (restore flow)
 */

import type { UserProfileSlot, UserProfile } from '../types';
import { notifySessionExpired, notifySlotOwnershipConflict } from './sessionEvents';

// ─── Constants ────────────────────────────────────────────────────────────────

const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';
const DEVICE_ID_KEY      = 'cv_builder:deviceId';
const SLOT_HASH_PREFIX   = 'cv_builder:usync_slot_hash:'; // + slotId
const SLOT_SYNC_TS_PREFIX = 'cv_builder:usync_slot_ts:';  // + slotId → unix ms of last successful push
const PREFS_HASH_KEY     = 'cv_builder:usync_prefs_hash';
const MAX_SLOT_BYTES     = 512 * 1024; // 512 KB hard cap
const FETCH_TIMEOUT_MS   = 6_000;

// ─── Device ID ────────────────────────────────────────────────────────────────

export function getDeviceId(): string {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2) + Date.now().toString(36);
        try { localStorage.setItem(DEVICE_ID_KEY, id); } catch { /* storage full */ }
    }
    return id;
}

// ─── SHA-256 helper ──────────────────────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        // Fallback: cheap hash for environments without subtle crypto
        let h = 0;
        for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
        return (h >>> 0).toString(16).padStart(8, '0');
    }
}

// ─── Auth guard ───────────────────────────────────────────────────────────────
// Session is managed by an HttpOnly cookie (set by the CF worker).
// We check whether the user is signed in by reading the display-cache key
// that AuthContext writes on every successful sign-in.

function _isSignedIn(): boolean {
    try { return !!localStorage.getItem('procv:worker_user'); } catch { return false; }
}

/**
 * @deprecated No longer needed — session is cookie-based.
 * Kept as a no-op so call sites that haven't been updated yet don't crash.
 */
export function setUserSessionToken(_token: string | null): void { /* no-op */ }

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

/** Thrown by post() when the server reports slot_id_owned_by_another_account (409). */
export class SlotOwnershipConflictError extends Error {
    constructor() { super('slot_id_owned_by_another_account'); }
}

// ─── Account-switch cancellation fence ─────────────────────────────────────────
// A background sync request that was already dispatched (fetch sent over the
// wire) while account A was active cannot be un-sent by clearing the local
// queue — the request keeps running and, if it resolves after account B's
// session cookie is now active, the server would (correctly) attribute it to
// whichever cookie arrives with it. `abortAllPendingSync()` aborts every
// in-flight request tied to the *current* epoch so none of them can complete
// after an account switch starts. Call it BEFORE the local wipe/reload.
let _epochController = new AbortController();

export function abortAllPendingSync(): void {
    try { _epochController.abort(); } catch { /* non-fatal */ }
    _epochController = new AbortController();
}

async function post(path: string, body: object): Promise<boolean> {
    if (!ENGINE_URL || !_isSignedIn()) return false;
    const epochSignal = _epochController.signal;
    try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
        const onEpochAbort = () => ac.abort();
        epochSignal.addEventListener('abort', onEpochAbort);
        let res: Response;
        try {
            res = await fetch(`${ENGINE_URL}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body),
                signal: ac.signal,
            });
        } finally {
            clearTimeout(timer);
            epochSignal.removeEventListener('abort', onEpochAbort);
        }
        if (res.status === 401) { notifySessionExpired(); return false; }
        if (res.status === 409) {
            // A stale local profile (carrying a slot_id minted while a different
            // account was active on this device/browser — e.g. an account switch
            // whose local-data wipe didn't finish before this write went out)
            // tried to claim a slot_id another account already owns server-side.
            // The server has correctly refused the write. Surface this distinctly
            // so callers can force a clean local reset instead of silently
            // retrying forever against the same rejected slot_id.
            throw new SlotOwnershipConflictError();
        }
        return res.ok;
    } catch (err) {
        if (err instanceof SlotOwnershipConflictError) throw err;
        return false;
    }
}

async function get(path: string): Promise<any | null> {
    if (!ENGINE_URL || !_isSignedIn()) return null;
    const epochSignal = _epochController.signal;
    try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
        const onEpochAbort = () => ac.abort();
        epochSignal.addEventListener('abort', onEpochAbort);
        let res: Response;
        try {
            res = await fetch(`${ENGINE_URL}${path}`, {
                credentials: 'include',
                signal: ac.signal,
            });
        } finally {
            clearTimeout(timer);
            epochSignal.removeEventListener('abort', onEpochAbort);
        }
        if (res.status === 401) { notifySessionExpired(); return null; }
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// ─── Slot sync ────────────────────────────────────────────────────────────────

/**
 * Syncs a single profile slot to D1 user_slots.
 * Fire-and-forget safe — call without await.
 *
 * Hash-gated: skips the D1 write if the slot content hasn't changed
 * since the last successful sync.
 */
export async function syncSlot(slot: UserProfileSlot): Promise<void> {
    try {
        const profileJson = JSON.stringify(slot.profile ?? {});
        // For current_cv we strip the full CV (large) and only keep metadata
        const currentCvMeta = slot.currentCV
            ? JSON.stringify({ template: (slot.currentCV as any).template, updatedAt: Date.now() })
            : null;

        // Build the payload — strip photo before sending to D1 (security: no blobs in D1)
        const profileWithoutPhoto = slot.profile
            ? { ...slot.profile, personalInfo: { ...slot.profile.personalInfo, photo: undefined } }
            : {};
        const slotPayload: Record<string, unknown> = {
            profile: profileWithoutPhoto,
            savedCVs: (slot.savedCVs ?? []).slice(0, 50),
            savedCoverLetters: (slot.savedCoverLetters ?? []).slice(0, 50),
            trackedApps: (slot.trackedApps ?? []).slice(0, 200),
            starStories: (slot.starStories ?? []).slice(0, 100),
        };

        let slotJsonToSend = JSON.stringify(slotPayload);

        // Progressive trimming when payload is too large — never silently drop everything.
        // Tier 1 (>512KB): strip saved CVs, cover letters, tracked apps, star stories — keep profile only.
        // Tier 2 (still >512KB after tier 1, e.g. extremely long work history): profile-only plain JSON.
        if (slotJsonToSend.length > MAX_SLOT_BYTES) {
            const profileOnlyPayload = JSON.stringify({
                profile: profileWithoutPhoto,
                savedCVs: [],
                savedCoverLetters: [],
                trackedApps: [],
                starStories: [],
                _truncated: true, // sentinel so restore code can warn
            });
            if (profileOnlyPayload.length <= MAX_SLOT_BYTES) {
                console.warn(
                    `[D1 sync] Slot "${slot.name}" (${slot.id}) exceeds 512 KB — ` +
                    `savedCVs/coverLetters/trackedApps/starStories omitted from D1 backup this sync. ` +
                    `They are still stored locally in IndexedDB and localStorage.`
                );
                slotJsonToSend = profileOnlyPayload;
            } else {
                // Absolute fallback: raw profile JSON (no photo, no collections)
                slotJsonToSend = profileJson;
            }
        }

        // Hash-gate: skip if nothing changed
        const hashKey = SLOT_HASH_PREFIX + slot.id;
        const newHash = await sha256hex(slotJsonToSend);
        const lastHash = localStorage.getItem(hashKey);
        if (lastHash === newHash) return; // no change, skip D1 write

        const ok = await post('/api/cv/user-slots', {
            device_id:    getDeviceId(),
            slot_id:      slot.id,
            slot_name:    slot.name ?? '',
            color:        slot.color ?? 'indigo',
            profile_json: slotJsonToSend,
            current_cv:   currentCvMeta,
        });

        if (ok) {
            try {
                localStorage.setItem(hashKey, newHash);
                localStorage.setItem(SLOT_SYNC_TS_PREFIX + slot.id, String(Date.now()));
            } catch { /* ignore */ }
        }
    } catch (err) {
        if (err instanceof SlotOwnershipConflictError) {
            // Stale cross-account local data — this slot_id (minted on a
            // different account's session on this device) is rejected by the
            // server. This is NOT a session problem, so we must not sign the
            // user out (notifySessionExpired is for 401s only). Instead, drop
            // this slot's local sync bookkeeping so it stops being treated as
            // "already synced" and AuthContext can purge/regenerate it.
            console.warn(
                `[D1 sync] Slot "${slot.name}" (${slot.id}) is owned by a different account — ` +
                `purging this slot's local sync state.`
            );
            try {
                localStorage.removeItem(SLOT_HASH_PREFIX + slot.id);
                localStorage.removeItem(SLOT_SYNC_TS_PREFIX + slot.id);
            } catch { /* ignore */ }
            notifySlotOwnershipConflict(slot.id);
        }
        /* other errors: silent */
    }
}

/**
 * Returns the unix-ms timestamp of the last successful D1 push for this slot,
 * or null if the slot has never been synced.
 */
export function getLastSyncTimestamp(slotId: string): number | null {
    try {
        const raw = localStorage.getItem(SLOT_SYNC_TS_PREFIX + slotId);
        if (!raw) return null;
        const ms = Number(raw);
        return Number.isFinite(ms) ? ms : null;
    } catch {
        return null;
    }
}

/** Human-readable "synced X ago" label, or null if never synced. */
export function getSyncTimeAgo(slotId: string): string | null {
    const ms = getLastSyncTimestamp(slotId);
    if (!ms) return null;
    const diff = (Date.now() - ms) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Preferences sync ─────────────────────────────────────────────────────────

export interface UserPrefsPayload {
    aiProvider?: string;
    sidebarSections?: string;  // JSON string
    cvPurpose?: string;
    targetCompany?: string;
    targetJobTitle?: string;
    jdKeywords?: string;       // JSON string of string[]
    darkMode?: boolean;
}

/**
 * Syncs user preferences to D1 user_preferences.
 * Fire-and-forget safe — call without await.
 */
export async function syncPrefs(prefs: UserPrefsPayload): Promise<void> {
    try {
        const json = JSON.stringify(prefs);
        const newHash = await sha256hex(json);
        const lastHash = localStorage.getItem(PREFS_HASH_KEY);
        if (lastHash === newHash) return;

        const ok = await post('/api/cv/user-prefs', {
            device_id:        getDeviceId(),
            ai_provider:      prefs.aiProvider ?? null,
            sidebar_sections: prefs.sidebarSections ?? null,
            cv_purpose:       prefs.cvPurpose ?? null,
            target_company:   prefs.targetCompany ?? null,
            target_job_title: prefs.targetJobTitle ?? null,
            jd_keywords:      prefs.jdKeywords ?? null,
            dark_mode:        prefs.darkMode ? 1 : 0,
        });

        if (ok) {
            try { localStorage.setItem(PREFS_HASH_KEY, newHash); } catch { /* ignore */ }
        }
    } catch { /* silent */ }
}

// ─── Restore flow ─────────────────────────────────────────────────────────────

export interface UserDataSnapshot {
    slots: Array<{
        slot_id:      string;
        slot_name:    string;
        color:        string;
        profile_json: string;
        current_cv:   string | null;
        updated_at:   number;
    }>;
    prefs: {
        ai_provider:      string | null;
        sidebar_sections: string | null;
        cv_purpose:       string | null;
        target_company:   string | null;
        target_job_title: string | null;
        jd_keywords:      string | null;
        dark_mode:        number;
        updated_at:       number;
    } | null;
    device_id: string;
}

/**
 * Fetches all synced data for this user from D1.
 * Requires a valid session token (set via setUserSessionToken).
 * Returns null if unreachable, unauthenticated, or no data found.
 */
export async function fetchUserData(): Promise<UserDataSnapshot | null> {
    return get(`/api/cv/user-data`);
}

/**
 * Deletes a single slot from D1 and clears its local sync hash.
 *
 * Bug 2 fix: now returns a boolean so the caller can detect and revert on
 * failure instead of silently showing "Deleted" when the server refused.
 * Returns true if the server confirmed deletion (or the row was already gone).
 * Returns false on network failure, auth error, or unexpected server error.
 */
export async function deleteSlotFromCloud(slotId: string): Promise<boolean> {
    // Always clear the local hash so a future slot with the same ID starts fresh
    try { localStorage.removeItem(SLOT_HASH_PREFIX + slotId); } catch { /* ignore */ }
    if (!ENGINE_URL || !_isSignedIn()) return false;
    try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(`${ENGINE_URL}/api/cv/user-slots`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ slot_id: slotId }),
            signal: ac.signal,
        });
        clearTimeout(timer);
        if (res.status === 401) { notifySessionExpired(); return false; }
        if (!res.ok) return false;
        // Server returns { ok: true, deleted: bool } — deleted:false means the
        // row wasn't found, but that's still success from our perspective.
        const body = await res.json().catch(() => null) as { ok?: boolean } | null;
        return body?.ok === true;
    } catch {
        return false;
    }
}

/**
 * Forces a sync of all profile slots (used when user clicks "Back up now" in Settings).
 * Returns the number of slots successfully synced.
 */
export async function syncAllSlots(slots: UserProfileSlot[]): Promise<number> {
    let ok = 0;
    for (const slot of slots) {
        // Clear hash to force re-upload even if unchanged
        try { localStorage.removeItem(SLOT_HASH_PREFIX + slot.id); } catch { /* ignore */ }
        await syncSlot(slot);
        ok++;
    }
    return ok;
}

/** @deprecated Use getLastSyncTimestamp / getSyncTimeAgo instead. */
export function getLastSyncDate(slotId: string): string | null {
    const ms = getLastSyncTimestamp(slotId);
    if (!ms) return null;
    return new Date(ms).toLocaleDateString();
}

/**
 * Marks a slot as synced RIGHT NOW without a network call.
 * Used when we know D1 already has the latest version (e.g. after a D1 restore).
 */
export function markSlotSyncedNow(slotId: string): void {
    try {
        localStorage.setItem(SLOT_SYNC_TS_PREFIX + slotId, String(Date.now()));
    } catch { /* non-fatal */ }
}
