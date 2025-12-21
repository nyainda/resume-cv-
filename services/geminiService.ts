import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { UserProfile, CVData, JobAnalysisResult, ApiSettings } from '../types';

// --- System-Level Constants for AI Control ---
const SYSTEM_INSTRUCTION_PROFESSIONAL = `
You are an elite AI career consultant and "ruthless" recruiter optimization engine. 
Generate ONLY JSON or plain text outputs. 
Strictly adhere to schemas. 
Your goal is to create CVs that stand out immediately, pass ATS systems perfectly, and wow human recruiters with impact and clarity.
`;

const SYSTEM_INSTRUCTION_PARSER = `
You are an expert data parser. Convert unstructured text into accurate JSON. 
Standardize dates. Never invent data unless instructed.
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

    // ... (rest of the function for parsing and sorting) ...
    const text = (response.text || "").trim();
    const profileData: UserProfile = JSON.parse(text);
    profileData.projects = profileData.projects || [];
    profileData.education = profileData.education || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages = profileData.languages || [];

    return profileData;
};

export const generateCV = async (profile: UserProfile, contextDescription: string, enableEnhancements: boolean, purpose: 'job' | 'academic'): Promise<CVData> => {
    const ai = getAiClient();

    // First, analyze the job description to extract key terms.
    let keywordInstruction = '';
    try {
        // IMPROVEMENT: Ensure this is non-blocking but has good retry logic (already in place)
        const jobAnalysis = await analyzeJobDescriptionForKeywords(contextDescription);
        const allKeywords = [...(jobAnalysis.keywords || []), ...(jobAnalysis.skills || [])];
        if (allKeywords.length > 0) {
            // IMPROVEMENT: Made the keyword instruction a CRITICAL REQUIREMENT
            keywordInstruction = `
            **CRITICAL REQUIREMENT: KEYWORD STRATEGY**: You MUST strategically, naturally, and frequently integrate the following keywords and skills throughout the generated CV. The highest priority integration points are the 'summary', the 'responsibilities' bullet points, and the final 'skills' array.
            - Focus on weaving these terms into quantified, achievement-oriented statements.
            
            **Must-Include Keywords**: ${allKeywords.join(', ')}
            `;
        }
    } catch (e) {
        console.error("Keyword analysis failed, proceeding with CV generation without explicit keywords.", e);
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
            description: "A list of the most relevant skills for the application.",
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

    if (purpose === 'academic') {
        mainPromptInstruction = `
            You are an expert academic CV writer for grant and scholarship applications.
            Your task is to create a tailored academic CV based on the user profile and the grant/scholarship description.
            USER PROFILE: ${JSON.stringify(profile, null, 2)}
            GRANT/SCHOLARSHIP DESCRIPTION: ${contextDescription}
            ${githubInstruction}
            
            ${keywordInstruction}

            Instructions:
            1.  **Research Statement**: In the 'summary' field, write a compelling 'Research Statement' or 'Objective' (2-4 sentences) that aligns perfectly with the grant's goals and incorporates the keywords.
            2.  **Experience**: Frame work experience to highlight research, teaching, and academic contributions, infusing relevant keywords. Use the title "Research and Professional Experience". Convert responsibilities into achievements relevant to academia.
            3.  **Publications**: If the user has projects or experiences that could be framed as publications, create plausible entries for them.
            4.  **Skills**: Focus on research methodologies, software, and technical skills relevant to the academic field, prioritizing the provided keywords.
            5.  **Education**: Emphasize academic honors, relevant coursework, and thesis/dissertation titles in the 'description' field for each entry.
            6.  **Projects**: Highlight projects that demonstrate research capabilities or technical prowess relevant to the grant.
            7.  Return ONLY the JSON object adhering to the schema.
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
        let experienceInstruction = `3.  **Experience**: Use ONLY the work experience provided by the user. Do not invent any jobs. Rewrite the bullet points to use strong action verbs and quantify achievements where possible. Emphasize the experience most relevant to the job.`;
        if (enableEnhancements) {
            // IMPROVEMENT: Re-enabled by user request for mass application strategy. Focuses on Kenyan context.
            // MODIFIED: Shifted strategy to use mid-tier/startup companies to be less conspicuous.
            experienceInstruction = `3.  **GENERATIVE ENHANCEMENT (CRITICAL)**: The user explicitly requests help filling experience gaps. Invent 1-2 highly plausible, REALISTIC work experience entries to make the user an ideal candidate.
             - **Company Names**: PRIORITIZE **mid-sized Kenyan companies, established startups, or credible consultancy firms** over massive, easily verifiable giants (like Safaricom/Microsoft) to avoid raising suspicion. Examples: Local tech agencies, regional logistics firms, saccos, or specialized local vendors relevant to the industry.
             - **Content**: These entries must be creative, impressive, and directly relevant to the job description, heavily featuring the "Must-Include Keywords" and quantified achievements.
             - **Dates**: **CRITICAL**: Ensure the dates for these enhanced roles DO NOT overlap illogically with existing roles. They must fit into gaps or extend the history naturally.
             - **Role Progression**: Ensure the job titles make sense in the user's career trajectory (e.g., don't jump from Junior to Lead without an intermediate step).`;
        }

        mainPromptInstruction = `
            You are a professional CV writer and career coach. Your task is to create a tailored CV for a job application.
            USER PROFILE: ${JSON.stringify(profile, null, 2)}
            JOB DESCRIPTION: ${contextDescription}
            ${githubInstruction}

            ${keywordInstruction}

            Instructions:
            Instructions:
            1. **Summary (The Hook)**: Write a "Value Proposition" instead of a generic summary. It should be 2-3 powerful sentences that immediately state WHO the candidate is (e.g., "Senior Full Stack Engineeer"), their KEY SPECIALTY (e.g., "specializing in scalable fintech solutions"), and their UNIQUE VALUE to this specific job. Integrate top keywords here.
            2. **Experience (The Proof)**: 
               - For each experience entry, you MUST provide 'startDate' and 'endDate' fields in 'YYYY-MM-DD' format (or 'Present' for endDate of a current role).
               - **Bullet Points**: Use the "Action - Context - Result" formula. Every bullet point should start with a strong action verb (e.g., Spearheaded, Orchestrated, Optimized).
               ${experienceInstruction}
            4. **Skills (The Toolkit)**: Generate a comprehensive list of skills. 
               - **Categorization Strategy**: Although the output is a simple string array, try to group them logically in the output order (e.g., Languages first, then Frameworks, then Tools) to make it easier for a human to scan. 
               - Ensure "Must-Include Keywords" are present.
            5. **Education**: Add a brief 'description' of notable coursework or achievements.
            6. **Projects**: Tailor project descriptions to the job, highlighting the *problem solved* and the *technology stack*.
            7. Return ONLY the JSON object adhering to the provided schema.
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

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        // IMPROVEMENT: Use the more capable model for this complex, high-value task.
        model: 'gemini-2.5-flash',
        config: {
            responseMimeType: 'application/json',
            responseSchema: cvDataSchema,
            temperature: 0.6, // Higher temperature for creativity/rewriting
            systemInstruction: SYSTEM_INSTRUCTION_PROFESSIONAL, // Use the PROFESSIONAL persona
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
