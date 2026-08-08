/**
 * Groq post-generation validator + humanization audit.
 * Logic unchanged — extracted for readability.
 */

import { CVData } from '../../types';
import { groqChat, GROQ_LARGE } from '../groqService';
import { _validatorSystem, _auditSystem } from './rulesState';
import { buildMetricsCeiling } from './preGeneration';
import { purifyCV, revertCorruptedMetrics } from '../cvPurificationPipeline';

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
