/**
 * vaultService.ts — Job Vault CRUD using localStorage.
 * Scoped to the current user via a prefix; no D1 sync in v1.
 */

import type { VaultJob, VaultInputType, VaultRoomType, VaultPriority } from '../types';

const VAULT_KEY = 'procv:vault_jobs';

function getKey(): string {
  try {
    const raw = localStorage.getItem('procv:worker_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.id) return `procv:vault_jobs:${u.id}`;
    }
  } catch { /* ignore */ }
  return VAULT_KEY;
}

function loadAll(): VaultJob[] {
  try {
    const raw = localStorage.getItem(getKey());
    if (!raw) return [];
    return JSON.parse(raw) as VaultJob[];
  } catch {
    return [];
  }
}

function saveAll(jobs: VaultJob[]): void {
  try {
    localStorage.setItem(getKey(), JSON.stringify(jobs));
  } catch { /* storage full */ }
}

/** Simple fingerprint: title+company+first-100-chars of JD */
export function buildFingerprint(title: string, company: string, rawJd: string): string {
  const raw = `${title.toLowerCase()}|${company.toLowerCase()}|${rawJd.slice(0, 100)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function getAllVaultJobs(): VaultJob[] {
  return loadAll();
}

export function getVaultJobsForRoom(roomId: string): VaultJob[] {
  return loadAll().filter(j => j.roomId === roomId);
}

export interface SaveVaultJobInput {
  roomId:     string;
  title:      string;
  company:    string;
  rawJd:      string;
  inputType:  VaultInputType;
  sourceUrl?: string;
  deadline?:  string;
  priority:   VaultPriority;
}

export interface SaveVaultJobResult {
  job:         VaultJob;
  isDuplicate: boolean;
  existingId?: string;
}

export function saveVaultJob(input: SaveVaultJobInput): SaveVaultJobResult {
  const jobs = loadAll();
  const fp = buildFingerprint(input.title, input.company, input.rawJd);

  const existing = jobs.find(j => j.fingerprint === fp && j.roomId === input.roomId);
  if (existing) {
    return { job: existing, isDuplicate: true, existingId: existing.id };
  }

  const now = Date.now();
  const newJob: VaultJob = {
    id:         crypto.randomUUID(),
    roomId:     input.roomId,
    title:      input.title || 'Untitled Role',
    company:    input.company || 'Unknown Company',
    rawJd:      input.rawJd,
    inputType:  input.inputType,
    sourceUrl:  input.sourceUrl,
    deadline:   input.deadline,
    priority:   input.priority,
    roomType:   'uncategorized',
    status:     'saved',
    fingerprint: fp,
    createdAt:  now,
    updatedAt:  now,
  };

  saveAll([newJob, ...jobs]);
  return { job: newJob, isDuplicate: false };
}

export function updateVaultJob(id: string, patch: Partial<VaultJob>): VaultJob | null {
  const jobs = loadAll();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;
  const updated = { ...jobs[idx], ...patch, updatedAt: Date.now() };
  jobs[idx] = updated;
  saveAll(jobs);
  return updated;
}

export function deleteVaultJob(id: string): void {
  saveAll(loadAll().filter(j => j.id !== id));
}

/** Cheap title/company extractor from raw JD text */
export function extractTitleCompany(rawJd: string): { title: string; company: string } {
  const lines = rawJd.split('\n').map(l => l.trim()).filter(Boolean);
  // Heuristic: first short line often has the title
  const titleLine = lines.find(l => l.length < 80 && l.length > 3) ?? '';
  // Look for "at <company>" or "@ <company>" patterns
  const atMatch = rawJd.match(/(?:at|@)\s+([A-Z][a-zA-Z0-9\s&.,'-]{1,40})/);
  const company = atMatch ? atMatch[1].trim() : '';
  return { title: titleLine, company };
}

/** Naive match score based on keyword overlap — used client-side until Worker classifies */
export function naiveMatchScore(rawJd: string, profileSkills: string): number {
  const jdLower = rawJd.toLowerCase();
  const skills = profileSkills.toLowerCase().split(/[\s,;|/]+/).filter(s => s.length > 2);
  if (!skills.length) return 0;
  const matched = skills.filter(s => jdLower.includes(s));
  return Math.round((matched.length / skills.length) * 100);
}

/** Determine room type by score */
export function roomTypeFromScore(score: number): VaultRoomType {
  if (score >= 65) return 'primary';
  if (score >= 40) return 'stretch';
  return 'uncategorized';
}
