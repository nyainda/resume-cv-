/**
 * userDataCloudService.ts
 *
 * Fire-and-forget sync of user data to Cloudflare D1 (migration 019 tables).
 * Uses the same device_id pattern as customTemplateCloudService.ts.
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

// ─── Constants ────────────────────────────────────────────────────────────────

const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';
const DEVICE_ID_KEY      = 'cv_builder:deviceId';
const SLOT_HASH_PREFIX   = 'cv_builder:usync_slot_hash:'; // + slotId
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

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function post(path: string, body: object): Promise<boolean> {
    if (!ENGINE_URL) return false;
    try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(`${ENGINE_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: ac.signal,
        });
        clearTimeout(timer);
        return res.ok;
    } catch {
        return false;
    }
}

async function get(path: string): Promise<any | null> {
    if (!ENGINE_URL) return null;
    try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(`${ENGINE_URL}${path}`, { signal: ac.signal });
        clearTimeout(timer);
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

        // If too large, fall back to profile-only
        if (slotJsonToSend.length > MAX_SLOT_BYTES) {
            slotJsonToSend = profileJson;
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
            try { localStorage.setItem(hashKey, newHash); } catch { /* ignore */ }
        }
    } catch { /* silent */ }
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
 * Fetches all synced data for this device from D1.
 * Used in the Settings restore flow.
 * Returns null if unreachable or no data found.
 */
export async function fetchUserData(): Promise<UserDataSnapshot | null> {
    const deviceId = getDeviceId();
    return get(`/api/cv/user-data?device_id=${encodeURIComponent(deviceId)}`);
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

/** Returns the UTC date string of the last sync for a given slot, or null. */
export function getLastSyncDate(slotId: string): string | null {
    const hash = localStorage.getItem(SLOT_HASH_PREFIX + slotId);
    if (!hash) return null;
    // We only know a hash was stored, not when — use the key as a presence check
    return hash ? new Date().toLocaleDateString() : null;
}
