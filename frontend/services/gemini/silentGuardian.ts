/**
 * Silent Quality Guardian — hollow bullets, gerund repair, role fixes.
 * Logic unchanged — extracted for readability.
 */

import { CVData } from '../../types';
import { groqChat, GROQ_FAST, GROQ_LARGE } from '../groqService';
import {
    stripFirstPersonPronouns as _stripFirstPersonPronouns,
    normalizePresentTenseToImperative as _normalizePresentTenseToImperative,
} from '../cvVoiceFidelity';

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

