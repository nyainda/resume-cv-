/**
 * optimizeCVForJob, polishExistingCV, improveCV, generateCVFromGitHub.
 * Extracted from geminiService — logic unchanged.
 */

import { CVData, PersonalInfo, UserProfile } from '../../types';
import { groqChat, GROQ_LARGE } from '../groqService';
import { SYSTEM_INSTRUCTION_PROFESSIONAL, HUMANIZATION_CHECKLIST, CV_DATA_SCHEMA } from './rulesState';
import { purifyInboundCV, purifyCV, purifyProfile, type PurifyReport } from '../cvPurificationPipeline';
import { compactProfile, smartTruncateJD } from './profileSerialize';
import { finalizeCvData } from './finalizeCvData';
import { runQualityPolishPasses, logLeakSummary, type LeakSummaryPayload } from './qualityPolish';
import { runFinalCVGuard, deduplicateSkills, fixSummaryOpener } from '../cvFinalGuard';

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

// --- AI CV Improvement ---
