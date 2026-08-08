/**
 * Shared post-generation quality polish + optimize/improve/polishExisting.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile, CVData } from '../types';
import type { PurifyReport } from './cvPurificationPipeline';
import { groqChat, GROQ_LARGE, GROQ_FAST } from './groqService';
import { purifyProfile, purifyCV } from './cvPurificationPipeline';
import {
  SYSTEM_INSTRUCTION_PROFESSIONAL,
  SYSTEM_INSTRUCTION_HUMANIZER,
  CV_DATA_SCHEMA,
} from './pipelineRules';
import { _dispatchPolishStage } from './polishStageEvents';
import { finalizeCvData } from './finalizeCvData';
import { humanizeText } from './humanizeService';

export interface LeakSummaryPayload {
    totalFixed: number;
    totalFlagged: number;
    instructionLeaksStripped: number;
    duplicateBulletsRemoved: number;
    bannedPhrasesFixed: number;
    tenseFixed: number;
    polishFixes: number;
    flaggedItems: Array<{ leakType: string; phrase: string; fieldLocation?: string }>;
}

function buildLeakSummaryPayload(report: PurifyReport): LeakSummaryPayload {
    const leaks = report.leaks ?? [];
    const fixed   = leaks.filter(l => l.fixedBy && l.fixedBy !== 'none');
    const flagged = leaks.filter(l => !l.fixedBy || l.fixedBy === 'none');
    return {
        totalFixed:               fixed.length,
        totalFlagged:             flagged.length,
        instructionLeaksStripped: fixed.filter(l => l.leakType === 'instruction_leak').length,
        duplicateBulletsRemoved:  fixed.filter(l => l.leakType === 'duplicate_bullet').length,
        bannedPhrasesFixed:       fixed.filter(l => l.leakType === 'banned_phrase').length,
        tenseFixed:               fixed.filter(l => l.leakType === 'tense_mismatch').length,
        polishFixes:              report.polishFixes ?? 0,
        flaggedItems:             flagged.slice(0, 10).map(l => ({
            leakType:      l.leakType,
            phrase:        l.phrase ?? '',
            fieldLocation: l.fieldLocation,
        })),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared post-generation quality polish.
//
// THE single place where post-Groq CV polish lives. Used by every generation
// path (generateCV, improveCV / Auto Optimize, optimizeCVForJob) so all three
// flows produce CVs at parity. Tune CV quality here — nowhere else.
//
// Pipeline (in order):
//   1. Humanizer pass (Workers AI / Groq, with corrupt-metric revert).
//   2. Bullet-count enforcer — either:
//        - 'profile-pointcount': honour user's pointCount per role (Generate path).
//        - 'preserve-cv':        match the source CV's bullet counts exactly
//                                (Improve / Optimize paths — never silently
//                                changes structure).
//   3. Deterministic banned-phrase filter (pure JS, cannot fail).
//   4. Carry profile customSections + sectionOrder if `carryProfile` is given.
//   5. Sort experience by end date desc (most recent first).
//   6. purifyCV — banned subs, tense, jitter, dedup; returns a report.
//   7. `onPurifyReport` callback (for telemetry / leak reporting).
//   8. Voice-consistency enforcement (only when `engineBrief` is provided,
//      with corrupt-metric revert).
//   9. finalizeCvData — fidelity rules vs profile or source CV (no AI).
//  10. Pronoun safety net.
//
// Every AI step is wrapped so a worker / Groq hiccup never aborts the polish:
// the deterministic passes still run and the user gets a finished CV.
// ─────────────────────────────────────────────────────────────────────────────
type BulletCountStrategy =
    | { type: 'profile-pointcount'; profile: UserProfile }
    | { type: 'preserve-cv'; sourceCv: CVData };

type FinalizeStrategy =
    | { profile: UserProfile }
    | { sourceCv: CVData };

// ── Public type so UI components can display what the pipeline caught ────────
export interface LeakSummaryPayload {
    totalFixed: number;
    totalFlagged: number;
    instructionLeaksStripped: number;
    duplicateBulletsRemoved: number;
    bannedPhrasesFixed: number;
    tenseFixed: number;
    polishFixes: number;
    flaggedItems: Array<{ leakType: string; phrase: string; fieldLocation?: string }>;
}

interface QualityPolishOpts {
    bulletCount: BulletCountStrategy;
    finalize: FinalizeStrategy;
    runHumanizer?: boolean;
    carryProfile?: UserProfile;
    engineBrief?: CVBrief | null;
    onPurifyReport?: (report: PurifyReport) => void | Promise<void>;
    onLeakSummary?: (summary: LeakSummaryPayload) => void;
    /** JD-reconciled skill set from reconcileSkills(). When present, used as
     *  the authoritative allowed-skills list in applySourceFidelityRules so
     *  JD-irrelevant profile skills cannot leak back after generation. */
    reconciledSkills?: ReconciledSkills | null;
    /** Detected market currency (e.g. 'KES', 'NGN', 'GBP'). When set, the
     *  silent guardian normalizes any wrong currency symbols to this value —
     *  e.g. "$2M" → "KES 2M" for a Kenyan profile. */
    detectedCurrency?: string;
}

export async function runQualityPolishPasses(
    cvData: CVData,
    opts: QualityPolishOpts,
): Promise<CVData> {
    const { runHumanizer = true, bulletCount, carryProfile, engineBrief, finalize, onPurifyReport, onLeakSummary, reconciledSkills, detectedCurrency } = opts;
    let out = cvData;

    // 1. Humanizer pass — fixes short bullets, banned phrases in summary,
    //    duplicate verb starters, scope-anchor first bullet, etc.
    //
    //    Apr 29 2026 — feedback loop: run a deterministic purify pre-scan on a
    //    deep CLONE of the CV first, harvest the high-leverage leak types
    //    (round_number, orphan_metric, bullet_band_imbalance) the regex layer
    //    cannot safely auto-fix, and forward them to the humanizer as an
    //    explicit must-fix list with concrete contexts. The clone ensures the
    //    real `out` reaches the humanizer untouched — the authoritative
    //    purifyCV pass still runs at step 6 after the LLM rewrite.
    if (runHumanizer) {
        try {
            _dispatchPolishStage('humanizing');
            const preAudit: CVData = JSON.parse(JSON.stringify(out));
            let scanLeaks: ReadonlyArray<{ leakType: string; phrase?: string; fieldLocation?: string; contextSnippet?: string }> = [];
            try {
                const scanCopy: CVData = JSON.parse(JSON.stringify(out));
                const scan = purifyCV(scanCopy);
                scanLeaks = scan.report.leaks || [];
            } catch (scanErr) {
                console.debug('[Polish] Pre-humanizer leak scan failed (non-fatal):', scanErr);
            }
            out = await runHumanizationAudit(out, scanLeaks);
            const auditRevert = revertCorruptedMetrics(out, preAudit);
            if (auditRevert.reverted.length > 0) {
                console.warn(`[Polish] Humanizer reverted ${auditRevert.reverted.length} corrupted metric(s):`, auditRevert.reverted);
                out = auditRevert.cv;
            }
        } catch (e) {
            console.warn('[Polish] Humanizer pass skipped:', e);
        }
    }

    // 2. Bullet-count enforcer.
    out.experience = (out.experience || []).map(role => {
        let desired: number;
        let sourceBullets: string[] = [];

        if (bulletCount.type === 'profile-pointcount') {
            const normalize = (s: string) => (s || '').toLowerCase().trim();
            const sourceRole = (bulletCount.profile.workExperience || []).find(
                we => normalize(we.jobTitle) === normalize(role.jobTitle) && normalize(we.company) === normalize(role.company)
            ) ?? (bulletCount.profile.workExperience || []).find(
                we => normalize(we.company) === normalize(role.company)
            ) ?? (bulletCount.profile.workExperience || []).find(
                we => normalize(role.jobTitle).includes(normalize(we.jobTitle).split(' ')[0] || '__') ||
                      normalize(we.jobTitle).includes(normalize(role.jobTitle).split(' ')[0] || '__')
            );
            desired = sourceRole?.pointCount ?? role.responsibilities?.length ?? 5;
            sourceBullets = (sourceRole?.responsibilities || '')
                .split('\n').map(s => s.replace(/^[\u2022\-\*]\s*/, '').trim()).filter(Boolean);
        } else {
            const sourceRole = (bulletCount.sourceCv.experience || []).find(
                r => r.jobTitle === role.jobTitle && r.company === role.company
            );
            desired = sourceRole?.responsibilities?.length ?? role.responsibilities?.length ?? 5;
            sourceBullets = sourceRole?.responsibilities || [];
        }

        const current = role.responsibilities || [];
        if (current.length === desired) return role;
        if (current.length > desired) {
            if (import.meta.env.DEV) console.warn(`[Polish BulletCount] Trimmed "${role.jobTitle} @ ${role.company}" from ${current.length} → ${desired} bullets.`);
            return { ...role, responsibilities: current.slice(0, desired) };
        }
        // Pad from source bullets — never invent text.
        const padded = [...current];
        for (const b of sourceBullets) {
            if (padded.length >= desired) break;
            if (!padded.some(p => p.toLowerCase().includes(b.toLowerCase().slice(0, 20)))) {
                padded.push(b);
            }
        }
        if (padded.length !== current.length) {
            if (import.meta.env.DEV) console.warn(`[Polish BulletCount] Padded "${role.jobTitle} @ ${role.company}" from ${current.length} → ${padded.length} bullets.`);
        }
        return { ...role, responsibilities: padded };
    });

    // 3. Deterministic banned-phrase filter (cannot fail, no AI).
    out = applyBannedPhraseFilter(out);

    // 4. Carry through profile-level user-pre-filled content (Generate path).
    if (carryProfile) {
        if (carryProfile.customSections && carryProfile.customSections.length > 0) {
            out.customSections = carryProfile.customSections.filter(
                s => s.items.some(i => i.title.trim().length > 0)
            );
        }
        if (carryProfile.sectionOrder && carryProfile.sectionOrder.length > 0) {
            out.sectionOrder = carryProfile.sectionOrder;
        }
    }

    // 5. Sort experience by end date descending (most recent first).
    out.experience.sort((a, b) => {
        const getEnd = (s: string) => s?.toLowerCase() === 'present'
            ? new Date()
            : (isNaN(new Date(s).getTime()) ? new Date(0) : new Date(s));
        const ea = getEnd(a.endDate).getTime();
        const eb = getEnd(b.endDate).getTime();
        if (eb !== ea) return eb - ea;
        const sa = isNaN(new Date(a.startDate).getTime()) ? 0 : new Date(a.startDate).getTime();
        const sb = isNaN(new Date(b.startDate).getTime()) ? 0 : new Date(b.startDate).getTime();
        return sb - sa;
    });

    // 6a. Worker pre-purify — server-side IP rules (substitutions, tense, voice).
    //     Runs BEFORE the local purifyCV so the Worker's rules are applied first.
    //     Falls back silently if the Worker is unreachable.
    //     Also runs the final visible-text gate; if the gate finds critical issues,
    //     a targeted LLM repair is triggered for the affected sections (summary /
    //     experience) before the local pipeline continues.
    // Tracks whether the Worker's purify-cv pass ran successfully AND no
    // fresh LLM text was written afterward (gate repair). Only in that case
    // is it safe to skip the local substitution/tense passes in step 6 below
    // — they'd just be re-applying the exact same rule set the Worker already
    // applied. If the Worker was unreachable, or a gate repair introduced new
    // unvetted text, the local pass must run so nothing ships uncleaned.
    let workerPurifiedCleanly = false;
    _dispatchPolishStage('purifying');
    try {
        const pre = await remotePrePurify(out, carryProfile?.skills ?? []);
        out = pre.cv;
        workerPurifiedCleanly = pre.fromWorker;

        // ── Gate-triggered repair ────────────────────────────────────────────
        // The worker gate scans every visible field AFTER all server-side
        // cleaning passes. Critical findings (jobseeker openers, weak bullet
        // verbs, AI-ism openers, first-person bullets, placeholder text) are
        // issues that need rewriting, not just substitution. We route them
        // through the existing runQualityGate Stage 2 LLM repair.
        const gate = pre.gate;
        if (gate && gate.quality_mode === 'degraded' && gate.counts.critical > 0) {
            try {
                console.info(
                    `[Polish/Gate] ${gate.counts.critical} critical issue(s) detected by server gate — ` +
                    `triggering targeted repair. Issues: ${gate.issues.filter(i => i.severity === 'critical').map(i => i.issue).join(', ')}`,
                );
                const gateRepair = await runQualityGate(
                    String(out.summary ?? ''),
                    Array.isArray(out.experience) ? out.experience : [],
                    { repair: true, skills: Array.isArray(out.skills) ? out.skills : [] },
                );
                if (gateRepair.repairedSummary) {
                    out = { ...out, summary: gateRepair.repairedSummary };
                    // Fresh LLM text — hasn't been through substitution/tense yet.
                    workerPurifiedCleanly = false;
                }
                if (gateRepair.repairedExperience) {
                    out = { ...out, experience: gateRepair.repairedExperience };
                    workerPurifiedCleanly = false;
                }
            } catch (repairErr) {
                console.debug('[Polish/Gate] Targeted repair after server gate failed (non-fatal):', repairErr);
            }
        }
    } catch { /* non-fatal — local purifyCV handles the rest */ }

    // 6. Hot Fire — deterministic purification (banned subs, tense, jitter, dedup).
    //    Substitution + tense passes are skipped when the Worker already ran
    //    them cleanly (workerPurifiedCleanly) to avoid double-processing the
    //    same identical rule tables; every other pass here (word-overuse,
    //    semantic dedup, polish, skill normalisation) is local-only logic the
    //    Worker doesn't perform, so it always runs regardless.
    const purified = purifyCV(out, { skipWorkerDuplicatePasses: workerPurifiedCleanly });
    out = purified.cv;
    // Accumulate purifier warning count for quality score penalty at step 9.
    const _purifyWarnings = (purified.report.leaks ?? []).filter(l => !l.fixedBy || l.fixedBy === 'none').length;

    // 6b. Currency normalisation — swap wrong currency symbols/codes to the
    //     detected market currency. The first bullet of each role (scope-anchor)
    //     is always exempt so a pinned "$2M exactly" value is never overwritten
    //     by the general "use KES" rule (anchor wins).
    if (detectedCurrency && detectedCurrency !== 'NONE') {
        try {
            out = _normalizeCurrencyInCV(out, detectedCurrency);
            console.debug(`[Polish 6b] Currency normalisation applied (target: ${detectedCurrency}).`);
        } catch (e) {
            console.debug('[Polish 6b] Currency normalisation skipped (non-fatal):', e);
        }
    }

    // 7. Telemetry / leak reporting hook (caller owns what to do with the report).
    if (onPurifyReport) {
        try {
            await onPurifyReport(purified.report);
        } catch (e) {
            console.debug('[Polish] onPurifyReport hook failed (non-fatal):', e);
        }
    }
    // 7b. UI leak-summary callback — called once with a digest so the UI can
    //     show the user exactly what was caught and fixed without needing the
    //     full raw PurifyReport.
    if (onLeakSummary) {
        try { onLeakSummary(buildLeakSummaryPayload(purified.report)); }
        catch (e) { console.debug('[Polish] onLeakSummary hook failed (non-fatal):', e); }
    }

    // 8. Phase E — Voice consistency enforcement (only when an engine brief
    //    is available; mutates `out` in place, with corrupt-metric revert).
    if (engineBrief && out.experience?.length) {
        try {
            _dispatchPolishStage('voice');
            const preVoiceCV: CVData = JSON.parse(JSON.stringify(out));
            await enforceVoiceConsistency(out, engineBrief);
            const voiceRevert = revertCorruptedMetrics(out, preVoiceCV);
            if (voiceRevert.reverted.length > 0) {
                console.warn(`[Polish] Voice enforcement reverted ${voiceRevert.reverted.length} corrupted-metric bullet(s):`, voiceRevert.reverted);
                out = voiceRevert.cv;
            }
            // ROOT-CAUSE FIX for the user's "KES ,000" / "% retention" /
            // "Re-framed" bullets: the voice-consistency LLM (worker AND its
            // Groq fallback) can introduce orphan-metric placeholders and
            // weird "Re-<verb>" openers when it rewrites bullets. The earlier
            // purifyCV call (step 6) already ran, so without a second purify
            // pass those new defects ship straight to the user. Re-running
            // purifyCV here is cheap (deterministic regex only) and idempotent.
            const repurified = purifyCV(out);
            out = repurified.cv;
            if (onPurifyReport && repurified.report.polishFixes > 0) {
                try { await onPurifyReport(repurified.report); }
                catch (e) { console.debug('[Polish] post-voice onPurifyReport hook failed (non-fatal):', e); }
            }
        } catch (e) {
            console.warn('[Polish] Voice enforcement skipped:', e);
        }
    }

    // 9. Final source-fidelity lock (no AI, deterministic).
    // Pass accumulated purifier warning count so logCvQualityReport can
    // include the style-issue penalty in the quality score (fixes 100/100
    // even when purifier flagged warnings that couldn't be auto-fixed).
    _dispatchPolishStage('finalizing');
    if ('profile' in finalize) {
        out = finalizeCvData(out, { profile: finalize.profile, runPurify: false, purifierWarnings: _purifyWarnings, reconciledSkills });
    } else {
        out = finalizeCvData(out, { sourceCv: finalize.sourceCv, runPurify: false, purifierWarnings: _purifyWarnings });
    }

    // 9.1. Remote KV banned-phrase deterministic strip.
    // Closes the gap between prompt-instruction enforcement (LLM is told to avoid
    // these phrases) and guaranteed cleanup (deterministic strip regardless of LLM
    // compliance). getCachedBannedPhrases() is already warm from the humanizer pass
    // so this adds ~0 ms latency. Wrapped in try/catch — never blocks generation.
    try {
        const remoteBanned = await getCachedBannedPhrases();
        if (remoteBanned && remoteBanned.length > 0) {
            const stripped = applyRemoteBannedPhrasesToCV(out, remoteBanned);
            out = stripped;
            console.debug(`[Polish 9.1] Remote banned-phrase strip applied (${remoteBanned.length} entries).`);
        }
    } catch (e) {
        console.debug('[Polish 9.1] Remote banned-phrase strip skipped (non-fatal):', e);
    }

    // 9.5. Universal AI summary repair — runs ONLY when the deterministic
    // audit at step 9 still flags issues in the professional summary (e.g.
    // an orphan stub that even tidyOrphanRemnants couldn't safely repair
    // without inventing facts). The model gets a locked whitelist of the
    // user's own numbers, so it cannot hallucinate figures. On any failure
    // (no profile, network down, model returns garbage) we silently keep
    // whatever finalizeCvData already produced — never blocks generation.
    try {
        const profileForRepair = ('profile' in finalize) ? finalize.profile : undefined;
        const auditedSummary = String((out as any).summary ?? '');
        if (auditedSummary) {
            const audit = _auditCvQuality(out as any);
            const hasSummaryIssues = audit.issues.some(i => i.where === 'summary');
            if (hasSummaryIssues) {
                const repaired = await _repairCvSummaryWithAi(out, profileForRepair);
                if (repaired && repaired.trim() && repaired.trim() !== auditedSummary.trim()) {
                    out = { ...out, summary: repaired.trim() } as CVData;
                    if (typeof console !== 'undefined') {
                        console.info('[Summary Repair] Applied AI rewrite to resolve audit-flagged issues.');
                    }
                }
            }
        }
    } catch (e) {
        if (typeof console !== 'undefined') {
            console.debug('[Summary Repair] step 9.5 skipped (non-fatal):', e);
        }
    }

    // 10. Pronoun safety net.
    out = fixPronounsInCV(out);

    // 10.5. Opener diversity enforcement — deterministic reshape (no AI cost).
    // Runs AFTER pronoun pass so it never interferes with verb-tense fixes.
    // Only restructures bullet bodies — never invents new facts.
    try {
        out = enforceOpenerDiversity(out);
    } catch (e) {
        console.debug('[Polish] Opener diversity pass skipped (non-fatal):', e);
    }

    // 10.6. Scope anchor enforcement — all roles (current AND past).
    // Guarantees bullet[0] of every role establishes scope (team size, budget,
    // project count, etc.) rather than leading with an achievement. Swaps the
    // first scope-signal bullet to position 0 when the current first bullet is
    // achievement-led; no-ops when no scope bullet exists (no content invented).
    try {
        out = enforceScopeAnchors(out);
    } catch (e) {
        console.debug('[Polish] Scope anchor pass skipped (non-fatal):', e);
    }

    // 10.7. Rhythm balance — deterministic punchy/narrative band enforcer.
    // When a role's bullets all fall in the standard band (the most common LLM
    // failure despite the prompt rule), physically reshapes two bullets:
    //   • Shortens the shortest standard bullet to punchy (≤14 words).
    //   • Expands the metric-richest standard bullet to narrative (≥23 words).
    // Never touches bullet[0] (scope anchor), never invents content.
    try {
        out = enforceRhythmBalance(out);
    } catch (e) {
        console.debug('[Polish] Rhythm balance pass skipped (non-fatal):', e);
    }

    // 11. Silent Quality Guardian — final sweep after all polish stages.
    // Re-runs the full validation engine and applies every deterministic fix
    // available. Unfixable issues (hollow bullets needing AI) are debug-logged
    // for telemetry only. Never surfaces anything to the user.
    try {
        const guardianBulletCount = engineBrief?.rhythm?.bullet_count as number | undefined;
        out = await _runSilentQualityGuardian(out, guardianBulletCount, carryProfile);
    } catch (e) {
        console.debug('[Guardian] Silent quality sweep skipped (non-fatal):', e);
    }

    return out;
}


export const optimizeCVForJob = async (
    cvInput: CVData,
    jd: string,
    gaps: Array<{ requirement: string; isBlocker: boolean }>,
    missingKeywords: string[]
): Promise<Partial<CVData>> => {
    // ── HOT FIRE (inbound) ── purge banned phrases from the source CV before
    // it's serialized into the prompt, so the optimizer rewrites from clean
    // anchors instead of pattern-matching the original buzzwords.
    const cv = purifyInboundCV(cvInput);
    const jdCapped = jd.substring(0, 2500);
    const gapList = gaps.map(g => `- ${g.isBlocker ? '[BLOCKER] ' : ''}${g.requirement}`).join('\n');
    const keywordList = missingKeywords.join(', ');

    const currentSummary = cv.summary || '';
    const currentSkills = (cv.skills || []).join(', ');
    const currentExperience = (cv.experience || []).map(e =>
        `### ${e.jobTitle} @ ${e.company}\n${(e.responsibilities || []).join('\n')}`
    ).join('\n\n');

    const prompt = `
You are an expert CV optimizer. The candidate's CV has been analyzed against the job description and has identified GAPS and MISSING KEYWORDS. Your job is to perform a TARGETED rewrite of ONLY the affected sections — do NOT change names, companies, dates, or invent new experiences.

JOB DESCRIPTION:
${jdCapped}

IDENTIFIED GAPS:
${gapList || 'None identified.'}

MISSING KEYWORDS TO WEAVE IN NATURALLY:
${keywordList || 'None identified.'}

CURRENT CV SECTIONS TO REWRITE:

SUMMARY:
${currentSummary}

SKILLS (current):
${currentSkills}

EXPERIENCE BULLETS (current):
${currentExperience}

STRICT RULES:
1. Rewrite the summary to incorporate the 3 most critical missing keywords naturally. Keep it 55–75 words.
2. Update the skills list: add missing keywords that are genuine skills. Keep total at ≤18 skills. Put JD-matching skills first.
3. Rewrite experience bullets to naturally include missing keywords where plausible. DO NOT change job titles, company names, or invent new experiences. Just reframe existing bullets using JD language.
4. Every rewritten bullet must still have a strong action verb. Metrics are encouraged but only on ~50–60% of bullets — never force a number that isn't supported by the original.
5. Preserve the exact number of bullets per role.
6. Return ONLY a JSON object with keys: "summary" (string), "skills" (string[]), "experience" (array of {jobTitle, company, responsibilities: string[]}).

${HUMANIZATION_CHECKLIST}
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5, json: true, maxTokens: 2500 });
    const _stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const result = JSON.parse(_stripped);

    // Merge back into full experience array preserving dates etc.
    const updatedExperience = (cv.experience || []).map(exp => {
        const updated = (result.experience || []).find((e: any) =>
            e.jobTitle === exp.jobTitle && e.company === exp.company
        );
        if (updated && Array.isArray(updated.responsibilities)) {
            return { ...exp, responsibilities: updated.responsibilities };
        }
        return exp;
    });

    // ── PIN tier-1 keywords ── ensure the top-3 missing keywords actually
    // landed somewhere in the rewritten output. If not, append them to skills
    // (deterministic safety net so optimize never silently drops a JD-critical
    // term during paraphrase).
    const tier1 = (missingKeywords || []).slice(0, 3);
    let finalSkills: string[] = Array.isArray(result.skills) ? [...result.skills] : [...(cv.skills || [])];
    const finalSummary: string = result.summary || cv.summary || '';
    const allText = (finalSummary + ' ' + finalSkills.join(' ') + ' ' +
        updatedExperience.map(e => (e.responsibilities || []).join(' ')).join(' ')).toLowerCase();
    for (const kw of tier1) {
        if (!kw) continue;
        if (!allText.includes(kw.toLowerCase()) &&
            !finalSkills.some(s => s.toLowerCase() === kw.toLowerCase())) {
            finalSkills.push(kw);
        }
    }

    // ── HOT FIRE ── run the same polish chain Generate uses (humanizer +
    // bullet-count + banned-phrase filter + purify + pronoun fix) so a JD
    // optimization is at parity with a fresh Generate.
    const merged: CVData = {
        ...cv,
        summary: finalSummary,
        skills: finalSkills,
        experience: updatedExperience,
    };
    const finalized = await runQualityPolishPasses(merged, {
        runHumanizer: true,
        bulletCount: { type: 'preserve-cv', sourceCv: cvInput },
        finalize: { sourceCv: cvInput },
    });

    // ── Final guard (partial) — skill dedup + summary opener on optimized output ─
    const _guardedSummary = purgeSummarySeekingLanguage(fixSummaryOpener(finalized.summary || ''));
    const _guardedSkills  = deduplicateSkills(finalized.skills || []);

    return {
        summary:    _guardedSummary,
        skills:     _guardedSkills,
        experience: finalized.experience,
    };
};

export const polishExistingCV = async (
    cvDataInput: CVData,
    onLeakSummary?: (s: LeakSummaryPayload) => void,
): Promise<CVData> => {
    const cvData = purifyInboundCV(cvDataInput);
    return runQualityPolishPasses(cvData, {
        runHumanizer: true,
        bulletCount: { type: 'preserve-cv', sourceCv: cvDataInput },
        finalize: { sourceCv: cvDataInput },
        onPurifyReport: (report) => logLeakSummary(report, 'Polish'),
        ...(onLeakSummary ? { onLeakSummary } : {}),
    });
};

export const improveCV = async (
    cvDataInput: CVData,
    personalInfo: PersonalInfo,
    instruction: string,
    jobDescription?: string,
    onLeakSummary?: (s: LeakSummaryPayload) => void,
    onProgress?: (stage: 'analysing' | 'improving' | 'polishing') => void,
): Promise<CVData> => {
    onProgress?.('analysing');
    // ── HOT FIRE (inbound) ── scrub before serializing into the prompt
    const cvData = purifyInboundCV(cvDataInput);
    const cvJson = JSON.stringify(cvData, null, 2);

    const prompt = `
You are an elite CV writer. The user wants to improve their CV. Apply the instruction below and return the COMPLETE improved CVData JSON.

INSTRUCTION: "${instruction}"

CURRENT CV DATA (JSON):
${cvJson}

CANDIDATE NAME: ${personalInfo.name}
${jobDescription ? `TARGET JOB DESCRIPTION:\n${jobDescription}` : ''}

Rules:
1. Apply the instruction precisely.
2. Keep all factual details accurate — don't change company names, job titles, or invent new roles. You MAY add missing dates where a role has an empty or blank "dates" field; infer the approximate period from surrounding roles or education year.
3. Return the COMPLETE CVData object with ALL fields, not just the modified parts.
4. Bullets follow "Strong Verb → Scope → Result". Only ~50–60% should carry a metric — leave some qualitative.
5. LANGUAGE: Write like a confident working professional, not an AI. Use plain, direct language. Do NOT upgrade vocabulary to formal or academic register. Do NOT use words like "spearheaded", "leveraged", "synergized", "utilized", "facilitated", "orchestrated", "catalyzed", "ideated", or any elevated corporate-speak. The final text should sound like a real person wrote it in their own voice.
6. NEVER output reasoning, notes, or internal commentary into any CV field. CV fields must contain ONLY professional CV content a human would write themselves. Forbidden outputs in any field: "Years is not present", "Note:", "Based on the profile", "The candidate has/lacks", "As instructed", "Since no dates are provided", "[Internal]", or any other reasoning/assessment. If information is missing, simply write the best CV content you can from what is available — do NOT annotate the absence.
7. TENSE: current role (endDate "Present") bullets use bare present tense verbs (Manage, Lead, Build — NOT "Manages", "Leads", "Builds"). All past roles use past tense (Managed, Led, Built).
8. SCOPE ANCHOR: the FIRST bullet of every role must state team size, budget, geographic scope, or project count — not an achievement. Use only real numbers from the candidate's profile. Example structure (not literal values): "Oversee a portfolio of [N] projects across [region], coordinating a [N]-person field team." ← replace [N]/[region] with REAL profile data.
9. OPENER ROTATION: Use all 7 opener types across each role — no single type may appear more than twice per role. The 7 types: (1) verb — "Manage a team…", "Built a pipeline…"; (2) number — "[N] projects delivered…"; (3) scope — "Across [N] regions…"; (4) context — "As the sole engineer…"; (5) timeframe — "In [quarter/year]…"; (6) collaboration — "With the operations team…"; (7) outcome — "Top performer in…". Replace [N] with REAL profile values. Roles with 5+ bullets must include at least 3 different opener types.
10. NO EM DASH AS SEPARATOR: never write "verb X—noun Y" inside a bullet. Use a comma or semicolon instead.
11. NO DUPLICATE VERB STARTERS: no two bullets across the entire document may begin with the same verb stem.
12. EDUCATION — degree, school, and year are LOCKED (return them exactly as received, character for character). You MAY rewrite the description field as one concise sentence — but do NOT exaggerate, invent modules, or claim qualifications not in the source data. If no JD is provided, keep the description exactly as received.
13. REPEATED PHRASES: Scan all bullets across all roles. If the same phrase of 4+ words appears in more than one bullet, rewrite the second occurrence to use different wording while preserving the meaning. No phrase should appear twice in the experience section.
14. SUMMARY ECHO: If a phrase from the professional summary is also used verbatim in a bullet, rephrase the bullet. The summary and bullets must complement each other, not repeat the same words.
15. EXAMPLE DATA: Any [N], [region], or example structures in these rules are placeholder templates. Do NOT copy them into the output. Every number and claim must come from the candidate's actual profile data.

${HUMANIZATION_CHECKLIST}

${CV_DATA_SCHEMA}
`;

    onProgress?.('improving');
    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.4, json: true });
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()) as CVData;

    onProgress?.('polishing');
    // Run the quality polish chain (deterministic passes only — no humanizer).
    // The main groqChat prompt above already applies every humanizer fix
    // (banned phrases, tense, verb starters, rhythm, scope anchors, etc.)
    // so running the humanizer again is redundant and adds 20-40 s of latency.
    // The fast deterministic passes (purifyCV, bullet count, finalize, pronoun fix)
    // still run to catch anything slipping through.
    return runQualityPolishPasses(parsed, {
        runHumanizer: false,
        bulletCount: { type: 'preserve-cv', sourceCv: cvDataInput },
        finalize: { sourceCv: cvDataInput },
        onPurifyReport: (report) => logLeakSummary(report, 'Auto Optimize'),
        ...(onLeakSummary ? { onLeakSummary } : {}),
    });
};
