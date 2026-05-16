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

const LAST_RUN_ISSUES_KEY    = 'cv:lastRunIssues';
const ISSUES_MAX_AGE_MS      = 2 * 60 * 60 * 1000; // 2 hours — stale after that
const MAX_AUTO_REPAIRS       = 2; // cap repair calls to prevent latency death

// Empty metric placeholder — model generated a template like "generating in sales"
// but left the value blank. CRITICAL — ships nonsense prose to users.
const EMPTY_METRIC_PATTERN = /\b(generating|saving|reducing|growing|increasing|cutting|achieving|driving|delivering)\s+in\s+\w/gi;
const EMPTY_METRIC_PATTERN2 = /\bby\s+\w+ing\s+in\s+\w/gi;
const EMPTY_METRIC_PATTERN3 = /\bgrew\s+by\s+in\s/gi;

// JD dump detection — summary paraphrasing the JD instead of the candidate.
// Returns true if 5+ consecutive JD trigrams appear in the summary.
function detectJdDump(summary: string, jd: string): boolean {
    if (!summary || !jd) return false;
    const summaryWords = summary.toLowerCase().split(/\s+/);
    const jdText = jd.toLowerCase();
    let consecutiveMatches = 0;
    for (let i = 0; i < summaryWords.length - 2; i++) {
        const trigram = summaryWords.slice(i, i + 3).join(' ');
        if (trigram.length < 8) { consecutiveMatches = 0; continue; } // skip short trigrams
        if (jdText.includes(trigram)) {
            consecutiveMatches++;
            if (consecutiveMatches >= 3) return true; // 5+ consecutive JD words
        } else {
            consecutiveMatches = 0;
        }
    }
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1 — Fast regex scoring
// ─────────────────────────────────────────────────────────────────────────────

const SEEKING_PATTERN = /\b(seeking to|looking to|aiming to|hoping to|eager to join|excited to contribute|seeking an opportunity|seeking a role|looking for an opportunity)\b/i;

const FAKE_VERB_PATTERN = /\b(greenfielded?|greenfiel(?:ding|s)|scaffolded?|scaffolding|materialized?|materializ(?:es|ing)|actioned?|actioning|ideated?|ideating|solutioned?|solutioning|conceptualized?|operationalized?)\b/i;

const BANNED_OPENER_PATTERN = /^(spearheaded?|orchestrated?|leveraged?|utilized?|facilitated?|empowered?|championed?)\b/i;

const BUZZWORD_PATTERN = /\b(highly motivated|results-driven|results-oriented|passionate about|detail-oriented|team player|self-starter|go-getter|dynamic professional|proactive individual|hard-?working)\b/i;

const METRIC_IN_BULLET = /\b\d[\d,.]*\s*(%|K|M|B|x|×|\+\s*years?|hours?\/(?:week|day|month)|(?:hours?|days?|weeks?|months?|years?)\s+(?:saved|reduced|cut|saved)|users?|clients?|customers?|employees?|staff|team members?|projects?|countries|regions|offices?)\b/i;

const CHAINED_METRIC = /\b\d+\s*%[^.]{0,60}(?:resulting in|leading to|which led to|driving)\s*\d+\s*%/i;

function scoreSummary(summary: string, jd?: string): QualityViolation[] {
    const v: QualityViolation[] = [];

    if (SEEKING_PATTERN.test(summary)) {
        v.push({
            section:  'summary',
            type:     'seeking_opener',
            detail:   'Summary expresses what the candidate wants ("Seeking to…" / "Looking to…") instead of what they deliver. Rewrite to open with the candidate\'s value proposition.',
            severity: 'critical',
        });
    }

    // JD dump detection — summary paraphrasing the JD rather than the candidate.
    if (jd && detectJdDump(summary, jd)) {
        v.push({
            section:  'summary',
            type:     'jd_dump',
            detail:   'Summary paraphrases the job description instead of describing what the candidate has actually done. Rewrite entirely using the candidate\'s own experience and achievements.',
            severity: 'critical',
        });
    }

    const words = summary.trim().split(/\s+/).filter(Boolean).length;
    if (words < 60) {
        v.push({
            section:  'summary',
            type:     'too_short',
            detail:   `Summary is only ${words} words — minimum is 60. Expand with one concrete achievement and a forward-looking value statement across 3–4 sentences.`,
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

// Minimum word count per bullet — anything shorter is a stub that adds no value.
const BULLET_MIN_WORDS = 8;

// Arrow separators ("→") used as sentence connectors inside a bullet. These
// create run-on mega-sentences that don't scan as discrete achievements.
const ARROW_SEPARATOR_PATTERN = /\s*→\s*/;

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

        // Bullet too-short check — stubs like "Reviewed project documentation"
        // (3 words) are truncated AI output, not real bullet points.
        const stubBullets = bullets.filter(b => b.trim().split(/\s+/).filter(Boolean).length < BULLET_MIN_WORDS);
        if (stubBullets.length > 0) {
            v.push({
                section:  'experience',
                type:     'bullet_too_short',
                detail:   `Role ${label}: ${stubBullets.length} bullet(s) under ${BULLET_MIN_WORDS} words — too thin to convey achievement. Each bullet needs an action verb, context, and scope. Stubs: ${stubBullets.map(b => `"${b.trim().slice(0, 40)}"` ).join(', ')}.`,
                severity: 'critical',
            });
        }

        // Rhythm check — ≥3 consecutive bullets all under 12 words signals flat
        // machine-output with no short-long-short-long variation.
        const SHORT_THRESHOLD = 12;
        let consecutiveShort = 0;
        let maxConsecutiveShort = 0;
        for (const b of bullets) {
            const wc = b.trim().split(/\s+/).filter(Boolean).length;
            if (wc < SHORT_THRESHOLD) {
                consecutiveShort++;
                maxConsecutiveShort = Math.max(maxConsecutiveShort, consecutiveShort);
            } else {
                consecutiveShort = 0;
            }
        }
        if (maxConsecutiveShort >= 3) {
            v.push({
                section:  'experience',
                type:     'flat_bullet_rhythm',
                detail:   `Role ${label}: ${maxConsecutiveShort} consecutive short bullets (all under ${SHORT_THRESHOLD} words). Mix bullet lengths — short punchy bullets (8–10 words) should alternate with fuller ones (15–22 words) to create natural reading rhythm.`,
                severity: 'moderate',
            });
        }

        // Arrow separator check — "→" used to chain sentences inside one bullet
        // creates unreadable mega-bullets and is a clear AI output artefact.
        const arrowBullets = bullets.filter(b => ARROW_SEPARATOR_PATTERN.test(b));
        if (arrowBullets.length > 0) {
            v.push({
                section:  'experience',
                type:     'arrow_separator',
                detail:   `Role ${label}: ${arrowBullets.length} bullet(s) use "→" as a sentence separator. Split into separate bullets or rewrite as a single continuous achievement sentence.`,
                severity: 'moderate',
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
            // Empty metric placeholder — the model left a template stub like
            // "generating in sales" / "grew by in volume" with no real number.
            if (EMPTY_METRIC_PATTERN.test(bullet) || EMPTY_METRIC_PATTERN2.test(bullet) || EMPTY_METRIC_PATTERN3.test(bullet)) {
                v.push({
                    section:  'experience',
                    type:     'empty_metric_placeholder',
                    detail:   `Role ${label}: bullet contains an empty metric placeholder ("generating in…" / "grew by in…"). Either fill the real number or rewrite as a qualitative achievement.`,
                    severity: 'critical',
                });
                // reset regex lastIndex after /g use
                EMPTY_METRIC_PATTERN.lastIndex = 0;
                EMPTY_METRIC_PATTERN2.lastIndex = 0;
                EMPTY_METRIC_PATTERN3.lastIndex = 0;
                break;
            }
            EMPTY_METRIC_PATTERN.lastIndex = 0;
            EMPTY_METRIC_PATTERN2.lastIndex = 0;
            EMPTY_METRIC_PATTERN3.lastIndex = 0;
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
// Skills scorer — checks for duplicate entries (case-insensitive) that signal
// a copy-paste or AI hallucination artefact where the same skill appears twice
// under different headings or slightly different capitalisation.
// ─────────────────────────────────────────────────────────────────────────────

function scoreSkills(skills: string[]): QualityViolation[] {
    const v: QualityViolation[] = [];
    if (!Array.isArray(skills) || skills.length === 0) return v;

    const seen = new Map<string, string>(); // normalised → original
    const dupes: string[] = [];

    for (const skill of skills) {
        if (typeof skill !== 'string' || !skill.trim()) continue;
        const key = skill.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key)) {
            dupes.push(skill.trim());
        } else {
            seen.set(key, skill.trim());
        }
    }

    if (dupes.length > 0) {
        v.push({
            section:  'skills',
            type:     'duplicate_skill',
            detail:   `Skills list contains ${dupes.length} duplicate(s): ${dupes.map(s => `"${s}"`).join(', ')}. Remove the duplicates — each skill should appear exactly once.`,
            severity: 'moderate',
        });
    }

    return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Projects scorer — checks arrow separators inside project descriptions.
// ─────────────────────────────────────────────────────────────────────────────

function scoreProjects(projects: any[]): QualityViolation[] {
    const v: QualityViolation[] = [];
    if (!Array.isArray(projects)) return v;

    const arrowProjects = projects.filter(p => typeof p?.description === 'string' && ARROW_SEPARATOR_PATTERN.test(p.description));
    if (arrowProjects.length > 0) {
        v.push({
            section:  'projects',
            type:     'arrow_separator',
            detail:   `${arrowProjects.length} project description(s) use "→" as a sentence separator (${arrowProjects.map((p: any) => `"${(p.name || 'unnamed').slice(0, 30)}"`).join(', ')}). Rewrite as flowing prose sentences — do not use arrows to chain clauses.`,
            severity: 'moderate',
        });
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
 *   violations, only when `repair: true`). Capped at MAX_AUTO_REPAIRS calls
 *   total to prevent latency creep on badly-structured generations.
 * - Persists all violations to localStorage keyed by profileFingerprint so
 *   violations from one profile never pollute another slot.
 *
 * Guaranteed non-throwing — failures fall through with null repairs.
 */
export async function runQualityGate(
    summary: string,
    experience: any[],
    options: { repair?: boolean; jd?: string; profileFingerprint?: string; skills?: string[]; projects?: any[] } = {},
): Promise<QualityGateResult> {
    const repair = options.repair !== false; // default true

    const summaryViolations    = scoreSummary(summary, options.jd);
    const experienceViolations = scoreExperience(experience);
    const skillsViolations     = options.skills ? scoreSkills(options.skills) : [];
    const projectsViolations   = options.projects ? scoreProjects(options.projects) : [];
    const allViolations        = [...summaryViolations, ...experienceViolations, ...skillsViolations, ...projectsViolations];

    const criticalSummary = summaryViolations.filter(v => v.severity === 'critical');
    const criticalExp     = experienceViolations.filter(v => v.severity === 'critical');

    let repairedSummary:    string | null = null;
    let repairedExperience: any[] | null  = null;
    let repairAttempted = false;
    let repairCallsUsed = 0;

    if (repair) {
        if (criticalSummary.length > 0 && repairCallsUsed < MAX_AUTO_REPAIRS) {
            repairAttempted = true;
            repairCallsUsed++;
            repairedSummary = await repairSummary(summary, criticalSummary);
            if (repairedSummary) {
                console.info(`[QualityGate] ✓ Summary repaired — ${criticalSummary.length} critical violation(s) fixed.`);
            } else {
                console.warn('[QualityGate] Summary repair returned null — falling through to purifyCV.');
            }
        }

        if (criticalExp.length > 0 && repairCallsUsed < MAX_AUTO_REPAIRS) {
            repairAttempted = true;
            repairCallsUsed++;
            repairedExperience = await repairExperience(experience, criticalExp);
            if (repairedExperience) {
                console.info(`[QualityGate] ✓ Experience repaired — ${criticalExp.length} critical violation(s) fixed.`);
            } else {
                console.warn('[QualityGate] Experience repair returned null — falling through to purifyCV.');
            }
        }

        if (repairCallsUsed >= MAX_AUTO_REPAIRS && (criticalSummary.length + criticalExp.length) > repairCallsUsed) {
            console.warn(`[QualityGate] Repair budget exhausted (${MAX_AUTO_REPAIRS} calls). Remaining critical violations will be handled by purifyCV.`);
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
    _saveViolationsForNextRun(allViolations, options.profileFingerprint);

    return { violations: allViolations, repairedSummary, repairedExperience, repairAttempted };
}

/**
 * Returns a compact "DO NOT REPEAT" preamble block built from violations
 * found in the previous generation, then CLEARS the stored key so it only
 * injects once (into the immediately following generation, not all future ones).
 *
 * Returns null if there are no stored violations, or if they are stale.
 */
export function consumePreviousViolationsBlock(profileFingerprint?: string): string | null {
    try {
        const raw = localStorage.getItem(LAST_RUN_ISSUES_KEY);
        if (!raw) return null;

        const data = JSON.parse(raw) as { violations: QualityViolation[]; savedAt: number; profileFingerprint?: string | null };

        // Discard if stale (stale = different session or browser tab left open).
        if (Date.now() - (data.savedAt ?? 0) > ISSUES_MAX_AGE_MS) {
            localStorage.removeItem(LAST_RUN_ISSUES_KEY);
            return null;
        }

        // Discard if the violations are from a different profile slot.
        // This prevents slot-A violations from appearing in slot-B's generation.
        if (profileFingerprint && data.profileFingerprint && data.profileFingerprint !== profileFingerprint) {
            console.debug('[QualityGate] Discarding stored violations — different profile fingerprint.');
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

function _saveViolationsForNextRun(violations: QualityViolation[], profileFingerprint?: string): void {
    try {
        if (violations.length === 0) {
            localStorage.removeItem(LAST_RUN_ISSUES_KEY);
            return;
        }
        localStorage.setItem(LAST_RUN_ISSUES_KEY, JSON.stringify({
            violations:          violations.slice(0, 10),
            savedAt:             Date.now(),
            profileFingerprint:  profileFingerprint ?? null,
        }));
    } catch { /* storage full / private mode */ }
}

/**
 * A compact 6-line rule block appended to the END of the generation preamble
 * (right before each section's instruction) to exploit LLM recency bias.
 * Rules placed last in the context receive more attention than those buried
 * in the middle of a long profile/JD prompt.
 */
// CRITICAL_RULES_REMINDER text has been moved to the CF Worker (GET /api/cv/rules → criticalRulesReminder).
// geminiService.ts uses _criticalRulesReminder (populated by loadRules() at boot) instead.
// Exported as empty string so any stale import site causes no regression — the Worker-fetched
// version is always used for generation.
export const CRITICAL_RULES_REMINDER = '';
