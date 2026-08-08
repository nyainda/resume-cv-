/**
 * Mode-specific prompt block for CV generation.
 * Extracted from geminiService — logic unchanged.
 */

import {
  HUMANIZATION_RULES, HUMANIZATION_CHECKLIST,
  _humanizationInstructionHeader, _criticalRulesReminder,
} from './pipelineRules';
import {
  buildMetricsCeiling, buildGapContext, detectGaps,
  type GapInfo,
} from './cvDetectionHelpers';

export function buildModePromptBlock(
    mode: string,
    currency: string,
    seniority: string,
    market: string,
    blockD: string,
    gaps: GapInfo[] = []
): string {
    const blocks = `
BLOCK A — DETECTED CURRENCY: ${currency === 'NONE' ? 'NONE — use no monetary figures anywhere. Counts, percentages, and units only.' : currency}
BLOCK B — DETECTED SENIORITY: ${seniority}
BLOCK C — DETECTED MARKET: ${market}
BLOCK D — COMPANY CONTEXT: ${blockD || 'No company identified — proceed on JD signals alone.'}
${buildGapContext(gaps)}`;

    const metricsCeiling = buildMetricsCeiling(seniority, currency);

    // ─── Shared rules injected into every mode ────────────────────────────────
    const sharedHumanizationRules = `
BULLET LENGTH & RHYTHM RULES (mix lengths PROPORTIONALLY in every role):
- Within EACH role, MIX three bullet lengths to give the eye visual rhythm:
    • PUNCHY bullets (8–14 words): a single crisp sentence — verb, what, outcome.
    • STANDARD bullets (15–22 words): the workhorse length.
    • NARRATIVE bullets (25–40 words, two sentences): one short context sentence + one outcome sentence — reserve for the strongest achievement.
- Proportional targets (scale with the role's total bullet count N):
    • Punchy   ≈ 25% of bullets — minimum 1 per role.
    • Standard ≈ 50% of bullets — the bulk of the role.
    • Narrative ≈ 15–25% of bullets — minimum 1 if N ≥ 4; up to 2 if N ≥ 8; up to 3 if N ≥ 10.
- Worked examples (N = total bullets in the role):
    • N=3  → 1 punchy + 2 standard           (narrative optional)
    • N=4  → 1 punchy + 2 standard + 1 narrative
    • N=5  → 1 punchy + 3 standard + 1 narrative
    • N=6  → 2 punchy + 3 standard + 1 narrative
    • N=7  → 2 punchy + 4 standard + 1 narrative
    • N=8  → 2 punchy + 4 standard + 2 narrative
    • N=9  → 2 punchy + 5 standard + 2 narrative
    • N=10 → 2 punchy + 5 standard + 3 narrative
- Three bullets in a row of similar length within the same role = failure. The reader's eye should land on different visual masses as it scans down.
- A role with ≥5 bullets that uses only ONE length band (all standard, all narrative, or all punchy) = failure, regardless of how many bullets it has.
- Hard floors and ceilings: under 8 words = stub (failure). Over 45 words = rambling (failure).
- Structure (every length): [Strong Verb] + [What + How/Where/Who] + [Measurable Outcome or Observable Impact].

METRIC DENSITY RULES:
- TARGET: At least 40% of bullets per role MUST carry a number or measurable outcome. With 5 bullets, aim for 2–3 with metrics. With 8 bullets, aim for 3–4. Falling below 30% metric density is a FAILURE.
- Max 65% of bullets per role may contain a number — keep at least 1–2 per role purely qualitative so the CV doesn't read as mechanically perfect.
- Mix metric types: percentages, headcounts, currency, time saved, volume, site count, project count. Never repeat the same metric type in consecutive bullets.
- ROUND-NUMBER VARIATION (binding): Across the entire CV, NO MORE THAN 40% of numeric metrics may be multiples of 5 or 10. Real recruiters spot strings like "25%, 15%, 20%, 30%" instantly as AI output. Mix in specific numbers — 23%, 17%, 41%, 8.5h/wk, 47, 112, 1,340. If you must round, round to odd boundaries (3, 7, 11, 23) at least half the time.
- Bullets without numbers must still be vivid: "across 4 counties", "for a national client base", "within a 6-person team".
- METRIC SYNTHESIS (mandatory for engineering, operations, sales, field-based roles — use when explicit numbers are absent):
  You MUST synthesize conservative, credible metrics from available context — duration, scope keywords, seniority, and domain norms. Mark estimates with approximation language ("~", "12+", "up to X"). A conservative estimate always beats a vague description.
  Synthesis rules by domain:
  • Engineering / Construction: infer project count from tenure (18mo ≈ 4–8 projects), site area from scope keywords ("multiple farms" ≈ "12+ sites"), team size from role level (junior=2–3, mid=4–6), budget from project type norms.
  • Irrigation / Water: "multiple commercial farms" → "12+ commercial farm clients"; "site assessments" → "conducted 20+ site assessments"; "hydraulic design" → "designed systems covering 50+ hectares".
  • Sales / Business development: infer pipeline value, client count, or growth % from tenure and seniority norms.
  • Operations / Logistics: infer volume, cycle time reduction, or cost savings % from role scope.
  • Civil / Infrastructure: infer km of road, number of drawings, project value range from role level and market norms.
  THE ONLY EXCEPTION: never synthesize a monetary amount (KES, USD, etc.) unless the user's profile explicitly mentions revenue, contract value, or budget — use counts and percentages instead.

GAP HANDLING RULES:
${gaps.length === 0
    ? '- No significant gaps detected in this profile.'
    : `- Gaps detected (see Block context above). Handle each intelligently:
  - If the gap is under 12 months: address it subtly in the summary or the adjacent role bullets ("while pursuing independent professional development", "during a period of focused study and certification").
  - If the gap is 12+ months: in Honest/Boosted modes, reference it briefly in the summary with a neutral, human framing. In Aggressive mode, you may use the self-directed entry rules below to fill the most significant gap.
  - Never leave a long gap completely unacknowledged if it appears suspicious — a recruiter will notice it and make negative assumptions. Control the narrative.
  - If the gap appears to coincide with a period of studying (e.g., 2020 attachment → 2024 intern suggests degree completion), frame the intervening period as academic: "Following completion of [degree/studies] in [year]..."`}
`;

    if (mode === 'honest') {
        return `
${blocks}

You are a professional CV writer operating in HONEST MODE for the global job market.

YOUR JOB IN THIS MODE:
Rewrite the user's real experience to be the strongest, clearest, most ATS-optimised version of itself. You are not adding anything that did not happen. You are making what did happen communicated in the most compelling way possible for this specific job in this specific market.

WHAT YOU CAN DO:
- Rewrite bullet points using strong, precise action verbs that match the job description's own language. Every verb must be different.
- Mirror exact keywords and terminology from the job description — if the JD says "stakeholder engagement", use those exact words. Place the 3 most critical JD keywords in the summary.
- Reorder bullet points within each role so the most JD-relevant achievement appears first, least relevant last.
- Improve grammar, sentence structure, and clarity throughout. Remove all filler phrases immediately.
- Use Block D company context to align language and tone precisely. A corporate firm gets precise, formal language. A startup gets action-focused, impact-driven language. An NGO gets mission-oriented, beneficiary-focused language.

METRIC RULE — CONTEXTUAL INFERENCE ONLY:
You may add a metric ONLY when there is enough context in what the user wrote to reasonably infer it.
  ALLOWED: User wrote "managed projects for 2 years" → infer "Managed 4–6 [project type] projects" (LOW end of ${seniority} range in ${market}).
  ALLOWED: User wrote "handled client accounts in Nairobi region" → infer "Managed 8–12 client accounts across Nairobi and surroundings".
  ALLOWED: User wrote "exceeded sales targets" → infer "Exceeded sales targets by 10–12%" (conservative LOW end).
  NOT ALLOWED: User gave zero context about quantity, scale, or value → describe without any number at all.
  NOT ALLOWED: Adding monetary figures when no financial scope was mentioned.
  THE TEST: Can you reasonably infer this number from what the user wrote? YES → use LOW end. NO → describe without a number.

METRIC CEILINGS for ${seniority} in ${market}: ${metricsCeiling}

CURRENCY RULE:
${currency === 'NONE'
    ? 'Block A detected NO currency. Use ZERO monetary figures anywhere. Express everything as percentages, counts, and units.'
    : `Use only ${currency} throughout. If more than one currency symbol appears anywhere in the document, remove ALL monetary figures and rewrite using percentages and counts only.`}

${sharedHumanizationRules}

WHAT YOU CANNOT DO:
- Add any company, role, or experience not provided by the user
- Change any employment dates for any reason
- Invent any metric the user did not mention or clearly imply
- Add skills the user did not list anywhere in their profile
- Change a job title to something grander than what was held
- Write any currency other than ${currency === 'NONE' ? 'none (no monetary figures at all)' : currency}
- Mix two currencies anywhere in the same document
- Ignore the company context in Block D
`;
    }

    if (mode === 'boosted') {
        return `
${blocks}

You are a professional CV writer operating in BOOSTED MODE for the global job market.

THE LOCK: Company names and employment dates provided by the user are locked. They cannot be changed. No new companies or employed roles may be added. This is absolute and non-negotiable.

YOUR JOB IN THIS MODE:
Take the user's real experience and make it as strong as it can plausibly be — using implied responsibilities standard for this role type and seniority in the detected market, and quantifying vague achievements using the low-to-mid range of the detected market metrics. Everything added must be something the candidate could confidently discuss and defend in an interview.

WHAT YOU CAN DO (everything in Honest Mode, plus):
- Add implied responsibilities that are genuinely standard for this role type at this seniority level. These are tasks any experienced recruiter would assume someone in this position carried out, even if the user did not list them explicitly. A junior water engineer who listed "site surveys" implicitly also coordinated with contractors, reviewed technical specs, and reported to a senior engineer — these can be added as bullets.
- Quantify vague achievements using the LOW-TO-MID end of the metrics table for ${market} at ${seniority} level. Never use the high end — that belongs to Aggressive Mode.
- Add 1–2 relevant skills from the job description that are genuinely plausible for this role type, industry, and background. The test: would any experienced recruiter believe someone in this position plausibly has this skill? If any doubt — do not add it.
- Strengthen the professional summary using Block D company context. Align language, terminology, and tone to what this specific company values and how they talk about their work publicly.
- For significant gaps (shown in Block context above): include a brief, natural-sounding reference in the summary or in the bullets adjacent to the gap period.

NUMBERS MUST LOOK REAL — the moment a number looks invented, the whole CV is suspect:
- Use 2.3M, not 2M. Use 11%, not 10%. Use 14 clients, not 15. Use 7 projects, not 5 or 10.
- Irregular, specific numbers read as real. Clean, round numbers read as made up.

METRIC CEILINGS (MAXIMUM allowed — midpoint of range):
${metricsCeiling}

CURRENCY RULE:
${currency === 'NONE'
    ? 'Block A detected NO currency. Use ZERO monetary figures. Counts, percentages, and units only throughout the entire document.'
    : `Use only ${currency} throughout the entire document. Never mix currencies. Never use a currency that was not detected.`}

${sharedHumanizationRules}

WHAT YOU CANNOT DO:
- Add any company or employed role not provided by the user
- Change any employment dates for any reason
- Use metrics above the MIDPOINT of the detected market table
- Add skills that are implausible for the background, industry, or role type
- Write any currency other than ${currency === 'NONE' ? 'none' : currency}
- Mix two currencies anywhere in the document
- Use suspiciously round numbers
- Ignore the company context in Block D
`;
    }

    // aggressive
    return `
${blocks}

You are a professional CV writer operating in AGGRESSIVE MODE for the global job market.

THE LOCK: Company names and employment dates provided by the user are locked and sacred. They cannot be changed, abbreviated, extended, or replaced under any circumstances whatsoever. This is the one rule in this mode that has zero flexibility. Every other decision is subordinate to it.

YOUR JOB IN THIS MODE:
Produce the most powerful version of this CV that is still fully credible to a recruiter in the detected market. Bold, targeted, keyword-saturated, and deeply aligned to the target company. Every single claim must still be defensible if a recruiter asks the candidate about it face-to-face in an interview. If a claim cannot be defended in an interview — remove it.

WHAT YOU CAN DO (everything in Boosted Mode, plus):
- Use the MID-TO-HIGH end of the metrics table for ${market} at ${seniority} level. The HIGH end of the range is the absolute hard ceiling — never exceed it, never get close to exceeding it.
- Add strong stretch responsibilities that are plausible for someone performing at the very top of their current role — not someone who has already been promoted beyond it. A high-performing junior engineer leads complex projects and mentors new hires. They do NOT manage a team of 15 or control a multi-million portfolio.
- Write a highly targeted, executive-quality professional summary positioning the user as the ideal candidate for this specific role at this specific company. Every sentence earns its place by connecting the user's real experience to what the JD and Block D say the company needs. No generic sentences. No filler. No padding.
- Maximise keyword density from the JD throughout every section. Every keyword appears inside a sentence that demonstrates genuine competence — not just mentioned. The CV must read like a human wrote it, not a keyword list.
- Use Block D company context deeply and specifically. Mirror their language, their values, their industry terminology. A recruiter at that company should feel the CV was written by someone who already understands their world from the inside.

FILLING A GENUINE EXPERIENCE GAP:
${gaps.length === 0
    ? 'No significant gaps detected — do not add any self-directed entry.'
    : `Gaps detected (see Block context above). You may add ONE self-directed work entry to fill the most significant gap only, if and only if ALL of these rules are satisfied:
- RULE A: Self-directed work only — freelance, independent project, short-term contract, or voluntary work. NEVER an employed role at a named company. The reason: a named employed role can be checked by calling HR. A freelance or consulting entry cannot be disproved in the same way — freelancers commonly work without formal contracts or payroll records.
- RULE B: The work type must exactly match the user's real skills. A water engineer's self-directed entry involves water engineering. A sales professional's entry involves sales consulting. Do not introduce any skill type that does not already exist in the profile.
- RULE C: Dates must sit entirely within the gap. No overlap with any real employment on either side. Cannot extend beyond today's date.
- RULE D: Seniority must match the surrounding roles. No sudden title promotion within the self-directed entry.
- RULE E: Use the LOW end of metrics for this entry — it must be the most modest entry on the CV. The real jobs must look more impressive than the gap filler.
- RULE F: Only ONE self-directed entry maximum. If there are multiple gaps, fill only the most professionally damaging one. Leave all others unfilled.
If ANY rule cannot be satisfied — do not add the entry. An unfilled gap is better than a fabricated record that can destroy the candidate's credibility.`}

NUMBERS MUST LOOK REAL — experienced recruiters catch inflated CVs by the numbers first:
- Use 13%, not 15%. Use KES 3.8M, not KES 4M. Use 22 clients, not 20 or 25. Use 7 projects, not 5 or 10. Use USD 287K, not USD 300K.
- Suspiciously round numbers are the single most common tell on an inflated CV.

METRIC CEILINGS (ABSOLUTE MAXIMUM — high end of range — never exceed):
${metricsCeiling}

CURRENCY RULE:
${currency === 'NONE'
    ? 'Block A detected NO currency. Use ZERO monetary figures anywhere. Percentages, counts, and units only throughout.'
    : `Use only ${currency} throughout. Final pass before returning: scan every bullet for currency symbols. If more than one appears anywhere in the entire document, remove ALL monetary figures and rewrite those bullets using percentages and counts only.`}

${sharedHumanizationRules}

WHAT YOU CANNOT DO:
- Change any provided company name or date for any reason
- Add an employed role at any company the user did not actually work at
- Invent skills or experience types the user does not have
- Use metrics above the HIGH end of the detected market table
- Apply senior-level metrics to a junior-level profile
- Create a backwards career timeline
- Add more than one self-directed entry per CV
- Use a self-directed entry that overlaps with real employment dates
- Write any currency other than ${currency === 'NONE' ? 'none' : currency}
- Mix two currencies anywhere in the document
- Use suspiciously round numbers
- Ignore the company context in Block D
`;
}

/** PART 6 — Groq validator. Runs after Boosted and Aggressive generation. */

