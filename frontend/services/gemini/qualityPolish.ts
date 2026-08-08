/**
 * Shared post-generation quality polish chain.
 * Extracted from geminiService — logic unchanged.
 */

import { CVData, UserProfile } from '../../types';
import { type CVBrief, getCachedBannedPhrases } from '../cvEngineClient';
import {
    purifyCV, revertCorruptedMetrics, enforceOpenerDiversity,
    enforceRhythmBalance, enforceScopeAnchors, applyRemoteBannedPhrasesToCV,
    type PurifyReport,
} from '../cvPurificationPipeline';
import { finalizeCvData } from './finalizeCvData';
import { _runSilentQualityGuardian } from './silentGuardian';
import { enforceVoiceConsistency } from './voiceConsistency';
import { fixPronounsInCV } from '../cvPromptHelpers';
import { auditCvQuality as _auditCvQuality } from '../cvNumberFidelity';
import { repairCvSummaryWithAi as _repairCvSummaryWithAi } from '../aiInlineFix';
import { runValidationEngine } from '../cvValidationEngine';
import { type ReconciledSkills } from '../skillsReconciler';
import { _dispatchPolishStage } from './polishStage';
import { _normalizeCurrencyInCV } from './preGeneration';

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

export function buildLeakSummaryPayload(report: PurifyReport): LeakSummaryPayload {
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

// ── Leak-summary console reporter ──────────────────────────────────────────
// Called from improveCV and polishExistingCV via onPurifyReport so every
// auto-optimize run prints a structured summary of what was caught and fixed.
export function logLeakSummary(report: PurifyReport, label: string): void {
    const leaks = report.leaks ?? [];
    const fixed   = leaks.filter(l => l.fixedBy && l.fixedBy !== 'none');
    const flagged = leaks.filter(l => !l.fixedBy || l.fixedBy === 'none');

    const instructionLeaks = fixed.filter(l => l.leakType === 'instruction_leak');
    const bannedFixed      = fixed.filter(l => l.leakType === 'banned_phrase');
    const tenseFixed       = fixed.filter(l => l.leakType === 'tense_mismatch');
    const polishFixed      = report.polishFixes ?? 0;
    const subsFixed        = report.substitutionsMade ?? 0;

    const totalFixed   = fixed.length;
    const totalFlagged = flagged.length;

    const hasAnything = totalFixed > 0 || totalFlagged > 0 || subsFixed > 0;
    if (!hasAnything) {
        console.info(`%c[ProCV Leak Guard — ${label}]%c No leaks detected ✓`, 'color:#16a34a;font-weight:bold', 'color:inherit');
        return;
    }

    console.groupCollapsed(
        `%c[ProCV Leak Guard — ${label}]%c ${totalFixed} fixed · ${totalFlagged} flagged`,
        'color:#d97706;font-weight:bold', 'color:inherit',
    );

    if (instructionLeaks.length > 0) {
        console.warn(`🚫 Instruction-leak preambles stripped (${instructionLeaks.length}):`);
        instructionLeaks.forEach(l =>
            console.warn(`   [${l.fieldLocation ?? 'unknown'}] pattern="${l.phrase}" → snippet: "${(l.contextSnippet ?? '').slice(0, 80)}…"`),
        );
    }
    if (bannedFixed.length > 0)
        console.info(`🔤 Banned-phrase substitutions: ${bannedFixed.length}`);
    if (tenseFixed.length > 0)
        console.info(`⏩ Tense corrections: ${tenseFixed.length}`);
    if (polishFixed > 0)
        console.info(`✨ Polish fixes (weak openers, first-person, etc.): ${polishFixed}`);
    if (subsFixed > 0 && subsFixed !== bannedFixed.length)
        console.info(`🔡 Total text substitutions: ${subsFixed}`);
    if (totalFlagged > 0) {
        console.warn(`⚠️ Flagged (not auto-fixed, review manually): ${totalFlagged}`);
        flagged.slice(0, 5).forEach(l =>
            console.warn(`   [${l.leakType}] ${l.phrase ?? ''} @ ${l.fieldLocation ?? 'unknown'}`),
        );
        if (totalFlagged > 5) console.warn(`   … and ${totalFlagged - 5} more`);
    }

    console.groupEnd();
}

// --- Polish-only (no Groq rewrite) -----------------------------------------
// Runs the shared post-generation polish chain on an existing CV WITHOUT
// re-asking Groq to rewrite anything. Useful when the user already likes
// the wording but wants the latest banned-phrase rules, humanizer, and
// deterministic purification re-applied. Costs ~one CF Workers AI call
// (the humanizer) — no Groq tokens.
