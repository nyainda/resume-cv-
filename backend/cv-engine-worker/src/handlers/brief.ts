/// <reference types="@cloudflare/workers-types" />
import { Env, kvd } from '../types';
import { json, safeJson, clamp, shuffle, stringify, escapeRegex } from '../utils';

export async function handleBrief(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const body = await safeJson(request);
    const brief = await buildBriefData(env, body || {});
    ctx.waitUntil(recordBriefTelemetry(env, body || {}, brief).catch(() => {}));
    return json(brief, request, env);
}

export async function recordBriefTelemetry(env: Env, body: any, brief: any): Promise<void> {
    const jdPresent = String(body?.jd || body?.jobDescription || '').trim().length > 0 ? 1 : 0;
    const seniority = brief?.seniority?.level || null;
    const fieldName = brief?.field?.field || null;
    const voice     = brief?.voice?.primary?.name || null;
    const section   = String(body?.section || 'current_role').toLowerCase();
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

export async function buildBriefData(env: Env, body: any): Promise<any> {
    const jd: string = String(body?.jd || body?.jobDescription || '').trim();
    const profile = body?.profile || {};
    const explicitYears = Number(body?.yearsExperience);
    const explicitField: string = String(body?.field || '').toLowerCase().trim();
    const bulletCount = clamp(parseInt(body?.bulletCount || '5', 10), 3, 10);
    const section: string = String(body?.section || 'current_role').toLowerCase();

    const years = Number.isFinite(explicitYears) && explicitYears >= 0
        ? explicitYears
        : estimateYearsFromProfile(profile);

    const [seniorityRows, fieldRows, voiceRows, comboRows, rhythmRows, bannedRows,
           openerRows, resultConnRows, ctxConnRows] = await Promise.all([
        env.CV_KV.get<any[]>(kvd('cv:seniority:all'), { type: 'json' }),
        env.CV_KV.get<any[]>(kvd('cv:fields:all'),    { type: 'json' }),
        env.CV_KV.get<any[]>(kvd('cv:voices:all'),    { type: 'json' }),
        env.CV_KV.get<any[]>(kvd('cv:combos:all'),    { type: 'json' }),
        env.CV_KV.get<any[]>(kvd('cv:rhythm:all'),    { type: 'json' }),
        env.CV_KV.get<any[]>(kvd('cv:banned:all'),    { type: 'json' }),
        env.CV_KV.get<any[]>(kvd('cv:openers:all'),   { type: 'json' }),   // ← 1.3
        env.CV_KV.get<any[]>(kvd('cv:results:all'),   { type: 'json' }),   // ← 1.3
        env.CV_KV.get<any[]>(kvd('cv:contexts:all'),  { type: 'json' }),   // ← 1.3
    ]);

    // 1. Seniority by years (with override from JD title cues)
    const titleHay = `${jd} ${profile?.headline || profile?.title || ''}`.toLowerCase();
    let seniorityLevel = pickSeniorityByYears(years, seniorityRows || []);
    if (/\b(intern|attachment|trainee)\b/.test(titleHay)) seniorityLevel = 'entry';
    else if (/\b(lead|principal|head|director|chief|vp|cto|ceo)\b/.test(titleHay)) seniorityLevel = 'lead';
    else if (/\bsenior\b|\bsr\.?\b/.test(titleHay) && years >= 5) seniorityLevel = 'senior';
    const seniority = (seniorityRows || []).find(s => s.level === seniorityLevel) || null;

    // 2. Field detection: score JD against each field's jd_keywords.
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
        if (fieldRow && Array.isArray(fieldRow.preferred_verbs) && Array.isArray(v.verb_bias)) {
            const overlap = v.verb_bias.filter((vb: string) =>
                fieldRow.preferred_verbs.some((pv: string) => pv.toLowerCase() === String(vb).toLowerCase())
            ).length;
            score += overlap;
        }
        return { voice: v, score };
    }).sort((a, b) => b.score - a.score);

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
    let verbPool = await env.CV_KV.get<any[]>(kvd(`cv:verbs:${category}:${tense}`), { type: 'json' }) || [];
    if (fieldRow) {
        const avoided = new Set((fieldRow.avoided_verbs || []).map((v: string) => v.toLowerCase()));
        verbPool = verbPool.filter(v => !avoided.has(String(v.verb_present || '').toLowerCase()));
    }
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

    // 7. Openers + connectors (1.3) — pick a small fresh set each call
    //    Openers: 4 random picks so every generation has variety
    //    Result connectors: top-scored 6 (already ordered DESC by human_score from KV sync)
    //    Context connectors: first 6 (diverse types: location, scope, team)
    const openerPool = [...(openerRows || [])];
    shuffle(openerPool);
    const openerSuggestions: string[] = openerPool
        .slice(0, 4)
        .map((o: any) => String(o.opener || ''))
        .filter(Boolean);

    const resultConnectors: string[] = (resultConnRows || [])
        .slice(0, 6)
        .map((r: any) => String(r.connector || ''))
        .filter(Boolean);

    const contextConnectors: string[] = (ctxConnRows || [])
        .slice(0, 6)
        .map((c: any) => String(c.connector || ''))
        .filter(Boolean);

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
        opener_suggestions: openerSuggestions,
        result_connectors: resultConnectors,
        context_connectors: contextConnectors,
        debug: {
            field_scores: fieldScores.slice(0, 5).map(f => ({ field: f.field, score: f.score })),
            voice_scores: voiceScored.slice(0, 3).map(v => ({ name: v.voice.name, score: v.score })),
            voice_override: voiceNameOverride || null,
        },
    };
}

// ─── Brief helpers ────────────────────────────────────────────────────────────

export function estimateYearsFromProfile(profile: any): number {
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

export function parseDateLoose(s: any): Date | null {
    if (!s) return null;
    if (s instanceof Date) return s;
    const str = String(s).trim();
    if (/^present|current$/i.test(str)) return new Date();
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

export function pickSeniorityByYears(years: number, rows: any[]): string {
    for (const r of rows) {
        const lo = Number(r.years_min ?? 0);
        const hi = Number(r.years_max ?? 99);
        if (years >= lo && years <= hi) return r.level;
    }
    return years < 1 ? 'entry' : years < 3 ? 'junior' : years < 6 ? 'mid' : years < 10 ? 'senior' : 'lead';
}

export function mapFieldToVerbCategory(languageStyle: string): 'technical' | 'management' | 'analysis' | 'communication' | 'financial' | 'creative' {
    const s = (languageStyle || '').toLowerCase();
    if (s.includes('technical')) return 'technical';
    if (s.includes('analytical')) return 'analysis';
    if (s.includes('commercial') || s.includes('financial')) return 'financial';
    if (s.includes('humanistic') || s.includes('policy')) return 'communication';
    if (s.includes('creative')) return 'creative';
    return 'management';
}
