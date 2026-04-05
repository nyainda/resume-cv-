import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { UserProfile, CVData, PersonalInfo, JobAnalysisResult, CVGenerationMode, ScholarshipFormat } from '../types';
import { groqChat, GROQ_LARGE, GROQ_FAST } from './groqService';

// --- System-Level Constants for AI Control ---
const SYSTEM_INSTRUCTION_PROFESSIONAL = `
You are the world's foremost CV strategist — a fusion of elite executive recruiter, Fortune 500 hiring manager, and award-winning resume writer with 25+ years of experience.

Your CVs achieve:
  • 95%+ ATS pass rates across Greenhouse, Lever, Workday, Taleo, iCIMS, and SAP SuccessFactors
  • Sub-6-second recruiter hook (the proven average scan time before a decision is made)
  • Interview call rates 3× the industry average
  • First-page Google ranking for candidate names

Your non-negotiable rules:
  1. EVERY bullet follows "Strong Verb → Specific Scope → Quantified Result" — no exceptions.
  2. MIRROR the exact language of the job description. If the JD says "cross-functional collaboration," use those words.
  3. KEYWORD DENSITY: The top 10 JD keywords must each appear at least twice across the document.
  4. NEVER use: "responsible for", "helped", "assisted", "worked on", "was part of", "participated in".
  5. NEVER use AI clichés: "delve", "robust", "seamlessly", "synergy", "cutting-edge", "leverage" (use sparingly), "in today's fast-paced world", "passionate about".
  6. QUANTIFY everything. Use real, research-backed baseline figures for the industry and role level. NEVER prefix numbers with "~". Use natural ranges (e.g., "by 35%", "across 200+ users", "saving 8 hours/week"). If no specific number is available, use scope-based language: team size, revenue impacted, users served, or time saved — never invented percentages.
  7. Each bullet must stand alone as proof of impact — a mini case study in one sentence.
  8. The summary must make a hiring manager say "I need to meet this person."
  9. Skills list: put the EXACT tools/technologies named in the JD first.
  10. Education descriptions highlight GPA (if ≥3.5), thesis, honors, or relevant coursework.

Output ONLY valid JSON or plain text matching the requested schema. NEVER include markdown, code fences, or prose outside the schema.
`;

const SYSTEM_INSTRUCTION_PARSER = `
You are an expert data parser. Convert unstructured text into accurate JSON. 
Standardize dates. Never invent data unless instructed.
When returning JSON, output ONLY the raw JSON object — no markdown fences, no commentary.
`;

const SYSTEM_INSTRUCTION_HUMANIZER = `
You are a professional human editor. Your job is to rewrite text so it sounds exactly like it was written by a skilled, experienced human professional — never by an AI.

Critical rules:
- Use VARIED sentence lengths. Mix short punchy sentences with longer descriptive ones.
- Avoid AI clichés: never say "delve", "leverage" (sparingly), "utilize", "synergy", "robust", "seamlessly", "cutting-edge", "state-of-the-art", "in today's world", "it's worth noting".
- Use SPECIFIC, concrete details instead of vague generalizations.
- Use natural, direct language. Write like a confident human, not a formal report.
- Vary your action verbs — don't repeat the same verb twice in a document.
- For CVs: every bullet point should feel like it was lived, not templated.
- Never use rhetorical questions.
- Preserve ALL factual details, dates, numbers, company names, and job titles exactly.
- Return the rewritten text only. No commentary.
`;

// --- Gemini Client (multimodal only — PDF/image parsing) ---
function getGeminiClient(): GoogleGenAI {
    let apiKey: string | undefined;

    const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
    if (settingsString) {
        try {
            const settings = JSON.parse(settingsString);
            if (settings.apiKey) {
                apiKey = settings.apiKey.replace(/^"|"$/g, '');
            }
        } catch { /* ignore */ }
    }

    if (!apiKey) {
        try {
            const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
            if (providerKeys.gemini) {
                apiKey = providerKeys.gemini.replace(/^"|"$/g, '');
            }
        } catch { /* ignore */ }
    }

    if (!apiKey && typeof process !== 'undefined' && process.env.GEMINI_API_KEY) {
        apiKey = process.env.GEMINI_API_KEY;
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
    scholarshipFormat: ScholarshipFormat = 'standard'
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

    const humanizationInstruction = `
    **CRITICAL — AUTHENTIC HUMAN WRITING**:
    Write as if a top-performing senior professional personally crafted every word. Recruiters and AI detectors must believe a human wrote this.
    - Sentence rhythm: mix short punchy statements with longer elaborative ones. Never uniform length.
    - BANNED words/phrases: "delve", "robust", "seamlessly", "synergy", "leverage" (use max once), "cutting-edge", "state-of-the-art", "passionate", "in today's fast-paced world", "it is worth noting", "navigate", "landscape", "groundbreaking".
    - Be hyper-specific: replace "improved efficiency" with "cut report generation time from 4 hours to 23 minutes".
    - Action verb variety: every bullet uses a DIFFERENT verb. Use: Spearheaded, Engineered, Orchestrated, Accelerated, Restructured, Championed, Negotiated, Overhauled, Forged, Propelled, Slashed, Tripled, Automated, Mentored, Secured, Delivered.
    - Numbers make it real: every bullet that can have a metric, must have one.
    - Zero filler phrases: remove "in order to", "as well as", "a variety of", "various", "etc".
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
            ${JSON.stringify(profile, null, 2)}
            ${githubInstruction}

            === INSTRUCTIONS ===

            1. **SUMMARY — Versatile Value Proposition (3 sentences)**:
               - Sentence 1: WHO they are, their seniority and domain.
               - Sentence 2: Their standout achievement or strongest differentiator.
               - Sentence 3: What kind of impact they create and industries they fit.

            2. **EXPERIENCE — Showcase Full Breadth**:
               - Transform every bullet into a high-impact achievement: [Verb] + [What you did] + [Measurable result].
               - Show range: technical skills, leadership, collaboration, delivery.
               - NEVER start bullets with: "Responsible for", "Helped", "Worked on".
               - Bullet counts per role:
               ${experienceInstruction}

            3. **SKILLS** — 15 skills covering: core domain expertise + technical tools + transferable skills.

            4. **PROJECTS** — Frame each as: [Problem solved] → [Solution] → [Outcome/impact].

            ${humanizationInstruction}

            ${CV_DATA_SCHEMA}
        `;
    } else if (purpose === 'academic') {
        const scholarshipFormatInstruction = buildScholarshipFormatInstruction(scholarshipFormat);
        mainPromptInstruction = `
            You are the world's leading academic CV specialist. Create an outstanding academic CV optimized for scholarly excellence.

            USER PROFILE:
            ${JSON.stringify(profile, null, 2)}
            ${githubInstruction}

            GRANT/SCHOLARSHIP/ACADEMIC PURPOSE:
            ${contextDescription || 'General academic application'}

            ${scholarshipFormatInstruction}
            ${keywordInstruction}

            === ACADEMIC CV STRATEGY ===

            ① RESEARCH/ACADEMIC SUMMARY (3-4 sentences):
               - Sentence 1: Research identity and seniority level.
               - Sentence 2: Core research area, key methodologies.
               - Sentence 3: Most significant publication, project, or academic contribution.
               - Sentence 4: Future research vision or academic trajectory.

            ② EXPERIENCE — Scholarly Impact Focus:
               - Every bullet: [Research Verb] + [Methodology/Scope] + [Academic Impact/Output].
               - Example verbs: Investigated, Published, Presented, Supervised, Designed (study), Analyzed, Collaborated, Secured (grant), Implemented.
               - Bullet counts per role:
               ${experienceInstruction}

            ③ SKILLS (15 total):
               - Research methods first (quantitative, qualitative, specific software like R/SPSS/NVivo).
               - Then domain expertise.
               - Then academic tools and languages.

            ④ EDUCATION — Highlight Academic Excellence:
               - GPA if ≥ 3.5 / First Class Honours / Distinction.
               - Thesis title and 1-sentence description of contribution.
               - Key relevant courses (max 3).

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
            You are the world's greatest CV strategist. Generate the highest-performing CV possible for this specific job opportunity.

            USER PROFILE:
            ${JSON.stringify(profile, null, 2)}
            ${githubInstruction}

            JOB DESCRIPTION / TARGET CONTEXT:
            ${contextDescription}

            ${keywordInstruction}

            ${modeInstruction}

            === CV GENERATION STRATEGY ===

            ① PROFESSIONAL SUMMARY (3 sentences — THE most important section):
               - Sentence 1: Exact job title match + years of experience + domain.
               - Sentence 2: Your #1 achievement that directly addresses the JD's top requirement.
               - Sentence 3: A forward-looking statement about the specific value you bring to THIS role.
               - MUST include 2+ keywords from the JD.

            ② EXPERIENCE — Every bullet is a proof point:
               • Format: [Power Verb] + [Specific Action] + [Quantified Result that matches JD priority].
               • Metric requirement: if the user gave no exact number, use believable industry-appropriate figures (team size, user count, time saved, revenue range). NEVER use "~" prefix — write it as a natural fact.
               • Forbidden openers: "Responsible for" / "Helped" / "Assisted" / "Worked on" / "Was part of".
               • Mirror JD language word-for-word where possible (exact phrase matching crushes ATS).
               ${experienceInstruction}

            ③ SKILLS (EXACTLY 15 — ordered by JD priority):
               • Position 1–5: Exact tools/technologies named in the JD.
               • Position 6–10: Core technical/domain skills.
               • Position 11–15: Complementary and soft skills that complete the picture.
               • Include EVERY must-include keyword that fits as a skill.

            ④ EDUCATION:
               • 'description': 1 sentence. Mention GPA if ≥3.5, thesis topic, honors, or 2–3 directly relevant courses.

            ⑤ PROJECTS — Impact Snapshots:
               • Format: [Problem] → [Solution using named technologies] → [Measurable outcome].
               • Link to GitHub/demo if the user provided a GitHub URL.

            ${humanizationInstruction}

            ${CV_DATA_SCHEMA}
        `;
    }

    const temperature = purpose === 'academic' ? 0.5 :
        generationMode === 'honest' ? 0.5 :
            generationMode === 'boosted' ? 0.65 : 0.75;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, mainPromptInstruction, { temperature, json: true, maxTokens: 8192 });
    const cvData: CVData = JSON.parse(text.trim());

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
        ${JSON.stringify(profile, null, 2)}

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

export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    const prompt = `
        Analyze the following job description with the goal of strategic resume tailoring. 
        1. Extract the top 10 most important technical keywords (specific technologies, tools, platforms, methodologies like Agile).
        2. Extract the top 10 essential soft skills and non-technical abilities (communication, leadership, business acumen).
        3. Identify the name of the Company or Organization hiring. If it is not explicitly stated, return "Unknown".
        4. Identify the specific Job Title or Position being advertised. If it's not clear, return "General Application".

        JOB DESCRIPTION:
        ${jobDescription}

        Return ONLY a JSON object with this structure:
        {
          "keywords": ["string"],
          "skills": ["string"],
          "companyName": "string",
          "jobTitle": "string"
        }
    `;

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true });
    return JSON.parse(text.trim());
};

export const generateEnhancedSummary = async (profile: UserProfile): Promise<string> => {
    const prompt = `
      You are a professional career coach. Based STRICTLY on the provided user profile, write a concise and powerful professional summary (2-4 sentences) that highlights their key strengths and experience.
      
      **CRITICAL:** Do NOT invent skills, experiences, or achievements not present in the profile. If the profile is sparse, write a strong summary based ONLY on what is there.
      Return only the summary text.
      USER PROFILE:
      ${JSON.stringify(profile, null, 2)}
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
        ${JSON.stringify(params.profile, null, 2)}

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
    const prompt = `
        You are an elite CV reviewer and ATS expert. Analyze this CV against the job description.

        ### CV DATA
        ${JSON.stringify(profile, null, 2)}

        ### JOB DESCRIPTION
        ${jobDescription}

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

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.2, json: true });
    return JSON.parse(text.trim());
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
        ${JSON.stringify(profile, null, 2)}

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
    ].join(' ');

    const prompt = `
You are an expert ATS system and senior hiring manager scoring a CV against a job description.

CV TEXT:
${cvText}

JOB DESCRIPTION:
${jobDescription}

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

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.2, json: true });
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
${JSON.stringify(profile, null, 2)}
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
