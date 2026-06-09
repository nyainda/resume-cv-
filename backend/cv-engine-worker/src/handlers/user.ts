/// <reference types="@cloudflare/workers-types" />
import { Env } from '../types';
import { json } from '../utils';

function randomShareId(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    for (const b of arr) out += chars[b % chars.length];
    return out;
}

// ─── Share links ──────────────────────────────────────────────────────────────

export async function handleShareGet(request: Request, env: Env, url: URL): Promise<Response> {
    const id = (url.searchParams.get('id') || '').trim();
    if (!id || id.length < 4 || id.length > 16) {
        return json({ error: 'missing_id' }, request, env, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const row = await env.CV_DB.prepare(
        `SELECT payload, expires_at FROM cv_shares WHERE id = ?`
    ).bind(id).first<{ payload: string; expires_at: number }>();

    if (!row) return json({ error: 'not_found' }, request, env, 404);
    if (row.expires_at < now) {
        env.CV_DB.prepare(`DELETE FROM cv_shares WHERE id = ?`).bind(id).run().catch(() => {});
        return json({ error: 'expired' }, request, env, 410);
    }

    env.CV_DB.prepare(`UPDATE cv_shares SET view_count = view_count + 1 WHERE id = ?`)
        .bind(id).run().catch(() => {});

    return json({ ok: true, id, payload: row.payload }, request, env);
}

export async function handleSharePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const payload = typeof body?.payload === 'string' ? body.payload.trim() : '';
    if (!payload)                        return json({ error: 'missing_payload' }, request, env, 400);
    if (payload.length > 65536)          return json({ error: 'payload_too_large', max: 65536 }, request, env, 413);

    const ttlDays   = Math.min(Math.max(parseInt(body?.ttl_days ?? '30', 10), 1), 90);
    const now       = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlDays * 86400;

    let id = randomShareId();
    for (let attempt = 0; attempt < 2; attempt++) {
        const existing = await env.CV_DB.prepare(`SELECT id FROM cv_shares WHERE id = ?`).bind(id).first();
        if (!existing) break;
        id = randomShareId();
    }

    await env.CV_DB.prepare(
        `INSERT INTO cv_shares (id, payload, created_at, expires_at, view_count)
         VALUES (?, ?, ?, ?, 0)`
    ).bind(id, payload, now, expiresAt).run();

    ctx.waitUntil(
        env.CV_DB.prepare(`DELETE FROM cv_shares WHERE expires_at < ?`)
            .bind(now).run().catch(() => {})
    );

    return json({ ok: true, id, expires_at: expiresAt }, request, env, 201);
}

// ─── Job search cache ─────────────────────────────────────────────────────────

export async function handleJobCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
    const key = (url.searchParams.get('key') || '').trim();
    if (!key || key.length < 16) return json({ error: 'missing_key' }, request, env, 400);

    const now = Math.floor(Date.now() / 1000);
    const row = await env.CV_DB.prepare(
        `SELECT results_json, source, expires_at FROM job_search_cache WHERE cache_key = ?`
    ).bind(key).first<{ results_json: string; source: string; expires_at: number }>();

    if (!row || row.expires_at < now) {
        if (row) {
            env.CV_DB.prepare(`DELETE FROM job_search_cache WHERE cache_key = ?`).bind(key).run().catch(() => {});
        }
        return json({ hit: false }, request, env, 404);
    }

    env.CV_DB.prepare(
        `UPDATE job_search_cache SET use_count = use_count + 1 WHERE cache_key = ?`
    ).bind(key).run().catch(() => {});

    return json({ hit: true, source: row.source, results_json: row.results_json }, request, env);
}

export async function handleJobCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const key         = typeof body?.key          === 'string' ? body.key.trim()          : '';
    const resultsJson = typeof body?.results_json === 'string' ? body.results_json         : '';
    const queryText   = typeof body?.query_text   === 'string' ? body.query_text.substring(0, 300) : '';
    const source      = typeof body?.source       === 'string' ? body.source.substring(0, 20)      : 'tavily';
    const ttlHours    = Math.min(Math.max(parseInt(body?.ttl_hours ?? '6', 10), 1), 48);

    if (!key || key.length < 16)        return json({ error: 'invalid_key' }, request, env, 400);
    if (!resultsJson)                   return json({ error: 'missing_results_json' }, request, env, 400);
    if (resultsJson.length > 204800)    return json({ error: 'results_too_large', max: 204800 }, request, env, 413);

    const now       = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlHours * 3600;

    await env.CV_DB.prepare(
        `INSERT INTO job_search_cache (cache_key, query_text, results_json, source, created_at, expires_at, use_count)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(cache_key) DO UPDATE SET
           results_json = excluded.results_json,
           source       = excluded.source,
           expires_at   = excluded.expires_at`
    ).bind(key, queryText, resultsJson, source, now, expiresAt).run();

    ctx.waitUntil(
        env.CV_DB.prepare(`DELETE FROM job_search_cache WHERE expires_at < ?`)
            .bind(now).run().catch(() => {})
    );

    return json({ ok: true, key, cached: true }, request, env);
}

// ─── Anonymous events ─────────────────────────────────────────────────────────

export async function handleEventPost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ ok: true }, request, env); }

    const eventType = typeof body?.event_type === 'string' ? body.event_type.substring(0, 50).trim() : '';
    const template  = typeof body?.template   === 'string' ? body.template.substring(0, 60).trim()   : '';
    const mode      = typeof body?.mode       === 'string' ? body.mode.substring(0, 20).trim()       : '';
    const metadata  = typeof body?.metadata   === 'string' ? body.metadata.substring(0, 1024)        : '{}';

    if (!eventType) return json({ ok: true }, request, env);

    const now = Math.floor(Date.now() / 1000);

    ctx.waitUntil(
        env.CV_DB.prepare(
            `INSERT INTO cv_events (event_type, template, mode, metadata, created_at)
             VALUES (?, ?, ?, ?, ?)`
        ).bind(eventType, template, mode, metadata, now).run().catch(() => {})
    );

    return json({ ok: true }, request, env);
}

// ─── Custom templates ─────────────────────────────────────────────────────────

export async function handleCustomTemplatesGet(request: Request, env: Env, url: URL): Promise<Response> {
    const deviceId = (url.searchParams.get('device_id') || '').trim().substring(0, 64);
    if (!deviceId) return json({ error: 'missing_device_id' }, request, env, 400);

    const rows = await env.CV_DB.prepare(
        `SELECT id, name, spec_json, thumbnail, created_at, updated_at
         FROM custom_templates WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`
    ).bind(deviceId).all();

    return json({ templates: rows.results ?? [] }, request, env);
}

export async function handleCustomTemplatesPost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const deviceId  = typeof body?.device_id === 'string' ? body.device_id.trim().substring(0, 64)  : '';
    const id        = typeof body?.id        === 'string' ? body.id.trim().substring(0, 64)         : '';
    const name      = typeof body?.name      === 'string' ? body.name.trim().substring(0, 120)      : '';
    const specJson  = typeof body?.spec_json === 'string' ? body.spec_json                          : '';
    const thumbnail = typeof body?.thumbnail === 'string' ? body.thumbnail.substring(0, 204800)     : null;

    if (!deviceId)                return json({ error: 'missing_device_id' }, request, env, 400);
    if (!id)                      return json({ error: 'missing_id' }, request, env, 400);
    if (!name)                    return json({ error: 'missing_name' }, request, env, 400);
    if (!specJson)                return json({ error: 'missing_spec_json' }, request, env, 400);
    if (specJson.length > 204800) return json({ error: 'spec_too_large', max: 204800 }, request, env, 413);

    try { JSON.parse(specJson); } catch { return json({ error: 'spec_json_invalid' }, request, env, 400); }

    const now = Math.floor(Date.now() / 1000);

    await env.CV_DB.prepare(
        `INSERT INTO custom_templates (id, user_id, name, spec_json, thumbnail, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, spec_json = excluded.spec_json,
           thumbnail = excluded.thumbnail, updated_at = excluded.updated_at`
    ).bind(id, deviceId, name, specJson, thumbnail, now, now).run();

    ctx.waitUntil(
        env.CV_DB.prepare(
            `DELETE FROM custom_templates WHERE user_id = ? AND id NOT IN
             (SELECT id FROM custom_templates WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50)`
        ).bind(deviceId, deviceId).run().catch(() => {})
    );

    return json({ ok: true, id }, request, env);
}

export async function handleCustomTemplatesDelete(request: Request, env: Env, url: URL): Promise<Response> {
    const id       = url.pathname.split('/').pop()?.trim() ?? '';
    const deviceId = (url.searchParams.get('device_id') || '').trim().substring(0, 64);

    if (!id || !deviceId) return json({ error: 'missing_params' }, request, env, 400);

    const result = await env.CV_DB.prepare(
        `DELETE FROM custom_templates WHERE id = ? AND user_id = ?`
    ).bind(id, deviceId).run();

    const deleted = (result.meta?.changes ?? 0) > 0;
    return json({ ok: deleted, id }, request, env, deleted ? 200 : 404);
}

export async function handleCustomTemplatesPatch(request: Request, env: Env, url: URL): Promise<Response> {
    const id = url.pathname.split('/').pop()?.trim() ?? '';
    if (!id) return json({ error: 'missing_id' }, request, env, 400);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const deviceId = typeof body?.device_id === 'string' ? body.device_id.trim().substring(0, 64) : '';
    const name     = typeof body?.name      === 'string' ? body.name.trim().substring(0, 120)      : '';

    if (!deviceId) return json({ error: 'missing_device_id' }, request, env, 400);
    if (!name)     return json({ error: 'missing_name' }, request, env, 400);

    const now = Math.floor(Date.now() / 1000);

    const result = await env.CV_DB.prepare(
        `UPDATE custom_templates SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    ).bind(name, now, id, deviceId).run();

    const updated = (result.meta?.changes ?? 0) > 0;
    return json({ ok: updated, id, name }, request, env, updated ? 200 : 404);
}

// ─── User data sync ───────────────────────────────────────────────────────────

export async function handleUserSlotsPost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const deviceId   = typeof body?.device_id    === 'string' ? body.device_id.trim().substring(0, 64)    : '';
    const slotId     = typeof body?.slot_id      === 'string' ? body.slot_id.trim().substring(0, 64)      : '';
    const slotName   = typeof body?.slot_name    === 'string' ? body.slot_name.trim().substring(0, 120)   : '';
    const color      = typeof body?.color        === 'string' ? body.color.trim().substring(0, 32)        : 'indigo';
    const profileJson= typeof body?.profile_json === 'string' ? body.profile_json                          : '';
    const currentCv  = typeof body?.current_cv   === 'string' ? body.current_cv.substring(0, 1024)       : null;

    if (!deviceId)                        return json({ error: 'missing_device_id' }, request, env, 400);
    if (!slotId)                          return json({ error: 'missing_slot_id' }, request, env, 400);
    if (!profileJson)                     return json({ error: 'missing_profile_json' }, request, env, 400);
    if (profileJson.length > 524288)      return json({ error: 'profile_too_large', max: 524288 }, request, env, 413);

    try { JSON.parse(profileJson); } catch { return json({ error: 'profile_json_invalid' }, request, env, 400); }

    const now = Math.floor(Date.now() / 1000);

    await env.CV_DB.prepare(
        `INSERT INTO user_slots (device_id, slot_id, slot_name, color, profile_json, current_cv, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(device_id, slot_id) DO UPDATE SET
           slot_name    = excluded.slot_name,
           color        = excluded.color,
           profile_json = excluded.profile_json,
           current_cv   = excluded.current_cv,
           updated_at   = excluded.updated_at`
    ).bind(deviceId, slotId, slotName, color, profileJson, currentCv, now).run();

    ctx.waitUntil(
        env.CV_DB.prepare(
            `DELETE FROM user_slots WHERE device_id = ? AND slot_id NOT IN
             (SELECT slot_id FROM user_slots WHERE device_id = ? ORDER BY updated_at DESC LIMIT 10)`
        ).bind(deviceId, deviceId).run().catch(() => {})
    );

    return json({ ok: true, slot_id: slotId }, request, env);
}

export async function handleUserPrefsPost(request: Request, env: Env): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const deviceId      = typeof body?.device_id        === 'string' ? body.device_id.trim().substring(0, 64) : '';
    const aiProvider    = typeof body?.ai_provider      === 'string' ? body.ai_provider.trim().substring(0, 32) : null;
    const sidebarSecs   = typeof body?.sidebar_sections === 'string' ? body.sidebar_sections.substring(0, 512)  : null;
    const cvPurpose     = typeof body?.cv_purpose       === 'string' ? body.cv_purpose.trim().substring(0, 64)  : null;
    const targetCompany = typeof body?.target_company   === 'string' ? body.target_company.trim().substring(0, 120) : null;
    const targetJobTitle= typeof body?.target_job_title === 'string' ? body.target_job_title.trim().substring(0, 120) : null;
    const jdKeywords    = typeof body?.jd_keywords      === 'string' ? body.jd_keywords.substring(0, 2048)      : null;
    const darkMode      = typeof body?.dark_mode        === 'number' ? (body.dark_mode ? 1 : 0) : 0;

    if (!deviceId) return json({ error: 'missing_device_id' }, request, env, 400);

    const now = Math.floor(Date.now() / 1000);

    await env.CV_DB.prepare(
        `INSERT INTO user_preferences
           (device_id, ai_provider, sidebar_sections, cv_purpose, target_company, target_job_title, jd_keywords, dark_mode, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET
           ai_provider      = excluded.ai_provider,
           sidebar_sections = excluded.sidebar_sections,
           cv_purpose       = excluded.cv_purpose,
           target_company   = excluded.target_company,
           target_job_title = excluded.target_job_title,
           jd_keywords      = excluded.jd_keywords,
           dark_mode        = excluded.dark_mode,
           updated_at       = excluded.updated_at`
    ).bind(deviceId, aiProvider, sidebarSecs, cvPurpose, targetCompany, targetJobTitle, jdKeywords, darkMode, now).run();

    return json({ ok: true }, request, env);
}

export async function handleUserDataGet(request: Request, env: Env, url: URL): Promise<Response> {
    const deviceId = (url.searchParams.get('device_id') || '').trim().substring(0, 64);
    if (!deviceId) return json({ error: 'missing_device_id' }, request, env, 400);

    const [slotsResult, prefsResult] = await Promise.all([
        env.CV_DB.prepare(
            `SELECT slot_id, slot_name, color, profile_json, current_cv, updated_at
             FROM user_slots WHERE device_id = ? ORDER BY updated_at DESC LIMIT 10`
        ).bind(deviceId).all(),
        env.CV_DB.prepare(
            `SELECT ai_provider, sidebar_sections, cv_purpose, target_company,
                    target_job_title, jd_keywords, dark_mode, updated_at
             FROM user_preferences WHERE device_id = ?`
        ).bind(deviceId).first(),
    ]);

    return json({
        device_id: deviceId,
        slots: slotsResult.results ?? [],
        prefs: prefsResult ?? null,
    }, request, env);
}
