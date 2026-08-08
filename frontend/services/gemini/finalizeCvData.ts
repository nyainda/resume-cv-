/**
 * Unified post-generation finalize pipeline.
 * Logic unchanged — extracted for readability.
 */

import { CVData, UserProfile } from '../../types';
import { type ReconciledSkills } from '../skillsReconciler';
import { purifyCV } from '../cvPurificationPipeline';
import {
    collectSourceNumberTokens as _collectSourceNumberTokens,
    repairBulletsAgainstSource as _repairBulletsAgainstSource,
    repairTextAgainstSource as _repairTextAgainstSource,
    logCvQualityReport as _logCvQualityReport,
    auditCvQuality as _auditCvQuality,
} from '../cvNumberFidelity';
import { fixPronounsInCV } from '../cvPromptHelpers';
import { runFinalCVGuard, fixSummaryOpener, purgeSummarySeekingLanguage, deduplicateSkills } from '../cvFinalGuard';
import { normaliseCustomSections } from '../../utils/normaliseSectionType';
import { runValidationEngine } from '../cvValidationEngine';
import { applySourceFidelityRules, applyFidelityAgainstSourceCV } from './sourceFidelity';
import { _runSilentQualityGuardian } from './silentGuardian';

export function finalizeCvData(
    cvData: CVData,
    opts: { profile?: UserProfile; sourceCv?: CVData; runPurify?: boolean; auditLabel?: string; purifierWarnings?: number; reconciledSkills?: ReconciledSkills | null } = {}
): CVData {
    const { profile, sourceCv, runPurify = true, auditLabel = 'finalizeCvData', purifierWarnings, reconciledSkills } = opts;
    let out = runPurify ? purifyCV(cvData).cv : cvData;
    if (profile) out = applySourceFidelityRules(out, profile, reconciledSkills);
    else if (sourceCv) out = applyFidelityAgainstSourceCV(out, sourceCv);
    // Cheap, deterministic post-flight quality audit. Pure regex, runs in
    // <5 ms on a typical CV, never mutates `out`. Logs a single line on
    // success and warnings only when issues are found, so it never spams
    // the console on a clean generation. Pass purifierWarnings so the score
    // is penalised for style leaks that couldn't be auto-fixed — this fixes
    // the "100/100 with 10 warnings" bug.
    try {
        _logCvQualityReport(out as any, auditLabel, { purifierWarnings });
    } catch {
        // Audit must never block generation.
    }
    return out;
}
