/// <reference types="@cloudflare/workers-types" />
import { Env, kvd, LEAK_PROMOTE_THRESHOLD } from '../types';
import { json, safeJson, clamp, verifyAdminAuth, unauthorized } from '../utils';
import { getCachedBannedPhrases } from './data';

const LEAK_REPORT_MAX_PHRASES = 100;
const LEAK_PHRASE_MAX_LEN = 80;
const LEAK_PHRASE_MIN_LEN = 3;

export async function handleLeakReport(request: Request, env: Env): Promise<Response> {
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

    const banned = await getCachedBannedPhrases(env);
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

export async function handleLeakCandidatesList(request: Request, env: Env, url: URL): Promise<Response> {
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

export async function handleLeakCandidatesDecide(request: Request, env: Env): Promise<Response> {
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

export async function runLeakPromotionCron(env: Env): Promise<void> {
    const banned = await getCachedBannedPhrases(env);
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

export async function runDbCleanupCron(env: Env): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const summary: Record<string, number> = {};

    try {
        const eventsRes = await env.CV_DB.prepare(
            `DELETE FROM cv_events WHERE created_at < ?`
        ).bind(now - 90 * 86400).run();
        summary.cv_events = eventsRes.meta?.changes ?? 0;
    } catch (e) { summary.cv_events_err = 1; console.error('[cron] cv_events cleanup error', e); }

    try {
        const jobRes = await env.CV_DB.prepare(
            `DELETE FROM job_search_cache WHERE expires_at < ?`
        ).bind(now).run();
        summary.job_search_cache = jobRes.meta?.changes ?? 0;
    } catch (e) { summary.job_search_cache_err = 1; console.error('[cron] job_search_cache cleanup error', e); }

    try {
        const profileRes = await env.CV_DB.prepare(
            `DELETE FROM profile_cache WHERE last_used_at < ? AND use_count < 5`
        ).bind(now - 90 * 86400).run();
        summary.profile_cache = profileRes.meta?.changes ?? 0;
    } catch (e) { summary.profile_cache_err = 1; console.error('[cron] profile_cache cleanup error', e); }

    try {
        const leakRes = await env.CV_DB.prepare(
            `DELETE FROM cv_leak_candidates
             WHERE status != 'pending'
               AND decided_at < datetime('now', '-180 days')`
        ).run();
        summary.cv_leak_candidates = leakRes.meta?.changes ?? 0;
    } catch (e) { summary.cv_leak_candidates_err = 1; console.error('[cron] cv_leak_candidates cleanup error', e); }

    // Vault job cleanup:
    //   1. Remove 'expired' status jobs that haven't changed in 30+ days
    //   2. Remove any vault job older than 180 days (safety purge)
    try {
        const vaultExpired = await env.CV_DB.prepare(
            `DELETE FROM vault_jobs
             WHERE status = 'expired'
               AND updated_at < ?`
        ).bind(Date.now() - 30 * 86400 * 1000).run();
        summary.vault_expired = vaultExpired.meta?.changes ?? 0;
    } catch (e) { summary.vault_expired_err = 1; console.error('[cron] vault_jobs expired cleanup error', e); }

    try {
        const vaultOld = await env.CV_DB.prepare(
            `DELETE FROM vault_jobs WHERE created_at < ?`
        ).bind(Date.now() - 180 * 86400 * 1000).run();
        summary.vault_old = vaultOld.meta?.changes ?? 0;
    } catch (e) { summary.vault_old_err = 1; console.error('[cron] vault_jobs old cleanup error', e); }

    console.log(`[cron] db-cleanup: ${JSON.stringify(summary)}`);
}

async function rebuildBannedKv(env: Env): Promise<void> {
    const rs = await env.CV_DB.prepare(
        `SELECT phrase, replacement, severity, reason FROM cv_banned_phrases ORDER BY length(phrase) DESC`
    ).all();
    await env.CV_KV.put(kvd('cv:banned:all'), JSON.stringify(rs.results || []));
}
