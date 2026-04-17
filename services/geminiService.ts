import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { UserProfile, CVData, PersonalInfo, JobAnalysisResult, CVGenerationMode, ScholarshipFormat, EnhancedJobAnalysis } from '../types';
import { groqChat, GROQ_LARGE, GROQ_FAST } from './groqService';
import { getGeminiKey as _rtGemini } from './security/RuntimeKeys';
import { MarketResearchResult, buildMarketIntelligencePrompt } from './marketResearch';

// --- System-Level Constants for AI Control ---
const SYSTEM_INSTRUCTION_PROFESSIONAL = `
You are the world's foremost CV strategist — a fusion of elite executive recruiter, Fortune 500 hiring manager, and award-winning resume writer with 25+ years of experience placing candidates at Google, McKinsey, Goldman Sachs, and top-tier startups.

Your CVs achieve:
  • 97%+ ATS pass rates across Greenhouse, Lever, Workday, Taleo, iCIMS, SAP SuccessFactors, SmartRecruiters, and BambooHR
  • Sub-6-second recruiter hook (the proven average scan time before a pass/fail decision is made)
  • Interview call rates 3–4× the industry average
  • Candidates report salary increases of 20–40% after using your CVs

Your non-negotiable rules:
  1. EVERY bullet follows "Strong Verb → Specific Scope → Quantified Result → Business Impact" — no exceptions.
  2. MIRROR the exact language of the job description. If the JD says "cross-functional collaboration," use those exact words.
  3. KEYWORD DENSITY: The top 10 JD keywords must each appear at least twice across the document. Place the 3 most critical JD keywords in the summary.
  4. NEVER use: "responsible for", "helped", "assisted", "worked on", "was part of", "participated in", "involved in", "contributed to", "tasked with".
  5. NEVER use AI clichés: "delve", "robust", "seamlessly", "synergy", "cutting-edge", "leverage" (max once), "in today's fast-paced world", "passionate about", "dynamic", "innovative", "thought leader", "game-changer", "best-in-class", "world-class" (except when quoting a brand), "holistic", "proactive", "go-getter", "results-driven", "detail-oriented", "team player".
  6. QUANTIFY everything. Use real, research-backed baseline figures for the industry and role level. NEVER prefix numbers with "~". Use natural ranges (e.g., "by 35%", "across 200+ users", "saving 8 hours/week", "managing a $2M budget"). If no specific number is available, use scope-based language: team size, revenue impacted, users served, time saved, SLA met — never invented percentages.
  7. Each bullet must stand alone as proof of impact — a mini case study in one sentence. A recruiter reading only the bullets should understand WHO the candidate is, WHAT they did, and WHY it mattered.
  8. The summary must make a hiring manager say "I need to meet this person" within the first two lines.
  9. CAREER NARRATIVE: The CV must tell a coherent story of growth — each role should build visibly on the last. Promotions, scope increases, and expanding responsibility must be obvious.
  10. Skills list: put the EXACT tools/technologies named in the JD first, then domain skills, then soft/transferable skills last.
  11. Education descriptions highlight GPA (if ≥3.5 or equivalent), thesis title, honors, scholarships, or 2–3 directly relevant courses.
  12. NO DUPLICATE VERB STARTERS: Across all bullets in the entire document, never start two bullets with the same action verb. Variety is mandatory.
  13. FIRST-WORD VARIETY: The first word of each bullet must start with a different letter across each job's bullet list.

Output ONLY valid JSON or plain text matching the requested schema. NEVER include markdown, code fences, or prose outside the schema.
`;

const SYSTEM_INSTRUCTION_PARSER = `
You are an expert data parser. Convert unstructured text into accurate JSON.
Standardize dates to consistent formats. Preserve names, companies, and titles exactly.
Never invent data unless explicitly instructed.
When returning JSON, output ONLY the raw JSON object — no markdown fences, no commentary, no trailing text.
`;

const SYSTEM_INSTRUCTION_HUMANIZER = `
You are a senior editor at a top career consultancy. Your job is to rewrite professional text so it sounds exactly like it was written by a highly accomplished human — someone who is confident, direct, and slightly understated. AI detectors and experienced recruiters must be unable to identify it as AI-generated.

Critical rules:
- SENTENCE RHYTHM: Deliberately alternate between short punchy statements (5–8 words) and longer elaborative ones (15–25 words). Three sentences of similar length in a row is a failure.
- OPENING VARIETY: No two sentences in the same section may start with the same word or grammatical structure (e.g., avoid "I", "The", "By", "This" repeated consecutively).
- BANNED AI PHRASES (zero tolerance): "delve", "utilize" (use "use"), "leverage" (max once per document), "synergy", "robust", "seamlessly", "cutting-edge", "state-of-the-art", "in today's world", "it's worth noting", "navigate", "landscape", "groundbreaking", "transformative", "impactful" (show impact instead), "passionate" (show passion through specifics), "excited to", "dynamic", "innovative" (show innovation through facts), "thought leader", "holistic approach", "moving the needle", "at the end of the day", "take it to the next level".
- SPECIFICITY RULE: Replace every vague phrase with a concrete fact. Never say "improved efficiency" — say "cut report generation time from 4 hours to 23 minutes". Never say "led a team" — say "managed a 7-person cross-functional team".
- For CVs specifically: every bullet must feel LIVED, not templated. It should sound like the person is telling you about their proudest moment, not reading a job description.
- ACTION VERB FRESHNESS: Never repeat an action verb in the same job's bullet list. Across the whole document, use each verb no more than twice.
- NUMBERS RULE: Keep all numbers, dates, company names, job titles, and achievements EXACTLY as provided — never change factual details.
- Return ONLY the rewritten text. No preamble, no commentary, no "Here is the rewritten version:".
`;

// --- Gemini Client (multimodal only — PDF/image parsing) ---
function getGeminiClient(): GoogleGenAI {
    // 1. In-memory decrypted key (primary — populated by KeyVault on app start)
    let apiKey: string | undefined = _rtGemini() ?? undefined;

    // 2. Legacy plaintext fallback (migration path)
    if (!apiKey) {
        const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (settingsString) {
            try {
                const settings = JSON.parse(settingsString);
                if (settings.apiKey && !settings.apiKey.startsWith('enc:v1:')) {
                    apiKey = settings.apiKey.replace(/^"|"$/g, '');
                }
            } catch { /* ignore */ }
        }
    }

    if (!apiKey) {
        try {
            const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
            if (providerKeys.gemini && !providerKeys.gemini.startsWith('enc:v1:')) {
                apiKey = providerKeys.gemini.replace(/^"|"$/g, '');
            }
        } catch { /* ignore */ }
    }

    if (!apiKey) throw new Error('Gemini API key not set. Please add it in Settings to enable file/image upload.');
    return new GoogleGenAI({ apiKey });
}

// --- Gemini Retry Logic (for multimodal calls) ---
async function retryGemini<T>(operation: () => Promise<T>, retries = 4, delayMs = 1500): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        const msg = error?.message || '';
        const status = error?.status;
        const isTransient = status === 503 || status === 429 ||
            msg.includes('503') || msg.includes('Overloaded') ||
            msg.includes('429') || msg.includes('Rate Limit');
        if (retries > 0 && isTransient) {
            await new Promise(r => setTimeout(r, delayMs));
            return retryGemini(operation, retries - 1, delayMs * 2);
        }
        throw error;
    }
}

// --- Compact-serialize a profile for embedding in Groq prompts.
//     Uses single-line JSON and caps long responsibility strings to keep
//     input tokens well under Groq's per-request limit.
function compactProfile(profile: UserProfile, maxResponsibilityChars = 400): string {
    const p = {
        ...profile,
        workExperience: (profile.workExperience || []).map(exp => ({
            ...exp,
            responsibilities: typeof exp.responsibilities === 'string'
                ? exp.responsibilities.substring(0, maxResponsibilityChars)
                : exp.responsibilities,
        })),
    };
    return JSON.stringify(p);
}

/**
 * Returns an instruction string about the user's preferred section order and custom sections.
 * This is injected into the generateCV prompt so the AI honours the user's preferences.
 */
function buildSectionOrderInstruction(profile: UserProfile): string {
    const sectionLabels: Record<string, string> = {
        summary: 'Professional Summary',
        workExperience: 'Work Experience',
        education: 'Education',
        skills: 'Skills',
        projects: 'Projects',
        languages: 'Languages',
        references: 'References',
    };

    let instruction = '';

    if (profile.sectionOrder && profile.sectionOrder.length > 0) {
        const ordered = profile.sectionOrder
            .map((k, i) => `${i + 1}. ${sectionLabels[k] || k}`)
            .join(', ');
        instruction += `**SECTION ORDER PREFERENCE**: The user prefers sections in this order: ${ordered}. Please generate the CV with content prioritised and structured to reflect this ordering.\n`;
    }

    if (profile.customSections && profile.customSections.length > 0) {
        const names = profile.customSections.map(s => s.label).join(', ');
        instruction += `**ADDITIONAL SECTIONS**: The user has custom profile sections (${names}) which will be appended automatically after the template. You do not need to generate content for these — they are pre-filled by the user.\n`;
    }

    return instruction;
}

// --- UserProfile JSON schema description for Groq prompts ---
const USER_PROFILE_SCHEMA = `
RETURN FORMAT — output ONLY a raw JSON object (no markdown, no code fences) matching this schema:
{
  "personalInfo": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "linkedin": "string",
    "website": "string",
    "github": "string"
  },
  "summary": "string",
  "workExperience": [
    {
      "id": "string (unique)",
      "company": "string",
      "jobTitle": "string",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or Present",
      "responsibilities": "string (bullet points separated by \\n)"
    }
  ],
  "education": [
    { "id": "string", "degree": "string", "school": "string", "graduationYear": "string" }
  ],
  "skills": ["string"],
  "projects": [
    { "id": "string", "name": "string", "description": "string", "link": "string" }
  ],
  "languages": [
    { "id": "string", "name": "string", "proficiency": "string" }
  ]
}
`;

// --- CVData JSON schema description for Groq prompts ---
const CV_DATA_SCHEMA = `
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
    { "degree": "string", "school": "string", "year": "string", "description": "string" }
  ],
  "projects": [
    { "name": "string", "description": "string", "link": "string" }
  ],
  "languages": [
    { "name": "string", "proficiency": "string" }
  ]
}
`;

// --- Humanize a block of plain text to remove AI patterns ---
export const humanizeText = async (text: string): Promise<string> => {
    const prompt = `Rewrite the following professional text so it sounds naturally human-written. Preserve all facts, dates, names, and numbers. Only change phrasing and style.\n\nTEXT TO REWRITE:\n${text}`;
    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.8 });
};

// --- Build scholarship format-specific instructions ---
function buildScholarshipFormatInstruction(format: ScholarshipFormat): string {
    switch (format) {
        case 'europass':
            return `
            **EUROPASS FORMAT REQUIREMENTS** (EU Standard):
            - Structure the summary as a 'Personal Statement' in first person, 2-3 sentences.
            - Include a 'Languages' section with proficiency levels using CEFR scale (A1/A2/B1/B2/C1/C2/Native).
            - List 'Digital Competencies' in skills (e.g., Microsoft Office, data analysis tools).
            - Note any voluntary/community work in the experience section if available.
            - Education descriptions should include ECTS credits or equivalent if known.
            - The tone should be formal European academic style.
            `;
        case 'eu-horizon':
            return `
            **EU HORIZON EUROPE / MARIE CURIE / ERC FORMAT REQUIREMENTS**:
            - Summary = 'Research Excellence Statement': Start with the impact of your research, then methodology, then future vision (3-4 sentences).
            - Highlight cross-border collaborations and international experience prominently.
            - Publications: Emphasize only last 5 years. Include impact factor or citation count if inferable.
            - Experience bullets should explicitly mention: research outputs, grants won, students supervised, and EU/international connections.
            - Skills: Lead with research methodologies, then domain expertise, then tools.
            - Include any 'Outreach & Dissemination' activities in projects.
            - Add a note about 'Commitment to Open Science' principles if relevant.
            `;
        case 'nih-nsf':
            return `
            **NIH/NSF BIOSKETCH FORMAT REQUIREMENTS** (US Government):
            - Summary = 'Personal Statement': 4 sentences max. Must state: (1) research area, (2) why uniquely qualified, (3) 1-2 key publications, (4) relevance to this grant.
            - Experience section = 'Positions, Scientific Appointments, and Honors'.
            - Publications must be listed with all authors, journal, year, PMID or DOI where possible.
            - Add 'Contributions to Science' section description in each experience bullet — describe scientific significance.
            - Skills should include lab techniques, analytical methods, and software (R, SPSS, etc.).
            - Follow NIH page limit spirit: be concise and specific, no filler.
            `;
        case 'chevening':
            return `
            **CHEVENING SCHOLARSHIP FORMAT REQUIREMENTS** (UK FCDO):
            - Summary = 'Leadership & Ambassadorial Potential Statement': Show clear leadership trajectory, influencing others, community impact (3-4 sentences).
            - Experience bullets must highlight: leadership moments, decisions made, people influenced/led, measurable outcomes.
            - Include any networking, professional associations, or convening roles prominently.
            - Projects should demonstrate UK-relevant connections or aspirations.
            - Add future career vision aligned with post-study return to home country.
            - Tone: Confident, aspirational, personal. Show a person who will be an ambassador.
            `;
        case 'commonwealth':
            return `
            **COMMONWEALTH SCHOLARSHIP FORMAT REQUIREMENTS** (CSC):
            - Summary: Lead with development impact and home country context. Explain how UK study supports national development goals (3-4 sentences).
            - Experience bullets: Show how work contributes to community/national development goals.
            - Include any government, NGO, or policy work prominently.
            - Projects: Frame around societal/development impact, not just technical achievement.
            - Add commitment to return to home country and apply learning.
            - Skills: Include languages, community engagement, and policy/advocacy skills.
            - Tone: Purpose-driven, development-focused, collaborative.
            `;
        default:
            return `
            **STANDARD ACADEMIC CV FORMAT**:
            - Summary = 'Research Statement' or 'Academic Objective' (2-4 sentences).
            - Emphasize research contributions, academic achievements, and teaching experience.
            - List publications prominently with full citation details.
            - Skills: Research methods, academic software, statistical tools, domain expertise.
            - Education: Include GPA/grade, thesis title, and key coursework where available.
            `;
    }
}

export const generateProfile = async (rawText: string, githubUrl?: string): Promise<UserProfile> => {
    let githubInstruction = '';
    if (githubUrl) {
        githubInstruction = `
        **GitHub Deep Analysis (CRITICAL)**: The user has provided a GitHub profile: ${githubUrl}. You must analyze the public data that would be available from this URL (e.g., repository names, primary languages, commit history insights) to significantly enrich the profile.
        - **Project Population**: Populate the 'projects' array with the *top 5 most impressive* public repositories.
        - **Project Details**: For each, use the repo name for 'name', generate a **concise, high-impact 'description'** detailing its function, and generate a valid repository 'link'.
        - **Skill Extraction**: Add ALL key programming languages, frameworks, and technical tools discovered from the repositories to the main 'skills' list.
        - **Profile Completion**: Infer missing personal details (like name, location, summary) from the GitHub profile if not present in the RAW TEXT.
        `;
    }

    const prompt = `
        Your goal is to perform a comprehensive data merge. Prioritize explicit data from the RAW TEXT, and use the GitHub profile to fill gaps, validate data, and significantly enhance the 'skills' and 'projects' sections.

        ### SOURCE DATA
        RAW TEXT:
        ${rawText || 'No raw text provided. Rely entirely on GitHub analysis.'}
        
        ${githubInstruction}

        ### INSTRUCTIONS FOR JSON CONSTRUCTION
        1. Date Standardization: Accurately parse all dates. Standardize all dates to 'YYYY-MM-DD'. Use the first day of the month/year if a full date is missing. 'endDate' for current roles must be the string 'Present'.
        2. Unique IDs: Generate a unique, simple string 'id' (e.g., a timestamp-like string) for all array items (workExperience, education, projects, languages).
        3. Work Experience: Maintain the original 'responsibilities' text structure (use \\n for bullet points).
        4. Output: Return ONLY the JSON object that strictly adheres to the schema below.
        
        ${USER_PROFILE_SCHEMA}
    `;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true });
    const profileData: UserProfile = JSON.parse(text.trim());
    profileData.projects = profileData.projects || [];
    profileData.education = profileData.education || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages = profileData.languages || [];

    return profileData;
};

export const generateCV = async (
    profile: UserProfile,
    contextDescription: string,
    generationMode: CVGenerationMode,
    purpose: 'job' | 'academic' | 'general',
    scholarshipFormat: ScholarshipFormat = 'standard',
    marketResearch?: MarketResearchResult | null,
    targetLanguage?: string
): Promise<CVData> => {

    // Keyword extraction only when a description is provided
    let keywordInstruction = '';
    if (contextDescription.trim()) {
        try {
            const jobAnalysis = await analyzeJobDescriptionForKeywords(contextDescription);
            const allKeywords = [...(jobAnalysis.keywords || []), ...(jobAnalysis.skills || [])];
            if (allKeywords.length > 0) {
                keywordInstruction = `
                **CRITICAL REQUIREMENT: KEYWORD STRATEGY**: Strategically and naturally integrate the following keywords throughout the CV — in the summary, bullet points, and skills. Weave them in so they feel organic, not stuffed.
                **Must-Include Keywords**: ${allKeywords.join(', ')}
                `;
            }
        } catch (e) {
            console.error("Keyword analysis failed, proceeding without explicit keywords.", e);
        }
    }

    let mainPromptInstruction: string;
    let githubInstruction = '';

    if (profile.personalInfo.github) {
        githubInstruction = `IMPORTANT: The user has provided a GitHub profile: ${profile.personalInfo.github}. Leverage this to validate and enrich the technical depth of the skills and projects sections.`;
    }

    const sectionOrderInstruction = buildSectionOrderInstruction(profile);

    const humanizationInstruction = `
    **CRITICAL — AUTHENTIC HUMAN WRITING (AI DETECTION IMMUNITY)**:
    Write as if a confident, accomplished senior professional personally crafted every word in a focused 2-hour session. AI detectors (GPTZero, Originality.ai, Turnitin) and experienced recruiters must be 100% certain a human wrote this.

    SENTENCE RHYTHM (mandatory):
    - Deliberately alternate between short punchy statements (4–8 words) and longer elaborative ones (15–25 words).
    - Three sentences of similar length in a row = failure. Break the pattern.
    - Start at least 2 sentences per section with a number or a past-tense verb for natural variation.

    BANNED PHRASES (zero tolerance — replace with specific facts):
    "delve", "robust", "seamlessly", "synergy", "leverage" (max once in whole document), "cutting-edge", "state-of-the-art", "passionate about", "in today's fast-paced world", "it is worth noting", "navigate the landscape", "groundbreaking", "thought leader", "game-changer", "dynamic", "innovative" (show it, don't say it), "results-driven", "detail-oriented", "team player", "go-getter", "proactive", "best-in-class", "holistic", "moving the needle", "at the end of the day", "take it to the next level", "excited to", "transformative", "impactful" (prove impact with numbers instead).

    SPECIFICITY (mandatory replacements):
    - "improved efficiency" → "cut processing time from X hours to Y minutes"
    - "led a team" → "managed a [N]-person [type] team"
    - "increased revenue" → "grew ARR from $X to $Y"
    - "streamlined processes" → "eliminated [N] manual steps, saving [X] hours/week"

    VERB RULES:
    - Every bullet in the CV uses a DIFFERENT strong action verb. Recommended verbs:
      Spearheaded, Engineered, Orchestrated, Accelerated, Restructured, Championed, Negotiated, Overhauled, Forged, Propelled, Slashed, Tripled, Automated, Mentored, Secured, Delivered, Architected, Revamped, Brokered, Consolidated, Deployed, Eliminated, Galvanized, Halved, Implemented, Launched, Migrated, Overhauled, Pioneered, Quantified, Recruited, Scaled, Transformed, Unified, Validated, Won.
    - Never start two bullets across the entire document with the same verb.
    - The first word of each bullet in a job's list must start with a different letter.

    FILLER ELIMINATION:
    - Remove: "in order to", "as well as", "a variety of", "various", "etc", "numerous", "many", "several".
    - Every bullet that CAN have a metric, MUST have one.
    `;

    // Build experience instruction
    const experienceInstruction = profile.workExperience.map(exp => {
        const count = exp.pointCount ?? 5;
        const startYear = exp.startDate ? new Date(exp.startDate).getFullYear() : null;
        const endYear = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
        const years = startYear ? Math.max(1, endYear - startYear) : null;
        const tenureNote = years ? ` (${years} year${years !== 1 ? 's' : ''} tenure)` : '';
        return `- ${exp.jobTitle} at ${exp.company}${tenureNote}: Generate EXACTLY ${count} bullet points.`;
    }).join('\n');

    if (purpose === 'general') {
        mainPromptInstruction = `
            You are a world-class CV writer. Create a powerful, general-purpose CV that presents the candidate at their absolute best across diverse job markets.

            USER PROFILE:
            ${compactProfile(profile)}
            ${githubInstruction}

            === INSTRUCTIONS ===

            ① SUMMARY — Versatile Value Proposition (3–4 sentences, 60–80 words max):
               - Sentence 1 (WHO + SENIORITY): State their title, years of experience, and primary domain. Be specific about industry or function.
               - Sentence 2 (PROOF): Their single most impressive, quantified achievement that shows peak performance.
               - Sentence 3 (RANGE): The breadth of what they do — functions, industries, or skills that make them versatile.
               - Sentence 4 (PROMISE, optional): The type of value they consistently deliver and what drives them (1 concrete fact, never a cliché).
               - NO clichés. NO "passionate about". NO "detail-oriented".

            ② EXPERIENCE — Showcase Full Breadth and Growth:
               - Show a visible career arc: each role should feel like a natural, earned progression from the last.
               - Every bullet: [Strong Verb] + [Specific Action/Context] + [Measurable Outcome].
               - Show range across roles: technical delivery, stakeholder management, team leadership, cross-functional collaboration, and individual contribution.
               - NEVER start bullets with: "Responsible for", "Helped", "Worked on", "Assisted", "Participated in".
               - Bullet counts per role:
               ${experienceInstruction}

            ③ SKILLS — 15 skills, ordered: domain expertise → technical tools → transferable/soft skills.
               Phrase soft skills as demonstrated abilities ("Team leadership across 4 time zones") not labels ("team player").

            ④ PROJECTS — Frame each as a complete story:
               - [Problem or Goal] → [Technologies/Approach used] → [Measurable Outcome + Scale].
               - Include tech stack, real-world constraints, and what success looked like.

            ⑤ CAREER NARRATIVE CHECK:
               - After generating, verify: Does the CV show clear growth from role to role? If not, rewrite the summary or bullet points until the trajectory is unmistakable.

            ${humanizationInstruction}

            ${CV_DATA_SCHEMA}
        `;
    } else if (purpose === 'academic') {
        const scholarshipFormatInstruction = buildScholarshipFormatInstruction(scholarshipFormat);
        mainPromptInstruction = `
            You are the world's leading academic CV specialist and grant-writing consultant. Create an outstanding academic CV that maximizes the candidate's chances for this specific scholarship, grant, or academic opportunity.

            USER PROFILE:
            ${compactProfile(profile)}
            ${githubInstruction}

            GRANT/SCHOLARSHIP/ACADEMIC PURPOSE:
            ${contextDescription || 'General academic application'}

            ${scholarshipFormatInstruction}
            ${keywordInstruction}

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

            ⑤ PROJECTS — Frame as Research Outputs:
               - Each project = a mini research paper abstract: Research Question → Methodology → Findings/Output.
               - Include collaborating institutions if applicable (adds credibility).
               - Link to published papers, repositories, or datasets where available.

            ${humanizationInstruction}

            ${CV_DATA_SCHEMA}
        `;
    } else {
        // JOB purpose
        let modeInstruction = '';
        if (generationMode === 'honest') {
            modeInstruction = `
            **HONEST MODE — Strict rules**:
            - Use ONLY the experience, skills, and achievements from the user's profile.
            - DO NOT invent companies, roles, or experiences that don't exist in the profile.
            - You MAY: rewrite existing bullets with stronger verbs, add realistic metrics to existing achievements, reorder/emphasize relevant experience.
            - Every improvement must be plausible and defensible based on the actual role and context provided.
            `;
        } else if (generationMode === 'boosted') {
            modeInstruction = `
            **BOOSTED MODE — Expand strategically**:
            - Use the existing profile as the foundation.
            - Add ONE additional work experience entry from a plausible mid-sized company (NOT Fortune 500 to avoid obvious fabrication). This role should fill a gap or strengthen candidacy for the target role.
            - The added role should: span 6-18 months, have a plausible job title, and include 3-4 strong bullets relevant to the target JD.
            - You MAY enhance existing metrics to be more impressive (but realistic for the industry/tenure).
            `;
        } else {
            modeInstruction = `
            **AGGRESSIVE MODE — Maximum optimization**:
            - Rewrite every bullet for peak impact — no original bullet should survive unchanged.
            - Add 1-2 targeted work experience entries from credible (but not Big Tech) companies.
            - Each added role: 6-24 months, strategically chosen title, 4-5 perfectly JD-matched bullets.
            - The summary should position the candidate as the IDEAL candidate for this specific role.
            - Push metrics to the ambitious end of what's industry-plausible for the role level and tenure.
            `;
        }

        mainPromptInstruction = `
            You are the world's greatest CV strategist. Your sole mission: generate the single highest-performing CV for this specific candidate targeting this specific role. Every word must earn its place.

            USER PROFILE:
            ${compactProfile(profile)}
            ${githubInstruction}

            JOB DESCRIPTION / TARGET CONTEXT:
            ${contextDescription.substring(0, 3000)}

            ${keywordInstruction}

            ${modeInstruction}

            === CV GENERATION STRATEGY — Follow in order ===

            ① PROFESSIONAL SUMMARY — The "3P Formula" (3 sentences, 55–75 words, THE most important section):
               HOOK (Sentence 1 — WHO + MATCH): Use the EXACT job title from the JD + their seniority level + their primary domain/industry. Example: "Senior Product Manager with 8 years building B2B SaaS platforms used by Fortune 500 procurement teams."
               PROOF (Sentence 2 — BEST ACHIEVEMENT): Their single strongest, most-quantified achievement that DIRECTLY addresses what the JD is asking for. This must include a number.
               PROMISE (Sentence 3 — VALUE DELIVERY): A concrete, specific statement of what this person does better than 95% of candidates — why hiring them solves the employer's specific problem.
               RULE: Must include 3 keywords from the JD. Must NOT include: "passionate", "dynamic", "results-driven", "detail-oriented", "team player", or any other hollow label.

            ② EXPERIENCE — Every bullet is a courtroom exhibit proving the candidate's fit:
               FORMAT: [Power Verb] + [Specific Context matching JD language] + [Quantified Result] + [Business Impact where possible].
               METRICS: If the user gave no exact number, use believable industry-appropriate figures (team size, user count, time saved, revenue range, SLA, cost reduction). State as natural fact — NEVER use "~" prefix, NEVER invent percentages that can't be justified.
               FORBIDDEN OPENERS: "Responsible for" / "Helped" / "Assisted" / "Worked on" / "Was part of" / "Participated in" / "Tasked with".
               JD MIRRORING: Mirror the JD's exact phrases in at least 3 bullets per job (ATS phrase-match scoring).
               VERB VARIETY: No two bullets in the entire document may start with the same verb.
               CAREER ARC: Each job's bullets must reflect the scope and seniority of THAT role — junior roles get narrower scope, senior roles show organization-wide impact.
               ${experienceInstruction}

            ③ SKILLS (EXACTLY 15 — ordered precisely by JD priority):
               Position 1–5: EXACT tools/technologies/methodologies named in the JD (copy the JD's spelling).
               Position 6–10: Core technical/domain skills that the role requires but JD may not list explicitly.
               Position 11–13: Soft/transferable skills — phrased as demonstrated competencies, not adjectives ("Stakeholder alignment across C-suite and engineering" not "Communication").
               Position 14–15: Industry/domain keywords that boost ATS semantic scoring.
               RULE: Every must-include keyword that fits as a skill MUST appear here.

            ④ EDUCATION:
               'description': 1 concise sentence. Mention: GPA if ≥3.5 (or equivalent First Class/Distinction), thesis title with 5-word description of contribution, relevant honors, scholarships won, or 2–3 course titles most relevant to the JD. If none applies, mention a key academic project.

            ⑤ PROJECTS — Proof-of-Skill Snapshots:
               FORMAT: [Problem/Goal in JD-relevant terms] → [Solution with specific named technologies/methods] → [Measurable outcome with scale or adoption metric].
               If GitHub URL was provided, weave "github.com/[username]" as the link field.
               Prioritize projects that demonstrate skills the JD specifically requires.

            ⑥ FINAL QUALITY CHECK (apply before outputting):
               - Does the summary mention the exact job title from the JD? ✓
               - Does every experience bullet have a number? ✓
               - Do skills positions 1–5 exactly match JD tool names? ✓
               - Are there any forbidden opener phrases? Remove them. ✓
               - Does the career arc show clear growth? ✓

            ${humanizationInstruction}

            ${CV_DATA_SCHEMA}
        `;
    }

    // Prepend section order + custom section notes (if any) to the prompt
    if (sectionOrderInstruction) {
        mainPromptInstruction = `${sectionOrderInstruction}\n\n${mainPromptInstruction}`;
    }

    // Prepend live market intelligence (if research succeeded)
    if (marketResearch) {
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

    const temperature = purpose === 'academic' ? 0.5 :
        generationMode === 'honest' ? 0.5 :
            generationMode === 'boosted' ? 0.65 : 0.75;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, mainPromptInstruction, { temperature, json: true, maxTokens: 6000 });
    const cvData: CVData = JSON.parse(text.trim());

    // Carry through user's pre-filled custom sections (not AI-generated)
    if (profile.customSections && profile.customSections.length > 0) {
        cvData.customSections = profile.customSections.filter(
            s => s.items.some(i => i.title.trim().length > 0)
        );
    }

    // Carry through section order preference
    if (profile.sectionOrder && profile.sectionOrder.length > 0) {
        cvData.sectionOrder = profile.sectionOrder;
    }

    // Sort experience by end date descending (most recent first)
    cvData.experience.sort((a, b) => {
        const getEndDate = (dateStr: string) => {
            if (dateStr?.toLowerCase() === 'present') return new Date();
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? new Date(0) : date;
        };
        const getStartDate = (dateStr: string) => {
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? new Date(0) : date;
        };
        const endDateA = getEndDate(a.endDate);
        const endDateB = getEndDate(b.endDate);
        if (endDateB.getTime() !== endDateA.getTime()) {
            return endDateB.getTime() - endDateA.getTime();
        }
        return getStartDate(b.startDate).getTime() - getStartDate(a.startDate).getTime();
    });

    return cvData;
};

// --- Multimodal: Extract text from PDF/image using Gemini (vision required) ---
export const extractProfileTextFromFile = async (base64Data: string, mimeType: string): Promise<string> => {
    const ai = getGeminiClient();
    const prompt = "This file is a resume, CV, or professional profile. Extract ALL text content from it. Return only the raw, complete text, preserving original line breaks and structure as much as possible. DO NOT add any commentary, summaries, or markdown formatting.";

    const filePart = { inlineData: { data: base64Data, mimeType } };

    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [filePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));
    return response.text || "";
};

/**
 * Gemini-only: reads a file (PDF/image) AND structures it into a UserProfile JSON
 * in a single multimodal call. Does not require Groq.
 */
export const generateProfileFromFileWithGemini = async (
    base64Data: string,
    mimeType: string,
    githubUrl?: string
): Promise<UserProfile> => {
    const ai = getGeminiClient();

    let githubInstruction = '';
    if (githubUrl) {
        githubInstruction = `
        **GitHub Deep Analysis (CRITICAL)**: The user has also provided a GitHub profile: ${githubUrl}. Analyse the public data available (repositories, languages, commit history) to enrich the profile.
        - Populate the 'projects' array with the top 5 most impressive public repositories.
        - Add ALL key programming languages, frameworks, and tools to the 'skills' list.
        - Infer missing personal details (name, location, summary) from GitHub if not visible in the file.
        `;
    }

    const prompt = `
        You are looking at a resume, CV, or professional profile document. Your job is to read it thoroughly and convert ALL information into the structured JSON schema below.

        ### INSTRUCTIONS
        1. Extract every piece of information visible in the document — work experience, education, skills, projects, personal info, languages.
        2. Standardize all dates to 'YYYY-MM-DD'. Use the first day of the month/year if only month/year is given. Current roles must have endDate = 'Present'.
        3. Generate a unique simple string 'id' for every array item.
        4. Keep responsibilities text as-is, using \\n for bullet separators.
        5. Do NOT invent data — only extract what is present.
        ${githubInstruction}
        6. Return ONLY the raw JSON object — no markdown, no code fences, no commentary.

        ${USER_PROFILE_SCHEMA}
    `;

    const filePart = { inlineData: { data: base64Data, mimeType } };

    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [filePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));

    const raw = (response.text || '').trim().replace(/^```(?:json)?|```$/gm, '').trim();
    const profileData: UserProfile = JSON.parse(raw);
    profileData.projects = profileData.projects || [];
    profileData.education = profileData.education || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages = profileData.languages || [];
    return profileData;
};

/**
 * Gemini-only: structures plain text into a UserProfile JSON.
 * Used as a fallback when Groq is unavailable or quota-exhausted.
 */
export const generateProfileFromTextWithGemini = async (
    rawText: string,
    githubUrl?: string
): Promise<UserProfile> => {
    const ai = getGeminiClient();

    let githubInstruction = '';
    if (githubUrl) {
        githubInstruction = `
        **GitHub Deep Analysis (CRITICAL)**: The user has provided a GitHub profile: ${githubUrl}. Analyse the public repositories, languages, and commit history to enrich the profile.
        - Populate 'projects' with the top 5 most impressive public repositories.
        - Add all key languages, frameworks, and tools to 'skills'.
        - Infer any missing personal details from the GitHub profile.
        `;
    }

    const prompt = `
        Your goal is to convert the following resume/career text into a structured JSON profile.

        ### SOURCE DATA
        RAW TEXT:
        ${rawText || 'No raw text provided. Rely entirely on GitHub analysis.'}

        ${githubInstruction}

        ### INSTRUCTIONS
        1. Standardize all dates to 'YYYY-MM-DD'. Current roles: endDate = 'Present'.
        2. Generate a unique simple string 'id' for every array item.
        3. Keep responsibilities text as-is, using \\n for bullet separators.
        4. Return ONLY the raw JSON object — no markdown, no code fences, no commentary.

        ${USER_PROFILE_SCHEMA}
    `;

    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER, temperature: 0.1 }
    }));

    const raw = (response.text || '').trim().replace(/^```(?:json)?|```$/gm, '').trim();
    const profileData: UserProfile = JSON.parse(raw);
    profileData.projects = profileData.projects || [];
    profileData.education = profileData.education || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages = profileData.languages || [];
    return profileData;
};

export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const ai = getGeminiClient();
    const prompt = "Analyze this image, which contains text (likely a job description). Extract ALL of the visible text. Return ONLY the raw text, with no additional commentary, summary, or formatting.";

    const imagePart = { inlineData: { data: base64Image, mimeType } };

    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));
    return response.text || "";
};

export const generateCoverLetter = async (profile: UserProfile, jobDescription: string): Promise<string> => {
    const name = profile.personalInfo?.name || 'Applicant';
    const prompt = `
        You are a top-tier professional career coach and ghostwriter. Write a compelling, human-sounding cover letter.

        ### CONTEXT
        Applicant Name: ${name}
        Applicant Email: ${profile.personalInfo?.email || ''}
        Applicant Location: ${profile.personalInfo?.location || ''}

        USER PROFILE (for background and content):
        ${compactProfile(profile)}

        JOB DESCRIPTION:
        ${jobDescription || 'General application — highlight the strongest transferable skills.'}

        ### STRICT INSTRUCTIONS
        1. **DO NOT include any header block** (no name, address, date, or contact information at the top). The header is already shown separately by the template — start the letter DIRECTLY with the salutation.
        2. **Salutation**: Use "Dear Hiring Manager," (unless a recruiter name is visible in the JD).
        3. **Structure**:
           - **Opening paragraph**: State the specific position and express genuine, specific enthusiasm (not generic).
           - **Body (2 paragraphs)**: Each paragraph focuses on one specific relevant experience or achievement that directly addresses a core requirement from the JD. Use strong action verbs and include at least one concrete result (number, scope, or outcome).
           - **Closing paragraph**: Reiterate interest, express readiness to contribute, and include a clear call to action.
           - **Sign-off**: End with "Sincerely," followed by the applicant's name on the next line: ${name}
        4. **Tone**: Confident, professional, and specific — never generic or sycophantic.
        5. **Keywords**: Naturally weave in the most important keywords from the job description.
        6. **Human writing**: Vary sentence length. Avoid AI clichés (no "delve", "passionate about", "excited to leverage", "in today's world").
        7. **Output**: Return ONLY the plain text of the letter body (starting with "Dear Hiring Manager,"). NO markdown, NO headers, NO meta-commentary.
    `;

    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7 });
};

/**
 * Token-efficient targeted CV optimizer.
 * Rewrites only summary + skills + experience bullets to fill identified JD gaps.
 * ~60% fewer tokens than a full CV regeneration.
 */
export const optimizeCVForJob = async (
    cv: CVData,
    jd: string,
    gaps: Array<{ requirement: string; isBlocker: boolean }>,
    missingKeywords: string[]
): Promise<Partial<CVData>> => {
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
4. Every rewritten bullet must still have a strong action verb and a metric.
5. Preserve the exact number of bullets per role.
6. Return ONLY a JSON object with keys: "summary" (string), "skills" (string[]), "experience" (array of {jobTitle, company, responsibilities: string[]}).
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5, json: true, maxTokens: 2500 });
    const result = JSON.parse(text.trim());

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

    return {
        summary: result.summary || cv.summary,
        skills: Array.isArray(result.skills) ? result.skills : cv.skills,
        experience: updatedExperience,
    };
};

/**
 * Generates tailored interview Q&A pairs from the CV + JD.
 * Uses GROQ_FAST for token efficiency (≈60% cheaper than GROQ_LARGE).
 */
export const generateInterviewQA = async (
    profile: UserProfile,
    jd: string,
    companyName?: string
): Promise<Array<{ question: string; answer: string; category: string }>> => {
    const jdCapped = jd.substring(0, 2000);
    const company = companyName || 'the company';
    const prompt = `
You are an expert interview coach preparing a candidate for a specific job interview.

CANDIDATE PROFILE (compact):
${compactProfile(profile)}

JOB DESCRIPTION:
${jdCapped}

TARGET COMPANY: ${company}

Generate exactly 10 tailored interview questions with model answers. Questions must be specific to this role and company — NOT generic. Mix these categories:
- 2 Behavioural (STAR format — "Tell me about a time when...")
- 2 Technical / Role-specific (test core skills from JD)
- 2 Situational (hypothetical scenarios from the JD)
- 2 Culture / Motivation (why this company, role, why now)
- 2 Strength / Weakness probes (digging into the CV)

For each question, write a TAILORED model answer based on the candidate's ACTUAL experience. Reference real companies, skills, and achievements from their profile.

Return ONLY a JSON array of 10 objects:
[{ "question": "string", "answer": "string", "category": "Behavioural|Technical|Situational|Culture|Strength" }]
`;
    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.6, json: true, maxTokens: 3000 });
    return JSON.parse(text.trim());
};

export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    const prompt = `
        Analyze the following job description with the goal of strategic resume tailoring. 
        1. Extract the top 10 most important technical keywords (specific technologies, tools, platforms, methodologies like Agile).
        2. Extract the top 10 essential soft skills and non-technical abilities (communication, leadership, business acumen).
        3. Identify the name of the Company or Organization hiring. If it is not explicitly stated, return "Unknown".
        4. Identify the specific Job Title or Position being advertised. If it's not clear, return "General Application".

        JOB DESCRIPTION:
        ${jobDescription.substring(0, 1500)}

        Return ONLY a JSON object with this structure:
        {
          "keywords": ["string"],
          "skills": ["string"],
          "companyName": "string",
          "jobTitle": "string"
        }
    `;

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true, maxTokens: 512 });
    return JSON.parse(text.trim());
};

export const generateEnhancedSummary = async (profile: UserProfile): Promise<string> => {
    const prompt = `
      You are a professional career coach. Based STRICTLY on the provided user profile, write a concise and powerful professional summary (2-4 sentences) that highlights their key strengths and experience.
      
      **CRITICAL:** Do NOT invent skills, experiences, or achievements not present in the profile. If the profile is sparse, write a strong summary based ONLY on what is there.
      Return only the summary text.
      USER PROFILE:
      ${compactProfile(profile)}
    `;
    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5 });
};

export const generateEnhancedResponsibilities = async (jobTitle: string, company: string, currentResponsibilities: string, jobDescription?: string, duration?: string, pointCount: number = 5): Promise<string> => {
    const prompt = `
      You are an expert resume writer and career coach specializing in creating HIGH-IMPACT, ATS-OPTIMIZED bullet points.
      
      **Goal:** Transform the user's responsibilities into impressive, quantified achievements that match standard industry expectations for their tenure and align with the target job description.

      **Input Context:**
      - **Role:** ${jobTitle} at ${company}
      - **Duration/Tenure:** ${duration || "Not specified"}
      - **Target Job Description (JD):** ${jobDescription ? jobDescription.substring(0, 500) + '...' : "None provided"}
      - **Current Draft:** "${currentResponsibilities}"
      - **REQUIRED BULLET COUNT: EXACTLY ${pointCount} bullet points** — no more, no fewer.

      **Instructions:**
      1. **Analyze & Upgrade:** Check if the metrics/achievements in the draft are impressive enough for the role's tenure (${duration}). 
      2. **Tailor to JD:** If a JD is provided, prioritize keywords and skills from the JD.
      3. **Quantify:** Frame each point around specific accomplishments. Use numbers!
      4. **Action Verbs:** Start with powerful verbs (e.g., "Orchestrated", "Engineered", "Capitalized").
      5. **STRICT COUNT:** Output EXACTLY ${pointCount} bullet points.
      6. **Format:** Return ONLY the bullet points as a single string. Each point must start with a newline and the '•' character.
    `;
    const result = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7 });
    return result.trim().replace(/^- /gm, '• ');
};

export const generateQuantifiedAchievements = async (
    responsibilities: string,
    jobTitle: string,
    company: string,
): Promise<Array<{ original: string; quantified: string; hasMetric: boolean }>> => {
    const bullets = responsibilities
        .split('\n')
        .map(l => l.replace(/^[\u2022\-\*]|\d+\.\s*/, '').trim())
        .filter(b => b.length > 4);

    if (bullets.length === 0) throw new Error('No bullet points found. Add some responsibilities first.');

    const prompt = `
You are a career coach who specialises in achievement quantification for resumes.

For each bullet point from a ${jobTitle} at ${company}, do the following:
- Determine if it already contains a quantifiable metric (%, a number, $, timeframe, team size, etc.).
- If it does NOT have a metric, rewrite it to include one realistic, plausible metric based on typical industry standards for this role. Never invent an implausible number.
- If it already HAS a clear metric, return it unchanged and mark hasMetric as true.
- Keep rewrites under 25 words. Preserve the original action verb.
- Do not add commentary. Do not change facts.

Bullet points to analyse:
${bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}

Return ONLY a valid JSON array — no markdown fences, no explanation:
[
  { "original": "exact original text", "quantified": "improved version", "hasMetric": false }
]
`;
    const raw = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.55 });
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Could not parse AI response. Please try again.');

    const parsed = JSON.parse(match[0]) as Array<{ original: string; quantified: string; hasMetric: boolean }>;

    // Ensure count matches input
    const out = bullets.map((b, i) =>
        parsed[i] ?? { original: b, quantified: b, hasMetric: true }
    );
    return out;
};

export const generateEnhancedProjectDescription = async (projectName: string, currentDescription: string): Promise<string> => {
    const prompt = `
      You are a tech portfolio expert. Rewrite and enhance the provided project description into a single, concise, professional paragraph for a technical resume.

      **Instructions:**
      1. **Strict Adherence:** Describe ONLY the project provided. Do not invent features or technologies not implied by the description.
      2. **Structure:** Clearly state the project's purpose, the core technologies used, and the key features/outcomes.
      3. **Specificity:** Mention specific frameworks, languages, or tools.
      4. **Highlight Impact:** Briefly explain the problem solved or the project's main achievement.
      5. **Format:** Return ONLY a single, professional paragraph.

      **Input:**
      - Project Name: '${projectName}'
      - Current Description: "${currentDescription}"
    `;
    return groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5 });
};

export const generateScholarshipEssay = async (params: {
    profile: UserProfile;
    essayType: string;
    essayLabel: string;
    scholarshipDescription: string;
    additionalContext: string;
    wordCount: number;
    promptHint: string;
}): Promise<string> => {
    const prompt = `
        You are an elite academic consultant and scholarship writer with a 95% success rate for international grants (Commonwealth, Chevening, Fulbright, ERASMUS+, NIH/NSF).
        
        ### YOUR GOAL
        Write a compelling, high-stakes ${params.essayLabel} for the following scholarship/program.
        The essay must be deeply personal, professionally authoritative, and perfectly aligned with the scholarship's values.

        ### INPUT DATA
        USER PROFILE (Your source for achievements and background):
        ${compactProfile(params.profile)}

        SCHOLARSHIP/PROGRAM DESCRIPTION:
        ${params.scholarshipDescription}

        ADDITIONAL PERSONAL CONTEXT:
        ${params.additionalContext || "None provided. Rely on the profile."}

        ### ESSAY GUIDELINES
        - **Format**: ${params.essayLabel}
        - **Target Word Count**: ${params.wordCount} words.
        - **Specific Instruction**: ${params.promptHint}
        - **Tone**: Academic yet personal. Enthusiastic but humble. Visionary yet grounded in past achievements.
        - **Structure**: 
            1. **Hook**: Start with a powerful opening that captures attention immediately.
            2. **The Bridge**: Connect the user's past experiences to why they need this specific scholarship.
            3. **The Impact**: Clearly state what the user will do with the knowledge/funding and the broader impact it will have.
            4. **Conclusion**: A strong closing statement that leaves a lasting impression.

        ${SYSTEM_INSTRUCTION_HUMANIZER}

        Return ONLY the text of the essay. No titles, no intro text, no placeholders like "[Your Name]".
    `;

    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.8, maxTokens: 4096 });
};

// ─── CV Checker: Score CV against JD ──────────────────────────────────────────

export interface CVCheckResult {
    overallScore: number;
    atsScore: number;
    strengths: string[];
    weaknesses: string[];
    missingKeywords: string[];
    matchedKeywords: string[];
    suggestions: string[];
    summary: string;
}

export const checkCVAgainstJob = async (
    profile: UserProfile,
    jobDescription: string
): Promise<CVCheckResult> => {
    const profileText = JSON.stringify(profile, null, 2).substring(0, 2000);
    const prompt = `
        You are an elite CV reviewer and ATS expert. Analyze this CV against the job description.

        ### CV DATA
        ${profileText}

        ### JOB DESCRIPTION
        ${jobDescription.substring(0, 1500)}

        ### ANALYSIS INSTRUCTIONS
        1. **overallScore** (0-100): How well does this CV match the JD?
        2. **atsScore** (0-100): How likely is this CV to pass ATS screening?
        3. **strengths** (3-5 items): What the CV does well relative to this JD.
        4. **weaknesses** (3-5 items): Critical gaps, mismatches, or problems.
        5. **missingKeywords** (5-15 items): Important keywords/skills from the JD that are NOT in the CV.
        6. **matchedKeywords** (5-15 items): Keywords/skills that appear in BOTH the CV and JD.
        7. **suggestions** (3-6 items): Specific, actionable suggestions to improve the CV for this role.
        8. **summary** (2-3 sentences): Overall assessment in plain language.

        Be brutally honest. A 100 score should be near-impossible. Most CVs score 40-70.

        Return ONLY a JSON object with this structure:
        {
          "overallScore": number,
          "atsScore": number,
          "strengths": ["string"],
          "weaknesses": ["string"],
          "missingKeywords": ["string"],
          "matchedKeywords": ["string"],
          "suggestions": ["string"],
          "summary": "string"
        }
    `;

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.2, json: true, maxTokens: 1024 });
    return JSON.parse(text.trim());
};

// ─── LinkedIn Profile Generator ──────────────────────────────────────────────

export interface LinkedInProfileResult {
    headline: string;
    about: string;
    summaryBullets: string[];
    skills: string[];
    featuredPost: string;
    connectionMessage: string;
    profileTips: string[];
}

export const generateLinkedInProfile = async (
    profile: UserProfile,
    targetRole?: string
): Promise<LinkedInProfileResult> => {
    const roleContext = targetRole ? `Target role/industry: ${targetRole}` : '';
    const prompt = `
You are an elite LinkedIn profile writer and personal branding strategist who has helped thousands of professionals land jobs at Google, Amazon, McKinsey, and top startups. You write profiles that get 10x more recruiter messages.

CANDIDATE PROFILE:
${compactProfile(profile)}
${roleContext}

Generate a complete, world-class LinkedIn profile package. Everything must sound like a real, accomplished human wrote it — NOT a template. Be specific, use real details from the profile.

Return ONLY a JSON object:
{
  "headline": "string (120 chars max — NOT just job title. Formula: [What you do] | [Who you help] | [Key achievement or USP]. Make it irresistible to click. Include 2-3 JD keywords if target role provided. NEVER just 'Software Engineer at Company'.)",
  "about": "string (2,000 chars max — the 'About' section. Structure: Hook sentence (fascinating fact or bold claim about them, 1-2 sentences). Core value prop (what they do and who they do it for, 2 sentences). Career highlight reel (3-4 specific achievements with numbers from their profile). Current focus (what they are working on and excited about, 1-2 sentences). Call to action (how to reach them and what for). Write in first person. Vary sentence length — mix punchy 5-word sentences with longer elaborative ones. NO AI clichés: no 'passionate', 'leverage', 'synergy', 'results-driven', 'dynamic', 'innovative'.)",
  "summaryBullets": ["string array of 5 achievement bullets for the 'Featured' bullet summary style — each under 150 chars, starts with an emoji, has a metric"],
  "skills": ["string array of 20 LinkedIn skills to add — ordered by endorsability and searchability for their role"],
  "featuredPost": "string (a ready-to-post LinkedIn update, 150-200 words, announcing something impressive — a project, milestone, lesson learned. Professional but personal. Not 'excited to announce'. End with 3 relevant hashtags.)",
  "connectionMessage": "string (a 300-char LinkedIn connection request message template — warm, specific, not salesy. Use [NAME] as placeholder.)",
  "profileTips": ["string array of 5 specific, actionable tips to improve their LinkedIn presence based on their actual profile gaps — be specific about what to add/change"]
}
`;
    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, json: true, maxTokens: 3000 });
    return JSON.parse(text.trim()) as LinkedInProfileResult;
};

// ─── Thank-You Letter Generator ───────────────────────────────────────────────

export const generateThankYouLetter = async (
    profile: UserProfile,
    jobDescription: string,
    interviewerName?: string,
    interviewType?: string
): Promise<string> => {
    const interviewer = interviewerName?.trim() || 'the hiring team';
    const type = interviewType || 'interview';
    const name = profile.personalInfo?.name || 'Candidate';

    const prompt = `
You are a top executive career coach. Write a compelling, human-sounding post-${type} thank-you letter that stands out and reinforces the candidate's candidacy.

CANDIDATE NAME: ${name}
INTERVIEWER: ${interviewer}

CANDIDATE PROFILE:
${compactProfile(profile)}

JOB DESCRIPTION:
${jobDescription.substring(0, 1500)}

STRICT INSTRUCTIONS:
1. Start DIRECTLY with "Dear ${interviewer}," — no header block.
2. Opening (1 sentence): Thank them warmly and reference something specific from the ${type}.
3. Reinforcement paragraph: Tie one specific thing discussed to a concrete achievement from the profile. Show you were listening and thinking.
4. Value-add paragraph: Briefly mention one additional reason you are the right fit that didn't come up, or expand on something that was covered too briefly.
5. Closing (1 sentence): Express genuine enthusiasm, confirm interest, offer next steps.
6. Sign-off: "Warm regards," then the candidate's name on the next line: ${name}
7. Length: 180-250 words. Concise, human, specific.
8. Tone: Professional, warm, confident. NOT generic or gushing.
9. NO AI clichés: no "excited", "thrilled", "leverage", "passionate".
10. Return ONLY the letter text. No commentary.
`;
    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.7 });
};

// ─── Smart Cover Letter: JD + Company Research ───────────────────────────────

export const generateSmartCoverLetter = async (
    profile: UserProfile,
    jobDescription: string,
    companyResearch: string = ''
): Promise<string> => {
    const companySection = companyResearch
        ? `\n### COMPANY RESEARCH (use this to show you know the company)\n${companyResearch}\n`
        : '';

    const prompt = `
        You are a world-class career coach writing a WINNING cover letter.

        ### CV DATA
        ${compactProfile(profile)}

        ### JOB DESCRIPTION
        ${jobDescription}
        ${companySection}
        ### COVER LETTER INSTRUCTIONS
        1. **Opening**: Name the exact role. If company research is available, mention something specific about the company (recent news, values, product) that excites you.
        2. **Body (2-3 paragraphs)**:
           - Match your 2-3 strongest experiences to the JD's top requirements.
           - Use STAR method briefly (Situation, Task, Action, Result) for at least one example.
           - Include specific metrics/numbers from your CV where possible.
           - If company research is available, connect your values/experience to the company's mission/culture.
        3. **Closing**: Confident call-to-action. Express genuine enthusiasm.
        4. **Tone**: Professional, warm, confident — NOT generic or sycophantic.
        5. **Length**: 250-350 words. Concise is king.
        6. **Format**: Plain text with proper letter formatting. Address to "Dear Hiring Manager" unless a name is known.

        CRITICAL: This letter must feel unique to THIS job at THIS company. No generic templates.
        Return ONLY the cover letter text. No commentary.
    `;

    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.7 });
};

// ─── Paraphrase: Rewrite text in different tones ──────────────────────────────

export type ParaphraseTone = 'professional' | 'concise' | 'creative' | 'ats-friendly';

export const paraphraseText = async (
    text: string,
    tone: ParaphraseTone = 'professional',
    context: string = ''
): Promise<string> => {
    const toneInstructions: Record<ParaphraseTone, string> = {
        professional: 'Rewrite in a polished, professional tone suitable for a senior executive. Use strong action verbs, quantify achievements where possible, and maintain formal language.',
        concise: 'Rewrite to be as concise as possible. Cut filler words, reduce length by 30-40%, but preserve ALL key information and impact. Each bullet should be one powerful line.',
        creative: 'Rewrite with more engaging, dynamic language. Use vivid descriptions and compelling narrative while staying professional. Make it memorable.',
        'ats-friendly': 'Rewrite to maximize ATS (Applicant Tracking System) compatibility. Use standard industry keywords, avoid creative formatting, use common section headers, and include relevant buzzwords naturally. Keep it keyword-rich but human-readable.',
    };

    const prompt = `
        ${toneInstructions[tone]}

        ${context ? `CONTEXT (job description this text is being tailored for):\n${context}\n` : ''}

        TEXT TO REWRITE:
        ${text}

        RULES:
        - Preserve ALL factual details: dates, numbers, company names, job titles, metrics.
        - Return ONLY the rewritten text, no commentary or explanation.
        - Maintain the same general structure (if it's bullets, return bullets; if paragraphs, return paragraphs).
    `;

    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: tone === 'ats-friendly' ? 0.3 : 0.7 });
};

// ── CV Score / Match Analysis ─────────────────────────────────────────────────
export interface CVScore {
    overall: number;
    ats: number;
    impact: number;
    relevance: number;
    clarity: number;
    missingKeywords: string[];
    strengths: string[];
    improvements: string[];
    verdict: string;
}

export const scoreCV = async (cvData: CVData, jobDescription: string): Promise<CVScore> => {
    const cvText = [
        cvData.summary,
        ...cvData.experience.flatMap(e => [e.jobTitle, e.company, ...e.responsibilities]),
        ...cvData.skills,
        ...cvData.education.map(e => `${e.degree} ${e.school}`),
        ...(cvData.projects || []).map(p => p.description),
    ].join(' ').substring(0, 2000);

    const prompt = `
You are an expert ATS system and senior hiring manager scoring a CV against a job description.

CV TEXT:
${cvText}

JOB DESCRIPTION:
${jobDescription.substring(0, 1200)}

Scoring rubric:
- "ats" (0-100): How many of the JD's key terms/phrases appear in the CV?
- "impact" (0-100): What % of bullet points have a quantified result?
- "relevance" (0-100): How closely does the candidate's experience/skills match the role requirements?
- "clarity" (0-100): Is the writing concise, free of clichés, and easy to skim?
- "overall" (0-100): Weighted average — ats×0.35 + impact×0.25 + relevance×0.30 + clarity×0.10.
- "missingKeywords": List up to 8 important JD keywords/phrases NOT found in the CV.
- "strengths": Exactly 2 specific things this CV does well.
- "improvements": Exactly 3 specific, immediately actionable fixes.
- "verdict": One punchy sentence a recruiter would say about this CV.

Return ONLY a JSON object:
{
  "overall": number,
  "ats": number,
  "impact": number,
  "relevance": number,
  "clarity": number,
  "missingKeywords": ["string"],
  "strengths": ["string"],
  "improvements": ["string"],
  "verdict": "string"
}
`;

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.2, json: true, maxTokens: 512 });
    return JSON.parse(text.trim()) as CVScore;
};

// --- AI CV Improvement ---
export const improveCV = async (
    cvData: CVData,
    personalInfo: PersonalInfo,
    instruction: string,
    jobDescription?: string,
): Promise<CVData> => {
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
2. Keep all factual details accurate — don't change company names, job titles, dates, or invent new roles.
3. Return the COMPLETE CVData object with ALL fields, not just the modified parts.
4. Every bullet must follow "Strong Verb → Scope → Quantified Result".
5. Avoid AI clichés. Write like a confident, experienced professional.

${CV_DATA_SCHEMA}
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.4, json: true });
    return JSON.parse(text.trim()) as CVData;
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
    profile: UserProfile,
    githubUsername: string,
    jobDescription?: string
): Promise<CVData> => {
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
    return JSON.parse(text.trim()) as CVData;
};

// --- Enhanced 6-Block Job Analysis (career-ops inspired) ---
export const analyzeJobEnhanced = async (
    jobDescription: string,
    cvText: string,
): Promise<EnhancedJobAnalysis> => {
    const prompt = `
You are an expert career strategist. Analyze the job description against the candidate's CV and return a comprehensive 6-block evaluation.

JOB DESCRIPTION:
${jobDescription.substring(0, 3000)}

CANDIDATE CV TEXT:
${cvText.substring(0, 3000)}

Return ONLY a valid JSON object matching this exact schema:
{
  "companyName": "string (company name or 'Unknown')",
  "jobTitle": "string (role title)",
  "archetype": "one of: Full-Stack / Dev Engineer | Solutions Architect | Product Manager | LLMOps / MLOps | Agentic AI | Digital Transformation | Data Scientist | DevOps / Platform | General Engineering | Other",
  "domain": "string (e.g. 'Cloud Infrastructure', 'AI/ML', 'FinTech')",
  "seniority": "string (e.g. 'Senior', 'Mid-level', 'Lead', 'Principal')",
  "remote": "Remote | Hybrid | On-site | Unknown",
  "tldr": "string (1-sentence role summary)",
  "matchedRequirements": ["string array of JD requirements the candidate clearly meets based on CV"],
  "gaps": [
    {
      "requirement": "string (JD requirement not clearly met)",
      "isBlocker": true or false,
      "mitigation": "string (specific actionable advice to address this gap in cover letter or interview)"
    }
  ],
  "matchScore": number (0-100, objective match percentage),
  "grade": "A | B | C | D | F",
  "levelStrategy": "string (2-3 sentences on how candidate should position their seniority for this role)",
  "seniorPositioningTips": ["string array of 3-4 specific phrases or framings to appear more senior"],
  "salaryRange": "string (estimated salary range for this role and location, e.g. '$120k–$160k USD')",
  "salaryNotes": "string (brief note on comp expectations, negotiation angle, or data confidence)",
  "personalizationChanges": [
    {
      "section": "string (CV section: Summary | Skills | Experience | Projects)",
      "currentState": "string (brief description of current state)",
      "proposedChange": "string (specific change to make)",
      "reason": "string (why this change helps)"
    }
  ],
  "topKeywords": ["string array of 10-15 ATS keywords to inject into the CV from the JD"],
  "starStories": [
    {
      "jobRequirement": "string (JD requirement this story addresses)",
      "linkedCompany": "string (company from CV this story is from, or '')",
      "linkedRole": "string (role from CV, or '')",
      "situation": "string (S in STAR+R - context)",
      "task": "string (T - challenge or responsibility)",
      "action": "string (A - specific steps taken)",
      "result": "string (R - measurable outcome)",
      "reflection": "string (Reflection - lesson learned or what would be done differently — this signals seniority)"
    }
  ]
}

GRADING RULES (matchScore → grade):
- 85-100: A (Excellent fit)
- 70-84: B (Good fit)
- 55-69: C (Moderate fit, significant tailoring needed)
- 40-54: D (Weak fit, major gaps)
- 0-39: F (Poor fit)

ETHICAL RULES:
- Only reference experience actually present in the CV
- Never invent skills or achievements
- Keyword injection means reformulating real experience with JD vocabulary — not fabricating
- STAR stories must be grounded in CV experience

Return ONLY the JSON. No markdown, no prose.
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.3, json: true, maxTokens: 8192 });
    return JSON.parse(text.trim()) as EnhancedJobAnalysis;
};
