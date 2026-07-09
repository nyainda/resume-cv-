/// <reference types="@cloudflare/workers-types" />
import { Env, kvd } from '../types';
import { json, corsHeaders, rateLimitRequest, rateLimitResponse } from '../utils';
import { verifySession } from './auth';

// Hard cap on cached profile snapshots kept per user. This is a structural
// bound, not just a time-based cleanup: it guarantees a single account
// (malicious or buggy client stuck in a save-loop) can never grow this table
// without limit, regardless of how fast it writes or how long ago it started.
const PROFILE_CACHE_MAX_ROWS_PER_USER = 20;

// ─── LLM cache constants ──────────────────────────────────────────────────────
const LLM_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const LLM_CACHE_MAX_RESPONSE_BYTES = 200_000;      // 200 KB

// LLM_KV_PREFIX / LLM_KV_TTL_SECS removed — the KV hot-cache layer was replaced
// by HTTP Cache-Control headers + Workers Tiered Cache (zero KV reads on edge hits).

export async function handleLLMCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
    const key = (url.searchParams.get('key') ?? '').trim();
    if (!key || key.length !== 64) {
        return json({ hit: false, error: 'invalid_key' }, request, env, 400);
    }

    // ── D1 persistent store (30-day TTL) ─────────────────────────────────────
    // The former KV hot-cache layer was removed: every cache GET was burning a
    // KV read (free tier: 100k/day) for data that can be served by Cloudflare's
    // own HTTP tiered cache at zero KV cost. We now return Cache-Control headers
    // on hits so CF edge serves repeated lookups for the same key entirely from
    // cache — no Worker execution, no KV read, no D1 read on a CF cache hit.
    // Note: hit_count won't increment on CF-edge-served responses (acceptable
    // since it's an internal analytics counter, not a functional dependency).
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

    void env.CV_DB.prepare(
        `UPDATE llm_cache SET hit_count = hit_count + 1, last_hit_at = ? WHERE cache_key = ?`
    ).bind(now, key).run().catch(() => {});

    // Cache-Control: public so CF tiered cache stores the response at the edge.
    // max-age=3600 (1 hr client) / s-maxage=86400 (24 hr CF edge) — safe since
    // LLM responses keyed by SHA-256 are immutable for their 30-day lifetime.
    const body = JSON.stringify({ hit: true, response: row.response, hitCount: row.hit_count + 1, source: 'd1' });
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            ...corsHeaders(request, env),
        },
    });
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

    // KV hot-tier write removed — Workers Tiered Cache handles edge caching via
    // Cache-Control headers on the GET handler. This saves 1 KV write per store.
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

    // Cache-Control on a hit: keyed by fingerprint (SHA-256 of role/seniority/purpose/mode),
    // so same fingerprint = same structural reference. Immutable for 1 hour client-side,
    // 24 hours at CF edge — Workers Tiered Cache serves repeat lookups for free.
    const exampleBody = JSON.stringify({
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
    });
    return new Response(exampleBody, {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            ...corsHeaders(request, env),
        },
    });
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
 * Resolves the authenticated user_id from the request session.
 * Mirrors getUserIdFromRequest() in user.ts (cookie-first, Bearer fallback).
 *
 * profile_cache callers MUST authenticate — see handleProfileCacheGet/Post
 * below for why this is no longer optional.
 */
export async function getSessionUserId(request: Request, env: Env): Promise<number | null> {
    let token = '';
    const cookieHeader = request.headers.get('Cookie') ?? '';
    const cookieMatch = cookieHeader.match(/(?:^|;\s*)procv_session=([^;]+)/);
    if (cookieMatch) token = cookieMatch[1].trim();

    if (!token) {
        const authHeader = request.headers.get('Authorization') ?? '';
        token = authHeader.replace(/^Bearer\s+/i, '').trim();
    }
    if (!token) return null;

    const session = await verifySession(token, env);
    return session?.userId ?? null;
}

/**
 * FINDING (cross-account profile_cache leak, closed by migration 035):
 * profile_cache used to be keyed globally by content hash alone, with an
 * "optional" ownership check that only ran once a session was already
 * resolved — and that resolution used to look for a Bearer header the
 * frontend stopped sending, so the guard was silently dead. Any two accounts
 * whose compact profile hashed identically (e.g. two fresh/near-empty
 * profiles) could read and then keep writing under each other's slot_id.
 * Confirmed real: accounts 96 and 100 shared a slot via hash fb11a5d....
 *
 * Hard fix, not a patched guard: both endpoints below now REQUIRE a valid
 * session (fail closed, 401 — same as every other endpoint touching
 * user_slots) and every query is scoped by (user_id, hash) via the table's
 * own PRIMARY KEY. A hash collision between two different users can never
 * resolve to the same row — they are physically different rows. There is no
 * "if authenticated" branch left to silently skip.
 */
export async function handleProfileCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
    const hash = (url.searchParams.get('hash') ?? '').trim();
    if (!hash || hash.length < 16) return json({ error: 'invalid_hash' }, request, env, 400);

    const rl = await rateLimitRequest(env, request, 'cache', 60, 60);
    if (!rl.allowed) return rateLimitResponse(request, env, rl.retryAfter);

    const userId = await getSessionUserId(request, env);
    if (!userId) return json({ error: 'unauthorized' }, request, env, 401);

    const row = await env.CV_DB.prepare(
        `SELECT compact_json, slot_id, slot_name FROM profile_cache WHERE user_id = ? AND hash = ?`
    ).bind(userId, hash).first<{ compact_json: string; slot_id: string; slot_name: string }>();

    if (!row) return json({ found: false }, request, env, 404);

    const now = Math.floor(Date.now() / 1000);
    env.CV_DB.prepare(
        `UPDATE profile_cache SET last_used_at = ?, use_count = use_count + 1 WHERE user_id = ? AND hash = ?`
    ).bind(now, userId, hash).run().catch(() => {});

    return json({ found: true, hash, slot_id: row.slot_id, slot_name: row.slot_name, compact_json: row.compact_json }, request, env);
}

export async function handleProfileCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Rate-limit writes: bounds both accidental double-fire (e.g. two tabs /
    // a retry racing a slow request) and any client stuck in a save-loop from
    // hammering D1. Concurrent identical writes are also safe at the DB level
    // — the INSERT below is an atomic UPSERT keyed by (user_id, hash), so two
    // simultaneous requests for the same profile snapshot just resolve to the
    // same row, never a duplicate or a race.
    const rl = await rateLimitRequest(env, request, 'cache', 30, 60);
    if (!rl.allowed) return rateLimitResponse(request, env, rl.retryAfter);

    const userId = await getSessionUserId(request, env);
    if (!userId) return json({ error: 'unauthorized' }, request, env, 401);

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

    // Slot ownership is still verified so an attacker who guesses another
    // user's slot_id cannot even attribute a cache row to it under their own
    // user_id namespace with a spoofed slot_id.
    const slotRow = await env.CV_DB.prepare(
        `SELECT 1 FROM user_slots WHERE slot_id = ? AND user_id = ? LIMIT 1`
    ).bind(slotId, userId).first<{ 1: number }>();
    if (!slotRow) return json({ error: 'forbidden' }, request, env, 403);

    const now = Math.floor(Date.now() / 1000);

    await env.CV_DB.prepare(
        `INSERT INTO profile_cache (user_id, hash, slot_id, slot_name, compact_json, created_at, last_used_at, use_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(user_id, hash) DO UPDATE SET
             last_used_at = excluded.last_used_at,
             slot_name    = excluded.slot_name`
    ).bind(userId, hash, slotId, slotName, compactJson, now, now).run();

    const ninetyDaysAgo = now - 90 * 24 * 3600;
    ctx.waitUntil(
        env.CV_DB.prepare(
            `DELETE FROM profile_cache WHERE user_id = ? AND slot_id = ? AND hash != ? AND last_used_at < ?`
        ).bind(userId, slotId, hash, ninetyDaysAgo).run().catch(() => {})
    );

    // Structural row cap (Rule: bound DB growth, not just age it out). Even if
    // a client somehow wrote a new distinct hash every minute forever, this
    // guarantees no single account can ever hold more than
    // PROFILE_CACHE_MAX_ROWS_PER_USER rows — oldest-by-last-use is evicted
    // first, regardless of the 90-day window above.
    ctx.waitUntil(
        env.CV_DB.prepare(
            `DELETE FROM profile_cache
             WHERE user_id = ? AND hash NOT IN (
                 SELECT hash FROM profile_cache WHERE user_id = ?
                 ORDER BY last_used_at DESC LIMIT ?
             )`
        ).bind(userId, userId, PROFILE_CACHE_MAX_ROWS_PER_USER).run().catch(() => {})
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
