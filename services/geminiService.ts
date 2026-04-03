import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { UserProfile, CVData, PersonalInfo, JobAnalysisResult, ApiSettings, CVGenerationMode, ScholarshipFormat } from '../types';

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
`;

// --- Humanization System Instruction ---
// This makes all outputs sound like they were written by a human professional,
// NOT by an AI. Avoids patterns that AI detectors flag.
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

// --- API Client Setup with Multi-Model Support ---
function getAiClient(modelPreference: 'flash' | 'lite' | 'ultra-lite' = 'lite'): GoogleGenAI {
    let apiKey: string | undefined;
    const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
    if (settingsString) {
        const settings: ApiSettings = JSON.parse(settingsString);
        if (settings.apiKey && settings.provider === 'gemini') {
            apiKey = settings.apiKey.replace(/^"|"$/g, '');
        } else if (settings.provider !== 'gemini') {
            throw new Error(`The selected provider '${settings.provider}' is not supported. Use 'gemini'.`);
        }
    }
    if (!apiKey && typeof process !== 'undefined' && process.env.GEMINI_API_KEY) {
        apiKey = process.env.GEMINI_API_KEY;
    }
    if (!apiKey) throw new Error("API key not found.");
    return new GoogleGenAI({ apiKey });
}

// --- Retry Logic ---
async function retryOperation<T>(operation: () => Promise<T>, retries = 4, delayMs = 1500): Promise<T> {
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
            return retryOperation(operation, retries - 1, delayMs * 2);
        }
        throw error;
    }
}

// --- User Profile Schema ---
const userProfileSchema = {
    type: Type.OBJECT,
    properties: {
        personalInfo: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                email: { type: Type.STRING },
                phone: { type: Type.STRING },
                location: { type: Type.STRING },
                linkedin: { type: Type.STRING },
                website: { type: Type.STRING },
                github: { type: Type.STRING },
            },
            required: ["name", "email"]
        },
        summary: { type: Type.STRING },
        workExperience: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    company: { type: Type.STRING },
                    jobTitle: { type: Type.STRING },
                    startDate: { type: Type.STRING },
                    endDate: { type: Type.STRING },
                    responsibilities: { type: Type.STRING },
                },
                required: ["id", "company", "jobTitle", "startDate", "responsibilities"]
            }
        },
        education: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    degree: { type: Type.STRING },
                    school: { type: Type.STRING },
                    graduationYear: { type: Type.STRING },
                },
                required: ["id", "degree", "school"]
            }
        },
        skills: { type: Type.ARRAY, items: { type: Type.STRING } },
        projects: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    link: { type: Type.STRING },
                },
                required: ["id", "name", "description"]
            }
        },
        languages: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    proficiency: { type: Type.STRING },
                },
                required: ["id", "name", "proficiency"]
            }
        }
    },
    required: ["personalInfo", "summary", "workExperience", "education", "skills"]
};

// --- Core Generation Functions Improvements ---

// --- Humanize a block of plain text to remove AI patterns ---
export const humanizeText = async (text: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `Rewrite the following professional text so it sounds naturally human-written. Preserve all facts, dates, names, and numbers. Only change phrasing and style.\n\nTEXT TO REWRITE:\n${text}`;
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: { temperature: 0.8, systemInstruction: SYSTEM_INSTRUCTION_HUMANIZER }
    }));
    return response.text || text;
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
        default: // 'standard'
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
    const ai = getAiClient();

    let githubInstruction = '';
    if (githubUrl) {
        // IMPROVEMENT: Made GitHub instructions more specific and actionable for the AI.
        githubInstruction = `
        **GitHub Deep Analysis (CRITICAL)**: The user has provided a GitHub profile: ${githubUrl}. You must analyze the public data that would be available from this URL (e.g., repository names, primary languages, commit history insights) to significantly enrich the profile.
        - **Project Population**: Populate the 'projects' array with the *top 5 most impressive* public repositories.
        - **Project Details**: For each, use the repo name for 'name', generate a **concise, high-impact 'description'** detailing its function, and generate a valid repository 'link'.
        - **Skill Extraction**: Add ALL key programming languages, frameworks, and technical tools discovered from the repositories to the main 'skills' list.
        - **Profile Completion**: Infer missing personal details (like name, location, summary) from the GitHub profile if not present in the RAW TEXT.
        `;
    }

    // IMPROVEMENT: Added a strong system instruction for better control.
    const prompt = `
        Your goal is to perform a comprehensive data merge. Prioritize explicit data from the RAW TEXT, and use the GitHub profile to fill gaps, validate data, and significantly enhance the 'skills' and 'projects' sections.

        ### SOURCE DATA
        RAW TEXT:
        ${rawText || 'No raw text provided. Rely entirely on GitHub analysis.'}
        
        ${githubInstruction}

        ### INSTRUCTIONS FOR JSON CONSTRUCTION
        1. Date Standardization: Accurately parse all dates. Standardize all dates to 'YYYY-MM-DD'. Use the first day of the month/year if a full date is missing. 'endDate' for current roles must be the string 'Present'.
        2. Unique IDs: Generate a unique, simple string 'id' (e.g., a timestamp) for all array items (workExperience, education, projects, languages).
        3. Work Experience: Maintain the original 'responsibilities' text structure (use \\n for bullet points).
        4. Output: Return ONLY the JSON object that strictly adheres to the schema.
    `;

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-lite', // Flash is fast and good at parsing
        config: {
            responseMimeType: 'application/json',
            responseSchema: userProfileSchema,
            temperature: 0.1, // Lower temperature for deterministic parsing
            systemInstruction: SYSTEM_INSTRUCTION_PARSER, // Use the PARSER persona
        },
        contents: prompt,
    }));

    const text = (response.text || "").trim();
    const profileData: UserProfile = JSON.parse(text);
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
    const ai = getAiClient();

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

    // ... (Schema definitions are unchanged for brevity) ...
    let mainPromptInstruction: string;
    let cvDataSchema: any;
    let githubInstruction = '';

    if (profile.personalInfo.github) {
        // IMPROVEMENT: Emphasize the GitHub enrichment
        githubInstruction = `IMPORTANT: The user has provided a GitHub profile: ${profile.personalInfo.github}. Leverage this to validate and enrich the technical depth of the skills and projects sections.`;
    }

    // ... (base schemas defined here) ...
    const baseExperienceItems = {
        type: Type.OBJECT,
        properties: {
            company: { type: Type.STRING },
            jobTitle: { type: Type.STRING },
            dates: { type: Type.STRING, description: "e.g., 'Jan 2020 - Present'" },
            startDate: { type: Type.STRING, description: "The start date in YYYY-MM-DD format. Required for sorting." },
            endDate: { type: Type.STRING, description: "The end date in YYYY-MM-DD format, or the string 'Present'. Required for sorting." },
            responsibilities: {
                type: Type.ARRAY,
                description: "Bullet points of key achievements and responsibilities, tailored to the context description. Exact count is specified per-entry in the prompt.",
                items: { type: Type.STRING }
            }
        },
        required: ["company", "jobTitle", "dates", "startDate", "endDate", "responsibilities"]
    };

    const baseProjectItems = {
        type: Type.OBJECT,
        properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            link: { type: Type.STRING, description: "A plausible URL for the project, e.g., a GitHub repo or live website." }
        },
        required: ["name", "description"]
    };

    const publicationSchema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            authors: { type: Type.ARRAY, items: { type: Type.STRING } },
            journal: { type: Type.STRING, description: "The conference or journal name." },
            year: { type: Type.STRING },
            link: { type: Type.STRING, description: "A plausible URL to the publication." }
        },
        required: ["title", "authors", "journal", "year"]
    };

    const baseSchemaProperties = {
        summary: {
            type: Type.STRING,
            description: "A professional summary or research statement tailored to the context description, 2-4 sentences long."
        },
        skills: {
            type: Type.ARRAY,
            description: "A list of exactly 15 of the most relevant skills for the application, prioritized by relevance to the JD if provided.",
            items: { type: Type.STRING }
        },
        education: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    degree: { type: Type.STRING },
                    school: { type: Type.STRING },
                    year: { type: Type.STRING, description: "Graduation year" },
                    description: { type: Type.STRING, description: "A brief, 1-2 sentence description of notable coursework or achievements." }
                },
                required: ["degree", "school", "year"]
            }
        },
        projects: { type: Type.ARRAY, items: baseProjectItems },
        languages: {
            type: Type.ARRAY,
            description: "A list of languages and the user's proficiency.",
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    proficiency: { type: Type.STRING }
                },
                required: ["name", "proficiency"]
            }
        },
    };

    // HUMANIZATION instruction injected into all prompts
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

    if (purpose === 'general') {
        // === GENERAL PURPOSE CV (no JD required) ===
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
               - Use 'startDate'/'endDate' in 'YYYY-MM-DD' format.
               - **BULLET COUNT PER ENTRY**: Generate EXACTLY the number of bullets specified for each role below:
               ${profile.workExperience.map(we => `  • ${we.jobTitle} at ${we.company}: EXACTLY ${we.pointCount ?? 5} bullet points`).join('\n')}

            3. **SKILLS**: Include EXACTLY 15 specific skills that represent the candidate's full toolkit and fit the target roles. Group logically but return as a flat list of 15 strings.

            4. **EDUCATION**: Add a 1-sentence description of relevant coursework or honors.

            5. **PROJECTS**: Problem solved + tech used + outcome.

            ${humanizationInstruction}

            Return ONLY valid JSON. No markdown. No extra text.
        `;
        cvDataSchema = {
            type: Type.OBJECT,
            properties: {
                ...baseSchemaProperties,
                experience: { type: Type.ARRAY, items: baseExperienceItems },
            },
            required: ["summary", "experience", "skills", "education"]
        };

    } else if (purpose === 'academic') {
        const formatInstruction = buildScholarshipFormatInstruction(scholarshipFormat);
        const scholarshipContext = contextDescription.trim()
            ? `GRANT/SCHOLARSHIP DESCRIPTION:\n${contextDescription}`
            : `No specific grant description provided. Create a strong, general-purpose academic CV that works for most scholarship and grant applications.`;

        mainPromptInstruction = `
            You are an expert academic CV writer specializing in scholarship and grant applications worldwide.
            Your task is to create a tailored, compelling academic CV.

            USER PROFILE: ${JSON.stringify(profile, null, 2)}
            ${scholarshipContext}
            ${githubInstruction}

            ${keywordInstruction}
            ${formatInstruction}

            === CORE INSTRUCTIONS ===
            1.  **Research Statement / Summary**: Follow the format-specific instruction above for the summary field.
            2.  **Experience**: Frame work experience to highlight research, teaching, academic leadership, and community contributions. Convert responsibilities into achievements with measurable impact.
               - **BULLET COUNT PER ENTRY**: Generate EXACTLY the number of bullets specified for each role:
               ${profile.workExperience.map(we => `  • ${we.jobTitle} at ${we.company}: EXACTLY ${we.pointCount ?? 5} bullet points`).join('\n')}
            3.  **Publications**: If the user has projects or experiences that could be framed as research outputs/publications, create plausible academic entries with full citations.
            4.  **Skills**: Focus on research methodologies, statistical tools, academic software, and domain expertise. Prioritize format-specific skills.
            5.  **Education**: Emphasize academic honors, GPA (if excellent), relevant coursework, and thesis/dissertation titles in the 'description' field.
            6.  **Projects**: Highlight projects that demonstrate research capabilities and real-world impact relevant to the scholarship goals.
            7.  **Languages**: For Europass format, include proficiency using CEFR levels.

            ${humanizationInstruction}

            Return ONLY the JSON object adhering to the schema.
        `;
        cvDataSchema = {
            type: Type.OBJECT,
            properties: {
                ...baseSchemaProperties,
                experience: { type: Type.ARRAY, items: baseExperienceItems },
                publications: { type: Type.ARRAY, description: "List of academic publications.", items: publicationSchema }
            },
            required: ["summary", "experience", "skills", "education"]
        };
    } else { // 'job' purpose
        // --- GENERATION MODE: Controls how much AI creativity is applied ---
        let experienceInstruction: string;

        // Compute the point count to use for AI-fabricated entries (use the max of the user's selections)
        const maxPointCount = Math.max(...profile.workExperience.map(we => we.pointCount ?? 5), 5);

        if (generationMode === 'honest') {
            experienceInstruction = `
            3.  **Experience — HONEST MODE (STRICT)**:
                - Use ONLY the work experience provided by the user. Do NOT invent, add, or imply any employers, job titles, or dates that are not in the user's profile.
                - REWRITE each bullet point to:
                  a) Start with a powerful action verb (e.g., Spearheaded, Orchestrated, Delivered, Accelerated)
                  b) Quantify achievements using concrete, believable metrics based on the role context. Use team size, user counts, revenue figures, time saved, or scope scale. NEVER use the "~" prefix. Use ranges like "by 30–40%" or scope language like "for a 50-person department" when exact numbers aren't provided.
                  c) Weave in JD keywords naturally — every bullet should feel directly relevant to the target role
                - The goal: make the user's REAL experience sound as impressive and relevant as possible. Polish, don't fabricate.
                - **BULLET COUNT PER ENTRY (STRICT)**: Generate EXACTLY the number of bullets specified for each role:
                ${profile.workExperience.map(we => `  • ${we.jobTitle} at ${we.company}: EXACTLY ${we.pointCount ?? 5} bullet points`).join('\n')}
            `;
        } else if (generationMode === 'boosted') {
            experienceInstruction = `
            3.  **Experience — BOOSTED MODE**:
                - FIRST: Rewrite all of the user's real experience using powerful action verbs, quantified achievements, and JD-aligned keywords.
                - THEN: Strategically craft EXACTLY 1 additional plausible experience entry to fill a gap or strengthen the candidacy:
                  • **Company**: Use a credible mid-sized company (regional tech firm, consultancy, agency) — NOT a verifiable giant like Google/Safaricom.
                  • **Role & Dates**: Must make logical career sense and NOT overlap with existing roles.
                  • **Content**: EXACTLY ${maxPointCount} bullet points directly targeting the JD's must-have requirements, featuring the "Must-Include Keywords".
                - **BULLET COUNT FOR REAL ENTRIES**: Generate EXACTLY the number of bullets specified for each real role:
                ${profile.workExperience.map(we => `  • ${we.jobTitle} at ${we.company}: EXACTLY ${we.pointCount ?? 5} bullet points`).join('\n')}
                - **BULLET COUNT FOR FABRICATED ENTRY**: EXACTLY ${maxPointCount} bullet points.
                - Ensure the added role feels like a natural fit in the career timeline.
            `;
        } else { // 'aggressive'
            experienceInstruction = `
            3.  **Experience — AGGRESSIVE MODE (MAXIMUM IMPACT)**:
                - FIRST: Completely transform ALL of the user's real experience entries — every bullet must be a high-impact achievement statement with strong action verbs and quantified metrics.
                - THEN: Craft 1-2 additional strategic experience entries designed to make the user THE ideal candidate:
                  • **Companies**: Use credible, mid-to-large companies the user would realistically have worked at (NOT directly verifiable household names).
                  • **Roles**: Position them as impressive stepping stones in the career trajectory.
                  • **Dates**: Ensure zero date overlaps with existing roles.
                  • **Content**: EXACTLY ${maxPointCount} bullet points each, packed with JD keywords, quantified results, and executive-level language.
                - **BULLET COUNT FOR REAL ENTRIES**: Generate EXACTLY the number of bullets specified for each real role:
                ${profile.workExperience.map(we => `  • ${we.jobTitle} at ${we.company}: EXACTLY ${we.pointCount ?? 5} bullet points`).join('\n')}
                - **BULLET COUNT FOR EACH FABRICATED ENTRY**: EXACTLY ${maxPointCount} bullet points.
                - The summary should position this candidate as the OBVIOUS first choice for the role.
            `;
        }


        mainPromptInstruction = `
            You are the world's top CV strategist. Your mission: make this candidate IMPOSSIBLE to ignore.
            Create a targeted CV that clears every ATS filter AND compels the hiring manager to call within 24 hours.

            USER PROFILE:
            ${JSON.stringify(profile, null, 2)}

            JOB DESCRIPTION:
            ${contextDescription}

            ${githubInstruction}
            ${keywordInstruction}

            ════════════════════════════════════════════
            ABSOLUTE RULES (violating any = failure):
            ════════════════════════════════════════════

            ① SUMMARY — "Hire Me in 3 Sentences" (STRICT 3-sentence structure):
               • S1: [Seniority] [Title] with [X years] of expertise in [core domain matching JD].
               • S2: Most impressive quantified achievement that directly mirrors the JD's top priority.
               • S3: Specific value-add for THIS company/role (use company name if in JD, else the role's key outcome).
               → Embed the top 5 JD keywords naturally. Zero fluff. Every word earns its place.

            ② EXPERIENCE — Proof of Greatness:
               • startDate / endDate: YYYY-MM-DD format only (endDate = "Present" if current).
               • EVERY bullet = [Power Verb] + [Specific What/How/Scale] + [Metric/Impact].
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

            Return ONLY the valid JSON object. No markdown. No commentary. No extra text.
        `;
        cvDataSchema = {
            type: Type.OBJECT,
            properties: {
                ...baseSchemaProperties,
                experience: { type: Type.ARRAY, items: baseExperienceItems },
            },
            required: ["summary", "experience", "skills", "education"]
        };
    }

    const temperature = purpose === 'academic' ? 0.5 :
        generationMode === 'honest' ? 0.5 :
            generationMode === 'boosted' ? 0.65 : 0.75;

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        config: {
            responseMimeType: 'application/json',
            responseSchema: cvDataSchema,
            temperature,
            systemInstruction: SYSTEM_INSTRUCTION_PROFESSIONAL,
        },
        contents: mainPromptInstruction,
    }));

    const cvData: CVData = JSON.parse((response.text || "").trim());

    // ... (sorting logic is excellent and kept as-is) ...
    cvData.experience.sort((a, b) => {
        const getEndDate = (dateStr: string) => {
            if (dateStr?.toLowerCase() === 'present') {
                return new Date(); // Treat 'Present' as today's date
            }
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? new Date(0) : date; // Fallback for invalid dates
        };

        const getStartDate = (dateStr: string) => {
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? new Date(0) : date;
        };

        const endDateA = getEndDate(a.endDate);
        const endDateB = getEndDate(b.endDate);

        if (endDateB.getTime() !== endDateA.getTime()) {
            return endDateB.getTime() - endDateA.getTime(); // Sort by end date descending
        }

        // If end dates are same, sort by start date descending
        const startDateA = getStartDate(a.startDate);
        const startDateB = getStartDate(b.startDate);
        return startDateB.getTime() - startDateA.getTime();
    });

    return cvData;
};

// --- Utility Functions Improvements ---

export const extractProfileTextFromFile = async (base64Data: string, mimeType: string): Promise<string> => {
    const ai = getAiClient();
    // IMPROVEMENT: Used a strong system instruction for purely deterministic extraction.
    const prompt = "This file is a resume, CV, or professional profile. Extract ALL text content from it. Return only the raw, complete text, preserving original line breaks and structure as much as possible. DO NOT add any commentary, summaries, or markdown formatting.";

    const filePart = {
        inlineData: {
            data: base64Data,
            mimeType: mimeType,
        },
    };

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: { parts: [filePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));
    return response.text || "";
};

export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const ai = getAiClient();
    // IMPROVEMENT: Used a strong system instruction for purely deterministic extraction.
    const prompt = "Analyze this image, which contains text (likely a job description). Extract ALL of the visible text. Return ONLY the raw text, with no additional commentary, summary, or formatting.";

    const imagePart = {
        inlineData: {
            data: base64Image,
            mimeType: mimeType,
        },
    };
    const textPart = { text: prompt };

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: { parts: [imagePart, textPart] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));

    return response.text || "";
};

export const generateCoverLetter = async (profile: UserProfile, jobDescription: string): Promise<string> => {
    const ai = getAiClient();
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

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        // IMPROVEMENT: Use PRO model for better creative writing and tone.
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.7, systemInstruction: SYSTEM_INSTRUCTION_PROFESSIONAL }
    }));
    return response.text || "";
};

export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    const ai = getAiClient();
    const prompt = `
        Analyze the following job description with the goal of strategic resume tailoring. 
        1. Extract the top 10 most important technical keywords (specific technologies, tools, platforms, methodologies like Agile).
        2. Extract the top 10 essential soft skills and non-technical abilities (communication, leadership, business acumen).
        3. Identify the name of the Company or Organization hiring. If it is not explicitly stated, return "Unknown".
        4. Identify the specific Job Title or Position being advertised. If it's not clear, return "General Application".

        JOB DESCRIPTION:
        ${jobDescription}

        Return ONLY the JSON object adhering to the provided schema. Do not include any markdown formatting.
    `;

    const schema = {
        type: Type.OBJECT,
        properties: {
            keywords: {
                type: Type.ARRAY,
                description: "Top 10 most important technical keywords or nouns.",
                items: { type: Type.STRING }
            },
            skills: {
                type: Type.ARRAY,
                description: "Top 10 most important soft skills or abilities.",
                items: { type: Type.STRING }
            },
            companyName: {
                type: Type.STRING,
                description: "The name of the company hiring, if found."
            },
            jobTitle: {
                type: Type.STRING,
                description: "The specific job title or position being advertised."
            }
        },
        required: ["keywords", "skills"]
    };

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.1, // Low temp for accurate extraction
            systemInstruction: SYSTEM_INSTRUCTION_PARSER
        }
    }));
    return JSON.parse((response.text || "").trim());
};

// ... (Other enhancement functions are fine and use similar logic) ...

export const generateEnhancedSummary = async (profile: UserProfile): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
      You are a professional career coach. Based STRICTLY on the provided user profile, write a concise and powerful professional summary (2-4 sentences) that highlights their key strengths and experience.
      
      **CRITICAL:** Do NOT invent skills, experiences, or achievements not present in the profile. If the profile is sparse, write a strong summary based ONLY on what is there.
      Return only the summary text.
      USER PROFILE:
      ${JSON.stringify(profile, null, 2)}
    `;
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: { temperature: 0.5, systemInstruction: SYSTEM_INSTRUCTION_PROFESSIONAL }
    }));
    return response.text || "";
};

export const generateEnhancedResponsibilities = async (jobTitle: string, company: string, currentResponsibilities: string, jobDescription?: string, duration?: string, pointCount: number = 5): Promise<string> => {
    const ai = getAiClient();
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
      1.  **Analyze & Upgrade:** Check if the metrics/achievements in the draft are impressive enough for the role's tenure (${duration}). 
          - *Example:* If they worked for 2 years but only mention "managed $800k budget" when industry standard for that role is $5M+, upgrades the phrasing to focus on efficiency or percentage growth, or suggest a more realistic/impressive metric range if plausible.
          - If the input is weak, EXPAND it using industry-standard responsibilities for this job title.
      2.  **Tailor to JD:** If a JD is provided, prioritized keywords and skills from the JD. Rewrite bullet points to mirror the language and priorities of the target role.
      3.  **Quantify:** Frame each point around specific accomplishments. Use numbers!
          - If strict numbers are missing, you MAY estimate realistic industry-standard metrics for this level (e.g., "reduced latency by ~30%", "managed team of 5+").
          - Use placeholders like \`[Amount]\` ONLY if you cannot reasonably estimate.
      4.  **Action Verbs:** Start with powerful verbs (e.g., "Orchestrated", "Engineered", "Capitalized").
      5.  **STRICT COUNT:** Output EXACTLY ${pointCount} bullet points — not ${pointCount - 1}, not ${pointCount + 1}. Count them before outputting.
      6.  **Format:** Return ONLY the bullet points as a single string. Each point must start with a newline and the '•' character.
    `;
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash', // Use Flash (Pro equivalent logic) for better reasoning
        contents: prompt,
        config: { temperature: 0.7, systemInstruction: SYSTEM_INSTRUCTION_PROFESSIONAL }
    }));
    return (response.text || "").trim().replace(/^- /gm, '• ');
};

export const generateEnhancedProjectDescription = async (projectName: string, currentDescription: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
      You are a tech portfolio expert. Rewrite and enhance the provided project description into a single, concise, professional paragraph for a technical resume.

      **Instructions:**
      1.  **Strict Adherence:** Describe ONLY the project provided. Do not invent features or technologies not implied by the description.
      2.  **Structure:** Clearly state the project's purpose, the core technologies used, and the key features/outcomes.
      3.  **Specificity:** Mention specific frameworks, languages, or tools (e.g., "React and Redux" instead of "web technologies").
      4.  **Highlight Impact:** Briefly explain the problem solved or the project's main achievement.
      5.  **Format:** Return ONLY a single, professional paragraph. Do not add any introductory text.

      **Input:**
      - Project Name: '${projectName}'
      - Current Description: "${currentDescription}"

      **Output:**
    `;
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: { temperature: 0.5, systemInstruction: SYSTEM_INSTRUCTION_PROFESSIONAL }
    }));
    return response.text || "";
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
    const ai = getAiClient();
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
            1.  **Hook**: Start with a powerful opening that captures attention immediately.
            2.  **The Bridge**: Connect the user's past experiences to why they need this specific scholarship.
            3.  **The Impact**: Clearly state what the user will do with the knowledge/funding and the broader impact it will have.
            4.  **Conclusion**: A strong closing statement that leaves a lasting impression.

        ${SYSTEM_INSTRUCTION_HUMANIZER}

        Return ONLY the text of the essay. No titles, no intro text, no placeholders like "[Your Name]".
    `;

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.8, systemInstruction: SYSTEM_INSTRUCTION_PROFESSIONAL }
    }));

    return response.text || "";
};

// ─── CV Checker: Score CV against JD ──────────────────────────────────────────

export interface CVCheckResult {
    overallScore: number;        // 0-100
    atsScore: number;            // 0-100 ATS compatibility
    strengths: string[];         // What's good
    weaknesses: string[];        // What's wrong
    missingKeywords: string[];   // Keywords in JD but not in CV
    matchedKeywords: string[];   // Keywords found in both
    suggestions: string[];       // Actionable improvement tips
    summary: string;             // Brief overall assessment
}

export const checkCVAgainstJob = async (
    profile: UserProfile,
    jobDescription: string
): Promise<CVCheckResult> => {
    const ai = getAiClient();
    const prompt = `
        You are an elite CV reviewer and ATS expert. Analyze this CV against the job description.

        ### CV DATA
        ${JSON.stringify(profile, null, 2)}

        ### JOB DESCRIPTION
        ${jobDescription}

        ### ANALYSIS INSTRUCTIONS
        1. **overallScore** (0-100): How well does this CV match the JD? Consider relevance, experience, skills alignment.
        2. **atsScore** (0-100): How likely is this CV to pass ATS screening? Consider keyword density, formatting, section headers.
        3. **strengths** (3-5 items): What the CV does well relative to this JD.
        4. **weaknesses** (3-5 items): Critical gaps, mismatches, or problems.
        5. **missingKeywords** (5-15 items): Important keywords/skills from the JD that are NOT in the CV.
        6. **matchedKeywords** (5-15 items): Keywords/skills that appear in BOTH the CV and JD.
        7. **suggestions** (3-6 items): Specific, actionable suggestions to improve the CV for this role.
        8. **summary** (2-3 sentences): Overall assessment in plain language.

        Be brutally honest. A 100 score should be near-impossible. Most CVs score 40-70.
    `;

    const schema = {
        type: Type.OBJECT,
        properties: {
            overallScore: { type: Type.NUMBER },
            atsScore: { type: Type.NUMBER },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
            missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            matchedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            summary: { type: Type.STRING },
        },
        required: ['overallScore', 'atsScore', 'strengths', 'weaknesses', 'missingKeywords', 'matchedKeywords', 'suggestions', 'summary']
    };

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.2,
            systemInstruction: SYSTEM_INSTRUCTION_PARSER
        }
    }));
    return JSON.parse((response.text || "").trim());
};

// ─── Smart Cover Letter: JD + Company Research ───────────────────────────────

export const generateSmartCoverLetter = async (
    profile: UserProfile,
    jobDescription: string,
    companyResearch: string = ''
): Promise<string> => {
    const ai = getAiClient();
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
        1. **Opening**: Name the exact role. If company research is available, mention something specific about the company (recent news, values, product) that excites you. This shows you've done your homework.
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

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.7, systemInstruction: SYSTEM_INSTRUCTION_HUMANIZER }
    }));
    return response.text || "";
};

// ─── Paraphrase: Rewrite text in different tones ──────────────────────────────

export type ParaphraseTone = 'professional' | 'concise' | 'creative' | 'ats-friendly';

export const paraphraseText = async (
    text: string,
    tone: ParaphraseTone = 'professional',
    context: string = ''
): Promise<string> => {
    const ai = getAiClient();

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

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: tone === 'ats-friendly' ? 0.3 : 0.7, systemInstruction: SYSTEM_INSTRUCTION_HUMANIZER }
    }));
    return response.text || text;
};

// ── CV Score / Match Analysis ─────────────────────────────────────────────────
export interface CVScore {
    overall: number;           // 0–100
    ats: number;               // keyword/phrase match score
    impact: number;            // quantified achievements score
    relevance: number;         // role-fit alignment score
    clarity: number;           // writing quality score
    missingKeywords: string[]; // top JD keywords not found in CV
    strengths: string[];       // 2-3 things done well
    improvements: string[];    // 2-3 specific, actionable fixes
    verdict: string;           // one-line hiring verdict
}

export const scoreCV = async (cvData: CVData, jobDescription: string): Promise<CVScore> => {
    const ai = getAiClient('lite');

    const cvText = [
        cvData.summary,
        ...cvData.experience.flatMap(e => [e.jobTitle, e.company, ...e.responsibilities]),
        ...cvData.skills,
        ...cvData.education.map(e => `${e.degree} ${e.school}`),
        ...cvData.projects.map(p => p.description),
    ].join(' ');

    const prompt = `
You are an expert ATS system and senior hiring manager scoring a CV against a job description.
Analyse objectively and return a JSON score report.

CV TEXT:
${cvText}

JOB DESCRIPTION:
${jobDescription}

Scoring rubric:
- "ats" (0-100): How many of the JD's key terms/phrases appear in the CV? >80 = strong pass, 60-80 = borderline, <60 = likely rejected.
- "impact" (0-100): What % of bullet points have a quantified result (number, %, $, time saved)? 100 = all bullets quantified.
- "relevance" (0-100): How closely does the candidate's experience/skills match the role requirements?
- "clarity" (0-100): Is the writing concise, free of clichés, and easy to skim in 6 seconds?
- "overall" (0-100): Weighted average — ats×0.35 + impact×0.25 + relevance×0.30 + clarity×0.10. Round to nearest integer.
- "missingKeywords": List up to 8 important JD keywords/phrases NOT found in the CV. Empty array if none.
- "strengths": Exactly 2 specific things this CV does well (be concrete, not generic).
- "improvements": Exactly 3 specific, immediately actionable fixes (e.g. "Add a metric to the 'Led team' bullet in Role X").
- "verdict": One punchy sentence a recruiter would say about this CV (e.g. "Strong ATS match — call this candidate.").
`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            overall:         { type: Type.NUMBER },
            ats:             { type: Type.NUMBER },
            impact:          { type: Type.NUMBER },
            relevance:       { type: Type.NUMBER },
            clarity:         { type: Type.NUMBER },
            missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            strengths:       { type: Type.ARRAY, items: { type: Type.STRING } },
            improvements:    { type: Type.ARRAY, items: { type: Type.STRING } },
            verdict:         { type: Type.STRING },
        },
        required: ['overall','ats','impact','relevance','clarity','missingKeywords','strengths','improvements','verdict'],
    };

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.2,
            systemInstruction: SYSTEM_INSTRUCTION_PARSER,
        },
    }));

    return JSON.parse((response.text || '').trim()) as CVScore;
};

// --- AI CV Improvement ---
export const improveCV = async (
    cvData: CVData,
    personalInfo: PersonalInfo,
    instruction: string,
    jobDescription?: string,
): Promise<CVData> => {
    const ai = getAiClient('lite');

    const cvJson = JSON.stringify(cvData, null, 2);

    const prompt = `
You are an elite CV writer. The user wants to improve their CV. Apply the instruction below and return the COMPLETE improved CVData JSON.

INSTRUCTION: "${instruction}"

CURRENT CV DATA (JSON):
${cvJson}

CANDIDATE NAME: ${personalInfo.name}
${jobDescription ? `TARGET JOB DESCRIPTION:\n${jobDescription}` : ''}

Rules:
1. Apply the instruction precisely. If it's about bullets, improve bullets. If it's about the summary, improve the summary.
2. Keep all factual details accurate — don't change company names, job titles, dates, or invent new roles.
3. Return the COMPLETE CVData object with ALL fields, not just the modified parts.
4. Every bullet must follow "Strong Verb → Scope → Quantified Result".
5. Avoid AI clichés. Write like a confident, experienced professional.
6. Return ONLY valid JSON matching the CVData schema. No markdown, no code fences.

CVData schema:
{
  "summary": string,
  "skills": string[],
  "experience": [{ "company": string, "jobTitle": string, "dates": string, "startDate": string, "endDate": string, "responsibilities": string[] }],
  "education": [{ "degree": string, "school": string, "year": string, "description": string? }],
  "projects": [{ "name": string, "description": string, "link": string? }]?,
  "languages": [{ "name": string, "proficiency": string }]?,
  "publications": [{ "title": string, "authors": string[], "journal": string, "year": string, "link": string? }]?
}
`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            summary: { type: Type.STRING },
            skills: { type: Type.ARRAY, items: { type: Type.STRING } },
            experience: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        company: { type: Type.STRING },
                        jobTitle: { type: Type.STRING },
                        dates: { type: Type.STRING },
                        startDate: { type: Type.STRING },
                        endDate: { type: Type.STRING },
                        responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ['company', 'jobTitle', 'dates', 'startDate', 'endDate', 'responsibilities'],
                },
            },
            education: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        degree: { type: Type.STRING },
                        school: { type: Type.STRING },
                        year: { type: Type.STRING },
                        description: { type: Type.STRING },
                    },
                    required: ['degree', 'school', 'year'],
                },
            },
            projects: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        description: { type: Type.STRING },
                        link: { type: Type.STRING },
                    },
                    required: ['name', 'description'],
                },
            },
            languages: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        proficiency: { type: Type.STRING },
                    },
                    required: ['name', 'proficiency'],
                },
            },
        },
        required: ['summary', 'skills', 'experience', 'education'],
    };

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.4,
            systemInstruction: SYSTEM_INSTRUCTION_PROFESSIONAL,
        },
    }));

    return JSON.parse((response.text || '').trim()) as CVData;
};
