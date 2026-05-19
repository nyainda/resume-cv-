/**
 * customTemplateCloudService.ts
 *
 * Syncs custom templates to the Cloudflare D1 database via the cv-engine-worker.
 * Uses a stable per-browser `device_id` (UUID stored in localStorage) as the
 * user identifier — no login required.
 *
 * All operations are fire-and-forget safe: the caller never needs to await them
 * for correctness. Failures are silently swallowed so cloud sync never blocks
 * the local-first localStorage flow.
 *
 * Worker endpoints (cv-engine-worker):
 *   GET  /api/cv/custom-templates?device_id=<id>           → list templates
 *   POST /api/cv/custom-templates                          → upsert template
 *   DELETE /api/cv/custom-templates/:id?device_id=<id>    → delete template
 *   PATCH /api/cv/custom-templates/:id                    → rename template
 */

import type { CustomTemplateEntry } from '../types';

const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';

const DEVICE_ID_KEY = 'cv_builder:deviceId';

/** Returns a stable UUID per browser, creating one on first call. */
function getDeviceId(): string {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

/** Encode a CustomTemplateEntry as the JSON blob stored in D1. */
function encodeSpec(entry: CustomTemplateEntry): string {
    return JSON.stringify({
        spec:           entry.spec,
        customizations: entry.customizations ?? null,
        createdAt:      entry.createdAt,
    });
}

/** Decode a D1 row back into a partial CustomTemplateEntry (no id/name — caller merges those). */
function decodeSpec(specJson: string): Pick<CustomTemplateEntry, 'spec' | 'customizations' | 'createdAt'> {
    try {
        const parsed = JSON.parse(specJson);
        return {
            spec:           parsed.spec,
            customizations: parsed.customizations ?? undefined,
            createdAt:      parsed.createdAt ?? new Date().toISOString(),
        };
    } catch {
        return { spec: {} as any, createdAt: new Date().toISOString() };
    }
}

/**
 * Upsert a custom template to the D1 database.
 * Safe to call fire-and-forget.
 */
export async function syncTemplateToCloud(entry: CustomTemplateEntry): Promise<boolean> {
    if (!ENGINE_URL) return false;
    try {
        const res = await fetch(`${ENGINE_URL}/api/cv/custom-templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_id: getDeviceId(),
                id:        entry.id,
                name:      entry.name,
                spec_json: encodeSpec(entry),
                thumbnail: entry.thumbnail ?? null,
            }),
            signal: AbortSignal.timeout(8000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Delete a custom template from the D1 database.
 * Safe to call fire-and-forget.
 */
export async function deleteTemplateFromCloud(id: string): Promise<boolean> {
    if (!ENGINE_URL) return false;
    try {
        const deviceId = getDeviceId();
        const res = await fetch(
            `${ENGINE_URL}/api/cv/custom-templates/${encodeURIComponent(id)}?device_id=${encodeURIComponent(deviceId)}`,
            { method: 'DELETE', signal: AbortSignal.timeout(8000) },
        );
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Rename a custom template in the D1 database.
 * Safe to call fire-and-forget.
 */
export async function renameTemplateInCloud(id: string, name: string): Promise<boolean> {
    if (!ENGINE_URL) return false;
    try {
        const res = await fetch(
            `${ENGINE_URL}/api/cv/custom-templates/${encodeURIComponent(id)}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_id: getDeviceId(), name }),
                signal: AbortSignal.timeout(8000),
            },
        );
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Fetch all custom templates from D1 for this device.
 * Returns an empty array on any error — callers should merge with localStorage.
 */
export async function loadTemplatesFromCloud(): Promise<CustomTemplateEntry[]> {
    if (!ENGINE_URL) return [];
    try {
        const deviceId = getDeviceId();
        const res = await fetch(
            `${ENGINE_URL}/api/cv/custom-templates?device_id=${encodeURIComponent(deviceId)}`,
            { signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) return [];
        const data = await res.json();
        const rows: any[] = data.templates ?? [];
        return rows.map(row => ({
            id:        row.id,
            name:      row.name,
            thumbnail: row.thumbnail ?? undefined,
            ...decodeSpec(row.spec_json ?? '{}'),
        }));
    } catch {
        return [];
    }
}

/**
 * Bootstrap: pull templates from D1 and merge them into localStorage.
 * Local templates take precedence (same id = keep local version).
 * Called once on app boot so templates are available even after a browser clear.
 */
export async function bootstrapTemplatesFromCloud(
    localLoad: () => CustomTemplateEntry[],
    localSave: (entries: CustomTemplateEntry[]) => void,
): Promise<void> {
    const cloud = await loadTemplatesFromCloud();
    if (cloud.length === 0) return;

    const local     = localLoad();
    const localIds  = new Set(local.map(t => t.id));
    const newFromCloud = cloud.filter(t => !localIds.has(t.id));

    if (newFromCloud.length > 0) {
        localSave([...local, ...newFromCloud]);
    }
}
