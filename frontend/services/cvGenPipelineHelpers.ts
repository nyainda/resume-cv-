/**
 * Post-generation pipeline helpers: validator, audit, banned filter, silent guardian.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile, CVData } from '../types';
import { groqChat, GROQ_LARGE, GROQ_FAST } from './groqService';
import {
  SYSTEM_INSTRUCTION_PROFESSIONAL, SYSTEM_INSTRUCTION_HUMANIZER,
  SYSTEM_INSTRUCTION_PARSER, CV_DATA_SCHEMA,
  _validatorSystem, _auditSystem, HUMANIZATION_RULES,
} from './pipelineRules';
import { purifyCV, type PurifyReport } from './cvPurificationPipeline';
import { buildMetricsCeiling } from './cvDetectionHelpers';
import { getCachedBannedPhrases } from './cvEngineClient';

export async function runGroqValidator(
    cvData: CVData,
    rawExperience: string,
    currency: string,
    seniority: string,
    market: string,
    scenario: 'A' | 'B' | 'C' | 'D' | 'standard' = 'standard',
    hasSourceProjects: boolean = false
): Promise<CVData> {
    const metricsCeiling = buildMetricsCeiling(seniority, currency);

    // Scenario-specific checks injected only when relevant
    const scenarioChecks = scenario === 'standard' ? '' : `
CHECK 7 — EMPTY SECTION GUARD (applies to all scenarios)
Scan the entire CV. If any section key is present but its value is an empty array, empty string, or null → FLAG "Empty section: [name]" → Remove the key entirely.
An absent section is professional. An empty section header with no content is not.

CHECK 8 — FABRICATED SECTION GUARD
${scenario === 'B' || scenario === 'D'
    ? `SCENARIO ${scenario}: The source profile has NO personal projects.
If the generated CV contains a "projects" array with any entries → FLAG "Fabricated projects section" → Remove the entire projects array.
EXCEPTION: If a project entry is explicitly labelled as "Academic Project, [Institution], [Year]" AND the user's education data supports it → keep it.`
    : scenario === 'A'
    ? `SCENARIO A: The source profile has NO work experience AND NO personal projects.
If the generated CV contains an "experience" array with any entries → FLAG "Fabricated work experience" → Remove the entire experience array.
If the generated CV contains project entries NOT labelled as academic projects → FLAG "Fabricated project" → Remove those entries.`
    : scenario === 'C'
    ? `SCENARIO C: The source profile has NO work experience.
If the generated CV contains an "experience" array with entries that are NOT internships, attachments, volunteer technical work, or freelance work → FLAG "Fabricated work experience" → Remove those entries.`
    : ''}

CHECK 9 — SKILLS EVIDENCE AUDIT (thin CVs only — seniority: ${seniority})
${seniority === 'intern' ? `This is an intern/entry-level profile. Every skill listed must be directly traceable to:
  a) A named course or module in the education section, OR
  b) A project entry in the CV, OR
  c) A bullet point in an experience entry.
Skills with no evidence trail → FLAG "Unevidenced skill: [name]" → Remove from skills array.
Maximum tolerance: 0 unevidenced skills for Scenario A/C profiles.` : 'Skip Check 9 — not a thin CV profile.'}

CHECK 10 — SCENARIO SUMMARY CONSISTENCY
${scenario === 'A' ? `SCENARIO A: The summary must NOT imply professional work history. If it contains phrases like "X years of professional experience", "proven track record in [industry]", or any language implying paid employment → FLAG "Summary implies non-existent experience" → Rewrite as a Foundation Summary: [Degree/field/institution] + [specific capabilities from coursework] + [one academic achievement] + [readiness to contribute].`
    : scenario === 'C' ? `SCENARIO C: The summary must NOT imply paid work history. It must be a Projects-Led Summary: [identity as builder] + [strongest project outcome with metric] + [core technical stack] + [readiness to contribute to a team].`
    : scenario === 'D' ? `SCENARIO D: The summary must NOT overstate experience. It must be an Emerging Professional summary grounded in the single internship/attachment — no claims beyond what that role and education can support.`
    : ''}
`;

    const validatorPrompt = `
You are a strict CV quality validator for the global job market.

You have received:
- The generated CV to validate (below)
- The user's original raw work experience (source of truth)
- DETECTED CURRENCY: ${currency}
- DETECTED SENIORITY: ${seniority}
- DETECTED MARKET: ${market}
- METRIC CEILINGS: ${metricsCeiling}
- CANDIDATE SCENARIO: ${scenario} ${scenario !== 'standard' ? '(special handling required — see checks 7–10)' : '(standard profile)'}
- SOURCE PROFILE HAS PROJECTS: ${hasSourceProjects}

USER'S ORIGINAL RAW EXPERIENCE (source of truth — company names from here are the ONLY valid ones):
${rawExperience}

GENERATED CV TO VALIDATE:
${JSON.stringify(cvData)}

Run ALL checks below in strict order. Do not skip any check.

CHECK 1 — COMPANY INTEGRITY
Every company name in the generated CV must be one of:
  a) A company provided by the user in their original experience
  b) A self-directed freelance/consulting entry with no company name ("Independent Consultant" or "Freelance [Role]")
Any invented company name → FLAG "Unverifiable company: [name]" → Remove the entire experience entry.

CHECK 2 — TIMELINE LOGIC
No role's start date after its own end date. No two full-time roles at different employers overlap by more than 1 month. Any self-directed entry must sit cleanly within a detected gap.
Any timeline violation → FLAG and correct where obvious, remove where it cannot be explained.

CHECK 3 — METRIC BELIEVABILITY & TYPE CLASSIFICATION
Apply the metric ceilings above. Anything above the ceiling → FLAG "Metric too high for ${seniority} in ${market}: [metric]" → Reduce to the top of the acceptable range.
Suspiciously round numbers (exactly 50, exactly 10M, exactly 20%) → make them specific and slightly irregular.

METRIC TYPE RULES — apply these BEFORE checking the ceiling:
a) SALARY/COMPENSATION metrics — any phrase like "earning X/month", "salary of X", "package of X", "take-home X", "CTC X", "remuneration X" in an experience bullet → FLAG "Personal salary in bullet: [phrase]" → Remove the salary phrase entirely. A CV bullet describes impact and achievement, not personal pay.
b) PROJECT VALUE / BUDGET metrics — phrases like "managed a KES X project", "project budget of X", "contract value X", "project worth X" are LEGITIMATE for civil engineers, project managers, procurement officers, and contractors. Apply the "Max project value" ceiling, not the "Max revenue" ceiling.
c) SALES / REVENUE metrics — phrases like "generated X in revenue", "closed X in deals", "grew revenue by X%" are LEGITIMATE for sales, business development, and commercial roles. Apply the "Max revenue/yr" ceiling.
d) Do NOT confuse a civil engineer's "KES 50M infrastructure project" with a fabricated revenue claim — judge by context (project, contract, budget, scheme, works = project value; revenue, sales, deals, bookings = sales metric).

CHECK 4 — CURRENCY CONSISTENCY
Scan every bullet, section, and summary for currency symbols. More than one distinct currency → FLAG "Currency mixing" → Remove all monetary figures from affected sections, rewrite as percentages and counts.
Any currency symbol when DETECTED CURRENCY is NONE → FLAG → Remove all monetary figures.

CHECK 5 — SENIORITY CONSISTENCY
Job titles and responsibilities must match ${seniority} level.
Intern/Junior with team of 10+ → FLAG. Junior with multi-million claims → FLAG. "Director/Head of/VP" under 5 years → FLAG.
Any mismatch → rewrite to correct seniority level.

CHECK 6 — SKILLS PLAUSIBILITY
Every skill must be plausible for the user's industry, role type, and background.
Completely disconnected skills → FLAG "Implausible skill: [name]" → Remove.
${scenarioChecks}
OUTPUT FORMAT — return JSON only, no markdown, no explanation:
{"valid": true|false, "flags": ["description1", ...], "cv": <full corrected cv data object>}
The "cv" field must ALWAYS be present — even when all checks pass.
`;

    const validatorSystem = _validatorSystem || 'You are a strict CV quality validator. Return only valid JSON.';
    const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // ── Safe merge: if the validator response was truncated and dropped roles/projects,
    // restore them from the pre-validation cvData so the user never loses content.
    const safeValidatorMerge = (validatedCv: any): CVData => {
        if (!validatedCv || typeof validatedCv !== 'object') return cvData;
        // Normalize: LLM may return array fields as {} instead of []. Fix before
        // passing the merged CV into the purification pipeline to prevent
        // "(t.education || []).map is not a function" crashes.
        const toA = (v: unknown) => Array.isArray(v) ? v : [];
        if (!Array.isArray(validatedCv.education))      validatedCv.education      = toA(null);
        if (!Array.isArray(validatedCv.skills))         validatedCv.skills         = toA(null);
        if (!Array.isArray(validatedCv.experience))     validatedCv.experience     = toA(null);
        if (!Array.isArray(validatedCv.projects))       validatedCv.projects       = toA(null);
        if (!Array.isArray(validatedCv.certifications)) validatedCv.certifications = toA(null);

        let merged = { ...validatedCv };

        // Restore experience roles that didn't fit in the validator's token budget
        if (Array.isArray(cvData.experience) && cvData.experience.length > 0) {
            const retainedExp: any[] = Array.isArray(merged.experience) ? merged.experience : [];
            if (retainedExp.length < cvData.experience.length) {
                console.warn(
                    `[CV Validator] Response had ${retainedExp.length}/${cvData.experience.length} roles — ` +
                    `restoring ${cvData.experience.length - retainedExp.length} truncated role(s) from pre-validation CV.`
                );
                const validatedKeys = new Set(retainedExp.map((e: any) => `${e.company}|${e.jobTitle}`));
                const restored = [...retainedExp];
                for (const orig of cvData.experience) {
                    if (!validatedKeys.has(`${orig.company}|${orig.jobTitle}`)) {
                        restored.push(orig);
                    }
                }
                // Re-sort to match original profile order
                const order = new Map(cvData.experience.map((e, i) => [`${e.company}|${e.jobTitle}`, i]));
                restored.sort((a: any, b: any) =>
                    (order.get(`${a.company}|${a.jobTitle}`) ?? 999) -
                    (order.get(`${b.company}|${b.jobTitle}`) ?? 999)
                );
                merged = { ...merged, experience: restored };
            }
        }

        // Restore projects if validator dropped them entirely (token budget exhausted after experience)
        if (Array.isArray(cvData.projects) && cvData.projects.length > 0) {
            if (!Array.isArray(merged.projects) || merged.projects.length === 0) {
                console.warn('[CV Validator] Projects absent in validator response — restoring from pre-validation CV.');
                merged = { ...merged, projects: cvData.projects };
            }
        }

        // Restore certifications if dropped
        if (Array.isArray(cvData.certifications) && cvData.certifications.length > 0) {
            if (!Array.isArray(merged.certifications) || merged.certifications.length === 0) {
                merged = { ...merged, certifications: cvData.certifications };
            }
        }

        return merged as CVData;
    };

    // Use Cloudflare Workers AI only when it is the selected provider.
    // When user has chosen Claude or Gemini, skip directly to groqChat (which
    // routes through their selected provider) — no wasted timeout on Worker AI.
    if (getSelectedProvider() === 'workers-ai') {
        try {
            const cf = await workerTieredLLM('cvValidate', validatorPrompt, {
                system: validatorSystem,
                temperature: 0.1,
                json: true,
                maxTokens: 6000,
            });
            if (cf) {
                try {
                    const parsed = JSON.parse(stripFences(cf));
                    if (parsed.flags && parsed.flags.length > 0) {
                        console.warn('[CV Validator] Flags raised (cf):', parsed.flags);
                    }
                    console.log('[CV Validator] Pass complete via Cloudflare Workers AI (tiered: cvValidate).');
                    return safeValidatorMerge(parsed.cv || cvData);
                } catch (parseErr) {
                    console.warn('[CV Validator] Worker JSON parse failed, falling back to selected provider:', parseErr);
                }
            }
        } catch (cfErr) {
            console.warn('[CV Validator] Worker call failed, falling back to selected provider:', cfErr);
        }
    }

    try {
        const result = await groqChat(GROQ_LARGE, validatorSystem, validatorPrompt, { temperature: 0.1, json: true, maxTokens: 6000 });
        const parsed = JSON.parse(stripFences(result));
        if (parsed.flags && parsed.flags.length > 0) {
            console.warn('[CV Validator] Flags raised:', parsed.flags);
        }
        return safeValidatorMerge(parsed.cv || cvData);
    } catch (e) {
        console.error('[CV Validator] Validation failed, returning original:', e);
        return cvData;
    }
}

/**
 * PART 7 — Humanization Audit Pass.
 * Runs after the Groq validator (or after Gemini generation in Honest mode).
 * Checks and fixes: short bullets, banned phrases, metric overload, and uniform rhythm.
 */
/**
 * Build the PROBLEM 9 ("must-fix leaks") block for the audit prompt.
 *
 * We only forward leak types where the LLM has a fighting chance of doing better
 * than the deterministic layer because it has surrounding context AND access to
 * the candidate's voice — round numbers, orphan metrics (gerund-without-digit
 * fragments the regex was forced to drop), and band imbalance (rhythm).
 *
 * Why these three specifically:
 *   • round_number          — jitter is deliberately disabled (it lied about real
 *                             100% achievements). The AI can ask itself "is this
 *                             a placeholder or the truth?" using surrounding
 *                             context, which the regex cannot.
 *   • orphan_metric         — stripOrphanMetrics conservatively DROPS the dangling
 *                             clause to avoid fabricating outcomes. The AI can
 *                             rebuild the bullet with real claims from the rest
 *                             of the role.
 *   • bullet_band_imbalance — pure rhythm flag. Already covered by PROBLEM 5
 *                             but worth surfacing the SPECIFIC offending role
 *                             so the editor doesn't have to re-derive it.
 *
 * Everything else (banned phrases, repeated phrases, tense, casing, whitespace,
 * skill canonicalisation, etc.) the deterministic layer already FIXES — it would
 * be wasteful to re-ask the LLM.
 */
export function buildMustFixLeakBlock(leaks: ReadonlyArray<{ leakType: string; phrase?: string; fieldLocation?: string; contextSnippet?: string }>): string {
    const FORWARDED = new Set(['round_number', 'orphan_metric', 'bullet_band_imbalance']);
    const filtered = leaks.filter(l => FORWARDED.has(l.leakType));
    if (filtered.length === 0) return '';

    // Cap at 12 entries to keep the prompt token-budget sane on heavy CVs.
    const capped = filtered.slice(0, 12);
    const lines = capped.map((l, i) => {
        const loc = l.fieldLocation ? ` [${l.fieldLocation}]` : '';
        const snippet = l.contextSnippet ? ` — "${l.contextSnippet.slice(0, 140)}"` : '';
        return `  ${i + 1}. ${l.leakType}${loc}: ${l.phrase || ''}${snippet}`;
    }).join('\n');

    return `

PROBLEM 9 — DETERMINISTIC PURIFY FLAGGED THESE SPECIFIC LEAKS (must fix every one):
The deterministic purify layer ran a pre-scan and identified the following items it could NOT safely auto-fix without inventing content. You have access to the full CV context and the candidate's voice — fix them using truthful surrounding signal:

${lines}

How to fix each leakType:
  • round_number — the metric reads as suspicious (e.g. "exactly 25%", "exactly 50,000", "exactly 100"). If a less-round figure (e.g. "27%", "48,200", "11") is supported by other parts of the same bullet/role, use that. If you cannot ground a precise number, REWRITE the bullet to use scope language ("across 11 counties", "for the largest cohort to date") instead of inventing a digit. Never fabricate a number.
  • orphan_metric — the bullet contains/contained a gerund clause that promised a metric but had none ("achieving water savings", "cutting lead time"). The regex stripped the clause; you should REBUILD the outcome with a concrete result drawn from the rest of the role's responsibilities, the company name, or the role title. If no real outcome can be grounded, leave the bullet shorter rather than fabricate.
  • bullet_band_imbalance — the named role has ≥5 bullets all in the same length band. Apply PROBLEM 5's mix rule SPECIFICALLY to this role: shorten one bullet to the punchy band (8–14 words) AND/OR expand the strongest bullet into a two-sentence narrative (25–40 words).
`.trimEnd();
}

export async function runHumanizationAudit(cvData: CVData, mustFixLeaks: ReadonlyArray<{ leakType: string; phrase?: string; fieldLocation?: string; contextSnippet?: string }> = []): Promise<CVData> {
    // Sync the prompt with the LIVE banned-phrase list from the worker's KV cache
    // (D1 → KV → here). Falls back to the small hardcoded list when offline so the
    // pipeline never breaks. Cap at 80 phrases to keep the prompt token-budget sane.
    const HARDCODED_BANNED_BULLETS = '"delve", "robust", "seamlessly", "synergy", "cutting-edge", "state-of-the-art", "passionate about", "dynamic team", "innovative solutions", "results-driven", "detail-oriented", "team player", "go-getter", "responsible for", "helped with", "assisted in", "tasked with", "worked on", "was part of", "participated in", "contributed to"';
    const HARDCODED_BANNED_SUMMARY = '"passionate", "driven", "innovative", "seasoned professional", "dynamic", "cutting-edge", "result-oriented", "proactive", "detail-oriented", "versatile"';
    let liveBannedBullets = HARDCODED_BANNED_BULLETS;
    let liveBannedSummary = HARDCODED_BANNED_SUMMARY;
    let liveCount = 0;
    try {
        const banned = await getCachedBannedPhrases();
        if (banned && banned.length) {
            const phrases = banned.map(b => b.phrase).filter(p => typeof p === 'string' && p.length > 0);
            // Cap at 40 (not 80) — keeps the humanizer prompt under Groq's TPM limit
            // while still covering the most common AI-ism violations.
            const bulletList = phrases.slice(0, 40);
            liveBannedBullets = bulletList.map(p => `"${p.replace(/"/g, '\\"')}"`).join(', ');
            // Summary check: single-word adjectives only (1 token, no spaces)
            const summaryList = phrases.filter(p => !p.includes(' ') && p.length <= 18).slice(0, 20);
            if (summaryList.length >= 5) {
                liveBannedSummary = summaryList.map(p => `"${p.replace(/"/g, '\\"')}"`).join(', ');
            }
            liveCount = phrases.length;
        }
    } catch (e) {
        console.warn('[CV Humanizer] Live banned-phrase fetch failed, using hardcoded list:', e);
    }
    if (liveCount > 0) {
        console.log(`[CV Humanizer] Audit prompt synced with ${liveCount} live banned phrases from CV engine.`);
    }

    const mustFixBlock = buildMustFixLeakBlock(mustFixLeaks);
    if (mustFixBlock) {
        console.log(`[CV Humanizer] Forwarding ${mustFixLeaks.filter(l => ['round_number', 'orphan_metric', 'bullet_band_imbalance'].includes(l.leakType)).length} must-fix leak(s) into audit prompt.`);
    }

    let auditPrompt = `
You are a senior career writing editor with 20 years of experience. You are reviewing a CV JSON object.
Your ONLY job is to fix the specific problems listed below. Do not rewrite anything that isn't broken. Do not change dates, company names, job titles, or skills. Return the complete, corrected JSON.

PROBLEMS TO FIX — check every experience role's responsibilities array:

PROBLEM 1 — STUB BULLETS (expand any bullet under 8 words):
A bullet under 8 words is a stub — too thin to carry any signal. Expand it by adding context: scope, who was affected, the outcome, or how it was done. Keep it truthful to what the bullet was saying. Bullets in the 8–14 word "punchy" band are intentional and should be kept short and crisp.
Example fix:
  BEFORE: "Managed client accounts."  (3 words — stub)
  AFTER:  "Managed 11 commercial accounts across Eastern Kenya."  (8 words — punchy, kept short)

PROBLEM 2 — BANNED PHRASES (replace these with specific, direct language):
Scan for and replace: ${liveBannedBullets}.
Replace each with a direct action verb or a specific description of what was actually done.

PROBLEM 3 — METRIC DENSITY (target 40–65% of bullets per role having a number):
Count bullets per role.
• If MORE than 65% contain a number: rewrite the excess bullets to remove numbers but keep them vivid using scope language ("across 4 counties", "for a national client base", "within a small cross-functional team"). Keep numbers in the bullets with the STRONGEST outcomes; remove from the weakest.
• If FEWER than 30% contain a number AND the role is in engineering, sales, operations, finance, or field-based work: add a conservative inferred metric to the weakest descriptive bullets. Use approximation language ("~", "12+", "up to X"). Never invent figures that cannot be inferred from the bullet content.
Priority: keep numbers in the bullets with the STRONGEST outcomes.

PROBLEM 4 — DUPLICATE VERB STARTERS (no two bullets across the whole document may start with the same verb):
Scan all responsibilities across ALL roles. If two bullets start with the same verb, rewrite the second one to start with a different strong action verb.

PROBLEM 5 — MONOTONE BULLET RHYTHM (each role must MIX bullet lengths):
Within each role, count bullets by length band: punchy (8–14 words), standard (15–22 words), narrative (25–40 words, two sentences). The mix scales with the role's bullet count N:
  • N=3 → 1 punchy + 2 standard (narrative optional).
  • N=4–5 → 1 punchy + 2–3 standard + 1 narrative.
  • N=6–7 → 2 punchy + 3–4 standard + 1 narrative.
  • N=8–10 → 2 punchy + 4–5 standard + 2–3 narrative.
A role with ≥5 bullets that uses ONLY ONE band (e.g. eight bullets all in the standard band) = failure, regardless of how many bullets it has. If every bullet in a role is within 5 words of the role's average, that's also a failure. Fix by: shortening one bullet to the punchy band, OR expanding the strongest bullet to a two-sentence narrative (one short context sentence + one outcome sentence). Never make all bullets the same length.

PROBLEM 6 — AI TONE PHRASES IN SUMMARY (check professionalSummary field):
The professional summary must not contain: ${liveBannedSummary}.
Replace with specific factual claims: years of experience, industries served, measurable outcomes, or named skills.
The summary's first sentence MUST start with either the candidate's job title or their years of experience — never with "I", "A", or "An".

PROBLEM 7 — VERB TENSE CONSISTENCY (check every role's responsibilities array):
For each role: if endDate is "Present" or empty/null, ALL bullets in that role must use PRESENT TENSE (Manages, Leads, Coordinates).
For all other roles (past jobs), ALL bullets must use PAST TENSE (Managed, Led, Coordinated).
If you find tense mixing within a single role, rewrite the offending bullets to match the correct tense.

PROBLEM 8 — FIRST BULLET MUST BE A SCOPE ANCHOR:
The first bullet of EVERY role should describe the SCOPE of the role (team size, geographic coverage, client count, budget, project count) — not an achievement.
If the first bullet is currently an achievement bullet, keep it as bullet #2 and write a new scope anchor as bullet #1.
If the role already has 6 bullets, remove the weakest achievement bullet to make room for the scope anchor.
${mustFixBlock}

Here is the CV section to audit and correct (summary + experience only):
${JSON.stringify({ summary: cvData.summary, experience: cvData.experience })}

Return ONLY a JSON object with exactly two keys: "summary" (string) and "experience" (array). No markdown, no code fences, no other fields.
`.trim();

    // --- Prompt-size guard ---
    // Groq llama-3.3-70b-versatile has a 128K token context but the free tier
    // has a strict Tokens-Per-Minute limit. A large CV + long prompt can push a
    // single request over the TPM budget, causing a 413.
    // Approx 4 chars ≈ 1 token. We target <5 000 tokens total input (~20 000 chars).
    const HUMANIZER_CHAR_LIMIT = 20_000;
    const promptChars = auditPrompt.length;
    if (promptChars > HUMANIZER_CHAR_LIMIT) {
        console.warn(`[CV Humanizer] Prompt ${promptChars.toLocaleString()} chars > ${HUMANIZER_CHAR_LIMIT.toLocaleString()} — truncating CV experience to 3 roles to stay under Groq TPM limit.`);
        const slimExp = (cvData.experience ?? []).slice(0, 3);
        const slimJson = JSON.stringify({ summary: cvData.summary, experience: slimExp });
        auditPrompt = auditPrompt.replace(
            /Here is the CV section to audit.*$/s,
            `Here is the CV section to audit and correct (summary + top 3 experience roles only):\n${slimJson}\n\nReturn ONLY a JSON object with exactly two keys: "summary" (string) and "experience" (array). No markdown, no code fences, no other fields.`,
        );
    }

    const auditSystem = _auditSystem || 'You are a strict CV editor. Fix only the listed problems. Return only valid JSON with keys: summary and experience.';
    const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // Helper: merge the auditor's partial response (only summary + experience)
    // back into the full CV so nothing else is lost.
    // Attempt to recover truncated JSON by walking backwards to find the last
    // well-formed root closing brace. Mistral Small sometimes stops mid-string
    // when the output nears the token limit, leaving a JSON parse error at the
    // truncation point (e.g. "Expected ',' or '}' at position 2667").
    const repairJson = (s: string): string => {
        try { JSON.parse(s); return s; } catch {}
        for (let i = s.length - 1; i >= 0; i--) {
            if (s[i] === '}') {
                const candidate = s.slice(0, i + 1);
                try { JSON.parse(candidate); return candidate; } catch {}
            }
        }
        return s;
    };

    const mergePartial = (raw: string): CVData => {
        const partial = JSON.parse(repairJson(stripFences(raw)));
        const merged: CVData = { ...cvData };
        if (typeof partial.summary === 'string' && partial.summary.trim()) {
            merged.summary = partial.summary;
        }
        if (Array.isArray(partial.experience) && partial.experience.length > 0) {
            merged.experience = partial.experience;
        }
        // If the model returned the whole CV anyway, accept it wholesale.
        if (partial.skills || partial.education || partial.fullName) {
            return partial as CVData;
        }
        return merged;
    };

    // Use Cloudflare Workers AI only when it is the selected provider.
    if (getSelectedProvider() === 'workers-ai') {
        try {
            const cf = await workerTieredLLM('cvAudit', auditPrompt, {
                system: auditSystem,
                temperature: 0.15,
                json: true,
                maxTokens: 8192,
            });
            if (cf) {
                try {
                    const merged = mergePartial(cf);
                    console.log('[CV Humanizer] Audit pass complete via Cloudflare Workers AI (tiered: cvAudit).');
                    return merged;
                } catch (parseErr) {
                    console.warn('[CV Humanizer] Worker JSON parse failed, falling back to selected provider:', parseErr);
                }
            }
        } catch (cfErr) {
            console.warn('[CV Humanizer] Worker call failed, falling back to selected provider:', cfErr);
        }
    }

    try {
        const result = await groqChat(GROQ_LARGE, auditSystem, auditPrompt, { temperature: 0.15, json: true, maxTokens: 8192, task: 'humanize' });
        const merged = mergePartial(result);
        console.log('[CV Humanizer] Audit pass complete.');
        return merged;
    } catch (e) {
        console.error('[CV Humanizer] Audit pass failed, returning original:', e);
        return cvData;
    }
}

/**
 * PART 8 — Deterministic Banned-Phrase Filter.
 *
 * This is a pure JavaScript pass — no AI call, no network, cannot fail.
 * It runs as the absolute last step before the CV is returned to the user,
 * acting as a guaranteed backstop regardless of what any prior AI pass did.
 *
 * Two tiers:
 *   TIER 1 — Standalone adjectives/adverbs: safe to remove word-only (won't break grammar).
 *   TIER 2 — Opener phrases ("responsible for X"): remove the opener, keep the rest of the sentence.
 */
export function applyBannedPhraseFilter(cvData: CVData): CVData {
    // ── Tier 1 — single adjectives/adverbs. Pure deletion is grammatically
    //    safe (they modify the next word and removing them rarely breaks
    //    the sentence). Article agreement is repaired in tidy() below.
    const tier1Words = [
        'seamlessly', 'robust', 'holistic', 'proactive', 'groundbreaking',
        'transformative', 'dynamic', 'innovative', 'impactful',
    ];

    // ── Tier 2 — multi-word phrases. Each entry has a SUBSTITUTION rather
    //    than a hard strip. The previous version deleted the verb in
    //    phrases like "worked on payment systems", leaving " payment
    //    systems" — a broken sentence. Substitutions preserve grammar AND
    //    move the writing toward the concrete verbs the prompt rules
    //    require ("Built", "Led", "Drove", "Owned").
    //
    //    NOTE: contractions like "I've built" do NOT match any pattern
    //    here because \b boundaries treat the apostrophe as a word break,
    //    so "I've" is the token "I" + "ve" and never aligns with any
    //    multi-word pattern below. Tier 1 single words also have no
    //    overlap with contraction fragments.
    const tier2Subs: Array<{ pattern: string; replacement: string }> = [
        // Weak verbs / openers — keep the sentence with a stronger verb.
        { pattern: 'responsible for',         replacement: 'owned' },
        { pattern: 'tasked with',             replacement: 'led' },
        { pattern: 'helped with',             replacement: 'drove' },
        { pattern: 'assisted in',             replacement: 'supported' },
        { pattern: 'worked on',               replacement: 'built' },
        { pattern: 'was part of',             replacement: 'joined' },
        { pattern: 'participated in',         replacement: 'led' },
        { pattern: 'contributed to',          replacement: 'drove' },
        { pattern: 'played a key role in',    replacement: 'led' },
        { pattern: 'supported the',           replacement: 'led the' },
        { pattern: 'passionate about',        replacement: 'focused on' },
        // Pure filler — safe to delete.
        { pattern: 'results-driven',          replacement: '' },
        { pattern: 'detail-oriented',         replacement: '' },
        { pattern: 'team player',             replacement: '' },
        { pattern: 'go-getter',               replacement: '' },
        { pattern: 'thought leader',          replacement: '' },
        { pattern: 'game-changer',            replacement: '' },
        { pattern: 'best-in-class',           replacement: '' },
        { pattern: 'world-class',             replacement: '' },
        { pattern: 'cutting-edge',            replacement: '' },
        { pattern: 'state-of-the-art',        replacement: '' },
        { pattern: 'moving the needle',       replacement: '' },
        { pattern: 'navigate the landscape',  replacement: '' },
        { pattern: "in today's fast-paced world", replacement: '' },
        { pattern: 'excited to',              replacement: '' },
        { pattern: 'delve',                   replacement: 'dig into' },
        // Standalone 'passionate' only matches if 'passionate about'
        // didn't (longest-pattern-first ordering below).
        { pattern: 'passionate',              replacement: '' },
    ];

    // ── Tidy: repairs the inevitable artefacts (orphan punctuation,
    //    a/an disagreement, doubled "the the", leading commas, and
    //    sentence-start capitalization that substitutions can break —
    //    e.g. "Worked on X" → "built X" needs to become "Built X").
    function tidy(s: string, originalStartedUpper: boolean): string {
        let out = s;
        // Collapse runs of whitespace created by deletions.
        out = out.replace(/\s{2,}/g, ' ');
        // Pull punctuation back to the previous word: " ," " ." " ;" → ","
        out = out.replace(/\s+([,.;:!?])/g, '$1');
        // Strip leading punctuation/whitespace at sentence start.
        out = out.replace(/^[\s,;:.!?]+/, '');
        // Fix article disagreement after a Tier 1 deletion.
        // "an [consonant]" → "a [consonant]"
        out = out.replace(/\b([Aa])n\s+([bcdfghjklmnpqrstvwxz])/g,
            (_, A, c) => `${A === 'A' ? 'A' : 'a'} ${c}`);
        // "a [vowel]" → "an [vowel]"
        out = out.replace(/\b([Aa])\s+([aeiou])/g,
            (_, A, c) => `${A === 'A' ? 'An' : 'an'} ${c}`);
        // Adjacent duplicate words ("the the", "and and").
        out = out.replace(/\b(\w+)\s+\1\b/gi, '$1');
        // Re-capitalize first letter if the original was sentence-cased.
        // Substitutions like "Worked on" → "built" leave a lowercase opener.
        if (originalStartedUpper && out.length > 0) {
            out = out.charAt(0).toUpperCase() + out.slice(1);
        }
        // Re-capitalize after sentence-ending punctuation too: ". built" → ". Built"
        out = out.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
        return out.trim();
    }

    const stripped: string[] = [];
    let revertedCount = 0;

    function cleanText(text: string): string {
        if (!text || typeof text !== 'string') return text;
        const original = text;
        const origLen = original.replace(/\s+/g, ' ').trim().length;
        let t = text;

        // Tier 2 substitutions, longest-pattern-first so "passionate about"
        // wins over "passionate" and "supported the" wins over "supported".
        const sortedSubs = [...tier2Subs].sort(
            (a, b) => b.pattern.length - a.pattern.length,
        );
        for (const { pattern, replacement } of sortedSubs) {
            const re = new RegExp(
                `\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
                'gi',
            );
            if (re.test(t)) {
                stripped.push(pattern);
                t = t.replace(re, replacement);
            }
        }

        // Tier 1 standalone words — pure deletion.
        for (const word of tier1Words) {
            const re = new RegExp(`\\b${word}\\b`, 'gi');
            if (re.test(t)) {
                stripped.push(word);
                t = t.replace(re, '');
            }
        }

        const originalStartedUpper = /^[A-Z]/.test(original.trim());
        t = tidy(t, originalStartedUpper);

        // ── Safety guard: never ship a text that the filter destroyed.
        //    If a substitution accidentally over-fires (e.g. an unforeseen
        //    pattern eats most of the bullet), revert to the original and
        //    log it so we can review. Skip the guard for very short fields
        //    where ratio math is noisy.
        if (origLen >= 30 && (t.length < 12 || t.length / origLen < 0.5)) {
            revertedCount++;
            console.warn(
                `[CV BannedPhraseFilter] Reverted destructive strip: ` +
                `"${original.slice(0, 60)}…" → "${t.slice(0, 60)}…"`,
            );
            return original;
        }

        return t;
    }

    // Apply to every text field in CVData
    const result: CVData = {
        ...cvData,
        summary: cleanText(cvData.summary),
        skills: (cvData.skills || []).map(cleanText),
        experience: (cvData.experience || []).map(exp => ({
            ...exp,
            responsibilities: (exp.responsibilities || []).map(cleanText),
        })),
        education: (cvData.education || []).map(edu => ({
            ...edu,
            description: cleanText(edu.description || ''),
        })),
        projects: (cvData.projects || []).map(proj => ({
            ...proj,
            description: cleanText(proj.description || ''),
        })),
    };

    if (stripped.length > 0) {
        const unique = [...new Set(stripped)];
        console.warn(
            `[CV BannedPhraseFilter] Substituted ${stripped.length} ` +
            `banned instance(s): ${unique.join(', ')}` +
            (revertedCount ? ` (${revertedCount} reverted as destructive)` : ''),
        );
    } else {
        console.log('[CV BannedPhraseFilter] Clean — no banned phrases detected.');
    }

    return result;
}

// --- System-Level Constants for AI Control ---

export function buildStaleProfileRefreshInstruction(
    profile: UserProfile,
    marketResearch?: MarketResearchResult | null
): string {
    const roleText = (profile.workExperience || []).map(w =>
        `${w.jobTitle || ''} ${w.company || ''} ${
            typeof w.responsibilities === 'string'
                ? w.responsibilities
                : ((w.responsibilities as unknown as string[]) || []).join(' ')
        }`
    ).join(' ').toLowerCase();
    const roleSignals: Array<{ name: string; hits: number; keywords: string[] }> = ROLE_TRACKS.map(s => ({
        ...s,
        hits: s.keywords.reduce((n, kw) => n + ((roleText.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length), 0),
    }));
    const dominantSignals = roleSignals
        .filter(s => s.hits > 0)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 3);
    const detectedTracks = dominantSignals.map(s => `${s.name} (${s.hits})`).join(', ');

    const gaps = detectGaps(profile.workExperience || []).filter(g => g.gapMonths >= 4);
    const gapContext = gaps.length
        ? gaps.slice(0, 2).map(g => `${g.gapMonths}mo between "${g.fromRole}" → "${g.toRole}"`).join('; ')
        : 'none';

    const currentRole = (profile.workExperience || []).find(w => !w.endDate || /present/i.test(String(w.endDate)));
    if (!currentRole?.startDate) return '';
    const start = new Date(currentRole.startDate);
    if (isNaN(start.getTime())) return '';

    const monthsInRole = Math.max(0,
        (new Date().getFullYear() - start.getFullYear()) * 12 +
        (new Date().getMonth() - start.getMonth())
    );
    const bulletCount = typeof currentRole.responsibilities === 'string'
        ? currentRole.responsibilities.split('\n').filter(Boolean).length
        : ((currentRole.responsibilities as unknown as string[]) || []).length;
    const projectCount = (profile.projects || []).length;
    const likelyStale = monthsInRole >= 24 && (bulletCount <= 4 || projectCount <= 1);
    if (!likelyStale) return '';

    const toolHints = (marketResearch?.expectedTools || []).slice(0, 6).join(', ');
    const skillHints = (profile.skills || []).slice(0, 8).join(', ');
    return `
    **PROFILE RECENCY REFRESH MODE (stale-profile detected):**
    The candidate has been in the current role for ~${Math.round(monthsInRole / 12)} year(s) but has sparse recent evidence in the source CV.
    Refresh the narrative to reflect likely recent scope growth while staying faithful to known facts.

    DETECTION EVIDENCE (use this as the inference boundary):
    - Dominant work tracks from actual experience text: ${detectedTracks || 'insufficient signal'}.
    - Notable career gaps: ${gapContext}.

    HARD LIMITS (never violate):
    - Keep company names, job titles, and employment dates unchanged.
    - Do NOT invent new employers, degrees, or certifications.
    - DEGREE PRESERVATION (binding): The degree name AND institution MUST be
      copied verbatim from the candidate's profile. Never paraphrase, abbreviate,
      translate, "improve", or invent. "BSc Computer Science" stays "BSc Computer Science"
      — not "Bachelor of Science in Computing", not "BS Comp Sci", not "Bachelor's degree".
      The institution string is sacred too: "University of Nairobi" never becomes
      "Nairobi University". If you cannot fit the exact string, keep the exact string.
    - Do NOT fabricate impossible metrics; only use conservative, believable ranges.
    - Only infer activities that are consistent with the detected work tracks above.

    REFRESH RULES:
    - Expand current-role bullets to show progression in ownership, scope, and complexity since the role started.
    - Convert repeated maintenance-style bullets into higher-value outcomes (automation, efficiency, reliability, stakeholder impact) using the candidate's real domain.
    - Surface recent project-like deliverables inside experience bullets when standalone projects are missing.
    - Prioritise tools already known from profile skills (${skillHints || 'profile skills'}) and market expectations (${toolHints || 'no market hints available'}).
    `;
}
// ─── Silent Quality Guardian ──────────────────────────────────────────────────
// Runs after every polish pass to catch anything that slipped through.
// Applies all deterministic fixes silently — never surfaces to the user.
// AI-assisted fixes (gerund truncation) run on pass 1 only — no hallucination:
// the model is only allowed to insert the missing object noun using words
// implied by the job title, company, and verb. Every repair is validated
// before being applied (numbers unchanged, not >2× original length, regex
// no longer fires). Any failure falls back silently.

/**
 * Local copy of the gerund-no-object pattern (mirrors cvValidationEngine.ts)
 * so the guardian can re-validate repaired bullets without a cross-module import.
 */
const _GERUND_NO_OBJECT_RX =
    /\b(?:and|or)\s+(?:installing|implementing|deploying|designing|developing|building|integrating|delivering|commissioning|configuring|managing|operating)\s+(?:across|in|at|for|on|from|into|through|over|under|within)\b/gi;

/**
 * AI-assisted gerund-truncation repair.
 *
 * Fires when the validator flags `incomplete_gerund_phrase` — bullets like
 * "commissioning 12+ drip and installing across farms" where the LLM dropped
 * the direct-object noun ("systems", "units", "infrastructure", etc.).
 *
 * No-hallucination contract (enforced via prompt + post-validation):
 *  • The model may ONLY insert 1–3 words that are implied by the job title,
 *    company name, or the verb itself — never invented facts.
 *  • Numbers must be identical before and after repair.
 *  • Repaired bullet must not exceed 2× the original length.
 *  • The gerund-no-object regex must no longer fire on the repaired text.
 *  • Any violation of the above → the original bullet is kept as-is.
 *
 * Uses GROQ_FAST at temperature 0 for determinism and low cost.
 */
/**
 * Fix 6 — AI hollow-bullet expansion.
 *
 * Finds bullets that are too short (< 6 words) after all deterministic passes
 * and asks the LLM to expand them using only context from the job title,
 * company name, and the user's profile. Never invents metrics.
 *
 * Follows the same safety-gate pattern as _repairGerundTruncations (Fix 5):
 *   Gate A — numbers must be identical before/after repair.
 *   Gate B — repaired bullet must reach ≥ 6 words.
 *   Gate C — repaired bullet must not be > 3× the original length.
 *
 * Requires `carryProfile` to be threaded through from runQualityPolishPasses.
 * When `userProfile` is absent the function returns `cv` unchanged (no-op).
 */
export async function _expandHollowBullets(
    cv: CVData,
    violations: Array<{ ruleId: string; location: string }>,
    userProfile?: UserProfile,
): Promise<CVData> {
    // Collect all genuinely short (not blank) bullets from flagged roles.
    const targets: Array<{
        roleIdx: number;
        bulletIdx: number;
        bullet: string;
        jobTitle: string;
        company: string;
    }> = [];

    for (const v of violations) {
        const m = v.location.match(/experience\[(\d+)\]/);
        if (!m) continue;
        const ri = parseInt(m[1], 10);
        const role = cv.experience?.[ri];
        if (!role) continue;
        ((role.responsibilities as string[]) ?? []).forEach((b, bi) => {
            const wc = b.trim().split(/\s+/).filter(Boolean).length;
            if (wc > 0 && wc < 6) {
                targets.push({
                    roleIdx: ri, bulletIdx: bi, bullet: b,
                    jobTitle: role.jobTitle || '', company: role.company || '',
                });
            }
        });
    }

    if (targets.length === 0) return cv;
    // Cap: don't burn tokens on a CV with systemic hollow-bullet problems
    // (that indicates a data issue, not individual truncated bullets).
    if (targets.length > 8) {
        console.debug('[Guardian/HollowExpand] Too many hollow bullets to repair in bulk — skipping.');
        return cv;
    }

    const profileContext = userProfile
        ? [
            userProfile.summary,   // summary lives on UserProfile, not personalInfo
            (userProfile.workExperience || []).slice(0, 2)
                .map(w => `${w.jobTitle} at ${w.company}`).join(', '),
          ].filter(Boolean).join(' | ')
        : '';

    const items = targets
        .map((t, idx) => `[${idx}] Role: ${t.jobTitle} at ${t.company}\nBullet: ${t.bullet}`)
        .join('\n\n');

    const systemMsg = 'You are a precise CV copy-editor. Return only valid JSON. Never add facts.';
    const userMsg =
        `Each bullet below is too short (under 6 words) for a professional CV. Expand it to 8–20 words ` +
        `using ONLY context from the job title, company name, and candidate background. ` +
        `Never invent metrics, percentages, or tools not already present.\n\n` +
        (profileContext ? `Candidate background: ${profileContext}\n\n` : '') +
        `HARD RULES:\n` +
        `1. Only use information directly inferable from the job title, company, or existing bullet text.\n` +
        `2. Never add, change, or remove any number, percentage, or currency figure.\n` +
        `3. If you cannot expand without inventing facts, return the bullet unchanged.\n\n` +
        `Return: JSON array of strings, one per input bullet, in the same order.\n\n` +
        `Input bullets:\n${items}`;

    let parsed: unknown;
    try {
        const raw = await groqChat(
            GROQ_FAST, systemMsg, userMsg,
            { temperature: 0, json: true, maxTokens: 800 },
        );
        parsed = JSON.parse(raw);
    } catch (e) {
        console.debug('[Guardian/HollowExpand] LLM call or parse failed (non-fatal):', e);
        return cv;
    }

    if (!Array.isArray(parsed) || parsed.length !== targets.length) {
        console.debug('[Guardian/HollowExpand] Unexpected response shape — skipping.');
        return cv;
    }

    const updatedExp = (cv.experience || []).map(r => ({
        ...r,
        responsibilities: [...((r.responsibilities as string[]) || [])],
    }));

    let applied = 0;
    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const repaired = String((parsed as unknown[])[i] ?? '').trim();
        if (!repaired || repaired === t.bullet) continue;

        // Gate A: numbers must be identical
        const origNums = (t.bullet.match(/\d+/g) || []).slice().sort().join(',');
        const repNums  = (repaired.match(/\d+/g) || []).slice().sort().join(',');
        if (origNums !== repNums) {
            console.debug(`[Guardian/HollowExpand] Gate A (numbers changed) at [${t.roleIdx}][${t.bulletIdx}] — keeping original.`);
            continue;
        }
        // Gate B: must reach ≥ 6 words to actually fix the violation
        if (repaired.trim().split(/\s+/).filter(Boolean).length < 6) continue;
        // Gate C: must not be more than 3× original + 30 chars (hallucination guard)
        if (repaired.length > t.bullet.length * 3 + 30) {
            console.debug(`[Guardian/HollowExpand] Gate C (too long) at [${t.roleIdx}][${t.bulletIdx}] — keeping original.`);
            continue;
        }

        updatedExp[t.roleIdx].responsibilities[t.bulletIdx] = repaired;
        applied++;
        console.debug(`[Guardian/HollowExpand] ✓ [${t.roleIdx}][${t.bulletIdx}]: "${t.bullet}" → "${repaired}"`);
    }

    if (applied === 0) return cv;
    console.debug(`[Guardian/HollowExpand] Applied ${applied} hollow-bullet expansion(s).`);
    return { ...cv, experience: updatedExp };
}

export async function _repairGerundTruncations(
    cv: CVData,
    violations: Array<{ ruleId: string; location: string }>,
): Promise<CVData> {
    // ── 1. Map violations to bullet positions ──────────────────────────────
    const targets: Array<{
        roleIdx: number;
        bulletIdx: number;
        bullet: string;
        jobTitle: string;
        company: string;
    }> = [];

    for (const v of violations) {
        const m = v.location.match(/experience\[(\d+)\]\.responsibilities\[(\d+)\]/);
        if (!m) continue;
        const ri = parseInt(m[1], 10);
        const bi = parseInt(m[2], 10);
        const role = cv.experience?.[ri];
        const bullet = (role?.responsibilities as string[] | undefined)?.[bi];
        if (!role || typeof bullet !== 'string' || !bullet.trim()) continue;
        targets.push({
            roleIdx: ri,
            bulletIdx: bi,
            bullet,
            jobTitle: role.jobTitle || '',
            company:  role.company  || '',
        });
    }

    if (targets.length === 0) return cv;

    // ── 2. Build tight batch prompt ────────────────────────────────────────
    const items = targets
        .map((t, idx) =>
            `[${idx}] Role: ${t.jobTitle} at ${t.company}\nBullet: ${t.bullet}`,
        )
        .join('\n\n');

    const systemMsg =
        'You are a precise CV copy-editor. Return only valid JSON. Never add facts.';

    const userMsg =
        `Each bullet below has a truncated gerund phrase — the direct-object noun was dropped by the AI that generated it (e.g. "managing across teams" instead of "managing operations across teams", or "delivering across regions" instead of "delivering projects across regions").

YOUR ONLY JOB: insert the missing 1–3 word object noun.

HARD RULES — any violation means you return the bullet unchanged:
1. You may ONLY use nouns that are directly implied by the job title, company name, or the gerund verb itself. No invented facts. NEVER copy the example nouns ("operations", "projects") — derive the correct noun from the candidate's actual role context.
2. Never add, change, or remove any number, percentage, or currency figure.
3. Never rewrite the rest of the bullet. Only insert the missing object noun.
4. If you are not certain what the missing noun is, return the bullet exactly as given.

Return a JSON array of strings, one per input bullet, in the same order:
["repaired bullet 0", "repaired bullet 1", ...]

Input bullets:
${items}`;

    // ── 3. Call LLM ────────────────────────────────────────────────────────
    let parsed: unknown;
    try {
        const raw = await groqChat(
            GROQ_FAST,
            systemMsg,
            userMsg,
            { temperature: 0, json: true, maxTokens: 600 },
        );
        parsed = JSON.parse(raw);
    } catch (e) {
        console.debug('[Guardian/GerundRepair] LLM call or parse failed (non-fatal):', e);
        return cv;
    }

    if (!Array.isArray(parsed) || parsed.length !== targets.length) {
        console.debug('[Guardian/GerundRepair] Unexpected response shape — skipping.');
        return cv;
    }

    // ── 4. Apply with safety gates ─────────────────────────────────────────
    // Deep-clone experience so we can mutate safely.
    const updatedExp = (cv.experience || []).map(r => ({
        ...r,
        responsibilities: [...((r.responsibilities as string[]) || [])],
    }));

    let applied = 0;
    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const repaired = String((parsed as unknown[])[i] ?? '').trim();
        if (!repaired || repaired === t.bullet) continue;

        // Gate A: numbers must be identical
        const origNums = (t.bullet.match(/\d+/g)  || []).slice().sort().join(',');
        const repNums  = (repaired.match(/\d+/g) || []).slice().sort().join(',');
        if (origNums !== repNums) {
            console.debug(`[Guardian/GerundRepair] Gate A failed (numbers changed) at [${t.roleIdx}][${t.bulletIdx}] — keeping original.`);
            continue;
        }

        // Gate B: not more than 2× the original length
        if (repaired.length > t.bullet.length * 2) {
            console.debug(`[Guardian/GerundRepair] Gate B failed (too long) at [${t.roleIdx}][${t.bulletIdx}] — keeping original.`);
            continue;
        }

        // Gate C: regex must no longer fire on the repaired text
        _GERUND_NO_OBJECT_RX.lastIndex = 0;
        if (_GERUND_NO_OBJECT_RX.test(repaired)) {
            console.debug(`[Guardian/GerundRepair] Gate C failed (pattern still fires) at [${t.roleIdx}][${t.bulletIdx}] — keeping original.`);
            continue;
        }

        updatedExp[t.roleIdx].responsibilities[t.bulletIdx] = repaired;
        applied++;
        console.debug(
            `[Guardian/GerundRepair] ✓ [${t.roleIdx}][${t.bulletIdx}]: "${t.bullet}" → "${repaired}"`,
        );
    }

    if (applied === 0) return cv;

    console.debug(`[Guardian/GerundRepair] Applied ${applied} gerund repair(s).`);
    return { ...cv, experience: updatedExp };
}

/**
 * Trim an overlong bullet at the last clean sentence boundary (period or
 * semicolon) within `maxWords`. Returns the original string unchanged if no
 * clean cut point is found in the latter half — never chops mid-sentence.
 */
export function _trimBulletAtBoundary(text: string, maxWords = 45): string {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text;
    const partial = words.slice(0, maxWords).join(' ');
    const lastPeriod = partial.lastIndexOf('.');
    const lastSemi   = partial.lastIndexOf(';');
    const cut = Math.max(lastPeriod, lastSemi);
    // Only accept cuts that fall in the latter half of the window — prevents
    // cutting at an early abbreviation period like "e.g. something very long".
    if (cut > partial.length * 0.5) return text.slice(0, cut + 1).trim();
    return text; // no clean boundary — leave as-is for telemetry
}

/**
 * Silent Quality Guardian — runs as the final step of runQualityPolishPasses,
 * after every humanizer/purify/voice/opener pass has completed.
 *
 * What it does:
 *  1. Re-runs the full validation engine (fresh eyes on the finished CV).
 *  2. Applies every deterministic fix available — up to MAX_PASSES times.
 *  3. Logs a debug summary; never shows anything to the user.
 *
 * Deterministic fixes (silent, zero AI cost):
 *  • empty_experience_bullets  → remove the empty role entirely
 *  • overlong_bullets          → trim at last sentence boundary within 45 words
 *  • current_role_tense        → enforceTenseConsistency (present imperatives)
 *  • hollow_bullets (empty str)→ strip truly blank bullets; genuinely short ones logged
 *
 * AI-assisted fixes (pass 1 only, no hallucination — see _repairGerundTruncations):
 *  • incomplete_gerund_phrase  → insert missing object noun via GROQ_FAST @ temp 0
 *
 * Still unfixable without more context (logged only):
 *  • hollow_bullets (< 6 words but non-empty) — need content expansion
 */
export async function _runSilentQualityGuardian(
    cv: CVData,
    targetBulletCount?: number,
    userProfile?: UserProfile,
): Promise<CVData> {
    // Pre-load compromise.js NLP so flipLeadingVerb and detectTenseMismatch can
    // use it as a fallback for verbs not in VERB_TENSE_MAP (irregular + rare).
    // Awaiting here is safe — initNlp() is idempotent and resolves in < 300ms
    // on first call (dynamic import). Subsequent calls are instant (cache hit).
    await initNlp();

    const MAX_PASSES = 2;
    let out = cv;

    for (let pass = 1; pass <= MAX_PASSES; pass++) {
        const check = runValidationEngine(out, { targetBulletCount });
        if (check.repairApplied) out = check.cv; // apply block repairs (idempotent)

        const warns = check.violations.filter(v => v.severity === 'warn' && !v.repaired);
        if (warns.length === 0) {
            console.debug(`[Guardian pass ${pass}] Clean — no warn violations. ✓`);
            break;
        }

        let fixed = 0;
        const ruleIds = warns.map(v => v.ruleId);

        // ── Fix 1: Remove roles that have no bullets at all ────────────────
        if (ruleIds.includes('empty_experience_bullets')) {
            const before = out.experience?.length ?? 0;
            out = {
                ...out,
                experience: (out.experience ?? []).filter(
                    role => Array.isArray(role.responsibilities)
                         && (role.responsibilities as string[]).filter(Boolean).length > 0,
                ),
            };
            const removed = before - (out.experience?.length ?? 0);
            if (removed > 0) {
                fixed += removed;
                console.debug(`[Guardian pass ${pass}] Removed ${removed} empty role(s).`);
            }
        }

        // ── Fix 2: Trim overlong bullets at last sentence boundary ─────────
        if (ruleIds.includes('overlong_bullets')) {
            let trimmed = 0;
            out = {
                ...out,
                experience: (out.experience ?? []).map(role => ({
                    ...role,
                    responsibilities: (role.responsibilities as string[] ?? []).map((b: string) => {
                        const after = _trimBulletAtBoundary(b, 45);
                        if (after !== b) trimmed++;
                        return after;
                    }),
                })),
            };
            if (trimmed > 0) {
                fixed += trimmed;
                console.debug(`[Guardian pass ${pass}] Trimmed ${trimmed} overlong bullet(s) at sentence boundary.`);
            }
        }

        // ── Fix 3: Present-tense enforcement for current role ──────────────
        if (ruleIds.includes('current_role_tense')) {
            const { cv: tenseFixed, changes } = enforceTenseConsistency(out);
            if (changes.length > 0) {
                out = tenseFixed;
                fixed += changes.length;
                console.debug(`[Guardian pass ${pass}] Tense-corrected ${changes.length} bullet(s) in current role.`);
            }
        }

        // ── Fix 4: Strip truly blank bullets (hollow but empty string) ─────
        if (ruleIds.includes('hollow_bullets')) {
            let stripped = 0;
            out = {
                ...out,
                experience: (out.experience ?? []).map(role => {
                    const orig = role.responsibilities as string[] ?? [];
                    const cleaned = orig.filter((b: string) => b.trim().length > 0);
                    stripped += orig.length - cleaned.length;
                    return { ...role, responsibilities: cleaned };
                }),
            };
            if (stripped > 0) {
                fixed += stripped;
                console.debug(`[Guardian pass ${pass}] Stripped ${stripped} blank bullet(s).`);
            }
        }

        // ── Fix 6: AI hollow-bullet expansion (pass 1 only) ───────────────
        // Expands genuinely short bullets (< 6 words, non-empty) using LLM
        // with the user's profile as context. Only fires when carryProfile was
        // provided — without profile context the LLM has no safe material to
        // draw from, so we skip rather than risk hallucination.
        if (pass === 1 && ruleIds.includes('hollow_bullets') && userProfile) {
            try {
                const hollowViolations = warns.filter(v => v.ruleId === 'hollow_bullets');
                const preFix6: CVData = JSON.parse(JSON.stringify(out));
                out = await _expandHollowBullets(out, hollowViolations, userProfile);
                let hollowFixed = 0;
                for (const v of hollowViolations) {
                    const m = v.location.match(/experience\[(\d+)\]/);
                    if (!m) continue;
                    const ri = parseInt(m[1], 10);
                    const origBullets = (preFix6.experience?.[ri]?.responsibilities as string[] | undefined) ?? [];
                    const newBullets  = (out.experience?.[ri]?.responsibilities as string[] | undefined) ?? [];
                    for (let bi = 0; bi < origBullets.length; bi++) {
                        if (origBullets[bi] !== newBullets[bi]) hollowFixed++;
                    }
                }
                if (hollowFixed > 0) {
                    fixed += hollowFixed;
                    console.debug(`[Guardian pass ${pass}] Hollow-bullet expansion applied to ${hollowFixed} bullet(s).`);
                } else {
                    // Log for telemetry — short bullets that couldn't be safely expanded
                    console.debug(`[Guardian pass ${pass}] ${hollowViolations.length} role(s) still have short bullets after expansion attempt.`);
                }
            } catch (e) {
                console.debug('[Guardian pass 1] Hollow-bullet expansion skipped (non-fatal):', e);
            }
        } else if (ruleIds.includes('hollow_bullets') && !userProfile) {
            const hollowRemaining = warns.filter(v => v.ruleId === 'hollow_bullets');
            if (hollowRemaining.length > 0) {
                console.debug(`[Guardian pass ${pass}] ${hollowRemaining.length} role(s) have short bullets — profile context unavailable, skipping AI expansion.`);
            }
        }

        // ── Fix 5: AI gerund-truncation repair (pass 1 only) ──────────────
        // Fires for "installing across farms" → "installing irrigation systems
        // across farms". No-hallucination enforced: only the missing object noun,
        // numbers must be identical, length gate, regex must no longer fire.
        if (pass === 1 && ruleIds.includes('incomplete_gerund_phrase')) {
            try {
                const gerundViolations = warns.filter(v => v.ruleId === 'incomplete_gerund_phrase');
                const preFix: CVData = JSON.parse(JSON.stringify(out));
                out = await _repairGerundTruncations(out, gerundViolations);
                const repaired = revertCorruptedMetrics(out, preFix);
                if (repaired.reverted.length > 0) {
                    console.debug(`[Guardian pass ${pass}] Gerund repair reverted ${repaired.reverted.length} corrupted metric(s).`);
                    out = repaired.cv;
                }
                // Count ACTUAL bullet changes — not attempts. If the LLM was
                // uncertain and returned all bullets unchanged, fixed stays 0
                // and the early-break fires correctly (no wasted pass 2).
                let gerundFixed = 0;
                for (const v of gerundViolations) {
                    const m = v.location?.match(/experience\[(\d+)\]\.responsibilities\[(\d+)\]/);
                    if (!m) continue;
                    const ri = parseInt(m[1], 10);
                    const bi = parseInt(m[2], 10);
                    const origBullet = (preFix.experience?.[ri]?.responsibilities as string[] | undefined)?.[bi];
                    const newBullet  = (out.experience?.[ri]?.responsibilities as string[] | undefined)?.[bi];
                    if (origBullet !== undefined && newBullet !== undefined && newBullet !== origBullet) {
                        gerundFixed++;
                    }
                }
                if (gerundFixed > 0) {
                    fixed += gerundFixed;
                    console.debug(`[Guardian pass ${pass}] Gerund repair applied to ${gerundFixed}/${gerundViolations.length} bullet(s).`);
                } else {
                    console.debug(`[Guardian pass ${pass}] Gerund repair: LLM made no changes (${gerundViolations.length} violation(s) remain).`);
                }
            } catch (e) {
                console.debug('[Guardian pass 1] Gerund repair skipped (non-fatal):', e);
            }
        }

        if (fixed === 0) {
            console.debug(`[Guardian pass ${pass}] No deterministic fixes available for remaining violations: ${[...new Set(ruleIds)].join(', ')}`);
            break;
        }
    }

    // Final check — debug summary only, never shown to user
    const final = runValidationEngine(out, { targetBulletCount });
    if (final.repairApplied) out = final.cv;
    const remaining = final.violations.filter(v => !v.repaired);
    if (remaining.length > 0) {
        console.debug(`[Guardian final] ${remaining.length} issue(s) remain (need AI or are acceptable): ${[...new Set(remaining.map(v => v.ruleId))].join(', ')}`);
    } else {
        console.debug('[Guardian final] All violations resolved. CV is clean. ✓');
    }

    return out;
}

/**
 * Returns an instruction string about the user's preferred section order and custom sections.
 * This is injected into the generateCV prompt so the AI honours the user's preferences.
 */

