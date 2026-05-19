/**
 * customTemplateStorage — localStorage CRUD for user-created custom templates.
 *
 * Key: 'cv_builder:customTemplates'
 * Value: JSON array of CustomTemplateEntry
 *
 * Every write operation also fires a fire-and-forget sync to the Cloudflare D1
 * database via customTemplateCloudService, so templates survive browser clears
 * and are accessible across devices sharing the same device_id.
 */
import { CustomTemplateEntry } from '../types';
import {
    syncTemplateToCloud,
    deleteTemplateFromCloud,
    renameTemplateInCloud,
} from '../services/customTemplateCloudService';

const STORAGE_KEY = 'cv_builder:customTemplates';

// ─── Local read/write helpers ─────────────────────────────────────────────────

export function loadCustomTemplates(): CustomTemplateEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as CustomTemplateEntry[];
    } catch {
        return [];
    }
}

function persistLocally(entries: CustomTemplateEntry[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ─── CRUD — local-first, then cloud sync ─────────────────────────────────────

/** Save (insert or update) a template. Also syncs to D1 fire-and-forget. */
export function saveCustomTemplate(entry: CustomTemplateEntry): void {
    const existing = loadCustomTemplates();
    const idx = existing.findIndex(t => t.id === entry.id);
    if (idx >= 0) {
        existing[idx] = entry;
    } else {
        existing.push(entry);
    }
    persistLocally(existing);

    // Fire-and-forget — never blocks the UI
    syncTemplateToCloud(entry).catch(() => {});
}

/** Delete a template by id. Also deletes from D1 fire-and-forget. */
export function deleteCustomTemplate(id: string): void {
    const filtered = loadCustomTemplates().filter(t => t.id !== id);
    persistLocally(filtered);

    deleteTemplateFromCloud(id).catch(() => {});
}

/** Look up a single template by id (local only). */
export function getCustomTemplate(id: string): CustomTemplateEntry | undefined {
    return loadCustomTemplates().find(t => t.id === id);
}

/** Rename a template. Also renames in D1 fire-and-forget. */
export function renameCustomTemplate(id: string, name: string): void {
    const existing = loadCustomTemplates();
    const idx = existing.findIndex(t => t.id === id);
    if (idx >= 0) {
        existing[idx] = { ...existing[idx], name };
        persistLocally(existing);
    }

    renameTemplateInCloud(id, name).catch(() => {});
}
