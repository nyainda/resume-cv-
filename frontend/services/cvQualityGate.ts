/**
 * cvQualityGate.ts
 *
 * Two-stage safety net that runs between raw Worker AI output and the
 * main quality polish pipeline.
 *
 * STAGE 1 — Instant regex scoring (zero tokens, zero latency):
 *   Detects CRITICAL structural violations that the purification pipeline
 *   cannot safely fix with substitutions alone — e.g. a summary that
 *   starts with "Seeking to use my skills…" needs a full sentence rewrite,
 *   not just word-level deletion.
 *
 * STAGE 2 — Targeted LLM repair (only fires when Stage 1 finds critical issues):
 *   Sends a tiny repair prompt (300–600 tokens) to workerTieredLLM covering
 *   only the failing section. Far cheaper than full regeneration.
 *
 * PERSIST — Violation memory for the regenerate-loop problem:
 *   After every gate run, violations are written to localStorage under
 *   'cv:lastRunIssues'. The next call to consumePreviousViolationsBlock()
 *   returns a compact "DO NOT REPEAT" block for preamble injection, then
 *   clears the key so it only affects the immediately following generation.
 *
 * Design constraints:
 *   - Never throws into the generation path (all paths are try/catch).
 *   - Never changes numbers, dates, names, or company/school content.
 *   - Graceful no-op if the Worker AI is unreachable.
 */

import { workerTieredLLM } from './cvEngineClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface QualityViolation {
    section: string;
    type: string;
    detail: string;
    severity: 'critical' | 'moderate';
}

export interface QualityGateResult {
    violations: QualityViolation[];
    repairedSummary: string | null;
    repairedExperience: any[] | null;
    repairAttempted: boolean;
}

const LAST_RUN_ISSUES_KEY = 'cv:lastRunIssues';
const ISSUES_MAX_AGE_MS   = 2 * 60 * 60 * 1000; // 2 hours — stale after that

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1 — Fast regex scoring
// ─────────────────────────────────────────────────────────────────────────────

const SEEKING_PATTERN = /\b(seeking to|looking to|aiming to|hoping to|eager to join|excited to contribute|seeking an opportunity|seeking a role|looking for an opportunity)\b/i;

const FAKE_VERB_PATTERN = /\b(greenfielded?|greenfiel(?:ding|s)|scaffolded?|scaffolding|materialized?|materializ(?:es|ing)|actioned?|actioning|ideated?|ideating|solutioned?|solutioning|conceptualized?|operationalized?)\b/i;

const BANNED_OPENER_PATTERN = /^(spearheaded?|orchestrated?|leveraged?|utilized?|facilitated?|empowered?|championed?)\b/i;

const BUZZWORD_PATTERN = /\b(highly motivated|results-driven|results-oriented|passionate about|detail-oriented|team player|self-starter|go-getter|dynamic professional|proactive individual|hard-?working)\b/i;

const METRIC_IN_BULLET = /\b\d[\d,.]*\s*(%|K|M|B|x|×|\+\s*years?|hours?\/(?:week|day|month)|(?:hours?|days?|weeks?|months?|years?)\s+(?:saved|reduced|cut|saved)|users?|clients?|customers?|employees?|staff|team members?|projects?|countries|regions|offices?)\b/i;

const CHAINED_METRIC = /\b\d+\s*%[^.]{0,60}(?:resulting in|leading to|which led to|driving)\s*\d+\s*%/i;

function scoreSummary(summary: string): QualityViolation[] {
    const v: QualityViolation[] = [];

    if (SEEKING_PATTERN.test(summary)) {
        v.push({
            section:  'summary',
            type:     'seeking_opener',
            detail:   'Summary expresses what the candidate wants ("Seeking to…" / "Looking to…") instead of what they deliver. Rewrite to open with the candidate\'s value proposition.',
            severity: 'critical',
        });
    }

    const words = summary.trim().split(/\s+/).filter(Boolean).length;
    if (words < 45) {
        v.push({
            section:  'summary',
            type:     'too_short',
            detail:   `Summary is only ${words} words — minimum is 60. Expand with one concrete achievement and a forward-looking value statement.`,
            severity: 'critical',
        });
    } else if (words > 115) {
        v.push({
            section:  'summary',
            type:     'too_long',
            detail:   `Summary is ${words} words — maximum is 90. Trim to 3–4 tight sentences.`,
            severity: 'moderate',
        });
    }

    if (BUZZWORD_PATTERN.test(summary)) {
        v.push({
            section:  'summary',
            type:     'buzzword',
            detail:   'Summary contains generic buzzwords ("highly motivated", "results-driven", etc.). Replace with a concrete fact about the candidate.',
            severity: 'moderate',
        });
    }

    return v;
}

function scoreExperience(experience: any[]): QualityViolation[] {
    const v: QualityViolation[] = [];

    for (const role of experience) {
        const bullets: string[] = Array.isArray(role.responsibilities) ? role.responsibilities : [];
        if (bullets.length === 0) continue;

        const label = `"${role.jobTitle || '?'} @ ${role.company || '?'}"`;

        // All-metrics check (recruiter AI signature)
        const withMetric = bullets.filter(b => METRIC_IN_BULLET.test(b)).length;
        if (bullets.length >= 4 && withMetric === bullets.length) {
            v.push({
                section:  'experience',
                type:     'all_metrics',
                detail:   `Role ${label}: every bullet (${bullets.length}/${bullets.length}) has a metric. Max 55% should carry numbers — rewrite 1–2 bullets to be purely qualitative (action + context, no number).`,
                severity: 'critical',
            });
        }

        for (const bullet of bullets) {
            if (FAKE_VERB_PATTERN.test(bullet)) {
                v.push({
                    section:  'experience',
                    type:     'fake_verb',
                    detail:   `Role ${label}: bullet uses an invented AI verb (Greenfielded / Scaffolded / Materialized / Actioned / Ideated / Solutioned). Replace with a real strong verb.`,
                    severity: 'moderate',
                });
                break;
            }
            if (CHAINED_METRIC.test(bullet)) {
                v.push({
                    section:  'experience',
                    type:     'chained_metric',
                    detail:   `Role ${label}: chained-causal metric detected ("X% resulting in Y%"). This is an AI fabrication signal — use a single, standalone metric instead.`,
                    severity: 'moderate',
                });
                break;
            }
        }

        const openerSet = new Set<string>();
        for (const bullet of bullets) {
            const firstWord = bullet.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
            if (!firstWord) continue;
            if (BANNED_OPENER_PATTERN.test(firstWord)) {
                v.push({
                    section:  'experience',
                    type:     'banned_opener',
                    detail:   `Role ${label}: bullet starts with banned verb "${firstWord}" (Spearheaded / Orchestrated / Leveraged / Utilized / Facilitated / Empowered / Championed). Use a real work verb instead.`,
                    severity: 'moderate',
                });
                break;
            }
            if (openerSet.has(firstWord)) {
                v.push({
                    section:  'experience',
                    type:     'duplicate_opener',
                    detail:   `Role ${label}: multiple bullets start with the same verb ("${firstWord}"). Vary openers.`,
                    severity: 'moderate',
                });
                break;
            }
            openerSet.add(firstWord);
        }
    }

    return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2 — Targeted LLM repair (only for CRITICAL violations)
// ─────────────────────────────────────────────────────────────────────────────

async function repairSummary(
    summary: string,
    violations: QualityViolation[],
): Promise<string | null> {
    const violationList = violations.map(v => `• ${v.detail}`).join('\n');

    const prompt = `You are a CV quality editor. Your task is to fix ONLY the listed violations in the professional summary below.

STRICT RULES:
- Keep all real facts, specific technologies, company names, and measurable outcomes exactly as written.
- Do NOT add new achievements, invent numbers, or change any metric.
- The corrected summary must be 60–85 words, 3–4 sentences.
- Open with: [Job title] with [X years] [domain context]. Never open with "I", "A", or a seeking phrase.

VIOLATIONS TO FIX:
${violationList}

SUMMARY TO REPAIR:
${summary}

Return ONLY the corrected summary text. No JSON wrapper, no explanation, no quotes.`;

    try {
        const result = await workerTieredLLM('cvSummary', prompt, {
            temperature: 0.2,
            maxTokens:   350,
            json:        false,
        });
        if (result && result.trim().length > 40) {
            return result.trim().replace(/^["']|["']$/g, '');
        }
    } catch (e) {
        console.debug('[QualityGate] Summary repair LLM call failed (non-fatal):', e);
    }
    return null;
}

async function repairExperience(
    experience: any[],
    violations: QualityViolation[],
): Promise<any[] | null> {
    const violationList = violations.map(v => `• ${v.detail}`).join('\n');

    const prompt = `You are a CV quality editor. Fix ONLY the listed violations in this experience section.

STRICT RULES:
- Never change company names, job titles, start/end dates, or any numbers.
- For "all_metrics" violations: rewrite exactly 1–2 bullets per affected role to be purely qualitative (action + context, no number). Keep the scope-anchor (first bullet) completely unchanged.
- For any other violation: make the minimal change required.

VIOLATIONS TO FIX:
${violationList}

EXPERIENCE ARRAY (JSON):
${JSON.stringify(experience)}

Return ONLY the corrected JSON array. Same structure, same keys. No markdown, no commentary.`;

    try {
        const result = await workerTieredLLM('cvExperience', prompt, {
            temperature: 0.2,
            maxTokens:   3500,
            json:        true,
        });
        if (result) {
            const clean = result.replace(/```(?:json)?|```/g, '').trim();
            const parsed = JSON.parse(clean);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (e) {
        console.debug('[QualityGate] Experience repair LLM call failed (non-fatal):', e);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the quality gate on raw generated sections.
 *
 * - Stage 1: instant regex scoring (always runs).
 * - Stage 2: targeted LLM repair via workerTieredLLM (only for CRITICAL
 *   violations, only when `repair: true`).
 * - Persists all violations to localStorage for the next regeneration call.
 *
 * Guaranteed non-throwing — failures fall through with null repairs.
 */
export async function runQualityGate(
    summary: string,
    experience: any[],
    options: { repair?: boolean } = {},
): Promise<QualityGateResult> {
    const repair = options.repair !== false; // default true

    const summaryViolations    = scoreSummary(summary);
    const experienceViolations = scoreExperience(experience);
    const allViolations        = [...summaryViolations, ...experienceViolations];

    const criticalSummary = summaryViolations.filter(v => v.severity === 'critical');
    const criticalExp     = experienceViolations.filter(v => v.severity === 'critical');

    let repairedSummary:    string | null = null;
    let repairedExperience: any[] | null  = null;
    let repairAttempted = false;

    if (repair) {
        if (criticalSummary.length > 0) {
            repairAttempted = true;
            repairedSummary = await repairSummary(summary, criticalSummary);
            if (repairedSummary) {
                console.info(`[QualityGate] ✓ Summary repaired — ${criticalSummary.length} critical violation(s) fixed.`);
            } else {
                console.warn('[QualityGate] Summary repair returned null — falling through to purifyCV.');
            }
        }

        if (criticalExp.length > 0) {
            repairAttempted = true;
            repairedExperience = await repairExperience(experience, criticalExp);
            if (repairedExperience) {
                console.info(`[QualityGate] ✓ Experience repaired — ${criticalExp.length} critical violation(s) fixed.`);
            } else {
                console.warn('[QualityGate] Experience repair returned null — falling through to purifyCV.');
            }
        }
    }

    if (allViolations.length > 0) {
        console.info(
            `[QualityGate] ${allViolations.length} violation(s) found ` +
            `(${criticalSummary.length + criticalExp.length} critical, ` +
            `${allViolations.length - criticalSummary.length - criticalExp.length} moderate):`,
            allViolations.map(v => `${v.section}:${v.type}`).join(', '),
        );
    }

    // Persist for the next regeneration call regardless of repair outcome.
    _saveViolationsForNextRun(allViolations);

    return { violations: allViolations, repairedSummary, repairedExperience, repairAttempted };
}

/**
 * Returns a compact "DO NOT REPEAT" preamble block built from violations
 * found in the previous generation, then CLEARS the stored key so it only
 * injects once (into the immediately following generation, not all future ones).
 *
 * Returns null if there are no stored violations, or if they are stale.
 */
export function consumePreviousViolationsBlock(): string | null {
    try {
        const raw = localStorage.getItem(LAST_RUN_ISSUES_KEY);
        if (!raw) return null;

        const data = JSON.parse(raw) as { violations: QualityViolation[]; savedAt: number };

        // Discard if stale (stale = different session or browser tab left open).
        if (Date.now() - (data.savedAt ?? 0) > ISSUES_MAX_AGE_MS) {
            localStorage.removeItem(LAST_RUN_ISSUES_KEY);
            return null;
        }

        // Consume — clear so it only fires once.
        localStorage.removeItem(LAST_RUN_ISSUES_KEY);

        const critical = (data.violations ?? []).filter(v => v.severity === 'critical').slice(0, 6);
        if (critical.length === 0) return null;

        const lines = critical.map(v => `• [${v.section}] ${v.detail}`).join('\n');

        return `⚠ PREVIOUS GENERATION ERRORS — THESE MUST NOT APPEAR IN THIS OUTPUT:
${lines}
The above were detected and reported by the automated quality checker after your last response. Every one of them is a failure condition. Fix all of them in this generation before returning any JSON.

`;
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function _saveViolationsForNextRun(violations: QualityViolation[]): void {
    try {
        if (violations.length === 0) {
            localStorage.removeItem(LAST_RUN_ISSUES_KEY);
            return;
        }
        localStorage.setItem(LAST_RUN_ISSUES_KEY, JSON.stringify({
            violations: violations.slice(0, 10),
            savedAt:    Date.now(),
        }));
    } catch { /* storage full / private mode */ }
}

/**
 * A compact 6-line rule block appended to the END of the generation preamble
 * (right before each section's instruction) to exploit LLM recency bias.
 * Rules placed last in the context receive more attention than those buried
 * in the middle of a long profile/JD prompt.
 */
export const CRITICAL_RULES_REMINDER = `
=== FINAL QUALITY CHECK — read this LAST, it overrides all earlier guidance ===
1. Summary: opens with job title + seniority/impact. ZERO "Seeking to", "Looking to", "Aiming to", "Hoping to", "Eager to join", "Excited to contribute".
2. Bullets: ZERO invented verbs — Greenfielded, Scaffolded (non-software), Materialized, Actioned, Ideated, Solutioned, Conceptualized, Operationalized.
3. Bullets: ZERO banned openers — Spearheaded, Orchestrated, Leveraged, Utilized, Facilitated, Empowered, Championed.
4. Buzzwords: ZERO "robust", "seamlessly", "synergy", "innovative solutions", "cutting-edge", "multifaceted", "unwavering commitment", "thought leader".
5. Metrics: NO chained causals ("X% resulting in Y%"). MAX 55% of bullets per role may carry a number.
6. No two bullets across the ENTIRE document start with the same verb.
=== END FINAL CHECK ===
`;
