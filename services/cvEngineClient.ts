/**
 * cvEngineClient.ts
 *
 * Frontend client for the cv-engine-worker (Cloudflare Worker backed by D1+KV).
 *
 * Set VITE_CV_ENGINE_URL in `.env.local` (dev) and Vercel env vars (prod), e.g.:
 *   VITE_CV_ENGINE_URL=https://cv-engine-worker.<account>.workers.dev
 *
 * All calls are best-effort: if the worker is unavailable, callers should fall
 * back to the local pipeline. No call here ever throws into the UI path.
 */

const ENGINE_URL: string =
    (import.meta as any)?.env?.VITE_CV_ENGINE_URL ?? '';

const DEFAULT_TIMEOUT_MS = 6000;

export interface BannedEntry {
    phrase: string;
    replacement: string | null;
    severity?: 'critical' | 'high' | 'medium';
}

export interface VerbEntry {
    verb: string;
    verb_present: string;
    verb_past: string;
    energy_level: 'high' | 'medium' | 'low';
    human_score: number;
}

export interface ValidateIssue {
    bullet?: number;
    issue: string;
    severity: 'critical' | 'high' | 'medium';
    [k: string]: unknown;
}

export interface ValidateResult {
    passed: boolean;
    score: number;
    summary: { critical: number; high: number; medium: number };
    issues: ValidateIssue[];
}

export interface CleanResult {
    cleaned: string;
    changes: string[];
    change_count: number;
}

export function isCVEngineConfigured(): boolean {
    return Boolean(ENGINE_URL && /^https?:\/\//.test(ENGINE_URL));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(t);
    }
}

async function getJSON<T>(path: string, params?: Record<string, string>): Promise<T | null> {
    if (!isCVEngineConfigured()) return null;
    const u = new URL(path, ENGINE_URL);
    if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    try {
        const r = await fetchWithTimeout(u.toString());
        if (!r.ok) return null;
        return (await r.json()) as T;
    } catch (e) {
        if ((import.meta as any)?.env?.DEV) console.warn('[cvEngineClient] GET failed:', path, e);
        return null;
    }
}

async function postJSON<T>(path: string, body: unknown): Promise<T | null> {
    if (!isCVEngineConfigured()) return null;
    const u = new URL(path, ENGINE_URL);
    try {
        const r = await fetchWithTimeout(u.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body ?? {}),
        });
        if (!r.ok) return null;
        return (await r.json()) as T;
    } catch (e) {
        if ((import.meta as any)?.env?.DEV) console.warn('[cvEngineClient] POST failed:', path, e);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchBannedPhrases(): Promise<BannedEntry[] | null> {
    const r = await getJSON<{ banned: BannedEntry[] }>('/api/cv/banned');
    return r?.banned ?? null;
}

export async function fetchVerbs(opts: {
    category: 'technical' | 'management' | 'analysis' | 'communication' | 'financial' | 'creative';
    tense?: 'present' | 'past';
    count?: number;
    exclude?: string[];
}): Promise<VerbEntry[] | null> {
    const params: Record<string, string> = {
        category: opts.category,
        tense: opts.tense ?? 'present',
        count: String(opts.count ?? 20),
    };
    if (opts.exclude?.length) params.exclude = JSON.stringify(opts.exclude);
    const r = await getJSON<{ words: VerbEntry[] }>('/api/cv/words', params);
    return r?.words ?? null;
}

export async function fetchStructures(label: 'short' | 'medium' | 'long' | 'personality') {
    return getJSON<{ structures: any[] }>('/api/cv/structures', { label });
}

export async function fetchRhythm(section?: string) {
    const params = section ? { section } : undefined;
    return getJSON<{ patterns: any[] }>('/api/cv/rhythm', params);
}

export async function cleanText(rawText: string): Promise<CleanResult | null> {
    return postJSON<CleanResult>('/api/cv/clean', { rawText });
}

export async function validateBullets(bullets: string[]): Promise<ValidateResult | null> {
    return postJSON<ValidateResult>('/api/cv/validate', { bullets });
}

export interface ValidateVoiceResult {
    passed: boolean;
    score: number;
    summary: { critical: number; high: number; medium: number; low: number };
    issues: ValidateIssue[];
    rhythm_match_ratio: number;
    avg_word_count: number;
    metric_ratio: number;
    failing_bullets: number[];
}

export async function validateVoice(bullets: string[], brief: CVBrief): Promise<ValidateVoiceResult | null> {
    return postJSON<ValidateVoiceResult>('/api/cv/validate-voice', { bullets, brief });
}

export interface CVBrief {
    years: number;
    seniority: { level: string; bullet_style: string; metric_density: string; summary_tone: string } | null;
    field: { field: string; language_style: string; preferred_verbs: string[]; avoided_verbs: string[]; metric_types: string[] } | null;
    voice: {
        primary: { name: string; tone: string; verbosity_level: number; opener_frequency: number; metric_preference: string } | null;
        secondary: { name: string; tone: string } | null;
    };
    rhythm: { pattern_name: string; sequence: string[]; section: string; bullet_count: number } | null;
    verb_pool: VerbEntry[];
    forbidden_phrases: string[];
    banned_count: number;
    debug?: unknown;
}

export interface BuildBriefInput {
    jd?: string;
    profile?: unknown;
    yearsExperience?: number;
    field?: string;
    bulletCount?: number;
    section?: 'current_role' | 'past_role' | 'internship' | 'summary';
}

export async function buildBrief(input: BuildBriefInput): Promise<CVBrief | null> {
    return postJSON<CVBrief>('/api/cv/brief', input);
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache for banned phrases — refreshed on demand, never blocks UI.
// ─────────────────────────────────────────────────────────────────────────────

let bannedCache: BannedEntry[] | null = null;
let bannedCacheAt = 0;
const BANNED_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function getCachedBannedPhrases(): Promise<BannedEntry[] | null> {
    const now = Date.now();
    if (bannedCache && now - bannedCacheAt < BANNED_TTL_MS) return bannedCache;
    const fresh = await fetchBannedPhrases();
    if (fresh && fresh.length) {
        bannedCache = fresh;
        bannedCacheAt = now;
    }
    return bannedCache;
}

/** Pre-warm cache once at app boot — silent on failure. */
export function warmCVEngine(): void {
    if (!isCVEngineConfigured()) return;
    void getCachedBannedPhrases();
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin client — token kept in sessionStorage, never logged.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_TOKEN_KEY = 'cv_engine_admin_token';

export function getAdminToken(): string {
    try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; }
}
export function setAdminToken(t: string): void {
    try {
        if (t) sessionStorage.setItem(ADMIN_TOKEN_KEY, t);
        else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch { /* ignore */ }
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    if (!isCVEngineConfigured()) return null;
    const token = getAdminToken();
    if (!token) return null;
    const u = new URL(path, ENGINE_URL);
    try {
        const r = await fetchWithTimeout(u.toString(), {
            ...init,
            headers: { ...(init.headers || {}), 'X-Admin-Token': token },
        });
        if (!r.ok) return null;
        return (await r.json()) as T;
    } catch (e) {
        if ((import.meta as any)?.env?.DEV) console.warn('[adminFetch]', path, e);
        return null;
    }
}

export interface AdminStats {
    ok: boolean;
    counts: Record<string, number>;
    last_sync: number | null;
}

export interface BulkAddResult {
    ok: boolean;
    inserted: number;
    skipped: number;
    failed: number;
    errors: string[];
    synced: boolean;
}

export interface SyncResult {
    ok: boolean;
    written: Array<[string, number]>;
    total_keys: number;
    synced_at: number;
}

export async function fetchAdminStats(): Promise<AdminStats | null> {
    return adminFetch<AdminStats>('/api/cv/admin/stats');
}

export async function bulkAddRows(table: string, rows: any[]): Promise<BulkAddResult | null> {
    return adminFetch<BulkAddResult>('/api/cv/admin/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, rows }),
    });
}

export async function triggerSync(): Promise<SyncResult | null> {
    return adminFetch<SyncResult>('/api/cv/sync', { method: 'POST' });
}

export interface AdminListResult {
    ok: boolean;
    table: string;
    total: number;
    limit: number;
    offset: number;
    rows: Array<Record<string, any>>;
}

export async function listAdminRows(
    table: string,
    opts: { limit?: number; offset?: number; q?: string } = {},
): Promise<AdminListResult | null> {
    const params = new URLSearchParams({ table });
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.offset) params.set('offset', String(opts.offset));
    if (opts.q) params.set('q', opts.q);
    return adminFetch<AdminListResult>(`/api/cv/admin/list?${params.toString()}`);
}

export interface BulkUpdateResult {
    ok: boolean;
    updated: number;
    missing: number;
    failed: number;
    errors: string[];
    synced: boolean;
}

export async function bulkUpdateRows(
    table: string,
    updates: Array<{ id: string } & Record<string, any>>,
): Promise<BulkUpdateResult | null> {
    return adminFetch<BulkUpdateResult>('/api/cv/admin/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, updates }),
    });
}

export interface DeleteResult {
    ok: boolean;
    deleted: number;
    failed: number;
    errors: string[];
    synced: boolean;
}

export interface VoiceTestResult {
    ok: boolean;
    bullets: string[];
    brief: {
        voice: { primary: any; secondary: any };
        field: any;
        seniority: any;
        rhythm: any;
        forbidden_phrases: string[];
        verb_pool_sample: any[];
        debug: any;
    };
    validation: ValidateVoiceResult;
}

export async function testVoice(input: {
    bullets: string[];
    voice_name?: string;
    field?: string;
    yearsExperience?: number;
    section?: 'current_role' | 'past_role' | 'internship' | 'summary';
    jd?: string;
}): Promise<VoiceTestResult | null> {
    return adminFetch<VoiceTestResult>('/api/cv/admin/voice-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
}

export interface AiAuditFinding {
    phrase: string;
    severity: 'critical' | 'high' | 'medium';
    reason: string;
    replacement: string;
}

export interface AiAuditResult {
    ok: boolean;
    text_length: number;
    already_banned_count: number;
    new_findings: number;
    findings: AiAuditFinding[];
    model: string;
    raw_response: string;
}

export interface LeakCandidate {
    id: string;
    phrase: string;
    count: number;
    sample: string | null;
    first_seen: string;
    last_seen: string;
    status: 'pending' | 'promoted' | 'rejected';
    decided_at: string | null;
}

export interface LeakCandidatesList {
    ok: boolean;
    rows: LeakCandidate[];
    total: number;
    limit: number;
    offset: number;
    status: string;
    threshold: number;
}

export interface AdminTokenRow {
    id: string;
    label: string;
    role: 'viewer' | 'editor' | 'admin';
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
}

export async function listAdminTokens(): Promise<{ ok: boolean; rows: AdminTokenRow[] } | null> {
    return adminFetch('/api/cv/admin/tokens');
}

export async function createAdminToken(label: string, role: 'viewer' | 'editor' | 'admin'): Promise<{ ok: boolean; id: string; token: string; warning: string } | null> {
    return adminFetch('/api/cv/admin/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, role }),
    });
}

export async function revokeAdminTokens(ids: string[]): Promise<{ ok: boolean; revoked: number } | null> {
    return adminFetch('/api/cv/admin/tokens/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
    });
}

export async function reportLeaks(phrases: string[], sample = ''): Promise<{ ok: boolean; recorded: number } | null> {
    if (!phrases.length) return null;
    return postJSON('/api/cv/leak-report', { phrases, sample });
}

export async function listLeakCandidates(status: 'pending' | 'promoted' | 'rejected' = 'pending', limit = 100, offset = 0): Promise<LeakCandidatesList | null> {
    const qs = new URLSearchParams({ status, limit: String(limit), offset: String(offset) });
    return adminFetch<LeakCandidatesList>(`/api/cv/admin/leak-candidates?${qs}`);
}

export async function decideLeakCandidates(ids: string[], decision: 'promote' | 'reject', severity: 'critical' | 'high' | 'medium' = 'medium'): Promise<{ ok: boolean; promoted?: number; rejected?: number; skipped?: number } | null> {
    return adminFetch('/api/cv/admin/leak-candidates/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, decision, severity }),
    });
}

export async function aiAudit(text: string): Promise<AiAuditResult | null> {
    return adminFetch<AiAuditResult>('/api/cv/admin/ai-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
}

export async function deleteAdminRows(table: string, ids: string[]): Promise<DeleteResult | null> {
    return adminFetch<DeleteResult>('/api/cv/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, ids }),
    });
}
