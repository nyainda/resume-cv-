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

/** Build the permanent profile URL for a numeric user ID. */
export function buildProfileUrl(userId: number): string {
    const base = window.location.origin + window.location.pathname;
    return `${base}#p=${userId}`;
}

/**
 * Publish (or update) the authenticated user's public profile.
 * Returns true on success.
 */
export async function publishPublicProfile(
    payload: SharedCVPayload,
    sessionToken: string,
): Promise<boolean> {
    try {
        if (!ENGINE_BASE) return false;
        const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
        const res = await fetchWithTimeout(`${ENGINE_BASE}/api/cv/public-profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ payload: compressed }),
        });
        return res.ok;
    } catch {
        return false;
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
            headers: { 'Authorization': `Bearer ${sessionToken}` },
        });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Fetch a public profile by user ID. Returns the decoded SharedCVPayload or null.
 */
export async function fetchPublicProfile(userId: number): Promise<SharedCVPayload | null> {
    try {
        if (!ENGINE_BASE) return null;
        const res = await fetchWithTimeout(
            `${ENGINE_BASE}/api/cv/public-profile?id=${userId}`
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
