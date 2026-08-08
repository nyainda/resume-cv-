/**
 * Main generateCV orchestrator and voice consistency.
 * Extracted from geminiService — logic unchanged.
 */

import { initNlp } from '../nlpTense';
import { UserProfile, CVData, CVGenerationMode, ScholarshipFormat } from '../../types';
import { groqChat, groqChatStream, GROQ_LARGE, GROQ_FAST, getLastAiEngine, getSelectedProvider } from '../groqService';
import {
    purifyCV, purifyProfile, purifyInboundCV, revertCorruptedMetrics,
    enforceOpenerDiversity, enforceRhythmBalance, enforceScopeAnchors,
    enforceTenseConsistency, enforcePerRoleVariance, type PurifyReport,
} from '../cvPurificationPipeline';
import { remotePrePurify } from '../cvPurifyClient';
import { detectFieldWithSource, lockRealNumbers, buildPromptAnchorBlock, fixPronounsInCV, recordFieldHistory } from '../cvPromptHelpers';
import { logGeneration, quickHash } from '../telemetryService';
import { MarketResearchResult, buildMarketIntelligencePrompt } from '../marketResearch';
import { buildBrief, validateVoice, reportLeaks, workerTieredLLM, workerRaceLLM, workerParallelSections, type CVBrief, type ParallelSectionRequest } from '../cvEngineClient';
import { findOverusedWords } from '../cvEngine/wordFrequency';
import { ROLE_TRACKS } from '../../data/roleTracks';
import { profileToCV } from '../../utils/profileToCV';
import { formatExpDateRange } from '../../utils/cvDataUtils';
import {
    collectSourceNumberTokens as _collectSourceNumberTokens,
    repairBulletsAgainstSource as _repairBulletsAgainstSource,
    logCvQualityReport as _logCvQualityReport,
} from '../cvNumberFidelity';
import { startTrace, storeTrace, attachTrace, type TraceBuilder } from '../generationTrace';
import { getPromptVersions } from '../promptRegistryClient';
import { runValidationEngine } from '../cvValidationEngine';
import { reconcileSkills, type ReconciledSkills } from '../skillsReconciler';
import {
    computeExampleFingerprint, fetchCVExample, storeCVExample, buildReferenceBlock, type NarrativeAngle,
} from '../cvExamplesClient';
import { getHashIfCached, getProfileCacheHash, sha256Hex } from '../profileCacheClient';
import { runQualityGate, consumePreviousViolationsBlock } from '../cvQualityGate';
import {
    SYSTEM_INSTRUCTION_PROFESSIONAL, HUMANIZATION_CHECKLIST, CV_DATA_SCHEMA,
    _criticalRulesReminder, _humanizationInstructionHeader,
} from './rulesState';
import {
    detectCurrency, detectSeniority, detectScenario, detectDomainPivot,
    buildPivotBlock, buildScenarioBlock, detectMarket, detectGaps,
    buildModePromptBlock, _normalizeCurrencyInCV,
} from './preGeneration';
import { runGroqValidator, runHumanizationAudit, applyBannedPhraseFilter } from './validatorHumanizer';
import { selectFreshAngleDetailed, recordAngleUsed, buildNarrativeAngleBlock, verifyNarrativeAngle } from '../narrativeAngle';
import { CV_RULES_VERSION, cvCacheKey, cvCacheGet, cvCacheSet, cloneCVData } from './cvGenerationCache';
import { deleteCVCacheEntry } from '../cvCache';
import { compactProfile, smartTruncateJD, jdProfileSimilarity, slimPromptProfile } from './profileSerialize';
import { applySourceFidelityRules } from './sourceFidelity';
import { finalizeCvData } from './finalizeCvData';
import { _runSilentQualityGuardian } from './silentGuardian';
import { buildStaleProfileRefreshInstruction } from './sourceFidelity';
import { buildScholarshipFormatInstruction, buildSectionOrderInstruction } from './profileGeneration';
import { shuffleArray } from './varianceHelpers';
import { _getBannedPhrasesForPrompt } from './bannedPhrasesPrompt';
import { runQualityPolishPasses } from './qualityPolish';
import { analyzeJobDescriptionForKeywords } from './jobKeywords';
import { stripFencesMain, repairCVJson } from './cvJsonUtils';

export const generateCV = async (
    profileInput: UserProfile,
    contextDescription: string,
    generationMode: CVGenerationMode,
    purpose: 'job' | 'academic' | 'general',
    scholarshipFormat: ScholarshipFormat = 'standard',
    marketResearch?: MarketResearchResult | null,
    targetLanguage?: string,
    callerOnPurifyReport?: (report: PurifyReport) => void,
    /**
     * Deterministic ATS gap-pins: keywords confirmed missing from the user's
     * *current* CV via `scoreAtsCoverage`. When provided, these are injected
     * into the prompt as a highest-priority "MUST APPEAR" list so the generated
     * CV specifically bridges the gap between the current draft and the JD.
     * Capped at 12 terms inside the function regardless of what is passed.
     */
    targetKeywords?: string[],
    /**
     * Optional streaming callback fired immediately when the raw Worker sections
     * arrive — before the quality polish pipeline. Lets the UI show the CV
     * progressively while polishing runs in the background.
     */
    onSectionsDraft?: (cv: Partial<CVData>) => void,
    /**
     * Active profile slot ID. When provided, the profile cache lookup is
     * scoped to THIS slot only — preventing cross-profile hash reuse when two
     * slots share the same compact profile JSON (e.g. a freshly-cloned room).
     */
    slotId?: string,
    /**
     * Previously generated CV for this slot. When provided, enforcePerRoleVariance
     * runs a final pass to ensure the new generation differs enough from the
     * previous one — preventing identical bullet openers on regeneration.
     */
    previousCvData?: CVData,
    /**
     * Explicit user regeneration. This bypasses the in-memory cache and asks
     * the angle selector to avoid the most recently used suitable framing.
     */
    forceRegenerate = false,
): Promise<CVData> => {

    // ── HOT FIRE (inbound) ── Scrub banned phrases out of the source profile
    // BEFORE any prompt is built, so the AI is never primed by buzzwords the
    // user typed manually or that survived from a non-Word import path.
    const profile = purifyProfile(profileInput);

    // Smart-truncate the JD before anything else to reduce token spend on every
    // downstream call (keyword analysis, mode prompt, market intel, etc.)
    const jd = smartTruncateJD(contextDescription.trim());

    // ── Cache check: return immediately if profile+JD+mode haven't changed ──
    // Explicit Redo/Force Fresh must never return the previous CV.
    const _pinnedKeywords = (targetKeywords || []).slice(0, 12);
    const cacheKey = cvCacheKey(profile, jd, generationMode, purpose, {
        targetLanguage,
        scholarshipFormat,
        marketResearch: marketResearch || null,
        targetKeywords: _pinnedKeywords.length ? _pinnedKeywords : undefined,
    });
    if (forceRegenerate) {
        deleteCVCacheEntry(cacheKey);
        console.log('[CV Cache] Explicit regeneration — cache entry invalidated');
    } else {
        const cached = cvCacheGet(cacheKey);
        if (cached) {
            console.log('[CV Cache] Hit — returning cached result (no tokens used)');
            return cached;
        }
    }

    // ── Narrative angle — fit-aware selection with scoped LRU rotation ────────
    // The score only chooses framing; it never supplies facts. Strong profiles
    // rotate among their best-supported angles, while weak profiles retain the
    // original all-angle LRU fallback.
    const _anglePick = selectFreshAngleDetailed({
        profile,
        jd,
        purpose,
        slotId,
        preferDifferent: forceRegenerate,
    });
    const _narrativeAngle: NarrativeAngle = _anglePick.angle;
    const _angleHistoryKey = _anglePick.historyKey;
    console.log(
        `[CV Gen] Narrative angle: ${_narrativeAngle} ` +
        `(mode=${_anglePick.mode}, pool=[${_anglePick.pool.join(',')}], ` +
        `scores=${JSON.stringify(_anglePick.scores)})`,
    );

    // ── Generation trace — lightweight audit trail for this generation ────────
    const _traceBuilder: TraceBuilder = startTrace(CV_RULES_VERSION, _narrativeAngle, _pinnedKeywords);

    // S4: fetch active prompt version numbers from cache (no network if pre-warmed)
    // and tag them into the trace so every CV is linked to the exact prompt versions
    // that produced it.  Fire-and-forget — failures silently produce an empty map.
    void getPromptVersions().then(versions => {
        if (Object.keys(versions).length > 0) {
            _traceBuilder.record({ promptVersions: versions });
        }
    }).catch(() => {/* graceful degradation */});

    // Compute total years of experience for the engine brief
    const totalYears = (profile.workExperience || []).reduce((sum, exp) => {
        const sy = exp.startDate ? new Date(exp.startDate).getFullYear() : null;
        const ey = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
        return sum + (sy ? Math.max(0, ey - sy) : 0);
    }, 0);
    const primaryTitle = profile.workExperience?.[0]?.jobTitle || '';
    const seniority = totalYears < 3 ? 'junior' : totalYears < 7 ? 'mid' : totalYears < 12 ? 'senior' : 'exec';

    // Start reference-example lookup in the background (parallel with brief + keywords).
    // Pool diversity: pass the CURRENT angle so the worker returns an example that
    // used a DIFFERENT angle — preventing the feedback loop from converging on one framing.
    // A fingerprint miss returns null quickly; a hit adds ~150 tokens that guide structure.
    const cvExamplePromise: Promise<{ fingerprint: string; example: Awaited<ReturnType<typeof fetchCVExample>> }> =
        computeExampleFingerprint(primaryTitle, totalYears, purpose, generationMode)
            .then(async fp => ({ fingerprint: fp, example: await fetchCVExample(fp, _narrativeAngle) }))
            .catch(() => ({ fingerprint: '', example: null }));

    // Run keyword extraction and CV-engine brief in parallel — both are best-effort.
    let keywordInstruction = '';
    let engineBrief: CVBrief | null = null;
    const [keywordRes, briefRes] = await Promise.allSettled([
        jd ? analyzeJobDescriptionForKeywords(jd) : Promise.resolve(null),
        buildBrief({
            jd: jd || undefined,
            // Worker-first enrichment: send a compact profile snapshot so the
            // Cloudflare brief builder can score field/voice with more context
            // than JD text alone (skills, title trajectory, project domains).
            profile: {
                headline: profile.summary || profile.personalInfo?.title || '',
                skills: (profile.skills || []).slice(0, 30),
                experience: (profile.workExperience || []).map(exp => ({
                    jobTitle: exp.jobTitle || '',
                    company: exp.company || '',
                    responsibilities: exp.responsibilities || '',
                    startDate: exp.startDate || '',
                    endDate: exp.endDate || '',
                })).slice(0, 12),
                projects: (profile.projects || []).map(p => ({
                    name: p.name || '',
                    description: p.description || '',
                    technologies: (p as any).technologies || [],
                })).slice(0, 10),
            },
            yearsExperience: totalYears,
            currentTitle: primaryTitle,
            section: 'current_role',
            bulletCount: profile.workExperience?.[0]?.pointCount ?? 5,
        }),
    ]);
    if (keywordRes.status === 'fulfilled' && keywordRes.value) {
        const allKeywords = [...(keywordRes.value.keywords || []), ...(keywordRes.value.skills || [])];
        if (allKeywords.length > 0) {
            keywordInstruction = `
                **CRITICAL REQUIREMENT: KEYWORD STRATEGY**: Strategically and naturally integrate the following keywords throughout the CV — in the summary, bullet points, and skills. Weave them in so they feel organic, not stuffed.
                **Must-Include Keywords**: ${allKeywords.join(', ')}
                `;
        }
    } else if (keywordRes.status === 'rejected') {
        console.error("Keyword analysis failed, proceeding without explicit keywords.", keywordRes.reason);
    }

    // ── JD-aware skill reconciliation ─────────────────────────────────────────
    // Run immediately after JD analysis so we know which profile skills are
    // actually relevant to this job. Result flows into three places:
    //   1. mainPromptInstruction — hint for the skills section prompt
    //   2. experience section instruction — per-role skill-demonstration directives
    //   3. applySourceFidelityRules — authoritative post-gen skills gate
    let _reconciledSkills: ReconciledSkills | null = null;
    if (jd && keywordRes.status === 'fulfilled' && keywordRes.value) {
        const jdAllSkills = [
            ...(keywordRes.value.keywords || []),
            ...(keywordRes.value.skills || []),
        ];
        if (jdAllSkills.length > 0) {
            try {
                const experienceEntries = (profile.workExperience || []).map((exp, idx) => {
                    const raw = exp.responsibilities;
                    const bullets: string[] = Array.isArray(raw)
                        ? raw as string[]
                        : typeof raw === 'string'
                            ? raw.split(/\n|•|–|-/).map((s: string) => s.trim()).filter(Boolean)
                            : [];
                    return { id: `role_${idx}`, bullets };
                });
                const flatBullets = experienceEntries.flatMap(e => e.bullets);
                _reconciledSkills = reconcileSkills(
                    profile.skills ?? [],
                    jdAllSkills,
                    flatBullets,
                    experienceEntries,
                    /* jdOnlyMode= */ true,
                    { seniority },
                );
                console.log(
                    `[SkillsReconcile] JD-aware: ${_reconciledSkills.finalSkills.length} skills ` +
                    `(promoted=${_reconciledSkills.promoted.length}, ` +
                    `+${_reconciledSkills.addedFromJD.length} evidenced JD, ` +
                    `-${_reconciledSkills.dropped.length} dropped). ` +
                    `Evidence map: ${_reconciledSkills.evidenceMap.size} skills role-anchored.`
                );
            } catch (err) {
                console.warn('[SkillsReconcile] Failed (non-fatal, using profile.skills):', err);
            }
        }
    }

    // ── Gap-pin block ──────────────────────────────────────────────────────────
    // Deterministic layer: keywords confirmed ABSENT from the user's current CV
    // via `scoreAtsCoverage`. Sits on top of `keywordInstruction` (which is
    // LLM-extracted and lists *all* JD keywords) — the gap-pin block is narrower
    // and higher-priority: it names only the terms that are actually missing so
    // the model knows exactly where to focus its integration effort.
    let gapPinBlock = '';
    if (_pinnedKeywords.length > 0) {
        const kwLines = _pinnedKeywords.map(k => `  - ${k}`).join('\n');
        gapPinBlock = `
**⚠ ATS GAP-PIN — VERIFIED MISSING FROM CURRENT CV (highest priority)**
An automated scan confirmed the following keywords appear in the job description but are ABSENT from the candidate's existing CV. Every term below MUST appear verbatim somewhere in the output. Find the most natural location for each in experience bullets or the skills section ONLY. Do NOT place gap-pin keywords in the professional summary — the summary must reflect the candidate's own value proposition, not keyword-stuffed JD terms. If a term cannot be worked naturally into a bullet given the candidate's actual experience, place it in the skills section instead. Do NOT invent achievements to shoehorn a keyword — use it only where the experience genuinely supports it.
Missing terms that must be incorporated (experience bullets or skills ONLY, never summary):
${kwLines}
`;
        console.log(`[CV Gen] Gap-pin: pinning ${_pinnedKeywords.length} missing ATS keywords: ${_pinnedKeywords.join(', ')}`);
    }

    if (briefRes.status === 'fulfilled' && briefRes.value) {
        engineBrief = briefRes.value;
        console.log(`[CV Engine] Brief: ${engineBrief.seniority?.level} / ${engineBrief.field?.field} / voice=${engineBrief.voice.primary?.name} / verbs=${engineBrief.verb_pool.length}`);
        _traceBuilder.record({
            seniority: engineBrief.seniority?.level ?? '',
            field: engineBrief.field?.field ?? '',
            voice: engineBrief.voice.primary?.name ?? '',
            verbPoolSample: engineBrief.verb_pool.slice(0, 12).map(v => v.verb),
        });
        _traceBuilder.recordTimingMark('briefMs');
    }

    // Build the engine-driven instruction block (only when the brief is available).
    let engineInstruction = '';
    if (engineBrief) {
        // ── Priority 1: Verb pool — random 12 of the full pool per generation ──
        // Sending the same 24 every time creates recognisable verb fingerprints after
        // 50+ CVs. A shuffled 12 produces different verb energy each run.
        const verbList = shuffleArray(engineBrief.verb_pool)
            .slice(0, 12)
            .map(v => v.verb_past || v.verb)
            .join(', ');

        // ── Priority 3: Forbidden phrases — rotate 20 most relevant ──────────
        // Sending all 30 identical phrases every generation narrows the output
        // space the same way every time. Shuffling ensures different 20 each run.
        const forbidden = shuffleArray(engineBrief.forbidden_phrases).slice(0, 20).join(', ');

        const sen = engineBrief.seniority;
        const voice = engineBrief.voice.primary;
        const field = engineBrief.field;

        // ── Priority 6: Verbosity jitter ±0.2 so output feel varies slightly ─
        const verbosityJitter = (Math.random() * 0.4 - 0.2);
        const verbosityEffective = Math.min(5, Math.max(1, (voice?.verbosity_level ?? 3) + verbosityJitter));

        engineInstruction = `
        **CV ENGINE BRIEF (deterministic, overrides general guidance below)**
        - Seniority: ${sen?.level || 'unknown'} → bullet style "${sen?.bullet_style || 'balanced'}", metric density "${sen?.metric_density || 'medium'}", summary tone "${sen?.summary_tone || 'professional'}".
        - Field: ${field?.field || 'general'} → language style "${field?.language_style || 'neutral'}". Prefer metric types: ${(field?.metric_types || []).join(', ') || 'general business metrics'}. Avoid these verbs entirely: ${(field?.avoided_verbs || []).join(', ') || 'none'}.
        - Voice: primary "${voice?.name || 'neutral'}" (${voice?.tone || ''}), verbosity ${verbosityEffective.toFixed(1)}/5, opener frequency ${voice?.opener_frequency ?? 0.2}, metric preference "${voice?.metric_preference || 'medium'}".
        - APPROVED VERB POOL for this generation (use these for bullet starts; never repeat one): ${verbList}.
        - ABSOLUTELY FORBIDDEN PHRASES (zero tolerance): ${forbidden}.
        - ${buildNarrativeAngleBlock(_narrativeAngle)}
        `;
    }

    // ── Proactive slim-profile ────────────────────────────────────────────────
    // If the profile's total responsibility text exceeds ~12 K chars (roughly
    // 6+ roles with detailed bullet lists), use 120 chars/role instead of the
    // default 350 from the very start. This prevents 413s on large profiles
    // without ever needing the retry path — slim-retry remains as a safety net.
    const _totalRespChars = (profile.workExperience || []).reduce((sum: number, exp: any) => {
        const r = exp.responsibilities;
        if (!r) return sum;
        return sum + (typeof r === 'string' ? r.length : (r as string[]).join('\n').length);
    }, 0);
    const _profileMaxChars = _totalRespChars > 12_000 ? 120 : 350;
    if (_profileMaxChars === 120) {
        console.info(
            `[CV Gen] Large profile detected — ${_totalRespChars.toLocaleString()} resp. chars across ` +
            `${(profile.workExperience || []).length} roles. Using slim profile (120 chars/role) proactively.`,
        );
    }

    let mainPromptInstruction: string;
    let githubInstruction = '';

    // ─── Phase A anchor block ─────────────────────────────────────────────────
    // Pure-JS layer that gives Groq three things up-front:
    //   1. Locked real numbers / orgs / degrees (so it can never invent KES 8M
    //      when the profile says KES 800K, or swap "Biosystems Engineering"
    //      for "Agricultural Engineering").
    //   2. Field-aware good bullet examples (placeholder numbers — Groq cannot
    //      copy data out of them).
    //   3. Bad examples drawn from real production bugs we have seen.
    // Built once here, injected into both the job and general prompts below.
    const { field: _detectedField, source: _fieldSource } = detectFieldWithSource(jd, profile);
    _traceBuilder.record({ fieldSource: _fieldSource });
    // Record field history so future auto-detections can learn from this run
    // (user-pinned detections are filtered out inside recordFieldHistory itself).
    recordFieldHistory(_fieldSource, _detectedField);
    const _lockedValues = lockRealNumbers(profile);
    const promptAnchorBlock = buildPromptAnchorBlock({
        locked: _lockedValues,
        field: _detectedField,
    });

    // Scenario classification — runs for ALL purposes (job, general, academic).
    // Detects the candidate's profile type so every mode generates the right CV structure.
    const scenario = detectScenario(profile.workExperience || [], profile.projects || []);
    const scenarioBlock = buildScenarioBlock(scenario, generationMode);
    if (scenario !== 'standard') {
        console.log(`[CV Gen] Scenario ${scenario} detected (purpose: ${purpose}) — applying targeted scenario rules.`);
    }

    // Career-pivot detection — orthogonal to A/B/C/D. Triggers when the candidate's
    // background and the JD belong to clearly different fields (e.g. agricultural
    // engineer applying to a software role). Adds a bridge-formula instruction block.
    const pivot = detectDomainPivot(profile, jd, undefined);
    const pivotBlock = buildPivotBlock(pivot);
    if (pivot) {
        console.log(`[CV Gen] Career pivot detected: ${pivot.from.join('/')} → ${pivot.to.join('/')} — applying bridge-formula rules.`);
    }

    // S1: Rule Registry — evaluate against cached registry configs (zero latency,
    // sync read from localStorage). Records the rule key and A/B group into the
    // generation trace so every generation is traceable to a specific rule version.
    let _ruleEval: import('../ruleRegistryClient').EvaluateResult | null = null;
    try {
        const { evaluateScenario: _evalScenario, getCachedRuleConfigsSync } = await import('../ruleRegistryClient');
        const _ruleConfigs = getCachedRuleConfigsSync();
        const _totalMonths = (profile.workExperience || []).reduce((acc: number, exp: any) => {
            const start = new Date(exp.startDate);
            const end = exp.endDate?.toLowerCase() === 'present' ? new Date() : new Date(exp.endDate);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return acc;
            const mo = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
            return acc + Math.max(0, mo);
        }, 0);
        _ruleEval = _evalScenario({
            hasExperience: (profile.workExperience || []).length > 0,
            hasProjects: (profile.projects || []).length > 0,
            totalMonths: _totalMonths,
            pivotDetected: Boolean(pivot),
        }, _ruleConfigs);
        if (_ruleEval.source === 'registry') {
            console.log(`[CV Gen] Rule Registry: ${_ruleEval.abGroup} (id=${_ruleEval.ruleId})`);
        }
    } catch { /* non-blocking — rule eval failure never aborts generation */ }

    // ── Record scenario + pivot + rule registry into trace ────────────────────
    _traceBuilder.record({
        scenario,
        scenarioEvidence: {
            hasExperience: (profile.workExperience || []).length > 0,
            hasProjects: (profile.projects || []).length > 0,
            pivotDetected: Boolean(pivot),
            pivotFrom: pivot?.from,
            pivotTo: pivot?.to,
        },
        gapKeywords: _pinnedKeywords,
        ...(_ruleEval ? {
            ruleKey:    _ruleEval.ruleKey,
            ruleId:     _ruleEval.ruleId,
            abGroup:    _ruleEval.abGroup,
            ruleSource: _ruleEval.source,
        } : {}),
    });

    if (profile.personalInfo.github) {
        githubInstruction = `IMPORTANT: The user has provided a GitHub profile: ${profile.personalInfo.github}. Leverage this to validate and enrich the technical depth of the skills and projects sections.`;
    }

    const sectionOrderInstruction = buildSectionOrderInstruction(profile);
    const profileJdMatch = jdProfileSimilarity(profile, jd);
    const staleProfileInstruction = buildStaleProfileRefreshInstruction(profile, marketResearch);
    const preservationInstruction = profileJdMatch >= 0.58
        ? `
        **HIGH PROFILE↔JD MATCH DETECTED (${Math.round(profileJdMatch * 100)}%) — PRESERVATION MODE**:
        - Keep the candidate's existing career story, role ordering, and core responsibilities largely intact.
        - Prioritise light optimisation: stronger verbs, cleaner phrasing, better metrics framing, ATS keyword placement.
        - DO NOT rewrite every bullet from scratch when the original already demonstrates the same requirement.
        - Prefer synonym/precision upgrades over structural overhauls.
        `
        : profileJdMatch >= 0.4
            ? `
        **MEDIUM PROFILE↔JD MATCH (${Math.round(profileJdMatch * 100)}%) — BALANCED MODE**:
        - Keep proven relevant bullets and only transform low-signal bullets.
        - Preserve domain-equivalent backgrounds (e.g., Biosystems Engineering ↔ Agricultural Engineering) when responsibilities clearly overlap.
        - Focus edits on terminology alignment, evidence strength, and ATS clarity.
        `
            : '';

    const humanizationInstruction = `
    ${_humanizationInstructionHeader}

    ${HUMANIZATION_RULES}

    ${HUMANIZATION_CHECKLIST}
    `;

    // Build experience instruction — the user's per-role bullet count is BINDING.
    // This block overrides any general bullet-count guidance elsewhere in the prompt.
    const experienceInstructionLines = profile.workExperience.map((exp, idx) => {
        const count = exp.pointCount ?? 5;
        const startYear = exp.startDate ? new Date(exp.startDate).getFullYear() : null;
        const endYear = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
        const years = startYear ? Math.max(1, endYear - startYear) : null;
        const tenureNote = years ? ` (${years} year${years !== 1 ? 's' : ''} tenure)` : '';
        return `  • ROLE_${idx + 1}: ${exp.jobTitle} @ ${exp.company}${tenureNote} → EXACTLY ${count} bullet point${count === 1 ? '' : 's'} ⚠ CONTENT LOCK: bullets for ROLE_${idx + 1} may ONLY draw from ROLE_${idx + 1}'s responsibilities text.`;
    }).join('\n');
    const roleCount = profile.workExperience.length;
    const experienceInstruction = `
=== EXACT BULLET COUNT PER ROLE (USER-CHOSEN — BINDING, OVERRIDES EVERYTHING ELSE) ===
The user has explicitly set the number of bullets per role below. This count is non-negotiable.
- If you generate FEWER bullets than specified, the output will be rejected.
- If you generate MORE bullets than specified, the output will be rejected.
- The scope-anchor bullet counts as bullet #1 (it is included in the total, not added on top).
- Apply this rule to every role listed below, in every generation mode (general, job, academic, regenerate, optimize, improve).

${experienceInstructionLines}

=== TENURE-BASED METRIC GUIDANCE (per role) ===
The following tenure data tells you how long this candidate held each role. Use it to calibrate
the scope and scale of honest claims — longer tenure supports broader claims; shorter tenure
requires narrower, more specific ones. YOU MUST NOT invent specific numbers not present in the
profile, but you MAY infer reasonable scope language from the tenure duration below.
${((): string => {
    const hints = (profile.workExperience || []).map((exp: any, idx: number) => {
        const startDate = exp.startDate ? new Date(exp.startDate) : null;
        const endDate = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate) : new Date();
        const months = startDate ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4))) : null;
        if (!months) return '';
        const years = (months / 12).toFixed(1);
        let guidance = '';
        if (months >= 36) guidance = `Long tenure (${years}yrs). Appropriate to reference: repeated project cycles, client relationship depth, team growth over time, process improvements across multiple quarters.`;
        else if (months >= 18) guidance = `Established role (${years}yrs). Appropriate to reference: end-to-end project ownership, multi-phase delivery, growing responsibilities over the period.`;
        else if (months >= 9) guidance = `Medium tenure (${months}mo). Reference specific deliverables, named projects, and concrete outcomes from that period.`;
        else guidance = `Short tenure / attachment (${months}mo). Focus on specific tasks and concrete outputs — avoid broad organisational claims.`;
        return `  • ROLE_${idx + 1} (${exp.jobTitle} @ ${exp.company}): ${guidance}`;
    }).filter(Boolean);
    return hints.length ? hints.join('\n') : '  (No date information available — base scope claims only on explicit profile content.)';
})()}
=== END TENURE GUIDANCE ===

=== ROLE ISOLATION — CRITICAL, NO EXCEPTIONS ===
The profile contains ${roleCount} work experience role${roleCount !== 1 ? 's' : ''}, each labeled ROLE_1, ROLE_2, … up to ROLE_${roleCount}.
RULE: Bullets for any ROLE_N must draw EXCLUSIVELY from that role's own "_role": "ROLE_N" entry in the profile.
- Every fact, metric, project name, technology, or responsibility belongs to one role only — never copy it into a different role's bullets.
- Before writing each bullet, verify: "Is this fact in THIS role's responsibilities text?" If the answer is no, discard it.
- If a role's responsibilities are thin, write shorter or broader honest bullets — NEVER borrow content from another role to fill space.
- This rule applies equally to every role — ROLE_1, ROLE_2, ROLE_3, and so on, regardless of how many roles exist.
- Mixing content between any two roles is a critical failure that will cause the output to be REJECTED.
=== END EXACT BULLET COUNT BLOCK ===
`;

    if (purpose === 'general') {
        mainPromptInstruction = `
            You are a world-class CV writer. Create a powerful, general-purpose CV that presents the candidate at their absolute best across diverse job markets and industries.

            ${scenarioBlock}
            ${pivotBlock}

            USER PROFILE:
            ${compactProfile(profile, _profileMaxChars)}
            ${githubInstruction}

            ${promptAnchorBlock}

            === CV GENERATION RULES — Follow every rule, no exceptions ===

            ① SUMMARY — Versatile Value Proposition (3–4 sentences, 60–80 words):
               - Sentence 1 (WHO + SENIORITY): Job title + years of experience + primary domain. Specific, not generic. Start with the title or number, never "I" or "A".
                 CRITICAL — NEVER open the summary with: "Accomplished", "Experienced", "Seasoned", or "Dedicated" followed by a job title. These are clichés that immediately signal AI generation to any experienced recruiter. Open with the job title, a year count, or the single strongest quantified result from the candidate's record.
                 ✗ Bad:  "Accomplished product leader with 9 years of experience…"
                 ✓ Good: "Senior Product Manager with 9 years lifting conversion and retention at scale — most recently lifting activation from 31% to 58% across a 2.1M-user fintech platform."
               - Sentence 2 (PROOF): Single most impressive, quantified achievement. Must contain a real number or a specific named outcome.
               - Sentence 3 (RANGE): Breadth across functions, industries, or skills that makes them valuable across contexts.
               - Sentence 4 (PROMISE, optional): The type of value they consistently deliver — one concrete fact, never a cliché.
               - BANNED IN SUMMARY: "passionate about", "detail-oriented", "results-driven", "dynamic", "innovative", "go-getter", "team player", "seeking an opportunity", "seeking to use", "seeking to apply", "seeking to bring", "looking to", "looking for", "aiming to", "hoping to", "eager to join", "excited to contribute", "Accomplished [title]", "Experienced [title]", "Seasoned [title]", "Dedicated [title]". The summary must state what the candidate DELIVERS, not what they WANT — write from the employer's perspective.
               - NEVER use invented verbs anywhere in the CV: "Greenfielded", "Scaffolded" (non-software), "Materialized" (as in "materialized solutions"), "Actioned", "Ideated", "Solutioned". Use standard strong verbs instead.
               - SUMMARY SOURCE RULE (non-negotiable): Every sentence in the summary must be built from the candidate's ACTUAL work experience and education listed in their profile. NEVER copy phrases, role requirements, objectives, or language from the job description into the summary. The target job title may appear once as an alignment signal — nothing else from the JD belongs in the summary.

            ② EXPERIENCE — Showcase Full Breadth and Growth:
               - FIRST BULLET of every role = SCOPE ANCHOR (team size, geographic reach, client count, budget, project count). Not an achievement.
               - Every subsequent bullet: [Strong Verb] + [Specific Action/Context] + [Measurable Outcome].
               - NEVER start bullets with: "Responsible for", "Helped", "Worked on", "Assisted", "Participated in", "Tasked with", "Contributed to".
               - Career arc must be visible: scope and responsibility must grow role-to-role.
               - Verb tense: current role = present tense ("Manages", "Leads"). Past roles = past tense ("Managed", "Led").
               - No two bullets across the entire document may start with the same verb.
               - Bullet counts per role:
               ${experienceInstruction}

            ③ SKILLS — EXACTLY 15 skills:
               Position 1–5: Core domain/technical expertise.
               Position 6–10: Tools, platforms, and methodologies.
               Position 11–13: Transferable skills phrased as demonstrated competencies, not hollow labels.
               Position 14–15: Industry or function-specific terminology that adds ATS value.
               Every skill at positions 1–5 must appear in at least one experience bullet — never list a skill with no evidence.

            ④ PROJECTS — Only include if the profile has real projects. Omit the section entirely if none exist:
               - [Problem or Goal] → [Tools/Approach] → [Measurable Outcome + Scale].
               - Each project description must name at least one specific technology, tool, or methodology.

            ⑤ SECTION OMISSION RULES:
               - Do NOT generate an empty section. An absent section is professional; an empty one is not.
               - If the profile has no work experience → omit the experience section.
               - If the profile has no projects → omit the projects section.

            ⑥ BULLET QUALITY & RHYTHM RULES (mix lengths PROPORTIONALLY by role bullet count N):
               - N=3 → 1 punchy + 2 standard. N=4–5 → 1 punchy + 2–3 standard + 1 narrative. N=6–7 → 2 punchy + 3–4 standard + 1 narrative. N=8–10 → 2 punchy + 4–5 standard + 2–3 narrative.
               - Bands: PUNCHY 8–14 words, STANDARD 15–22 words, NARRATIVE 25–40 words (two sentences).
               - A role with ≥5 bullets that uses only ONE band (e.g. all 8 bullets standard-length) = failure. Three bullets in a row of similar length = failure.
               - Hard floors and ceilings: under 8 words = stub (failure). Over 45 words = rambling (failure).
               - TARGET: At least 40% of bullets per role should carry a number. With 5 bullets, aim for 2–3 with metrics. With 8 bullets, 3–4.
               - Max 65% of bullets per role may contain a number — keep 1–2 per role purely qualitative.
               - Metric synthesis: when explicit numbers are absent, infer conservative estimates from context (tenure, scope words, role norms). Mark estimates with "~", "12+", "up to X". A conservative estimate beats a vague description every time.

            ${engineInstruction}
            ${humanizationInstruction}
            ${preservationInstruction}
            ${staleProfileInstruction}

            ${CV_DATA_SCHEMA}
        `;
    } else if (purpose === 'academic') {
        const scholarshipFormatInstruction = buildScholarshipFormatInstruction(scholarshipFormat);
        mainPromptInstruction = `
            You are the world's leading academic CV specialist and grant-writing consultant. Create an outstanding academic CV that maximizes the candidate's chances for this specific scholarship, grant, or academic opportunity.

            USER PROFILE:
            ${compactProfile(profile, _profileMaxChars)}
            ${githubInstruction}

            GRANT/SCHOLARSHIP/ACADEMIC PURPOSE:
            ${jd || 'General academic application'}

            ${scholarshipFormatInstruction}
            ${keywordInstruction}
            ${gapPinBlock}

            === ACADEMIC CV STRATEGY ===

            ① RESEARCH/ACADEMIC SUMMARY — "Scholar's Pitch" (3–4 sentences, 70–90 words):
               - Sentence 1 (IDENTITY): Research identity + discipline + career stage (e.g., "Doctoral researcher in computational epidemiology with 6 years of quantitative fieldwork across sub-Saharan Africa").
               - Sentence 2 (CONTRIBUTION): Their most significant scholarly contribution — name the publication, grant won, dataset created, or methodology developed. Include a number (citation count, sample size, grant value, etc.).
               - Sentence 3 (METHODOLOGY): Primary research methods/tools that make them uniquely qualified for this opportunity.
               - Sentence 4 (VISION): Future research trajectory and how this opportunity directly enables it. Be specific about what they will achieve, not just what they want to study.
               - RULE: Must not use "passionate about research" or generic academic filler. Every sentence must be checkable.

            ② EXPERIENCE — Scholarly Impact Focus:
               - Every bullet: [Research Verb] + [Methodology/Scope] + [Academic Output or Impact].
               - Strong academic verbs: Investigated, Designed, Analyzed, Published, Presented, Supervised, Secured, Collaborated, Validated, Implemented, Modeled, Synthesized, Contributed, Developed, Evaluated.
               - For publications: include journal name, year, and if possible impact factor or citation count.
               - For grants: include grant body, value in USD/GBP/EUR, and duration.
               - For supervision: include number of students supervised and their outcomes (graduated, papers published).
               - Bullet counts per role:
               ${experienceInstruction}

            ③ SKILLS (15 total — academy-ordered):
               - Position 1–5: Research methods/methodologies (quantitative, qualitative, mixed-methods, specific software: R, Python/pandas, SPSS, NVivo, STATA, MATLAB, etc.).
               - Position 6–10: Domain-specific expertise and theoretical frameworks.
               - Position 11–15: Academic tools, platforms, languages (LaTeX, Mendeley, academic databases, languages spoken).

            ④ EDUCATION — Highlight Academic Distinction:
               - ALWAYS include: GPA if ≥3.5/4.0 or First Class/Distinction equivalent.
               - Thesis title (in full) + 1-sentence description of original contribution.
               - Most relevant honors, scholarships previously won, or fellowships held.
               - 2–3 key relevant courses only if they are directly relevant to the application.
               - GRADUATION-STATUS RULE (binding): If the degree's graduation year is in the past or the current year, treat the degree as COMPLETED. Never write "currently pursuing", "presently pursuing", "currently studying", or equivalents for that entry. Only use "currently pursuing"/"expected [year]" when the graduation year is explicitly in the future, or the year field reads "Expected", "Present", "In Progress", "Ongoing", or is blank.

            ⑤ PROJECTS — Frame as Research Outputs:
               - Each project = a mini research paper abstract: Research Question → Methodology → Findings/Output.
               - Include collaborating institutions if applicable (adds credibility).
               - Link to published papers, repositories, or datasets where available.

            ${engineInstruction}
            ${humanizationInstruction}
            ${preservationInstruction}
            ${staleProfileInstruction}

            ${CV_DATA_SCHEMA}
        `;
    } else {
        // JOB purpose — run the full pre-generation pipeline (Blocks A, B, C, D)
        const currency = detectCurrency(jd, profile.personalInfo?.location || '');
        const seniority = detectSeniority(profile.workExperience || []);
        const market = detectMarket(currency);

        // Block D — company context from market research or JD signals
        let blockD = '';
        if (marketResearch) {
            blockD = buildMarketIntelligencePrompt(marketResearch);
        } else if (jd) {
            blockD = `Extracted from JD: ${jd.substring(0, 600)}`;
        }

        // Gap detection — pass employment gaps to the mode prompt for intelligent handling
        const gaps = detectGaps(profile.workExperience || []);
        if (gaps.length > 0) {
            console.log(`[CV Gen] Detected ${gaps.length} employment gap(s):`, gaps.map(g => `${g.gapMonths}mo between "${g.fromRole}" and "${g.toRole}"`));
        }

        const modeBlock = buildModePromptBlock(generationMode, currency, seniority, market, blockD, gaps);

        mainPromptInstruction = `
            You are the world's greatest CV strategist operating under strict market-calibrated rules.
            Your sole mission: generate the single highest-performing CV for this specific candidate targeting this specific role.

            ${modeBlock}

            ${scenarioBlock}
            ${pivotBlock}

            USER PROFILE:
            ${compactProfile(profile, _profileMaxChars)}
            ${githubInstruction}

            JOB DESCRIPTION / TARGET CONTEXT:
            ${jd}

            ${keywordInstruction}
            ${gapPinBlock}

            ${promptAnchorBlock}

            === CV GENERATION STRATEGY — Follow in order ===

            ① PROFESSIONAL SUMMARY — The "3P Formula" (55–75 words, 3–4 sentences):
               ATS NOTE: The summary is parsed FIRST by every ATS system — it carries the highest keyword weight of any section. The 3 most critical JD keywords MUST appear verbatim in this section.
               HOOK (Sentence 1): [Years of experience as a number] + [EXACT job title from JD] + [primary domain/industry]. Never start with "I" or "A". Start with the number or the role title.
                 NEVER open with "Accomplished", "Experienced", "Seasoned", or "Dedicated [title]" — these clichés signal AI generation instantly to recruiters. Lead with the year count or role title.
                 ✗ Bad:  "Accomplished product leader with 9 years of experience…"
                 ✓ Good: "Senior Product Manager with 9 years lifting activation from 31% to 58% across a 2.1M-user fintech platform."
               PROOF (Sentence 2): Their single strongest, most-quantified achievement that DIRECTLY addresses what the JD needs. Must contain a number within the market metric ceilings stated above. Use XYZ formula: "Accomplished [X] as measured by [Y] by doing [Z]."
               PROMISE (Sentence 3): Why hiring them solves the employer's specific problem — connect their skills to the JD's explicit requirements. Name the company's context from Block D if available.
               BANNED IN SUMMARY: "passionate", "dynamic", "results-driven", "detail-oriented", "innovative", "seasoned professional", "proactive", "go-getter", "versatile", "seeking to", "looking to", "aiming to", "hoping to", "eager to join", "excited to contribute", "Accomplished [title]", "Experienced [title]", "Seasoned [title]", "Dedicated [title]". The summary speaks from the employer's perspective — it states what value the candidate DELIVERS, never what the candidate WANTS.
               NEVER use invented verbs anywhere in the CV: "Greenfielded", "Scaffolded" (non-software), "Materialized" (as in "materialized solutions"), "Actioned", "Ideated", "Solutioned". Use plain strong verbs: Built, Led, Delivered, Managed, Developed, Implemented, Designed, Negotiated, etc.

            ② EXPERIENCE — Every bullet is proof of fit:
               BULLET FORMULA — choose per bullet:
                 WITH metrics → XYZ: "Grew [X] by [Y metric] by doing [Z]" — result first, method second.
                 WITHOUT metrics → CAR: "[Context/Challenge] — [Action taken] — [Change produced]."
                 NEVER start with "Responsible for", "Helped", "Assisted", "Worked on", "Was part of", "Participated in", "Tasked with".

               FIRST BULLET = SCOPE ANCHOR (mandatory for every role):
                 The very first bullet of EVERY role must establish the scope of that role — not an achievement.
                 Include one or more: team size, number of direct reports, geographic coverage, client portfolio size, budget managed, or project count.
                 Example: "Managed a portfolio of 14 enterprise client accounts across Nairobi and Central Kenya, coordinating with a 5-person field operations team."
                 This orients the recruiter before they read any achievement bullets below it.

               BULLET COUNT PER ROLE — USER-CHOSEN (binding, non-negotiable):
                 The user has explicitly set the number of bullets for each role (see "EXACT BULLET COUNT PER ROLE" block below).
                 Generate EXACTLY that number for each role — never more, never fewer, even if you think a role deserves more space.
                 The scope-anchor bullet IS included in that count (it counts as bullet #1 of the role).

               VERB TENSE (critical for ATS employment status detection):
                 Current role (endDate = "Present" or blank): ALL bullets in PRESENT TENSE — "Manages", "Leads", "Coordinates".
                 All previous roles: ALL bullets in PAST TENSE — "Managed", "Led", "Coordinated".
                 Mixing tenses within a single role breaks ATS parsing.

               JD MIRRORING: Mirror the JD's exact phrases in at least 3 bullets per role. Use the same acronyms and terminology the JD uses. Never paraphrase a keyword.
               VERB VARIETY: No two bullets across the entire document may start with the same verb.
               CAREER ARC: Scope, team size, and metric scale must visibly grow across roles — the current role must show the largest scope.
               GOLDEN RULES (apply always):
               - Company names provided by the user are SACRED — never change, invent, abbreviate, or replace them.
               - Dates are locked — never change any employment date.
               - Career must progress forward — never create a backwards timeline.
               - One currency only — the one detected in Block A.
               ${experienceInstruction}

            ③ SKILLS (EXACTLY 15 — ordered by JD priority for ATS):
               Position 1–5: EXACT tools/technologies named in the JD (verbatim — ATS keyword match).
               Position 6–10: Core technical/domain skills for the role, closest JD-adjacent skills first.
               Position 11–13: Soft/transferable skills phrased as demonstrated competencies, not hollow labels.
               Position 14–15: Industry/domain ATS keywords from the JD that did not fit elsewhere.
               NOTE: Every skill at positions 1–5 must also appear at least once in the experience bullets — skills mentioned nowhere else in the CV score very low on ATS.

            ④ EDUCATION:
               'description': 1 concise sentence — GPA if ≥3.5 (or equivalent distinction), thesis title if relevant, honors or distinction, or 2–3 directly relevant courses.
               Highlight scholarships or awards if present — they signal high achievement to recruiters.
               GRADUATION-STATUS RULE (binding): If the degree's graduation year is in the past or the current year, the degree IS COMPLETED. Never write "currently pursuing", "presently pursuing", "currently studying", or any equivalent phrase for that entry. Only use "currently pursuing"/"expected [year]" when the graduation year is explicitly in the future, or the year field reads "Expected", "Present", "In Progress", "Ongoing", or is blank.

            ⑤ PROJECTS — Proof-of-Skill Snapshots:
               FORMAT: [Problem/Goal] → [Solution with named technologies or methods] → [Measurable outcome].
               Prioritize projects that demonstrate skills the JD specifically requires.
               Each project description must name at least one specific technology, tool, framework, or methodology.

            ${engineInstruction}
            ${humanizationInstruction}
            ${preservationInstruction}
            ${staleProfileInstruction}

            ${CV_DATA_SCHEMA}
        `;

    }

    // Prepend section order + custom section notes (if any) to the prompt
    if (sectionOrderInstruction) {
        mainPromptInstruction = `${sectionOrderInstruction}\n\n${mainPromptInstruction}`;
    }

    // Prepend live market intelligence for non-job modes only
    // (job mode already injects market research into Block D of the mode prompt)
    if (marketResearch && purpose !== 'job') {
        const marketBlock = buildMarketIntelligencePrompt(marketResearch);
        mainPromptInstruction = `${marketBlock}\n\n${mainPromptInstruction}`;
    }

    // Language instruction — append if a non-English language is requested
    if (targetLanguage && targetLanguage !== 'English') {
        mainPromptInstruction += `

**LANGUAGE REQUIREMENT (MANDATORY)**:
Write ALL content in ${targetLanguage}. This includes: the professional summary, all experience bullet points, skills list items, education descriptions, and project descriptions.
EXCEPTIONS — keep in original language:
- Proper nouns: company names, university names, product names, tool/technology names, programming language names (e.g. "Python", "React", "Google", "Stanford").
- Dates and numbers.
- The applicant's personal information (name, email, location).
- Any direct quotes or certifications.
Output must be fluent, professional-grade ${targetLanguage} — not a literal translation. Adapt idioms and phrasing to be natural for native ${targetLanguage} speakers in a professional context.
`;
    }

    // ── Structural reference injection (parallel lookup resolves here) ──────────
    // cvExamplePromise ran in parallel with buildBrief, so typically 0 added latency.
    // On a hit: prepend a ~150-token structural blueprint so the LLM mirrors a proven
    // bullet-rhythm pattern rather than inventing from scratch.
    const { fingerprint: exampleFingerprint, example: cvExample } = await cvExamplePromise;
    if (cvExample) {
        const referenceBlock = buildReferenceBlock(cvExample);
        mainPromptInstruction = `${referenceBlock}\n\n${mainPromptInstruction}`;
        console.log(`[CV Examples] Structural reference injected (${cvExample.seniority} ${cvExample.primaryTitle}, ${cvExample.experienceStructure.length} roles)`);
    }

    // ── Inject reconciled-skills hint into prompt ──────────────────────────────
    // Appended AFTER the full instruction is assembled so the model sees it near
    // the end of the context window (recency bias) just before the section call.
    // Only fires on the JD path — no-JD generation is unchanged.
    if (_reconciledSkills?.finalSkills?.length) {
        const promotedLine = _reconciledSkills.promoted.length
            ? `\nHighest priority (confirmed in profile AND JD): ${_reconciledSkills.promoted.join(', ')}.`
            : '';
        mainPromptInstruction += `\n\n=== JD-RECONCILED SKILLS (pre-computed — use as primary source for skills section) ===
The following ${_reconciledSkills.finalSkills.length} skills are BOTH relevant to the target job description AND evidenced in this candidate's profile or experience history. Use these as the starting point for the skills section — prefer this list over raw profile skills for the skills array output.${promotedLine}
Reconciled list (in priority order): ${_reconciledSkills.finalSkills.join(', ')}
If 15 slots remain unfilled after this list, draw from the general profile skills. Never add a skill absent from both this list and the profile.
=== END RECONCILED SKILLS ===`;
    }

    // ── Per-role skill-demonstration directives ────────────────────────────────
    // Built from the evidenceMap: skills anchored to specific experience entries
    // become soft directives injected into the experience section instruction.
    // "Demonstrate, don't just list" — never force or fabricate.
    let _skillDemonstrationBlock = '';
    if (_reconciledSkills?.evidenceMap?.size) {
        // Build role_idx → skills mapping; pick the most recent role per skill
        // to avoid the same skill directive appearing across multiple roles.
        const roleMap = new Map<number, string[]>();
        for (const [skill, roleIds] of _reconciledSkills.evidenceMap) {
            // Exclude profile-only evidence (no experience anchor)
            const entryIds = roleIds.filter(id => id !== 'profile');
            if (entryIds.length === 0) continue;
            // Prefer lowest index (most recent role — profile order is newest-first)
            const earliest = entryIds
                .map(id => parseInt(id.replace('role_', ''), 10))
                .filter(n => !isNaN(n))
                .sort((a, b) => a - b)[0];
            if (earliest === undefined) continue;
            if (!roleMap.has(earliest)) roleMap.set(earliest, []);
            roleMap.get(earliest)!.push(skill);
        }
        if (roleMap.size > 0) {
            const lines = Array.from(roleMap.entries())
                .sort(([a], [b]) => a - b)
                .map(([idx, skills]) => {
                    const exp = profile.workExperience?.[idx];
                    const label = exp
                        ? `${exp.jobTitle || 'Role'} at ${exp.company || ''}`.trim()
                        : `Role ${idx + 1}`;
                    return `  ROLE_${idx + 1} (${label}): ${skills.slice(0, 5).join(', ')}`;
                })
                .join('\n');
            _skillDemonstrationBlock = `\n\n=== JD SKILL-DEMONSTRATION DIRECTIVES ===
For the roles listed below, where NATURAL, write bullets that DEMONSTRATE these skills in action — not merely list them. A skill-demonstration bullet MUST include a measurable outcome, scope, or result alongside the skill (e.g. "Built X using [Skill], reducing Y by Z%" or "Designed X with [Skill] across N clients"). A bullet that only names the skill without an outcome is no stronger than the skills list itself.
GUARDRAIL: Do NOT force a skill into a bullet if it distorts the achievement or requires inventing facts. When in doubt, leave it out.
${lines}
=== END SKILL-DEMONSTRATION DIRECTIVES ===`;
        }
    }

    const temperature = purpose === 'academic' ? 0.5 :
        generationMode === 'honest' ? 0.5 :
            generationMode === 'boosted' ? 0.65 : 0.75;

    // Strip any markdown code fences the model may have wrapped the JSON in

    // CV-gen race tasks: kept for the LEGACY fallback path below. Fires
    // Llama 4 Scout (paid) AND GLM 4.7 Flash (free, 131K) in parallel
    // server-side and takes whichever lands first.
    // cvGenerateFast (Llama 3.1 8B) is a genuinely different model family from
    // cvGenerate (Mistral 24B). Racing different models means if Mistral is slow
    // or returning empty, Llama 8B can win and still deliver a generation.
    // cvGenerateLong was also Mistral — racing the same model twice was a no-op.
    const CV_GEN_RACE_TASKS = ['cvGenerate', 'cvGenerateFast'];

    // ── PRIMARY (Apr 27 2026): Section-parallel CV generation ───────────────
    // Only used when the user has selected Workers AI as their provider.
    // Claude / Gemini selections bypass this entirely and go straight to
    // groqChat (which routes to the selected provider with no cross-provider
    // fallback).
    let cvData: CVData;
    let cvDataFromSections: CVData | null = null;
    if (getSelectedProvider() === 'workers-ai') {
        const sectionsStart = Date.now();
        // Strip the full-CVData schema reference from the preamble — each
        // section call has its own narrower schema in its instruction tail.
        const stripCvSchema = (s: string) => s.split(CV_DATA_SCHEMA).join('').trim();
        let preamble = stripCvSchema(mainPromptInstruction);

        // ── Recency boost — CRITICAL RULES REMINDER ───────────────────────────
        // Appended to the END of the preamble (right before each section's
        // instruction) to exploit LLM recency bias. Rules placed last in the
        // context receive more attention than those buried in the middle of a
        // 20–40K char profile/JD prompt.
        preamble += _criticalRulesReminder;

        // ── Regenerate improvement — previous violation memory ─────────────────
        // If the quality gate found critical violations in the last generation,
        // inject a "DO NOT REPEAT" block at the very START of the preamble so
        // the LLM sees the failures via primacy bias before reading the profile.
        // consumePreviousViolationsBlock() clears the key after reading it, so
        // this block only fires once per cycle — not on every subsequent call.
        const _profileFp = profile?.personalInfo?.name
            ? btoa(unescape(encodeURIComponent(`${profile.personalInfo.name}::${profile.personalInfo?.email ?? ''}`)))
            : undefined;
        const prevViolationsBlock = consumePreviousViolationsBlock(_profileFp);
        if (prevViolationsBlock) {
            preamble = prevViolationsBlock + preamble;
            console.info('[CV Gen] Injected previous-violations block into preamble for regenerate improvement.');
        }

        // Profile cache optimisation — if the compact profile was previously
        // uploaded to D1, replace its text with {{PROFILE}} so the worker
        // fetches it server-side. This shrinks the HTTP request body significantly
        // and keeps the profile out of the network layer on every generation.
        //
        // ISOLATION RULE: When a slotId is provided we ONLY accept the hash that
        // is stored for THAT specific slot, and we re-verify the content hash
        // matches the currently stored hash. This prevents cross-slot contamination
        // where two rooms with identical compact-JSON (e.g. a freshly-cloned room)
        // would incorrectly share the other room's D1 profile cache entry — causing
        // the worker to generate the CV with the wrong room's profile data.
        //
        // Without a slotId we fall back to the old content-addressed scan (safe
        // for all legacy callers that don't pass slotId yet).
        //
        // Fully optional: if the lookup fails the full preamble is used as-is.
        let profileHashForWorker: string | null = null;
        try {
            const compactText = compactProfile(profile);
            let cachedHash: string | null = null;

            if (slotId) {
                // Slot-specific: only accept the hash stored for THIS slot
                const slotStoredHash = getProfileCacheHash(slotId);
                if (slotStoredHash) {
                    // Re-verify the current content still matches what was uploaded
                    const currentHash = await sha256Hex(compactText);
                    if (currentHash === slotStoredHash) {
                        cachedHash = slotStoredHash;
                    } else {
                        console.info(`[ProfileCache] Slot ${slotId.slice(0, 8)} hash mismatch — profile changed since last sync, sending full text`);
                    }
                }
            } else {
                // Fallback: content-addressed scan across all slots (legacy path)
                cachedHash = await getHashIfCached(compactText);
            }

            if (cachedHash && preamble.includes(compactText)) {
                preamble = preamble.replaceAll(compactText, '{{PROFILE}}');
                profileHashForWorker = cachedHash;
                console.info(`[ProfileCache] Using cached profile for slot ${slotId?.slice(0, 8) ?? 'unknown'} (hash ${cachedHash.substring(0, 12)}…) — profile text stripped from preamble`);
            }
        } catch { /* non-critical */ }

        // ⚠ IMPORTANT: Scout 17B silently returns empty responses when the
        // user prompt contains literal JSON example blobs like
        // {"experience":[{"jobTitle":"..."}]}. Describe the schema in plain
        // English instead — every model handles natural-language schemas
        // cleanly (verified Apr 27 2026).
        const sections: ParallelSectionRequest[] = [
            { name: 'summary',    task: 'cvSummary',    instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called summary whose value is the professional summary as a single string. The summary must be 60–90 words, 3–4 sentences, following the hook → proof → promise formula. Honor every rule above (banned phrases, sentence rhythm, length). CRITICAL BANS — the summary must NEVER include any seeking or aspiration language — not even mid-sentence. Absolutely banned: "Seeking to", "Looking to", "Aiming to", "Hoping to", "Eager to" (in any form — "eager to apply", "eager to contribute", "eager to join", etc.), "Excited to", "seeking an opportunity", "looking forward to", "keen to", or ANY clause that expresses what the candidate wants rather than what they deliver. The final sentence MUST state a concrete value delivered to future employers — never a job-seeking statement. Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 500,  temperature, json: true },
            { name: 'skills',     task: 'cvSkills',     instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called skills whose value is an array of EXACTLY 15 string skills. Honor the position-1-5 / 6-10 / 11-13 / 14-15 ordering rule above (JD-priority order for ATS). Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 700,  temperature, json: true },
            { name: 'experience', task: 'cvExperience', instruction: `OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called experience whose value is an array. COMPLETENESS RULE (highest priority): your array MUST contain exactly ${(profile.workExperience || []).length} item(s) — one per role in the profile (ROLE_1 through ROLE_${(profile.workExperience || []).length}). Omitting any role is a critical failure. Each array item is an object with these string fields: company, jobTitle, dates (e.g. "Jan 2020 – Present"), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD or "Present"), and a responsibilities field that is an array of bullet-point strings. Honor the EXACT bullet count per role (binding) and verb-tense rules (current role = present tense bare form e.g. "Manage" not "Manages", past roles = past tense). FIRST bullet of every role is a SCOPE ANCHOR naming team size, budget, geographic coverage, or project count — not an achievement. No two bullets across the entire document may start with the same verb. OPENER ROTATION — use all 7 opener types across each role; no single type may appear more than twice per role: (1) verb "Manage/Build/Lead…"; (2) number "KES 800K in…", "3 counties…"; (3) scope "Across 5 regions…", "For 200+ clients…"; (4) context "As the sole engineer…", "After acquiring…"; (5) timeframe "In Q2 2024…", "Over 6 months…"; (6) collaboration "With the operations team…", "Partnering with…"; (7) outcome "Top performer in…", "Ranked #1…". Roles with 5+ bullets must use at least 3 different opener types. FORBIDDEN VERBS — never start any bullet with invented AI verbs: Greenfielded, Scaffolded (non-software), Materialized, Actioned, Ideated, Solutioned, Conceptualized, Operationalized — use real strong verbs (Built, Led, Delivered, Managed, Designed, Implemented, etc.). CRITICAL ROLE ISOLATION: each role in the profile is labeled ROLE_1, ROLE_2, etc. Bullets for ROLE_N must draw ONLY from ROLE_N's responsibilities text — never copy facts, metrics, project names, or technologies from a different role into another role's bullets. Cross-contamination between roles is a rejection-level failure. Do NOT include any other CVData fields. NO markdown fences, NO commentary.${_skillDemonstrationBlock}`, maxTokens: 5000, temperature, json: true },
            { name: 'education',  task: 'cvEducation',  instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called education whose value is an array. Each array item is an object with these string fields: degree, school, year, description. The description should be one concise sentence covering GPA / honors / thesis / 2–3 relevant courses where applicable. Honor the GRADUATION-STATUS RULE strictly — past or current-year graduation years mean the degree is COMPLETED; never write "currently pursuing" for a past degree. Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 800, temperature, json: true },
        ];
        if (Array.isArray(profile.projects) && profile.projects.length > 0) {
            sections.push({ name: 'projects', task: 'cvProjects', instruction: 'OUTPUT-ONLY OVERRIDE: Reply with a JSON object that has exactly one key called projects whose value is an array. Each array item is an object with these string fields: name, description, link (link may be empty if none exists), dates (copy exactly from the input project\'s startDate/endDate — format as "MMM YYYY – MMM YYYY" or "MMM YYYY – Present"; leave empty string if no dates given). Each project description must follow the format problem/goal → solution with named technologies → measurable outcome, and must name at least one specific technology, tool, framework, or methodology. Do NOT include any other CVData fields. NO markdown fences, NO commentary.', maxTokens: 1200, temperature, json: true });
        }

        const psResult = await workerParallelSections(sections, {
            system: SYSTEM_INSTRUCTION_PROFESSIONAL,
            preamble,
            fallbackTask: 'cvFallback',
            timeoutMs: 90000,
            profileHash: profileHashForWorker,
        });

        if (psResult) {
            // Tolerant parser: accepts {"field": value} OR raw value.
            const tolerantParse = (raw: string | undefined, field: string): any => {
                if (!raw) return null;
                try {
                    const obj = JSON.parse(stripFencesMain(raw));
                    if (obj && typeof obj === 'object' && !Array.isArray(obj) && field in obj) return obj[field];
                    return obj;
                } catch { return null; }
            };

            const sectionSummary = tolerantParse(psResult.results.summary?.text, 'summary');
            const sectionSkills  = tolerantParse(psResult.results.skills?.text,  'skills');
            const sectionEducation = tolerantParse(psResult.results.education?.text, 'education');

            // Parse experience then immediately patch any roles Workers AI dropped
            // due to token limits. We NEVER fail or fall back — missing roles are
            // restored from the raw profile so the user loses nothing.
            const sectionExperience = (() => {
                const aiRoles: any[] = Array.isArray(
                    tolerantParse(psResult.results.experience?.text, 'experience')
                ) ? tolerantParse(psResult.results.experience?.text, 'experience') : [];

                const profileRoles = profileToCV(profile).experience;
                if (aiRoles.length >= profileRoles.length) return aiRoles; // all present — nothing to do

                // Build a lookup of what the AI returned (by company + jobTitle)
                const aiKeys = new Set(aiRoles.map(e => `${e.company}|${e.jobTitle}`));
                const patched = [...aiRoles];
                for (const raw of profileRoles) {
                    if (!aiKeys.has(`${raw.company}|${raw.jobTitle}`)) {
                        // Role was dropped — restore it with profile bullets
                        patched.push(raw);
                        console.warn(
                            `[CV Gen] Workers AI truncated "${raw.jobTitle} @ ${raw.company}" — restored from profile.`
                        );
                    }
                }
                // Re-sort to match original profile order
                const order = new Map(profileRoles.map((e, i) => [`${e.company}|${e.jobTitle}`, i]));
                patched.sort((a, b) =>
                    (order.get(`${a.company}|${a.jobTitle}`) ?? 999) -
                    (order.get(`${b.company}|${b.jobTitle}`) ?? 999)
                );
                return patched;
            })();
            // Parse projects and merge in profile dates — the AI may return them
            // but as a safety net we always fall back to the profile's startDate/endDate
            // so project dates are never silently lost.
            const sectionProjects = (() => {
                const raw: any[] = psResult.results.projects
                    ? (Array.isArray(tolerantParse(psResult.results.projects.text, 'projects'))
                        ? tolerantParse(psResult.results.projects.text, 'projects')
                        : [])
                    : [];
                const profileProjects = (profile.projects || []).slice(0, 6);
                return raw.map((p: any, i: number) => {
                    const src = profileProjects[i];
                    if (!src) return p;
                    // Use AI-formatted dates if present; otherwise derive from profile fields
                    const dates = (typeof p.dates === 'string' && p.dates.trim())
                        ? p.dates.trim()
                        : formatExpDateRange(src.startDate, src.endDate === 'Present' || !src.endDate ? src.endDate : src.endDate);
                    const year = dates
                        ? dates.split(/[-–]/)[0].trim().replace(/^[A-Za-z]+\s+/, '') // extract start year
                        : undefined;
                    return { ...p, dates: dates || undefined, year: year || undefined };
                });
            })();

            const okSummary    = typeof sectionSummary === 'string' && sectionSummary.trim().length > 0;
            const okSkills     = Array.isArray(sectionSkills)     && sectionSkills.length > 0;
            // Require ALL experience roles to be present.
            // Previously used `profile?.experience?.length` which is always undefined on
            // UserProfile (the field is `workExperience`), so minExpected was always 0 and
            // a truncated 3-role response for a 7-role profile would silently pass.
            // Now we require sectionExperience.length === profile.workExperience.length so
            // that any Workers AI token-limit truncation triggers the Groq fallback instead
            // of silently serving an incomplete CV.
            const minExpected  = (profile?.workExperience?.length ?? 0);
            const okExperience = Array.isArray(sectionExperience) && sectionExperience.length >= minExpected;
            const okEducation  = Array.isArray(sectionEducation);

            // ── STREAMING DRAFT ── Fire the callback immediately so the UI can
            // show sections appearing while the quality gate + polishing run in
            // the background. Raw data only — not yet polished.
            if (okSummary && okSkills && okExperience && okEducation && onSectionsDraft) {
                try {
                    onSectionsDraft({
                        summary:    sectionSummary,
                        skills:     Array.isArray(sectionSkills)    ? sectionSkills    : [],
                        experience: Array.isArray(sectionExperience) ? sectionExperience : [],
                        education:  Array.isArray(sectionEducation)  ? sectionEducation  : [],
                        projects:   Array.isArray(sectionProjects) && sectionProjects.length > 0 ? sectionProjects : undefined,
                    });
                } catch (cbErr) {
                    console.debug('[CV Gen] onSectionsDraft callback threw (non-fatal):', cbErr);
                }
            }

            if (okSummary && okSkills && okExperience && okEducation) {
                // ── Quality Gate — Stage 1 (score) + Stage 2 (repair) ────────────
                // Runs on the RAW Worker AI output before purifyCV / humanizer so
                // that structural violations (seeking opener, all-metric roles) get
                // a targeted LLM repair call (300–600 tokens) instead of requiring
                // the user to hit Regenerate. Graceful: if repair fails the raw
                // sections flow into the existing polish pipeline unchanged.
                let gatedSummary    = sectionSummary;
                let gatedExperience = sectionExperience;
                try {
                    const gateResult = await runQualityGate(sectionSummary, sectionExperience, {
                        repair: true,
                        jd: jd || undefined,
                        skills:   Array.isArray(sectionSkills)   ? sectionSkills   : undefined,
                        projects: Array.isArray(sectionProjects) ? sectionProjects : undefined,
                        profileFingerprint: profile?.personalInfo?.name
                            ? btoa(unescape(encodeURIComponent(`${profile.personalInfo.name}::${profile.personalInfo?.email ?? ''}`)))
                            : undefined,
                    });
                    if (gateResult.repairedSummary)    gatedSummary    = gateResult.repairedSummary;
                    if (gateResult.repairedExperience) gatedExperience = gateResult.repairedExperience;
                } catch (gateErr) {
                    console.debug('[CV Gen] Quality gate threw (non-fatal, using raw sections):', gateErr);
                }

                cvDataFromSections = {
                    summary:    gatedSummary,
                    skills:     sectionSkills,
                    experience: gatedExperience,
                    education:  sectionEducation,
                    projects:   Array.isArray(sectionProjects) && sectionProjects.length > 0 ? sectionProjects : undefined,
                };
                const modelLog = Object.entries(psResult.results)
                    .map(([k, v]) => `${k}=${v.task}${v.fellBack ? '*fb' : ''}/${v.ms}ms`)
                    .join(' ');
                console.info(`[CV Gen] Section-parallel completed in ${Date.now() - sectionsStart}ms (worker totalMs=${psResult.totalMs}ms): ${modelLog}`);
            } else {
                console.warn('[CV Gen] Section-parallel returned but some required sections failed to parse — falling back to legacy race path.', { okSummary, okSkills, okExperience, okEducation, errors: psResult.errors });
            }
        } else {
            console.warn('[CV Gen] Section-parallel endpoint unavailable — falling back to legacy race path.');
        }
    }

    if (cvDataFromSections) {
        cvData = cvDataFromSections;
    } else {
        // ── SINGLE-PROMPT GENERATION ─────────────────────────────────────────
        // Routes strictly through the user's selected provider — no automatic
        // cross-provider fallback.
        //
        // Workers AI: keeps a size-aware race path (Workers AI handles large
        //   prompts better than BYOK providers) plus a slim-profile retry on 413.
        // Claude / Gemini: groqChat routes directly to the selected provider.
        //   If it fails, the error is surfaced to the user — no silent switch.
        let rawText: string;
        const _selectedProvider = getSelectedProvider();

        if (_selectedProvider === 'workers-ai') {
            // Workers AI — size-aware routing: large prompts go to the race
            // endpoint directly to avoid a wasted Groq round-trip that 413s.
            const PROMPT_SIZE_GROQ_413_THRESHOLD = 70_000;
            const totalPromptSize = SYSTEM_INSTRUCTION_PROFESSIONAL.length + mainPromptInstruction.length;
            const willGroq413 = totalPromptSize > PROMPT_SIZE_GROQ_413_THRESHOLD;

            if (willGroq413) {
                console.warn(`[CV Gen] Prompt size ${totalPromptSize.toLocaleString()} chars > ${PROMPT_SIZE_GROQ_413_THRESHOLD.toLocaleString()} — routing directly to Cloudflare Workers AI race.`);
                const cf = await workerRaceLLM(CV_GEN_RACE_TASKS, mainPromptInstruction, {
                    system: SYSTEM_INSTRUCTION_PROFESSIONAL,
                    temperature,
                    json: true,
                    maxTokens: 6000,
                    timeoutMs: 90000,
                });
                if (!cf) {
                    const slimPrompt = slimPromptProfile(mainPromptInstruction, profile);
                    console.warn(`[CV Gen] Workers AI unavailable — retrying with slimmed profile (${slimPrompt.length.toLocaleString()} chars).`);
                    rawText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, slimPrompt, { temperature, json: true, maxTokens: 6000 });
                } else {
                    rawText = cf.text;
                    console.info(`[CV Gen] Main generation completed via Workers AI race (winner=${cf.task}, model=${cf.model}, ${cf.raceMs}ms, pre-sized).`);
                }
            } else {
                try {
                    rawText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, mainPromptInstruction, { temperature, json: true, maxTokens: 6000 });
                } catch (workerErr: any) {
                    const status = workerErr?.status;
                    const msg = (workerErr?.message || '').toLowerCase();
                    const isTooLarge = status === 413 || msg.includes('too large') || msg.includes('too long');
                    const isRateLimited = status === 429 || msg.includes('rate') || msg.includes('quota') || msg.includes('limit');
                    if (isTooLarge || isRateLimited) {
                        let fallbackText: string | undefined;
                        if (isTooLarge) {
                            const slimPrompt = slimPromptProfile(mainPromptInstruction, profile);
                            if (slimPrompt.length < mainPromptInstruction.length) {
                                try {
                                    console.warn(`[CV Gen] 413 — retrying with slimmed profile (${slimPrompt.length.toLocaleString()} chars vs ${mainPromptInstruction.length.toLocaleString()})…`);
                                    fallbackText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, slimPrompt, { temperature, json: true, maxTokens: 6000 });
                                    console.info('[CV Gen] Slim-profile retry succeeded.');
                                } catch { /* fall through to race */ }
                            }
                        }
                        if (!fallbackText) {
                            console.warn(`[CV Gen] Workers AI ${status ?? '?'} — falling back to race endpoint.`);
                            const cf = await workerRaceLLM(CV_GEN_RACE_TASKS, mainPromptInstruction, {
                                system: SYSTEM_INSTRUCTION_PROFESSIONAL,
                                temperature,
                                json: true,
                                maxTokens: 6000,
                                timeoutMs: 90000,
                            });
                            if (!cf) {
                                console.error('[CV Gen] Workers AI race also unavailable — re-throwing original error.');
                                throw workerErr;
                            }
                            fallbackText = cf.text;
                            console.info(`[CV Gen] Main generation completed via Workers AI race fallback (winner=${cf.task}, model=${cf.model}, ${cf.raceMs}ms).`);
                        }
                        rawText = fallbackText;
                    } else {
                        throw workerErr;
                    }
                }
            }
        } else {
            // Claude or Gemini — route strictly through groqChat (which enforces
            // the selected provider). No Workers AI race, no cross-provider switch.
            // Pre-emptively slim when the prompt is over the proxy hard limit so the
            // CF edge never sees an oversized body (mirror of the Workers AI path above).
            const BYOK_PROXY_MAX_CHARS = 95_000; // slightly under PROXY_MAX_PROMPT_CHARS to account for JSON envelope
            const promptForByok = mainPromptInstruction.length > BYOK_PROXY_MAX_CHARS
                ? slimPromptProfile(mainPromptInstruction, profile)
                : mainPromptInstruction;
            if (promptForByok.length < mainPromptInstruction.length) {
                console.warn(`[CV Gen] Prompt (${mainPromptInstruction.length.toLocaleString()} chars) exceeds proxy limit — pre-slimmed to ${promptForByok.length.toLocaleString()} chars before sending.`);
            }
            try {
                rawText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, promptForByok, { temperature, json: true, maxTokens: 6000 });
            } catch (byokErr: any) {
                const status = byokErr?.status;
                const msg = (byokErr?.message || '').toLowerCase();
                const isTooLarge = status === 413 || msg.includes('too large') || msg.includes('too long') || msg.includes('request entity');
                if (isTooLarge) {
                    // Last resort — slim even further and retry once
                    const slimmedFurther = slimPromptProfile(promptForByok, profile);
                    if (slimmedFurther.length < promptForByok.length) {
                        console.warn(`[CV Gen] 413 on BYOK path — retrying with further-slimmed prompt (${slimmedFurther.length.toLocaleString()} chars).`);
                        rawText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, slimmedFurther, { temperature, json: true, maxTokens: 6000 });
                    } else {
                        throw byokErr;
                    }
                } else {
                    throw byokErr;
                }
            }
        }

        const cleanText = stripFencesMain(rawText);
        try {
            cvData = JSON.parse(repairCVJson(cleanText));
        } catch {
            // repairCVJson exhausted all recovery options — the model returned
            // JSON that is too malformed to salvage (rare, usually a token-limit
            // truncation mid-string). Surface a clean user-facing message rather
            // than exposing the raw SyntaxError position string.
            const e = new Error(
                'The AI returned a response that couldn\'t be read. This is usually temporary — please try again.'
            ) as any;
            e.isUserFacing = true;
            throw e;
        }
    }

    // ── PART 6 — Groq Validator: runs for job AND general CVs ──────────────────
    // For job mode: uses JD + location for currency/market detection.
    // For general mode: uses profile location only (no JD available).
    // Academic mode is excluded — different quality criteria apply.
    if (purpose === 'job' || purpose === 'general') {
        try {
            // For general mode there is no JD — detect currency from profile location only
            const valCurrency = detectCurrency(
                purpose === 'job' ? jd : '',
                profile.personalInfo?.location || ''
            );
            const valSeniority = detectSeniority(profile.workExperience || []);
            const valMarket = detectMarket(valCurrency);
            const rawExperience = JSON.stringify((profile.workExperience || []).map(e => ({
                company: e.company,
                jobTitle: e.jobTitle,
                startDate: e.startDate,
                endDate: e.endDate,
            })));
            const hasSourceProjects = Array.isArray(profile.projects) && profile.projects.length > 0;
            // Snapshot pre-validator CV so we can revert any field that the
            // validator (especially the small CF Workers AI fallback) corrupts
            // while trying to "reduce" overshoot metrics — e.g. "KES 8,000,000"
            // → "KES ,000".
            const preValidatorCV: CVData = JSON.parse(JSON.stringify(cvData));
            cvData = await runGroqValidator(
                cvData, rawExperience, valCurrency, valSeniority, valMarket,
                scenario, hasSourceProjects
            );
            const validatorRevert = revertCorruptedMetrics(cvData, preValidatorCV);
            if (validatorRevert.reverted.length > 0) {
                console.warn(`[CV Validator] Reverted ${validatorRevert.reverted.length} corrupted-metric field(s):`, validatorRevert.reverted);
                cvData = validatorRevert.cv;
            }
        } catch (validatorError) {
            console.error('[CV Validator] Skipped due to error:', validatorError);
        }
    }

    // ── PART 7 — Shared Quality Polish ────────────────────────────────────────
    // Single call into the unified polish helper so Generate, Auto Optimize,
    // and JD Optimize all share the exact same chain. The helper runs:
    //   humanizer → bullet-count (profile.pointCount) → banned-phrase →
    //   carry profile.customSections + sectionOrder → sort →
    //   purify (with telemetry hook) → voice enforcement (engine brief) →
    //   finalize (source-fidelity vs profile) → pronoun fix.
    // Telemetry + worker leak-queue feed run inside the onPurifyReport hook.
    if (purpose === 'job' || purpose === 'general') {
        // Detect currency for the normalisation pass (cheap pure-regex, same
        // logic as the Groq validator above — re-detected here so valCurrency
        // scope stays inside its own try/catch block).
        const _polishCurrency = detectCurrency(
            purpose === 'job' ? jd : '',
            profile.personalInfo?.location || '',
        );
        cvData = await runQualityPolishPasses(cvData, {
            runHumanizer: true,
            bulletCount: { type: 'profile-pointcount', profile },
            carryProfile: profile,
            engineBrief,
            finalize: { profile },
            reconciledSkills: _reconciledSkills,
            detectedCurrency: _polishCurrency,
            onPurifyReport: (report) => {
                // ── TELEMETRY — fire-and-forget. ──
                try {
                    const wordCount = JSON.stringify(cvData).split(/\s+/).length;
                    const briefStatus: 'present' | 'missing_empty' | 'missing_error' =
                        engineBrief
                            ? 'present'
                            : briefRes.status === 'rejected'
                                ? 'missing_error'
                                : 'missing_empty';
                    logGeneration({
                        cvHash: quickHash(JSON.stringify({
                            sum: cvData.summary,
                            exp: (cvData.experience || []).map(e => e.jobTitle + e.company).join('|'),
                        })),
                        model: 'groq+gemini',
                        promptVersion: 'v2.1',
                        generationMode,
                        briefPresent: Boolean(engineBrief),
                        briefStatus,
                        outputWordCount: wordCount,
                        roundNumberRatio:    report.roundNumberRatio,
                        repeatedPhraseCount: report.repeatedPhrases.length,
                        tenseIssueCount:     report.tenseIssues.length,
                        bulletsTenseFlipped: report.bulletsTenseFlipped,
                        metricsJittered:     report.metricsJittered,
                        substitutionsMade:
                            report.substitutionsMade +
                            report.polishFixes +
                            report.skillsCanonicalised +
                            report.skillsDeduped,
                        // Tag every leak with the AI engine that produced the
                        // raw text. The leaks-summary endpoint groups by this
                        // so we can spot a model that regresses (e.g. a CF
                        // Workers AI tier emitting full-width digits or an
                        // Together.ai model leaking `%` orphans). Falls back
                        // to 'Workers AI' which is the default chain entry.
                        leaks: (report.leaks || []).map(l => ({
                            ...l,
                            aiEngine: l.aiEngine || getLastAiEngine(),
                        })),
                    });
                } catch (e) {
                    console.debug('[CV Gen] telemetry post failed (non-fatal):', e);
                }

                // ── Phase I: feed the worker's leak queue (fire-and-forget). ──
                try {
                    const leakPhrases = Array.from(new Set(
                        (report.leaks || [])
                            .map(l => String(l.phrase || '').toLowerCase().trim())
                            .filter(p => p.length >= 3 && p.length <= 80)
                    ));
                    if (leakPhrases.length) {
                        const sample = (report.leaks?.[0]?.contextSnippet || '').slice(0, 500);
                        void reportLeaks(leakPhrases, sample).catch(() => {/* swallow */});
                    }
                } catch (e) {
                    console.debug('[CV Gen] leak-report post failed (non-fatal):', e);
                }

                // ── Forward to caller hook (e.g. CVGenerator quality panel). ──
                if (callerOnPurifyReport) {
                    try { callerOnPurifyReport(report); }
                    catch (e) { console.debug('[CV Gen] callerOnPurifyReport hook failed (non-fatal):', e); }
                }
            },
        });
    } else {
        // Non-job/general purposes (e.g. academic) — skip humanizer + voice
        // enforcement (those tune for professional-CV voice) but still run
        // the deterministic passes via the helper for consistency.
        cvData = await runQualityPolishPasses(cvData, {
            runHumanizer: false,
            bulletCount: { type: 'profile-pointcount', profile },
            carryProfile: profile,
            engineBrief: null,
            finalize: { profile },
            reconciledSkills: _reconciledSkills,
            ...(callerOnPurifyReport ? { onPurifyReport: callerOnPurifyReport } : {}),
        });
    }

    // ── Store structural example in D1 (fire-and-forget, best-effort) ──────────
    // Only store for job/general purpose with full pipeline — not academic or
    // scholarship variants, which have unusual structural requirements.
    if (exampleFingerprint && (purpose === 'job' || purpose === 'general')) {
        storeCVExample(
            exampleFingerprint,
            primaryTitle,
            seniority,
            generationMode,
            purpose,
            cvData,
            _narrativeAngle,
            engineBrief?.voice?.primary?.name,
        );
        console.log(`[CV Examples] Stored structural blueprint (fingerprint=${exampleFingerprint.substring(0, 8)}… angle=${_narrativeAngle})`);
    }

    // ── Record angle used so next generation picks a different one ────────────
    recordAngleUsed(_narrativeAngle, _angleHistoryKey);
    console.log(`[CV Gen] Angle "${_narrativeAngle}" recorded for scoped history.`);

    // Diagnostic only: confirm the selected framing left some trace in the
    // result. This never rewrites or blocks a CV and therefore cannot invent
    // content merely to satisfy the heuristic.
    try {
        const angleVerify = verifyNarrativeAngle(cvData, _narrativeAngle);
        console[angleVerify.matched ? 'debug' : 'warn'](
            `[CV Gen] ${angleVerify.detail}`,
        );
        _traceBuilder.record({ angleVerify } as any);
    } catch {
        // Verification is non-critical telemetry.
    }

    // ── Validation Engine — hard structural rules, post-purification ──────────
    // Runs synchronously on the final CV before caching or returning.
    // Block violations with a repair strategy are auto-fixed (e.g. skills cap,
    // duplicate skills, seeking phrases). Warn violations are recorded in the
    // trace for telemetry but do not block the user.
    _traceBuilder.recordTimingMark('generationMs');
    const _targetBulletCount = engineBrief?.rhythm?.bullet_count as number | undefined;
    const _validation = runValidationEngine(cvData, {
        targetBulletCount: _targetBulletCount,
        certifications: _lockedValues.certifications, // S3: pass user-supplied certs for hallucination detection
    });
    if (_validation.repairApplied) {
        cvData = _validation.cv;
        console.log(`[CV Validation] ${_validation.violations.filter(v => v.repaired).length} block violation(s) auto-repaired.`);
    }
    if (_validation.violations.length > 0) {
        console.log(`[CV Validation] ${_validation.violations.length} violation(s): ${_validation.violations.map(v => v.ruleId).join(', ')}`);
    }
    _traceBuilder.recordTimingMark('validationMs');

    // ── Finalize + store trace ────────────────────────────────────────────────
    const _finalTrace = _traceBuilder.finalize(
        _validation.violations,
        _validation.repairApplied,
        _validation.passed,
    );
    storeTrace(_finalTrace);
    cvData = attachTrace(cvData, _finalTrace);
    console.log(`[CV Trace] Generation trace stored (id=${_finalTrace.traceId.slice(0, 8)}…, total=${_finalTrace.timings.totalMs}ms, violations=${_validation.violations.length})`);

    // ── Final CV guard: comprehensive last-mile quality gate ─────────────────
    // Layer 1 (deterministic): skill dedup, summary opener, seeking language,
    //   placeholders, double-words, project bullets, free-text fields.
    // Layer 2 (AI, GROQ_FAST, 5s timeout): grammar & coherence on summary +
    //   project descriptions. Graceful fallback — never blocks the CV return.
    const _guard = await runFinalCVGuard(cvData);
    if (_guard.changed) cvData = _guard.cvData;

    // ── Per-role variance enforcement (regeneration guard) ───────────────────
    // When a previous CV is provided (i.e. the user hit Regenerate), check that
    // the new generation is sufficiently different at the role level. Roles whose
    // bullets are too similar to the previous run get their openers reshuffled
    // deterministically — no LLM call, instant, never mutates actual facts.
    if (previousCvData) {
        const { cv: variedCv, fixes: varianceFixes } = enforcePerRoleVariance(previousCvData, cvData);
        if (varianceFixes.length > 0) {
            cvData = variedCv;
            console.log(`[CV Variance] enforcePerRoleVariance reshuffled ${varianceFixes.length} role(s):`, varianceFixes.join(', '));
        }
    }

    // ── Store result in cache ──
    cvCacheSet(cacheKey, cvData);

    return cvData;
};
