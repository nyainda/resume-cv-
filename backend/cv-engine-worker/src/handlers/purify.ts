/// <reference types="@cloudflare/workers-types" />
import { Env, kvd } from '../types';
import { json, escapeRegex } from '../utils';
import { getCachedBannedPhrases } from './data';
import { sessionCookieFromRequest } from './auth';

// ─────────────────────────────────────────────────────────────────────────────
// CV Pipeline Rules — GET /api/cv/rules
// These constants are the proprietary prompt-engineering rules.
// They live ONLY here, inside the compiled Cloudflare Worker.
// ─────────────────────────────────────────────────────────────────────────────

const _CV_RULES_VERSION = '2026-05c';

export const _CV_SCENARIO_MODE_OVERRIDE = `MODE OVERRIDE: Boosted/Aggressive requires real experience to enhance. AUTO-DOWNGRADED TO HONEST MODE — generate only what is directly evidenced in the profile.`;

export const _CV_SCENARIO_A = `
═══ SCENARIO A — NO EXPERIENCE, NO PROJECTS ═══{{MODE_OVERRIDE}}
SUMMARY — Foundation Formula ONLY (55–70 words):
  Line 1 IDENTITY: Degree + field + institution + year of study/graduation.
  Line 2 CAPABILITY: What they can genuinely do — name specific tools, methods, or domains from their coursework.
  Line 3 SIGNAL: One concrete quality indicator (GPA, award, distinction, class ranking, thesis title).
  Line 4 READINESS: What they bring to the role from day one — grounded in real coursework or academic output.
  BANNED IN SUMMARY: "Seeking opportunity to", "Eager to learn", "Passionate about", "No professional experience but", any implied work history.

SECTIONS TO OMIT (generate nothing, not even a header):
  - Work Experience → OMIT ENTIRELY
  - If no qualifying academic projects exist → OMIT Projects section entirely

PROJECTS SECTION (only if academic work qualifies):
  Use academic projects, thesis, major design assignments, or competition entries with real deliverables.
  Label format: "[Project Name] — Academic Project, [Institution], [Year]"
  Each entry answers: What was the goal? → What tools/methods? → What was the outcome? → What was the scope?
  DOES NOT QUALIFY: attending lectures, reading textbook chapters, following tutorials step-by-step.

EDUCATION — This carries the weight experience normally would. Include ALL that are true:
  - Degree, institution, year, grade/classification
  - Thesis or final year project: title + 1-sentence description + outcome
  - 2–4 relevant course names (actual course titles, not "relevant coursework")
  - Academic achievements: Dean's list, scholarships, prizes, competition placements
  - Extracurricular leadership roles with transferable skills
  - GRADUATION-STATUS RULE (binding): If a degree entry has a graduation year that is in the past or the current year, the degree IS COMPLETED. Never write "currently pursuing", "presently pursuing", "currently studying", "now pursuing", or any equivalent phrase for that entry. Only use "currently pursuing" / "expected [year]" when the graduation year is explicitly in the future or the field reads "Expected", "Present", "In Progress", "Ongoing", or is blank.

SKILLS — Evidence-only rule: list ONLY skills directly taught or used in documented academic work.
  Never list a tool or technology the profile provides no evidence of using.
═══ END SCENARIO A ═══
`;

export const _CV_SCENARIO_B = `
═══ SCENARIO B — HAS EXPERIENCE, NO PROJECTS ═══

SECTIONS TO OMIT (generate nothing, not even a header):
  - Projects → OMIT ENTIRELY. An absent section is professional. A fake section is disqualifying.

SKILLS — Extract only from work experience bullets. Every skill listed must be backed by at least one bullet.
  Do NOT list any skill with no supporting evidence in the experience section.

EXPERIENCE — Must work harder since there are no projects to supplement:
  Every transferable skill the JD requires must be evidenced inside experience bullets.
  If the JD requires a skill not present in the experience, do NOT fabricate it — use the closest honest transferable skill and frame it accurately.
═══ END SCENARIO B ═══
`;

export const _CV_SCENARIO_C = `
═══ SCENARIO C — NO EXPERIENCE, HAS PROJECTS ═══{{MODE_OVERRIDE}}
SUMMARY — Projects-Led Formula ONLY (55–70 words):
  Line 1 IDENTITY: What kind of builder/developer/creator they are + number of projects built.
  Line 2 PROOF: Strongest single project outcome with a real metric or scale (users, GitHub stars, revenue, uptime, completion).
  Line 3 STACK: Core technical stack evidenced across projects — name exact tools, frameworks, languages.
  Line 4 READINESS: What they bring to a team from day one based on what they have already shipped.

SECTION ORDER (mandatory — projects must lead):
  Professional Summary → Skills → Projects → Education → Languages

SECTIONS TO OMIT:
  - Work Experience → OMIT ENTIRELY
  - EXCEPTION: Any internship, attachment, volunteer technical work, or paid freelance work → include as experience.

PROJECTS — Treat each project like a full work experience role (4–6 bullets each):
  - Bullet 1 (scope anchor): What it does, who uses it, what scale, live URL if applicable.
  - Bullets 2–6: XYZ/CAR achievement bullets — tools used, outcomes, growth, measurable impact.
  - Verb tense: present tense if the project is live and maintained; past tense if completed.
  - Do NOT write 2-sentence project summaries. These ARE the candidate's work history — treat them accordingly.

SKILLS — Evidence drawn from projects only. Every skill must be demonstrated in at least one project entry.
═══ END SCENARIO C ═══
`;

export const _CV_SCENARIO_D = `
═══ SCENARIO D — THIN EXPERIENCE (SINGLE INTERNSHIP / ATTACHMENT) ═══{{MODE_OVERRIDE}}
SUMMARY — Emerging Professional Formula (55–70 words):
  Line 1 ANCHOR: Degree + field + institution (the credential).
  Line 2 EVIDENCE: What the internship/attachment concretely demonstrated — real tasks, real environment.
  Line 3 SKILLS: Specific technical skills genuinely acquired during the role.
  Line 4 READINESS: What the JD needs that they can genuinely deliver right now.

EXPERIENCE — The single role gets FULL bullet treatment (5–6 bullets):
  RULE: "1–2 bullets for internships" applies only when multiple roles compete for space.
  When this is the ONLY role → treat it like a current role: 5–6 bullets, scope anchor first, then achievements.

EDUCATION — Expanded (same depth as Scenario A):
  Include thesis/final year project, relevant course names, academic achievements, extracurricular leadership.

PROJECTS — Include academic projects if they exist:
  Label: "[Project Name] — Academic Project, [Institution], [Year]"
  Each: goal → tools/methods → outcome → scope.
═══ END SCENARIO D ═══
`;

export const _CV_PIVOT_BLOCK_TEMPLATE = `
═══ CAREER PIVOT DETECTED — CROSS-DOMAIN APPLICATION ═══
Candidate background domain(s): {{FROM}}
Target role domain(s): {{TO}}

This candidate is applying ACROSS fields. The CV must be honest about this — recruiters and ATS keyword-stuffers both fail when a CV pretends to be domain-native and isn't.

MANDATORY HANDLING:
1. SUMMARY — "Bridge Formula" (60–80 words):
   Sentence 1 (HONEST IDENTITY): Current discipline + the EXACT target title from the JD framed as the transition. Example: "Agricultural engineer transitioning to software development, with 2 years building automation tools that ran on field equipment."
   Sentence 2 (TRANSFERABLE PROOF): The single strongest piece of evidence from the candidate's background that maps to the target role — named tools, methods, or measurable outcomes that genuinely overlap.
   Sentence 3 (DELIBERATE BRIDGE): What concrete steps they have taken to enter the new field (courses completed by name, certifications, side projects shipped, open-source contributions). NEVER vague language like "passionate about transitioning".
   Sentence 4 (READINESS): One specific value they bring from the previous field that the new field rarely has.
   BANNED: "passionate about", "looking to transition", "eager to learn", "no experience but", "career change", "seeking opportunity".

2. EXPERIENCE BULLETS — Reframe, do NOT relabel:
   - Each bullet must be TRUE to what the candidate actually did, but described with vocabulary the target field will recognize.
   - Lead each role with a transferable scope anchor (team size, budget, systems used, scale of data/output).
   - Highlight tools and methods that genuinely cross over (e.g. Python used for soil-data modeling → Python data analysis; SCADA system maintenance → systems monitoring).
   - DO NOT claim experience in target-domain tools the candidate has not actually used. Better an honest gap than a fake skill.

3. SKILLS SECTION — Two-tier ordering:
   Tier 1 (first): Skills the candidate genuinely has that the target field uses (verified by appearing in their actual experience or documented projects/courses).
   Tier 2 (after): Strong domain skills from their original field that demonstrate depth (these prove competence even if not directly used in the new role).
   DO NOT pad Tier 1 with tools they have only read about. Honesty caps fake-skill detection.

4. PROJECTS / CERTIFICATIONS — Make the bridge visible:
   - Surface every project, course, or certification that demonstrates concrete movement into the target field.
   - If none exist, do NOT invent them. The summary must then carry the bridge alone, and the experience reframing must work harder.

5. SECTION ORDER — Bridge-first:
   Summary → Skills (with Tier 1 leading) → Projects/Certifications (if they evidence the pivot) → Experience → Education.
   Rationale: a recruiter doing a 6-second F-pattern scan must see transferable evidence before encountering a job title that screams "wrong field".

6. ATS KEYWORDS — Use target-field vocabulary ONLY where the candidate's actual work supports it. Never list a target-field skill that the experience section cannot back up.
═══ END CAREER PIVOT BLOCK ═══
`;

export const _CV_HUMANIZATION_INSTRUCTION_HEADER = `
    **CRITICAL — AUTHENTIC HUMAN WRITING (AI DETECTION IMMUNITY)**:
    Write as if a confident, accomplished senior professional personally crafted every word in a focused 2-hour session. AI detectors (GPTZero, Originality.ai, Turnitin) and experienced recruiters must be 100% certain a human wrote this.

    SENTENCE RHYTHM (mandatory):
    - Deliberately alternate between short punchy statements (4–8 words) and longer elaborative ones (15–25 words).
    - Three sentences of similar length in a row = failure. Break the pattern.
    - Start at least 2 sentences per section with a number or a past-tense verb for natural variation.

    BANNED PHRASES (zero tolerance — replace with specific facts):
    "delve", "robust", "seamlessly", "synergy", "leverage" (max once in whole document), "cutting-edge", "state-of-the-art", "passionate about", "in today's fast-paced world", "it is worth noting", "navigate the landscape", "groundbreaking", "thought leader", "game-changer", "dynamic", "innovative" (show it, don't say it), "results-driven", "detail-oriented", "team player", "go-getter", "proactive", "best-in-class", "holistic", "moving the needle", "at the end of the day", "take it to the next level", "excited to", "transformative", "impactful" (prove impact with numbers instead).
    BANNED IN SUMMARY (zero tolerance — summary must state what the candidate DELIVERS, not what they WANT): "Looking to", "Looking for", "Seeking to", "Seeking for", "Aiming to", "Aiming for", "Hoping to", "I am looking", "In search of", "eager to join", "excited to contribute", "seeking an opportunity", "seeking to use", "seeking to apply", "seeking to bring".

    SPECIFICITY (mandatory replacements):
    - "improved efficiency" → "cut processing time from X hours to Y minutes"
    - "led a team" → "managed a [N]-person [type] team"
    - "increased revenue" → "grew ARR from \$X to \$Y"
    - "streamlined processes" → "eliminated [N] manual steps, saving [X] hours/week"

    VERB RULES:
    - Every bullet in the CV uses a DIFFERENT strong action verb. Recommended verbs:
      Engineered, Accelerated, Restructured, Negotiated, Overhauled, Forged, Propelled, Slashed, Tripled, Automated, Mentored, Secured, Delivered, Architected, Revamped, Brokered, Consolidated, Deployed, Eliminated, Galvanized, Halved, Implemented, Launched, Migrated, Pioneered, Quantified, Recruited, Scaled, Transformed, Unified, Validated, Won.
    - Never start two bullets across the entire document with the same verb.
    - The first word of each bullet in a job's list must start with a different letter.

    FILLER ELIMINATION:
    - Remove: "in order to", "as well as", "a variety of", "various", "etc", "numerous", "many", "several".
    - Add metrics only when they can be honestly inferred from what the user provided. Never force a number that has no basis in the user's own context — a vivid, specific descriptive bullet is always better than a fabricated metric.
`;

export const _CV_CRITICAL_RULES_REMINDER = `
=== FINAL QUALITY CHECK — read this LAST, it overrides all earlier guidance ===
1. Summary: opens with job title + seniority/impact. ZERO "Seeking to", "Seeking for", "Looking to", "Looking for", "Aiming to", "Aiming for", "Hoping to", "Eager to join", "Excited to contribute", "In search of", "I am looking". The summary states what the candidate DELIVERS — not what they WANT. MINIMUM 60 words, 3–4 sentences.
2. Summary: NO generic buzzwords — "highly motivated", "results-driven", "results-oriented", "passionate about", "detail-oriented", "team player", "hard-working", "self-starter", "go-getter". Replace with a concrete fact or achievement.
3. Summary: NEVER paraphrase the job description — describe what the CANDIDATE has actually done, using their own experience and real achievements.
4. Bullets: MINIMUM 8 words per bullet — "Reviewed project documentation" is too short, expand with context and scope.
5. Bullets: NO weak openers — "Responsible for", "Was responsible for", "Helped to", "Assisted with", "Worked on", "Tasked with", "Involved in", "Participated in", "Duties included". Replace with a direct action verb: "Led", "Built", "Delivered", "Managed", etc.
6. Bullet rhythm: MIX lengths — short punchy bullets (8–10 words) must ALTERNATE with fuller ones (15–22 words). Do NOT write 3+ consecutive short bullets.
7. Bullets: ZERO invented verbs — Greenfielded, Scaffolded (non-software), Materialized, Actioned, Ideated, Solutioned, Conceptualized, Operationalized.
8. Bullets: ZERO banned openers — Spearheaded, Orchestrated, Leveraged, Utilized, Facilitated, Empowered, Championed.
9. Bullets: ZERO first-person pronouns — no "I", "my", "we", "our" in any bullet. CV bullets are imperative statements.
10. Skills section: NO padded list of 20+ skills claiming expertise in everything. Cap at 12–15; only list skills the candidate can discuss in an interview.
11. Education: NEVER invent degree classifications, GPA, or thesis titles if not in the profile. Only state what is evidenced.
12. Date format: consistent throughout — either "Month YYYY" or "YYYY" — NEVER mixed formats in the same document.
13. Tense: current role bullets → present tense imperative ("Manage", "Build"); all past roles → past tense ("Managed", "Built").
14. Scope anchor: EVERY role's first bullet sets scope (team size, region, budget, clients, accounts) — NOT a task bullet.
15. Numbers: never use ~ (tilde) before a number. Write "roughly 50" not "~50". Never use lorem ipsum numbers.
16. Scope anchor: The FIRST bullet of EVERY role in the experience section must be a scope-setting statement — NOT a task or achievement. It must state at least one of: team size, number of direct reports, geographic coverage, client portfolio size, budget managed, or project count.
17. Summary source: The summary MUST be built EXCLUSIVELY from the candidate's ACTUAL work experience, education, and skills in their profile. NEVER copy phrases, sentence structures, role requirements, or objectives from the job description into the summary.
18. Grammar: Fix broken grammar only — correct subject-verb agreement, repair dangling modifiers, fix sentence fragments, and keep verb tense consistent per role.
19. Example data: All numbers, percentages, currency amounts, county/region names, and specific phrases that appear in the rules and examples above are PLACEHOLDER TEMPLATES. NEVER copy any such value from a rule example into the CV output.
=== END FINAL CHECK ===
`;

export const _CV_DATA_SCHEMA = `
RETURN FORMAT — output ONLY a raw JSON object (no markdown, no code fences) matching this schema:
{
  "summary": "string",
  "skills": ["string"],
  "experience": [
    {
      "company": "string",
      "jobTitle": "string",
      "dates": "string (e.g. Jan 2020 – Present)",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or Present",
      "responsibilities": ["string"]
    }
  ],
  "education": [
    { "degree": "string", "school": "string", "startYear": "string (enrolment year e.g. 2019)", "year": "string (graduation year e.g. 2022 — use Present or Expected YYYY if ongoing)", "description": "string" }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "bullets": ["string"],
      "link": "string",
      "dates": "string",
      "endDate": "string"
    }
  ],
  "languages": [
    { "name": "string", "proficiency": "string" }
  ]
}
`;

export const _CV_HUMANIZATION_RULES = `
ANTI-DETECTION RULES (binding — never skip, even on regenerate/optimize/improve):

- VOICE (this is the target — read carefully):
    Write as if a confident, slightly understated senior professional is describing their own work to a peer they respect. Direct, specific, a little dry. Quietly proud, never boastful. Sounds like a person, not a press release or a LinkedIn post. The reader should feel: "this person actually did the work and knows what they're talking about."
    DO: vary sentence length deliberately (mix 5–8 word punchy lines with 15–25 word elaborative ones); allow one slightly informal phrase per section; use first-person and contractions ("I've", "didn't", "wasn't") in the summary; let one honest opinion show through (e.g. "actually secure, not just compliant on paper").
    DON'T: write every sentence in perfect formal grammar; repeat the same sentence shape three times in a row; sound like a legal document, marketing copy, or recruiter template.

- BANNED BUZZWORDS / FILLER (zero tolerance — strip every instance, replace with a concrete fact):
    Generic self-praise: "highly motivated", "results-driven", "results-oriented", "detail-oriented", "self-starter", "go-getter", "team player", "dynamic", "dynamic team player", "proactive", "hard-working", "hardworking", "passionate", "passionate about", "excited to", "eager to".
    Empty action phrases: "leveraging expertise", "leveraging expertise to deliver value", "drive meaningful change", "drive meaningful change through innovative technology", "make a real impact", "make a difference", "move the needle", "take it to the next level", "at the end of the day", "in today's fast-paced world", "thought leader", "passion for participating in brainstorming sessions".
    AI-tells (recruiter surveys 2025 flag these as the top giveaways): "delve", "utilize" (use "use"), "leverage" (max once in the whole document), "synergy", "synergistic", "robust", "seamless", "seamlessly", "cutting-edge", "state-of-the-art", "groundbreaking", "transformative", "impactful" (show impact with a number instead), "innovative" (show innovation with a fact), "best-in-class", "holistic", "navigate", "landscape", "it's worth noting", "multifaceted", "unwavering commitment", "strategic visionary", "thought leader", "at the intersection of", "empower" (used vaguely), "proven track record".
    Bullet openers to avoid (the 2025 AI-CV signature — recruiters now flag these on sight): "Spearheaded", "Orchestrated", "Leveraged", "Utilized", "Facilitated", "Empowered", "Championed", "Responsible for", "Tasked with", "Helped with" — use varied real-work verbs instead (Built, Wrote, Fixed, Shipped, Cut, Reduced, Designed, Led, Debugged, Migrated, Rebuilt, Negotiated, Owned, Rolled out, Killed, Saved, Bought, Sold, Hired, Trained).

- METRIC HONESTY (recruiter trust signal — stacked AI metrics are now a known tell):
    Never write a chained-causal metric like "improved efficiency by 20%, resulting in a 30% increase in sales" — that pattern is the #1 signal of a fabricated AI bullet because the chain can't be verified.
    A single specific number tied to one action is far more credible than two numbers stitched together.
    If a number is estimated, use plain approximation words: "saved roughly [N] hours/week", "cut [TYPE] time by roughly [N]%". Never use the tilde character (~) before a number — write "roughly 50" not "~50".

- SKILL HONESTY: never claim "expert" in 5+ areas; a real candidate is expert in 1–2 things, proficient in a handful, learning others. If listing skills with proficiency, distribute them realistically.
- METRICS: only 50–60% of bullets carry a number; leave 1–2 bullets per role purely qualitative; use oddly specific numbers sometimes; vary metric type (time, cost, users, errors, satisfaction) — not always %. Never use the ~ character before numbers.
- KEYWORDS: target 65–75% JD match, NOT 90–100%; rephrase JD wording instead of mirroring it verbatim; no keyword used >3 times in the whole CV; skip soft-skill keywords.
- BULLETS: vary opening verbs (Built, Wrote, Fixed, Shipped, Cut, Helped, Led, Debugged…); never start two bullets in one role with the same verb; mix formats: action+result, action+context, pure statement. The EXACT bullet count per role is set by the user — never add or remove bullets from the count given in the prompt. Every bullet MUST end with a full stop (period ".").
- SUMMARY: 2–3 sentences, specific to THIS person, mention one niche/unexpected angle, end forward-looking; never list every tech; never repeat content already in the experience section.
- SKILLS: 10–15, grouped meaningfully; only list what they could be interviewed on; one "currently learning" item is fine.
- GRAMMAR: ~90% perfect, not 100% — contractions OK ("didn't", "wasn't"); a recruiter reading aloud must not sound like a robot.

RECRUITER SIGNALS (what HR actively looks for in the 6-second scan — eye-tracking research 2025):
- 80% of recruiter scan time lands on five things: name, current job title + company, previous job title + company, dates, and education.
- Include the exact JD job title verbatim somewhere near the top (summary opening line is ideal).
- Career progression must be readable in 6 seconds — scope, title seniority, or team size should visibly grow from oldest role to current role.
- Each role should have a one-line "scope anchor" before the achievement bullets.
- Spell out acronyms once: "Enterprise Resource Planning (ERP)" — recruiters search either form.
- Skills section sits immediately after the summary (2025 skills-based hiring shift), NOT at the bottom.
- Never list 10+ "expert-level" skills — recruiters flag this as instantly fake.
- Dates: consistent format throughout. Inconsistent date formatting is a parsing red flag for ATS and a sloppiness signal for humans.
`;

export const _CV_HUMANIZATION_CHECKLIST = `
PRE-RETURN CHECKLIST (run silently before returning JSON; rewrite anything that fails — a recruiter must not sense AI):
1. Summary opens with a concrete, person-specific line — not "Highly motivated…", not "Results-driven…", not "Passionate…".
2. The exact JD job title appears once near the top (summary or first role).
3. No phrase is repeated 3+ times anywhere in the document.
4. 40–50% of bullets are PURELY qualitative (no number) — fix any role where every bullet has a metric.
5. At least one metric is oddly specific (e.g. "roughly 6h/week", "about 38%") — not all round 25/30/40/50%. Never prefix numbers with ~ (tilde).
6. Zero chained-causal metrics (no "did X by Y%, leading to Z%" patterns) — those read as fabricated.
7. No sentence appears word-for-word from the JD; estimated keyword overlap sits in the 65–75% range, not higher.
8. ZERO instances of: "Spearheaded", "Orchestrated", "Leveraged", "Utilized", "Facilitated", "Empowered" as bullet openers anywhere in the document.
9. ZERO instances of any banned buzzword from the rules above.
10. Sentence lengths visibly vary within every section — no three sentences in a row of similar length.
11. Skills section has no more than 1–2 items that could be called "expert level".
12. Career progression (title, scope, or team size) is visibly bigger in the current role than in the oldest role.
13. Read the summary out loud in your head — does it sound like a person, or a LinkedIn template? If template, rewrite.
`;

export const _CV_SYSTEM_PROFESSIONAL = `
You are the world's foremost CV strategist — a fusion of elite executive recruiter, Fortune 500 hiring manager, and award-winning resume writer with 25+ years of experience. You understand how ATS systems score resumes and how recruiters make shortlist decisions in 6–10 seconds.

FOUNDATIONAL RULES (structural — apply to every CV you produce):

  RULE 1 — BULLET FORMULA:
    WITH metrics → XYZ: "Accomplished [X] as measured by [Y metric] by doing [Z]."
      Example: "Grew client base by [N]% over [N] months by redesigning field visit cadence." ← use REAL numbers from profile
    WITHOUT metrics → CAR: "[Challenge/Context] → [Action taken] → [Result produced]."
      Example: "No standardised data process across [N] sites — designed unified template that cut errors and disputes." ← use REAL numbers from profile
    NEVER use STAR format — it is for interviews, not CVs.

  RULE 2 — QUANTIFICATION MATRIX (attempt all 4 dimensions per role, use only what is honest):
    MAGNITUDE: by how much? (%, factor, before/after)
    SCALE: how big? (team, clients, projects, regions, users)
    SPEED: how fast? (time saved, turnaround, SLA)
    VALUE: what was it worth? (revenue, cost, budget, contract)
    When a dimension is genuinely unknown — use scope language, never invent a number.

  RULE 3 — CAREER ARC (growth must be visible top-to-bottom):
    Scope, responsibility, and metric scale must visibly increase across roles.
    Current role must carry the largest numbers and broadest scope.
    Promotions within the same company must be made explicit.

Output ONLY valid JSON matching the requested schema. NEVER include markdown, code fences, or prose outside the schema.
`;

export const _CV_SYSTEM_HUMANIZER = `
You are a senior editor at a top career consultancy. Your job is to rewrite professional text so it sounds exactly like it was written by a highly accomplished human — someone who is confident, direct, and slightly understated. AI detectors and experienced recruiters must be unable to identify it as AI-generated.

Critical rules:
- SENTENCE RHYTHM: Deliberately alternate between short punchy statements (5–8 words) and longer elaborative ones (15–25 words). Three sentences of similar length in a row is a failure.
- OPENING VARIETY: No two sentences in the same section may start with the same word or grammatical structure.
- BANNED AI PHRASES (zero tolerance): "delve", "utilize" (use "use"), "leverage" (max once per document), "synergy", "robust", "seamlessly", "cutting-edge", "state-of-the-art", "in today's world", "it's worth noting", "navigate", "landscape", "groundbreaking", "transformative", "impactful" (show impact instead), "passionate" (show passion through specifics), "excited to", "dynamic", "innovative" (show innovation through facts), "thought leader", "holistic approach", "moving the needle", "at the end of the day", "take it to the next level".
- SPECIFICITY RULE: Replace every vague phrase with a concrete fact. Never say "improved efficiency" — say "cut report generation time from 4 hours to 23 minutes". Never say "led a team" — say "managed a 7-person cross-functional team".
- For CVs specifically: every bullet must feel LIVED, not templated. It should sound like the person is telling you about their proudest moment, not reading a job description.
- ACTION VERB FRESHNESS: Never repeat an action verb in the same job's bullet list. Across the whole document, use each verb no more than twice.
- NUMBERS RULE: Keep all numbers, dates, company names, job titles, and achievements EXACTLY as provided — never change factual details.
- Return ONLY the rewritten text. No preamble, no commentary, no "Here is the rewritten version:".
`;

export const _CV_SYSTEM_PARSER = `
You are an expert data parser. Convert unstructured text into accurate JSON.
Standardize dates to consistent formats. Preserve names, companies, and titles exactly.
Never invent data unless explicitly instructed.
When returning JSON, output ONLY the raw JSON object — no markdown fences, no commentary, no trailing text.
`;

export const _CV_SYSTEM_VALIDATOR = 'You are a strict CV quality validator. Return only valid JSON.';
export const _CV_SYSTEM_AUDIT = 'You are a strict CV editor. Fix only the listed problems. Return only valid JSON with keys: summary and experience.';

// ─── Substitution rules (AI-isms & corporate fluff) ──────────────────────────
const _SUBS: Array<[RegExp, string]> = [
    [/^Manages\b/,        'Manage'],
    [/^Leads\b/,          'Lead'],
    [/^Builds\b/,         'Build'],
    [/^Conducts\b/,       'Conduct'],
    [/^Troubleshoots\b/,  'Troubleshoot'],
    [/^Generates\b/,      'Generate'],
    [/^Prepares\b/,       'Prepare'],
    [/^Designs\b/,        'Design'],
    [/^Oversees\b/,       'Oversee'],
    [/^Coordinates\b/,    'Coordinate'],
    [/^Supports\b/,       'Support'],
    [/^Maintains\b/,      'Maintain'],
    [/^Develops\b/,       'Develop'],
    [/^Implements\b/,     'Implement'],
    [/^Monitors\b/,       'Monitor'],
    [/^Reviews\b/,        'Review'],
    [/^Reports\b/,        'Report'],
    [/^Ensures\b/,        'Ensure'],
    [/^Provides\b/,       'Provide'],
    [/^Handles\b/,        'Handle'],
    [/^Engineers\b/,      'Engineer'],
    [/^Delivers\b/,       'Deliver'],
    [/^Drives\b/,         'Drive'],
    [/^Creates\b/,        'Create'],
    [/^Operates\b/,       'Operate'],
    [/^Works\b/,          'Work'],
    [/^Analyzes\b/,       'Analyze'],
    [/^Analyses\b/,       'Analyse'],
    [/^Plans\b/,          'Plan'],
    [/^Executes\b/,       'Execute'],
    [/^Performs\b/,       'Perform'],
    [/^Serves\b/,         'Serve'],
    [/^Assists\b/,        'Assist'],
    [/^Drafts\b/,         'Draft'],
    [/^Produces\b/,       'Produce'],
    [/^Processes\b/,      'Process'],
    [/^Tracks\b/,         'Track'],
    [/^Trains\b/,         'Train'],
    [/\bof\s*[–—]\s+(?=[a-zA-Z])/g,  'of '],
    [/\bfor\s*[–—]\s+(?=[a-zA-Z])/g, 'for '],
    [/\s*[–—]\s*$/,                   ''],
    [/\bhands-\s*on\b/gi,                  'hands-on'],
    [/\bhands-\s*with\b/gi,               'hands-on experience with'],
    [/\bhands-\s*in\b/gi,                 'hands-on experience in'],
    [/\bhands-\s*across\b/gi,             'hands-on experience across'],
    [/\bhands-\s*(?!on\b)(?=[a-zA-Z])/gi, 'hands-on '],
    [/,\s*and\s*$/,                   ''],
    [/\s+and\s*$/,                    ''],
    [/,\s*$/,                         ''],
    [/\bleveraging\b/gi,                 'using'],
    [/\bleveraged\b/gi,                  'used'],
    [/\bleverage\b/gi,                   'use'],
    [/\bspearheaded\b/gi,                'led'],
    [/\bspearhead\b/gi,                  'lead'],
    [/\butilized\b/gi,                   'used'],
    [/\butilised\b/gi,                   'used'],
    [/\butilize\b/gi,                    'use'],
    [/\butilise\b/gi,                    'use'],
    [/\bfacilitated\b/gi,                'enabled'],
    [/\bfacilitate\b/gi,                 'enable'],
    [/\bsynergy\b/gi,                    'collaboration'],
    [/\bsynergies\b/gi,                  'collaboration'],
    [/\binnovative solutions?\b/gi,      'practical solutions'],
    [/\bbest practices?\b/gi,            'proven methods'],
    [/\bknowledge sharing\b/gi,          'documentation'],
    [/\bstaying up[- ]to[- ]date\b/gi,   'keeping current'],
    [/\bdrive meaningful change\b/gi,    'improve outcomes'],
    [/\bpassion for\b/gi,                'focus on'],
    [/\bresults[- ]driven\b/gi,          'delivery-focused'],
    [/\bdetail[- ]oriented\b/gi,         'thorough'],
    [/\bgo[- ]getter\b/gi,               'self-starter'],
    [/\bgreenfielded\b/gi,               'built'],
    [/\bgreenfiel(?:ding|s)\b/gi,        'building'],
    [/\bscaffolded\b/gi,                 'established'],
    [/\bscaffolding\b/gi,                'establishing'],
    [/\bmaterialized\b/gi,               'developed'],
    [/\bmaterialize[sd]?\b/gi,           'develop'],
    [/\bactioned\b/gi,                   'completed'],
    [/\bactioning\b/gi,                  'completing'],
    [/\bideated\b/gi,                    'developed'],
    [/\bideating\b/gi,                   'developing'],
    [/\bsolutioned\b/gi,                 'resolved'],
    [/\bsolutioning\b/gi,                'resolving'],
    // (hands-on catch-all patterns now cover all cases above — no separate "in" needed)
    [/\bDeployed troubleshooting\b/gi,                                'Performed troubleshooting and maintenance on'],
    [/\bDeployed\s+(analysis|review|audit|research)\b/gi,            'Conducted $1'],
    [/^Eager to\b/gim,                                               ''],
    [/^Looking to\b/gim,                                             ''],
    [/^Aiming to\b/gim,                                              ''],
    [/^Hoping to\b/gim,                                              ''],
    [/[,\s]+(?:and\s+)?eager\s+to\s+(?:apply|learn|contribute|join|grow|develop|bring|use|leverage|gain|expand|leverage|utilise|utilize)\b[^.;]*/gi, ''],
    [/\bseeking to (?:use|apply|leverage|bring|contribute|join|gain|grow|develop|expand|utilise|utilize)\b/gi, ''],
    [/\baiming to (?:use|apply|leverage|bring|contribute|join|gain|grow|develop|expand)\b/gi, ''],
    [/\blooking to (?:use|apply|leverage|bring|contribute|join|gain|grow|develop|expand)\b/gi, ''],
    [/\bto drive business growth\b/gi,                               ''],
    [/\bfostering teamwork\b/gi,                                     ''],
    [/\bdemonstrating strong analytical skills\b/gi,                 ''],
    [/\battention to detail\b/gi,                                    ''],
    [/\bproblem-solving abilities\b/gi,                              ''],
    [/\bto drive project efficiency\b/gi,                            ''],
    [/\bfostering a collaborative\b/gi,                              ''],
    [/\bfostering collaboration\b/gi,                                ''],
    [/\binitiative delivery\b/gi,        'project delivery'],
    [/\btimely initiative\b/gi,          'timely project'],
    [/\bensure(?:s|d)? timely delivery\b/gi, 'deliver on time'],
    [/\bensure(?:s|d)? timely\b/gi,      'deliver on time for'],
    [/\bteam player\b/gi,                'collaborator'],
    [/\bdynamic\s+/gi,                   ''],
    [/\bend[- ]to[- ]end\s+/gi,          ''],
    [/,\s*ensuring\s+[^.;:!?]+/gi,       ''],
    [/,\s*and\s+(?:incorporating|supporting|utilizing|utilising|applying|implementing|integrating|leveraging|using)\s+[^.;:!?]+/gi, ''],
];

// ── Governance / buzzword substitutions ──────────────────────────────────────
const _GOV: Array<[RegExp, string]> = [
    [/\bproactively\s+/gi,                                  ''],
    [/\bseamlessly\s+/gi,                                   ''],
    [/\brobustly\s+/gi,                                     ''],
    [/\bholistically\s+/gi,                                 ''],
    [/\bstrategically\s+/gi,                                ''],
    [/\bcutting[- ]edge\s+/gi,                              ''],
    [/\bdata[- ]driven\s+/gi,                               ''],
    [/\bworld[- ]class\s+/gi,                               ''],
    [/\bstate[- ]of[- ]the[- ]art\s+/gi,                    ''],
    [/\bvalue[- ]added\s+/gi,                               ''],
    [/\bscalable\s+(?=solution|framework|infrastructure|pipeline|model|platform|approach)/gi, ''],
    [/\brobust\s+(?=solution|framework|pipeline|system|architecture|approach|model)/gi,       ''],
    [/\bbest[- ]in[- ]class\b/gi,                          'top-performing'],
    [/\bhigh[- ]impact\b/gi,                               'impactful'],
    [/\bground[- ]breaking\b/gi,                           'novel'],
    [/\bholistic\b/gi,                                     'comprehensive'],
    [/\bproactive\b/gi,                                    'forward-thinking'],
    [/\bseamless\b/gi,                                     'smooth'],
    [/\bgame[- ]changing\b/gi,                             'impactful'],
    [/\bgame[- ]changer\b/gi,                              'improvement'],
    [/\btransformative\b/gi,                               'significant'],
    [/\bdisruptive\s+(?=technology|approach|solution|innovation)/gi, 'new '],
    [/\bpivotal\b/gi,                                      'critical'],
    [/\bactionable\s+insights?\b/gi,                       'findings'],
    [/\bactionable\b/gi,                                   'practical'],
    [/\bthought\s+leadership\b/gi,                         'domain expertise'],
    [/\bthought\s+leaders?\b/gi,                           'domain expert'],
    [/\bat\s+the\s+forefront\s+of\b/gi,                    'leading in'],
    [/\bin\s+a\s+timely\s+manner\b/gi,                     'on time'],
    [/\bstakeholder\s+engagement\b/gi,                     'stakeholder communication'],
    [/\bcross[- ]functional\s+collaboration\b/gi,          'cross-team collaboration'],
    [/\bkey\s+stakeholders?\b/gi,                          'stakeholders'],
    [/\bsignificant\s+impact\b/gi,                         'measurable results'],
    [/\bpositive\s+impact\b/gi,                            'measurable results'],
    [/\bdriving\s+(?:business\s+)?(?:value|outcomes?|impact)\b/gi, 'delivering results'],
    [/\bharnessed?\b/gi,                                   'used'],
    [/\bharnessing\b/gi,                                   'using'],
    [/\bempower(?:ed)?\b/gi,                               'enabled'],
    [/\bempowering\b/gi,                                   'enabling'],
    [/\bempowers\b/gi,                                     'enables'],
    [/\bfoster(?:ed)?\s+(?:a\s+)?(?:culture|environment)\s+of\b/gi, 'built a culture of'],
    [/\bpivot(?:ed)?\s+to\b/gi,                            'switched to'],
    [/\bpivoting\s+to\b/gi,                                'switching to'],
    [/\bdriving\s+alignment\b/gi,                          'aligning teams'],
    [/\bsolving\s+complex\s+problems?\b/gi,                'resolving technical challenges'],
    [/[,\s]*moving\s+forward[.,]?\s*/gi,                   ''],
    [/[,\s]*going\s+forward[.,]?\s*/gi,                    ''],
];

// ── Verb tense map (present 3rd-person ↔ past) ────────────────────────────────
const _TENSE: Array<{ present: string; past: string }> = [
    { present: 'Manages',       past: 'Managed' },
    { present: 'Develops',      past: 'Developed' },
    { present: 'Designs',       past: 'Designed' },
    { present: 'Delivers',      past: 'Delivered' },
    { present: 'Maintains',     past: 'Maintained' },
    { present: 'Coordinates',   past: 'Coordinated' },
    { present: 'Supports',      past: 'Supported' },
    { present: 'Launches',      past: 'Launched' },
    { present: 'Implements',    past: 'Implemented' },
    { present: 'Owns',          past: 'Owned' },
    { present: 'Creates',       past: 'Created' },
    { present: 'Drives',        past: 'Drove' },
    { present: 'Improves',      past: 'Improved' },
    { present: 'Optimises',     past: 'Optimised' },
    { present: 'Optimizes',     past: 'Optimized' },
    { present: 'Mentors',       past: 'Mentored' },
    { present: 'Trains',        past: 'Trained' },
    { present: 'Negotiates',    past: 'Negotiated' },
    { present: 'Oversees',      past: 'Oversaw' },
    { present: 'Reports',       past: 'Reported' },
    { present: 'Prepares',      past: 'Prepared' },
    { present: 'Reviews',       past: 'Reviewed' },
    { present: 'Analyses',      past: 'Analysed' },
    { present: 'Analyzes',      past: 'Analyzed' },
    { present: 'Collaborates',  past: 'Collaborated' },
    { present: 'Achieves',      past: 'Achieved' },
    { present: 'Increases',     past: 'Increased' },
    { present: 'Reduces',       past: 'Reduced' },
    { present: 'Grows',         past: 'Grew' },
    { present: 'Cuts',          past: 'Cut' },
    { present: 'Builds',        past: 'Built' },
    { present: 'Leads',         past: 'Led' },
    { present: 'Runs',          past: 'Ran' },
    { present: 'Ships',         past: 'Shipped' },
    { present: 'Plans',         past: 'Planned' },
    { present: 'Executes',      past: 'Executed' },
    { present: 'Drafts',        past: 'Drafted' },
    { present: 'Researches',    past: 'Researched' },
    { present: 'Tests',         past: 'Tested' },
    { present: 'Documents',     past: 'Documented' },
    { present: 'Presents',      past: 'Presented' },
    { present: 'Streamlines',   past: 'Streamlined' },
    { present: 'Saves',         past: 'Saved' },
    { present: 'Generates',     past: 'Generated' },
    { present: 'Tracks',        past: 'Tracked' },
    { present: 'Monitors',      past: 'Monitored' },
    { present: 'Identifies',    past: 'Identified' },
    { present: 'Resolves',      past: 'Resolved' },
    { present: 'Handles',       past: 'Handled' },
    { present: 'Processes',     past: 'Processed' },
    { present: 'Audits',        past: 'Audited' },
    { present: 'Establishes',   past: 'Established' },
    { present: 'Spearheads',    past: 'Spearheaded' },
    { present: 'Leverages',     past: 'Leveraged' },
    { present: 'Architects',    past: 'Architected' },
    { present: 'Refactors',     past: 'Refactored' },
    { present: 'Migrates',      past: 'Migrated' },
    { present: 'Automates',     past: 'Automated' },
    { present: 'Authors',       past: 'Authored' },
    { present: 'Publishes',     past: 'Published' },
    { present: 'Conducts',      past: 'Conducted' },
    { present: 'Performs',      past: 'Performed' },
    { present: 'Calculates',    past: 'Calculated' },
    { present: 'Compiles',      past: 'Compiled' },
    { present: 'Communicates',  past: 'Communicated' },
    { present: 'Configures',    past: 'Configured' },
    { present: 'Deploys',       past: 'Deployed' },
    { present: 'Engineers',     past: 'Engineered' },
    { present: 'Facilitates',   past: 'Facilitated' },
    { present: 'Forecasts',     past: 'Forecast' },
    { present: 'Initiates',     past: 'Initiated' },
    { present: 'Integrates',    past: 'Integrated' },
    { present: 'Investigates',  past: 'Investigated' },
    { present: 'Orchestrates',  past: 'Orchestrated' },
    { present: 'Partners',      past: 'Partnered' },
    { present: 'Pilots',        past: 'Piloted' },
    { present: 'Produces',      past: 'Produced' },
    { present: 'Programs',      past: 'Programmed' },
    { present: 'Promotes',      past: 'Promoted' },
    { present: 'Recommends',    past: 'Recommended' },
    { present: 'Scales',        past: 'Scaled' },
    { present: 'Schedules',     past: 'Scheduled' },
    { present: 'Secures',       past: 'Secured' },
    { present: 'Solves',        past: 'Solved' },
    { present: 'Standardises',  past: 'Standardised' },
    { present: 'Standardizes',  past: 'Standardized' },
    { present: 'Supervises',    past: 'Supervised' },
    { present: 'Translates',    past: 'Translated' },
    { present: 'Updates',       past: 'Updated' },
    { present: 'Validates',     past: 'Validated' },
    { present: 'Writes',        past: 'Wrote' },
    { present: 'Speaks',        past: 'Spoke' },
    { present: 'Teaches',       past: 'Taught' },
    { present: 'Brings',        past: 'Brought' },
    { present: 'Sells',         past: 'Sold' },
    { present: 'Serves',        past: 'Served' },
    { present: 'Sets',          past: 'Set' },
    { present: 'Holds',         past: 'Held' },
    { present: 'Wins',          past: 'Won' },
    { present: 'Sees',          past: 'Saw' },
    { present: 'Makes',         past: 'Made' },
    { present: 'Takes',         past: 'Took' },
    { present: 'Gives',         past: 'Gave' },
    { present: 'Hires',         past: 'Hired' },
    { present: 'Fires',         past: 'Fired' },
    { present: 'Closes',        past: 'Closed' },
    { present: 'Opens',         past: 'Opened' },
];

// ── TPS → base imperative map ─────────────────────────────────────────────────
const _TPS: Record<string, string> = {
    generates: 'Generate', delivers: 'Deliver', maintains: 'Maintain',
    improves: 'Improve', reduces: 'Reduce', coordinates: 'Coordinate',
    leads: 'Lead', drives: 'Drive', manages: 'Manage', builds: 'Build',
    designs: 'Design', develops: 'Develop', implements: 'Implement',
    provides: 'Provide', supports: 'Support', creates: 'Create',
    optimizes: 'Optimize', optimises: 'Optimise', analyzes: 'Analyze',
    analyses: 'Analyse', collaborates: 'Collaborate', trains: 'Train',
    conducts: 'Conduct', oversees: 'Oversee', streamlines: 'Streamline',
    executes: 'Execute', launches: 'Launch', handles: 'Handle',
    monitors: 'Monitor', evaluates: 'Evaluate', performs: 'Perform',
    presents: 'Present', writes: 'Write', edits: 'Edit', tests: 'Test',
    deploys: 'Deploy', resolves: 'Resolve', mentors: 'Mentor',
    advises: 'Advise', achieves: 'Achieve', reviews: 'Review',
    tracks: 'Track', reports: 'Report', identifies: 'Identify',
    communicates: 'Communicate', assists: 'Assist', facilitates: 'Facilitate',
    negotiates: 'Negotiate', forecasts: 'Forecast', plans: 'Plan',
    organizes: 'Organize', organises: 'Organise', spearheads: 'Spearhead',
    champions: 'Champion', architects: 'Architect', automates: 'Automate',
    prepares: 'Prepare', engineers: 'Engineer', supervises: 'Supervise',
    operates: 'Operate', delegates: 'Delegate', acquires: 'Acquire',
    schedules: 'Schedule', mitigates: 'Mitigate', sources: 'Source',
    compiles: 'Compile', calculates: 'Calculate', configures: 'Configure',
    integrates: 'Integrate', translates: 'Translate', validates: 'Validate',
    audits: 'Audit', authors: 'Author', secures: 'Secure', scales: 'Scale',
    pilots: 'Pilot', standardizes: 'Standardize', standardises: 'Standardise',
    initiates: 'Initiate', formulates: 'Formulate',
    owns: 'Own', grows: 'Grow',
    refactors: 'Refactor', migrates: 'Migrate', publishes: 'Publish',
    recommends: 'Recommend', serves: 'Serve', ensures: 'Ensure',
    documents: 'Document', promotes: 'Promote', programs: 'Program',
    investigates: 'Investigate', orchestrates: 'Orchestrate', partners: 'Partner',
    produces: 'Produce', processes: 'Process', drafts: 'Draft',
    researches: 'Research', quantifies: 'Quantify', establishes: 'Establish',
};

// ── Pure helper functions ─────────────────────────────────────────────────────

function _removeDupWords(input: string): string {
    if (!input) return input || '';
    let out = input;
    let prev: string;
    do {
        prev = out;
        out = out.replace(/\b(\w+)\s+\1\b/gi, '$1');
        out = out.replace(/\b(\w+)\s+(?:and|or|&|,)\s+\1\b/gi, '$1');
    } while (out !== prev);
    return out;
}

function _applySubstitutions(text: string, rules: Array<[RegExp, string]>): { text: string; count: number } {
    if (!text) return { text: text || '', count: 0 };
    let out = text;
    let count = 0;
    for (const [pattern, replacement] of rules) {
        const before = out;
        out = out.replace(pattern, replacement);
        if (out !== before) count++;
    }
    out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1');
    const before2 = out;
    out = _removeDupWords(out);
    if (out !== before2) count++;
    return { text: out, count };
}

function _stripFirstPerson(text: string): string {
    if (!text) return '';
    let out = text;
    out = out.replace(
        /(^|[.!?]\s+|—\s+)I(?:'ve| have|'m| am)\s+(\w+)/g,
        (_m: string, lead: string, verb: string) => `${lead}${verb.charAt(0).toUpperCase()}${verb.slice(1)}`,
    );
    out = out.replace(/\bI(?:'ve| have|'m| am)\s+/g, '');
    out = out.replace(/\bI\s+/g, '');
    out = out.replace(/\bmy own\s+/gi, '');
    out = out.replace(/\bmy\s+/gi, 'the ');
    out = out.replace(/(^|[.!?]\s+|—\s+)(?:we|our|us)\s+(\w+)/gi,
        (_m: string, lead: string, verb: string) => `${lead}${verb.charAt(0).toUpperCase()}${verb.slice(1)}`,
    );
    out = out.replace(/\b(?:we|our|us)\s+/gi, '');
    out = out.replace(/\s{2,}/g, ' ').trim();
    if (out.length > 0) out = out.charAt(0).toUpperCase() + out.slice(1);
    return out;
}

function _normTPS(bullet: string): string {
    if (!bullet) return bullet;
    const m = bullet.match(/^(\s*[•\-*·»"']?\s*)(\w+)(\b)/);
    if (!m) return bullet;
    const [, leading, first] = m;
    const lower = first.toLowerCase();
    if (!_TPS[lower]) return bullet;
    const base = _TPS[lower];
    return leading + base + bullet.slice(leading.length + first.length);
}

function _matchCase(original: string, replacement: string): string {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1).toLowerCase();
    return replacement.toLowerCase();
}

function _bareInfinitive(form: string): string | null {
    const lower = form.toLowerCase();
    if (lower.endsWith('ies') && lower.length > 3) return lower.slice(0, -3) + 'y';
    if (/(ches|shes|sses|xes|zes|oes)$/.test(lower)) return lower.slice(0, -2);
    if (lower.endsWith('s') && !lower.endsWith('ss')) return lower.slice(0, -1);
    return null;
}

function _isPresent(word: string, pair: { present: string }): boolean {
    const lower = word.toLowerCase();
    if (lower === pair.present.toLowerCase()) return true;
    const bare = _bareInfinitive(pair.present);
    return bare !== null && lower === bare;
}

function _flipLead(bullet: string, target: 'present' | 'past'): { text: string; changed: boolean } {
    if (!bullet) return { text: bullet || '', changed: false };
    const m = bullet.match(/^(\s*[-•·*»"']?\s*)([A-Za-z]+)(\b)/);
    if (!m) return { text: bullet, changed: false };
    const [, prefix, firstWord, boundary] = m;
    const lower = firstWord.toLowerCase();
    for (const pair of _TENSE) {
        const presLower = pair.present.toLowerCase();
        const pastLower = pair.past.toLowerCase();
        if (target === 'present' && lower === pastLower && lower !== presLower) {
            return { text: prefix + _matchCase(firstWord, pair.present) + boundary + bullet.slice(m[0].length), changed: true };
        }
        if (target === 'past' && _isPresent(firstWord, pair) && lower !== pastLower) {
            return { text: prefix + _matchCase(firstWord, pair.past) + boundary + bullet.slice(m[0].length), changed: true };
        }
    }
    return { text: bullet, changed: false };
}

function _leadInTarget(bullet: string, target: 'present' | 'past'): boolean {
    const m = bullet.match(/^(\s*[-•·*»"']?\s*)([A-Za-z]+)(\b)/);
    if (!m) return false;
    const word = m[2].toLowerCase();
    for (const pair of _TENSE) {
        if (target === 'present' && _isPresent(word, pair)) return true;
        if (target === 'past' && word === pair.past.toLowerCase()) return true;
    }
    return false;
}

function _flipMid(bullet: string, target: 'present' | 'past'): { text: string; changed: boolean } {
    if (!bullet) return { text: bullet || '', changed: false };
    let out = bullet;
    let changed = false;
    for (const pair of _TENSE) {
        const wrong = (target === 'present' ? pair.past : pair.present).toLowerCase();
        const right = target === 'present' ? pair.present : pair.past;
        const re = new RegExp(`\\b(and|,)\\s+(${wrong})\\b`, 'gi');
        if (re.test(out)) {
            out = out.replace(re, (_m: string, conj: string, w: string) => `${conj} ${_matchCase(w, right)}`);
            changed = true;
        }
    }
    return { text: out, changed };
}

function _isCurrent(endDate?: string): boolean {
    const v = String(endDate ?? '').trim().toLowerCase();
    if (!v) return true;
    return /present|current|ongoing|now/.test(v);
}

function _purifyField(text: string): { text: string; subs: number } {
    if (!text || typeof text !== 'string') return { text: text || '', subs: 0 };
    let out = text;
    let subs = 0;
    for (const rules of [_SUBS, _GOV]) {
        const r = _applySubstitutions(out, rules);
        out = r.text;
        subs += r.count;
    }
    return { text: out, subs };
}

export async function handlePurifyCv(request: Request, env: Env): Promise<Response> {
    let body: { cv?: any };
    try { body = await request.json() as { cv?: any }; }
    catch { return json({ error: 'invalid_json' }, request, env, 400); }

    const cv = body?.cv;
    if (!cv || typeof cv !== 'object') return json({ error: 'missing_cv' }, request, env, 400);

    const changes: string[] = [];
    let totalSubs = 0;
    let tenseFlips = 0;

    const sub = (text: string): string => {
        const r = _purifyField(text);
        totalSubs += r.subs;
        return r.text;
    };

    let out = {
        ...cv,
        summary:    sub(cv.summary    || ''),
        skills:     (Array.isArray(cv.skills) ? cv.skills : []).map((s: string) => sub(String(s || ''))),
        experience: (Array.isArray(cv.experience) ? cv.experience : []).map((e: any) => ({
            ...e,
            responsibilities: (Array.isArray(e.responsibilities) ? e.responsibilities : [])
                .map((b: string) => sub(String(b || ''))),
        })),
        education: (Array.isArray(cv.education) ? cv.education : []).map((e: any) => ({
            ...e, description: sub(String(e.description || '')),
        })),
        projects: (Array.isArray(cv.projects) ? cv.projects : []).map((p: any) => ({
            ...p,
            description: sub(String(p.description || '')),
            bullets: (Array.isArray(p.bullets) ? p.bullets : []).map((b: string) => sub(String(b || ''))),
        })),
    };

    if (totalSubs > 0) changes.push(`substitutions: ${totalSubs} fix(es)`);

    out.summary = _stripFirstPerson(out.summary || '');
    out.experience = (out.experience || []).map((e: any) => ({
        ...e,
        responsibilities: (e.responsibilities || []).map((b: string) => _stripFirstPerson(b)),
    }));
    out.projects = (out.projects || []).map((p: any) => ({
        ...p,
        bullets: (p.bullets || []).map((b: string) => _stripFirstPerson(b)),
    }));

    out.experience = (out.experience || []).map((e: any) => {
        const current = _isCurrent(e.endDate);
        if (!current) return e;
        return {
            ...e,
            responsibilities: (e.responsibilities || []).map((b: string) => _normTPS(b)),
        };
    });

    out.experience = (out.experience || []).map((e: any) => {
        const target: 'present' | 'past' = _isCurrent(e.endDate) ? 'present' : 'past';
        const newBullets = (e.responsibilities || []).map((b: string) => {
            const lead = _flipLead(b, target);
            const midSafe = _leadInTarget(lead.text, target);
            const mid = midSafe ? _flipMid(lead.text, target) : { text: lead.text, changed: false };
            if (lead.changed || mid.changed) tenseFlips++;
            return mid.text;
        });
        return { ...e, responsibilities: newBullets };
    });

    // ── Project tense enforcement ────────────────────────────────────────────
    // Present tense if endDate is "Present"/blank, past tense if completed.
    out.projects = (out.projects || []).map((p: any) => {
        const target: 'present' | 'past' = _isCurrent(p.endDate) ? 'present' : 'past';
        return {
            ...p,
            bullets: (p.bullets || []).map((b: string) => {
                const lead = _flipLead(b, target);
                const mid = _flipMid(lead.text, target);
                if (lead.changed || mid.changed) tenseFlips++;
                return mid.text;
            }),
        };
    });

    if (tenseFlips > 0) changes.push(`tense_fixes: ${tenseFlips}`);

    // ── 1.2: Dynamic KV banned-phrase pass ────────────────────────────────────
    // Applies phrases auto-promoted by the leak-miner cron that are not yet in
    // the static _SUBS array, closing the self-improvement loop.
    try {
        const dynBanned = await getCachedBannedPhrases(env);
        let dynSubs = 0;
        for (const { phrase, replacement } of dynBanned) {
            if (!phrase || !replacement) continue;
            const re = new RegExp(`\\b${escapeRegex(String(phrase))}\\b`, 'gi');
            const before = out.summary;
            out.summary = out.summary.replace(re, replacement);
            if (out.summary !== before) dynSubs++;
            out.experience = out.experience.map((e: any) => ({
                ...e,
                responsibilities: (e.responsibilities || []).map((b: string) => b.replace(re, replacement)),
            }));
            out.projects = (out.projects || []).map((p: any) => ({
                ...p,
                description: String(p.description || '').replace(re, replacement),
                bullets: (p.bullets || []).map((b: string) => String(b || '').replace(re, replacement)),
            }));
        }
        if (dynSubs > 0) changes.push(`dynamic_banned: ${dynSubs} fix(es)`);
    } catch { /* KV unavailable — skip gracefully */ }

    // ── 1.1: Prefix-based dedup pass ─────────────────────────────────────────
    // Removes duplicate bullets in each experience role using the first-6-word
    // prefix as the key. Prevents duplicates for API/agent consumers where the
    // client-side Jaccard dedup has not run.
    let dedupCount = 0;
    out.experience = (out.experience || []).map((e: any) => {
        const seen = new Set<string>();
        const deduped = (e.responsibilities || []).filter((b: string) => {
            const key = b.trim().toLowerCase().split(/\s+/).slice(0, 6).join(' ');
            if (seen.has(key)) { dedupCount++; return false; }
            seen.add(key);
            return true;
        });
        return { ...e, responsibilities: deduped };
    });
    if (dedupCount > 0) changes.push(`deduped: ${dedupCount} duplicate bullet(s) removed`);

    // ── Project bullet dedup pass ──────────────────────────────────────────────
    let projDedupCount = 0;
    out.projects = (out.projects || []).map((p: any) => {
        const seen = new Set<string>();
        const deduped = (p.bullets || []).filter((b: string) => {
            const key = b.trim().toLowerCase().split(/\s+/).slice(0, 6).join(' ');
            if (seen.has(key)) { projDedupCount++; return false; }
            seen.add(key);
            return true;
        });
        return { ...p, bullets: deduped };
    });
    if (projDedupCount > 0) changes.push(`project_bullet_dedup: ${projDedupCount} duplicate(s) removed`);

    // ── Skill dedup pass ──────────────────────────────────────────────────────
    const normaliseSkill = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const seenSkills = new Set<string>();
    let skillDedupCount = 0;
    out.skills = (out.skills || []).filter((s: string) => {
        const key = normaliseSkill(s);
        if (seenSkills.has(key)) { skillDedupCount++; return false; }
        seenSkills.add(key);
        return true;
    });
    if (skillDedupCount > 0) changes.push(`skill_dedup: ${skillDedupCount} duplicate(s) removed`);

    // ── Final visible-text gate ───────────────────────────────────────────────
    // Runs after ALL cleaning passes. Scans every user-visible field and emits
    // structured findings. The gate NEVER blocks the response — it annotates it
    // so the client can decide how to react (surface a warning, trigger a repair,
    // or cache only if gate.passed === true).
    const gate = runFinalVisibleTextGate(out);

    return json({ cv: out, changes, gate }, request, env);
}

// ─── Final visible-text gate ──────────────────────────────────────────────────
//
// Checks every user-visible field in the assembled CV for issues that purify's
// regex passes could miss (e.g. phrases that need word-boundary context,
// cross-section patterns, structural problems).
//
// Severity levels:
//   critical — a human recruiter would immediately reject the CV
//   high     — strongly degrades quality / AI detectability
//   medium   — advisory; worth noting but not blocking
//
// Returns:
//   passed       — true only when zero critical + zero high issues found
//   quality_mode — 'full' | 'degraded'  (degraded = any critical issue present)
//   counts       — { critical, high, medium }
//   issues       — flat list of { field, location, issue, text, severity }

export interface GateIssue {
    field:    string;       // e.g. 'summary', 'experience[0].responsibilities[2]'
    issue:    string;       // machine-readable key
    text:     string;       // the offending snippet (≤120 chars)
    severity: 'critical' | 'high' | 'medium';
}

export interface GateResult {
    passed:       boolean;
    quality_mode: 'full' | 'degraded';
    counts:       { critical: number; high: number; medium: number };
    issues:       GateIssue[];
}

// ── Pattern tables ────────────────────────────────────────────────────────────

// Summary openers that mean "I want a job" instead of "I deliver value"
const GATE_SUMMARY_OPENERS = /^(seeking\s+(to|for|an?\s)|looking\s+(to|for|for\s+an?\s)|aiming\s+(to|for)|hoping\s+to|eager\s+to\s+(join|work|contribute|learn)|excited\s+to\s+(join|contribute)|in\s+search\s+of|i\s+am\s+(looking|seeking)|driven\s+by\s+a\s+passion)/i;

// Generic/padded skills that add zero ATS value and signal low-quality AI output.
// Only exact normalised matches — we do NOT substring-match to avoid false positives
// on real technologies (e.g. "communication protocols" must not flag).
const GATE_GENERIC_SKILLS = new Set([
    'communication', 'communication skills', 'good communication',
    'verbal communication', 'written communication', 'oral communication',
    'interpersonal skills', 'interpersonal communication',
    'team player', 'teamwork', 'team work',
    'ms office', 'microsoft office', 'microsoft word', 'microsoft excel',
    'microsoft powerpoint', 'microsoft outlook', 'ms word', 'ms excel',
    'ms powerpoint', 'ms outlook',
    'hard worker', 'hardworking', 'hard-working',
    'fast learner', 'quick learner',
    'self motivated', 'self-motivated', 'highly motivated',
    'attention to detail', 'detail oriented', 'detail-oriented',
    'willingness to learn', 'eager to learn',
    'time management', 'multitasking', 'multi-tasking',
    'organizational skills', 'organisational skills',
    'leadership skills',   // vague; leadership + context = fine; standalone = padding
    'problem solving',     // standalone; "problem-solving for distributed systems" = fine
    'problem-solving',
    'critical thinking',
    'adaptability',
    'flexibility',
    'work ethic',
    'positive attitude',
]);

// Certification placeholder patterns — model left a template stub instead of
// a real certification name.
const GATE_CERT_PLACEHOLDER = /(\[certification(\s+name)?\]|\[cert\b[^\]]*\]|certified\s+in\s+\[|certification\s+in\s+\[|\[year\]|\[20\d{2}\]|\[month\s+year\])/i;

// Bullet openers that signal task-list writing (not achievement writing)
const GATE_WEAK_BULLET_OPENERS = /^(responsible\s+for|was\s+responsible|tasked\s+with|helped\s+(to\s+)?|assisted\s+(with|in)\s+|worked\s+on\s+|involved\s+in\s+|participated\s+in\s+|duties\s+included|part\s+of\s+(a\s+)?team)/i;

// High-signal AI-ism bullet openers (recruiter surveys flag these on sight)
const GATE_AI_BULLET_OPENERS = /^(spearheaded|orchestrated|leveraged|utilized|utilised|facilitated|empowered|championed|synergized|ideated|actioned|solutioned|conceptualized|operationalized)/i;

// Placeholder / template text that leaked into the output
const GATE_PLACEHOLDER = /(\[company(\s+name)?\]|\[year\]|\[name\]|\[title\]|\[insert\b|lorem\s+ipsum|placeholder|your\s+name\s+here|\{\{[a-z_]+\}\})/i;

// Tilde-number AI tell (~50, ~30%) — should have been cleaned, but belt-and-suspenders
const GATE_TILDE_NUMBER = /~\d/;

// First-person pronouns at the start of a bullet (bullets are imperative, not autobiographical)
const GATE_FIRST_PERSON_BULLET = /^(i\s|my\s|we\s|our\s)/i;

// Chained-causal metric pattern — the #1 fabricated-metric tell
const GATE_CHAINED_METRIC = /\d+\s*%.*?resulting\s+in\s+\d+\s*%/i;

export function runFinalVisibleTextGate(cv: any): GateResult {
    const issues: GateIssue[] = [];

    const flag = (
        field: string,
        issue: string,
        text: string,
        severity: GateIssue['severity'],
    ) => issues.push({ field, issue, text: text.slice(0, 120), severity });

    // ── 1. Summary ────────────────────────────────────────────────────────────
    const summary: string = String(cv?.summary || '').trim();

    if (summary.length === 0) {
        flag('summary', 'summary_empty', '', 'critical');
    } else {
        if (GATE_SUMMARY_OPENERS.test(summary)) {
            flag('summary', 'jobseeker_opener', summary.slice(0, 80), 'critical');
        }
        if (GATE_PLACEHOLDER.test(summary)) {
            flag('summary', 'placeholder_text', summary.slice(0, 80), 'critical');
        }
        if (GATE_TILDE_NUMBER.test(summary)) {
            flag('summary', 'tilde_number', summary.slice(0, 80), 'high');
        }
        const wordCount = summary.split(/\s+/).filter(Boolean).length;
        if (wordCount < 25) {
            flag('summary', 'summary_too_short', `${wordCount} words`, 'high');
        }
    }

    // ── 2. Skills ─────────────────────────────────────────────────────────────
    const skills: string[] = Array.isArray(cv?.skills) ? cv.skills : [];

    if (skills.length > 22) {
        flag('skills', 'skills_list_padded', `${skills.length} skills listed`, 'medium');
    }
    const genericSkillsFound: string[] = [];
    for (const s of skills) {
        const raw = String(s || '');
        if (GATE_PLACEHOLDER.test(raw)) {
            flag('skills', 'placeholder_text', raw.slice(0, 60), 'critical');
        }
        // Normalise: lowercase + collapse whitespace for exact-set lookup
        const norm = raw.toLowerCase().trim().replace(/\s+/g, ' ');
        if (GATE_GENERIC_SKILLS.has(norm)) {
            genericSkillsFound.push(raw.slice(0, 40));
        }
    }
    if (genericSkillsFound.length > 0) {
        flag('skills', 'generic_skills', genericSkillsFound.join(', '), 'high');
    }

    // ── 3. Experience bullets ─────────────────────────────────────────────────
    const experience: any[] = Array.isArray(cv?.experience) ? cv.experience : [];
    const allBulletPrefixes = new Set<string>(); // cross-role dedup tracker

    for (let ei = 0; ei < experience.length; ei++) {
        const role = experience[ei];
        const bullets: string[] = Array.isArray(role?.responsibilities) ? role.responsibilities : [];

        for (let bi = 0; bi < bullets.length; bi++) {
            const b = String(bullets[bi] || '').trim();
            if (!b) continue;
            const fieldRef = `experience[${ei}].responsibilities[${bi}]`;

            if (GATE_WEAK_BULLET_OPENERS.test(b)) {
                flag(fieldRef, 'weak_bullet_opener', b.slice(0, 80), 'critical');
            }
            if (GATE_AI_BULLET_OPENERS.test(b)) {
                flag(fieldRef, 'ai_bullet_opener', b.slice(0, 80), 'critical');
            }
            if (GATE_FIRST_PERSON_BULLET.test(b)) {
                flag(fieldRef, 'first_person_bullet', b.slice(0, 80), 'critical');
            }
            if (GATE_PLACEHOLDER.test(b)) {
                flag(fieldRef, 'placeholder_text', b.slice(0, 80), 'critical');
            }
            if (GATE_CHAINED_METRIC.test(b)) {
                flag(fieldRef, 'chained_causal_metric', b.slice(0, 100), 'high');
            }
            if (GATE_TILDE_NUMBER.test(b)) {
                flag(fieldRef, 'tilde_number', b.slice(0, 80), 'high');
            }

            // Cross-role duplicate detection (first 7 words as key)
            const prefix = b.toLowerCase().split(/\s+/).slice(0, 7).join(' ');
            if (allBulletPrefixes.has(prefix)) {
                flag(fieldRef, 'cross_role_duplicate_bullet', b.slice(0, 80), 'high');
            } else {
                allBulletPrefixes.add(prefix);
            }

            // Bullet too short (fewer than 7 words is essentially a fragment)
            const wc = b.split(/\s+/).filter(Boolean).length;
            if (wc < 7) {
                flag(fieldRef, 'bullet_too_short', `"${b}" (${wc} words)`, 'medium');
            }
        }
    }

    // ── 4. Education ──────────────────────────────────────────────────────────
    const education: any[] = Array.isArray(cv?.education) ? cv.education : [];
    for (let i = 0; i < education.length; i++) {
        const edu = education[i];
        const desc = String(edu?.description || '');
        if (GATE_PLACEHOLDER.test(desc)) {
            flag(`education[${i}].description`, 'placeholder_text', desc.slice(0, 80), 'critical');
        }
        // Invented degree detail check — catches "First Class Honours" with no evidence
        // (Placeholder detection covers "[GPA]" etc.; this catches freeform invention signals)
        if (/\bGPA\s*:\s*[0-9]/.test(desc) && !/\bgpa\b/i.test(String(cv?.summary || '') + JSON.stringify(cv?.experience || []))) {
            flag(`education[${i}].description`, 'possible_invented_gpa', desc.slice(0, 80), 'medium');
        }

        // Certification placeholder — model used a template stub instead of a real cert name.
        const certField = String(edu?.certifications || edu?.certification || '');
        if (certField && GATE_CERT_PLACEHOLDER.test(certField)) {
            flag(`education[${i}].certification`, 'cert_placeholder', certField.slice(0, 80), 'critical');
        }
    }

    // ── 4b. Certifications array (top-level field used by some templates) ────
    const certifications: any[] = Array.isArray(cv?.certifications) ? cv.certifications : [];
    for (let i = 0; i < certifications.length; i++) {
        const cert = certifications[i];
        const certName = String(cert?.name || cert?.title || cert || '');
        if (GATE_CERT_PLACEHOLDER.test(certName)) {
            flag(`certifications[${i}]`, 'cert_placeholder', certName.slice(0, 80), 'critical');
        }
        if (GATE_PLACEHOLDER.test(certName)) {
            flag(`certifications[${i}]`, 'placeholder_text', certName.slice(0, 80), 'critical');
        }
    }

    // ── 5. Projects ───────────────────────────────────────────────────────────
    const projects: any[] = Array.isArray(cv?.projects) ? cv.projects : [];
    for (let pi = 0; pi < projects.length; pi++) {
        const proj = projects[pi];
        const projBullets: string[] = Array.isArray(proj?.bullets) ? proj.bullets : [];
        for (let bi = 0; bi < projBullets.length; bi++) {
            const b = String(projBullets[bi] || '').trim();
            if (!b) continue;
            const fieldRef = `projects[${pi}].bullets[${bi}]`;
            if (GATE_AI_BULLET_OPENERS.test(b)) {
                flag(fieldRef, 'ai_bullet_opener', b.slice(0, 80), 'critical');
            }
            if (GATE_WEAK_BULLET_OPENERS.test(b)) {
                flag(fieldRef, 'weak_bullet_opener', b.slice(0, 80), 'critical');
            }
            if (GATE_PLACEHOLDER.test(b)) {
                flag(fieldRef, 'placeholder_text', b.slice(0, 80), 'critical');
            }
        }
        const projDesc = String(proj?.description || '');
        if (GATE_PLACEHOLDER.test(projDesc)) {
            flag(`projects[${pi}].description`, 'placeholder_text', projDesc.slice(0, 80), 'critical');
        }
    }

    // ── Summarise ─────────────────────────────────────────────────────────────
    const counts = {
        critical: issues.filter(i => i.severity === 'critical').length,
        high:     issues.filter(i => i.severity === 'high').length,
        medium:   issues.filter(i => i.severity === 'medium').length,
    };
    const passed       = counts.critical === 0 && counts.high === 0;
    const quality_mode = counts.critical > 0 ? 'degraded' : 'full';

    return { passed, quality_mode, counts, issues };
}

export async function handleGetRules(request: Request, env: Env): Promise<Response> {
    // Require a valid session — these are proprietary prompt-engineering constants,
    // not public data. A 401 here causes rulesService to fall back to offline stubs
    // and retry after login rather than caching the empty result permanently.
    const token = sessionCookieFromRequest(request);
    if (token) {
        const { results } = await env.CV_DB.prepare(
            `SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > ?`
        ).bind(token, Math.floor(Date.now() / 1000)).all();
        if (!results[0]?.user_id) {
            return json({ error: 'unauthorized' }, request, env, 401);
        }
    } else {
        return json({ error: 'unauthorized' }, request, env, 401);
    }

    const payload = {
        version:               _CV_RULES_VERSION,
        systemProfessional:    _CV_SYSTEM_PROFESSIONAL,
        humanizationRules:     _CV_HUMANIZATION_RULES,
        humanizationChecklist: _CV_HUMANIZATION_CHECKLIST,
        systemHumanizer:       _CV_SYSTEM_HUMANIZER,
        systemParser:          _CV_SYSTEM_PARSER,
        systemValidator:       _CV_SYSTEM_VALIDATOR,
        systemAudit:           _CV_SYSTEM_AUDIT,
        scenarioA:                    _CV_SCENARIO_A,
        scenarioB:                    _CV_SCENARIO_B,
        scenarioC:                    _CV_SCENARIO_C,
        scenarioD:                    _CV_SCENARIO_D,
        scenarioModeOverride:         _CV_SCENARIO_MODE_OVERRIDE,
        pivotBlockTemplate:           _CV_PIVOT_BLOCK_TEMPLATE,
        humanizationInstructionHeader: _CV_HUMANIZATION_INSTRUCTION_HEADER,
        criticalRulesReminder:        _CV_CRITICAL_RULES_REMINDER,
        cvDataSchema:                 _CV_DATA_SCHEMA,
    };
    const res = json(payload, request, env);
    // private — this response contains proprietary IP and is session-specific
    res.headers.set('Cache-Control', 'private, max-age=3600');
    return res;
}
