/**
 * vaultService.ts — Job Vault CRUD.
 * Primary store: localStorage (instant, offline-capable).
 * Secondary: D1 via CF Worker (sync on save/update/delete when authenticated).
 */

import type { VaultJob, VaultInputType, VaultRoomType, VaultPriority } from '../types';

const VAULT_KEY = 'procv:vault_jobs';

// ── Backend sync helpers ──────────────────────────────────────────────────────

const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';

function vaultApiUrl(path: string): string {
  if (/^https?:\/\//.test(ENGINE_URL)) return ENGINE_URL + path;
  if (ENGINE_URL) return window.location.origin + ENGINE_URL + path;
  return path; // relative — proxied in dev
}

function isAuthenticated(): boolean {
  try { return !!localStorage.getItem('procv:worker_user'); } catch { return false; }
}

async function apiPost(path: string, body: object): Promise<void> {
  if (!isAuthenticated()) return;
  try {
    await fetch(vaultApiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch { /* offline — localStorage is the source of truth */ }
}

async function apiPatch(path: string, body: object): Promise<void> {
  if (!isAuthenticated()) return;
  try {
    await fetch(vaultApiUrl(path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch { /* offline */ }
}

async function apiDelete(path: string): Promise<void> {
  if (!isAuthenticated()) return;
  try {
    await fetch(vaultApiUrl(path), { method: 'DELETE', credentials: 'include' });
  } catch { /* offline */ }
}

/** Pull server jobs and merge into localStorage (server wins on conflict). */
export async function syncVaultFromServer(): Promise<void> {
  if (!isAuthenticated()) return;
  try {
    const res = await fetch(vaultApiUrl('/api/vault/jobs'), {
      credentials: 'include',
    });
    if (!res.ok) return;
    const data = await res.json() as { ok: boolean; jobs: VaultJob[] };
    if (!data.ok || !Array.isArray(data.jobs) || data.jobs.length === 0) return;

    const local = loadAll();
    const localById = new Map(local.map(j => [j.id, j]));

    // Merge: server wins on updated_at
    for (const sj of data.jobs) {
      const lj = localById.get(sj.id);
      if (!lj || sj.updated_at >= lj.updated_at) {
        localById.set(sj.id, sj);
      }
    }
    saveAll([...localById.values()].sort((a, b) => b.createdAt - a.createdAt));
  } catch { /* offline */ }
}

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
    id:          crypto.randomUUID(),
    roomId:      input.roomId,
    title:       input.title || 'Untitled Role',
    company:     input.company || 'Unknown Company',
    rawJd:       input.rawJd,
    inputType:   input.inputType,
    sourceUrl:   input.sourceUrl,
    deadline:    input.deadline,
    priority:    input.priority,
    roomType:    'uncategorized',
    status:      'saved',
    fingerprint: fp,
    createdAt:   now,
    updatedAt:   now,
  };

  saveAll([newJob, ...jobs]);

  // Fire-and-forget D1 sync (camelCase → snake_case for the API)
  apiPost('/api/vault/jobs', {
    id:          newJob.id,
    room_id:     newJob.roomId,
    title:       newJob.title,
    company:     newJob.company,
    raw_jd:      newJob.rawJd,
    input_type:  newJob.inputType,
    source_url:  newJob.sourceUrl ?? null,
    deadline:    newJob.deadline ?? null,
    priority:    newJob.priority,
    room_type:   newJob.roomType,
    status:      newJob.status,
    fingerprint: newJob.fingerprint,
    created_at:  newJob.createdAt,
    updated_at:  newJob.updatedAt,
  });

  return { job: newJob, isDuplicate: false };
}

export function updateVaultJob(id: string, patch: Partial<VaultJob>): VaultJob | null {
  const jobs = loadAll();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;
  const updated = { ...jobs[idx], ...patch, updatedAt: Date.now() };
  jobs[idx] = updated;
  saveAll(jobs);

  // Translate only the patched fields to snake_case for the API
  const apiPatch: Record<string, unknown> = {};
  if ('matchScore'  in patch) apiPatch['match_score']  = patch.matchScore;
  if ('roomType'    in patch) apiPatch['room_type']    = patch.roomType;
  if ('roomReason'  in patch) apiPatch['room_reason']  = patch.roomReason;
  if ('status'      in patch) apiPatch['status']       = patch.status;
  if ('deadline'    in patch) apiPatch['deadline']     = patch.deadline;
  if ('priority'    in patch) apiPatch['priority']     = patch.priority;
  if ('builtCvId'   in patch) apiPatch['built_cv_id']  = patch.builtCvId;
  if ('title'       in patch) apiPatch['title']        = patch.title;
  if ('company'     in patch) apiPatch['company']      = patch.company;
  if (Object.keys(apiPatch).length > 0) {
    apiPatch['updated_at'] = updated.updatedAt;
    apiPatch['updated_at'] = updated.updatedAt;
    void apiPatch; // suppress unused warning
    // Intentionally fire-and-forget — patch the backend job
    fetch(vaultApiUrl(`/api/vault/jobs/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(apiPatch),
    }).catch(() => {});
  }

  return updated;
}

export function deleteVaultJob(id: string): void {
  saveAll(loadAll().filter(j => j.id !== id));
  apiDelete(`/api/vault/jobs/${id}`);
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
