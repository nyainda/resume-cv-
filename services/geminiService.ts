import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { UserProfile, CVData, JobAnalysisResult, ApiSettings, CVGenerationMode, ScholarshipFormat } from '../types';

// --- System-Level Constants for AI Control ---
const SYSTEM_INSTRUCTION_PROFESSIONAL = `
You are a world-class career coach, elite recruiter, and resume strategist with 20+ years of experience placing candidates at Fortune 500 companies and top startups.
You produce CVs that:
1. IMMEDIATELY capture recruiter attention in under 6 seconds (the average resume scan time).
2. Pass ATS keyword filtering with 90%+ match rates.
3. Use the "Action + Context + Quantified Result" formula for every bullet point.
4. Position the candidate as the OBVIOUS choice for the role.
Generate ONLY valid JSON or plain text. Strictly adhere to schemas. NEVER include markdown formatting in JSON values.
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
    const settingsString = localStorage.getItem('apiSettings');
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
                description: "3-5 bullet points of key achievements and responsibilities, tailored to the context description.",
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
    **CRITICAL — HUMAN WRITING STYLE**:
    Write ALL text (summary, bullet points, descriptions) as if a senior human professional wrote it personally.
    - Mix sentence lengths naturally. Short. Then longer ones that elaborate.
    - NO AI buzzwords: avoid "delve", "robust", "seamlessly", "synergy", "leverage" (use sparingly), "cutting-edge", "in today's fast-paced world".
    - Be specific and concrete. Replace vague phrases like "contributed to team success" with actual outcomes.
    - Vary action verbs — never use the same verb twice across all bullet points.
    - Make every line feel like it came from lived experience, not a template.
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

        if (generationMode === 'honest') {
            experienceInstruction = `
            3.  **Experience — HONEST MODE (STRICT)**:
                - Use ONLY the work experience provided by the user. Do NOT invent, add, or imply any employers, job titles, or dates that are not in the user's profile.
                - REWRITE each bullet point to:
                  a) Start with a powerful action verb (e.g., Spearheaded, Orchestrated, Delivered, Accelerated)
                  b) Quantify achievements using realistic metrics based on the role context (add estimates if not given, e.g., "~30% efficiency gain")
                  c) Weave in JD keywords naturally — every bullet should feel directly relevant to the target role
                - The goal: make the user's REAL experience sound as impressive and relevant as possible. Polish, don't fabricate.
            `;
        } else if (generationMode === 'boosted') {
            experienceInstruction = `
            3.  **Experience — BOOSTED MODE**:
                - FIRST: Rewrite all of the user's real experience using powerful action verbs, quantified achievements, and JD-aligned keywords.
                - THEN: Strategically craft EXACTLY 1 additional plausible experience entry to fill a gap or strengthen the candidacy:
                  • **Company**: Use a credible mid-sized company (regional tech firm, consultancy, agency) — NOT a verifiable giant like Google/Safaricom.
                  • **Role & Dates**: Must make logical career sense and NOT overlap with existing roles.
                  • **Content**: 3-4 bullet points directly targeting the JD's must-have requirements, featuring the "Must-Include Keywords".
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
                  • **Content**: 3-5 bullet points each, packed with JD keywords, quantified results, and executive-level language.
                - The summary should position this candidate as the OBVIOUS first choice for the role.
            `;
        }


        mainPromptInstruction = `
            You are a world-class CV writer. Create a targeted, powerful CV for a job application that gets interviews.
            
            USER PROFILE: ${JSON.stringify(profile, null, 2)}
            JOB DESCRIPTION: ${contextDescription}
            ${githubInstruction}

            ${keywordInstruction}

            === CRITICAL INSTRUCTIONS ===

            1. **SUMMARY — Value Proposition Hook (2-3 sentences MAX)**:
               - Sentence 1: WHO they are + seniority + specialty (e.g., "Results-driven Senior Software Engineer specializing in cloud-native fintech.")
               - Sentence 2: CORE VALUE + key achievement matching the JD
               - Sentence 3: UNIQUE FIT for this specific role
               - Integrate 3-5 must-include keywords. Make the recruiter say "This is our person."

            2. **EXPERIENCE — The Proof**:
               - For EVERY entry: 'startDate' and 'endDate' in 'YYYY-MM-DD' (use 'Present' for current role).
               - Every bullet: [Strong Verb] + [Context/Scope] + [Quantified Result]
               - NEVER start bullets with: "Responsible for", "Helped", "Worked on".
               ${experienceInstruction}

            3. **SKILLS**: Core skills first (most relevant to JD), then tools, then adjacent. Include ALL must-include keywords from the JD. Return EXACTLY 15 specific skills.

            4. **EDUCATION**: 1-sentence 'description' with relevant coursework or honors.

            5. **PROJECTS**: Problem solved + technologies + measurable outcome.

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
    const prompt = `
        You are a top-tier professional career coach. Write a compelling and professional cover letter.

        ### INPUT DATA
        USER PROFILE (for background and content):
        ${JSON.stringify(profile, null, 2)}

        JOB DESCRIPTION (for context and keywords):
        ${jobDescription}

        ### INSTRUCTIONS
        1. **Tone**: Professional, confident, enthusiastic, and direct.
        2. **Structure**: 
           - **Introduction**: State the position and express excitement.
           - **Body (2-3 Paragraphs)**: Dedicate one paragraph to each of 2-3 of the user's most relevant experiences/skills that directly align with the core requirements of the job description. Use strong action verbs and achievement-oriented language.
           - **Conclusion**: Reiterate interest and include a clear call to action (e.g., eager to discuss further).
        3. **Keywords**: Seamlessly integrate keywords from the job description throughout the letter.
        4. **Formatting**: Address the letter to "Hiring Manager" (unless a name is available). Use proper salutation and closing.
        5. **Output**: Return ONLY the plain text of the cover letter, with appropriate line breaks. DO NOT use markdown or any other formatting.
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

export const generateEnhancedResponsibilities = async (jobTitle: string, company: string, currentResponsibilities: string, jobDescription?: string, duration?: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
      You are an expert resume writer and career coach specializing in creating HIGH-IMPACT, ATS-OPTIMIZED bullet points.
      
      **Goal:** Transform the user's responsibilities into impressive, quantified achievements that match standard industry expectations for their tenure and align with the target job description.

      **Input Context:**
      - **Role:** ${jobTitle} at ${company}
      - **Duration/Tenure:** ${duration || "Not specified"}
      - **Target Job Description (JD):** ${jobDescription ? jobDescription.substring(0, 500) + '...' : "None provided"}
      - **Current Draft:** "${currentResponsibilities}"

      **Instructions:**
      1.  **Analyze & Upgrade:** Check if the metrics/achievements in the draft are impressive enough for the role's tenure (${duration}). 
          - *Example:* If they worked for 2 years but only mention "managed $800k budget" when industry standard for that role is $5M+, upgrades the phrasing to focus on efficiency or percentage growth, or suggest a more realistic/impressive metric range if plausible.
          - If the input is weak, EXPAND it using industry-standard responsibilities for this job title.
      2.  **Tailor to JD:** If a JD is provided, prioritized keywords and skills from the JD. Rewrite bullet points to mirror the language and priorities of the target role.
      3.  **Quantify:** Frame each point around specific accomplishments. Use numbers!
          - If strict numbers are missing, you MAY estimate realistic industry-standard metrics for this level (e.g., "reduced latency by ~30%", "managed team of 5+").
          - Use placeholders like \`[Amount]\` ONLY if you cannot reasonably estimate.
      4.  **Action Verbs:** Start with powerful verbs (e.g., "Orchestrated", "Engineered", "Capitalized").
      5.  **Format:** Return ONLY the bullet points as a single string. Each point must start with a newline and the '•' character.
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
