/// <reference types="@cloudflare/workers-types" />
import { Env, kvd } from '../types';
import { json } from '../utils';
import { verifySession } from './auth';

// ─── LLM cache constants ──────────────────────────────────────────────────────
const LLM_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const LLM_CACHE_MAX_RESPONSE_BYTES = 200_000;      // 200 KB

const LLM_KV_PREFIX   = 'llm:';
const LLM_KV_TTL_SECS = 3600; // KV hot-cache TTL: 1 hour (D1 keeps 30 days)

export async function handleLLMCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
    const key = (url.searchParams.get('key') ?? '').trim();
    if (!key || key.length !== 64) {
        return json({ hit: false, error: 'invalid_key' }, request, env, 400);
    }

    // ── 1. KV hot-cache — sub-millisecond lookup ──────────────────────────────
    try {
        const kvVal = await env.CV_KV.get<{ response: string; hitCount: number }>(
            `${LLM_KV_PREFIX}${key}`, { type: 'json' }
        );
        if (kvVal?.response) {
            const now = Math.floor(Date.now() / 1000);
            void env.CV_DB.prepare(
                `UPDATE llm_cache SET hit_count = hit_count + 1, last_hit_at = ? WHERE cache_key = ?`
            ).bind(now, key).run().catch(() => {});
            return json({ hit: true, response: kvVal.response, hitCount: kvVal.hitCount + 1, source: 'kv' }, request, env);
        }
    } catch { /* KV miss or error — fall through to D1 */ }

    // ── 2. D1 cold-cache — persistent 30-day store ────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    const expireBefore = now - LLM_CACHE_TTL_SECONDS;

    const row = await env.CV_DB.prepare(
        `SELECT response, hit_count, created_at, last_hit_at
         FROM llm_cache
         WHERE cache_key = ?
           AND COALESCE(last_hit_at, created_at) > ?`
    ).bind(key, expireBefore).first<{ response: string; hit_count: number; created_at: number; last_hit_at: number | null }>();

    if (!row) {
        return json({ hit: false }, request, env);
    }

    void env.CV_KV.put(
        `${LLM_KV_PREFIX}${key}`,
        JSON.stringify({ response: row.response, hitCount: row.hit_count + 1 }),
        { expirationTtl: LLM_KV_TTL_SECS }
    ).catch(() => {});

    void env.CV_DB.prepare(
        `UPDATE llm_cache SET hit_count = hit_count + 1, last_hit_at = ? WHERE cache_key = ?`
    ).bind(now, key).run().catch(() => {});

    return json({ hit: true, response: row.response, hitCount: row.hit_count + 1, source: 'd1' }, request, env);
}

export async function handleLLMCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const key      = typeof body?.key      === 'string' ? body.key.trim()      : '';
    const model    = typeof body?.model    === 'string' ? body.model.trim()    : '';
    const response = typeof body?.response === 'string' ? body.response        : '';
    const temperature = typeof body?.temperature === 'number' ? body.temperature : -1;
    const promptSize  = typeof body?.promptSize  === 'number' ? body.promptSize  : 0;

    if (!key || key.length !== 64)          return json({ error: 'invalid_key' }, request, env, 400);
    if (!model)                             return json({ error: 'missing_model' }, request, env, 400);
    if (temperature < 0 || temperature > 2) return json({ error: 'invalid_temperature' }, request, env, 400);
    if (!response || response.length > LLM_CACHE_MAX_RESPONSE_BYTES) {
        return json({ error: 'response_too_large_or_empty' }, request, env, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    await env.CV_DB.prepare(
        `INSERT INTO llm_cache (cache_key, model, temperature, response, prompt_size, hit_count, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
             hit_count  = hit_count + 1,
             last_hit_at = excluded.created_at`
    ).bind(key, model, temperature, response, promptSize, now).run();

    ctx.waitUntil(
        env.CV_KV.put(
            `${LLM_KV_PREFIX}${key}`,
            JSON.stringify({ response, hitCount: 0 }),
            { expirationTtl: LLM_KV_TTL_SECS }
        ).catch(() => {})
    );

    const expireBefore = now - LLM_CACHE_TTL_SECONDS;
    ctx.waitUntil(
        env.CV_DB.prepare(
            `DELETE FROM llm_cache
             WHERE cache_key IN (
                 SELECT cache_key FROM llm_cache
                 WHERE COALESCE(last_hit_at, created_at) < ?
                 LIMIT 200
             )`
        ).bind(expireBefore).run().catch(() => {})
    );

    return json({ ok: true, stored: true }, request, env);
}

export async function handleCVExamplesGet(request: Request, env: Env, url: URL): Promise<Response> {
    const fingerprint   = (url.searchParams.get('fingerprint')    ?? '').trim();
    const excludeAngle  = (url.searchParams.get('exclude_angle')  ?? '').trim();

    if (!fingerprint || fingerprint.length !== 64) {
        return json({ example: null, error: 'invalid_fingerprint' }, request, env, 400);
    }

    type ExampleRow = {
        fingerprint: string;
        primary_title: string;
        seniority: string;
        generation_mode: string;
        purpose: string;
        summary_words: number;
        skills_count: number;
        experience_structure: string;
        narrative_angle: string | null;
        voice_name: string | null;
        quality_score: number | null;
        updated_at: number;
    };

    const VALID_ANGLES = ['impact', 'process', 'people', 'growth'];

    let row: ExampleRow | null = null;

    if (excludeAngle && VALID_ANGLES.includes(excludeAngle)) {
        row = await env.CV_DB.prepare(
            `SELECT fingerprint, primary_title, seniority, generation_mode, purpose,
                    summary_words, skills_count, experience_structure,
                    narrative_angle, voice_name, quality_score, updated_at
             FROM cv_examples
             WHERE fingerprint = ?
               AND narrative_angle IS NOT NULL
               AND narrative_angle != ?
             ORDER BY COALESCE(quality_score, 70) DESC, updated_at DESC
             LIMIT 1`
        ).bind(fingerprint, excludeAngle).first<ExampleRow>();

        if (!row) {
            row = await env.CV_DB.prepare(
                `SELECT fingerprint, primary_title, seniority, generation_mode, purpose,
                        summary_words, skills_count, experience_structure,
                        narrative_angle, voice_name, quality_score, updated_at
                 FROM cv_examples
                 WHERE fingerprint = ?
                 ORDER BY COALESCE(quality_score, 70) DESC, updated_at DESC
                 LIMIT 1`
            ).bind(fingerprint).first<ExampleRow>();
        }
    } else {
        row = await env.CV_DB.prepare(
            `SELECT fingerprint, primary_title, seniority, generation_mode, purpose,
                    summary_words, skills_count, experience_structure,
                    narrative_angle, voice_name, quality_score, updated_at
             FROM cv_examples
             WHERE fingerprint = ?
             ORDER BY COALESCE(quality_score, 70) DESC, updated_at DESC
             LIMIT 1`
        ).bind(fingerprint).first<ExampleRow>();
    }

    if (!row) return json({ example: null }, request, env);

    let experienceStructure: number[][] = [];
    try { experienceStructure = JSON.parse(row.experience_structure); } catch { /* ignore */ }

    return json({
        example: {
            fingerprint:       row.fingerprint,
            primaryTitle:      row.primary_title,
            seniority:         row.seniority,
            generationMode:    row.generation_mode,
            purpose:           row.purpose,
            summaryWords:      row.summary_words,
            skillsCount:       row.skills_count,
            experienceStructure,
            narrativeAngle:    row.narrative_angle ?? undefined,
            voiceName:         row.voice_name      ?? undefined,
            qualityScore:      row.quality_score   ?? 70,
            updatedAt:         row.updated_at,
        },
    }, request, env);
}

export async function handleCVExamplesPost(request: Request, env: Env): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const fingerprint      = typeof body?.fingerprint      === 'string' ? body.fingerprint.trim() : '';
    const primaryTitle     = typeof body?.primaryTitle     === 'string' ? body.primaryTitle.trim().substring(0, 120) : '';
    const seniority        = typeof body?.seniority        === 'string' ? body.seniority.trim()   : 'mid';
    const generationMode   = typeof body?.generationMode   === 'string' ? body.generationMode.trim() : 'honest';
    const purpose          = typeof body?.purpose          === 'string' ? body.purpose.trim()     : 'job';
    const summaryWords     = typeof body?.summaryWords     === 'number' ? Math.round(body.summaryWords) : 0;
    const skillsCount      = typeof body?.skillsCount      === 'number' ? Math.round(body.skillsCount)  : 0;
    const experienceStructure: number[][] = Array.isArray(body?.experienceStructure) ? body.experienceStructure : [];

    const VALID_ANGLES = ['impact', 'process', 'people', 'growth'] as const;
    const rawAngle     = typeof body?.narrativeAngle === 'string' ? body.narrativeAngle.trim() : '';
    const narrativeAngle: string | null = VALID_ANGLES.includes(rawAngle as any) ? rawAngle : null;
    const voiceName: string | null = typeof body?.voiceName === 'string' && body.voiceName.trim()
        ? body.voiceName.trim().substring(0, 60)
        : null;

    const rawQuality   = typeof body?.qualityScore === 'number' ? body.qualityScore : 70;
    const qualityScore = Math.max(0, Math.min(100, Math.round(rawQuality)));

    if (!fingerprint || fingerprint.length !== 64) return json({ error: 'invalid_fingerprint' }, request, env, 400);
    if (!primaryTitle) return json({ error: 'missing_primary_title' }, request, env, 400);

    const experienceJson = JSON.stringify(
        experienceStructure.map(role =>
            Array.isArray(role) ? role.map(n => (typeof n === 'number' ? Math.round(n) : 0)).slice(0, 20) : []
        ).slice(0, 10)
    );

    const now = Math.floor(Date.now() / 1000);

    await env.CV_DB.prepare(
        `INSERT INTO cv_examples
             (fingerprint, primary_title, seniority, generation_mode, purpose,
              summary_words, skills_count, experience_structure,
              narrative_angle, voice_name, quality_score,
              created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(fingerprint) DO UPDATE SET
             primary_title        = excluded.primary_title,
             narrative_angle      = excluded.narrative_angle,
             voice_name           = excluded.voice_name,
             quality_score        = MAX(excluded.quality_score, COALESCE(quality_score, 70)),
             summary_words        = CASE WHEN excluded.quality_score >= COALESCE(quality_score, 70)
                                         THEN excluded.summary_words ELSE summary_words END,
             skills_count         = CASE WHEN excluded.quality_score >= COALESCE(quality_score, 70)
                                         THEN excluded.skills_count  ELSE skills_count  END,
             experience_structure = CASE WHEN excluded.quality_score >= COALESCE(quality_score, 70)
                                         THEN excluded.experience_structure ELSE experience_structure END,
             updated_at           = CASE WHEN excluded.quality_score >= COALESCE(quality_score, 70)
                                         THEN excluded.updated_at ELSE updated_at END`
    ).bind(fingerprint, primaryTitle, seniority, generationMode, purpose,
           summaryWords, skillsCount, experienceJson,
           narrativeAngle, voiceName, qualityScore,
           now, now).run();

    return json({ ok: true, fingerprint, stored: true }, request, env);
}

/**
 * Extract the Bearer token from an Authorization header, or return null.
 */
function bearerToken(request: Request): string | null {
    const h = request.headers.get('Authorization') ?? '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

/**
 * Return true when the given slot_id is owned by the authenticated user.
 * A slot is "owned" when a user_slots row exists with matching slot_id AND user_id.
 */
async function slotOwnedByUser(slotId: string, userId: number, env: Env): Promise<boolean> {
    const row = await env.CV_DB.prepare(
        `SELECT 1 FROM user_slots WHERE slot_id = ? AND user_id = ? LIMIT 1`
    ).bind(slotId, userId).first<{ 1: number }>();
    return !!row;
}

export async function handleProfileCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
    const hash = (url.searchParams.get('hash') ?? '').trim();
    if (!hash || hash.length < 16) return json({ error: 'invalid_hash' }, request, env, 400);

    // ── Optional auth guard (Finding 3) ───────────────────────────────────────
    // Authenticated callers must present a valid session token AND must own the
    // slot that the requested hash belongs to.  Anonymous callers (no header)
    // continue to use hash-only access so offline / device-only mode keeps working.
    const token = bearerToken(request);
    if (token) {
        const session = await verifySession(token, env);
        if (!session) return json({ error: 'invalid_session' }, request, env, 401);

        // Peek at the slot_id stored for this hash — we need it for ownership check.
        const slotRow = await env.CV_DB.prepare(
            `SELECT slot_id FROM profile_cache WHERE hash = ?`
        ).bind(hash).first<{ slot_id: string }>();

        if (slotRow) {
            const owned = await slotOwnedByUser(slotRow.slot_id, session.userId, env);
            if (!owned) return json({ error: 'forbidden' }, request, env, 403);
        }
        // If no row → fall through to the normal 404 response below.
    }

    const row = await env.CV_DB.prepare(
        `SELECT compact_json, slot_id, slot_name FROM profile_cache WHERE hash = ?`
    ).bind(hash).first<{ compact_json: string; slot_id: string; slot_name: string }>();

    if (!row) return json({ found: false }, request, env, 404);

    const now = Math.floor(Date.now() / 1000);
    env.CV_DB.prepare(
        `UPDATE profile_cache SET last_used_at = ?, use_count = use_count + 1 WHERE hash = ?`
    ).bind(now, hash).run().catch(() => {});

    return json({ found: true, hash, slot_id: row.slot_id, slot_name: row.slot_name, compact_json: row.compact_json }, request, env);
}

export async function handleProfileCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const hash        = typeof body?.hash         === 'string' ? body.hash.trim()                              : '';
    const slotId      = typeof body?.slot_id      === 'string' ? body.slot_id.trim()                           : '';
    const slotName    = typeof body?.slot_name    === 'string' ? body.slot_name.trim().substring(0, 120)       : '';
    const compactJson = typeof body?.compact_json === 'string' ? body.compact_json                             : '';

    if (!hash || hash.length < 16)  return json({ error: 'invalid_hash' }, request, env, 400);
    if (!slotId)                    return json({ error: 'missing_slot_id' }, request, env, 400);
    if (!compactJson)               return json({ error: 'missing_compact_json' }, request, env, 400);
    if (compactJson.length > 65536) return json({ error: 'compact_json_too_large', max: 65536 }, request, env, 413);

    // ── Optional auth guard for POST ──────────────────────────────────────────
    // Authenticated callers must own the slot they're caching data for.
    // This prevents cross-user cache poisoning: an attacker who knows a slot_id
    // cannot overwrite another user's cached profile with malicious content.
    const token = bearerToken(request);
    if (token) {
        const session = await verifySession(token, env);
        if (!session) return json({ error: 'invalid_session' }, request, env, 401);
        const owned = await slotOwnedByUser(slotId, session.userId, env);
        if (!owned) return json({ error: 'forbidden' }, request, env, 403);
    }

    const now = Math.floor(Date.now() / 1000);

    await env.CV_DB.prepare(
        `INSERT INTO profile_cache (hash, slot_id, slot_name, compact_json, created_at, last_used_at, use_count)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(hash) DO UPDATE SET
             last_used_at = excluded.last_used_at,
             slot_name    = excluded.slot_name`
    ).bind(hash, slotId, slotName, compactJson, now, now).run();

    const ninetyDaysAgo = now - 90 * 24 * 3600;
    ctx.waitUntil(
        env.CV_DB.prepare(
            `DELETE FROM profile_cache WHERE slot_id = ? AND hash != ? AND last_used_at < ?`
        ).bind(slotId, hash, ninetyDaysAgo).run().catch(() => {})
    );

    return json({ ok: true, hash, cached: true }, request, env);
}

export async function handleJdAnalysisCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
    const key = url.searchParams.get('key') || '';
    if (!key || key.length < 4) return json({ error: 'missing_key' }, request, env, 400);

    const row = await env.CV_DB.prepare(
        `SELECT result_json, created_at FROM jd_analysis_cache WHERE cache_key = ?`
    ).bind(key).first<{ result_json: string; created_at: number }>();

    if (!row) return json({ found: false }, request, env, 404);

    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
    if (row.created_at < sevenDaysAgo) {
        env.CV_DB.prepare(`DELETE FROM jd_analysis_cache WHERE cache_key = ?`).bind(key).run().catch(() => {});
        return json({ found: false, expired: true }, request, env, 404);
    }

    const now = Math.floor(Date.now() / 1000);
    env.CV_DB.prepare(
        `UPDATE jd_analysis_cache SET last_used_at = ?, use_count = use_count + 1 WHERE cache_key = ?`
    ).bind(now, key).run().catch(() => {});

    let result: unknown;
    try { result = JSON.parse(row.result_json); } catch { return json({ found: false, error: 'corrupt_json' }, request, env, 404); }
    return json({ found: true, result }, request, env);
}

export async function handleJdAnalysisCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const key        = typeof body?.key         === 'string' ? body.key.trim()        : '';
    const resultJson = typeof body?.result_json === 'string' ? body.result_json       : '';

    if (!key || key.length < 4)      return json({ error: 'invalid_key' }, request, env, 400);
    if (!resultJson)                 return json({ error: 'missing_result_json' }, request, env, 400);
    if (resultJson.length > 4096)    return json({ error: 'result_too_large', max: 4096 }, request, env, 413);

    const now = Math.floor(Date.now() / 1000);
    await env.CV_DB.prepare(
        `INSERT INTO jd_analysis_cache (cache_key, result_json, created_at, last_used_at, use_count)
         VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(cache_key) DO NOTHING`
    ).bind(key, resultJson, now, now).run();

    const fourteenDaysAgo = now - 14 * 24 * 3600;
    ctx.waitUntil(
        env.CV_DB.prepare(`DELETE FROM jd_analysis_cache WHERE last_used_at < ?`)
            .bind(fourteenDaysAgo).run().catch(() => {})
    );

    // Piggyback: extract job title from result and save to ontology
    try {
        const parsed = JSON.parse(resultJson);
        const detectedTitle: string = parsed?.jobTitle || parsed?.job_title || parsed?.title || '';
        const detectedField: string = parsed?.field || parsed?.field_slug || parsed?.cvField || '';

        if (detectedTitle && detectedField) {
            const { upsertTitle, parseFieldSlugFromLLM } = await import('../services/titleOntologyService');
            const validSlug = parseFieldSlugFromLLM(detectedField);
            if (validSlug) {
                ctx.waitUntil(upsertTitle(env, detectedTitle, validSlug, 'llm', 'jd_upload'));
            }
        }
    } catch { /* non-fatal piggyback */ }

    return json({ ok: true, key, cached: true }, request, env);
}

export async function handleMarketResearchCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
    const key = url.searchParams.get('key') || '';
    if (!key || key.length < 16) return json({ error: 'missing_key' }, request, env, 400);

    const row = await env.CV_DB.prepare(
        `SELECT cache_key, scenario, detected_role, result_json, created_at, last_used_at, use_count
         FROM market_research_cache WHERE cache_key = ?`
    ).bind(key).first<{
        cache_key: string; scenario: string; detected_role: string;
        result_json: string; created_at: number; last_used_at: number; use_count: number;
    }>();

    if (!row) return json({ found: false }, request, env, 404);

    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
    if (row.created_at < sevenDaysAgo) {
        env.CV_DB.prepare(`DELETE FROM market_research_cache WHERE cache_key = ?`).bind(key).run().catch(() => {});
        return json({ found: false, expired: true }, request, env, 404);
    }

    const now = Math.floor(Date.now() / 1000);
    env.CV_DB.prepare(
        `UPDATE market_research_cache SET last_used_at = ?, use_count = use_count + 1 WHERE cache_key = ?`
    ).bind(now, key).run().catch(() => {});

    let result: unknown;
    try { result = JSON.parse(row.result_json); } catch { return json({ found: false, error: 'corrupt_json' }, request, env, 404); }

    return json({ found: true, result, use_count: row.use_count + 1, cached_at: row.created_at }, request, env);
}

export async function handleMarketResearchCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const key          = typeof body?.key          === 'string' ? body.key.trim()          : '';
    const scenario     = typeof body?.scenario     === 'string' ? body.scenario.trim()     : 'C';
    const detectedRole = typeof body?.detected_role === 'string' ? body.detected_role.trim().substring(0, 200) : '';
    const resultJson   = typeof body?.result_json  === 'string' ? body.result_json         : '';

    if (!key || key.length < 16)  return json({ error: 'invalid_key' }, request, env, 400);
    if (!resultJson)               return json({ error: 'missing_result_json' }, request, env, 400);
    if (resultJson.length > 16384) return json({ error: 'result_too_large', max: 16384 }, request, env, 413);

    const now = Math.floor(Date.now() / 1000);
    await env.CV_DB.prepare(
        `INSERT INTO market_research_cache (cache_key, scenario, detected_role, result_json, created_at, last_used_at, use_count)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(cache_key) DO NOTHING`
    ).bind(key, scenario, detectedRole, resultJson, now, now).run();

    const fourteenDaysAgo = now - 14 * 24 * 3600;
    ctx.waitUntil(
        env.CV_DB.prepare(`DELETE FROM market_research_cache WHERE last_used_at < ?`)
            .bind(fourteenDaysAgo).run().catch(() => {})
    );

    return json({ ok: true, key, cached: true }, request, env);
}
