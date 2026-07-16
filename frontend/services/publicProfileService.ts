// services/publicProfileService.ts
//
// Manages permanent public profile pages.
//
//   GET  /api/cv/public-profile?id=<userId>  — fetch someone's published CV
//   POST /api/cv/public-profile              — publish / update your CV (auth)
//   DELETE /api/cv/public-profile            — unpublish (auth)
//
// Profile URL format:  https://<domain>/#p=<userId>

import { SharedCVPayload } from '../components/ShareCVModal';
import LZString from 'lz-string';
import { notifySessionExpired } from './sessionEvents';

const ENGINE_BASE: string = (import.meta.env.VITE_CV_ENGINE_URL ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

/** Build the permanent profile URL using the random slug (preferred, non-enumerable). */
export function buildProfileUrl(slug: string): string {
    const base = window.location.origin + window.location.pathname;
    return `${base}#p=${slug}`;
}

/** Legacy: build URL from integer user ID. Only used as fallback. */
export function buildProfileUrlById(userId: number): string {
    const base = window.location.origin + window.location.pathname;
    return `${base}#p=${userId}`;
}

/**
 * Publish (or update) the authenticated user's public profile.
 * Returns the random slug on success (used to build the share URL), or null on failure.
 */
export async function publishPublicProfile(
    payload: SharedCVPayload,
    sessionToken: string,
): Promise<string | null> {
    try {
        if (!ENGINE_BASE) return null;
        const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
        const res = await fetchWithTimeout(`${ENGINE_BASE}/api/cv/public-profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {}),
            },
            credentials: 'include',
            body: JSON.stringify({ payload: compressed }),
        });
        if (res.status === 401) { notifySessionExpired(); return null; }
        if (!res.ok) return null;
        const data = await res.json() as { slug?: string; user_id?: number };
        // Prefer slug (non-enumerable); fall back to numeric ID for legacy deployments.
        return data.slug ?? (data.user_id ? String(data.user_id) : null);
    } catch {
        return null;
    }
}

/** Allowed custom slug pattern: 3–30 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$|^[a-z0-9]{3}$/;

const RESERVED_SLUGS = new Set([
    'api', 'admin', 'cv', 'profile', 'user', 'me', 'null', 'undefined',
    'help', 'about', 'support', 'blog', 'www', 'auth', 'login', 'signup',
]);

/**
 * Validate a candidate custom slug on the client side.
 * Returns null if valid, or an error string describing the problem.
 */
export function validateSlug(slug: string): string | null {
    if (slug.length < 3)  return 'Must be at least 3 characters';
    if (slug.length > 30) return 'Must be 30 characters or fewer';
    if (!SLUG_PATTERN.test(slug)) return 'Only lowercase letters, numbers, and hyphens — no leading/trailing hyphens';
    if (RESERVED_SLUGS.has(slug)) return `"${slug}" is a reserved name`;
    return null;
}

/**
 * Set a custom slug for the authenticated user's public profile.
 * Returns { ok: true, slug } on success, or { ok: false, error } on failure.
 */
export async function setCustomProfileSlug(
    slug: string,
    sessionToken: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: 'slug_taken' | 'not_published' | 'invalid' | 'network' }> {
    try {
        if (!ENGINE_BASE) return { ok: false, error: 'network' };
        const res = await fetchWithTimeout(`${ENGINE_BASE}/api/cv/public-profile/slug`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {}),
            },
            credentials: 'include',
            body: JSON.stringify({ slug }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({})) as { error?: string };
            if (data.error === 'slug_taken') return { ok: false, error: 'slug_taken' };
            if (data.error === 'not_published') return { ok: false, error: 'not_published' };
            if (data.error === 'invalid_slug') return { ok: false, error: 'invalid' };
            return { ok: false, error: 'network' };
        }
        const data = await res.json() as { slug?: string };
        return { ok: true, slug: data.slug ?? slug };
    } catch {
        return { ok: false, error: 'network' };
    }
}

/**
 * Check whether a custom slug is available (not taken by another user).
 * Uses the unauthenticated /slug/check endpoint — no session required.
 * Returns 'available', 'taken', 'invalid', or 'error'.
 */
export async function checkSlugAvailability(
    slug: string,
): Promise<'available' | 'taken' | 'invalid' | 'error'> {
    const clientErr = validateSlug(slug);
    if (clientErr) return 'invalid';
    try {
        if (!ENGINE_BASE) return 'error';
        const res = await fetchWithTimeout(
            `${ENGINE_BASE}/api/cv/public-profile/slug/check?slug=${encodeURIComponent(slug)}`
        );
        if (!res.ok) return 'error';
        const data = await res.json() as { available?: boolean; valid?: boolean };
        if (data.valid === false) return 'invalid';
        return data.available ? 'available' : 'taken';
    } catch {
        return 'error';
    }
}

/**
 * Unpublish the authenticated user's public profile.
 * Returns true on success.
 */
export async function unpublishPublicProfile(sessionToken: string): Promise<boolean> {
    try {
        if (!ENGINE_BASE) return false;
        const res = await fetchWithTimeout(`${ENGINE_BASE}/api/cv/public-profile`, {
            method: 'DELETE',
            headers: sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {},
            credentials: 'include',
        });
        if (res.status === 401) { notifySessionExpired(); return false; }
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Fetch a public profile by slug (preferred) or legacy integer user ID.
 * Slug-based URLs are non-enumerable; integer IDs are legacy fallback.
 */
export async function fetchPublicProfile(slugOrId: string | number): Promise<SharedCVPayload | null> {
    try {
        if (!ENGINE_BASE) return null;
        // Use ?slug= for string slugs; ?id= for legacy integer IDs
        const param = typeof slugOrId === 'number' || /^\d+$/.test(String(slugOrId))
            ? `id=${slugOrId}`
            : `slug=${encodeURIComponent(String(slugOrId))}`;
        const res = await fetchWithTimeout(
            `${ENGINE_BASE}/api/cv/public-profile?${param}`
        );
        if (!res.ok) return null;
        const data = await res.json() as { payload?: string; show_branding?: boolean };
        if (!data.payload) return null;
        const json = LZString.decompressFromEncodedURIComponent(data.payload);
        if (!json) return null;
        const parsed = JSON.parse(json) as SharedCVPayload;
        // Always trust the server's live tier check over whatever branding flag
        // was baked into the payload at share-time — if the owner has since
        // upgraded (or downgraded), viewers must see the current state, not a
        // stale snapshot from whenever "Share" was last clicked.
        if (typeof data.show_branding === 'boolean') {
            parsed.procvBranding = data.show_branding;
        }
        return parsed;
    } catch {
        return null;
    }
}
