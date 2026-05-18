/**
 * customTemplateStorage — localStorage CRUD for user-created custom templates.
 *
 * Key: 'cv_builder:customTemplates'
 * Value: JSON array of CustomTemplateEntry
 */
import { CustomTemplateEntry } from '../types';

const STORAGE_KEY = 'cv_builder:customTemplates';

export function loadCustomTemplates(): CustomTemplateEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomTemplateEntry[];
  } catch {
    return [];
  }
}

export function saveCustomTemplate(entry: CustomTemplateEntry): void {
  const existing = loadCustomTemplates();
  const idx = existing.findIndex(t => t.id === entry.id);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function deleteCustomTemplate(id: string): void {
  const existing = loadCustomTemplates().filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function getCustomTemplate(id: string): CustomTemplateEntry | undefined {
  return loadCustomTemplates().find(t => t.id === id);
}

export function renameCustomTemplate(id: string, name: string): void {
  const existing = loadCustomTemplates();
  const idx = existing.findIndex(t => t.id === id);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], name };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  }
}
