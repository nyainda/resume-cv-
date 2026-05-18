/// <reference types="@cloudflare/workers-types" />
/**
 * cv-engine-worker — Phase B.
 *
 * Routes:
 *   GET  /health              D1 row counts
 *   GET  /api/cv/words        Verb pool from KV (cat, tense, count, exclude)
 *   GET  /api/cv/banned       Banned phrase list from KV
 *   GET  /api/cv/structures   Sentence structures from KV (label)
 *   GET  /api/cv/rhythm       Rhythm patterns from KV (section)
 *   POST /api/cv/clean        Deterministic cleaning pipeline (banned + dupes + caps)
 *   POST /api/cv/validate     Bullet rule validator → score + issues
 *   POST /api/cv/validate-voice  Brief-aware validator (verb pool + rhythm + voice drift)
 *   POST /api/cv/sync         Admin: rebuild KV cache from D1 (X-Admin-Token)
 *   GET  /api/cv/admin/stats  Admin: row counts + last sync (X-Admin-Token)
 *   POST /api/cv/admin/bulk-add  Admin: insert rows into a whitelisted table (X-Admin-Token)
 */

export interface Env {
    CV_DB: D1Database;
    CV_KV: KVNamespace;
    AI: Ai;
    ALLOWED_ORIGINS?: string;
    ADMIN_TOKEN?: string;
}

const VERB_CATEGORIES = ['technical', 'management', 'analysis', 'communication', 'financial', 'creative'] as const;

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(request, env) });
        }

        // ── Nuclear CORS guarantee ────────────────────────────────────────────
        // _dispatch is awaited so any thrown error is caught here rather than
        // escaping as an unhandled rejection (which would produce a raw 500 with
        // no CORS headers from Cloudflare's edge). After we have a response we
        // also force-inject CORS headers as a belt-and-suspenders measure so
        // even a raw `new Response(...)` inside a handler can't bypass CORS.
        const response = await _dispatch(request, env, ctx, url).catch((err: any) =>
            json({ error: 'internal_error', message: String(err?.message || err) }, request, env, 500)
        );
        const cors = corsHeaders(request, env);
        const h = new Headers(response.headers);
        for (const [k, v] of Object.entries(cors as Record<string, string>)) h.set(k, v);
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
    },

    async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(runLeakPromotionCron(env));
    },
} satisfies ExportedHandler<Env>;

// ── Route dispatcher ──────────────────────────────────────────────────────────
// Extracted from the fetch handler so that `await _dispatch(...)` in the
// wrapper above properly catches any thrown exception and guarantees CORS.
async function _dispatch(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
    if (url.pathname === '/health')             return handleHealth(request, env);
    if (url.pathname === '/api/cv/words')       return handleWords(request, env, url);
    if (url.pathname === '/api/cv/banned')      return handleBanned(request, env);
    if (url.pathname === '/api/cv/structures')  return handleStructures(request, env, url);
    if (url.pathname === '/api/cv/rhythm')      return handleRhythm(request, env, url);
    if (url.pathname === '/api/cv/clean'   && request.method === 'POST') return handleClean(request, env);
    if (url.pathname === '/api/cv/validate'&& request.method === 'POST') return handleValidate(request, env);
    if (url.pathname === '/api/cv/validate-voice' && request.method === 'POST') return handleValidateVoice(request, env);
    if (url.pathname === '/api/cv/brief'   && request.method === 'POST') return handleBrief(request, env, ctx);
    if (url.pathname === '/api/cv/sync'    && request.method === 'POST') return handleSync(request, env);
    if (url.pathname === '/api/cv/admin/stats')                          return handleAdminStats(request, env);
    if (url.pathname === '/api/cv/admin/bulk-add' && request.method === 'POST') return handleBulkAdd(request, env);
    if (url.pathname === '/api/cv/admin/list')                           return handleAdminList(request, env, url);
    if (url.pathname === '/api/cv/admin/bulk-update' && request.method === 'POST') return handleBulkUpdate(request, env);
    if (url.pathname === '/api/cv/admin/delete' && request.method === 'POST') return handleAdminDelete(request, env);
    if (url.pathname === '/api/cv/admin/voice-test' && request.method === 'POST') return handleVoiceTest(request, env);
    if (url.pathname === '/api/cv/admin/ai-audit' && request.method === 'POST') return handleAiAudit(request, env);
    if (url.pathname === '/api/cv/semantic-match' && request.method === 'POST') return handleSemanticMatch(request, env);
    if (url.pathname === '/api/cv/llm' && request.method === 'POST') return handleLLM(request, env);
    if (url.pathname === '/api/cv/vision-extract' && request.method === 'POST') return handleVisionExtract(request, env);
    if (url.pathname === '/api/cv/tiered-llm' && request.method === 'POST') return handleTieredLLM(request, env);
    if (url.pathname === '/api/cv/account-tier' && request.method === 'GET') return handleAccountTier(request, env);
    if (url.pathname === '/api/cv/race-llm'   && request.method === 'POST') return handleRaceLLM(request, env);
    if (url.pathname === '/api/cv/parallel-sections' && request.method === 'POST') return handleParallelSections(request, env);
    if (url.pathname === '/api/cv/leak-report' && request.method === 'POST') return handleLeakReport(request, env);
    if (url.pathname === '/api/cv/admin/leak-candidates') return handleLeakCandidatesList(request, env, url);
    if (url.pathname === '/api/cv/admin/leak-candidates/decide' && request.method === 'POST') return handleLeakCandidatesDecide(request, env);
    if (url.pathname === '/api/cv/admin/tokens' && request.method === 'GET')  return handleTokensList(request, env);
    if (url.pathname === '/api/cv/admin/tokens' && request.method === 'POST') return handleTokensCreate(request, env);
    if (url.pathname === '/api/cv/admin/tokens/revoke' && request.method === 'POST') return handleTokensRevoke(request, env);
    if (url.pathname === '/api/cv/llm-cache' && request.method === 'GET')  return handleLLMCacheGet(request, env, url);
    if (url.pathname === '/api/cv/llm-cache' && request.method === 'POST') return handleLLMCachePost(request, env, ctx);
    if (url.pathname === '/api/cv/examples' && request.method === 'GET')  return handleCVExamplesGet(request, env, url);
    if (url.pathname === '/api/cv/examples' && request.method === 'POST') return handleCVExamplesPost(request, env);
    if (url.pathname === '/api/cv/profile' && request.method === 'GET')  return handleProfileCacheGet(request, env, url);
    if (url.pathname === '/api/cv/profile' && request.method === 'POST') return handleProfileCachePost(request, env, ctx);
    if (url.pathname === '/api/cv/purify-cv' && request.method === 'POST') return handlePurifyCv(request, env);
    if (url.pathname === '/api/cv/market-research' && request.method === 'GET')  return handleMarketResearchCacheGet(request, env, url);
    if (url.pathname === '/api/cv/market-research' && request.method === 'POST') return handleMarketResearchCachePost(request, env, ctx);
    if (url.pathname === '/api/cv/jd-analysis' && request.method === 'GET')  return handleJdAnalysisCacheGet(request, env, url);
    if (url.pathname === '/api/cv/jd-analysis' && request.method === 'POST') return handleJdAnalysisCachePost(request, env, ctx);
    if (url.pathname === '/api/cv/rules' && request.method === 'GET') return handleGetRules(request, env);
    if (url.pathname === '/api/cv/proxy-llm' && request.method === 'POST') return handleProxyLLM(request, env, ctx);
    // ── Share links ───────────────────────────────────────────────────────────
    if (url.pathname === '/api/cv/share' && request.method === 'GET')  return handleShareGet(request, env, url);
    if (url.pathname === '/api/cv/share' && request.method === 'POST') return handleSharePost(request, env, ctx);
    // ── Job search cache ──────────────────────────────────────────────────────
    if (url.pathname === '/api/cv/job-cache' && request.method === 'GET')  return handleJobCacheGet(request, env, url);
    if (url.pathname === '/api/cv/job-cache' && request.method === 'POST') return handleJobCachePost(request, env, ctx);
    // ── Anonymous events ──────────────────────────────────────────────────────
    if (url.pathname === '/api/cv/event' && request.method === 'POST') return handleEventPost(request, env, ctx);
    return json({ error: 'not_found', path: url.pathname }, request, env, 404);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleHealth(request: Request, env: Env): Promise<Response> {
    const counts = await env.CV_DB.prepare(
        `SELECT
            (SELECT COUNT(*) FROM cv_verbs)            AS verbs,
            (SELECT COUNT(*) FROM cv_banned_phrases)   AS banned,
            (SELECT COUNT(*) FROM cv_voice_profiles)   AS voices,
            (SELECT COUNT(*) FROM cv_rhythm_patterns)  AS rhythms`
    ).first();
    return json({ ok: true, phase: 'B', d1: counts }, request, env);
}

async function handleWords(request: Request, env: Env, url: URL): Promise<Response> {
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

    const key = `cv:verbs:${category}:${tense}`;
    let pool = await env.CV_KV.get<any[]>(key, { type: 'json' });

    if (!pool || pool.length === 0) {
        // Cold cache — fall back to D1
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

    // Shuffle and trim so the caller gets a fresh sample each time.
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

async function handleBanned(request: Request, env: Env): Promise<Response> {
    let rows = await env.CV_KV.get<any[]>('cv:banned:all', { type: 'json' });
    let source = 'kv';
    if (!rows) {
        const r = await env.CV_DB.prepare(
            `SELECT phrase, replacement, severity FROM cv_banned_phrases ORDER BY LENGTH(phrase) DESC`
        ).all();
        rows = (r.results as any[]) || [];
        source = 'd1';
    }
    return json({ count: rows.length, banned: rows, source }, request, env);
}

async function handleStructures(request: Request, env: Env, url: URL): Promise<Response> {
    const label = (url.searchParams.get('label') || '').toLowerCase();
    const allowed = ['short', 'medium', 'long', 'personality'];
    if (!allowed.includes(label)) {
        return json({ error: 'invalid_label', allowed }, request, env, 400);
    }
    const rows = await env.CV_KV.get<any[]>(`cv:structures:${label}`, { type: 'json' }) || [];
    return json({ label, count: rows.length, structures: rows }, request, env);
}

async function handleRhythm(request: Request, env: Env, url: URL): Promise<Response> {
    const section = (url.searchParams.get('section') || '').toLowerCase();
    const all = await env.CV_KV.get<any[]>('cv:rhythm:all', { type: 'json' }) || [];
    const filtered = section ? all.filter(r => String(r.section || '').toLowerCase() === section) : all;
    return json({ section: section || 'all', count: filtered.length, patterns: filtered }, request, env);
}

async function handleClean(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const rawText: string = body?.rawText ?? body?.text ?? '';
    if (!rawText || typeof rawText !== 'string') {
        return json({ error: 'missing_rawText' }, request, env, 400);
    }

    const changes: string[] = [];
    let cleaned = rawText;

    // 1. Banned phrase replacement (longest first so multi-word phrases hit before single words)
    const banned = (await env.CV_KV.get<any[]>('cv:banned:all', { type: 'json' })) || [];
    for (const { phrase, replacement } of banned) {
        if (!phrase) continue;
        const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'gi');
        if (re.test(cleaned)) {
            const repl = replacement ?? '';
            changes.push(`"${phrase}" → "${repl || '(removed)'}"`);
            cleaned = cleaned.replace(re, repl);
        }
    }

    // 2. Duplicate adjacent words
    const beforeDup = cleaned;
    cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1');
    if (cleaned !== beforeDup) changes.push('removed duplicate adjacent words');

    // 3. Missing-pronoun fix: "'ve" with no preceding "I"
    cleaned = cleaned.replace(/(?<![A-Za-z])'ve\b/g, () => {
        changes.push('fixed orphan \'ve → I\'ve');
        return "I've";
    });

    // 4. Tech term capitalisation
    const techTerms: Record<string, string> = {
        autocad: 'AutoCAD', gis: 'GIS', matlab: 'MATLAB', github: 'GitHub',
        mysql: 'MySQL', postgresql: 'PostgreSQL', javascript: 'JavaScript',
        typescript: 'TypeScript', nodejs: 'Node.js', reactjs: 'React',
    };
    for (const [wrong, right] of Object.entries(techTerms)) {
        const re = new RegExp(`\\b${wrong}\\b`, 'g');
        if (re.test(cleaned)) {
            changes.push(`capitalisation: ${wrong} → ${right}`);
            cleaned = cleaned.replace(re, right);
        }
    }

    // 5. Strip tilde-before-number AI tell (e.g. "~50" → "50", "~30%" → "30%")
    cleaned = cleaned.replace(/~(\d)/g, '$1');

    // 6. Whitespace cleanup
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1');

    return json({ cleaned, changes, change_count: changes.length }, request, env);
}

async function handleValidate(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const bullets: string[] = Array.isArray(body?.bullets) ? body.bullets : [];
    if (bullets.length === 0) {
        return json({ error: 'missing_bullets' }, request, env, 400);
    }

    const issues: any[] = [];

    // 1. Length classification + consecutive same-length
    const lengths = bullets.map(b => {
        const wc = (b || '').trim().split(/\s+/).filter(Boolean).length;
        return wc <= 12 ? 'short' : wc <= 20 ? 'medium' : 'long';
    });
    lengths.forEach((len, i) => {
        if (i > 0 && len === lengths[i - 1]) {
            issues.push({ bullet: i, issue: 'consecutive_same_length', severity: 'medium', length: len });
        }
    });

    // 2. Verb (first word) repetition
    const verbCounts: Record<string, number> = {};
    bullets.forEach((b, i) => {
        const first = (b || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
        if (!first) return;
        verbCounts[first] = (verbCounts[first] || 0) + 1;
        if (verbCounts[first] === 2) {
            issues.push({ bullet: i, issue: 'repeated_verb', verb: first, severity: 'high' });
        }
    });

    // 3. Banned phrases
    const banned = (await env.CV_KV.get<any[]>('cv:banned:all', { type: 'json' })) || [];
    bullets.forEach((bullet, i) => {
        const lower = (bullet || '').toLowerCase();
        for (const { phrase, replacement, severity } of banned) {
            if (!phrase) continue;
            if (lower.includes(String(phrase).toLowerCase())) {
                issues.push({
                    bullet: i, issue: 'banned_phrase', phrase, replacement: replacement || null,
                    severity: severity || 'critical',
                });
            }
        }
    });

    // 4. Duplicate adjacent words
    bullets.forEach((bullet, i) => {
        const m = (bullet || '').match(/\b(\w+)\s+\1\b/gi);
        if (m) issues.push({ bullet: i, issue: 'duplicate_word', match: m[0], severity: 'critical' });
    });

    // 5. Word count > 30
    bullets.forEach((bullet, i) => {
        const wc = (bullet || '').trim().split(/\s+/).filter(Boolean).length;
        if (wc > 30) issues.push({ bullet: i, issue: 'too_long', word_count: wc, severity: 'medium' });
    });

    // 6. "ensuring" virus
    bullets.forEach((bullet, i) => {
        if (/\bensuring\b/i.test(bullet || '')) {
            issues.push({ bullet: i, issue: 'ensuring_virus', severity: 'high' });
        }
    });

    // 7. Round-number metric ratio
    const allMetrics = bullets.join(' ').match(/\d+%/g) || [];
    const roundCount = allMetrics.filter(m => parseInt(m, 10) % 5 === 0).length;
    if (allMetrics.length >= 3 && roundCount / allMetrics.length > 0.6) {
        issues.push({ issue: 'too_many_round_numbers', ratio: roundCount / allMetrics.length, severity: 'medium' });
    }

    const summary = {
        critical: issues.filter(i => i.severity === 'critical').length,
        high:     issues.filter(i => i.severity === 'high').length,
        medium:   issues.filter(i => i.severity === 'medium').length,
    };
    const score = Math.max(0, 10 - (summary.critical * 3 + summary.high * 2 + summary.medium));
    const passed = summary.critical === 0 && summary.high === 0;

    return json({ passed, score, summary, issues }, request, env);
}

// ─────────────────────────────────────────────────────────────────────────────
// Brief-aware voice consistency validator.
// Scores generated bullets against an inline brief: verb pool, avoided verbs,
// forbidden phrases, rhythm sequence drift, voice verbosity & metric preference.
// ─────────────────────────────────────────────────────────────────────────────

async function handleValidateVoice(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const bullets: string[] = Array.isArray(body?.bullets) ? body.bullets : [];
    const brief = body?.brief || null;
    if (bullets.length === 0) return json({ error: 'missing_bullets' }, request, env, 400);
    if (!brief) return json({ error: 'missing_brief' }, request, env, 400);
    return json(computeVoiceValidation(bullets, brief), request, env);
}

function computeVoiceValidation(bullets: string[], brief: any): any {
    const issues: any[] = [];
    const lengths = bullets.map(b => {
        const wc = (b || '').trim().split(/\s+/).filter(Boolean).length;
        return { wc, cls: wc <= 12 ? 'short' : wc <= 20 ? 'medium' : 'long' };
    });
    const firstWords = bullets.map(b => ((b || '').trim().split(/\s+/)[0] || '').toLowerCase());

    // 1. Approved verb pool — penalize verbs outside the pool
    const pool = new Set<string>(
        (brief.verb_pool || []).flatMap((v: any) => [
            String(v.verb || '').toLowerCase(),
            String(v.verb_past || '').toLowerCase(),
            String(v.verb_present || '').toLowerCase(),
        ]).filter(Boolean)
    );
    const avoided = new Set<string>(
        (brief.field?.avoided_verbs || []).map((s: string) => s.toLowerCase())
    );
    firstWords.forEach((w, i) => {
        if (!w) return;
        if (avoided.has(w)) {
            issues.push({ bullet: i, issue: 'avoided_verb_for_field', verb: w, severity: 'critical' });
        } else if (pool.size > 0 && !pool.has(w)) {
            issues.push({ bullet: i, issue: 'verb_outside_pool', verb: w, severity: 'medium' });
        }
    });

    // 2. Forbidden phrases from brief
    (brief.forbidden_phrases || []).forEach((p: string) => {
        const needle = String(p || '').toLowerCase();
        if (!needle) return;
        bullets.forEach((b, i) => {
            if ((b || '').toLowerCase().includes(needle)) {
                issues.push({ bullet: i, issue: 'forbidden_phrase', phrase: p, severity: 'critical' });
            }
        });
    });

    // 3. Rhythm drift — compare actual length classes to brief.rhythm.sequence
    const expected: string[] = brief.rhythm?.sequence || [];
    const cmpLen = Math.min(lengths.length, expected.length);
    let rhythmMatches = 0;
    for (let i = 0; i < cmpLen; i++) {
        const exp = expected[i];
        if (exp === 'personality') { rhythmMatches++; continue; }
        if (exp === lengths[i].cls) rhythmMatches++;
        else issues.push({ bullet: i, issue: 'rhythm_drift', expected: exp, actual: lengths[i].cls, severity: 'medium' });
    }
    const rhythm_match_ratio = cmpLen > 0 ? rhythmMatches / cmpLen : 1;

    // 4. Voice verbosity — average word count vs verbosity_level (1=terse … 5=expansive)
    const avgWc = lengths.reduce((s, x) => s + x.wc, 0) / Math.max(1, lengths.length);
    const verbosity = brief.voice?.primary?.verbosity_level ?? 3;
    const targetWc = 8 + (verbosity - 1) * 4; // 8,12,16,20,24
    if (Math.abs(avgWc - targetWc) > 6) {
        issues.push({ issue: 'voice_verbosity_drift', avg_words: +avgWc.toFixed(1), target: targetWc, severity: 'medium' });
    }

    // 5. Metric preference — share of bullets with a number
    const withMetric = bullets.filter(b => /\d/.test(b || '')).length;
    const metricRatio = withMetric / bullets.length;
    const pref = brief.voice?.primary?.metric_preference || 'medium';
    const targetMin = pref === 'high' ? 0.6 : pref === 'low' ? 0.1 : 0.3;
    const targetMax = pref === 'high' ? 1.0 : pref === 'low' ? 0.4 : 0.7;
    if (metricRatio < targetMin) {
        issues.push({ issue: 'too_few_metrics', ratio: +metricRatio.toFixed(2), preference: pref, severity: 'high' });
    } else if (metricRatio > targetMax) {
        issues.push({ issue: 'too_many_metrics', ratio: +metricRatio.toFixed(2), preference: pref, severity: 'low' });
    }

    // 6. Repeated verbs across bullets
    const verbCounts: Record<string, number> = {};
    firstWords.forEach((w, i) => {
        if (!w) return;
        verbCounts[w] = (verbCounts[w] || 0) + 1;
        if (verbCounts[w] === 2) issues.push({ bullet: i, issue: 'repeated_verb', verb: w, severity: 'high' });
    });

    const summary = {
        critical: issues.filter(i => i.severity === 'critical').length,
        high:     issues.filter(i => i.severity === 'high').length,
        medium:   issues.filter(i => i.severity === 'medium').length,
        low:      issues.filter(i => i.severity === 'low').length,
    };
    const score = Math.max(0, 10 - (summary.critical * 3 + summary.high * 2 + summary.medium));
    const passed = summary.critical === 0 && summary.high === 0;
    const failingBullets = Array.from(new Set(
        issues.filter(i => i.bullet !== undefined && (i.severity === 'critical' || i.severity === 'high')).map(i => i.bullet)
    ));

    return { passed, score, summary, issues, rhythm_match_ratio, avg_word_count: +avgWc.toFixed(1), metric_ratio: +metricRatio.toFixed(2), failing_bullets: failingBullets };
}

// ─────────────────────────────────────────────────────────────────────────────
// Brief builder: detects seniority + field + voice from JD/profile, returns
// full generation context (verb pool, rhythm, banned phrases, forbidden combos).
// ─────────────────────────────────────────────────────────────────────────────

async function handleBrief(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const body = await safeJson(request);
    const brief = await buildBriefData(env, body || {});
    // Phase K: fire-and-forget telemetry — auto-collected, never blocks the brief.
    ctx.waitUntil(recordBriefTelemetry(env, body || {}, brief).catch(() => {/* swallow */}));
    return json(brief, request, env);
}

async function recordBriefTelemetry(env: Env, body: any, brief: any): Promise<void> {
    const jdPresent = String(body?.jd || body?.jobDescription || '').trim().length > 0 ? 1 : 0;
    const seniority = brief?.seniority?.level || null;
    const fieldName = brief?.field?.field || null;
    const voice     = brief?.voice?.primary?.name || null;
    const section   = String(body?.section || 'current_role').toLowerCase();
    // field_source: explicit > jd-driven > fallback
    const explicitField = String(body?.field || '').toLowerCase().trim();
    const topScore = brief?.debug?.field_scores?.[0]?.score ?? 0;
    const fieldSource =
        explicitField && explicitField === fieldName ? 'requested' :
        jdPresent && topScore > 0                    ? 'jd_keywords' :
        fieldName && fieldName !== 'general'         ? 'fallback' :
                                                       'none';
    await env.CV_DB.prepare(
        `INSERT INTO cv_request_telemetry (id, seniority, field, voice, section, jd_present, field_source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), seniority, fieldName, voice, section, jdPresent, fieldSource).run();
}

async function buildBriefData(env: Env, body: any): Promise<any> {
    const jd: string = String(body?.jd || body?.jobDescription || '').trim();
    const profile = body?.profile || {};
    const explicitYears = Number(body?.yearsExperience);
    const explicitField: string = String(body?.field || '').toLowerCase().trim();
    const bulletCount = clamp(parseInt(body?.bulletCount || '5', 10), 3, 10);
    const section: string = String(body?.section || 'current_role').toLowerCase();

    // Years of experience
    const years = Number.isFinite(explicitYears) && explicitYears >= 0
        ? explicitYears
        : estimateYearsFromProfile(profile);

    // Pull KV bundles in parallel
    const [seniorityRows, fieldRows, voiceRows, comboRows, rhythmRows, bannedRows] = await Promise.all([
        env.CV_KV.get<any[]>('cv:seniority:all', { type: 'json' }),
        env.CV_KV.get<any[]>('cv:fields:all',    { type: 'json' }),
        env.CV_KV.get<any[]>('cv:voices:all',    { type: 'json' }),
        env.CV_KV.get<any[]>('cv:combos:all',    { type: 'json' }),
        env.CV_KV.get<any[]>('cv:rhythm:all',    { type: 'json' }),
        env.CV_KV.get<any[]>('cv:banned:all',    { type: 'json' }),
    ]);

    // 1. Seniority by years (with override from JD title cues)
    const titleHay = `${jd} ${profile?.headline || profile?.title || ''}`.toLowerCase();
    let seniorityLevel = pickSeniorityByYears(years, seniorityRows || []);
    if (/\b(intern|attachment|trainee)\b/.test(titleHay)) seniorityLevel = 'entry';
    else if (/\b(lead|principal|head|director|chief|vp|cto|ceo)\b/.test(titleHay)) seniorityLevel = 'lead';
    else if (/\bsenior\b|\bsr\.?\b/.test(titleHay) && years >= 5) seniorityLevel = 'senior';
    const seniority = (seniorityRows || []).find(s => s.level === seniorityLevel) || null;

    // 2. Field detection: score JD against each field's jd_keywords.
    // IMPORTANT: JD signals get 3× weight vs profile signals.
    // This prevents profile tech-skills (Python, Java, Git) from overriding a
    // clear JD field signal — e.g. a "Graduate Structural Engineer" JD should
    // classify as civil_engineering/construction, not data_analytics, even when
    // the candidate lists Python in their skills section.
    const jdHay     = jd.toLowerCase();
    const profileHay = stringify(profile).toLowerCase();
    const jdPresent  = jd.length > 50;

    const fieldScores: Array<{ field: string; score: number; row: any }> = (fieldRows || []).map(f => {
        if (explicitField && f.field === explicitField) return { field: f.field, score: 9999, row: f };
        const kws: string[] = Array.isArray(f.jd_keywords) ? f.jd_keywords : [];
        let score = 0;
        for (const kw of kws) {
            const re = new RegExp(`\\b${escapeRegex(String(kw).toLowerCase())}\\b`, 'g');
            const jdHits      = (jdHay.match(re) || []).length;
            const profileHits = (profileHay.match(re) || []).length;
            // JD hits weighted 3× when a JD is present; profile used as tiebreaker.
            score += jdPresent ? (jdHits * 3 + profileHits) : (jdHits + profileHits);
        }
        return { field: f.field, score, row: f };
    }).sort((a, b) => b.score - a.score);
    const fieldRow = fieldScores[0]?.row || null;
    const fieldName: string = fieldRow?.field || 'general';

    // 3. Voice scoring: compatibility with field + seniority
    const voiceScored = (voiceRows || []).map(v => {
        let score = 0;
        if (Array.isArray(v.compatible_fields) && v.compatible_fields.includes(fieldName)) score += 3;
        if (Array.isArray(v.compatible_seniority) && v.compatible_seniority.includes(seniorityLevel)) score += 3;
        // Bonus: voice verb_bias overlaps with field preferred_verbs
        if (fieldRow && Array.isArray(fieldRow.preferred_verbs) && Array.isArray(v.verb_bias)) {
            const overlap = v.verb_bias.filter((vb: string) =>
                fieldRow.preferred_verbs.some((pv: string) => pv.toLowerCase() === String(vb).toLowerCase())
            ).length;
            score += overlap;
        }
        return { voice: v, score };
    }).sort((a, b) => b.score - a.score);

    // Optional override: caller can force a specific voice by name (used by Voice Tester)
    const voiceNameOverride = String(body?.voice_name || '').toLowerCase().trim();
    let primary = voiceScored[0]?.voice || null;
    if (voiceNameOverride) {
        const forced = (voiceRows || []).find((v: any) => String(v.name || '').toLowerCase() === voiceNameOverride);
        if (forced) primary = forced;
    }
    const secondary = primary
        ? voiceScored.slice(1).find(({ voice }) =>
            voice.name !== primary.name &&
            !(Array.isArray(primary.incompatible_with) && primary.incompatible_with.includes(voice.name))
        )?.voice || null
        : null;

    // 4. Rhythm pattern by section
    const sectionRhythms = (rhythmRows || []).filter(r => r.section === section);
    const rhythm = sectionRhythms.sort((a, b) => (b.human_score || 0) - (a.human_score || 0))[0]
        || (rhythmRows || []).find(r => r.section === 'current_role')
        || (rhythmRows || [])[0]
        || null;

    // 5. Verb pool: pick category from field language_style, build pool of ~30
    const category = mapFieldToVerbCategory(fieldRow?.language_style || '');
    const tense = section === 'current_role' ? 'present' : 'past';
    let verbPool = await env.CV_KV.get<any[]>(`cv:verbs:${category}:${tense}`, { type: 'json' }) || [];
    // Apply field's preferred/avoided verbs filter
    if (fieldRow) {
        const avoided = new Set((fieldRow.avoided_verbs || []).map((v: string) => v.toLowerCase()));
        verbPool = verbPool.filter(v => !avoided.has(String(v.verb_present || '').toLowerCase()));
    }
    // Apply primary voice verb bias as a soft preference (sort to front)
    if (primary && Array.isArray(primary.verb_bias)) {
        const bias = new Set(primary.verb_bias.map((v: string) => v.toLowerCase()));
        verbPool.sort((a, b) => Number(bias.has(String(b.verb_present).toLowerCase())) - Number(bias.has(String(a.verb_present).toLowerCase())));
    }
    shuffle(verbPool);
    const verbs = verbPool.slice(0, 30).map(v => ({
        verb: tense === 'past' ? v.verb_past : v.verb_present,
        verb_present: v.verb_present,
        verb_past: v.verb_past,
        energy_level: v.energy_level,
    }));

    // 6. Forbidden combo for this seniority + field
    const combo = (comboRows || []).find(c => c.seniority === seniorityLevel && c.field === fieldName) || null;
    const forbiddenPhrases = [
        ...(seniority?.forbidden_phrases || []),
        ...(combo?.forbidden_phrases || []),
    ];

    return {
        years,
        seniority: seniority ? {
            level: seniority.level,
            bullet_style: seniority.bullet_style,
            metric_density: seniority.metric_density,
            summary_tone: seniority.summary_tone,
        } : null,
        field: fieldRow ? {
            field: fieldRow.field,
            language_style: fieldRow.language_style,
            preferred_verbs: fieldRow.preferred_verbs || [],
            avoided_verbs: fieldRow.avoided_verbs || [],
            metric_types: fieldRow.metric_types || [],
        } : null,
        voice: {
            primary: primary ? { name: primary.name, tone: primary.tone, verbosity_level: primary.verbosity_level, opener_frequency: primary.opener_frequency, metric_preference: primary.metric_preference } : null,
            secondary: secondary ? { name: secondary.name, tone: secondary.tone } : null,
        },
        rhythm: rhythm ? {
            pattern_name: rhythm.pattern_name,
            sequence: rhythm.sequence,
            section: rhythm.section,
            bullet_count: bulletCount,
        } : null,
        verb_pool: verbs,
        forbidden_phrases: forbiddenPhrases,
        banned_count: (bannedRows || []).length,
        debug: {
            field_scores: fieldScores.slice(0, 5).map(f => ({ field: f.field, score: f.score })),
            voice_scores: voiceScored.slice(0, 3).map(v => ({ name: v.voice.name, score: v.score })),
            voice_override: voiceNameOverride || null,
        },
    };
}

// ─── brief helpers ──────────────────────────────────────────────────────────

function estimateYearsFromProfile(profile: any): number {
    if (!profile || typeof profile !== 'object') return 0;
    const exp = Array.isArray(profile.experience) ? profile.experience : [];
    let totalMonths = 0;
    const now = new Date();
    for (const e of exp) {
        const start = parseDateLoose(e?.startDate || e?.start_date || e?.start);
        const end   = parseDateLoose(e?.endDate || e?.end_date || e?.end) || now;
        if (start) totalMonths += Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
    }
    return Math.round(totalMonths / 12);
}

function parseDateLoose(s: any): Date | null {
    if (!s) return null;
    if (s instanceof Date) return s;
    const str = String(s).trim();
    if (/^present|current$/i.test(str)) return new Date();
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function pickSeniorityByYears(years: number, rows: any[]): string {
    for (const r of rows) {
        const lo = Number(r.years_min ?? 0);
        const hi = Number(r.years_max ?? 99);
        if (years >= lo && years <= hi) return r.level;
    }
    return years < 1 ? 'entry' : years < 3 ? 'junior' : years < 6 ? 'mid' : years < 10 ? 'senior' : 'lead';
}

function mapFieldToVerbCategory(languageStyle: string): 'technical' | 'management' | 'analysis' | 'communication' | 'financial' | 'creative' {
    const s = (languageStyle || '').toLowerCase();
    if (s.includes('technical')) return 'technical';
    if (s.includes('analytical')) return 'analysis';
    if (s.includes('commercial') || s.includes('financial')) return 'financial';
    if (s.includes('humanistic') || s.includes('policy')) return 'communication';
    if (s.includes('creative')) return 'creative';
    return 'management';
}

function stringify(obj: any): string {
    try { return JSON.stringify(obj); } catch { return ''; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: stats + bulk-add. Both require X-Admin-Token.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_TABLES = new Set([
    'cv_verbs',
    'cv_banned_phrases',
    'cv_openers',
    'cv_context_connectors',
    'cv_result_connectors',
    'cv_sentence_structures',
    'cv_rhythm_patterns',
    'cv_paragraph_structures',
    'cv_subjects',
    'cv_seniority_levels',
    'cv_field_profiles',
    'cv_seniority_field_combos',
    'cv_voice_profiles',
]);

async function handleAdminStats(request: Request, env: Env): Promise<Response> {
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

async function handleBulkAdd(request: Request, env: Env): Promise<Response> {
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

    // Auto-rebuild KV cache so the new rows are visible immediately.
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

// Whitelist of columns admins can search/update per table — keeps SQL safe.
const ADMIN_SEARCHABLE: Record<string, string[]> = {
    cv_verbs: ['verb_present', 'verb_past', 'category', 'industry'],
    cv_banned_phrases: ['phrase', 'replacement', 'severity', 'reason', 'source'],
    cv_openers: ['opener', 'type', 'length_type'],
    cv_context_connectors: ['connector', 'type'],
    cv_result_connectors: ['connector', 'type'],
    cv_sentence_structures: ['pattern_label', 'pattern', 'use_frequency', 'section'],
    cv_rhythm_patterns: ['pattern_name', 'section', 'description'],
    cv_paragraph_structures: ['section', 'pattern'],
    cv_subjects: ['subject', 'usage'],
    cv_seniority_levels: ['level', 'bullet_style', 'metric_density', 'summary_tone'],
    cv_field_profiles: ['field', 'language_style'],
    cv_seniority_field_combos: ['seniority', 'field', 'required_tone', 'notes'],
    cv_voice_profiles: ['name', 'tone', 'description', 'risk_tolerance', 'formality'],
};

async function handleAdminList(request: Request, env: Env, url: URL): Promise<Response> {
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

async function handleBulkUpdate(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');
    const token = request.headers.get('X-Admin-Token') || '';
    const body = await safeJson(request);
    const table: string = String(body?.table || '');
    const updates: any[] = Array.isArray(body?.updates) ? body.updates : [];
    if (!ADMIN_TABLES.has(table)) {
        return json({ error: 'invalid_table' }, request, env, 400);
    }
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

async function handleAdminDelete(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');
    const token = request.headers.get('X-Admin-Token') || '';
    const body = await safeJson(request);
    const table: string = String(body?.table || '');
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : [];
    if (!ADMIN_TABLES.has(table)) {
        return json({ error: 'invalid_table' }, request, env, 400);
    }
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

async function handleVoiceTest(request: Request, env: Env): Promise<Response> {
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

// ─────────────────────────────────────────────────────────────────────────────
// AI Auditor — uses Workers AI (Llama 3.1) as a SECOND PASS on top of the
// deterministic rule set. Returns net-new AI-ism candidates the admin can
// promote into cv_banned_phrases with one click. Never replaces the
// deterministic rules — they remain the fast/free/predictable first pass.
// ─────────────────────────────────────────────────────────────────────────────

async function handleAiAudit(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');
    if (!env.AI) return json({ error: 'ai_binding_missing' }, request, env, 500);

    const body = await safeJson(request);
    let text: string = String(body?.text || '').trim();
    if (!text && Array.isArray(body?.bullets)) text = body.bullets.join('\n');
    if (!text) return json({ error: 'missing_text' }, request, env, 400);
    if (text.length > 8000) text = text.slice(0, 8000);

    // Already-banned set — so AI can't re-suggest things we already catch
    const banned = (await env.CV_KV.get<any[]>('cv:banned:all', { type: 'json' })) || [];
    const bannedSet = new Set(banned.map((b: any) => String(b.phrase || '').toLowerCase()).filter(Boolean));

    // ─── Style anchors from the seeded D1/KV pools ───────────────────────────
    // We feed the auditor a small, curated slice of our actual house style so
    // its `replacement` suggestions match the seeded vocabulary instead of
    // drifting into yet another set of generic LLM-isms. All slices are tiny
    // (KV reads are cheap; the prompt budget is the real constraint).
    const [techVerbsKv, mgmtVerbsKv, analysisVerbsKv, resultsKv] = await Promise.all([
        env.CV_KV.get<any[]>('cv:verbs:technical:past', { type: 'json' }),
        env.CV_KV.get<any[]>('cv:verbs:management:past', { type: 'json' }),
        env.CV_KV.get<any[]>('cv:verbs:analysis:past', { type: 'json' }),
        env.CV_KV.get<any[]>('cv:results:emdash', { type: 'json' }),
    ]);
    const pickVerbs = (arr: any[] | null, n: number) =>
        (arr || []).filter((r: any) => (r.human_score ?? 0) >= 8)
            .slice(0, n).map((r: any) => r.verb_past).filter(Boolean);
    const sampleVerbs = [
        ...pickVerbs(techVerbsKv, 12),
        ...pickVerbs(mgmtVerbsKv, 8),
        ...pickVerbs(analysisVerbsKv, 8),
    ];
    const sampleEmdash = (resultsKv || []).slice(0, 5)
        .map((r: any) => r.example).filter(Boolean);
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

// ─────────────────────────────────────────────────────────────────────────────
// Semantic JD ↔ Skills matching (Workers AI embeddings)
//
// Stateless — embeddings are computed per request and discarded.
// No profile data is persisted anywhere on the server.
// Honors the app's privacy-first design.
//
// Body: { keywords: string[], profileTexts: string[] }
// Returns: { results: [{ keyword, score, bestMatch, status }], model, counts }
// ─────────────────────────────────────────────────────────────────────────────

const SEMANTIC_MATCH_MODEL = '@cf/baai/bge-large-en-v1.5';
const SEMANTIC_THRESHOLD_MATCHED = 0.78;
const SEMANTIC_THRESHOLD_PARTIAL = 0.62;
const SEMANTIC_MAX_KEYWORDS = 60;
const SEMANTIC_MAX_PROFILE_TEXTS = 250;
const SEMANTIC_KEYWORD_MAX_CHARS = 200;
const SEMANTIC_PROFILE_MAX_CHARS = 600;
const SEMANTIC_EMBED_BATCH = 95;

async function handleSemanticMatch(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const rawKeywords = Array.isArray(body?.keywords) ? body.keywords : [];
    const rawProfileTexts = Array.isArray(body?.profileTexts) ? body.profileTexts : [];

    const keywords = sanitizeStringArray(rawKeywords, SEMANTIC_KEYWORD_MAX_CHARS, SEMANTIC_MAX_KEYWORDS);
    const profileTexts = sanitizeStringArray(rawProfileTexts, SEMANTIC_PROFILE_MAX_CHARS, SEMANTIC_MAX_PROFILE_TEXTS);

    if (keywords.length === 0 || profileTexts.length === 0) {
        return json({ results: [], reason: 'empty_input' }, request, env);
    }

    try {
        const [kwEmb, ptEmb] = await Promise.all([
            embedBatch(env, keywords),
            embedBatch(env, profileTexts),
        ]);

        if (kwEmb.length !== keywords.length || ptEmb.length !== profileTexts.length) {
            return json({ error: 'embed_size_mismatch' }, request, env, 500);
        }

        const results = keywords.map((kw, i) => {
            const kvec = kwEmb[i];
            let bestScore = -1;
            let bestIdx = -1;
            for (let j = 0; j < profileTexts.length; j++) {
                const score = dotSim(kvec, ptEmb[j]);
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = j;
                }
            }
            const status: 'matched' | 'partial' | 'missing' =
                bestScore >= SEMANTIC_THRESHOLD_MATCHED ? 'matched' :
                bestScore >= SEMANTIC_THRESHOLD_PARTIAL ? 'partial' : 'missing';
            return {
                keyword: kw,
                score: Math.round(bestScore * 1000) / 1000,
                bestMatch: bestIdx >= 0 ? profileTexts[bestIdx] : null,
                status,
            };
        });

        return json({
            results,
            model: SEMANTIC_MATCH_MODEL,
            thresholds: { matched: SEMANTIC_THRESHOLD_MATCHED, partial: SEMANTIC_THRESHOLD_PARTIAL },
            counts: { keywords: keywords.length, profileTexts: profileTexts.length },
        }, request, env);
    } catch (e: any) {
        return json({ error: 'embed_failed', message: String(e?.message || e) }, request, env, 500);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM proxy — Workers AI Llama for the CV validator + humanizer audit passes.
// Stateless: prompt in, text out. No persistence. No PII stored.
// ─────────────────────────────────────────────────────────────────────────────

const WORKER_LLM_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const WORKER_LLM_MAX_PROMPT_CHARS = 60000;
const WORKER_LLM_MAX_SYSTEM_CHARS = 4000;
const WORKER_LLM_DEFAULT_MAX_TOKENS = 4096;
const WORKER_LLM_HARD_MAX_TOKENS = 12000;

async function handleLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const system = typeof body?.system === 'string' ? body.system.slice(0, WORKER_LLM_MAX_SYSTEM_CHARS) : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, WORKER_LLM_MAX_PROMPT_CHARS) : '';
    if (!prompt) return json({ error: 'missing_prompt' }, request, env, 400);

    const wantsJson = body?.json === true;
    const temperature = clamp(Number(body?.temperature ?? 0.2), 0, 1);
    const maxTokens = clamp(
        Number(body?.maxTokens ?? WORKER_LLM_DEFAULT_MAX_TOKENS),
        64,
        WORKER_LLM_HARD_MAX_TOKENS,
    );

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    try {
        const payload: Record<string, unknown> = {
            messages,
            temperature,
            max_tokens: maxTokens,
        };
        if (wantsJson) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(WORKER_LLM_MODEL as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (!text) {
            return json({ error: 'llm_empty', model: WORKER_LLM_MODEL }, request, env, 502);
        }

        return json({ text, model: WORKER_LLM_MODEL }, request, env);
    } catch (e: any) {
        return json({ error: 'llm_failed', message: String(e?.message || e) }, request, env, 502);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vision extract — Workers AI Llama 3.2 11B Vision for image CV uploads.
// Stateless. Image bytes in, structured/raw text out. PDFs are NOT supported
// by the underlying model — caller falls back to Gemini for PDFs.
// ─────────────────────────────────────────────────────────────────────────────

const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const VISION_MAX_IMAGE_BYTES = 5 * 1024 * 1024;        // 5 MB after base64 decode
const VISION_MAX_PROMPT_CHARS = 4000;
const VISION_DEFAULT_MAX_TOKENS = 4096;
const VISION_HARD_MAX_TOKENS = 8192;

async function handleVisionExtract(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const base64 = typeof body?.image === 'string' ? body.image : '';
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, VISION_MAX_PROMPT_CHARS) : '';

    if (!base64 || !prompt) {
        return json({ error: 'missing_image_or_prompt' }, request, env, 400);
    }
    if (mimeType && !/^image\//i.test(mimeType)) {
        return json({ error: 'unsupported_mime', mimeType, hint: 'Llama Vision accepts images only. PDFs must be rasterized first or routed to Gemini.' }, request, env, 415);
    }

    let bytes: Uint8Array;
    try {
        const clean = base64.replace(/^data:[^;]+;base64,/, '');
        const bin = atob(clean);
        if (bin.length > VISION_MAX_IMAGE_BYTES) {
            return json({ error: 'image_too_large', maxBytes: VISION_MAX_IMAGE_BYTES }, request, env, 413);
        }
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
        return json({ error: 'invalid_base64' }, request, env, 400);
    }

    const maxTokens = clamp(Number(body?.maxTokens ?? VISION_DEFAULT_MAX_TOKENS), 64, VISION_HARD_MAX_TOKENS);

    try {
        const res: any = await env.AI.run(VISION_MODEL as any, {
            prompt,
            image: Array.from(bytes),
            max_tokens: maxTokens,
        } as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.description === 'string') text = res.description;
        else if (typeof res?.result?.response === 'string') text = res.result.response;

        if (!text) {
            return json({ error: 'vision_empty', model: VISION_MODEL }, request, env, 502);
        }
        return json({ text, model: VISION_MODEL }, request, env);
    } catch (e: any) {
        return json({ error: 'vision_failed', message: String(e?.message || e) }, request, env, 502);
    }
}

function sanitizeStringArray(arr: unknown[], maxLen: number, max: number): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of arr) {
        if (typeof v !== 'string') continue;
        const t = v.replace(/\s+/g, ' ').trim().slice(0, maxLen);
        if (t.length < 2) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
        if (out.length >= max) break;
    }
    return out;
}

async function embedBatch(env: Env, texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += SEMANTIC_EMBED_BATCH) {
        const slice = texts.slice(i, i + SEMANTIC_EMBED_BATCH);
        const res: any = await env.AI.run(SEMANTIC_MATCH_MODEL as any, { text: slice });
        const data: number[][] = res?.data || [];
        for (const v of data) out.push(v);
    }
    return out;
}

function dotSim(a: number[], b: number[]): number {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
}

async function handleSync(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');

    const written: Array<[string, number]> = [];

    // Banned
    {
        const r = await env.CV_DB.prepare(
            `SELECT phrase, replacement, severity FROM cv_banned_phrases ORDER BY LENGTH(phrase) DESC`
        ).all();
        const rows = (r.results as any[]) || [];
        await env.CV_KV.put('cv:banned:all', JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push(['cv:banned:all', rows.length]);
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
            const key = `cv:verbs:${cat}:${tense}`;
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
        const key = `cv:structures:${label}`;
        await env.CV_KV.put(key, JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push([key, rows.length]);
    }

    // Rhythm
    {
        const r = await env.CV_DB.prepare(
            `SELECT pattern_name, sequence, section, bullet_count, description, human_score FROM cv_rhythm_patterns`
        ).all();
        const rows = ((r.results as any[]) || []).map(row => ({ ...row, sequence: safeParse(row.sequence) }));
        await env.CV_KV.put('cv:rhythm:all', JSON.stringify(rows), { expirationTtl: 86400 * 7 });
        written.push(['cv:rhythm:all', rows.length]);
    }

    await env.CV_KV.put('cv:meta:last_sync', String(Date.now()));
    return json({ ok: true, written, total_keys: written.length, synced_at: Date.now() }, request, env);
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function isAllowedOrigin(origin: string, env: Env): boolean {
    if (!origin) return false;
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.includes(origin)) return true;
    try {
        const u = new URL(origin);
        const host = u.hostname.toLowerCase();
        // Replit preview/deploy domains rotate per session — auto-allow them.
        if (host.endsWith('.replit.dev') || host.endsWith('.replit.app') || host.endsWith('.repl.co')) return true;
        // Localhost for local dev (any port).
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    } catch { /* not a URL — fall through */ }
    return false;
}

function corsHeaders(request: Request, env: Env): HeadersInit {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allow = isAllowedOrigin(origin, env) ? origin : (allowed[0] || '*');
    return {
        'Access-Control-Allow-Origin': allow,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
}

function json(body: unknown, request: Request, env: Env, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
    });
}

async function safeJson(request: Request): Promise<any> {
    try { return await request.json(); } catch { return {}; }
}

function safeParse(v: unknown): unknown {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clamp(n: number, lo: number, hi: number): number {
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiered LLM routing — smart model selection based on task complexity.
//
// POST /api/cv/tiered-llm
// Body: {
//   task: string,        — one of the TASK keys below
//   prompt: string,      — user message
//   system?: string,     — optional system prompt
//   json?: boolean,      — request JSON response_format
//   temperature?: number,
//   maxTokens?: number,
// }
// Returns: { text, model, task, tier }
//
// Task → Model mapping follows the document's tiered cost strategy:
//   Tier 1 (heavy)   — complex reasoning, used sparingly
//   Tier 2 (medium)  — primary workhorses for most generation tasks
//   Tier 3 (fast)    — cheap validation passes, burned freely
//   Embedding        — near-zero cost semantic similarity
// ─────────────────────────────────────────────────────────────────────────────

// ── Model cost reality (verified May 2026 via CF Models API + pricing page) ────
//
// FREE models (no Neuron cost within the 10k/day allowance):
//   @cf/zai-org/glm-4.7-flash              — 131K context, fast, multilingual, FREE
//   @cf/meta/llama-3.2-3b-instruct         — 2457/18252 neurons/M tokens, cheapest text gen
//   @cf/ibm-granite/granite-4.0-h-micro    — 1542/10158 neurons/M tokens, lightest capable model
//   @hf/nousresearch/hermes-2-pro-mistral-7b — confirmed free, strong instruction following
//   @cf/meta/llama-3.1-8b-instruct         — legacy free model, reliable JSON
//   @cf/qwen/qwen1.5-14b-chat-awq          — confirmed free 14B
//   @cf/mistralai/mistral-small-3.1-24b-instruct — FREE (confirmed via pricing page absence)
//
// PAID models (burn Neurons from 10k/day budget — use ONLY for truly heavy tasks):
//   @cf/meta/llama-4-scout-17b-16e-instruct — $0.27/$0.85 per M (24545/77273 neurons/M)
//   @cf/meta/llama-3.3-70b-instruct-fp8-fast — $0.29/$2.25 per M (26668/204805 neurons/M)
//   @cf/deepseek-ai/deepseek-r1-distill-qwen-32b — $0.50/$4.88 per M (45170/443756 neurons/M)
//   @cf/qwen/qwq-32b                        — $0.66/$1.00 per M (60000/90909 neurons/M)
//
// Strategy: every CV pipeline task uses a FREE model. Neurons are only spent on
// Tier 1 heavy reasoning (JD deep analysis, gap analysis) where quality is
// non-negotiable. All generation, audit, validation, and polish tasks now route
// to free models running in PARALLEL — no single bottleneck, no Neuron waste.
// ──────────────────────────────────────────────────────────────────────────────

const TIERED_MODEL_MAP: Record<string, { model: string; tier: number; free: boolean; description: string }> = {
    // ── Tier 1: Heavy reasoning — PAID, use only when quality is truly critical ─
    // DeepSeek-R1 for deep JD analysis / gap scoring. These tasks run once per
    // generation (not per section) and produce the intelligence brief.
    jdDeepAnalysis:       { model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', tier: 1, free: false, description: 'Deep JD intelligence + gap analysis — DeepSeek-R1 32B ($0.50/$4.88 per M)' },
    gapAnalysis:          { model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', tier: 1, free: false, description: 'Candidate ↔ JD gap analysis — DeepSeek-R1 32B ($0.50/$4.88 per M)' },
    corpusConfidence:     { model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', tier: 1, free: false, description: 'Corpus candidate confidence scoring — DeepSeek-R1 32B ($0.50/$4.88 per M)' },
    // JD keyword scoring + voice match still benefit from 70B quality
    voiceScoring:         { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',     tier: 1, free: false, description: 'Voice scoring vs JD + field + seniority — Llama 70B ($0.29/$2.25 per M)' },
    jdKeywords:           { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',     tier: 1, free: false, description: 'JD keyword extraction, tier 1/2/3 classification — Llama 70B ($0.29/$2.25 per M)' },

    // ── Tier 2: Main generation — all FREE, run in parallel ──────────────────
    // Mistral Small 3.1 24B is the new workhorse for all generation tasks.
    // GLM 4.7 Flash was previously used here but is currently broken on
    // Cloudflare's infrastructure (returns empty text / HTTP 502 on most
    // prompts). Mistral Small 3.1 is confirmed warm, FREE, and handles
    // structured JSON generation reliably.
    cvGenerate:           { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Main CV JSON generation — Mistral Small 3.1 24B (FREE)' },
    cvGenerateLong:       { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Long-context CV generation — Mistral Small 3.1 24B (FREE)' },
    cvExperience:         { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'CV experience bullets — Mistral Small 3.1 24B (FREE, strong JSON following)' },
    cvProjects:           { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'CV projects section — Mistral Small 3.1 24B (FREE)' },
    // Humanizer audit: Mistral Small 3.1 excels at JSON rewriting tasks (FREE)
    cvAudit:              { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Post-generation humanizer audit — Mistral Small 3.1 24B (FREE)' },
    // Validator: Llama 3.1 8B is fast and reliable for structured checking (FREE)
    cvValidate:           { model: '@cf/meta/llama-3.1-8b-instruct',               tier: 2, free: true,  description: 'Strict CV quality validator — Llama 3.1 8B (FREE)' },
    // Word/GitHub parser: Mistral Small handles doc-to-JSON reliably (FREE)
    parser:               { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Word/GitHub profile JSON parser — Mistral Small 3.1 24B (FREE)' },

    // ── Tier 2 section-parallel — right-sized FREE model per CV section ───────
    // Each section runs on its own model simultaneously server-side.
    // Simple structured sections get the lightest (cheapest Neuron) model;
    // bullet-heavy sections get GLM 4.7 Flash with its large context window.
    cvSummary:            { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'CV professional summary — Mistral Small 3.1 24B (FREE, best for prose)' },
    cvSkills:             { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 2, free: true,  description: 'CV skills list — IBM Granite 4.0 Micro (FREE, lightest capable model)' },
    cvEducation:          { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 2, free: true,  description: 'CV education section — IBM Granite 4.0 Micro (FREE, lightest capable model)' },
    // Fallback when primary model fails — Mistral Small 3.1 is the fallback so
    // that when GLM 4.7 Flash (used by cvExperience, cvProjects, cvGenerate) is
    // cold and returns empty, the retry lands on a DIFFERENT warm model instead
    // of hammering the same cold GLM again. Mistral Small completed cvSummary
    // in ~3s in the same session where GLM took 65s — ideal fallback choice.
    cvFallback:           { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Section-parallel fallback — Mistral Small 3.1 24B (FREE, different model to GLM)' },

    // ── Tier 2 free alternatives (rhythm, seniority, multilingual) ───────────
    rhythmSelection:      { model: '@hf/nousresearch/hermes-2-pro-mistral-7b',     tier: 2, free: true,  description: 'Rhythm pattern selection per role type (FREE)' },
    seniorityDetect:      { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 2, free: true,  description: 'Seniority + field detection from JD — Llama 3.2 3B (FREE, fast)' },
    multilingualGenerate: { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 2, free: true,  description: 'Multilingual CV text generation — Mistral Small 3.1 24B (FREE, multilingual)' },

    // ── Tier 3: Fast validation — ultra-light FREE models, burn without worry ──
    // Each check runs independently and in parallel with the main generation.
    bannedCheck:          { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Banned phrase check — Llama 3.2 3B (FREE, fast)' },
    tenseCheck:           { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Tense consistency enforcement — Llama 3.2 3B (FREE, fast)' },
    voiceConsistency:     { model: '@hf/nousresearch/hermes-2-pro-mistral-7b',     tier: 3, free: true,  description: 'Voice consistency per bullet — Hermes-2 Pro 7B (FREE, strong instruction following)' },
    verbRepeatCheck:      { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 3, free: true,  description: 'Verb repetition check — Granite 4.0 Micro (FREE, lightest)' },
    rhythmCheck:          { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 3, free: true,  description: 'Rhythm compliance check — Granite 4.0 Micro (FREE, lightest)' },
    candidateDedup:       { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Dedup check for corpus candidates — Llama 3.2 3B (FREE)' },
    corpusCrawl:          { model: '@hf/nousresearch/hermes-2-pro-mistral-7b',     tier: 3, free: true,  description: 'Source page crawling + extraction — Hermes-2 Pro (FREE)' },

    // ── JD parsing — lightest possible model (structured extraction) ──────────
    jdParse:              { model: '@cf/ibm-granite/granite-4.0-h-micro',          tier: 3, free: true,  description: 'JD keyword + company + title extraction — Granite 4.0 Micro (FREE, cheapest)' },

    // ── Cover letter + humanize — prose tasks, Hermes-2 Pro is proven (FREE) ──
    humanize:             { model: '@hf/nousresearch/hermes-2-pro-mistral-7b',     tier: 3, free: true,  description: 'Plain-text humanizer — Hermes-2 Pro 7B (FREE)' },
    coverLetter:          { model: '@cf/mistralai/mistral-small-3.1-24b-instruct', tier: 3, free: true,  description: 'Cover letter generation — Mistral Small 3.1 24B (FREE, best prose)' },

    // ── Default fallback — always free ────────────────────────────────────────
    general:              { model: '@cf/meta/llama-3.1-8b-instruct',               tier: 3, free: true,  description: 'General purpose fallback — Llama 3.1 8B (FREE)' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Paid-account upgrade map — when the frontend detects a Cloudflare paid
// account (via /api/cv/account-tier) it passes paidUpgrade:true. Generation
// tasks listed here are then silently promoted to Llama 3.3 70B FP8, which
// produces measurably better bullet rhythm and seniority calibration.
// Only generation tasks are upgraded; audit/validate/humanize remain free to
// avoid unnecessary Neuron spend on tasks that don't benefit from 70B quality.
// ─────────────────────────────────────────────────────────────────────────────
const PAID_UPGRADE_MAP: Record<string, string> = {
    cvGenerate:     '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvGenerateLong: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvExperience:   '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvProjects:     '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    cvSummary:      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
};

// ─────────────────────────────────────────────────────────────────────────────
// Account Tier Probe — GET /api/cv/account-tier
//
// Sends a 1-token probe to Llama 3.3 70B (a paid model). If the model
// responds, the account has paid Workers AI access; if it fails with a
// neuron-quota or access error, the account is on the free tier.
//
// Response: { tier: 'paid' | 'free', model: string, note?: string }
// ─────────────────────────────────────────────────────────────────────────────
async function handleAccountTier(request: Request, env: Env): Promise<Response> {
    const PAID_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    try {
        const res: any = await env.AI.run(PAID_MODEL as any, {
            messages: [
                { role: 'system', content: 'Reply with the single word: ok' },
                { role: 'user',   content: 'ping' },
            ],
            temperature: 0,
            max_tokens: 4,
        });
        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (text.trim()) {
            return json({ tier: 'paid', model: PAID_MODEL }, request, env);
        }
        return json({ tier: 'free', model: PAID_MODEL, note: 'paid model returned empty — likely free tier' }, request, env);
    } catch (e: any) {
        const msg = String(e?.message || e || '');
        const isQuota = msg.includes('4006') || msg.toLowerCase().includes('neuron') || msg.toLowerCase().includes('quota');
        return json({ tier: 'free', model: PAID_MODEL, note: isQuota ? 'neuron quota exhausted' : msg.slice(0, 120) }, request, env);
    }
}

// Bumped to 100k chars (Apr 2026) so the frontend's pre-sized cv-generate
// path — which routes prompts > 90k chars away from Groq into the worker —
// fits through tiered-llm + race-llm without truncation. Long-context models
// (GLM 4.7 Flash 131K, Llama 4 Scout) handle this comfortably.
const TIERED_LLM_MAX_PROMPT_CHARS  = 100000;
const TIERED_LLM_MAX_SYSTEM_CHARS  = 6000;
const TIERED_LLM_DEFAULT_MAX_TOKENS = 2048;
const TIERED_LLM_HARD_MAX_TOKENS   = 8192;

async function handleTieredLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);

    const taskKey     = typeof body?.task === 'string' ? body.task.trim() : 'general';
    const paidUpgrade = body?.paidUpgrade === true;
    // System prompt is sourced exclusively from internal worker constants keyed by task.
    // The client-sent `system` field is intentionally ignored so pipeline rules
    // never need to travel over the network — they stay inside the compiled worker.
    const _internalSystemMap: Record<string, string> = {
        cvGenerate:       _CV_SYSTEM_PROFESSIONAL,
        cvGenerateLong:   _CV_SYSTEM_PROFESSIONAL,
        cvExperience:     _CV_SYSTEM_PROFESSIONAL,
        cvProjects:       _CV_SYSTEM_PROFESSIONAL,
        cvAudit:          _CV_SYSTEM_AUDIT,
        cvValidate:       _CV_SYSTEM_VALIDATOR,
        humanize:         _CV_SYSTEM_HUMANIZER,
        coverLetter:      _CV_SYSTEM_PROFESSIONAL,
        voiceConsistency: _CV_SYSTEM_HUMANIZER,
        jdParse:          _CV_SYSTEM_PARSER,
        parser:           _CV_SYSTEM_PARSER,
    };
    const system = _internalSystemMap[taskKey] ?? '';
    const prompt      = typeof body?.prompt === 'string' ? body.prompt.slice(0, TIERED_LLM_MAX_PROMPT_CHARS) : '';

    if (!prompt) return json({ error: 'missing_prompt' }, request, env, 400);

    const baseMapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
    const upgradedModel = paidUpgrade ? PAID_UPGRADE_MAP[taskKey] : undefined;
    const model       = upgradedModel ?? baseMapping.model;
    const { tier, free: baseFree, description } = baseMapping;
    const free        = upgradedModel ? false : baseFree;

    const wantsJson  = body?.json === true;
    const temperature = clamp(Number(body?.temperature ?? 0.3), 0, 1);
    const maxTokens   = clamp(
        Number(body?.maxTokens ?? TIERED_LLM_DEFAULT_MAX_TOKENS),
        64,
        TIERED_LLM_HARD_MAX_TOKENS,
    );

    // Build message list — inject JSON instruction into system prompt when requested.
    // We avoid response_format entirely because different model revisions on
    // Workers AI use different format variants (json_object vs json_schema).
    const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
    const effectiveSystem = wantsJson
        ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction)
        : system;

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (effectiveSystem) messages.push({ role: 'system', content: effectiveSystem });
    messages.push({ role: 'user', content: prompt });

    try {
        const payload: Record<string, unknown> = { messages, temperature, max_tokens: maxTokens };
        // 70b fp8-fast model supports json_object response_format; 8b and others use prompt-only.
        const supports70bJsonFormat = model.includes('llama-3.3-70b') || model.includes('llama-3.1-70b');
        if (wantsJson && supports70bJsonFormat) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(model as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        // Strip ```json fences that some models add regardless
        if (text) {
            text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        }

        if (!text) return json({ error: 'llm_empty', model, task: taskKey, tier, free }, request, env, 502);

        return json({ text, model, task: taskKey, tier, free, description }, request, env);
    } catch (e: any) {
        return json({ error: 'llm_failed', message: String(e?.message || e), model, task: taskKey, tier, free }, request, env, 502);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Race LLM — fire 2-3 task models in parallel, return whichever completes first.
//
// POST /api/cv/race-llm
// Body: {
//   tasks: string[],     — 2-3 task keys from TIERED_MODEL_MAP
//   prompt: string,
//   system?: string,
//   json?: boolean,
//   temperature?: number,
//   maxTokens?: number,
// }
// Returns: { text, task, model, tier, free, raceMs, candidates }
//
// COST WARNING: Workers AI does not expose a cancellation signal, so all
// candidates run to completion server-side and Cloudflare bills any paid
// models in the race regardless of which one's response is returned. Frontend
// should only race pairs where at least one candidate is FREE, OR where the
// latency win justifies the duplicate spend.
// ─────────────────────────────────────────────────────────────────────────────

const RACE_LLM_MAX_CANDIDATES = 3;

async function handleRaceLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);

    const tasks: string[] = Array.isArray(body?.tasks)
        ? body.tasks
            .map((t: any) => String(t || '').trim())
            .filter(Boolean)
            .slice(0, RACE_LLM_MAX_CANDIDATES)
        : [];
    if (tasks.length < 2) {
        return json({ error: 'need_at_least_two_tasks' }, request, env, 400);
    }

    const paidUpgrade = body?.paidUpgrade === true;
    const system = typeof body?.system === 'string' ? body.system.slice(0, TIERED_LLM_MAX_SYSTEM_CHARS) : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, TIERED_LLM_MAX_PROMPT_CHARS) : '';
    if (!prompt) return json({ error: 'missing_prompt' }, request, env, 400);

    const wantsJson  = body?.json === true;
    const temperature = clamp(Number(body?.temperature ?? 0.3), 0, 1);
    const maxTokens   = clamp(
        Number(body?.maxTokens ?? TIERED_LLM_DEFAULT_MAX_TOKENS),
        64,
        TIERED_LLM_HARD_MAX_TOKENS,
    );

    const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
    const effectiveSystem = wantsJson
        ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction)
        : system;

    const baseMessages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (effectiveSystem) baseMessages.push({ role: 'system', content: effectiveSystem });
    baseMessages.push({ role: 'user', content: prompt });

    const t0 = Date.now();

    const runOne = async (taskKey: string) => {
        const baseMapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
        const upgradedModel = paidUpgrade ? PAID_UPGRADE_MAP[taskKey] : undefined;
        const model = upgradedModel ?? baseMapping.model;
        const { tier, free: baseFree, description } = baseMapping;
        const free = upgradedModel ? false : baseFree;

        const payload: Record<string, unknown> = { messages: baseMessages, temperature, max_tokens: maxTokens };
        const supports70bJsonFormat = model.includes('llama-3.3-70b') || model.includes('llama-3.1-70b');
        if (wantsJson && supports70bJsonFormat) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(model as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (text) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (!text) throw new Error(`empty:${taskKey}`);

        return { text, task: taskKey, model, tier, free, description };
    };

    const candidates = tasks.map(runOne);
    try {
        const winner = await Promise.any(candidates);
        const raceMs = Date.now() - t0;
        return json({ ...winner, raceMs, candidates: tasks.length }, request, env);
    } catch (e: any) {
        const reasons = e?.errors?.map((x: any) => String(x?.message || x)) ?? [String(e?.message || e)];
        return json({ error: 'all_candidates_failed', tasks, reasons }, request, env, 502);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section-parallel CV generation — Apr 2026
//   POST /api/cv/parallel-sections
// Body: {
//   system?:   string       — common system prompt prepended to every section
//   preamble?: string       — shared context (profile + JD + market intel +
//                             voice rules + brief) prepended to every section's
//                             user prompt before its section-specific tail
//   sections:  Array<{
//     name:        string   — caller-defined identifier (e.g. "summary")
//     task:        string   — TIERED_MODEL_MAP key (e.g. "cvSummary")
//     instruction: string   — section-specific tail appended after preamble
//     maxTokens?:  number   — per-section override (default 1024)
//     temperature?: number  — per-section override (default 0.4)
//   }>,
//   fallbackTask?: string   — task key to retry with on primary failure
//                             (default "cvFallback" → Mistral Small 3.1 24B FREE)
// }
//
// Returns: {
//   ok: true,
//   totalMs: number,        — wall-clock max across all sections (parallel)
//   results: {
//     [sectionName]: {
//       text:     string    — model output (empty on full failure)
//       model:    string    — final model that produced the text
//       task:     string    — final task key (primary or fallback)
//       ms:       number    — per-section duration
//       fellBack: boolean   — true if primary failed & fallback succeeded
//       error?:   string    — present if BOTH primary AND fallback failed
//     }
//   },
//   errors: Array<{ section: string, message: string }>
// }
//
// COST WARNING: every section runs to completion server-side. Use FREE-tier
// task keys for simple sections (summary, skills, education) and reserve paid
// models (cvExperience, cvProjects via Scout 17B) for bullet-heavy work.
// ─────────────────────────────────────────────────────────────────────────────

const PARALLEL_SECTIONS_MAX_COUNT       = 8;
const PARALLEL_SECTIONS_DEFAULT_FALLBACK = 'cvFallback';
const PARALLEL_SECTIONS_INSTRUCTION_MAX  = 6000;
const PARALLEL_SECTIONS_PREAMBLE_MAX     = TIERED_LLM_MAX_PROMPT_CHARS;

interface ParallelSectionInput {
    name: string;
    task: string;
    instruction: string;
    maxTokens?: number;
    temperature?: number;
    json?: boolean;
}

interface ParallelSectionResult {
    text: string;
    model: string;
    task: string;
    ms: number;
    fellBack: boolean;
    error?: string;
}

async function handleParallelSections(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);

    // System prompt is sourced from internal worker constant — never from the client.
    // Pipeline rules stay inside the compiled worker binary; nothing sensitive travels over the network.
    const system      = _CV_SYSTEM_PROFESSIONAL;
    const profileHash = typeof body?.profile_hash === 'string' ? body.profile_hash.trim() : '';
    const rawPreamble = typeof body?.preamble === 'string' ? body.preamble.slice(0, PARALLEL_SECTIONS_PREAMBLE_MAX) : '';
    const fallbackTask: string = typeof body?.fallbackTask === 'string' && body.fallbackTask.trim()
        ? body.fallbackTask.trim()
        : PARALLEL_SECTIONS_DEFAULT_FALLBACK;

    // If the preamble contains the {{PROFILE}} placeholder and a profile_hash
    // was provided, resolve the cached compact profile from D1 and substitute.
    // On any failure we fall through with the placeholder left intact — the LLM
    // will still produce output, just without the resolved profile text.
    let preamble = rawPreamble;
    const PROFILE_PLACEHOLDER = '{{PROFILE}}';
    if (profileHash && preamble.includes(PROFILE_PLACEHOLDER)) {
        try {
            const row = await env.CV_DB.prepare(
                `SELECT compact_json FROM profile_cache WHERE hash = ?`
            ).bind(profileHash).first<{ compact_json: string }>();

            if (row?.compact_json) {
                preamble = preamble.replaceAll(PROFILE_PLACEHOLDER, row.compact_json);
                // Update usage stats in the background — non-critical.
                const now = Math.floor(Date.now() / 1000);
                env.CV_DB.prepare(
                    `UPDATE profile_cache SET last_used_at = ?, use_count = use_count + 1 WHERE hash = ?`
                ).bind(now, profileHash).run().catch(() => {});
            }
        } catch {
            // D1 read failure — leave preamble as-is (placeholder won't match
            // any real profile, but the LLM can still attempt output).
        }
    }

    const rawSections: any[] = Array.isArray(body?.sections) ? body.sections : [];
    if (rawSections.length === 0) {
        return json({ error: 'missing_sections' }, request, env, 400);
    }

    const sections: ParallelSectionInput[] = rawSections
        .slice(0, PARALLEL_SECTIONS_MAX_COUNT)
        .map((s: any) => ({
            name:        String(s?.name || '').trim(),
            task:        String(s?.task || 'general').trim(),
            instruction: String(s?.instruction || '').slice(0, PARALLEL_SECTIONS_INSTRUCTION_MAX),
            maxTokens:   Number.isFinite(s?.maxTokens) ? clamp(Number(s.maxTokens), 64, TIERED_LLM_HARD_MAX_TOKENS) : 1024,
            temperature: Number.isFinite(s?.temperature) ? clamp(Number(s.temperature), 0, 1) : 0.4,
            json:        s?.json === true,
        }))
        .filter(s => s.name && s.instruction);

    if (sections.length === 0) {
        return json({ error: 'no_valid_sections' }, request, env, 400);
    }
    // No two sections may share a name — collisions would silently overwrite results.
    const names = new Set<string>();
    for (const s of sections) {
        if (names.has(s.name)) return json({ error: 'duplicate_section_name', name: s.name }, request, env, 400);
        names.add(s.name);
    }

    const t0 = Date.now();

    const callOnce = async (
        sec: ParallelSectionInput,
        taskKey: string,
    ): Promise<{ text: string; model: string }> => {
        const mapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
        const { model } = mapping;

        const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
        const wantsJson = sec.json === true;
        const effectiveSystem = wantsJson
            ? (system ? system + '\n\n' + jsonInstruction : jsonInstruction)
            : system;

        const userContent = preamble
            ? preamble + '\n\n──── SECTION: ' + sec.name.toUpperCase() + ' ────\n' + sec.instruction
            : sec.instruction;

        const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
        if (effectiveSystem) messages.push({ role: 'system', content: effectiveSystem });
        messages.push({ role: 'user', content: userContent });

        const payload: Record<string, unknown> = {
            messages,
            temperature: sec.temperature ?? 0.4,
            max_tokens:  sec.maxTokens ?? 1024,
        };
        const supports70bJsonFormat = model.includes('llama-3.3-70b') || model.includes('llama-3.1-70b');
        if (wantsJson && supports70bJsonFormat) payload.response_format = { type: 'json_object' };

        const res: any = await env.AI.run(model as any, payload as any);

        let text = '';
        if (typeof res === 'string') text = res;
        else if (typeof res?.response === 'string') text = res.response;
        else if (typeof res?.result?.response === 'string') text = res.result.response;
        else if (typeof res?.choices?.[0]?.message?.content === 'string') text = res.choices[0].message.content;

        if (text) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (!text) throw new Error(`empty:${sec.name}`);

        return { text, model };
    };

    const runSection = async (sec: ParallelSectionInput): Promise<[string, ParallelSectionResult]> => {
        const sectionStart = Date.now();
        try {
            const out = await callOnce(sec, sec.task);
            return [sec.name, {
                text: out.text,
                model: out.model,
                task: sec.task,
                ms: Date.now() - sectionStart,
                fellBack: false,
            }];
        } catch (primaryErr: any) {
            // Primary model failed → try the fallback task.
            try {
                const out = await callOnce(sec, fallbackTask);
                return [sec.name, {
                    text: out.text,
                    model: out.model,
                    task: fallbackTask,
                    ms: Date.now() - sectionStart,
                    fellBack: true,
                }];
            } catch (fallbackErr: any) {
                return [sec.name, {
                    text: '',
                    model: '',
                    task: sec.task,
                    ms: Date.now() - sectionStart,
                    fellBack: false,
                    error: `primary=${String(primaryErr?.message || primaryErr).slice(0, 120)}; fallback=${String(fallbackErr?.message || fallbackErr).slice(0, 120)}`,
                }];
            }
        }
    };

    // Fan out — every section runs concurrently inside the same Worker request.
    const settled = await Promise.all(sections.map(runSection));
    const results: Record<string, ParallelSectionResult> = {};
    const errors: Array<{ section: string; message: string }> = [];
    for (const [name, r] of settled) {
        results[name] = r;
        if (r.error) errors.push({ section: name, message: r.error });
    }

    const allFailed = settled.every(([, r]) => !r.text);
    if (allFailed) {
        return json({ error: 'all_sections_failed', errors, totalMs: Date.now() - t0 }, request, env, 502);
    }

    return json({
        ok: true,
        totalMs: Date.now() - t0,
        results,
        errors,
    }, request, env);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase I — Leak miner queue + nightly auto-promotion
// ─────────────────────────────────────────────────────────────────────────────

const LEAK_PROMOTE_THRESHOLD = 5;   // count >= 5 → auto-promote
const LEAK_REPORT_MAX_PHRASES = 100;
const LEAK_PHRASE_MAX_LEN = 80;
const LEAK_PHRASE_MIN_LEN = 3;

async function handleLeakReport(request: Request, env: Env): Promise<Response> {
    // Public route — no admin token. Validates and rate-limits via input caps.
    const body = await safeJson(request);
    const phrases: string[] = Array.isArray(body?.phrases)
        ? body.phrases.map((p: any) => String(p || '').toLowerCase().trim()).filter(Boolean)
        : [];
    const sample: string = String(body?.sample || '').slice(0, 500);
    if (phrases.length === 0) return json({ error: 'missing_phrases' }, request, env, 400);

    const cleaned = Array.from(new Set(phrases))
        .filter(p => p.length >= LEAK_PHRASE_MIN_LEN && p.length <= LEAK_PHRASE_MAX_LEN)
        .slice(0, LEAK_REPORT_MAX_PHRASES);
    if (cleaned.length === 0) return json({ error: 'no_valid_phrases' }, request, env, 400);

    // Skip phrases already in the banned list (saves DB churn)
    const banned = (await env.CV_KV.get<any[]>('cv:banned:all', { type: 'json' })) || [];
    const bannedSet = new Set(banned.map((b: any) => String(b.phrase || '').toLowerCase()));
    const fresh = cleaned.filter(p => !bannedSet.has(p));
    if (fresh.length === 0) return json({ ok: true, recorded: 0, already_banned: cleaned.length }, request, env);

    let recorded = 0;
    for (const phrase of fresh) {
        const id = crypto.randomUUID();
        try {
            await env.CV_DB.prepare(
                `INSERT INTO cv_leak_candidates (id, phrase, count, sample, first_seen, last_seen, status)
                 VALUES (?, ?, 1, ?, datetime('now'), datetime('now'), 'pending')
                 ON CONFLICT(phrase) DO UPDATE SET
                     count = count + 1,
                     last_seen = datetime('now'),
                     sample = COALESCE(NULLIF(?, ''), sample)`
            ).bind(id, phrase, sample, sample).run();
            recorded++;
        } catch {/* swallow per-row errors */}
    }
    return json({ ok: true, recorded, skipped_already_banned: cleaned.length - fresh.length }, request, env);
}

async function handleLeakCandidatesList(request: Request, env: Env, url: URL): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');

    const status = String(url.searchParams.get('status') || 'pending');
    const limit = clamp(parseInt(url.searchParams.get('limit') || '100', 10), 1, 500);
    const offset = clamp(parseInt(url.searchParams.get('offset') || '0', 10), 0, 100000);

    const rs = await env.CV_DB.prepare(
        `SELECT id, phrase, count, sample, first_seen, last_seen, status, decided_at
           FROM cv_leak_candidates
          WHERE status = ?
          ORDER BY count DESC, last_seen DESC
          LIMIT ? OFFSET ?`
    ).bind(status, limit, offset).all();

    const total = await env.CV_DB.prepare(
        `SELECT COUNT(*) AS n FROM cv_leak_candidates WHERE status = ?`
    ).bind(status).first<{ n: number }>();

    return json({
        ok: true,
        rows: rs.results,
        total: total?.n ?? 0,
        limit, offset, status,
        threshold: LEAK_PROMOTE_THRESHOLD,
    }, request, env);
}

async function handleLeakCandidatesDecide(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');

    const body = await safeJson(request);
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.map((x: any) => String(x)).filter(Boolean) : [];
    const decision: string = String(body?.decision || '').toLowerCase();
    const severity: string = ['critical', 'high', 'medium'].includes(String(body?.severity)) ? String(body.severity) : 'medium';
    if (ids.length === 0) return json({ error: 'missing_ids' }, request, env, 400);
    if (!['promote', 'reject'].includes(decision)) return json({ error: 'invalid_decision' }, request, env, 400);
    if (ids.length > 200) return json({ error: 'too_many_ids', max: 200 }, request, env, 400);

    let promoted = 0, rejected = 0, skipped = 0;
    if (decision === 'reject') {
        for (const id of ids) {
            await env.CV_DB.prepare(
                `UPDATE cv_leak_candidates SET status='rejected', decided_at=datetime('now'), decided_by='admin' WHERE id = ?`
            ).bind(id).run();
            rejected++;
        }
        return json({ ok: true, decision, rejected }, request, env);
    }

    // Promote: insert into cv_banned_phrases (skip dupes), mark candidate promoted
    for (const id of ids) {
        const row = await env.CV_DB.prepare(
            `SELECT phrase FROM cv_leak_candidates WHERE id = ? AND status = 'pending'`
        ).bind(id).first<{ phrase: string }>();
        if (!row?.phrase) { skipped++; continue; }

        try {
            const newId = crypto.randomUUID();
            await env.CV_DB.prepare(
                `INSERT OR IGNORE INTO cv_banned_phrases (id, phrase, replacement, severity, reason)
                 VALUES (?, ?, '', ?, 'manual_promote')`
            ).bind(newId, row.phrase, severity).run();
            await env.CV_DB.prepare(
                `UPDATE cv_leak_candidates SET status='promoted', decided_at=datetime('now'), decided_by='admin' WHERE id = ?`
            ).bind(id).run();
            promoted++;
        } catch { skipped++; }
    }
    if (promoted > 0) await rebuildBannedKv(env);
    return json({ ok: true, decision, promoted, skipped, kv_synced: promoted > 0 }, request, env);
}

async function runLeakPromotionCron(env: Env): Promise<void> {
    // Auto-promote pending candidates with count >= threshold that aren't already banned.
    const banned = (await env.CV_KV.get<any[]>('cv:banned:all', { type: 'json' })) || [];
    const bannedSet = new Set(banned.map((b: any) => String(b.phrase || '').toLowerCase()));

    const rs = await env.CV_DB.prepare(
        `SELECT id, phrase, count FROM cv_leak_candidates
          WHERE status = 'pending' AND count >= ?
          ORDER BY count DESC LIMIT 200`
    ).bind(LEAK_PROMOTE_THRESHOLD).all<{ id: string; phrase: string; count: number }>();

    let promoted = 0, skipped = 0;
    for (const cand of rs.results || []) {
        if (bannedSet.has(cand.phrase)) {
            await env.CV_DB.prepare(
                `UPDATE cv_leak_candidates SET status='promoted', decided_at=datetime('now'), decided_by='cron_already_banned' WHERE id = ?`
            ).bind(cand.id).run();
            skipped++;
            continue;
        }
        try {
            const newId = crypto.randomUUID();
            await env.CV_DB.prepare(
                `INSERT OR IGNORE INTO cv_banned_phrases (id, phrase, replacement, severity, reason)
                 VALUES (?, ?, '', 'medium', 'auto_promoted')`
            ).bind(newId, cand.phrase).run();
            await env.CV_DB.prepare(
                `UPDATE cv_leak_candidates SET status='promoted', decided_at=datetime('now'), decided_by='cron' WHERE id = ?`
            ).bind(cand.id).run();
            promoted++;
        } catch { skipped++; }
    }

    if (promoted > 0) await rebuildBannedKv(env);
    console.log(`[cron] leak-promotion: promoted=${promoted} skipped=${skipped} candidates_seen=${(rs.results || []).length}`);
}

async function rebuildBannedKv(env: Env): Promise<void> {
    const rs = await env.CV_DB.prepare(
        `SELECT phrase, replacement, severity, reason FROM cv_banned_phrases ORDER BY length(phrase) DESC`
    ).all();
    await env.CV_KV.put('cv:banned:all', JSON.stringify(rs.results || []));
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase H — DB-driven multi-token admin auth
// ─────────────────────────────────────────────────────────────────────────────

type AdminRole = 'viewer' | 'editor' | 'admin';
const ROLE_RANK: Record<AdminRole, number> = { viewer: 1, editor: 2, admin: 3 };
const VALID_ROLES: AdminRole[] = ['viewer', 'editor', 'admin'];

interface AuthCtx { ok: true; role: AdminRole; label: string; tokenId: string | null; }

async function sha256Hex(input: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyAdminAuth(request: Request, env: Env, required: AdminRole = 'admin'): Promise<AuthCtx | null> {
    const token = request.headers.get('X-Admin-Token') || '';
    if (!token) return null;

    // 1) DB-backed token (preferred)
    try {
        const hash = await sha256Hex(token);
        const row = await env.CV_DB.prepare(
            `SELECT id, label, role FROM cv_admin_tokens WHERE token_hash = ? AND revoked_at IS NULL`
        ).bind(hash).first<{ id: string; label: string; role: AdminRole }>();
        if (row && VALID_ROLES.includes(row.role) && ROLE_RANK[row.role] >= ROLE_RANK[required]) {
            // Best-effort last_used_at update — never block the request
            env.CV_DB.prepare(
                `UPDATE cv_admin_tokens SET last_used_at = datetime('now') WHERE id = ?`
            ).bind(row.id).run().catch(() => {/* swallow */});
            return { ok: true, role: row.role, label: row.label, tokenId: row.id };
        }
    } catch {/* table may not exist on first deploy, fall through */}

    // 2) Bootstrap: env.ADMIN_TOKEN is treated as full admin so we never lock out
    if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) {
        return { ok: true, role: 'admin', label: 'env_bootstrap', tokenId: null };
    }
    return null;
}

function unauthorized(request: Request, env: Env, required: AdminRole): Response {
    return json({ error: 'unauthorized', required_role: required }, request, env, 401);
}

async function handleTokensList(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'admin');
    if (!auth) return unauthorized(request, env, 'admin');
    const rs = await env.CV_DB.prepare(
        `SELECT id, label, role, created_at, last_used_at, revoked_at
           FROM cv_admin_tokens ORDER BY revoked_at IS NULL DESC, created_at DESC`
    ).all();
    return json({ ok: true, rows: rs.results }, request, env);
}

async function handleTokensCreate(request: Request, env: Env): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'admin');
    if (!auth) return unauthorized(request, env, 'admin');

    const body = await safeJson(request);
    const label = String(body?.label || '').trim().slice(0, 80);
    const role = String(body?.role || 'editor') as AdminRole;
    if (!label) return json({ error: 'missing_label' }, request, env, 400);
    if (!VALID_ROLES.includes(role)) return json({ error: 'invalid_role', allowed: VALID_ROLES }, request, env, 400);

    // Generate a 32-byte random token, prefixed for human-readability
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
    // Plaintext is returned ONCE — caller must save it.
    return json({ ok: true, id, label, role, token: plaintext, warning: 'Save this token now — it will never be shown again.' }, request, env);
}

async function handleTokensRevoke(request: Request, env: Env): Promise<Response> {
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

// ─────────────────────────────────────────────────────────────────────────────
// LLM Response Cache  (GET + POST /api/cv/llm-cache)
// ─────────────────────────────────────────────────────────────────────────────
// Cache TTL: 30 days from last access.
// Max response stored: 200 KB (prevent D1 bloat from giant JSON responses).
// Cleanup: a background DELETE evicts expired rows on every write so the table
// never grows unboundedly without needing a cron job.
// ─────────────────────────────────────────────────────────────────────────────

const LLM_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const LLM_CACHE_MAX_RESPONSE_BYTES = 200_000;      // 200 KB

async function handleLLMCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
    const key = (url.searchParams.get('key') ?? '').trim();
    if (!key || key.length !== 64) {
        return json({ hit: false, error: 'invalid_key' }, request, env, 400);
    }

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

    // Increment hit counter + refresh last_hit_at in the background — fire-and-forget.
    void env.CV_DB.prepare(
        `UPDATE llm_cache SET hit_count = hit_count + 1, last_hit_at = ? WHERE cache_key = ?`
    ).bind(now, key).run().catch(() => { /* best-effort */ });

    return json({ hit: true, response: row.response, hitCount: row.hit_count + 1 }, request, env);
}

async function handleLLMCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    // Upsert — if the same key already exists (hash collision is astronomically
    // unlikely but possible in theory), just update hit_count so we don't lose data.
    await env.CV_DB.prepare(
        `INSERT INTO llm_cache (cache_key, model, temperature, response, prompt_size, hit_count, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
             hit_count  = hit_count + 1,
             last_hit_at = excluded.created_at`
    ).bind(key, model, temperature, response, promptSize, now).run();

    // Background cleanup — evict rows older than TTL (cap to 200 rows per run).
    const expireBefore = now - LLM_CACHE_TTL_SECONDS;
    ctx.waitUntil(
        env.CV_DB.prepare(
            `DELETE FROM llm_cache
             WHERE cache_key IN (
                 SELECT cache_key FROM llm_cache
                 WHERE COALESCE(last_hit_at, created_at) < ?
                 LIMIT 200
             )`
        ).bind(expireBefore).run().catch(() => { /* best-effort */ })
    );

    return json({ ok: true, stored: true }, request, env);
}

// ─────────────────────────────────────────────────────────────────────────────
// CV Structural Examples  (GET + POST /api/cv/examples)
// ─────────────────────────────────────────────────────────────────────────────
// Stores compact "structural blueprints" of high-quality generated CVs.
// The fingerprint is SHA-256(normalised_role:seniority:purpose:mode) — never
// user-specific. The stored data encodes bullet-rhythm patterns (word counts
// per bullet, per role) and section sizes so the LLM can mirror proven
// structure without seeing any personal content.
// ─────────────────────────────────────────────────────────────────────────────

async function handleCVExamplesGet(request: Request, env: Env, url: URL): Promise<Response> {
    const fingerprint = (url.searchParams.get('fingerprint') ?? '').trim();
    if (!fingerprint || fingerprint.length !== 64) {
        return json({ example: null, error: 'invalid_fingerprint' }, request, env, 400);
    }

    const row = await env.CV_DB.prepare(
        `SELECT fingerprint, primary_title, seniority, generation_mode, purpose,
                summary_words, skills_count, experience_structure, created_at, updated_at
         FROM cv_examples
         WHERE fingerprint = ?`
    ).bind(fingerprint).first<{
        fingerprint: string;
        primary_title: string;
        seniority: string;
        generation_mode: string;
        purpose: string;
        summary_words: number;
        skills_count: number;
        experience_structure: string;
        created_at: number;
        updated_at: number;
    }>();

    if (!row) return json({ example: null }, request, env);

    let experienceStructure: number[][] = [];
    try { experienceStructure = JSON.parse(row.experience_structure); } catch { /* ignore */ }

    return json({
        example: {
            fingerprint: row.fingerprint,
            primaryTitle: row.primary_title,
            seniority: row.seniority,
            generationMode: row.generation_mode,
            purpose: row.purpose,
            summaryWords: row.summary_words,
            skillsCount: row.skills_count,
            experienceStructure,
            updatedAt: row.updated_at,
        },
    }, request, env);
}

async function handleCVExamplesPost(request: Request, env: Env): Promise<Response> {
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
              summary_words, skills_count, experience_structure, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(fingerprint) DO UPDATE SET
             primary_title        = excluded.primary_title,
             summary_words        = excluded.summary_words,
             skills_count         = excluded.skills_count,
             experience_structure = excluded.experience_structure,
             updated_at           = excluded.updated_at`
    ).bind(fingerprint, primaryTitle, seniority, generationMode, purpose,
           summaryWords, skillsCount, experienceJson, now, now).run();

    return json({ ok: true }, request, env);
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile cache — GET /api/cv/profile?hash=<hex>  or  ?slot_id=<uuid>
// ─────────────────────────────────────────────────────────────────────────────
async function handleProfileCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
    const hash   = url.searchParams.get('hash')    || '';
    const slotId = url.searchParams.get('slot_id') || '';

    if (!hash && !slotId) {
        return json({ error: 'missing_param', detail: 'Provide hash or slot_id' }, request, env, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    if (hash) {
        // Exact lookup by content hash — used during generation.
        const row = await env.CV_DB.prepare(
            `SELECT hash, slot_id, slot_name, compact_json, created_at, last_used_at, use_count
             FROM profile_cache WHERE hash = ?`
        ).bind(hash).first<{ hash: string; slot_id: string; slot_name: string; compact_json: string; created_at: number; last_used_at: number; use_count: number }>();

        if (!row) return json({ found: false }, request, env, 404);

        // Update last_used_at + use_count in the background.
        env.CV_DB.prepare(
            `UPDATE profile_cache SET last_used_at = ?, use_count = use_count + 1 WHERE hash = ?`
        ).bind(now, hash).run().catch(() => {});

        return json({ found: true, hash: row.hash, slot_id: row.slot_id, slot_name: row.slot_name, compact_json: row.compact_json, use_count: row.use_count + 1 }, request, env);
    }

    // Lookup by slot_id — returns the most recently stored profile for that slot.
    const rows = await env.CV_DB.prepare(
        `SELECT hash, slot_name, compact_json, last_used_at, use_count
         FROM profile_cache WHERE slot_id = ?
         ORDER BY last_used_at DESC LIMIT 1`
    ).bind(slotId).first<{ hash: string; slot_name: string; compact_json: string; last_used_at: number; use_count: number }>();

    if (!rows) return json({ found: false }, request, env, 404);

    return json({ found: true, hash: rows.hash, slot_id: slotId, slot_name: rows.slot_name, compact_json: rows.compact_json, use_count: rows.use_count }, request, env);
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile cache — POST /api/cv/profile
// Body: { hash, slot_id, slot_name, compact_json }
// ─────────────────────────────────────────────────────────────────────────────
async function handleProfileCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const hash        = typeof body?.hash        === 'string' ? body.hash.trim()        : '';
    const slotId      = typeof body?.slot_id     === 'string' ? body.slot_id.trim()     : '';
    const slotName    = typeof body?.slot_name   === 'string' ? body.slot_name.trim().substring(0, 120) : '';
    const compactJson = typeof body?.compact_json === 'string' ? body.compact_json       : '';

    if (!hash || hash.length < 16)  return json({ error: 'invalid_hash' }, request, env, 400);
    if (!slotId)                    return json({ error: 'missing_slot_id' }, request, env, 400);
    if (!compactJson)               return json({ error: 'missing_compact_json' }, request, env, 400);

    // Reject payloads larger than 64 KB — a compactProfile should never be this large.
    if (compactJson.length > 65536) return json({ error: 'compact_json_too_large', max: 65536 }, request, env, 413);

    const now = Math.floor(Date.now() / 1000);

    await env.CV_DB.prepare(
        `INSERT INTO profile_cache (hash, slot_id, slot_name, compact_json, created_at, last_used_at, use_count)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(hash) DO UPDATE SET
             last_used_at = excluded.last_used_at,
             slot_name    = excluded.slot_name`
    ).bind(hash, slotId, slotName, compactJson, now, now).run();

    // Expire any stale entries for this slot that are older than 90 days and
    // have a different hash (i.e. old versions of this profile).
    const ninetyDaysAgo = now - 90 * 24 * 3600;
    ctx.waitUntil(
        env.CV_DB.prepare(
            `DELETE FROM profile_cache WHERE slot_id = ? AND hash != ? AND last_used_at < ?`
        ).bind(slotId, hash, ninetyDaysAgo).run().catch(() => {})
    );

    return json({ ok: true, hash, cached: true }, request, env);
}

// ─────────────────────────────────────────────────────────────────────────────
// JD keyword analysis cache — GET /api/cv/jd-analysis?key=<hash>
// Returns cached JobAnalysisResult for a given JD hash (7-day TTL).
// ─────────────────────────────────────────────────────────────────────────────
async function handleJdAnalysisCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
    const key = url.searchParams.get('key') || '';
    // Min 4 chars — quickHash() produces 8-char hex; SHA-256 produces 64-char hex.
    // The previous limit of 16 caused every GET to 400 when the client used quickHash.
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

// ─────────────────────────────────────────────────────────────────────────────
// JD keyword analysis cache — POST /api/cv/jd-analysis
// Body: { key, result_json }
// ─────────────────────────────────────────────────────────────────────────────
async function handleJdAnalysisCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const key        = typeof body?.key         === 'string' ? body.key.trim()        : '';
    const resultJson = typeof body?.result_json === 'string' ? body.result_json       : '';

    // Same fix as GET — quickHash() produces 8-char keys, not 16+.
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

    return json({ ok: true, key, cached: true }, request, env);
}

async function handleMarketResearchCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
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

    // Expire entries older than 7 days.
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

// ─────────────────────────────────────────────────────────────────────────────
// Market research cache — POST /api/cv/market-research
// Body: { key, scenario, detected_role, result_json }
// ─────────────────────────────────────────────────────────────────────────────
async function handleMarketResearchCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    // Prune very old entries (>14 days unused) in the background.
    const fourteenDaysAgo = now - 14 * 24 * 3600;
    ctx.waitUntil(
        env.CV_DB.prepare(`DELETE FROM market_research_cache WHERE last_used_at < ?`)
            .bind(fourteenDaysAgo).run().catch(() => {})
    );

    return json({ ok: true, key, cached: true }, request, env);
}

// ─────────────────────────────────────────────────────────────────────────────
// CV Pipeline Rules — GET /api/cv/rules
//
// These string constants are the proprietary prompt-engineering rules that
// power ProCV's quality pipeline. They live ONLY here, inside the compiled
// Cloudflare Worker, and are never shipped inside the client JS bundle.
// The client fetches them once per session via rulesService.ts so DevTools
// only shows raw profile/JD data going in and finished CV JSON coming out.
// ─────────────────────────────────────────────────────────────────────────────

const _CV_RULES_VERSION = '2026-05c';

// ── Generation prompt IP — scenario blocks, pivot formula, humanization header,
//    critical rules reminder, and CV data schema. These are the most valuable
//    prompt-engineering assets. They live ONLY here, never in the client bundle.
// ─────────────────────────────────────────────────────────────────────────────

const _CV_SCENARIO_MODE_OVERRIDE = `MODE OVERRIDE: Boosted/Aggressive requires real experience to enhance. AUTO-DOWNGRADED TO HONEST MODE — generate only what is directly evidenced in the profile.`;

const _CV_SCENARIO_A = `
═══ SCENARIO A — NO EXPERIENCE, NO PROJECTS ═══{{MODE_OVERRIDE}}
SUMMARY — Foundation Formula ONLY (55–70 words):
  Line 1 IDENTITY: Degree + field + institution + year of study/graduation.
  Line 2 CAPABILITY: What they can genuinely do — name specific tools, methods, or domains from their coursework.
  Line 3 SIGNAL: One concrete quality indicator (GPA, award, distinction, class ranking, thesis title).
  Line 4 READINESS: What they bring to the role from day one — grounded in real coursework or academic output.
  BANNED IN SUMMARY: "Seeking opportunity to", "Eager to learn", "Passionate about", "No professional experience but", any implied work history.

SECTIONS TO OMIT (generate nothing, not even a header):
  - Work Experience → OMIT ENTIRELY
  - If no qualifying academic projects exist → OMIT Projects section entirely

PROJECTS SECTION (only if academic work qualifies):
  Use academic projects, thesis, major design assignments, or competition entries with real deliverables.
  Label format: "[Project Name] — Academic Project, [Institution], [Year]"
  Each entry answers: What was the goal? → What tools/methods? → What was the outcome? → What was the scope?
  DOES NOT QUALIFY: attending lectures, reading textbook chapters, following tutorials step-by-step.

EDUCATION — This carries the weight experience normally would. Include ALL that are true:
  - Degree, institution, year, grade/classification
  - Thesis or final year project: title + 1-sentence description + outcome
  - 2–4 relevant course names (actual course titles, not "relevant coursework")
  - Academic achievements: Dean's list, scholarships, prizes, competition placements
  - Extracurricular leadership roles with transferable skills
  - GRADUATION-STATUS RULE (binding): If a degree entry has a graduation year that is in the past or the current year, the degree IS COMPLETED. Never write "currently pursuing", "presently pursuing", "currently studying", "now pursuing", or any equivalent phrase for that entry. Only use "currently pursuing" / "expected [year]" when the graduation year is explicitly in the future or the field reads "Expected", "Present", "In Progress", "Ongoing", or is blank.

SKILLS — Evidence-only rule: list ONLY skills directly taught or used in documented academic work.
  Never list a tool or technology the profile provides no evidence of using.
═══ END SCENARIO A ═══
`;

const _CV_SCENARIO_B = `
═══ SCENARIO B — HAS EXPERIENCE, NO PROJECTS ═══

SECTIONS TO OMIT (generate nothing, not even a header):
  - Projects → OMIT ENTIRELY. An absent section is professional. A fake section is disqualifying.

SKILLS — Extract only from work experience bullets. Every skill listed must be backed by at least one bullet.
  Do NOT list any skill with no supporting evidence in the experience section.

EXPERIENCE — Must work harder since there are no projects to supplement:
  Every transferable skill the JD requires must be evidenced inside experience bullets.
  If the JD requires a skill not present in the experience, do NOT fabricate it — use the closest honest transferable skill and frame it accurately.
═══ END SCENARIO B ═══
`;

const _CV_SCENARIO_C = `
═══ SCENARIO C — NO EXPERIENCE, HAS PROJECTS ═══{{MODE_OVERRIDE}}
SUMMARY — Projects-Led Formula ONLY (55–70 words):
  Line 1 IDENTITY: What kind of builder/developer/creator they are + number of projects built.
  Line 2 PROOF: Strongest single project outcome with a real metric or scale (users, GitHub stars, revenue, uptime, completion).
  Line 3 STACK: Core technical stack evidenced across projects — name exact tools, frameworks, languages.
  Line 4 READINESS: What they bring to a team from day one based on what they have already shipped.

SECTION ORDER (mandatory — projects must lead):
  Professional Summary → Skills → Projects → Education → Languages

SECTIONS TO OMIT:
  - Work Experience → OMIT ENTIRELY
  - EXCEPTION: Any internship, attachment, volunteer technical work, or paid freelance work → include as experience.

PROJECTS — Treat each project like a full work experience role (4–6 bullets each):
  - Bullet 1 (scope anchor): What it does, who uses it, what scale, live URL if applicable.
  - Bullets 2–6: XYZ/CAR achievement bullets — tools used, outcomes, growth, measurable impact.
  - Verb tense: present tense if the project is live and maintained; past tense if completed.
  - Do NOT write 2-sentence project summaries. These ARE the candidate's work history — treat them accordingly.

SKILLS — Evidence drawn from projects only. Every skill must be demonstrated in at least one project entry.
═══ END SCENARIO C ═══
`;

const _CV_SCENARIO_D = `
═══ SCENARIO D — THIN EXPERIENCE (SINGLE INTERNSHIP / ATTACHMENT) ═══{{MODE_OVERRIDE}}
SUMMARY — Emerging Professional Formula (55–70 words):
  Line 1 ANCHOR: Degree + field + institution (the credential).
  Line 2 EVIDENCE: What the internship/attachment concretely demonstrated — real tasks, real environment.
  Line 3 SKILLS: Specific technical skills genuinely acquired during the role.
  Line 4 READINESS: What the JD needs that they can genuinely deliver right now.

EXPERIENCE — The single role gets FULL bullet treatment (5–6 bullets):
  RULE: "1–2 bullets for internships" applies only when multiple roles compete for space.
  When this is the ONLY role → treat it like a current role: 5–6 bullets, scope anchor first, then achievements.

EDUCATION — Expanded (same depth as Scenario A):
  Include thesis/final year project, relevant course names, academic achievements, extracurricular leadership.

PROJECTS — Include academic projects if they exist:
  Label: "[Project Name] — Academic Project, [Institution], [Year]"
  Each: goal → tools/methods → outcome → scope.
═══ END SCENARIO D ═══
`;

const _CV_PIVOT_BLOCK_TEMPLATE = `
═══ CAREER PIVOT DETECTED — CROSS-DOMAIN APPLICATION ═══
Candidate background domain(s): {{FROM}}
Target role domain(s): {{TO}}

This candidate is applying ACROSS fields. The CV must be honest about this — recruiters and ATS keyword-stuffers both fail when a CV pretends to be domain-native and isn't.

MANDATORY HANDLING:
1. SUMMARY — "Bridge Formula" (60–80 words):
   Sentence 1 (HONEST IDENTITY): Current discipline + the EXACT target title from the JD framed as the transition. Example: "Agricultural engineer transitioning to software development, with 2 years building automation tools that ran on field equipment."
   Sentence 2 (TRANSFERABLE PROOF): The single strongest piece of evidence from the candidate's background that maps to the target role — named tools, methods, or measurable outcomes that genuinely overlap.
   Sentence 3 (DELIBERATE BRIDGE): What concrete steps they have taken to enter the new field (courses completed by name, certifications, side projects shipped, open-source contributions). NEVER vague language like "passionate about transitioning".
   Sentence 4 (READINESS): One specific value they bring from the previous field that the new field rarely has.
   BANNED: "passionate about", "looking to transition", "eager to learn", "no experience but", "career change", "seeking opportunity".

2. EXPERIENCE BULLETS — Reframe, do NOT relabel:
   - Each bullet must be TRUE to what the candidate actually did, but described with vocabulary the target field will recognize.
   - Lead each role with a transferable scope anchor (team size, budget, systems used, scale of data/output).
   - Highlight tools and methods that genuinely cross over (e.g. Python used for soil-data modeling → Python data analysis; SCADA system maintenance → systems monitoring).
   - DO NOT claim experience in target-domain tools the candidate has not actually used. Better an honest gap than a fake skill.

3. SKILLS SECTION — Two-tier ordering:
   Tier 1 (first): Skills the candidate genuinely has that the target field uses (verified by appearing in their actual experience or documented projects/courses).
   Tier 2 (after): Strong domain skills from their original field that demonstrate depth (these prove competence even if not directly used in the new role).
   DO NOT pad Tier 1 with tools they have only read about. Honesty caps fake-skill detection.

4. PROJECTS / CERTIFICATIONS — Make the bridge visible:
   - Surface every project, course, or certification that demonstrates concrete movement into the target field.
   - If none exist, do NOT invent them. The summary must then carry the bridge alone, and the experience reframing must work harder.

5. SECTION ORDER — Bridge-first:
   Summary → Skills (with Tier 1 leading) → Projects/Certifications (if they evidence the pivot) → Experience → Education.
   Rationale: a recruiter doing a 6-second F-pattern scan must see transferable evidence before encountering a job title that screams "wrong field".

6. ATS KEYWORDS — Use target-field vocabulary ONLY where the candidate's actual work supports it. Never list a target-field skill that the experience section cannot back up.
═══ END CAREER PIVOT BLOCK ═══
`;

const _CV_HUMANIZATION_INSTRUCTION_HEADER = `
    **CRITICAL — AUTHENTIC HUMAN WRITING (AI DETECTION IMMUNITY)**:
    Write as if a confident, accomplished senior professional personally crafted every word in a focused 2-hour session. AI detectors (GPTZero, Originality.ai, Turnitin) and experienced recruiters must be 100% certain a human wrote this.

    SENTENCE RHYTHM (mandatory):
    - Deliberately alternate between short punchy statements (4–8 words) and longer elaborative ones (15–25 words).
    - Three sentences of similar length in a row = failure. Break the pattern.
    - Start at least 2 sentences per section with a number or a past-tense verb for natural variation.

    BANNED PHRASES (zero tolerance — replace with specific facts):
    "delve", "robust", "seamlessly", "synergy", "leverage" (max once in whole document), "cutting-edge", "state-of-the-art", "passionate about", "in today's fast-paced world", "it is worth noting", "navigate the landscape", "groundbreaking", "thought leader", "game-changer", "dynamic", "innovative" (show it, don't say it), "results-driven", "detail-oriented", "team player", "go-getter", "proactive", "best-in-class", "holistic", "moving the needle", "at the end of the day", "take it to the next level", "excited to", "transformative", "impactful" (prove impact with numbers instead).
    BANNED IN SUMMARY (zero tolerance — summary must state what the candidate DELIVERS, not what they WANT): "Looking to", "Looking for", "Seeking to", "Seeking for", "Aiming to", "Aiming for", "Hoping to", "I am looking", "In search of", "eager to join", "excited to contribute", "seeking an opportunity", "seeking to use", "seeking to apply", "seeking to bring".

    SPECIFICITY (mandatory replacements):
    - "improved efficiency" → "cut processing time from X hours to Y minutes"
    - "led a team" → "managed a [N]-person [type] team"
    - "increased revenue" → "grew ARR from \$X to \$Y"
    - "streamlined processes" → "eliminated [N] manual steps, saving [X] hours/week"

    VERB RULES:
    - Every bullet in the CV uses a DIFFERENT strong action verb. Recommended verbs:
      Engineered, Accelerated, Restructured, Negotiated, Overhauled, Forged, Propelled, Slashed, Tripled, Automated, Mentored, Secured, Delivered, Architected, Revamped, Brokered, Consolidated, Deployed, Eliminated, Galvanized, Halved, Implemented, Launched, Migrated, Pioneered, Quantified, Recruited, Scaled, Transformed, Unified, Validated, Won.
    - Never start two bullets across the entire document with the same verb.
    - The first word of each bullet in a job's list must start with a different letter.

    FILLER ELIMINATION:
    - Remove: "in order to", "as well as", "a variety of", "various", "etc", "numerous", "many", "several".
    - Add metrics only when they can be honestly inferred from what the user provided. Never force a number that has no basis in the user's own context — a vivid, specific descriptive bullet is always better than a fabricated metric.
`;

const _CV_CRITICAL_RULES_REMINDER = `
=== FINAL QUALITY CHECK — read this LAST, it overrides all earlier guidance ===
1. Summary: opens with job title + seniority/impact. ZERO "Seeking to", "Seeking for", "Looking to", "Looking for", "Aiming to", "Aiming for", "Hoping to", "Eager to join", "Excited to contribute", "In search of", "I am looking". The summary states what the candidate DELIVERS — not what they WANT. MINIMUM 60 words, 3–4 sentences.
2. Summary: NO generic buzzwords — "highly motivated", "results-driven", "results-oriented", "passionate about", "detail-oriented", "team player", "hard-working", "self-starter", "go-getter". Replace with a concrete fact or achievement.
3. Summary: NEVER paraphrase the job description — describe what the CANDIDATE has actually done, using their own experience and real achievements.
4. Bullets: MINIMUM 8 words per bullet — "Reviewed project documentation" is too short, expand with context and scope.
5. Bullets: NO weak openers — "Responsible for", "Was responsible for", "Helped to", "Assisted with", "Worked on", "Tasked with", "Involved in", "Participated in", "Duties included". Replace with a direct action verb: "Led", "Built", "Delivered", "Managed", etc.
6. Bullet rhythm: MIX lengths — short punchy bullets (8–10 words) must ALTERNATE with fuller ones (15–22 words). Do NOT write 3+ consecutive short bullets.
7. Bullets: ZERO invented verbs — Greenfielded, Scaffolded (non-software), Materialized, Actioned, Ideated, Solutioned, Conceptualized, Operationalized.
8. Bullets: ZERO banned openers — Spearheaded, Orchestrated, Leveraged, Utilized, Facilitated, Empowered, Championed.
9. Bullets: MIX opener categories across the document — do NOT write >85% verb-led bullets. Rotate: number-led ("3 sites surveyed…"), scope-led ("Across 5 counties…"), context-led ("As the sole engineer…"), collaboration-led ("With the client team…"). Also rotate VERB FAMILIES: Management (Led, Managed, Directed), Analysis (Analysed, Evaluated, Assessed), Communication (Presented, Reported, Liaised), Technical (Designed, Built, Configured), Financial (Budgeted, Negotiated, Costed) — use the families that match the candidate's actual role.
10. Bullets: ZERO "→" arrow separators — write each bullet as a single flowing sentence, not chained clauses.
11. Bullets: NO bare metric openers — do NOT start a bullet with a raw number/percentage ("[N]% increase in…", "[AMOUNT] generated…"). Lead with the ACTION first: "Rebuilt X, achieving a [N]% increase in…". ⚠ IMPORTANT: [N] and [AMOUNT] are placeholders — replace with the REAL number from the candidate's profile. NEVER copy example numbers verbatim.
12. Buzzwords: ZERO "robust", "seamlessly", "synergy", "innovative solutions", "cutting-edge", "multifaceted", "unwavering commitment", "thought leader", "game-changer", "best-in-class", "world-class".
13. Metrics: NO chained causals ("X% resulting in Y%"). MAX 55% of bullets per role may carry a number — at least 1–2 bullets per role must be purely qualitative (action + context, no number).
14. No two bullets across the ENTIRE document start with the same verb.
15. Skills: NO duplicate entries — each skill must appear exactly once.
16. Scope anchor: The FIRST bullet of EVERY role in the experience section must be a scope-setting statement — NOT a task or achievement. It must state at least one of: team size, number of direct reports, geographic coverage, client portfolio size, budget managed, or project count. These are NOT scope anchors: "Delivered X", "Supported design of Y", "Executed quality control on Z", "Conducted surveys", "Collaborated with teams". These ARE scope anchors: "Managed a [N]-person field team across [N] sites", "Oversaw a portfolio of [N] client accounts across [Region]", "Supported a [N]-engineer team on [N] concurrent packages". ⚠ Replace [N] and [Region] with the REAL numbers and locations from the candidate's profile — never copy these placeholder values verbatim. Check every role — not just the first.
17. Summary source: The summary MUST be built EXCLUSIVELY from the candidate's ACTUAL work experience, education, and skills in their profile. NEVER copy phrases, sentence structures, role requirements, or objectives from the job description into the summary. The JD's target job title may appear ONCE as an alignment signal; everything else comes from the candidate's real history. A summary that sounds like the JD is a FAILURE — it must sound like the CANDIDATE.
18. Grammar: Fix broken grammar only — correct subject-verb agreement, repair dangling modifiers (NOT "Following degree completion, worked…" — rewrite to include the subject), fix sentence fragments, and keep verb tense consistent per role (present for current role, past for all previous). IMPORTANT: use plain, direct CV language throughout. Do NOT upgrade vocabulary to academic, formal, or AI-elevated language. Do NOT introduce words like "spearheaded", "leveraged", "synergized", "utilized", "facilitated", "orchestrated", "catalyzed" or any elevated corporate-speak. A grammar fix must make a sentence clearer, not more impressive-sounding. The output should read as if a confident working professional wrote it, not an AI thesaurus.
19. Example data: All numbers, percentages, currency amounts, county/region names, and specific phrases that appear in the rules and examples above are PLACEHOLDER TEMPLATES — they illustrate format only. NEVER copy any such value from a rule example into the CV output. Every metric, figure, location, and claim in the generated CV must come exclusively from the candidate's actual profile data.
=== END FINAL CHECK ===
`;

const _CV_DATA_SCHEMA = `
RETURN FORMAT — output ONLY a raw JSON object (no markdown, no code fences) matching this schema:
{
  "summary": "string",
  "skills": ["string"],
  "experience": [
    {
      "company": "string",
      "jobTitle": "string",
      "dates": "string (e.g. Jan 2020 – Present)",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or Present",
      "responsibilities": ["string"]
    }
  ],
  "education": [
    { "degree": "string", "school": "string", "year": "string", "description": "string" }
  ],
  "projects": [
    { "name": "string", "description": "string", "link": "string" }
  ],
  "languages": [
    { "name": "string", "proficiency": "string" }
  ]
}
`;

const _CV_HUMANIZATION_RULES = `
ANTI-DETECTION RULES (binding — never skip, even on regenerate/optimize/improve):

- VOICE (this is the target — read carefully):
    Write as if a confident, slightly understated senior professional is describing their own work to a peer they respect. Direct, specific, a little dry. Quietly proud, never boastful. Sounds like a person, not a press release or a LinkedIn post. The reader should feel: "this person actually did the work and knows what they're talking about."
    DO: vary sentence length deliberately (mix 5–8 word punchy lines with 15–25 word elaborative ones); allow one slightly informal phrase per section; use first-person and contractions ("I've", "didn't", "wasn't") in the summary; let one honest opinion show through (e.g. "actually secure, not just compliant on paper").
    DON'T: write every sentence in perfect formal grammar; repeat the same sentence shape three times in a row; sound like a legal document, marketing copy, or recruiter template.

- BANNED BUZZWORDS / FILLER (zero tolerance — strip every instance, replace with a concrete fact):
    Generic self-praise: "highly motivated", "results-driven", "results-oriented", "detail-oriented", "self-starter", "go-getter", "team player", "dynamic", "dynamic team player", "proactive", "hard-working", "hardworking", "passionate", "passionate about", "excited to", "eager to".
    Empty action phrases: "leveraging expertise", "leveraging expertise to deliver value", "drive meaningful change", "drive meaningful change through innovative technology", "make a real impact", "make a difference", "move the needle", "take it to the next level", "at the end of the day", "in today's fast-paced world", "thought leader", "passion for participating in brainstorming sessions".
    AI-tells (recruiter surveys 2025 flag these as the top giveaways): "delve", "utilize" (use "use"), "leverage" (max once in the whole document), "synergy", "synergistic", "robust", "seamless", "seamlessly", "cutting-edge", "state-of-the-art", "groundbreaking", "transformative", "impactful" (show impact with a number instead), "innovative" (show innovation with a fact), "best-in-class", "holistic", "navigate", "landscape", "it's worth noting", "multifaceted", "unwavering commitment", "strategic visionary", "thought leader", "at the intersection of", "empower" (used vaguely), "proven track record".
    Bullet openers to avoid (the 2025 AI-CV signature — recruiters now flag these on sight): "Spearheaded", "Orchestrated", "Leveraged", "Utilized", "Facilitated", "Empowered", "Championed", "Responsible for", "Tasked with", "Helped with" — use varied real-work verbs instead (Built, Wrote, Fixed, Shipped, Cut, Reduced, Designed, Led, Debugged, Migrated, Rebuilt, Negotiated, Owned, Rolled out, Killed, Saved, Bought, Sold, Hired, Trained).

- METRIC HONESTY (recruiter trust signal — stacked AI metrics are now a known tell):
    Never write a chained-causal metric like "improved efficiency by 20%, resulting in a 30% increase in sales" — that pattern is the #1 signal of a fabricated AI bullet because the chain can't be verified.
    A single specific number tied to one action is far more credible than two numbers stitched together.
    If a number is estimated, use plain approximation words: "saved roughly [N] hours/week", "cut [TYPE] time by roughly [N]%". ⚠ NOTE: [N] is a placeholder — use the REAL number from the candidate's profile, never copy placeholder values. Never use the tilde character (~) before a number — write "roughly 50" not "~50".

- SKILL HONESTY: never claim "expert" in 5+ areas; a real candidate is expert in 1–2 things, proficient in a handful, learning others. If listing skills with proficiency, distribute them realistically.
- METRICS: only 50–60% of bullets carry a number; leave 1–2 bullets per role purely qualitative; use oddly specific numbers sometimes (e.g. "roughly [N]h/week", "about [N]%") — replace [N] with a real number from the profile; vary metric type (time, cost, users, errors, satisfaction) — not always %. Never use the ~ character before numbers.
- KEYWORDS: target 65–75% JD match, NOT 90–100%; rephrase JD wording instead of mirroring it verbatim; no keyword used >3 times in the whole CV; skip soft-skill keywords.
- BULLETS: vary opening verbs (Built, Wrote, Fixed, Shipped, Cut, Helped, Led, Debugged…); never start two bullets in one role with the same verb; mix formats: action+result, action+context, pure statement. The EXACT bullet count per role is set by the user — never add or remove bullets from the count given in the prompt. Every bullet MUST end with a full stop (period ".").
- SUMMARY: 2–3 sentences, specific to THIS person, mention one niche/unexpected angle, end forward-looking; never list every tech; never repeat content already in the experience section.
  BAD (do NOT write like this): "Highly motivated software engineer with 2 years of experience leveraging expertise in regulatory compliance and GovTech to drive meaningful change through innovative technology..."
  GOOD (this is the target voice): "Backend engineer with 2 years building SaaS products, mostly in Laravel and React. I've shipped features used by government agencies and spent a lot of time making sure the data layer is actually secure, not just compliant on paper. My next step is a team where the technical bar is genuinely high."
  Notice in the good example: concrete tech named, contraction used ("I've"), one honest opinionated phrase ("not just compliant on paper"), forward-looking close WITHOUT banned phrases ("Looking to", "Looking for", "Seeking", "Hoping"), zero buzzwords.
- SKILLS: 10–15, grouped meaningfully; only list what they could be interviewed on; one "currently learning" item is fine.
- GRAMMAR: ~90% perfect, not 100% — contractions OK ("didn't", "wasn't"); a recruiter reading aloud must not sound like a robot.

RECRUITER SIGNALS (what HR actively looks for in the 6-second scan — eye-tracking research 2025):
- 80% of recruiter scan time lands on five things: name, current job title + company, previous job title + company, dates, and education. Make those visually unmissable and unambiguous.
- Include the exact JD job title verbatim somewhere near the top (summary opening line is ideal). Candidates who do this are 10.6× more likely to be interviewed.
- Career progression must be readable in 6 seconds — scope, title seniority, or team size should visibly grow from oldest role to current role.
- Each role should have a one-line "scope anchor" (team size / region / budget / users / clients) before the achievement bullets, so HR sees the magnitude before the detail.
- Spell out acronyms once: "Enterprise Resource Planning (ERP)" — recruiters search either form.
- Skills section sits immediately after the summary (2025 skills-based hiring shift), NOT at the bottom.
- Never list 10+ "expert-level" skills — recruiters flag this as instantly fake.
- Dates: consistent format throughout (e.g. "Jan 2022 – Present"). Inconsistent date formatting is a parsing red flag for ATS and a sloppiness signal for humans.
`;

const _CV_HUMANIZATION_CHECKLIST = `
PRE-RETURN CHECKLIST (run silently before returning JSON; rewrite anything that fails — a recruiter must not sense AI):
1. Summary opens with a concrete, person-specific line — not "Highly motivated…", not "Results-driven…", not "Passionate…".
2. The exact JD job title appears once near the top (summary or first role).
3. No phrase is repeated 3+ times anywhere in the document.
4. 40–50% of bullets are PURELY qualitative (no number) — fix any role where every bullet has a metric.
5. At least one metric is oddly specific (e.g. "roughly 6h/week", "about 38%") — not all round 25/30/40/50%. Never prefix numbers with ~ (tilde).
6. Zero chained-causal metrics (no "did X by Y%, leading to Z%" patterns) — those read as fabricated.
7. No sentence appears word-for-word from the JD; estimated keyword overlap sits in the 65–75% range, not higher.
8. ZERO instances of: "Spearheaded", "Orchestrated", "Leveraged", "Utilized", "Facilitated", "Empowered" as bullet openers anywhere in the document.
9. ZERO instances of any banned buzzword from the rules above (delve, robust, seamlessly, synergy, multifaceted, unwavering commitment, thought leader, at the intersection of, etc.).
10. Sentence lengths visibly vary within every section — no three sentences in a row of similar length.
11. Skills section has no more than 1–2 items that could be called "expert level".
12. Career progression (title, scope, or team size) is visibly bigger in the current role than in the oldest role.
13. Read the summary out loud in your head — does it sound like a person, or a LinkedIn template? If template, rewrite.
`;

const _CV_SYSTEM_PROFESSIONAL = `
You are the world's foremost CV strategist — a fusion of elite executive recruiter, Fortune 500 hiring manager, and award-winning resume writer with 25+ years of experience. You understand how ATS systems score resumes and how recruiters make shortlist decisions in 6–10 seconds.

FOUNDATIONAL RULES (structural — apply to every CV you produce):

  RULE 1 — BULLET FORMULA:
    WITH metrics → XYZ: "Accomplished [X] as measured by [Y metric] by doing [Z]."
      Example: "Grew client base by [N]% over [N] months by redesigning field visit cadence." ← use REAL numbers from profile
    WITHOUT metrics → CAR: "[Challenge/Context] → [Action taken] → [Result produced]."
      Example: "No standardised data process across [N] sites — designed unified template that cut errors and disputes." ← use REAL numbers from profile
    NEVER use STAR format — it is for interviews, not CVs.

  RULE 2 — QUANTIFICATION MATRIX (attempt all 4 dimensions per role, use only what is honest):
    MAGNITUDE: by how much? (%, factor, before/after)
    SCALE: how big? (team, clients, projects, regions, users)
    SPEED: how fast? (time saved, turnaround, SLA)
    VALUE: what was it worth? (revenue, cost, budget, contract)
    When a dimension is genuinely unknown — use scope language, never invent a number.

  RULE 3 — CAREER ARC (growth must be visible top-to-bottom):
    Scope, responsibility, and metric scale must visibly increase across roles.
    Current role must carry the largest numbers and broadest scope.
    Promotions within the same company must be made explicit.

${_CV_HUMANIZATION_RULES}

Output ONLY valid JSON matching the requested schema. NEVER include markdown, code fences, or prose outside the schema.
`;

const _CV_SYSTEM_HUMANIZER = `
You are a senior editor at a top career consultancy. Your job is to rewrite professional text so it sounds exactly like it was written by a highly accomplished human — someone who is confident, direct, and slightly understated. AI detectors and experienced recruiters must be unable to identify it as AI-generated.

Critical rules:
- SENTENCE RHYTHM: Deliberately alternate between short punchy statements (5–8 words) and longer elaborative ones (15–25 words). Three sentences of similar length in a row is a failure.
- OPENING VARIETY: No two sentences in the same section may start with the same word or grammatical structure (e.g., avoid "I", "The", "By", "This" repeated consecutively).
- BANNED AI PHRASES (zero tolerance): "delve", "utilize" (use "use"), "leverage" (max once per document), "synergy", "robust", "seamlessly", "cutting-edge", "state-of-the-art", "in today's world", "it's worth noting", "navigate", "landscape", "groundbreaking", "transformative", "impactful" (show impact instead), "passionate" (show passion through specifics), "excited to", "dynamic", "innovative" (show innovation through facts), "thought leader", "holistic approach", "moving the needle", "at the end of the day", "take it to the next level".
- SPECIFICITY RULE: Replace every vague phrase with a concrete fact. Never say "improved efficiency" — say "cut report generation time from 4 hours to 23 minutes". Never say "led a team" — say "managed a 7-person cross-functional team".
- For CVs specifically: every bullet must feel LIVED, not templated. It should sound like the person is telling you about their proudest moment, not reading a job description.
- ACTION VERB FRESHNESS: Never repeat an action verb in the same job's bullet list. Across the whole document, use each verb no more than twice.
- NUMBERS RULE: Keep all numbers, dates, company names, job titles, and achievements EXACTLY as provided — never change factual details.
- Return ONLY the rewritten text. No preamble, no commentary, no "Here is the rewritten version:".
`;

const _CV_SYSTEM_PARSER = `
You are an expert data parser. Convert unstructured text into accurate JSON.
Standardize dates to consistent formats. Preserve names, companies, and titles exactly.
Never invent data unless explicitly instructed.
When returning JSON, output ONLY the raw JSON object — no markdown fences, no commentary, no trailing text.
`;

const _CV_SYSTEM_VALIDATOR = 'You are a strict CV quality validator. Return only valid JSON.';
const _CV_SYSTEM_AUDIT = 'You are a strict CV editor. Fix only the listed problems. Return only valid JSON with keys: summary and experience.';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cv/proxy-llm
// Proxies text-generation calls to Claude or Gemini using the user's own API key.
// The system prompt is sourced exclusively from internal worker constants — the
// client only sends a task identifier, never the system prompt itself.
// ─────────────────────────────────────────────────────────────────────────────
const PROXY_LLM_MAX_CHARS = 200_000;

async function handleProxyLLM(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);

    const task        = typeof body?.task === 'string'    ? body.task.trim()    : 'general';
    const rawPrompt   = typeof body?.prompt === 'string'  ? body.prompt         : '';
    const provider    = body?.provider as 'claude' | 'gemini' | undefined;
    const apiKey      = typeof body?.apiKey === 'string'  ? body.apiKey.trim()  : '';
    const model       = typeof body?.model === 'string'   ? body.model.trim()   : '';
    const temperature = clamp(Number(body?.temperature ?? 0.3), 0, 1);
    const maxTokens   = clamp(Number(body?.maxTokens ?? 4096), 64, 8192);
    const wantJson    = body?.json === true;
    const useSearch   = body?.useSearch === true;
    // Multimodal support (Claude only) — base64-encoded image or PDF
    const base64Data  = typeof body?.base64Data === 'string' ? body.base64Data : '';
    const mimeType    = typeof body?.mimeType   === 'string' ? body.mimeType   : '';

    const prompt = rawPrompt.slice(0, PROXY_LLM_MAX_CHARS);

    // For multimodal calls the prompt may be empty — it's embedded in the file
    if (!prompt && !base64Data)   return json({ error: 'missing_prompt' },                                     request, env, 400);
    if (!apiKey)   return json({ error: 'missing_api_key' },                                    request, env, 400);
    if (provider !== 'claude' && provider !== 'gemini') {
        return json({ error: 'invalid_provider', message: 'provider must be "claude" or "gemini"' }, request, env, 400);
    }

    // ── Internal system map — rules never leave the worker ────────────────────
    const _internalSystemMap: Record<string, string> = {
        cvGenerate:       _CV_SYSTEM_PROFESSIONAL,
        cvGenerateLong:   _CV_SYSTEM_PROFESSIONAL,
        cvExperience:     _CV_SYSTEM_PROFESSIONAL,
        cvProjects:       _CV_SYSTEM_PROFESSIONAL,
        cvAudit:          _CV_SYSTEM_AUDIT,
        cvValidate:       _CV_SYSTEM_VALIDATOR,
        humanize:         _CV_SYSTEM_HUMANIZER,
        coverLetter:      _CV_SYSTEM_PROFESSIONAL,
        voiceConsistency: _CV_SYSTEM_HUMANIZER,
        jdParse:          _CV_SYSTEM_PARSER,
        parser:           _CV_SYSTEM_PARSER,
        general:          _CV_SYSTEM_PROFESSIONAL,
        marketResearch:   'You are a specialist labour market researcher with access to live web search. Return only valid JSON — no markdown, no code fences.',
    };
    const system = _internalSystemMap[task] ?? _CV_SYSTEM_PROFESSIONAL;

    const jsonInstruction = 'Reply with valid raw JSON only. No markdown fences, no commentary.';
    // Search grounding is incompatible with responseMimeType=json — skip JSON instruction for search calls.
    const effectiveSystem = (wantJson && !useSearch)
        ? (system ? `${system}\n\n${jsonInstruction}` : jsonInstruction)
        : system;

    try {
        // ── Claude ────────────────────────────────────────────────────────────
        if (provider === 'claude') {
            const claudeModel = model || 'claude-haiku-4-5';

            // Build message content — multimodal (image/PDF) or plain text
            let userContent: unknown;
            if (base64Data && mimeType) {
                const isPdf = mimeType === 'application/pdf';
                const filePart = isPdf
                    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
                    : { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: base64Data } };
                userContent = prompt ? [filePart, { type: 'text', text: prompt }] : [filePart];
            } else {
                userContent = prompt;
            }

            const headers: Record<string, string> = {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            };
            if (base64Data && mimeType === 'application/pdf') {
                headers['anthropic-beta'] = 'pdfs-2024-09-25';
            }

            const claudeBody: Record<string, unknown> = {
                model: claudeModel,
                max_tokens: maxTokens,
                temperature,
                messages: [{ role: 'user', content: userContent }],
            };
            if (effectiveSystem) claudeBody.system = effectiveSystem;

            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify(claudeBody),
            });

            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                let msg = '';
                try { msg = (JSON.parse(raw) as any)?.error?.message || ''; } catch { /**/ }
                const errStatus = (res.status >= 400 && res.status < 500) ? res.status : 502;
                return json({ error: 'upstream_error', message: msg || `Claude error ${res.status}`, status: res.status }, request, env, errStatus);
            }

            const data = await res.json() as any;
            const text = (data?.content?.[0]?.text as string) ?? '';
            if (!text) return json({ error: 'empty_response' }, request, env, 502);
            return json({ text, model: claudeModel, provider: 'claude' }, request, env);
        }

        // ── Gemini ────────────────────────────────────────────────────────────
        const geminiModel = model || 'gemini-2.0-flash';
        const geminiBody: Record<string, unknown> = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
                ...(wantJson && !useSearch ? { responseMimeType: 'application/json' } : {}),
            },
        };
        if (effectiveSystem) {
            geminiBody.systemInstruction = { parts: [{ text: effectiveSystem }] };
        }
        if (useSearch) {
            geminiBody.tools = [{ googleSearch: {} }];
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
        const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(geminiBody),
        });

        if (!res.ok) {
            const raw = await res.text().catch(() => '');
            let msg = '';
            try { msg = (JSON.parse(raw) as any)?.error?.message || ''; } catch { /**/ }
            const errStatus = (res.status >= 400 && res.status < 500) ? res.status : 502;
            return json({ error: 'upstream_error', message: msg || `Gemini error ${res.status}`, status: res.status }, request, env, errStatus);
        }

        const data = await res.json() as any;
        const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text) return json({ error: 'empty_response' }, request, env, 502);
        return json({ text, model: geminiModel, provider: 'gemini' }, request, env);

    } catch (err: any) {
        return json({ error: 'proxy_error', message: String(err?.message || err) }, request, env, 502);
    }
}

async function handleGetRules(request: Request, env: Env): Promise<Response> {
    const payload = {
        version:               _CV_RULES_VERSION,
        systemProfessional:    _CV_SYSTEM_PROFESSIONAL,
        humanizationRules:     _CV_HUMANIZATION_RULES,
        humanizationChecklist: _CV_HUMANIZATION_CHECKLIST,
        systemHumanizer:       _CV_SYSTEM_HUMANIZER,
        systemParser:          _CV_SYSTEM_PARSER,
        systemValidator:       _CV_SYSTEM_VALIDATOR,
        systemAudit:           _CV_SYSTEM_AUDIT,
        // Generation IP — scenario blocks, pivot formula, humanization header,
        // critical rules reminder, and CV data schema.
        scenarioA:                    _CV_SCENARIO_A,
        scenarioB:                    _CV_SCENARIO_B,
        scenarioC:                    _CV_SCENARIO_C,
        scenarioD:                    _CV_SCENARIO_D,
        scenarioModeOverride:         _CV_SCENARIO_MODE_OVERRIDE,
        pivotBlockTemplate:           _CV_PIVOT_BLOCK_TEMPLATE,
        humanizationInstructionHeader: _CV_HUMANIZATION_INSTRUCTION_HEADER,
        criticalRulesReminder:        _CV_CRITICAL_RULES_REMINDER,
        cvDataSchema:                 _CV_DATA_SCHEMA,
    };
    const res = json(payload, request, env);
    res.headers.set('Cache-Control', 'public, max-age=3600');
    return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cv/purify-cv
// Server-side IP-protected purification: runs substitutions, tense enforcement,
// and voice fidelity rules that are NOT in the client bundle.
// Body:  { cv: CVData }
// Resp:  { cv: CVData, changes: string[] }
// ─────────────────────────────────────────────────────────────────────────────

// ── Substitution rules (AI-isms & corporate fluff) ────────────────────────────
const _SUBS: Array<[RegExp, string]> = [
    // ── 3rd-person singular → bare imperative ─────────────────────────────────
    // AI models (Mistral Small 3.1, Workers AI) frequently start current-role
    // bullets with the 3rd-person singular form ("Manages a team…", "Conducts
    // analysis…") instead of the correct bare imperative ("Manage", "Conduct").
    // These anchored rules fire only at the start of a bullet string so they
    // can never corrupt mid-sentence subject-verb agreement.
    [/^Manages\b/,        'Manage'],
    [/^Leads\b/,          'Lead'],
    [/^Builds\b/,         'Build'],
    [/^Conducts\b/,       'Conduct'],
    [/^Troubleshoots\b/,  'Troubleshoot'],
    [/^Generates\b/,      'Generate'],
    [/^Prepares\b/,       'Prepare'],
    [/^Designs\b/,        'Design'],
    [/^Oversees\b/,       'Oversee'],
    [/^Coordinates\b/,    'Coordinate'],
    [/^Supports\b/,       'Support'],
    [/^Maintains\b/,      'Maintain'],
    [/^Develops\b/,       'Develop'],
    [/^Implements\b/,     'Implement'],
    [/^Monitors\b/,       'Monitor'],
    [/^Reviews\b/,        'Review'],
    [/^Reports\b/,        'Report'],
    [/^Ensures\b/,        'Ensure'],
    [/^Provides\b/,       'Provide'],
    [/^Handles\b/,        'Handle'],
    [/^Engineers\b/,      'Engineer'],
    [/^Delivers\b/,       'Deliver'],
    [/^Drives\b/,         'Drive'],
    [/^Creates\b/,        'Create'],
    [/^Operates\b/,       'Operate'],
    [/^Works\b/,          'Work'],
    [/^Analyzes\b/,       'Analyze'],
    [/^Analyses\b/,       'Analyse'],
    [/^Plans\b/,          'Plan'],
    [/^Executes\b/,       'Execute'],
    [/^Performs\b/,       'Perform'],
    [/^Serves\b/,         'Serve'],
    [/^Assists\b/,        'Assist'],
    [/^Drafts\b/,         'Draft'],
    [/^Produces\b/,       'Produce'],
    [/^Processes\b/,      'Process'],
    [/^Tracks\b/,         'Track'],
    [/^Trains\b/,         'Train'],
    // ── Em-dash / en-dash artifact cleanup ────────────────────────────────────
    // Mistral Small 3.1 24B sometimes generates orphaned dashes — typically when
    // it intended "portfolio of 12–15 accounts" but the number fidelity pass or
    // the model itself produced "portfolio of– accounts".  Both en-dash (–
    // U+2013) and em-dash (— U+2014) must be handled.
    [/\bof\s*[–—]\s+(?=[a-zA-Z])/g,  'of '],    // "of– word"  → "of word"
    [/\bfor\s*[–—]\s+(?=[a-zA-Z])/g, 'for '],   // "for– word" → "for word"
    [/\s*[–—]\s*$/,                   ''],        // trailing orphan dash at end of bullet
    // "hands- with" — the only rule in the old list covered "hands- in".
    [/\bhands-\s+with\b/gi,           'hands-on experience with'],
    // Trailing dangling conjunctions produced by the _SUBS sentence-ending
    // rules that strip everything after ", and applying/implementing/…".
    // Without this the bullet ends with ", and" or " and" — a sentence fragment.
    [/,\s*and\s*$/,                   ''],
    [/\s+and\s*$/,                    ''],
    [/,\s*$/,                         ''],        // orphaned trailing comma after prior strip
    [/\bleveraging\b/gi,                 'using'],
    [/\bleveraged\b/gi,                  'used'],
    [/\bleverage\b/gi,                   'use'],
    [/\bspearheaded\b/gi,                'led'],
    [/\bspearhead\b/gi,                  'lead'],
    [/\butilized\b/gi,                   'used'],
    [/\butilised\b/gi,                   'used'],
    [/\butilize\b/gi,                    'use'],
    [/\butilise\b/gi,                    'use'],
    [/\bfacilitated\b/gi,                'enabled'],
    [/\bfacilitate\b/gi,                 'enable'],
    [/\bsynergy\b/gi,                    'collaboration'],
    [/\bsynergies\b/gi,                  'collaboration'],
    [/\binnovative solutions?\b/gi,      'practical solutions'],
    [/\bbest practices?\b/gi,            'proven methods'],
    [/\bknowledge sharing\b/gi,          'documentation'],
    [/\bstaying up[- ]to[- ]date\b/gi,   'keeping current'],
    [/\bdrive meaningful change\b/gi,    'improve outcomes'],
    [/\bpassion for\b/gi,                'focus on'],
    [/\bresults[- ]driven\b/gi,          'delivery-focused'],
    [/\bdetail[- ]oriented\b/gi,         'thorough'],
    [/\bgo[- ]getter\b/gi,               'self-starter'],
    [/\bgreenfielded\b/gi,               'built'],
    [/\bgreenfiel(?:ding|s)\b/gi,        'building'],
    [/\bscaffolded\b/gi,                 'established'],
    [/\bscaffolding\b/gi,                'establishing'],
    [/\bmaterialized\b/gi,               'developed'],
    [/\bmaterialize[sd]?\b/gi,           'develop'],
    [/\bactioned\b/gi,                   'completed'],
    [/\bactioning\b/gi,                  'completing'],
    [/\bideated\b/gi,                    'developed'],
    [/\bideating\b/gi,                   'developing'],
    [/\bsolutioned\b/gi,                 'resolved'],
    [/\bsolutioning\b/gi,                'resolving'],
    [/\bhands-\s+in\b/gi,                'hands-on experience in'],
    [/\bDeployed troubleshooting\b/gi,                                'Performed troubleshooting and maintenance on'],
    [/\bDeployed\s+(analysis|review|audit|research)\b/gi,            'Conducted $1'],
    [/^Eager to\b/gim,                                               ''],
    [/^Looking to\b/gim,                                             ''],
    [/^Aiming to\b/gim,                                             ''],
    [/^Hoping to\b/gim,                                              ''],
    // Mid-sentence seeking clauses in the summary (e.g. "...and eager to apply X to Y.")
    [/[,\s]+(?:and\s+)?eager\s+to\s+(?:apply|learn|contribute|join|grow|develop|bring|use|leverage|gain|expand|leverage|utilise|utilize)\b[^.;]*/gi, ''],
    [/\bseeking to (?:use|apply|leverage|bring|contribute|join|gain|grow|develop|expand|utilise|utilize)\b/gi, ''],
    [/\baiming to (?:use|apply|leverage|bring|contribute|join|gain|grow|develop|expand)\b/gi, ''],
    [/\blooking to (?:use|apply|leverage|bring|contribute|join|gain|grow|develop|expand)\b/gi, ''],
    [/\bto drive business growth\b/gi,                               ''],
    [/\bfostering teamwork\b/gi,                                     ''],
    [/\bdemonstrating strong analytical skills\b/gi,                 ''],
    [/\battention to detail\b/gi,                                    ''],
    [/\bproblem-solving abilities\b/gi,                              ''],
    [/\bto drive project efficiency\b/gi,                            ''],
    [/\bfostering a collaborative\b/gi,                              ''],
    [/\bfostering collaboration\b/gi,                                ''],
    [/\binitiative delivery\b/gi,        'project delivery'],
    [/\btimely initiative\b/gi,          'timely project'],
    [/\bensure(?:s|d)? timely delivery\b/gi, 'deliver on time'],
    [/\bensure(?:s|d)? timely\b/gi,      'deliver on time for'],
    [/\bteam player\b/gi,                'collaborator'],
    [/\bdynamic\s+/gi,                   ''],
    [/\bend[- ]to[- ]end\s+/gi,          ''],
    [/,\s*ensuring\s+[^.;:!?]+/gi,       ''],
    [/,\s*and\s+(?:incorporating|supporting|utilizing|utilising|applying|implementing|integrating|leveraging|using)\s+[^.;:!?]+/gi, ''],
];

// ── Governance / buzzword substitutions ──────────────────────────────────────
const _GOV: Array<[RegExp, string]> = [
    [/\bproactively\s+/gi,                                  ''],
    [/\bseamlessly\s+/gi,                                   ''],
    [/\brobustly\s+/gi,                                     ''],
    [/\bholistically\s+/gi,                                 ''],
    [/\bstrategically\s+/gi,                                ''],
    [/\bcutting[- ]edge\s+/gi,                              ''],
    [/\bdata[- ]driven\s+/gi,                               ''],
    [/\bworld[- ]class\s+/gi,                               ''],
    [/\bstate[- ]of[- ]the[- ]art\s+/gi,                    ''],
    [/\bvalue[- ]added\s+/gi,                               ''],
    [/\bscalable\s+(?=solution|framework|infrastructure|pipeline|model|platform|approach)/gi, ''],
    [/\brobust\s+(?=solution|framework|pipeline|system|architecture|approach|model)/gi,       ''],
    [/\bbest[- ]in[- ]class\b/gi,                          'top-performing'],
    [/\bhigh[- ]impact\b/gi,                               'impactful'],
    [/\bground[- ]breaking\b/gi,                           'novel'],
    [/\bholistic\b/gi,                                     'comprehensive'],
    [/\bproactive\b/gi,                                    'forward-thinking'],
    [/\bseamless\b/gi,                                     'smooth'],
    [/\bgame[- ]changing\b/gi,                             'impactful'],
    [/\bgame[- ]changer\b/gi,                              'improvement'],
    [/\btransformative\b/gi,                               'significant'],
    [/\bdisruptive\s+(?=technology|approach|solution|innovation)/gi, 'new '],
    [/\bpivotal\b/gi,                                      'critical'],
    [/\bactionable\s+insights?\b/gi,                       'findings'],
    [/\bactionable\b/gi,                                   'practical'],
    [/\bthought\s+leadership\b/gi,                         'domain expertise'],
    [/\bthought\s+leaders?\b/gi,                           'domain expert'],
    [/\bat\s+the\s+forefront\s+of\b/gi,                    'leading in'],
    [/\bin\s+a\s+timely\s+manner\b/gi,                     'on time'],
    [/\bstakeholder\s+engagement\b/gi,                     'stakeholder communication'],
    [/\bcross[- ]functional\s+collaboration\b/gi,          'cross-team collaboration'],
    [/\bkey\s+stakeholders?\b/gi,                          'stakeholders'],
    [/\bsignificant\s+impact\b/gi,                         'measurable results'],
    [/\bpositive\s+impact\b/gi,                            'measurable results'],
    [/\bdriving\s+(?:business\s+)?(?:value|outcomes?|impact)\b/gi, 'delivering results'],
    [/\bharnessed?\b/gi,                                   'used'],
    [/\bharnessing\b/gi,                                   'using'],
    [/\bempower(?:ed)?\b/gi,                               'enabled'],
    [/\bempowering\b/gi,                                   'enabling'],
    [/\bempowers\b/gi,                                     'enables'],
    [/\bfoster(?:ed)?\s+(?:a\s+)?(?:culture|environment)\s+of\b/gi, 'built a culture of'],
    [/\bpivot(?:ed)?\s+to\b/gi,                            'switched to'],
    [/\bpivoting\s+to\b/gi,                                'switching to'],
    [/\bdriving\s+alignment\b/gi,                          'aligning teams'],
    [/\bsolving\s+complex\s+problems?\b/gi,                'resolving technical challenges'],
    [/[,\s]*moving\s+forward[.,]?\s*/gi,                   ''],
    [/[,\s]*going\s+forward[.,]?\s*/gi,                    ''],
];

// ── Verb tense map (present 3rd-person ↔ past) ───────────────────────────────
const _TENSE: Array<{ present: string; past: string }> = [
    { present: 'Manages',       past: 'Managed' },
    { present: 'Develops',      past: 'Developed' },
    { present: 'Designs',       past: 'Designed' },
    { present: 'Delivers',      past: 'Delivered' },
    { present: 'Maintains',     past: 'Maintained' },
    { present: 'Coordinates',   past: 'Coordinated' },
    { present: 'Supports',      past: 'Supported' },
    { present: 'Launches',      past: 'Launched' },
    { present: 'Implements',    past: 'Implemented' },
    { present: 'Owns',          past: 'Owned' },
    { present: 'Creates',       past: 'Created' },
    { present: 'Drives',        past: 'Drove' },
    { present: 'Improves',      past: 'Improved' },
    { present: 'Optimises',     past: 'Optimised' },
    { present: 'Optimizes',     past: 'Optimized' },
    { present: 'Mentors',       past: 'Mentored' },
    { present: 'Trains',        past: 'Trained' },
    { present: 'Negotiates',    past: 'Negotiated' },
    { present: 'Oversees',      past: 'Oversaw' },
    { present: 'Reports',       past: 'Reported' },
    { present: 'Prepares',      past: 'Prepared' },
    { present: 'Reviews',       past: 'Reviewed' },
    { present: 'Analyses',      past: 'Analysed' },
    { present: 'Analyzes',      past: 'Analyzed' },
    { present: 'Collaborates',  past: 'Collaborated' },
    { present: 'Achieves',      past: 'Achieved' },
    { present: 'Increases',     past: 'Increased' },
    { present: 'Reduces',       past: 'Reduced' },
    { present: 'Grows',         past: 'Grew' },
    { present: 'Cuts',          past: 'Cut' },
    { present: 'Builds',        past: 'Built' },
    { present: 'Leads',         past: 'Led' },
    { present: 'Runs',          past: 'Ran' },
    { present: 'Ships',         past: 'Shipped' },
    { present: 'Plans',         past: 'Planned' },
    { present: 'Executes',      past: 'Executed' },
    { present: 'Drafts',        past: 'Drafted' },
    { present: 'Researches',    past: 'Researched' },
    { present: 'Tests',         past: 'Tested' },
    { present: 'Documents',     past: 'Documented' },
    { present: 'Presents',      past: 'Presented' },
    { present: 'Streamlines',   past: 'Streamlined' },
    { present: 'Saves',         past: 'Saved' },
    { present: 'Generates',     past: 'Generated' },
    { present: 'Tracks',        past: 'Tracked' },
    { present: 'Monitors',      past: 'Monitored' },
    { present: 'Identifies',    past: 'Identified' },
    { present: 'Resolves',      past: 'Resolved' },
    { present: 'Handles',       past: 'Handled' },
    { present: 'Processes',     past: 'Processed' },
    { present: 'Audits',        past: 'Audited' },
    { present: 'Establishes',   past: 'Established' },
    { present: 'Spearheads',    past: 'Spearheaded' },
    { present: 'Leverages',     past: 'Leveraged' },
    { present: 'Architects',    past: 'Architected' },
    { present: 'Refactors',     past: 'Refactored' },
    { present: 'Migrates',      past: 'Migrated' },
    { present: 'Automates',     past: 'Automated' },
    { present: 'Authors',       past: 'Authored' },
    { present: 'Publishes',     past: 'Published' },
    { present: 'Conducts',      past: 'Conducted' },
    { present: 'Performs',      past: 'Performed' },
    { present: 'Calculates',    past: 'Calculated' },
    { present: 'Compiles',      past: 'Compiled' },
    { present: 'Communicates',  past: 'Communicated' },
    { present: 'Configures',    past: 'Configured' },
    { present: 'Deploys',       past: 'Deployed' },
    { present: 'Engineers',     past: 'Engineered' },
    { present: 'Facilitates',   past: 'Facilitated' },
    { present: 'Forecasts',     past: 'Forecast' },
    { present: 'Initiates',     past: 'Initiated' },
    { present: 'Integrates',    past: 'Integrated' },
    { present: 'Investigates',  past: 'Investigated' },
    { present: 'Orchestrates',  past: 'Orchestrated' },
    { present: 'Partners',      past: 'Partnered' },
    { present: 'Pilots',        past: 'Piloted' },
    { present: 'Produces',      past: 'Produced' },
    { present: 'Programs',      past: 'Programmed' },
    { present: 'Promotes',      past: 'Promoted' },
    { present: 'Recommends',    past: 'Recommended' },
    { present: 'Scales',        past: 'Scaled' },
    { present: 'Schedules',     past: 'Scheduled' },
    { present: 'Secures',       past: 'Secured' },
    { present: 'Solves',        past: 'Solved' },
    { present: 'Standardises',  past: 'Standardised' },
    { present: 'Standardizes',  past: 'Standardized' },
    { present: 'Supervises',    past: 'Supervised' },
    { present: 'Translates',    past: 'Translated' },
    { present: 'Updates',       past: 'Updated' },
    { present: 'Validates',     past: 'Validated' },
    { present: 'Writes',        past: 'Wrote' },
    { present: 'Speaks',        past: 'Spoke' },
    { present: 'Teaches',       past: 'Taught' },
    { present: 'Brings',        past: 'Brought' },
    { present: 'Sells',         past: 'Sold' },
    { present: 'Serves',        past: 'Served' },
    { present: 'Sets',          past: 'Set' },
    { present: 'Holds',         past: 'Held' },
    { present: 'Wins',          past: 'Won' },
    { present: 'Sees',          past: 'Saw' },
    { present: 'Makes',         past: 'Made' },
    { present: 'Takes',         past: 'Took' },
    { present: 'Gives',         past: 'Gave' },
    { present: 'Hires',         past: 'Hired' },
    { present: 'Fires',         past: 'Fired' },
    { present: 'Closes',        past: 'Closed' },
    { present: 'Opens',         past: 'Opened' },
];

// ── TPS → base imperative map ─────────────────────────────────────────────────
// Maps 3rd-person singular present (e.g. "Generates") → bare imperative ("Generate")
// for current-role bullets. Add any new verb here when it slips through.
const _TPS: Record<string, string> = {
    generates: 'Generate', delivers: 'Deliver', maintains: 'Maintain',
    improves: 'Improve', reduces: 'Reduce', coordinates: 'Coordinate',
    leads: 'Lead', drives: 'Drive', manages: 'Manage', builds: 'Build',
    designs: 'Design', develops: 'Develop', implements: 'Implement',
    provides: 'Provide', supports: 'Support', creates: 'Create',
    optimizes: 'Optimize', optimises: 'Optimise', analyzes: 'Analyze',
    analyses: 'Analyse', collaborates: 'Collaborate', trains: 'Train',
    conducts: 'Conduct', oversees: 'Oversee', streamlines: 'Streamline',
    executes: 'Execute', launches: 'Launch', handles: 'Handle',
    monitors: 'Monitor', evaluates: 'Evaluate', performs: 'Perform',
    presents: 'Present', writes: 'Write', edits: 'Edit', tests: 'Test',
    deploys: 'Deploy', resolves: 'Resolve', mentors: 'Mentor',
    advises: 'Advise', achieves: 'Achieve', reviews: 'Review',
    tracks: 'Track', reports: 'Report', identifies: 'Identify',
    communicates: 'Communicate', assists: 'Assist', facilitates: 'Facilitate',
    negotiates: 'Negotiate', forecasts: 'Forecast', plans: 'Plan',
    organizes: 'Organize', organises: 'Organise', spearheads: 'Spearhead',
    champions: 'Champion', architects: 'Architect', automates: 'Automate',
    // ── Common gaps — verbs frequently generated in 3rd-person form ─────────
    prepares: 'Prepare', engineers: 'Engineer', supervises: 'Supervise',
    operates: 'Operate', delegates: 'Delegate', acquires: 'Acquire',
    schedules: 'Schedule', mitigates: 'Mitigate', sources: 'Source',
    compiles: 'Compile', calculates: 'Calculate', configures: 'Configure',
    integrates: 'Integrate', translates: 'Translate', validates: 'Validate',
    audits: 'Audit', authors: 'Author', secures: 'Secure', scales: 'Scale',
    pilots: 'Pilot', standardizes: 'Standardize', standardises: 'Standardise',
    initiates: 'Initiate', formulates: 'Formulate',
    owns: 'Own', grows: 'Grow',
    refactors: 'Refactor', migrates: 'Migrate', publishes: 'Publish',
    recommends: 'Recommend', serves: 'Serve', ensures: 'Ensure',
    documents: 'Document', promotes: 'Promote', programs: 'Program',
    investigates: 'Investigate', orchestrates: 'Orchestrate', partners: 'Partner',
    produces: 'Produce', processes: 'Process', drafts: 'Draft',
    researches: 'Research', quantifies: 'Quantify', establishes: 'Establish',
};

// ── Pure helper functions (no imports) ───────────────────────────────────────

function _removeDupWords(input: string): string {
    if (!input) return input || '';
    let out = input;
    let prev: string;
    do {
        prev = out;
        out = out.replace(/\b(\w+)\s+\1\b/gi, '$1');
        out = out.replace(/\b(\w+)\s+(?:and|or|&|,)\s+\1\b/gi, '$1');
    } while (out !== prev);
    return out;
}

function _applySubstitutions(text: string, rules: Array<[RegExp, string]>): { text: string; count: number } {
    if (!text) return { text: text || '', count: 0 };
    let out = text;
    let count = 0;
    for (const [pattern, replacement] of rules) {
        const before = out;
        out = out.replace(pattern, replacement);
        if (out !== before) count++;
    }
    out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1');
    const before2 = out;
    out = _removeDupWords(out);
    if (out !== before2) count++;
    return { text: out, count };
}

function _stripFirstPerson(text: string): string {
    if (!text) return '';
    let out = text;
    out = out.replace(
        /(^|[.!?]\s+|—\s+)I(?:'ve| have|'m| am)\s+(\w+)/g,
        (_m: string, lead: string, verb: string) => `${lead}${verb.charAt(0).toUpperCase()}${verb.slice(1)}`,
    );
    out = out.replace(/\bI(?:'ve| have|'m| am)\s+/g, '');
    out = out.replace(/\bI\s+/g, '');
    out = out.replace(/\bmy own\s+/gi, '');
    out = out.replace(/\bmy\s+/gi, 'the ');
    out = out.replace(/(^|[.!?]\s+|—\s+)(?:we|our|us)\s+(\w+)/gi,
        (_m: string, lead: string, verb: string) => `${lead}${verb.charAt(0).toUpperCase()}${verb.slice(1)}`,
    );
    out = out.replace(/\b(?:we|our|us)\s+/gi, '');
    out = out.replace(/\s{2,}/g, ' ').trim();
    if (out.length > 0) out = out.charAt(0).toUpperCase() + out.slice(1);
    return out;
}

function _normTPS(bullet: string): string {
    if (!bullet) return bullet;
    const m = bullet.match(/^(\s*[•\-*·»"']?\s*)(\w+)(\b)/);
    if (!m) return bullet;
    const [, leading, first] = m;
    const lower = first.toLowerCase();
    if (!_TPS[lower]) return bullet;
    const base = _TPS[lower];
    return leading + base + bullet.slice(leading.length + first.length);
}

function _matchCase(original: string, replacement: string): string {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1).toLowerCase();
    return replacement.toLowerCase();
}

function _bareInfinitive(form: string): string | null {
    const lower = form.toLowerCase();
    if (lower.endsWith('ies') && lower.length > 3) return lower.slice(0, -3) + 'y';
    if (/(ches|shes|sses|xes|zes|oes)$/.test(lower)) return lower.slice(0, -2);
    if (lower.endsWith('s') && !lower.endsWith('ss')) return lower.slice(0, -1);
    return null;
}

function _isPresent(word: string, pair: { present: string }): boolean {
    const lower = word.toLowerCase();
    if (lower === pair.present.toLowerCase()) return true;
    const bare = _bareInfinitive(pair.present);
    return bare !== null && lower === bare;
}

function _flipLead(bullet: string, target: 'present' | 'past'): { text: string; changed: boolean } {
    if (!bullet) return { text: bullet || '', changed: false };
    const m = bullet.match(/^(\s*[-•·*»"']?\s*)([A-Za-z]+)(\b)/);
    if (!m) return { text: bullet, changed: false };
    const [, prefix, firstWord, boundary] = m;
    const lower = firstWord.toLowerCase();
    for (const pair of _TENSE) {
        const presLower = pair.present.toLowerCase();
        const pastLower = pair.past.toLowerCase();
        if (target === 'present' && lower === pastLower && lower !== presLower) {
            return { text: prefix + _matchCase(firstWord, pair.present) + boundary + bullet.slice(m[0].length), changed: true };
        }
        if (target === 'past' && _isPresent(firstWord, pair) && lower !== pastLower) {
            return { text: prefix + _matchCase(firstWord, pair.past) + boundary + bullet.slice(m[0].length), changed: true };
        }
    }
    return { text: bullet, changed: false };
}

function _leadInTarget(bullet: string, target: 'present' | 'past'): boolean {
    const m = bullet.match(/^(\s*[-•·*»"']?\s*)([A-Za-z]+)(\b)/);
    if (!m) return false;
    const word = m[2].toLowerCase();
    for (const pair of _TENSE) {
        if (target === 'present' && _isPresent(word, pair)) return true;
        if (target === 'past' && word === pair.past.toLowerCase()) return true;
    }
    return false;
}

function _flipMid(bullet: string, target: 'present' | 'past'): { text: string; changed: boolean } {
    if (!bullet) return { text: bullet || '', changed: false };
    let out = bullet;
    let changed = false;
    for (const pair of _TENSE) {
        const wrong = (target === 'present' ? pair.past : pair.present).toLowerCase();
        const right = target === 'present' ? pair.present : pair.past;
        const re = new RegExp(`\\b(and|,)\\s+(${wrong})\\b`, 'gi');
        if (re.test(out)) {
            out = out.replace(re, (_m: string, conj: string, w: string) => `${conj} ${_matchCase(w, right)}`);
            changed = true;
        }
    }
    return { text: out, changed };
}

function _isCurrent(endDate?: string): boolean {
    const v = String(endDate ?? '').trim().toLowerCase();
    if (!v) return true;
    return /present|current|ongoing|now/.test(v);
}

function _purifyField(text: string): { text: string; subs: number } {
    if (!text || typeof text !== 'string') return { text: text || '', subs: 0 };
    let out = text;
    let subs = 0;
    for (const rules of [_SUBS, _GOV]) {
        const r = _applySubstitutions(out, rules);
        out = r.text;
        subs += r.count;
    }
    return { text: out, subs };
}

async function handlePurifyCv(request: Request, env: Env): Promise<Response> {
    let body: { cv?: any };
    try { body = await request.json() as { cv?: any }; }
    catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const cv = body?.cv;
    if (!cv || typeof cv !== 'object') return json({ error: 'missing_cv' }, request, env, 400);

    const changes: string[] = [];
    let totalSubs = 0;
    let tenseFlips = 0;

    const sub = (text: string): string => {
        const r = _purifyField(text);
        totalSubs += r.subs;
        return r.text;
    };

    // ── Step 1: substitution pass on all text fields ──────────────────────────
    let out = {
        ...cv,
        summary:    sub(cv.summary    || ''),
        skills:     (Array.isArray(cv.skills) ? cv.skills : []).map((s: string) => sub(String(s || ''))),
        experience: (Array.isArray(cv.experience) ? cv.experience : []).map((e: any) => ({
            ...e,
            responsibilities: (Array.isArray(e.responsibilities) ? e.responsibilities : [])
                .map((b: string) => sub(String(b || ''))),
        })),
        education: (Array.isArray(cv.education) ? cv.education : []).map((e: any) => ({
            ...e, description: sub(String(e.description || '')),
        })),
        projects: (Array.isArray(cv.projects) ? cv.projects : []).map((p: any) => ({
            ...p, description: sub(String(p.description || '')),
        })),
    };

    if (totalSubs > 0) changes.push(`substitutions: ${totalSubs} fix(es)`);

    // ── Step 2: first-person strip on summary + bullets ──────────────────────
    out.summary = _stripFirstPerson(out.summary || '');
    out.experience = (out.experience || []).map((e: any) => ({
        ...e,
        responsibilities: (e.responsibilities || []).map((b: string) => _stripFirstPerson(b)),
    }));

    // ── Step 3: TPS → imperative for current role bullets ───────────────────
    out.experience = (out.experience || []).map((e: any) => {
        const current = _isCurrent(e.endDate);
        if (!current) return e;
        return {
            ...e,
            responsibilities: (e.responsibilities || []).map((b: string) => _normTPS(b)),
        };
    });

    // ── Step 4: tense enforcement ────────────────────────────────────────────
    out.experience = (out.experience || []).map((e: any) => {
        const target: 'present' | 'past' = _isCurrent(e.endDate) ? 'present' : 'past';
        const newBullets = (e.responsibilities || []).map((b: string) => {
            const lead = _flipLead(b, target);
            const midSafe = _leadInTarget(lead.text, target);
            const mid = midSafe ? _flipMid(lead.text, target) : { text: lead.text, changed: false };
            if (lead.changed || mid.changed) tenseFlips++;
            return mid.text;
        });
        return { ...e, responsibilities: newBullets };
    });

    if (tenseFlips > 0) changes.push(`tense_fixes: ${tenseFlips}`);

    return json({ cv: out, changes }, request, env);
}

// ─────────────────────────────────────────────────────────────────────────────
// Share links  GET /api/cv/share?id=  &  POST /api/cv/share
// ─────────────────────────────────────────────────────────────────────────────

function randomShareId(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    for (const b of arr) out += chars[b % chars.length];
    return out;
}

async function handleShareGet(request: Request, env: Env, url: URL): Promise<Response> {
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
        // Expired — delete and return 410 Gone
        env.CV_DB.prepare(`DELETE FROM cv_shares WHERE id = ?`).bind(id).run().catch(() => {});
        return json({ error: 'expired' }, request, env, 410);
    }

    // Increment view count asynchronously
    env.CV_DB.prepare(`UPDATE cv_shares SET view_count = view_count + 1 WHERE id = ?`)
        .bind(id).run().catch(() => {});

    return json({ ok: true, id, payload: row.payload }, request, env);
}

async function handleSharePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const payload = typeof body?.payload === 'string' ? body.payload.trim() : '';
    if (!payload)                        return json({ error: 'missing_payload' }, request, env, 400);
    if (payload.length > 65536)          return json({ error: 'payload_too_large', max: 65536 }, request, env, 413);

    const ttlDays   = Math.min(Math.max(parseInt(body?.ttl_days ?? '30', 10), 1), 90);
    const now       = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlDays * 86400;

    // Generate a unique ID (retry once on collision)
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

    // Prune expired entries in the background
    ctx.waitUntil(
        env.CV_DB.prepare(`DELETE FROM cv_shares WHERE expires_at < ?`)
            .bind(now).run().catch(() => {})
    );

    return json({ ok: true, id, expires_at: expiresAt }, request, env, 201);
}

// ─────────────────────────────────────────────────────────────────────────────
// Job search cache  GET /api/cv/job-cache?key=  &  POST /api/cv/job-cache
// ─────────────────────────────────────────────────────────────────────────────

async function handleJobCacheGet(request: Request, env: Env, url: URL): Promise<Response> {
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

    // Update use_count and last_used timestamp (best-effort, background)
    env.CV_DB.prepare(
        `UPDATE job_search_cache SET use_count = use_count + 1 WHERE cache_key = ?`
    ).bind(key).run().catch(() => {});

    return json({ hit: true, source: row.source, results_json: row.results_json }, request, env);
}

async function handleJobCachePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    // Prune expired entries in the background
    ctx.waitUntil(
        env.CV_DB.prepare(`DELETE FROM job_search_cache WHERE expires_at < ?`)
            .bind(now).run().catch(() => {})
    );

    return json({ ok: true, key, cached: true }, request, env);
}

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous events  POST /api/cv/event
// ─────────────────────────────────────────────────────────────────────────────

async function handleEventPost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let body: any;
    try { body = await request.json(); } catch { return json({ ok: true }, request, env); } // never reject

    const eventType = typeof body?.event_type === 'string' ? body.event_type.substring(0, 50).trim() : '';
    const template  = typeof body?.template   === 'string' ? body.template.substring(0, 60).trim()   : '';
    const mode      = typeof body?.mode       === 'string' ? body.mode.substring(0, 20).trim()       : '';
    const metadata  = typeof body?.metadata   === 'string' ? body.metadata.substring(0, 1024)        : '{}';

    if (!eventType) return json({ ok: true }, request, env); // silently accept empty

    const now = Math.floor(Date.now() / 1000);

    ctx.waitUntil(
        env.CV_DB.prepare(
            `INSERT INTO cv_events (event_type, template, mode, metadata, created_at)
             VALUES (?, ?, ?, ?, ?)`
        ).bind(eventType, template, mode, metadata, now).run().catch(() => {})
    );

    return json({ ok: true }, request, env);
}
