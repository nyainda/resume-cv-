/**
 * profileCacheClient.ts
 *
 * Uploads profile snapshots to the cv-engine-worker's D1 profile_cache table.
 *
 * Flow:
 *   1. When a profile is saved or imported, call `syncProfileToCache(slot)`.
 *   2. The function computes a SHA-256 hash of the compact profile JSON.
 *   3. If the hash matches what's already stored in localStorage for this slot,
 *      no network request is made (the profile hasn't changed).
 *   4. Otherwise, the compact profile is POST-ed to /api/cv/profile — stored
 *      once in D1 and never re-sent until the profile actually changes.
 *   5. During generation, `getProfileCacheHash(slotId)` returns the hash so
 *      the generation request can reference the cached profile instead of
 *      re-embedding the full profile text in the prompt.
 *
 * All operations are best-effort. A cache miss never blocks generation.
 */

import type { UserProfileSlot } from '../types';

const ENGINE_URL: string = import.meta.env.VITE_CV_ENGINE_URL ?? '';
const LS_PREFIX = 'cv_builder:profile_cache_hash:';

// ─────────────────────────────────────────────────────────────────────────────
// Compact profile — mirrors the client-side compactProfile() in geminiService.ts
// Must stay in sync: same fields, same truncation limits.
// ─────────────────────────────────────────────────────────────────────────────
export function buildCompactProfileJson(slot: UserProfileSlot): string {
    const profile = slot.profile;
    const MAX_RESP = 350;
    const MAX_PROJ_DESC = 200;

    function strip(obj: any): any {
        if (Array.isArray(obj)) {
            return obj
                .map(strip)
                .filter((v: any) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0));
        }
        if (obj && typeof obj === 'object') {
            const out: any = {};
            for (const [k, v] of Object.entries(obj)) {
                if (k === 'id' || k === 'photo') continue;
                const s = strip(v);
                if (s !== null && s !== undefined && s !== '' && !(Array.isArray(s) && s.length === 0)) {
                    out[k] = s;
                }
            }
            return out;
        }
        return obj;
    }

    const compact = strip({
        personalInfo: profile.personalInfo,
        skills: (profile.skills || []).slice(0, 20),
        projects: (profile.projects || []).slice(0, 6).map(p => ({
            name: p.name,
            description: typeof p.description === 'string' ? p.description.substring(0, MAX_PROJ_DESC) : '',
            link: p.link,
        })),
        workExperience: (profile.workExperience || []).map(e => ({
            company: e.company,
            jobTitle: e.jobTitle,
            startDate: e.startDate,
            endDate: e.endDate,
            pointCount: e.pointCount,
            responsibilities: typeof e.responsibilities === 'string'
                ? e.responsibilities.substring(0, MAX_RESP)
                : (Array.isArray(e.responsibilities)
                    ? (e.responsibilities as string[]).slice(0, 6).join('\n').substring(0, MAX_RESP)
                    : ''),
        })),
        education: (profile.education || []).map(e => ({
            degree: e.degree,
            school: e.school,
            graduationYear: e.graduationYear,
        })),
        languages: profile.languages,
        customSections: profile.customSections,
        sectionOrder: profile.sectionOrder,
    });

    return JSON.stringify(compact);
}

// ─────────────────────────────────────────────────────────────────────────────
// SHA-256 hash (hex) of any string — uses the native Web Crypto API.
// ─────────────────────────────────────────────────────────────────────────────
export async function sha256Hex(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers — persist the last-known hash per slot so we skip
// the network call when the profile hasn't changed.
// ─────────────────────────────────────────────────────────────────────────────
function getStoredHash(slotId: string): string | null {
    try { return localStorage.getItem(LS_PREFIX + slotId); } catch { return null; }
}

function setStoredHash(slotId: string, hash: string): void {
    try { localStorage.setItem(LS_PREFIX + slotId, hash); } catch { }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the cached profile hash for a slot (from localStorage).
 * Returns null if the profile has never been synced.
 * Used by generation code to include profile_hash in requests.
 */
export function getProfileCacheHash(slotId: string): string | null {
    return getStoredHash(slotId);
}

/**
 * Syncs a profile slot to the D1 profile cache.
 *
 * - Computes the compact profile JSON and its SHA-256 hash.
 * - If the hash matches the last stored hash for this slot, returns immediately
 *   (no network call — the profile hasn't changed).
 * - Otherwise, uploads the compact JSON to /api/cv/profile and stores the
 *   new hash in localStorage.
 *
 * Returns the hash on success, null on any failure.
 */
export async function syncProfileToCache(slot: UserProfileSlot): Promise<string | null> {
    if (!ENGINE_URL) return null;

    try {
        const compactJson = buildCompactProfileJson(slot);
        const hash = await sha256Hex(compactJson);

        const stored = getStoredHash(slot.id);
        if (stored === hash) {
            return hash;
        }

        const res = await fetch(`${ENGINE_URL}/api/cv/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hash,
                slot_id:      slot.id,
                slot_name:    slot.name || 'Unnamed Profile',
                compact_json: compactJson,
            }),
            signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
            console.warn(`[ProfileCache] Upload failed (HTTP ${res.status}) for slot ${slot.id}`);
            return null;
        }

        setStoredHash(slot.id, hash);
        console.info(`[ProfileCache] Synced slot "${slot.name}" → ${hash.substring(0, 12)}…`);
        return hash;
    } catch (err: any) {
        console.warn('[ProfileCache] Sync error:', err?.message ?? err);
        return null;
    }
}

/**
 * Verifies that a previously stored hash still exists in D1.
 * Falls back to re-uploading if it's missing (e.g. D1 was wiped).
 * Returns the valid hash, or null on failure.
 */
export async function ensureProfileCached(slot: UserProfileSlot): Promise<string | null> {
    if (!ENGINE_URL) return null;

    const storedHash = getStoredHash(slot.id);

    if (storedHash) {
        try {
            const check = await fetch(
                `${ENGINE_URL}/api/cv/profile?hash=${encodeURIComponent(storedHash)}`,
                { signal: AbortSignal.timeout(3000) }
            );
            if (check.ok) {
                const data = await check.json() as { found?: boolean };
                if (data.found) return storedHash;
            }
        } catch { }
    }

    return syncProfileToCache(slot);
}
