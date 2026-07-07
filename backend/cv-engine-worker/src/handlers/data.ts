/// <reference types="@cloudflare/workers-types" />
import { Env, kvd, WORKER_DATA_VERSION, VERB_CATEGORIES } from '../types';
import { json, safeJson, safeParse, clamp, shuffle, verifyAdminAuth, unauthorized } from '../utils';

// ─── Module-level KV cache ────────────────────────────────────────────────────
// Survives across requests within the same CF Worker isolate.
// Reduces KV reads for static/rarely-changing data (banned phrases, verbs, etc.)
const TTL_5M  = 5 * 60 * 1000;
const TTL_10M = 10 * 60 * 1000;

interface KVEntry<T> { data: T; expires: number }
const _kvMem = new Map<string, KVEntry<unknown>>();

function kvMemGet<T>(key: string): T | null {
    const e = _kvMem.get(key);
    if (e && Date.now() < e.expires) return e.data as T;
    _kvMem.delete(key);
    return null;
}
function kvMemSet<T>(key: string, data: T, ttl: number): void {
    _kvMem.set(key, { data, expires: Date.now() + ttl });
}
/** Call this whenever KV data is refreshed (e.g. after admin sync) */
export function invalidateKVCache(): void { _kvMem.clear(); }

export async function handleHealth(request: Request, env: Env): Promise<Response> {
    const counts = await env.CV_DB.prepare(
        `SELECT
            (SELECT COUNT(*) FROM cv_verbs)            AS verbs,
            (SELECT COUNT(*) FROM cv_banned_phrases)   AS banned,
            (SELECT COUNT(*) FROM cv_voice_profiles)   AS voices,
            (SELECT COUNT(*) FROM cv_rhythm_patterns)  AS rhythms`
    ).first();
    return json({ ok: true, phase: 'B', d1: counts }, request, env);
}

export async function handleWords(request: Request, env: Env, url: URL): Promise<Response> {
    const category = (url.searchParams.get('category') || '').toLowerCase();
    const tense    = (url.searchParams.get('tense') || 'present').toLowerCase();
    const count    = clamp(parseInt(url.searchParams.get('count') || '20', 10), 1, 200);
    let exclude: string[] = [];
    try { exclude = JSON.parse(url.searchParams.get('exclude') || '[]'); } catch {}

    if (!VERB_CATEGORIES.includes(category as any)) {
        return json({ error: 'invalid_category', allowed: VERB_CATEGORIES }, request, env, 400);
    }
    if (tense !== 'present' && tense !== 'past') {
        return json({ error: 'invalid_tense', allowed: ['present', 'past'] }, request, env, 400);
    }

    const key = kvd(`cv:verbs:${category}:${tense}`);
    let pool = await env.CV_KV.get<any[]>(key, { type: 'json' });

    if (!pool || pool.length === 0) {
        const r = await env.CV_DB.prepare(
            `SELECT verb_present, verb_past, energy_level, human_score
             FROM cv_verbs
             WHERE category = ? AND human_score >= 7
             ORDER BY RANDOM()
             LIMIT ?`
        ).bind(category, count * 3).all();
        pool = (r.results as any[]) || [];
    }

    const excludeSet = new Set(exclude.map(s => String(s).toLowerCase()));
    const tenseField = tense === 'past' ? 'verb_past' : 'verb_present';
    const filtered = pool.filter(v => !excludeSet.has(String(v[tenseField] || '').toLowerCase()));

    shuffle(filtered);
    const out = filtered.slice(0, count).map(v => ({
        verb: v[tenseField],
        verb_present: v.verb_present,
        verb_past: v.verb_past,
        energy_level: v.energy_level,
        human_score: v.human_score,
    }));

    return json({ category, tense, count: out.length, words: out, source: 'kv' }, request, env);
}

/**
 * Generic cached KV read — wraps the module-level mem cache around any KV list.
 * Callers pass a short human-readable memKey (e.g. 'seniority:all') so the
 * entry is shareable across handlers that need the same data.
 */
export async function getCachedKV<T>(
    memKey: string,
    kvKey: string,
    env: Env,
    ttl: number,
): Promise<T | null> {
    let data = kvMemGet<T>(memKey);
    if (data) return data;
    data = await env.CV_KV.get<T>(kvKey, { type: 'json' });
    if (data) kvMemSet(memKey, data, ttl);
    return data;
}

/** Cached verb pool — used by brief.ts to avoid direct KV reads on every generation. */
export async function getCachedVerbPool(category: string, tense: string, env: Env): Promise<any[]> {
    return (await getCachedKV<any[]>(`verbs:${category}:${tense}`, kvd(`cv:verbs:${category}:${tense}`), env, TTL_10M)) || [];
}

/** Shared cached KV read for banned phrases — used by handleBanned AND validation handlers */
export async function getCachedBannedPhrases(env: Env): Promise<any[]> {
    const MEM_KEY = 'banned:all';
    let rows = kvMemGet<any[]>(MEM_KEY);
    if (rows) return rows;
    rows = await env.CV_KV.get<any[]>(kvd('cv:banned:all'), { type: 'json' });
    if (!rows) {
        const r = await env.CV_DB.prepare(
            `SELECT phrase, replacement, severity FROM cv_banned_phrases ORDER BY LENGTH(phrase) DESC`
        ).all();
        rows = (r.results as any[]) || [];
    }
    kvMemSet(MEM_KEY, rows, TTL_5M);
    return rows;
}

export async function handleBanned(request: Request, env: Env): Promise<Response> {
    const rows = await getCachedBannedPhrases(env);
    const source = kvMemGet('banned:all') ? 'mem' : 'kv';
    return json({ count: rows.length, banned: rows, source }, request, env);
}

export async function handleStructures(request: Request, env: Env, url: URL): Promise<Response> {
    const label = (url.searchParams.get('label') || '').toLowerCase();
    const allowed = ['short', 'medium', 'long', 'personality'];
    if (!allowed.includes(label)) {
        return json({ error: 'invalid_label', allowed }, request, env, 400);
    }
    const MEM_KEY = `structures:${label}`;
    let rows = kvMemGet<any[]>(MEM_KEY);
    if (!rows) {
        rows = await env.CV_KV.get<any[]>(kvd(`cv:structures:${label}`), { type: 'json' }) || [];
        kvMemSet(MEM_KEY, rows, TTL_10M);
    }
    return json({ label, count: rows.length, structures: rows }, request, env);
}

export async function handleRhythm(request: Request, env: Env, url: URL): Promise<Response> {
    const section = (url.searchParams.get('section') || '').toLowerCase();
    const MEM_KEY = 'rhythm:all';
    let all = kvMemGet<any[]>(MEM_KEY);
    if (!all) {
        all = await env.CV_KV.get<any[]>(kvd('cv:rhythm:all'), { type: 'json' }) || [];
        kvMemSet(MEM_KEY, all, TTL_10M);
    }
    const filtered = section ? all.filter(r => String(r.section || '').toLowerCase() === section) : all;
    return json({ section: section || 'all', count: filtered.length, patterns: filtered }, request, env);
}

export async function handleSync(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');

    const written: Array<[string, number]> = [];

    // Banned
    {
        const r = await env.CV_DB.prepare(
            `SELECT phrase, replacement, severity FROM cv_banned_phrases ORDER BY LENGTH(phrase) DESC`
        ).all();
        const rows = (r.results as any[]) || [];
        await env.CV_KV.put(kvd('cv:banned:all'), JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push([kvd('cv:banned:all'), rows.length]);
    }

    // Verbs
    for (const cat of VERB_CATEGORIES) {
        for (const tense of ['present', 'past']) {
            const r = await env.CV_DB.prepare(
                `SELECT verb_present, verb_past, energy_level, human_score
                 FROM cv_verbs WHERE category = ? AND human_score >= 7
                 ORDER BY human_score DESC`
            ).bind(cat).all();
            const rows = (r.results as any[]) || [];
            const key = kvd(`cv:verbs:${cat}:${tense}`);
            await env.CV_KV.put(key, JSON.stringify(rows), { expirationTtl: 86400 * 7 });
            written.push([key, rows.length]);
        }
    }

    // Structures
    for (const label of ['short', 'medium', 'long', 'personality']) {
        const r = await env.CV_DB.prepare(
            `SELECT pattern_label, pattern, word_count_min, word_count_max, example, use_frequency
             FROM cv_sentence_structures WHERE pattern_label = ?`
        ).bind(label).all();
        const rows = (r.results as any[]) || [];
        const key = kvd(`cv:structures:${label}`);
        await env.CV_KV.put(key, JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push([key, rows.length]);
    }

    // Rhythm
    {
        const r = await env.CV_DB.prepare(
            `SELECT pattern_name, sequence, section, bullet_count, description, human_score FROM cv_rhythm_patterns`
        ).all();
        const rows = ((r.results as any[]) || []).map(row => ({ ...row, sequence: safeParse(row.sequence) }));
        await env.CV_KV.put(kvd('cv:rhythm:all'), JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push([kvd('cv:rhythm:all'), rows.length]);
    }

    // Seniority levels
    {
        const r = await env.CV_DB.prepare(
            `SELECT level, bullet_style, metric_density, summary_tone FROM cv_seniority_levels`
        ).all();
        const rows = (r.results as any[]) || [];
        await env.CV_KV.put(kvd('cv:seniority:all'), JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push([kvd('cv:seniority:all'), rows.length]);
    }

    // Field profiles
    {
        const r = await env.CV_DB.prepare(
            `SELECT * FROM cv_field_profiles`
        ).all();
        const rows = (r.results as any[]).map(row => ({
            ...row,
            jd_keywords:      safeParse((row as any).jd_keywords),
            preferred_verbs:  safeParse((row as any).preferred_verbs),
            avoided_verbs:    safeParse((row as any).avoided_verbs),
            metric_types:     safeParse((row as any).metric_types),
        }));
        await env.CV_KV.put(kvd('cv:fields:all'), JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push([kvd('cv:fields:all'), rows.length]);
    }

    // Voice profiles
    {
        const r = await env.CV_DB.prepare(
            `SELECT * FROM cv_voice_profiles`
        ).all();
        const rows = (r.results as any[]) || [];
        await env.CV_KV.put(kvd('cv:voices:all'), JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push([kvd('cv:voices:all'), rows.length]);
    }

    // Seniority-field combos
    {
        const r = await env.CV_DB.prepare(
            `SELECT * FROM cv_seniority_field_combos`
        ).all();
        const rows = (r.results as any[]) || [];
        await env.CV_KV.put(kvd('cv:combos:all'), JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push([kvd('cv:combos:all'), rows.length]);
    }

    // Result connectors (emdash type used by AI audit)
    {
        const r = await env.CV_DB.prepare(
            `SELECT connector, type FROM cv_result_connectors WHERE type = 'emdash'`
        ).all();
        const rows = (r.results as any[]) || [];
        await env.CV_KV.put(kvd('cv:results:emdash'), JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push([kvd('cv:results:emdash'), rows.length]);
    }

    await env.CV_KV.put('cv:meta:last_sync', String(Date.now()));
    await env.CV_KV.put('cv:meta:data_version', WORKER_DATA_VERSION);
    // Clear module-level KV cache so next requests pick up the freshly-synced data
    invalidateKVCache();
    return json({ ok: true, written, total_keys: written.length, synced_at: Date.now(), data_version: WORKER_DATA_VERSION }, request, env);
}
