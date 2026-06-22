/// <reference types="@cloudflare/workers-types" />
import { Env } from '../types';
import { json, safeJson, clamp, sanitizeStringArray, dotSim, escapeRegex } from '../utils';
import { getCachedBannedPhrases } from './data';

// ─── Semantic match constants ─────────────────────────────────────────────────
const SEMANTIC_MATCH_MODEL = '@cf/baai/bge-large-en-v1.5';
const SEMANTIC_THRESHOLD_MATCHED = 0.78;
const SEMANTIC_THRESHOLD_PARTIAL = 0.62;
const SEMANTIC_MAX_KEYWORDS = 60;
const SEMANTIC_MAX_PROFILE_TEXTS = 250;
const SEMANTIC_KEYWORD_MAX_CHARS = 200;
const SEMANTIC_PROFILE_MAX_CHARS = 600;
export const SEMANTIC_EMBED_BATCH = 95;

export async function handleClean(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const rawText: string = (body?.rawText ?? body?.text ?? '').slice(0, 50_000);
    if (!rawText || typeof rawText !== 'string') {
        return json({ error: 'missing_rawText' }, request, env, 400);
    }

    const changes: string[] = [];
    let cleaned = rawText;

    // 1. Banned phrase replacement (longest first so multi-word phrases hit before single words)
    const banned = await getCachedBannedPhrases(env);
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

export async function handleValidate(request: Request, env: Env): Promise<Response> {
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

    // 3. Banned phrases — use module-level cache shared with data.ts handleBanned
    const banned = await getCachedBannedPhrases(env);
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

export async function handleValidateVoice(request: Request, env: Env): Promise<Response> {
    const body = await safeJson(request);
    const bullets: string[] = Array.isArray(body?.bullets) ? body.bullets : [];
    const brief = body?.brief || null;
    if (bullets.length === 0) return json({ error: 'missing_bullets' }, request, env, 400);
    if (!brief) return json({ error: 'missing_brief' }, request, env, 400);
    return json(computeVoiceValidation(bullets, brief), request, env);
}

export function computeVoiceValidation(bullets: string[], brief: any): any {
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

export async function embedBatch(env: Env, texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += SEMANTIC_EMBED_BATCH) {
        const slice = texts.slice(i, i + SEMANTIC_EMBED_BATCH);
        const res: any = await env.AI.run(SEMANTIC_MATCH_MODEL as any, { text: slice });
        const data: number[][] = res?.data || [];
        for (const v of data) out.push(v);
    }
    return out;
}

export async function handleSemanticMatch(request: Request, env: Env): Promise<Response> {
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
