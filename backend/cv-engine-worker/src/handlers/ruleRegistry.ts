/// <reference types="@cloudflare/workers-types" />
/**
 * S1 — Rule Registry handlers.
 *
 * Endpoints:
 *   GET  /api/cv/rule-registry              — all active rules (lightweight, public)
 *   GET  /api/cv/rule-registry/evaluate     — evaluate scenario for given profile stats
 *   POST /api/cv/rule-registry              — create new rule variant (admin)
 *   POST /api/cv/rule-registry/rollback     — activate a previous version (admin)
 *
 * The registry stores the SELECTION CONDITIONS and optional text overrides
 * for each CV generation scenario (A, B, C, D, pivot, standard).
 * Read endpoints are public — rules aren't secret, only the text content is.
 */

import { Env } from '../types';
import { json, verifyAdminAuth, unauthorized } from '../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RuleConditions {
    hasExperience: boolean | null;   // null = don't-care
    hasProjects:   boolean | null;
    totalMonthsMin: number | null;
    totalMonthsMax: number | null;
    pivotRequired:  boolean | null;
}

interface RuleRow {
    id: number;
    rule_key: string;
    version: number;
    conditions: string;       // JSON
    ab_weight: number;
    text_override: string;
    notes: string;
    is_active: number;
    created_at: number;
    created_by: string;
}

// ─── GET /api/cv/rule-registry ────────────────────────────────────────────────
// Returns a lightweight list of all active rules — conditions + weights only.
// Used by the client on boot for the evaluator cache.

export async function handleRuleRegistryList(
    request: Request,
    env: Env
): Promise<Response> {
    const rows = await env.CV_DB.prepare(
        `SELECT id, rule_key, version, conditions, ab_weight, notes, created_at, created_by
         FROM rule_registry
         WHERE is_active = 1
         ORDER BY rule_key, version DESC`
    ).all<Omit<RuleRow, 'text_override' | 'is_active'>>();

    const rules = rows.results.map(r => ({
        id: r.id,
        ruleKey: r.rule_key,
        version: r.version,
        conditions: (() => { try { return JSON.parse(r.conditions); } catch { return {}; } })(),
        abWeight: r.ab_weight,
        notes: r.notes,
        createdAt: r.created_at,
    }));

    return json({ rules, count: rules.length }, request, env);
}

// ─── GET /api/cv/rule-registry/evaluate ──────────────────────────────────────
// Evaluates the best scenario for given profile characteristics.
// Query params: hasExperience (bool), hasProjects (bool), totalMonths (int),
//               pivotDetected (bool)
// Returns: { scenario, ruleId, version, abGroup, hasTextOverride }

export async function handleRuleRegistryEvaluate(
    request: Request,
    env: Env,
    url: URL
): Promise<Response> {
    const hasExperience  = url.searchParams.get('hasExperience')  === 'true';
    const hasProjects    = url.searchParams.get('hasProjects')    === 'true';
    const totalMonths    = parseInt(url.searchParams.get('totalMonths') ?? '0', 10);
    const pivotDetected  = url.searchParams.get('pivotDetected')  === 'true';

    const rows = await env.CV_DB.prepare(
        `SELECT id, rule_key, version, conditions, ab_weight, text_override
         FROM rule_registry
         WHERE is_active = 1
         ORDER BY rule_key, version DESC`
    ).all<Pick<RuleRow, 'id' | 'rule_key' | 'version' | 'conditions' | 'ab_weight' | 'text_override'>>();

    // Group by rule_key, taking only the highest-version active variant per key
    const byKey: Record<string, Array<typeof rows.results[0]>> = {};
    for (const row of rows.results) {
        if (!byKey[row.rule_key]) byKey[row.rule_key] = [];
        byKey[row.rule_key].push(row);
    }

    // Evaluate each scenario key's conditions against the profile stats
    const matches: Array<{ ruleKey: string; id: number; version: number; abWeight: number; hasTextOverride: boolean }> = [];

    for (const [ruleKey, variants] of Object.entries(byKey)) {
        for (const v of variants) {
            let cond: RuleConditions;
            try { cond = JSON.parse(v.conditions) as RuleConditions; } catch { continue; }

            const expMatch    = cond.hasExperience  === null || cond.hasExperience  === hasExperience;
            const projMatch   = cond.hasProjects    === null || cond.hasProjects    === hasProjects;
            const pivotMatch  = cond.pivotRequired  === null || cond.pivotRequired  === pivotDetected;
            const minMatch    = cond.totalMonthsMin === null || totalMonths >= cond.totalMonthsMin;
            const maxMatch    = cond.totalMonthsMax === null || totalMonths <= cond.totalMonthsMax;

            if (expMatch && projMatch && pivotMatch && minMatch && maxMatch) {
                matches.push({
                    ruleKey,
                    id: v.id,
                    version: v.version,
                    abWeight: v.ab_weight,
                    hasTextOverride: v.text_override.length > 0,
                });
            }
        }
    }

    // A/B variant selection within matching rules (weighted random)
    const scored = matches.map(m => ({ ...m, rand: Math.random() * m.abWeight }));
    scored.sort((a, b) => b.rand - a.rand);
    const winner = scored[0] ?? null;

    return json({
        matched: winner ? winner.ruleKey : null,
        ruleId: winner?.id ?? null,
        version: winner?.version ?? null,
        abGroup: winner ? `${winner.ruleKey}:v${winner.version}` : null,
        hasTextOverride: winner?.hasTextOverride ?? false,
        allMatches: matches.map(m => m.ruleKey),
    }, request, env);
}

// ─── GET /api/cv/rule-registry/:key ──────────────────────────────────────────
// Full config for one rule key including text_override and history.

export async function handleRuleRegistryGetKey(
    request: Request,
    env: Env,
    ruleKey: string
): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'viewer');
    if (!auth) return unauthorized(request, env, 'viewer');

    const active = await env.CV_DB.prepare(
        `SELECT id, rule_key, version, conditions, ab_weight, text_override, notes, created_at, created_by
         FROM rule_registry
         WHERE rule_key = ? AND is_active = 1
         ORDER BY version DESC
         LIMIT 1`
    ).first<RuleRow>(ruleKey);

    if (!active) return json({ error: 'rule_not_found' }, request, env, 404);

    const history = await env.CV_DB.prepare(
        `SELECT id, version, notes, ab_weight, created_at, created_by, is_active,
                CASE WHEN LENGTH(text_override) > 0 THEN 1 ELSE 0 END AS has_override
         FROM rule_registry
         WHERE rule_key = ?
         ORDER BY version DESC
         LIMIT 50`
    ).all(ruleKey);

    return json({
        ruleKey: active.rule_key,
        active: {
            id: active.id,
            version: active.version,
            conditions: (() => { try { return JSON.parse(active.conditions); } catch { return {}; } })(),
            abWeight: active.ab_weight,
            textOverride: active.text_override,
            notes: active.notes,
            createdAt: active.created_at,
            createdBy: active.created_by,
        },
        history: history.results,
    }, request, env);
}

// ─── POST /api/cv/rule-registry ───────────────────────────────────────────────
// Creates a new variant.  Auto-bumps version and activates it.
// Body: { rule_key, conditions, ab_weight?, text_override?, notes?, created_by? }

export async function handleRuleRegistryPost(
    request: Request,
    env: Env
): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const ruleKey      = typeof body?.rule_key      === 'string' ? body.rule_key.trim()            : '';
    const conditions   = typeof body?.conditions    === 'object' ? JSON.stringify(body.conditions) : '{}';
    const abWeight     = typeof body?.ab_weight     === 'number' ? body.ab_weight                  : 100;
    const textOverride = typeof body?.text_override === 'string' ? body.text_override               : '';
    const notes        = typeof body?.notes         === 'string' ? body.notes.trim()               : '';
    const createdBy    = typeof body?.created_by    === 'string' ? body.created_by.trim()          : 'admin';

    if (!ruleKey)  return json({ error: 'missing_rule_key' }, request, env, 400);
    if (abWeight < 0 || abWeight > 100) return json({ error: 'invalid_ab_weight' }, request, env, 400);

    const now = Math.floor(Date.now() / 1000);

    const maxRow = await env.CV_DB.prepare(
        `SELECT MAX(version) AS max_v FROM rule_registry WHERE rule_key = ?`
    ).first<{ max_v: number | null }>(ruleKey);
    const nextVersion = (maxRow?.max_v ?? 0) + 1;

    // Deactivate previous versions
    await env.CV_DB.prepare(
        `UPDATE rule_registry SET is_active = 0 WHERE rule_key = ?`
    ).bind(ruleKey).run();

    const result = await env.CV_DB.prepare(
        `INSERT INTO rule_registry
             (rule_key, version, conditions, ab_weight, text_override, notes, is_active, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(ruleKey, nextVersion, conditions, abWeight, textOverride, notes, now, createdBy).run();

    return json({
        ok: true,
        ruleKey,
        version: nextVersion,
        id: result.meta.last_row_id,
    }, request, env, 201);
}

// ─── POST /api/cv/rule-registry/rollback ─────────────────────────────────────
// Body: { rule_key, version }

export async function handleRuleRegistryRollback(
    request: Request,
    env: Env
): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'admin');
    if (!auth) return unauthorized(request, env, 'admin');

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const ruleKey = typeof body?.rule_key === 'string' ? body.rule_key.trim() : '';
    const version = typeof body?.version  === 'number' ? body.version         : NaN;

    if (!ruleKey)       return json({ error: 'missing_rule_key' }, request, env, 400);
    if (isNaN(version)) return json({ error: 'missing_version' }, request, env, 400);

    const target = await env.CV_DB.prepare(
        `SELECT id FROM rule_registry WHERE rule_key = ? AND version = ?`
    ).first<{ id: number }>(ruleKey, version);
    if (!target) return json({ error: 'version_not_found' }, request, env, 404);

    await env.CV_DB.prepare(
        `UPDATE rule_registry SET is_active = 0 WHERE rule_key = ?`
    ).bind(ruleKey).run();

    await env.CV_DB.prepare(
        `UPDATE rule_registry SET is_active = 1 WHERE rule_key = ? AND version = ?`
    ).bind(ruleKey, version).run();

    return json({ ok: true, ruleKey, rolled_back_to: version }, request, env);
}
