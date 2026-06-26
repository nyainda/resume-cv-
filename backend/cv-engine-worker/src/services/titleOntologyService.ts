/**
 * titleOntologyService.ts
 *
 * Server-side helpers for the job_title_ontology D1 table.
 *
 * Rules:
 *   - normalizeTitle() is always applied before any read or write.
 *   - upsertTitle() uses ON CONFLICT to safely increment usage_count.
 *   - lookupTitle() returns null on miss — never throws.
 *   - All writes use ctx.waitUntil() so they never block the response.
 *   - 'user_confirmed' confidence always overwrites 'llm' or 'regex'.
 */

import type { Env } from '../middlewaretypes';

export const VALID_FIELD_SLUGS = new Set([
  'irrigation', 'drought_management', 'civil_engineering', 'construction',
  'architecture', 'manufacturing', 'logistics', 'tech', 'data_analytics',
  'sales', 'marketing', 'finance', 'legal', 'consulting', 'operations',
  'hr', 'ngo', 'government', 'healthcare', 'education', 'hospitality',
  'media', 'general',
]);

export type TitleConfidence = 'regex' | 'llm' | 'user_confirmed';
export type TitleSource = 'pdf_import' | 'jd_upload' | 'manual_form' | 'deep_analysis';

export interface TitleOntologyRow {
  title_normalized: string;
  field_slug:       string;
  confidence:       TitleConfidence;
  source:           TitleSource;
  usage_count:      number;
  created_at:       number;
  updated_at:       number;
}

export function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 300);
}

export async function lookupTitle(
  env: Env,
  title: string,
): Promise<TitleOntologyRow | null> {
  if (!title?.trim()) return null;
  const normalized = normalizeTitle(title);
  try {
    const row = await env.CV_DB.prepare(
      `SELECT * FROM job_title_ontology WHERE title_normalized = ?`
    ).bind(normalized).first<TitleOntologyRow>();

    if (!row) return null;

    env.CV_DB.prepare(
      `UPDATE job_title_ontology
       SET usage_count = usage_count + 1, updated_at = ?
       WHERE title_normalized = ?`
    ).bind(Math.floor(Date.now() / 1000), normalized).run().catch(() => {});

    return row;
  } catch {
    return null;
  }
}

export async function upsertTitle(
  env: Env,
  title: string,
  fieldSlug: string,
  confidence: TitleConfidence,
  source: TitleSource,
): Promise<void> {
  if (!title?.trim()) return;
  if (!VALID_FIELD_SLUGS.has(fieldSlug)) return;

  const normalized = normalizeTitle(title);
  const now = Math.floor(Date.now() / 1000);

  try {
    const existing = await env.CV_DB.prepare(
      `SELECT confidence FROM job_title_ontology WHERE title_normalized = ?`
    ).bind(normalized).first<{ confidence: string }>();

    if (existing?.confidence === 'user_confirmed' && confidence !== 'user_confirmed') {
      await env.CV_DB.prepare(
        `UPDATE job_title_ontology
         SET usage_count = usage_count + 1, updated_at = ?
         WHERE title_normalized = ?`
      ).bind(now, normalized).run();
      return;
    }

    await env.CV_DB.prepare(
      `INSERT INTO job_title_ontology
         (title_normalized, field_slug, confidence, source, usage_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(title_normalized) DO UPDATE SET
         field_slug   = CASE
           WHEN excluded.confidence = 'user_confirmed' THEN excluded.field_slug
           WHEN job_title_ontology.confidence = 'user_confirmed' THEN job_title_ontology.field_slug
           ELSE excluded.field_slug
         END,
         confidence   = CASE
           WHEN excluded.confidence = 'user_confirmed' THEN 'user_confirmed'
           WHEN job_title_ontology.confidence = 'user_confirmed' THEN 'user_confirmed'
           WHEN excluded.confidence = 'llm' THEN 'llm'
           ELSE job_title_ontology.confidence
         END,
         usage_count  = job_title_ontology.usage_count + 1,
         updated_at   = excluded.updated_at`
    ).bind(normalized, fieldSlug, confidence, source, now, now).run();
  } catch {
    /* Never crash the caller — this is always a side-effect write */
  }
}

export async function bulkLookupTitles(
  env: Env,
  titles: string[],
): Promise<Map<string, TitleOntologyRow>> {
  if (!titles || titles.length === 0) return new Map();

  const normalized = titles.map(normalizeTitle).filter(Boolean);
  if (normalized.length === 0) return new Map();

  const placeholders = normalized.map(() => '?').join(', ');
  try {
    const rows = await env.CV_DB.prepare(
      `SELECT * FROM job_title_ontology WHERE title_normalized IN (${placeholders})`
    ).bind(...normalized).all<TitleOntologyRow>();

    const result = new Map<string, TitleOntologyRow>();
    for (const row of rows.results ?? []) {
      result.set(row.title_normalized, row);
    }
    return result;
  } catch {
    return new Map();
  }
}

export function parseFieldSlugFromLLM(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z_]/g, '');
  return VALID_FIELD_SLUGS.has(cleaned) ? cleaned : null;
}
