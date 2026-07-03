/**
 * cvExamplesClient.ts
 *
 * Stores and retrieves "structural blueprints" of high-quality generated CVs
 * from Cloudflare D1 via the cv-engine-worker.
 *
 * The blueprint encodes STRUCTURE only — no personal content:
 *   - Summary word count
 *   - Skills count
 *   - Per-role bullet word counts (the rhythm pattern)
 *   - Narrative angle used (for pool diversity tracking)
 *   - Voice name used (for pool diversity tracking)
 *
 * This is injected into the generation prompt as a REFERENCE STRUCTURE block
 * so the LLM can target proven structural measurements instead of inventing from
 * scratch. The angle + voice fields are stored so future fetches can detect when
 * the example pool is skewed and deliberately pick a structurally similar example
 * that used a DIFFERENT angle — preventing the feedback-loop monotony described
 * in the variance architecture notes.
 *
 * All calls are best-effort and use short timeouts so they never block generation.
 */

const ENGINE_URL: string = import.meta.env.VITE_CV_ENGINE_URL ?? '';

// ── Narrative Angle type ───────────────────────────────────────────────────────
// Defined here so it can be imported by geminiService without a circular dep.
export type NarrativeAngle = 'impact' | 'process' | 'people' | 'growth';

export interface CVExampleStructure {
    fingerprint: string;
    primaryTitle: string;
    seniority: string;
    generationMode: string;
    purpose: string;
    summaryWords: number;
    skillsCount: number;
    /** Outer array = roles (most-recent first). Inner array = word count per bullet. */
    experienceStructure: number[][];
    /** Narrative angle used when this example was generated — for pool diversity tracking. */
    narrativeAngle?: NarrativeAngle;
    /** Voice profile name used — for pool diversity tracking. */
    voiceName?: string;
    /**
     * Structural quality score 0-100. Higher = cleaner first-pass output.
     * Computed from verb variety, rhythm balance, summary/skills counts.
     * The worker keeps the HIGHEST-quality structural blueprint per fingerprint.
     */
    qualityScore?: number;
    updatedAt: number;
}

// ── Fingerprint ────────────────────────────────────────────────────────────────

/**
 * Derive a stable, role-level fingerprint from non-personal attributes.
 * Two users with similar roles, seniority, purpose and mode get the same
 * fingerprint → they share and benefit from the same structural example.
 */
export async function computeExampleFingerprint(
    primaryTitle: string,
    totalYears: number,
    purpose: string,
    generationMode: string,
): Promise<string> {
    // Strip seniority-level adjectives so "Senior Engineer" and "Lead Engineer"
    // both map to the same role category.
    const normalizedRole = primaryTitle
        .toLowerCase()
        .replace(/\b(senior|junior|lead|staff|principal|associate|head|director|vp|chief|founding|mid.level)\b/g, '')
        .replace(/[^a-z ]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .substring(0, 50);

    const seniority = totalYears < 3 ? 'junior'
        : totalYears < 7 ? 'mid'
        : totalYears < 12 ? 'senior'
        : 'exec';

    const raw = `${normalizedRole}:${seniority}:${purpose}:${generationMode}`;
    const buf = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Lookup ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the structural example for a fingerprint.
 *
 * Pool diversity: when `currentAngle` is provided, the worker will try to
 * return an example that used a DIFFERENT narrative angle — preventing the
 * cv_examples feedback loop from pulling all generations toward the same story
 * framing. Falls back transparently to any stored example if no diverse one exists.
 *
 * Returns null on miss, network error, or missing ENGINE_URL.
 * Uses a short timeout so it never delays generation.
 */
export async function fetchCVExample(
    fingerprint: string,
    currentAngle?: NarrativeAngle,
): Promise<CVExampleStructure | null> {
    if (!ENGINE_URL) return null;
    try {
        const params = new URLSearchParams({ fingerprint });
        if (currentAngle) params.set('exclude_angle', currentAngle);

        const res = await fetch(`${ENGINE_URL}/api/cv/examples?${params}`, {
            signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) return null;
        const data = await res.json() as { example: CVExampleStructure | null };
        return data.example ?? null;
    } catch {
        return null; // timeout or network — always best-effort
    }
}

// ── Store ──────────────────────────────────────────────────────────────────────

/**
 * Store a structural blueprint after a successful generation + full pipeline run.
 * Fire-and-forget — never throws, never blocks.
 *
 * narrativeAngle and voiceName are stored as pool diversity metadata so the D1
 * table can eventually be queried to detect skew (too many examples with the
 * same angle) and select examples that used a DIFFERENT angle than the current
 * generation — enforcing variance rather than consistency.
 *
 * The backend schema migrations for these columns are in:
 *   backend/cv-engine-worker/migrations/017_cv_examples_variance.sql (narrative_angle, voice_name)
 *   backend/cv-engine-worker/migrations/018_cv_examples_quality.sql  (quality_score)
 * Until deployed the worker simply ignores the extra fields gracefully.
 */
/**
 * Compute a structural quality score (0-100) from the final generated CV.
 * Higher score = cleaner, more varied output from the quality pipeline.
 * Used to ensure the cv_examples pool stores the BEST-quality blueprint
 * seen for each role fingerprint, not just the most recent one.
 *
 * Components:
 *   Baseline 70 — generation completed + full pipeline ran
 *   +5  summary word count in 50-100 word sweet spot
 *   +5  skills count in 8-16 item range
 *   +10 verb variety ≥70% (unique bullet openers / total bullets)
 *   +5  avg bullets per role in 3-7 range
 *   Penalties for sparse/overlong content
 */
export function computeExampleQualityScore(cvData: {
    summary?: string;
    skills?: string[];
    experience?: Array<{ responsibilities?: string[] | string }>;
}): number {
    let score = 70;

    const summaryWords = (cvData.summary || '').split(/\s+/).filter(Boolean).length;
    if (summaryWords >= 50 && summaryWords <= 100) score += 5;
    else if (summaryWords < 25 || summaryWords > 160) score -= 10;

    const skillsCount = (cvData.skills || []).length;
    if (skillsCount >= 8 && skillsCount <= 16) score += 5;
    else if (skillsCount < 4) score -= 10;

    const allBullets = (cvData.experience || []).flatMap(exp =>
        Array.isArray(exp.responsibilities)
            ? exp.responsibilities.filter((b): b is string => typeof b === 'string')
            : typeof exp.responsibilities === 'string' ? [exp.responsibilities] : []
    );

    if (allBullets.length > 0) {
        const openers = allBullets
            .map(b => b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, ''))
            .filter(Boolean);
        const variety = openers.length > 0 ? new Set(openers).size / openers.length : 0;
        if (variety >= 0.7) score += 10;
        else if (variety < 0.4) score -= 15;
    }

    const roles = (cvData.experience || []).filter(e =>
        Array.isArray(e.responsibilities) ? e.responsibilities.length > 0
        : typeof e.responsibilities === 'string' && e.responsibilities.trim().length > 0
    );
    if (roles.length > 0) {
        const avgBullets = allBullets.length / roles.length;
        if (avgBullets >= 3 && avgBullets <= 7) score += 5;
        else if (avgBullets < 2) score -= 10;
    }

    return Math.max(0, Math.min(100, score));
}

export function storeCVExample(
    fingerprint: string,
    primaryTitle: string,
    seniority: string,
    generationMode: string,
    purpose: string,
    cvData: {
        summary?: string;
        skills?: string[];
        experience?: Array<{ responsibilities?: string[] | string }>;
    },
    narrativeAngle?: NarrativeAngle,
    voiceName?: string,
): void {
    if (!ENGINE_URL) return;

    const summaryWords = (cvData.summary ?? '').split(/\s+/).filter(Boolean).length;
    const skillsCount = (cvData.skills ?? []).length;

    // Encode the bullet-length rhythm: word count of every bullet in every role.
    const experienceStructure = (cvData.experience ?? []).map(exp => {
        const bullets: string[] = Array.isArray(exp.responsibilities)
            ? exp.responsibilities.filter((b): b is string => typeof b === 'string')
            : typeof exp.responsibilities === 'string'
            ? [exp.responsibilities]
            : [];
        return bullets.map(b => b.split(/\s+/).filter(Boolean).length);
    });

    const qualityScore = computeExampleQualityScore(cvData);

    void fetch(`${ENGINE_URL}/api/cv/examples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fingerprint,
            primaryTitle: primaryTitle.substring(0, 120),
            seniority,
            generationMode,
            purpose,
            summaryWords,
            skillsCount,
            experienceStructure,
            // Pool diversity metadata
            narrativeAngle: narrativeAngle ?? null,
            voiceName: voiceName ?? null,
            // Quality score — worker keeps the MAX across all generations for this fingerprint
            qualityScore,
        }),
        signal: AbortSignal.timeout(5000),
    }).catch(() => { /* best-effort */ });
}

// ── Prompt injection ───────────────────────────────────────────────────────────

/**
 * Build a compact (~120-200 token) structural reference block to prepend to the
 * main generation prompt. The LLM uses it to TARGET structural measurements
 * (bullet counts, word counts, band distribution) — not to copy content.
 *
 * Language is deliberately measurement-only: "target" and "aim for", never
 * "mirror" or "match" — because the LLM must treat these as calibration targets,
 * not as creative templates to echo.
 */
export function buildReferenceBlock(
    example: CVExampleStructure,
): string {
    const rhythmLines = example.experienceStructure.map((bullets, i) => {
        if (bullets.length === 0) return null;
        const bandCounts = { punchy: 0, standard: 0, narrative: 0 };
        for (const w of bullets) {
            if (w <= 14) bandCounts.punchy++;
            else if (w <= 22) bandCounts.standard++;
            else bandCounts.narrative++;
        }
        const totalBullets = bullets.length;
        const avgWords = Math.round(bullets.reduce((a, b) => a + b, 0) / totalBullets);
        return `  Role ${i + 1}: ${totalBullets} bullets, avg ${avgWords} words [punchy×${bandCounts.punchy} / standard×${bandCounts.standard} / narrative×${bandCounts.narrative}]`;
    }).filter(Boolean).join('\n');

    const angleNote = example.narrativeAngle
        ? `\n  • Prior angle: ${example.narrativeAngle} — your angle may differ; these are SIZE targets only.`
        : '';

    return `\
===== STRUCTURAL REFERENCE — NUMERIC MEASUREMENTS ONLY =====
CRITICAL: This block contains ONLY word-count numbers and bullet-count numbers.
There is NO CV content here — no names, no companies, no skills, no bullet text, no job titles.
Do NOT invent or fabricate any content from this block.
Do NOT mention this block in your output. Treat it purely as a length calibration guide.
All content MUST come exclusively from the candidate's own profile and job description below.

Role-size targets for a ${example.seniority}-level ${example.primaryTitle} (${example.generationMode} mode):
  • Summary: target ~${example.summaryWords} words total${angleNote}
  • Skills list: target ${example.skillsCount} items
  • Bullet lengths per role (number of bullets × average word count — match the proportions):
${rhythmLines}

These numbers are CALIBRATION TARGETS ONLY. Match the scale; generate entirely original content.
===== END STRUCTURAL REFERENCE =====
`;
}
