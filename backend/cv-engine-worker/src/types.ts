/**
 * Shared types and constants for the cv-engine-worker.
 *
 * Import from here in every handler file so the Env interface and
 * versioned-KV helpers are defined in one place.
 */

// ─── Cloudflare Worker bindings ───────────────────────────────────────────────

export interface Env {
    CV_DB: D1Database;
    CV_KV: KVNamespace;
    AI: Ai;
    ALLOWED_ORIGINS?: string;
    ADMIN_TOKEN?: string;
    /** Brevo (Sendinblue) API key — required for email magic links. Set via: wrangler secret put BREVO_API_KEY */
    BREVO_API_KEY?: string;
    /** The app's public URL — used to construct magic-link redirect URLs. Defaults to procv.app if not set. */
    APP_URL?: string;
}

// ─── KV data versioning ───────────────────────────────────────────────────────
// Bump WORKER_DATA_VERSION whenever CV rules change (banned phrases, verb pools,
// seniority/field/voice tables). Old KV entries under the previous prefix are
// simply ignored; the first admin /api/cv/sync after deploy writes the new keys.
// Meta keys (cv:meta:*) and the LLM-cache entries keep their own key schemes.

export const WORKER_DATA_VERSION = 'v2';
export const kvd = (key: string) => `${WORKER_DATA_VERSION}:${key}`;

// ─── Verb categories ──────────────────────────────────────────────────────────

export const VERB_CATEGORIES = [
    'technical', 'management', 'analysis',
    'communication', 'financial', 'creative',
] as const;

export type VerbCategory = typeof VERB_CATEGORIES[number];

// ─── Admin auth ───────────────────────────────────────────────────────────────

export type AdminRole = 'viewer' | 'editor' | 'admin';
export const ROLE_RANK: Record<AdminRole, number> = { viewer: 1, editor: 2, admin: 3 };
export const VALID_ROLES: AdminRole[] = ['viewer', 'editor', 'admin'];

export interface AuthCtx {
    ok: true;
    role: AdminRole;
    label: string;
    tokenId: string | null;
}

// ─── Admin-writable tables ────────────────────────────────────────────────────

export const ADMIN_TABLES = new Set([
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

// Whitelist of columns admins can search/update per table.
export const ADMIN_SEARCHABLE: Record<string, string[]> = {
    cv_verbs:               ['verb_present', 'verb_past', 'category', 'industry'],
    cv_banned_phrases:      ['phrase', 'replacement', 'severity', 'reason', 'source'],
    cv_openers:             ['opener', 'type', 'length_type'],
    cv_context_connectors:  ['connector', 'type'],
    cv_result_connectors:   ['connector', 'type'],
    cv_sentence_structures: ['pattern_label', 'pattern', 'use_frequency', 'section'],
    cv_rhythm_patterns:     ['pattern_name', 'section', 'description'],
    cv_paragraph_structures:['section', 'pattern'],
    cv_subjects:            ['subject', 'usage'],
    cv_seniority_levels:    ['level', 'bullet_style', 'metric_density', 'summary_tone'],
    cv_field_profiles:      ['field', 'language_style'],
    cv_seniority_field_combos: ['seniority', 'field', 'required_tone', 'notes'],
    cv_voice_profiles:      ['name', 'tone', 'description', 'risk_tolerance', 'formality'],
};

// ─── Leak promotion ───────────────────────────────────────────────────────────

export const LEAK_PROMOTE_THRESHOLD = 5;
