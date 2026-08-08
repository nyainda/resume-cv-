/**
 * optimizeCVForJob, polishExistingCV, improveCV, generateCVFromGitHub.
 * Extracted from geminiService — logic unchanged.
 */

import { CVData, PersonalInfo, UserProfile } from '../../types';
import { groqChat, GROQ_LARGE } from '../groqService';
import { SYSTEM_INSTRUCTION_PROFESSIONAL, HUMANIZATION_CHECKLIST, CV_DATA_SCHEMA } from './rulesState';
import { purifyInboundCV, purifyCV, purifyProfile, type PurifyReport } from '../cvPurificationPipeline';
import { compactProfile, smartTruncateJD } from './profileSerialize';
import { finalizeCvData } from './fidelityAndGuardian';
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

export interface GitHubRepoForCV {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    homepage: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    topics: string[];
    updated_at: string;
}

export const generateCVFromGitHub = async (
    repos: GitHubRepoForCV[],
    profileInput: UserProfile,
    githubUsername: string,
    jobDescription?: string
): Promise<CVData> => {
    // ── HOT FIRE (inbound) ── scrub profile before prompt assembly
    const profile = purifyProfile(profileInput);
    const repoSummaries = repos.map(r => ({
        name: r.name,
        description: r.description || '',
        url: r.html_url,
        live: r.homepage || '',
        language: r.language || '',
        topics: r.topics,
        stars: r.stargazers_count,
        forks: r.forks_count,
        updated: r.updated_at.split('T')[0],
    }));

    const allLanguages = [...new Set(repos.map(r => r.language).filter(Boolean))] as string[];
    const allTopics = [...new Set(repos.flatMap(r => r.topics))];

    const jdSection = jobDescription?.trim()
        ? `\nTARGET JOB DESCRIPTION:\n${jobDescription.trim()}\n\nTailor every bullet, skill, and project description to this role. Mirror the exact language from the JD.`
        : '\nNo specific JD provided. Write a strong general-purpose software engineering CV.';

    const prompt = `
You are an elite CV strategist specializing in software engineers. Your task is to generate the absolute best CV for a developer whose actual work is visible on GitHub.

GITHUB USERNAME: ${githubUsername}
GITHUB PROFILE URL: https://github.com/${githubUsername}

GITHUB REPOSITORIES (${repos.length} repos — these are the candidate's REAL projects):
${JSON.stringify(repoSummaries, null, 2)}

DETECTED LANGUAGES: ${allLanguages.join(', ')}
DETECTED TOPICS/FRAMEWORKS: ${allTopics.join(', ')}

USER PROFILE (existing data):
${compactProfile(profile)}
${jdSection}

=== INSTRUCTIONS ===

1. **SUMMARY (3 sentences)**:
   - Position the candidate as a skilled developer based on what their GitHub actually shows.
   - Reference their strongest languages and most impressive projects by name.

2. **EXPERIENCE**: Transform each work experience into high-impact bullets.
   - Use EXACTLY ${profile.workExperience.map(we => `${we.pointCount ?? 5} bullets for ${we.jobTitle} at ${we.company}`).join(', ')}.
   - Start every bullet with a power verb. Quantify impact.

3. **PROJECTS** — CRITICAL: Use ONLY projects from the GitHub repos above.
   - For each selected repo, write a 1–2 sentence description: WHAT it does, WHY it matters, WHAT tech stack.
   - ALWAYS include the real GitHub URL (html_url) or live URL (homepage if available) as the link.
   - Prioritize repos by: stars, recency, complexity, and relevance to the JD.
   - Include at least ${Math.min(repos.length, 6)} projects.
   - DO NOT invent project links — use the exact URLs provided.

4. **SKILLS**: Extract EXACTLY 15 skills from the actual repo languages and topics.

5. **EDUCATION**: Use the profile's education data.

HUMANIZATION RULES:
- Every bullet: Strong Verb → Specific Action → Measurable Result.
- Mix sentence lengths. No AI clichés. Be concrete and specific.

${CV_DATA_SCHEMA}
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, json: true, maxTokens: 8192 });
    const parsed = JSON.parse(text.trim()) as CVData;
    // Unified post-gen pipeline + deterministic source lock
    return finalizeCvData(parsed, { profile });
};

