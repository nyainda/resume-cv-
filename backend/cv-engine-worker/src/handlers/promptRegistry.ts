/// <reference types="@cloudflare/workers-types" />
/**
 * S4 — Prompt Registry handlers.
 *
 * Endpoints:
 *   GET  /api/cv/prompt-registry              — all active versions (lightweight)
 *   GET  /api/cv/prompt-registry/:section     — full prompt text for one section
 *   POST /api/cv/prompt-registry              — create new version (admin)
 *   POST /api/cv/prompt-registry/rollback     — activate a previous version (admin)
 *
 * Auth: read endpoints are public (no token needed — versions are not secret).
 *       write endpoints require the ADMIN_TOKEN header.
 */

import { Env } from '../types';
import { json, verifyAdminAuth, unauthorized } from '../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromptRow {
    id: number;
    section_key: string;
    version: number;
    prompt_text: string;
    notes: string;
    is_active: number;
    created_at: number;
    created_by: string;
}

// ─── GET /api/cv/prompt-registry ─────────────────────────────────────────────
// Returns a lightweight map of { section_key → { version, notes, created_at } }
// for every active prompt.  Used by the client to tag the generation trace.

export async function handlePromptRegistryList(
    request: Request,
    env: Env,
    url: URL
): Promise<Response> {
    const includeText = url.searchParams.get('include_text') === '1';

    const rows = await env.CV_DB.prepare(
        includeText
            ? `SELECT id, section_key, version, prompt_text, notes, created_at, created_by
               FROM prompt_registry WHERE is_active = 1 ORDER BY section_key`
            : `SELECT id, section_key, version, notes, created_at, created_by
               FROM prompt_registry WHERE is_active = 1 ORDER BY section_key`
    ).all<PromptRow>();

    // Shape: { summary: { version: 14, notes: '...', created_at: 1234567890 } }
    const versions: Record<string, { id: number; version: number; notes: string; created_at: number; created_by: string; prompt_text?: string }> = {};
    for (const row of rows.results) {
        versions[row.section_key] = {
            id: row.id,
            version: row.version,
            notes: row.notes,
            created_at: row.created_at,
            created_by: row.created_by,
            ...(includeText ? { prompt_text: row.prompt_text } : {}),
        };
    }

    return json({ versions }, request, env);
}

// ─── GET /api/cv/prompt-registry/:section ────────────────────────────────────
// Returns the full prompt text + all historical versions for one section.

export async function handlePromptRegistryGet(
    request: Request,
    env: Env,
    section: string
): Promise<Response> {
    if (!section) return json({ error: 'missing_section' }, request, env, 400);

    const active = await env.CV_DB.prepare(
        `SELECT id, section_key, version, prompt_text, notes, created_at, created_by
         FROM prompt_registry
         WHERE section_key = ? AND is_active = 1
         LIMIT 1`
    ).first<PromptRow>(section);

    if (!active) return json({ error: 'section_not_found' }, request, env, 404);

    const history = await env.CV_DB.prepare(
        `SELECT id, version, notes, created_at, created_by, is_active
         FROM prompt_registry
         WHERE section_key = ?
         ORDER BY version DESC
         LIMIT 50`
    ).all<Pick<PromptRow, 'id' | 'version' | 'notes' | 'created_at' | 'created_by' | 'is_active'>>(section);

    return json({
        section_key: active.section_key,
        active: {
            id: active.id,
            version: active.version,
            prompt_text: active.prompt_text,
            notes: active.notes,
            created_at: active.created_at,
            created_by: active.created_by,
        },
        history: history.results,
    }, request, env);
}

// ─── POST /api/cv/prompt-registry ────────────────────────────────────────────
// Creates a new version and activates it.  Auto-deactivates the previous active.
// Body: { section_key, prompt_text, notes?, created_by? }

export async function handlePromptRegistryPost(
    request: Request,
    env: Env
): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const section     = typeof body?.section_key  === 'string' ? body.section_key.trim()  : '';
    const promptText  = typeof body?.prompt_text  === 'string' ? body.prompt_text         : '';
    const notes       = typeof body?.notes        === 'string' ? body.notes.trim()        : '';
    const createdBy   = typeof body?.created_by   === 'string' ? body.created_by.trim()   : 'admin';

    if (!section)  return json({ error: 'missing_section_key' }, request, env, 400);
    if (!promptText) return json({ error: 'missing_prompt_text' }, request, env, 400);

    const now = Math.floor(Date.now() / 1000);

    // Determine next version number
    const maxRow = await env.CV_DB.prepare(
        `SELECT MAX(version) AS max_v FROM prompt_registry WHERE section_key = ?`
    ).first<{ max_v: number | null }>(section);
    const nextVersion = (maxRow?.max_v ?? 0) + 1;

    // Deactivate all existing versions for this section
    await env.CV_DB.prepare(
        `UPDATE prompt_registry SET is_active = 0 WHERE section_key = ?`
    ).bind(section).run();

    // Insert new active version
    const result = await env.CV_DB.prepare(
        `INSERT INTO prompt_registry (section_key, version, prompt_text, notes, is_active, created_at, created_by)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
    ).bind(section, nextVersion, promptText, notes, now, createdBy).run();

    return json({
        ok: true,
        section_key: section,
        version: nextVersion,
        id: result.meta.last_row_id,
    }, request, env, 201);
}

// ─── POST /api/cv/prompt-registry/rollback ───────────────────────────────────
// Activates a specific historical version, deactivating the current one.
// Body: { section_key, version }

export async function handlePromptRegistryRollback(
    request: Request,
    env: Env
): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'admin');
    if (!auth) return unauthorized(request, env, 'admin');

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const section = typeof body?.section_key === 'string' ? body.section_key.trim() : '';
    const version = typeof body?.version     === 'number' ? body.version            : NaN;

    if (!section)       return json({ error: 'missing_section_key' }, request, env, 400);
    if (isNaN(version)) return json({ error: 'missing_version' }, request, env, 400);

    // Ensure the target version exists
    const target = await env.CV_DB.prepare(
        `SELECT id FROM prompt_registry WHERE section_key = ? AND version = ?`
    ).first<{ id: number }>(section, version);
    if (!target) return json({ error: 'version_not_found' }, request, env, 404);

    // Deactivate all, then activate the target
    await env.CV_DB.prepare(
        `UPDATE prompt_registry SET is_active = 0 WHERE section_key = ?`
    ).bind(section).run();

    await env.CV_DB.prepare(
        `UPDATE prompt_registry SET is_active = 1 WHERE section_key = ? AND version = ?`
    ).bind(section, version).run();

    return json({ ok: true, section_key: section, rolled_back_to: version }, request, env);
}

// ─── GET /api/cv/prompt-registry/history/:section ────────────────────────────
// Returns all versions for a section (for admin history view).

export async function handlePromptRegistryHistory(
    request: Request,
    env: Env,
    section: string
): Promise<Response> {
    const auth = await verifyAdminAuth(request, env, 'editor');
    if (!auth) return unauthorized(request, env, 'editor');

    if (!section) return json({ error: 'missing_section' }, request, env, 400);

    const rows = await env.CV_DB.prepare(
        `SELECT id, version, notes, created_at, created_by, is_active,
                LENGTH(prompt_text) AS prompt_length
         FROM prompt_registry
         WHERE section_key = ?
         ORDER BY version DESC`
    ).all<{ id: number; version: number; notes: string; created_at: number; created_by: string; is_active: number; prompt_length: number }>(section);

    return json({ section_key: section, history: rows.results }, request, env);
}
