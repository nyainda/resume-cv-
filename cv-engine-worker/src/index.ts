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
    async fetch(request: Request, env: Env): Promise<Response> {
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
            if (url.pathname === '/api/cv/brief'   && request.method === 'POST') return handleBrief(request, env);
            if (url.pathname === '/api/cv/sync'    && request.method === 'POST') return handleSync(request, env);
            if (url.pathname === '/api/cv/admin/stats')                          return handleAdminStats(request, env);
            if (url.pathname === '/api/cv/admin/bulk-add' && request.method === 'POST') return handleBulkAdd(request, env);
            if (url.pathname === '/api/cv/admin/list')                           return handleAdminList(request, env, url);
            if (url.pathname === '/api/cv/admin/bulk-update' && request.method === 'POST') return handleBulkUpdate(request, env);
            if (url.pathname === '/api/cv/admin/delete' && request.method === 'POST') return handleAdminDelete(request, env);
            if (url.pathname === '/api/cv/admin/voice-test' && request.method === 'POST') return handleVoiceTest(request, env);
            if (url.pathname === '/api/cv/admin/ai-audit' && request.method === 'POST') return handleAiAudit(request, env);
            if (url.pathname === '/api/cv/leak-report' && request.method === 'POST') return handleLeakReport(request, env);
            if (url.pathname === '/api/cv/admin/leak-candidates') return handleLeakCandidatesList(request, env, url);
            if (url.pathname === '/api/cv/admin/leak-candidates/decide' && request.method === 'POST') return handleLeakCandidatesDecide(request, env);

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

async function handleBrief(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const brief = await buildBriefData(env, body || {});
    return json(brief, request, env);
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
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, request, env, 401);
    }
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
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, request, env, 401);
    }
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
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, request, env, 401);
    }
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
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, request, env, 401);
    }
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
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, request, env, 401);
    }
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
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, request, env, 401);
    }
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
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, request, env, 401);
    }
    if (!env.AI) return json({ error: 'ai_binding_missing' }, request, env, 500);

    const body = await safeJson(request);
    let text: string = String(body?.text || '').trim();
    if (!text && Array.isArray(body?.bullets)) text = body.bullets.join('\n');
    if (!text) return json({ error: 'missing_text' }, request, env, 400);
    if (text.length > 8000) text = text.slice(0, 8000);

    // Already-banned set — so AI can't re-suggest things we already catch
    const banned = (await env.CV_KV.get<any[]>('cv:banned:all', { type: 'json' })) || [];
    const bannedSet = new Set(banned.map((b: any) => String(b.phrase || '').toLowerCase()).filter(Boolean));

    const sys = `You are a strict CV editor that detects AI-generated language ("AI-isms") in resume bullets — phrases that sound robotic, generic, buzzword-heavy, or written by ChatGPT.

Return ONLY a JSON object with this exact shape, no prose:
{"findings":[{"phrase":"<exact span from text, lowercase>","severity":"critical|high|medium","reason":"<why it sounds AI-generated>","replacement":"<a punchy human-toned alternative or empty string>"}]}

Rules:
- Only flag phrases that are clearly AI-isms — buzzwords, hollow superlatives, hedge phrases, robotic transitions, vague impact claims with no number.
- Each "phrase" MUST appear verbatim (case-insensitive) in the text. Do NOT invent phrases.
- Severity: critical = obvious ChatGPT giveaway (e.g. "leveraging cutting-edge"), high = strong buzzword, medium = mildly weak.
- Replacement should be 1-4 words, concrete, action-led. Empty string if removal is enough.
- Maximum 15 findings. No duplicates.`;

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

async function handleSync(request: Request, env: Env): Promise<Response> {
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, request, env, 401);
    }

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

function corsHeaders(request: Request, env: Env): HeadersInit {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allow = allowed.includes(origin) ? origin : allowed[0] || '*';
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
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, request, env, 401);

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
    const token = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, request, env, 401);

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
