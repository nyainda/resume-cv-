/// <reference types="@cloudflare/workers-types" />
import { Env, kvd, ADMIN_TABLES, ADMIN_SEARCHABLE, VALID_ROLES, AdminRole } from '../types';
import { json, safeJson, clamp, verifyAdminAuth, unauthorized, sha256Hex } from '../utils';
import { handleSync } from './data';
import { buildBriefData } from './brief';
import { computeVoiceValidation } from './validation';

export async function handleAdminStats(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');
    const counts: Record<string, number> = {};
    for (const t of ADMIN_TABLES) {
        try {
            const r = await env.CV_DB.prepare(`SELECT COUNT(*) AS c FROM ${t}`).first<{ c: number }>();
            counts[t] = Number(r?.c ?? 0);
        } catch {
            counts[t] = -1;
        }
    }
    const lastSync = await env.CV_KV.get('cv:meta:last_sync');
    return json({ ok: true, counts, last_sync: lastSync ? Number(lastSync) : null }, request, env);
}

export async function handleBulkAdd(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');
    const token = request.headers.get('X-Admin-Token') || '';
    const body = await safeJson(request);
    const table: string = String(body?.table || '');
    const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
    if (!ADMIN_TABLES.has(table)) {
        return json({ error: 'invalid_table', allowed: Array.from(ADMIN_TABLES) }, request, env, 400);
    }
    if (rows.length === 0 || rows.length > 500) {
        return json({ error: 'invalid_rows', message: 'rows must be a non-empty array of <= 500 items' }, request, env, 400);
    }

    let inserted = 0, skipped = 0, failed = 0;
    const errors: string[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') { failed++; continue; }
        const cols = Object.keys(row).filter(k => /^[a-z_][a-z0-9_]*$/i.test(k));
        if (cols.length === 0) { failed++; continue; }
        const values = cols.map(c => {
            const v = (row as any)[c];
            if (Array.isArray(v) || (v !== null && typeof v === 'object')) return JSON.stringify(v);
            return v;
        });
        const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
        try {
            const res = await env.CV_DB.prepare(sql).bind(...values).run();
            const changes = (res as any)?.meta?.changes ?? (res as any)?.changes ?? 0;
            if (changes > 0) inserted++; else skipped++;
        } catch (e: any) {
            failed++;
            if (errors.length < 5) errors.push(String(e?.message || e));
        }
    }

    let synced = false;
    if (inserted > 0) {
        try {
            const fakeReq = new Request(request.url, { headers: { 'X-Admin-Token': token } });
            const r = await handleSync(fakeReq, env);
            synced = r.status === 200;
        } catch { /* non-fatal */ }
    }

    return json({ ok: failed === 0, inserted, skipped, failed, errors, synced }, request, env);
}

export async function handleAdminList(request: Request, env: Env, url: URL): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');
    const table = String(url.searchParams.get('table') || '');
    if (!ADMIN_TABLES.has(table)) {
        return json({ error: 'invalid_table', allowed: Array.from(ADMIN_TABLES) }, request, env, 400);
    }
    const limit = clamp(parseInt(url.searchParams.get('limit') || '100', 10), 1, 500);
    const offset = clamp(parseInt(url.searchParams.get('offset') || '0', 10), 0, 1_000_000);
    const q = String(url.searchParams.get('q') || '').trim();

    let sql = `SELECT * FROM ${table}`;
    const binds: any[] = [];
    if (q && ADMIN_SEARCHABLE[table]) {
        const cols = ADMIN_SEARCHABLE[table];
        const conds = cols.map(c => `${c} LIKE ?`).join(' OR ');
        sql += ` WHERE ${conds}`;
        for (let i = 0; i < cols.length; i++) binds.push(`%${q}%`);
    }
    sql += ` LIMIT ? OFFSET ?`;
    binds.push(limit, offset);

    const totalRow = await env.CV_DB.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c: number }>();
    const r = await env.CV_DB.prepare(sql).bind(...binds).all();
    return json({
        ok: true,
        table,
        total: Number(totalRow?.c ?? 0),
        limit,
        offset,
        rows: (r.results as any[]) || [],
    }, request, env);
}

export async function handleBulkUpdate(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');
    const token = request.headers.get('X-Admin-Token') || '';
    const body = await safeJson(request);
    const table: string = String(body?.table || '');
    const updates: any[] = Array.isArray(body?.updates) ? body.updates : [];
    if (!ADMIN_TABLES.has(table)) return json({ error: 'invalid_table' }, request, env, 400);
    if (updates.length === 0 || updates.length > 500) {
        return json({ error: 'invalid_updates', message: '1-500 updates required' }, request, env, 400);
    }

    let updated = 0, missing = 0, failed = 0;
    const errors: string[] = [];
    for (const u of updates) {
        const id = u && typeof u === 'object' ? u.id : null;
        if (!id || typeof id !== 'string') { failed++; continue; }
        const setObj: Record<string, any> = {};
        for (const [k, v] of Object.entries(u)) {
            if (k === 'id') continue;
            if (!/^[a-z_][a-z0-9_]*$/i.test(k)) continue;
            setObj[k] = (Array.isArray(v) || (v !== null && typeof v === 'object')) ? JSON.stringify(v) : v;
        }
        const cols = Object.keys(setObj);
        if (cols.length === 0) { failed++; continue; }
        const sql = `UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`;
        try {
            const res = await env.CV_DB.prepare(sql).bind(...cols.map(c => setObj[c]), id).run();
            const changes = (res as any)?.meta?.changes ?? 0;
            if (changes > 0) updated++; else missing++;
        } catch (e: any) {
            failed++;
            if (errors.length < 5) errors.push(String(e?.message || e));
        }
    }

    let synced = false;
    if (updated > 0) {
        try {
            const fakeReq = new Request(request.url, { headers: { 'X-Admin-Token': token } });
            const r = await handleSync(fakeReq, env);
            synced = r.status === 200;
        } catch { /* non-fatal */ }
    }
    return json({ ok: failed === 0, updated, missing, failed, errors, synced }, request, env);
}

export async function handleAdminDelete(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');
    const token = request.headers.get('X-Admin-Token') || '';
    const body = await safeJson(request);
    const table: string = String(body?.table || '');
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : [];
    if (!ADMIN_TABLES.has(table)) return json({ error: 'invalid_table' }, request, env, 400);
    if (ids.length === 0 || ids.length > 500) {
        return json({ error: 'invalid_ids', message: '1-500 ids required' }, request, env, 400);
    }

    let deleted = 0, failed = 0;
    const errors: string[] = [];
    for (const id of ids) {
        try {
            const res = await env.CV_DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
            const changes = (res as any)?.meta?.changes ?? 0;
            if (changes > 0) deleted++;
        } catch (e: any) {
            failed++;
            if (errors.length < 5) errors.push(String(e?.message || e));
        }
    }

    let synced = false;
    if (deleted > 0) {
        try {
            const fakeReq = new Request(request.url, { headers: { 'X-Admin-Token': token } });
            const r = await handleSync(fakeReq, env);
            synced = r.status === 200;
        } catch { /* non-fatal */ }
    }
    return json({ ok: failed === 0, deleted, failed, errors, synced }, request, env);
}

export async function handleVoiceTest(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');
    const body = await safeJson(request);
    const bullets: string[] = Array.isArray(body?.bullets)
        ? body.bullets.map((b: any) => String(b || '')).filter(Boolean)
        : [];
    if (bullets.length === 0) return json({ error: 'missing_bullets' }, request, env, 400);
    if (bullets.length > 50) return json({ error: 'too_many_bullets', max: 50 }, request, env, 400);

    const brief = await buildBriefData(env, body || {});
    const validation = computeVoiceValidation(bullets, brief);

    return json({
        ok: true,
        bullets,
        brief: {
            voice: brief.voice,
            field: brief.field,
            seniority: brief.seniority,
            rhythm: brief.rhythm,
            forbidden_phrases: brief.forbidden_phrases,
            verb_pool_sample: (brief.verb_pool || []).slice(0, 12),
            debug: brief.debug,
        },
        validation,
    }, request, env);
}

export async function handleAiAudit(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');
    if (!env.AI) return json({ error: 'ai_binding_missing' }, request, env, 500);

    const body = await safeJson(request);
    let text: string = String(body?.text || '').trim();
    if (!text && Array.isArray(body?.bullets)) text = body.bullets.join('\n');
    if (!text) return json({ error: 'missing_text' }, request, env, 400);
    if (text.length > 8000) text = text.slice(0, 8000);

    const banned = (await env.CV_KV.get<any[]>(kvd('cv:banned:all'), { type: 'json' })) || [];
    const bannedSet = new Set(banned.map((b: any) => String(b.phrase || '').toLowerCase()).filter(Boolean));

    const [techVerbsKv, mgmtVerbsKv, analysisVerbsKv, resultsKv] = await Promise.all([
        env.CV_KV.get<any[]>(kvd('cv:verbs:technical:past'), { type: 'json' }),
        env.CV_KV.get<any[]>(kvd('cv:verbs:management:past'), { type: 'json' }),
        env.CV_KV.get<any[]>(kvd('cv:verbs:analysis:past'), { type: 'json' }),
        env.CV_KV.get<any[]>(kvd('cv:results:emdash'), { type: 'json' }),
    ]);
    const pickVerbs = (arr: any[] | null, n: number) =>
        (arr || []).filter((r: any) => (r.human_score ?? 0) >= 8)
            .slice(0, n).map((r: any) => r.verb_past).filter(Boolean);
    const sampleVerbs = [
        ...pickVerbs(techVerbsKv, 12),
        ...pickVerbs(mgmtVerbsKv, 8),
        ...pickVerbs(analysisVerbsKv, 8),
    ];
    const sampleEmdash = (resultsKv || []).slice(0, 5).map((r: any) => r.example).filter(Boolean);
    const styleAnchor = sampleVerbs.length
        ? `\n\nHouse style — preferred verbs (use these, or near-synonyms, when proposing replacements):\n${sampleVerbs.join(', ')}.`
        : '';
    const emdashAnchor = sampleEmdash.length
        ? `\n\nHouse style — punchy human bullet endings look like:\n${sampleEmdash.map((e: string) => `  • ${e}`).join('\n')}`
        : '';

    const sys = `You are a strict CV editor that detects AI-generated language ("AI-isms") in resume bullets — phrases that sound robotic, generic, buzzword-heavy, or written by ChatGPT.

Return ONLY a JSON object with this exact shape, no prose:
{"findings":[{"phrase":"<exact span from text, lowercase>","severity":"critical|high|medium","reason":"<why it sounds AI-generated>","replacement":"<a punchy human-toned alternative or empty string>"}]}

Rules:
- Only flag phrases that are clearly AI-isms — buzzwords, hollow superlatives, hedge phrases, robotic transitions, vague impact claims with no number.
- Each "phrase" MUST appear verbatim (case-insensitive) in the text. Do NOT invent phrases.
- Severity: critical = obvious ChatGPT giveaway (e.g. "leveraging cutting-edge"), high = strong buzzword, medium = mildly weak.
- Replacement should be 1-4 words, concrete, action-led, and match our house style below. Empty string if removal is enough.
- Maximum 15 findings. No duplicates.${styleAnchor}${emdashAnchor}`;

    const user = `Audit this CV text and return JSON only:\n\n${text}`;

    let raw: any = null;
    try {
        raw = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user },
            ],
            max_tokens: 800,
            temperature: 0.2,
        });
    } catch (err: any) {
        return json({ error: 'ai_run_failed', message: String(err?.message || err) }, request, env, 502);
    }

    const responseText: string = String(raw?.response || raw?.result?.response || raw?.choices?.[0]?.message?.content || '').trim();
    let parsed: any = null;
    try {
        const jsonStart = responseText.indexOf('{');
        const jsonEnd = responseText.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
            parsed = JSON.parse(responseText.slice(jsonStart, jsonEnd + 1));
        }
    } catch {
        parsed = null;
    }

    const findings: Array<{ phrase: string; severity: string; reason: string; replacement: string }> =
        Array.isArray(parsed?.findings) ? parsed.findings : [];

    const lowerText = text.toLowerCase();
    const cleaned = findings
        .map(f => ({
            phrase: String(f.phrase || '').trim().toLowerCase(),
            severity: ['critical', 'high', 'medium'].includes(String(f.severity)) ? String(f.severity) : 'medium',
            reason: String(f.reason || '').trim(),
            replacement: String(f.replacement || '').trim(),
        }))
        .filter(f => f.phrase && f.phrase.length <= 80 && lowerText.includes(f.phrase) && !bannedSet.has(f.phrase))
        .filter((f, i, arr) => arr.findIndex(x => x.phrase === f.phrase) === i)
        .slice(0, 15);

    return json({
        ok: true,
        text_length: text.length,
        already_banned_count: banned.length,
        new_findings: cleaned.length,
        findings: cleaned,
        model: '@cf/meta/llama-3.1-8b-instruct',
        raw_response: responseText.slice(0, 400),
    }, request, env);
}

export async function handleTokensList(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'admin');
    if (!auth) return unauthorized(request, env, 'admin');
    const rs = await env.CV_DB.prepare(
        `SELECT id, label, role, created_at, last_used_at, revoked_at
           FROM cv_admin_tokens ORDER BY revoked_at IS NULL DESC, created_at DESC`
    ).all();
    return json({ ok: true, rows: rs.results }, request, env);
}

export async function handleTokensCreate(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'admin');
    if (!auth) return unauthorized(request, env, 'admin');

    const body = await safeJson(request);
    const label = String(body?.label || '').trim().slice(0, 80);
    const role = String(body?.role || 'editor') as AdminRole;
    if (!label) return json({ error: 'missing_label' }, request, env, 400);
    if (!VALID_ROLES.includes(role)) return json({ error: 'invalid_role', allowed: VALID_ROLES }, request, env, 400);

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const plaintext = 'cvk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const hash = await sha256Hex(plaintext);
    const id = crypto.randomUUID();

    try {
        await env.CV_DB.prepare(
            `INSERT INTO cv_admin_tokens (id, token_hash, label, role) VALUES (?, ?, ?, ?)`
        ).bind(id, hash, label, role).run();
    } catch (e: any) {
        return json({ error: 'create_failed', message: String(e?.message || e) }, request, env, 500);
    }
    return json({ ok: true, id, label, role, token: plaintext, warning: 'Save this token now — it will never be shown again.' }, request, env);
}

export async function handleTokensRevoke(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'admin');
    if (!auth) return unauthorized(request, env, 'admin');

    const body = await safeJson(request);
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.map((x: any) => String(x)).filter(Boolean) : [];
    if (ids.length === 0) return json({ error: 'missing_ids' }, request, env, 400);
    if (auth.tokenId && ids.includes(auth.tokenId)) {
        return json({ error: 'cannot_revoke_self', message: 'Use another admin token to revoke this one.' }, request, env, 400);
    }
    let revoked = 0;
    for (const id of ids) {
        const r = await env.CV_DB.prepare(
            `UPDATE cv_admin_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL`
        ).bind(id).run();
        if (r.meta?.changes) revoked += Number(r.meta.changes);
    }
    return json({ ok: true, revoked }, request, env);
}

// ── New dashboard endpoints ───────────────────────────────────────────────────

/** GET /api/cv/admin/dashboard-stats */
export async function handleDashboardStats(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');

    const now = Math.floor(Date.now() / 1000);
    const todayStart = Math.floor(new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime() / 1000);
    const weekStart  = todayStart - 6 * 86400;

    const [tu, nt, nw, as_, sd, gu, mu, rs, sbd, tableCounts] = await Promise.all([
        env.CV_DB.prepare(`SELECT COUNT(*) as c FROM user_identities`).first<{c:number}>(),
        env.CV_DB.prepare(`SELECT COUNT(*) as c FROM user_identities WHERE created_at >= ?`).bind(todayStart).first<{c:number}>(),
        env.CV_DB.prepare(`SELECT COUNT(*) as c FROM user_identities WHERE created_at >= ?`).bind(weekStart).first<{c:number}>(),
        env.CV_DB.prepare(`SELECT COUNT(*) as c FROM user_sessions WHERE expires_at > ?`).bind(now).first<{c:number}>(),
        env.CV_DB.prepare(`SELECT COUNT(*) as c FROM auth_audit_log WHERE created_at >= ? AND event LIKE 'signin%'`).bind(todayStart).first<{c:number}>(),
        env.CV_DB.prepare(`SELECT COUNT(*) as c FROM user_identities WHERE google_id IS NOT NULL`).first<{c:number}>(),
        env.CV_DB.prepare(`SELECT COUNT(*) as c FROM user_identities WHERE google_id IS NULL`).first<{c:number}>(),
        env.CV_DB.prepare(`
            SELECT l.event, l.method, l.ip, l.created_at, u.email, u.name, u.picture
            FROM auth_audit_log l JOIN user_identities u ON u.id = l.user_id
            ORDER BY l.created_at DESC LIMIT 10
        `).all(),
        env.CV_DB.prepare(`
            SELECT date(created_at,'unixepoch') as day, COUNT(*) as count
            FROM user_identities WHERE created_at >= ?
            GROUP BY day ORDER BY day ASC
        `).bind(weekStart).all(),
        Promise.all(
            ['user_identities','user_sessions','auth_audit_log','llm_cache','cv_examples','profile_cache'].map(async t => {
                try { const r = await env.CV_DB.prepare(`SELECT COUNT(*) as c FROM ${t}`).first<{c:number}>(); return { table: t, count: r?.c ?? 0 }; }
                catch { return { table: t, count: -1 }; }
            })
        ),
    ]);

    return json({
        ok: true,
        stats: {
            total_users: tu?.c ?? 0,
            new_today: nt?.c ?? 0,
            new_this_week: nw?.c ?? 0,
            active_sessions: as_?.c ?? 0,
            signins_today: sd?.c ?? 0,
            google_users: gu?.c ?? 0,
            magic_link_users: mu?.c ?? 0,
        },
        recent_signins: rs.results ?? [],
        signups_by_day: sbd.results ?? [],
        table_counts: tableCounts,
    }, request, env);
}

/** GET /api/cv/admin/users?search=&plan=&limit=&offset= */
export async function handleUsersList(request: Request, env: Env, url: URL): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');

    const search = (url.searchParams.get('search') || '').trim();
    const plan   = url.searchParams.get('plan') || '';
    const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '50'), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);
    const now    = Math.floor(Date.now() / 1000);

    const conds: string[] = [];
    const binds: any[] = [];
    if (search) { conds.push('(u.email LIKE ? OR u.name LIKE ?)'); binds.push(`%${search}%`, `%${search}%`); }
    if (plan)   { conds.push('u.plan = ?'); binds.push(plan); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const countRow = await env.CV_DB.prepare(`SELECT COUNT(*) as c FROM user_identities u ${where}`).bind(...binds).first<{c:number}>();
    const rows = await env.CV_DB.prepare(`
        SELECT u.id, u.email, u.name, u.picture, u.plan, u.created_at, u.last_seen_at,
               (u.google_id IS NOT NULL) as has_google,
               (SELECT COUNT(*) FROM user_sessions s WHERE s.user_id = u.id AND s.expires_at > ${now}) as active_sessions,
               (SELECT MAX(l.created_at) FROM auth_audit_log l WHERE l.user_id = u.id AND l.event LIKE 'signin%') as last_signin_at
        FROM user_identities u ${where}
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all();

    return json({ ok: true, total: countRow?.c ?? 0, limit, offset, users: rows.results ?? [] }, request, env);
}

/** PATCH /api/cv/admin/users/plan */
export async function handleUsersUpdatePlan(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');
    const body = await safeJson(request);
    const userId = body?.user_id ? Number(body.user_id) : null;
    const plan   = typeof body?.plan === 'string' ? body.plan : '';
    if (!userId || !['free','byok','pro'].includes(plan)) return json({ error: 'invalid_params' }, request, env, 400);
    await env.CV_DB.prepare(`UPDATE user_identities SET plan = ? WHERE id = ?`).bind(plan, userId).run();
    return json({ ok: true }, request, env);
}

/** DELETE /api/cv/admin/users/sessions */
export async function handleUsersRevokeSessions(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'admin');
    if (!auth) return unauthorized(request, env, 'admin');
    const body = await safeJson(request);
    const userId = body?.user_id ? Number(body.user_id) : null;
    if (!userId) return json({ error: 'missing_user_id' }, request, env, 400);
    const r = await env.CV_DB.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).bind(userId).run();
    return json({ ok: true, revoked: r.meta?.changes ?? 0 }, request, env);
}

/** GET /api/cv/admin/auth-logs?event=&search=&limit=&offset= */
export async function handleAuthLogsList(request: Request, env: Env, url: URL): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');

    const event  = url.searchParams.get('event')  || '';
    const search = (url.searchParams.get('search') || '').trim();
    const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '50'), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);

    const conds: string[] = [];
    const binds: any[] = [];
    if (event)  { conds.push('l.event = ?'); binds.push(event); }
    if (search) { conds.push('(u.email LIKE ? OR l.ip LIKE ?)'); binds.push(`%${search}%`, `%${search}%`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const countRow = await env.CV_DB.prepare(
        `SELECT COUNT(*) as c FROM auth_audit_log l JOIN user_identities u ON u.id = l.user_id ${where}`
    ).bind(...binds).first<{c:number}>();

    const rows = await env.CV_DB.prepare(`
        SELECT l.id, l.event, l.method, l.ip, l.user_agent, l.created_at,
               u.id as user_id, u.email, u.name, u.picture
        FROM auth_audit_log l JOIN user_identities u ON u.id = l.user_id
        ${where}
        ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all();

    return json({ ok: true, total: countRow?.c ?? 0, limit, offset, logs: rows.results ?? [] }, request, env);
}
