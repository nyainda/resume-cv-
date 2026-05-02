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

        try {
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

            if (url.pathname === '/api/cv/market-research' && request.method === 'GET')  return handleMarketResearchCacheGet(request, env, url);
            if (url.pathname === '/api/cv/market-research' && request.method === 'POST') return handleMarketResearchCachePost(request, env, ctx);

            return json({ error: 'not_found', path: url.pathname }, request, env, 404);
        } catch (err: any) {
            return json({ error: 'internal_error', message: String(err?.message || err) }, request, env, 500);
        }
    },

    async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(runLeakPromotionCron(env));
    },
} satisfies ExportedHandler<Env>;

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

    // 5. Whitespace cleanup
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

    // 2. Field detection: score JD against each field's jd_keywords
    const haystack = `${jd} ${stringify(profile)}`.toLowerCase();
    const fieldScores: Array<{ field: string; score: number; row: any }> = (fieldRows || []).map(f => {
        if (explicitField && f.field === explicitField) return { field: f.field, score: 9999, row: f };
        const kws: string[] = Array.isArray(f.jd_keywords) ? f.jd_keywords : [];
        let score = 0;
        for (const kw of kws) {
            const re = new RegExp(`\\b${escapeRegex(String(kw).toLowerCase())}\\b`, 'g');
            const m = haystack.match(re);
            if (m) score += m.length;
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
    // GLM 4.7 Flash is the workhorse: 131K context, fast, free, multilingual.
    // It handles the two heaviest tasks (experience bullets, full CV JSON) so
    // Neurons are never spent on the critical path.
    cvGenerate:           { model: '@cf/zai-org/glm-4.7-flash',                    tier: 2, free: true,  description: 'Main CV JSON generation — GLM 4.7 Flash 131K (FREE)' },
    cvGenerateLong:       { model: '@cf/zai-org/glm-4.7-flash',                    tier: 2, free: true,  description: 'Long-context CV generation — GLM 4.7 Flash 131K (FREE)' },
    cvExperience:         { model: '@cf/zai-org/glm-4.7-flash',                    tier: 2, free: true,  description: 'CV experience bullets — GLM 4.7 Flash 131K (FREE, strong instruction following)' },
    cvProjects:           { model: '@cf/zai-org/glm-4.7-flash',                    tier: 2, free: true,  description: 'CV projects section — GLM 4.7 Flash (FREE)' },
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
    multilingualGenerate: { model: '@cf/zai-org/glm-4.7-flash',                    tier: 2, free: true,  description: 'Multilingual CV text generation — GLM 4.7 Flash (FREE, 100+ languages)' },

    // ── Tier 3: Fast validation — ultra-light FREE models, burn without worry ──
    // Each check runs independently and in parallel with the main generation.
    bannedCheck:          { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Banned phrase check — Llama 3.2 3B (FREE, fast)' },
    tenseCheck:           { model: '@cf/meta/llama-3.2-3b-instruct',               tier: 3, free: true,  description: 'Tense consistency enforcement — Llama 3.2 3B (FREE, fast)' },
    voiceConsistency:     { model: '@cf/zai-org/glm-4.7-flash',                    tier: 3, free: true,  description: 'Voice consistency per bullet — GLM 4.7 Flash (FREE, stronger than 7B)' },
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

    const taskKey  = typeof body?.task === 'string' ? body.task.trim() : 'general';
    const system   = typeof body?.system === 'string' ? body.system.slice(0, TIERED_LLM_MAX_SYSTEM_CHARS) : '';
    const prompt   = typeof body?.prompt === 'string' ? body.prompt.slice(0, TIERED_LLM_MAX_PROMPT_CHARS) : '';

    if (!prompt) return json({ error: 'missing_prompt' }, request, env, 400);

    const mapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
    const { model, tier, free, description } = mapping;

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
        const mapping = TIERED_MODEL_MAP[taskKey] ?? TIERED_MODEL_MAP['general'];
        const { model, tier, free, description } = mapping;

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

    const system      = typeof body?.system === 'string' ? body.system.slice(0, TIERED_LLM_MAX_SYSTEM_CHARS) : '';
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
// Market research cache — GET /api/cv/market-research?key=<hex>
// ─────────────────────────────────────────────────────────────────────────────
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
