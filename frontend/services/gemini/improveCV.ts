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

// --- GitHub-Powered CV Generation ---

