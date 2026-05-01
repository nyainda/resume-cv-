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
 *
 * This is injected into the generation prompt as a REFERENCE STRUCTURE block
 * so the LLM can mirror a proven pattern instead of inventing from scratch.
 * Expected token saving: ~30-50% on the main generation call on a cache hit,
 * because the LLM produces better-structured output on the first pass and
 * needs fewer validator/polish corrections.
 *
 * All calls are best-effort and use short timeouts so they never block generation.
 */

const ENGINE_URL: string = import.meta.env.VITE_CV_ENGINE_URL ?? '';

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
 * Returns null on miss, network error, or missing ENGINE_URL.
 * Uses a short timeout so it never delays generation.
 */
export async function fetchCVExample(fingerprint: string): Promise<CVExampleStructure | null> {
    if (!ENGINE_URL) return null;
    try {
        const res = await fetch(`${ENGINE_URL}/api/cv/examples?fingerprint=${fingerprint}`, {
            signal: AbortSignal.timeout(1500),
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
 */
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
        }),
        signal: AbortSignal.timeout(5000),
    }).catch(() => { /* best-effort */ });
}

// ── Prompt injection ───────────────────────────────────────────────────────────

/**
 * Build a compact (~120-200 token) structural reference block to prepend to the
 * main generation prompt. The LLM uses it to mirror bullet rhythm, section sizes,
 * and summary length — without copying any personal content.
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

    return `\
===== STRUCTURAL REFERENCE (proven pattern for this role type — do NOT copy content) =====
A previous high-quality CV for a ${example.seniority} ${example.primaryTitle} (${example.generationMode} mode) used this structure:
  • Summary: ~${example.summaryWords} words
  • Skills: ${example.skillsCount} items
  • Bullet rhythm (mirror this variation, not the wording):
${rhythmLines}
Apply ONLY the structural patterns above. All content must come from this user's real profile.
===== END STRUCTURAL REFERENCE =====
`;
}
