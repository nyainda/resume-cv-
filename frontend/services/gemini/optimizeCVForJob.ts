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

/**
 * Generates tailored interview Q&A pairs from the CV + JD.
 * Uses GROQ_FAST for token efficiency (≈60% cheaper than GROQ_LARGE).
 */
// ─── Thank-You Letter Generator ───────────────────────────────────────────────

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

