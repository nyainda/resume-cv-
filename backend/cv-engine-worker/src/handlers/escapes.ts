/**
 * escapes.ts — Pipeline Learning Loop handler (Feature 2).
 *
 * POST /api/pipeline/escapes   — ingest escape signals from the frontend
 * GET  /api/pipeline/escapes   — admin: list aggregated patterns
 * POST /api/admin/escapes/promote/:id — admin: promote pattern to KV rule
 */

import { Env } from '../types';
import { json, verifyAdminAuth } from '../utils';
import { sessionCookieFromRequest } from './auth';
import { invalidateKVCache } from './data';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EscapePayload {
  escapes: Array<{
    id:          string;
    escape_type: string;
    pattern:     string;
    source:      string;
    created_at:  number;
  }>;
}

// ─── POST /api/pipeline/escapes ───────────────────────────────────────────────

export async function handleEscapesPost(request: Request, env: Env): Promise<Response> {
  const session = await sessionCookieFromRequest(request, env);
  if (!session) return json({ error: 'unauthenticated' }, request, env, 401);

  let body: EscapePayload;
  try {
    body = await request.json() as EscapePayload;
  } catch {
    return json({ error: 'invalid_json' }, request, env, 400);
  }

  const escapes = (body.escapes ?? []).slice(0, 50); // cap at 50 per flush
  if (escapes.length === 0) return json({ ok: true, inserted: 0 }, request, env);

  // Validate fields and build insert batch
  const stmts = escapes
    .filter(e =>
      typeof e.id === 'string' && e.id.length > 0 &&
      typeof e.escape_type === 'string' &&
      typeof e.pattern === 'string' && e.pattern.length > 0 &&
      typeof e.source === 'string' &&
      typeof e.created_at === 'number'
    )
    .map(e =>
      env.CV_DB.prepare(
        `INSERT OR IGNORE INTO pipeline_escapes
           (id, user_id, escape_type, pattern, source, promoted, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      ).bind(e.id, session.userId, e.escape_type, e.pattern, e.source, e.created_at)
    );

  if (stmts.length === 0) return json({ ok: true, inserted: 0 }, request, env);

  await env.CV_DB.batch(stmts);
  return json({ ok: true, inserted: stmts.length }, request, env);
}

// ─── GET /api/pipeline/escapes ────────────────────────────────────────────────

export async function handleEscapesGet(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAdminAuth(request, env, 'editor');
  if (!auth) return json({ error: 'forbidden' }, request, env, 403);

  const url = new URL(request.url);
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '200'), 500);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const type   = url.searchParams.get('type');
  const source = url.searchParams.get('source');

  const where: string[] = [];
  const params: unknown[] = [];
  if (type)   { where.push('escape_type = ?'); params.push(type); }
  if (source) { where.push('source = ?');      params.push(source); }
  where.push('promoted = 0');

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await env.CV_DB.prepare(
    `SELECT escape_type, pattern, source, COUNT(*) AS frequency, MAX(created_at) AS last_seen
     FROM pipeline_escapes
     ${whereClause}
     GROUP BY escape_type, pattern, source
     ORDER BY frequency DESC, last_seen DESC
     LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();

  return json({ escapes: rows.results ?? [] }, request, env);
}

// ─── POST /api/admin/escapes/promote/:id ─────────────────────────────────────
// Marks the escape as promoted and writes the pattern to the appropriate KV list.

export async function handleEscapePromote(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await verifyAdminAuth(request, env, 'admin');
  if (!auth) return json({ error: 'forbidden' }, request, env, 403);

  // Promote by pattern+type (not a single row ID — multiple rows may share the same pattern)
  let body: { escape_type: string; pattern: string } | null = null;
  try { body = await request.json() as any; } catch { /**/ }
  if (!body?.escape_type || !body?.pattern) {
    return json({ error: 'missing_fields' }, request, env, 400);
  }

  const { escape_type, pattern } = body;

  // Mark all matching rows as promoted
  await env.CV_DB.prepare(
    `UPDATE pipeline_escapes SET promoted = 1 WHERE escape_type = ? AND pattern = ?`
  ).bind(escape_type, pattern).run();

  // Write to KV so future ARE runs pick it up
  if (escape_type === 'banned_phrase' || escape_type === 'ai_language') {
    const existing = await env.CV_KV.get('banned_phrases', 'json') as Array<{ phrase: string }> | null ?? [];
    const already = existing.some(e => e.phrase.toLowerCase() === pattern.toLowerCase());
    if (!already) {
      existing.push({ phrase: pattern });
      await env.CV_KV.put('banned_phrases', JSON.stringify(existing));
      await invalidateKVCache();
    }
  }

  return json({ ok: true, promoted: pattern }, request, env);
}
