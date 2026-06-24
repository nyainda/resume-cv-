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
        if (!res.ok) return null;
        const data = await res.json() as { slug?: string; user_id?: number };
        // Prefer slug (non-enumerable); fall back to numeric ID for legacy deployments.
        return data.slug ?? (data.user_id ? String(data.user_id) : null);
    } catch {
        return null;
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
        const data = await res.json() as { payload?: string };
        if (!data.payload) return null;
        const json = LZString.decompressFromEncodedURIComponent(data.payload);
        if (!json) return null;
        return JSON.parse(json) as SharedCVPayload;
    } catch {
        return null;
    }
}
