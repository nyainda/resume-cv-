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

async function apiDelete(path: string): Promise<void> {
  if (!isAuthenticated()) return;
  try {
    await fetch(vaultApiUrl(path), { method: 'DELETE', credentials: 'include' });
  } catch { /* offline */ }
}

/**
 * Map a raw D1 snake_case row to a camelCase VaultJob.
 * D1 returns column names unchanged (snake_case); all our runtime types are camelCase.
 * Handles both snake_case (server) and camelCase (already-converted) so the
 * function is safe to call on either shape.
 */
function rowToVaultJob(row: any): VaultJob {
  return {
    id:           row.id,
    roomId:       row.room_id       ?? row.roomId       ?? '',
    title:        row.title         ?? 'Untitled Role',
    company:      row.company       ?? 'Unknown Company',
    rawJd:        row.raw_jd        ?? row.rawJd        ?? '',
    inputType:    (row.input_type   ?? row.inputType    ?? 'paste') as VaultInputType,
    sourceUrl:    row.source_url    ?? row.sourceUrl,
    deadline:     row.deadline,
    priority:     (row.priority     ?? 'medium') as VaultPriority,
    roomType:     (row.room_type    ?? row.roomType     ?? 'uncategorized') as VaultRoomType,
    status:       row.status        ?? 'saved',
    fingerprint:  row.fingerprint   ?? '',
    createdAt:    typeof row.created_at === 'number'
                    ? row.created_at
                    : (typeof row.createdAt === 'number' ? row.createdAt : Date.now()),
    updatedAt:    typeof row.updated_at === 'number'
                    ? row.updated_at
                    : (typeof row.updatedAt === 'number' ? row.updatedAt : Date.now()),
    matchScore:   row.match_score   ?? row.matchScore,
    roomReason:   row.room_reason   ?? row.roomReason,
    builtCvId:    row.built_cv_id   ?? row.builtCvId,
    tldr:         row.tldr,
    requirements: row.requirements,
    email:        row.email,
    website:      row.website,
    salary:       row.salary,
    analysed:     !!row.analysed,
  };
}

/** Pull server jobs and merge into localStorage (server wins on conflict). */
export async function syncVaultFromServer(): Promise<void> {
  if (!isAuthenticated()) return;
  try {
    const res = await fetch(vaultApiUrl('/api/vault/jobs'), {
      credentials: 'include',
    });
    if (!res.ok) return;
    const data = await res.json() as { ok: boolean; jobs: any[] };
    if (!data.ok || !Array.isArray(data.jobs) || data.jobs.length === 0) return;

    // D1 returns snake_case column names — convert each row to a camelCase VaultJob
    const serverJobs: VaultJob[] = data.jobs.map(rowToVaultJob);

    const local = loadAll();
    const localById = new Map(local.map(j => [j.id, j]));

    // Merge: server wins when its updatedAt is newer (or job is missing locally)
    for (const sj of serverJobs) {
      const lj = localById.get(sj.id);
      if (!lj || sj.updatedAt >= lj.updatedAt) {
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
  const raw = `${(title ?? '').toLowerCase()}|${(company ?? '').toLowerCase()}|${(rawJd ?? '').slice(0, 100)}`;
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
  if ('matchScore'   in patch) apiPatch['match_score']   = patch.matchScore;
  if ('roomType'     in patch) apiPatch['room_type']     = patch.roomType;
  if ('roomReason'   in patch) apiPatch['room_reason']   = patch.roomReason;
  if ('status'       in patch) apiPatch['status']        = patch.status;
  if ('deadline'     in patch) apiPatch['deadline']      = patch.deadline;
  if ('priority'     in patch) apiPatch['priority']      = patch.priority;
  if ('builtCvId'    in patch) apiPatch['built_cv_id']   = patch.builtCvId;
  if ('title'        in patch) apiPatch['title']         = patch.title;
  if ('company'      in patch) apiPatch['company']       = patch.company;
  if ('tldr'         in patch) apiPatch['tldr']          = patch.tldr;
  if ('requirements' in patch) apiPatch['requirements']  = patch.requirements;
  if ('email'        in patch) apiPatch['email']         = patch.email;
  if ('website'      in patch) apiPatch['website']       = patch.website;
  if ('salary'       in patch) apiPatch['salary']        = patch.salary;
  if ('analysed'     in patch) apiPatch['analysed']      = patch.analysed;
  if ('notes'        in patch) apiPatch['notes']         = patch.notes;
  if ('remote'       in patch) apiPatch['remote']        = patch.remote;
  if ('location'     in patch) apiPatch['location']      = patch.location;
  if (Object.keys(apiPatch).length > 0) {
    apiPatch['updated_at'] = updated.updatedAt;
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

/** Fast title/company extractor from raw JD text — used synchronously on save.
 *  vaultAnalysis.ts provides a more accurate async LLM version that runs
 *  in the background and patches the job record once complete. */
export function extractTitleCompany(rawJd: string): { title: string; company: string } {
  const lines = rawJd.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Company ──────────────────────────────────────────────────────────────
  // 1. Explicit label: "Company: Acme" / "Organisation: Acme"
  const labelMatch = rawJd.match(/^(?:company|organisation|organization|employer)\s*[:\-–]\s*(.+)/im);
  // 2. "Join Acme" / "at Acme" / "@ Acme" inline patterns
  const inlineMatch = rawJd.match(/(?:join|position\s+at|role\s+at|work\s+at|@\s*)([A-Z][a-zA-Z0-9\s&.,'-]{2,40})(?:[.,!]|$)/m)
    ?? rawJd.match(/\bat\s+([A-Z][a-zA-Z0-9\s&.,'-]{2,40})(?:[.,!]|$)/m);

  const company = labelMatch
    ? labelMatch[1].trim().slice(0, 60)
    : inlineMatch
    ? inlineMatch[1].trim().slice(0, 60)
    : '';

  // ── Title ─────────────────────────────────────────────────────────────────
  // 1. Explicit label: "Job Title: Senior Engineer"
  const titleLabel = rawJd.match(/^(?:job\s+title|position|role|vacancy|title)\s*[:\-–]\s*(.+)/im);
  // 2. First short non-empty line (< 80 chars, > 3 chars)
  const titleLine = lines.find(l => l.length > 3 && l.length < 80) ?? '';
  const title = titleLabel ? titleLabel[1].trim().slice(0, 80) : titleLine;

  return { title, company };
}

/** Naive match score based on keyword overlap — used client-side until Worker classifies */
export function naiveMatchScore(rawJd: string, profileSkills: string): number {
  const jdLower = (rawJd ?? '').toLowerCase();
  const skills = (profileSkills ?? '').toLowerCase().split(/[\s,;|/]+/).filter(s => s.length > 2);
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
