/**
 * geminiService — public API barrel.
 *
 * Implementation lives in ./gemini/* modules (split for readability).
 * Existing `import { generateCV, ... } from './geminiService'` continues to work.
 */

// Core generation
export { generateCV } from './gemini/generateCVCore';
export { generateProfile, humanizeText, parseProfileJson, buildSectionOrderInstruction, buildScholarshipFormatInstruction } from './gemini/profileGeneration';
export { finalizeCvData } from './gemini/finalizeCvData';
export { applySourceFidelityRules, applyFidelityAgainstSourceCV } from './gemini/sourceFidelity';
export { enforceVoiceConsistency } from './gemini/voiceConsistency';
export { runQualityPolishPasses, logLeakSummary, type LeakSummaryPayload, buildLeakSummaryPayload } from './gemini/qualityPolish';
export { optimizeCVForJob, polishExistingCV, improveCV, generateCVFromGitHub, type GitHubRepoForCV } from './gemini/optimizeImprove';

// File import
export {
  extractProfileTextFromFile,
  generateProfileFromFileWithGemini,
  generateProfileFromFileClaude,
  generateProfileFromFileWithGroq,
  generateProfileFromTextWithGemini,
  extractTextFromImage,
} from './gemini/fileImport';

// Rules & helpers
export { loadRules } from './gemini/rulesState';
export {
  HUMANIZATION_RULES,
  HUMANIZATION_CHECKLIST,
  SYSTEM_INSTRUCTION_PROFESSIONAL,
  SYSTEM_INSTRUCTION_PARSER,
  SYSTEM_INSTRUCTION_HUMANIZER,
  CV_DATA_SCHEMA,
} from './gemini/rulesState';
export { smartTruncateJD, jdProfileSimilarity, compactProfile } from './gemini/profileSerialize';
export { invalidateCVCache } from './cvCache';
export { shuffleArray } from './gemini/varianceHelpers';
export {
  POLISH_STAGE_EVENT,
  type PolishStageId,
  type PolishStagePayload,
} from './gemini/polishStage';

// Narrative angles (already extracted)
export {
  selectFreshAngle,
  selectFreshAngleDetailed,
  recordAngleUsed,
  buildNarrativeAngleBlock,
  verifyNarrativeAngle,
} from './narrativeAngle';

// Feature tools
export { generateCoverLetter } from './gemini/coverLetter';
export { generateInterviewQA } from './gemini/interviewQA';
export { EMAIL_TONE_PRESETS, type EmailToneId, generateApplicationEmail } from './gemini/applicationEmail';
export { analyzeJobDescriptionForKeywords } from './gemini/jobKeywords';
export {
  generateEnhancedSummary,
  generateEnhancedResponsibilities,
  generateQuantifiedAchievements,
  generateEnhancedProjectDescription,
} from './gemini/fieldEnhancers';
export {
  SCHOLARSHIP_FORBIDDEN_PHRASES,
  detectScholarshipName,
  generateScholarshipEssay,
} from './gemini/scholarship';
export { type CVCheckResult, checkCVAgainstJob } from './gemini/cvCheck';
export { generateThankYouLetter } from './gemini/thankYouLetter';
export { generateSmartCoverLetter } from './gemini/smartCoverLetter';
export { paraphraseText, type ParaphraseTone } from './gemini/paraphrase';
export {
  fixVerbSaturation,
  fixBulletsForSignal,
  fixSummaryForSignal,
} from './gemini/coachingFixes';
export { type CVScore, scoreCV } from './gemini/scoreCV';
export { analyzeJobEnhanced } from './gemini/jobAnalysisEnhanced';
