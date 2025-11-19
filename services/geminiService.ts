
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { UserProfile, CVData, JobAnalysisResult, ApiSettings, AIProvider } from '../types';

function getAiClient(): GoogleGenAI {
    const settingsString = localStorage.getItem('apiSettings');
    if (!settingsString) {
        throw new Error("API settings not found. Please set your API key in the settings.");
    }

    const settings: ApiSettings = JSON.parse(settingsString);

    if (!settings.apiKey) {
        throw new Error("API key not found. Please set it in the settings.");
    }

    if (settings.provider !== 'gemini') {
        // We currently only support Gemini directly in this service.
        // If the user selects another provider, this service would need to be adapted or a different service used.
        throw new Error(`The selected provider '${settings.provider}' is not yet supported for generation. Please select 'gemini' in the settings.`);
    }
    
    // Remove quotes from key if it's stored as a JSON string
    const cleanedApiKey = settings.apiKey.replace(/^"|"$/g, '');
    return new GoogleGenAI({ apiKey: cleanedApiKey });
}

// Retry logic for "Model Overloaded" (503) or Rate Limit (429) errors
async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        const errorMessage = error?.message || '';
        const isOverloaded = errorMessage.includes('503') || errorMessage.includes('Overloaded');
        const isRateLimit = errorMessage.includes('429');

        if (retries > 0 && (isOverloaded || isRateLimit)) {
            console.warn(`Model overloaded or rate limited. Retrying... ${retries} attempts left. Waiting ${delayMs}ms.`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return retryOperation(operation, retries - 1, delayMs * 2); // Exponential backoff
        }
        throw error;
    }
}

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
                    id: { type: Type.STRING, description: "A unique identifier, can be a timestamp or random string." },
                    company: { type: Type.STRING },
                    jobTitle: { type: Type.STRING },
                    startDate: { type: Type.STRING, description: "YYYY-MM-DD format" },
                    endDate: { type: Type.STRING, description: "YYYY-MM-DD format, or 'Present'" },
                    responsibilities: { type: Type.STRING, description: "A paragraph or bullet points describing the role." },
                },
                required: ["id", "company", "jobTitle", "startDate", "responsibilities"]
            }
        },
        education: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING, description: "A unique identifier." },
                    degree: { type: Type.STRING },
                    school: { type: Type.STRING },
                    graduationYear: { type: Type.STRING },
                },
                required: ["id", "degree", "school"]
            }
        },
        skills: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
        projects: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING, description: "A unique identifier." },
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
                    id: { type: Type.STRING, description: "A unique identifier." },
                    name: { type: Type.STRING },
                    proficiency: { type: Type.STRING, description: "e.g., Native, Fluent, Proficient" },
                },
                required: ["id", "name", "proficiency"]
            }
        }
    },
    required: ["personalInfo", "summary", "workExperience", "education", "skills"]
};

export const generateProfile = async (rawText: string, githubUrl?: string): Promise<UserProfile> => {
    const ai = getAiClient();

    let githubInstruction = '';
    if (githubUrl) {
        githubInstruction = `
        Additionally, the user has provided a GitHub profile: ${githubUrl}.
        Based on this, please perform the following enhancements:
        - **Infer Projects**: Analyze the user's public repositories. Populate the 'projects' array with their most significant ones.
        - **Project Details**: For each project, use the repository name for 'name', write a concise 'description' about its purpose and tech stack, and create a valid repository 'link' (e.g., '${githubUrl}/repository-name').
        - **Infer Skills**: Add key programming languages, frameworks, and tools discovered from the repositories to the main 'skills' list.
        - **Complete Profile**: If details like name or summary are missing from the raw text, try to infer them from the GitHub profile.
        `;
    }

    const prompt = `
        You are an expert resume parser and profile builder. Your task is to create a structured JSON object based on the provided information.
        Prioritize information from the RAW TEXT, and use the GitHub profile to enhance and add project details.

        RAW TEXT:
        ${rawText || 'No raw text provided. Rely on GitHub profile.'}
        
        ${githubInstruction}

        Instructions:
        1. Parse all available information: personal details (including name, email, phone, location, linkedin, website, github), a professional summary, work experience, education, skills, projects, and languages.
        2. Date Standardization: Accurately parse all dates for work experience. Standardize them to 'YYYY-MM-DD' format. If a month and year are given (e.g., 'June 2020'), use the first day of the month ('2020-06-01'). If only a year is given, use January 1st ('2019-01-01'). For current roles, the 'endDate' must be the string 'Present'.
        3. For skills, extract a list of relevant technical and soft skills.
        4. For work experience responsibilities, keep the original text, ideally as a single string with newlines.
        5. For languages, parse the language name and proficiency level (e.g., Fluent, Native, Professional).
        6. Generate a unique 'id' for each item in workExperience, education, projects, and languages. A simple timestamp string is sufficient.
        7. If a GitHub URL was provided for analysis, also add it to the 'personalInfo.github' field in the final JSON.
        8. Return ONLY the JSON object that adheres to the schema. Do not include markdown formatting.
    `;

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: userProfileSchema,
            temperature: 0.2,
        }
    }));

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
        const jobAnalysis = await analyzeJobDescriptionForKeywords(contextDescription);
        const allKeywords = [...(jobAnalysis.keywords || []), ...(jobAnalysis.skills || [])];
        if (allKeywords.length > 0) {
            keywordInstruction = `
            **CRITICAL REQUIREMENT**: You MUST strategically and naturally integrate the following keywords and skills throughout the generated CV. The most important places to include them are the 'summary' and the 'responsibilities' bullet points for each work experience.
            - Focus on weaving these terms into achievement-oriented statements.
            - The final 'skills' array in the JSON output should also heavily feature these terms.
            
            **Must-Include Keywords**: ${allKeywords.join(', ')}
            `;
        }
    } catch (e) {
        console.error("Keyword analysis failed, proceeding with CV generation without explicit keywords.", e);
        // Generation will continue without the keyword instruction.
    }

    let mainPromptInstruction: string;
    let cvDataSchema: any;
    let githubInstruction = '';

    if (profile.personalInfo.github) {
        githubInstruction = `IMPORTANT: The user has provided a GitHub profile: ${profile.personalInfo.github}. Analyze their repositories to infer key technologies, projects, and programming languages they are proficient in. Use this information to enrich the skills and projects sections, making them more authentic and detailed.`;
    }

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
            link: { type: Type.STRING, description: "A plausible URL for the project, e.g., a GitHub repo or live website."}
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
            link: { type: Type.STRING, description: "A plausible URL to the publication."}
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
                    description: { type: Type.STRING, description: "A brief, 1-2 sentence description of notable coursework or achievements."}
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
            experienceInstruction = `3.  **Generated Experience**: Invent ONE or TWO additional, highly plausible, fictional work experience entries that would make the user the IDEAL candidate for this role. These entries should be creative, impressive, and directly relevant to the job description, heavily featuring the "Must-Include Keywords". For the company names, use real or plausible-sounding companies (e.g., startups, consultancies) or create fictional names that sound authentic.`;
        }

        mainPromptInstruction = `
            You are a professional CV writer and career coach. Your task is to create a tailored CV for a job application.
            USER PROFILE: ${JSON.stringify(profile, null, 2)}
            JOB DESCRIPTION: ${contextDescription}
            ${githubInstruction}

            ${keywordInstruction}

            Instructions:
            1. Summary: Rewrite the professional summary to be concise, powerful, and perfectly aligned with the job description. It MUST integrate keywords from the list above.
            2. Experience: For each experience entry, you MUST provide 'startDate' and 'endDate' fields in 'YYYY-MM-DD' format (or 'Present' for endDate of a current role) for sorting purposes.
            ${experienceInstruction}
            4. Skills: Generate a list of skills that are most relevant to the job description, ensuring it includes the "Must-Include Keywords".
            5. Education: Add a brief 'description' of notable coursework or achievements.
            6. Projects: Tailor project descriptions to the job.
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
      model: 'gemini-2.5-flash',
      contents: mainPromptInstruction,
      config: { responseMimeType: 'application/json', responseSchema: cvDataSchema, temperature: 0.6 }
    }));

    const cvData: CVData = JSON.parse((response.text || "").trim());

    // Sort experience in reverse chronological order
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

export const extractProfileTextFromFile = async (base64Data: string, mimeType: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = "This file is a resume, CV, or professional profile. Extract all text content from it. Return only the raw text, preserving original line breaks and structure as much as possible. Do not add any commentary, summaries, or formatting like markdown.";
    
    const filePart = {
        inlineData: {
            data: base64Data,
            mimeType: mimeType,
        },
    };

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [filePart, { text: prompt }] },
    }));
    return response.text || "";
};

export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = "Analyze this image of a job description and extract all of the text from it. Return only the raw text, with no additional commentary.";
    
    const imagePart = {
        inlineData: {
            data: base64Image,
            mimeType: mimeType,
        },
    };
    const textPart = { text: prompt };

    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
    }));
    
    return response.text || "";
};

export const generateCoverLetter = async (profile: UserProfile, jobDescription: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
        You are a professional career coach. Write a compelling and professional cover letter based on the provided user profile and job description.

        USER PROFILE:
        ${JSON.stringify(profile, null, 2)}

        JOB DESCRIPTION:
        ${jobDescription}

        Instructions:
        1. The tone should be professional, confident, and enthusiastic.
        2. Structure the letter with an introduction (state the position being applied for), a body (highlighting 2-3 key skills and experiences from the user's profile that match the job description), and a conclusion (reiterate interest and include a call to action).
        3. Address the letter to "Hiring Manager" unless a name is available in the job description.
        4. Integrate keywords from the job description naturally.
        5. Keep it concise, ideally around 3-4 paragraphs.
        6. End with "Sincerely," followed by the user's name.
        7. Return only the plain text of the cover letter, with appropriate line breaks. Do not return markdown or any other formatting.
    `;
    
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    }));
    return response.text || "";
};

export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    const ai = getAiClient();
    const prompt = `
        Analyze the following job description. 
        1. Extract the top 10 most important technical keywords (specific technologies, tools, platforms, methodologies like Agile).
        2. Extract the top 10 essential soft skills (communication, leadership, etc.).
        3. Identify the name of the Company or Organization hiring. If it is not explicitly stated, try to infer it. If impossible, return an empty string.

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
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.1,
        }
    }));
    return JSON.parse((response.text || "").trim());
};

export const generateEnhancedSummary = async (profile: UserProfile): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
      You are a professional career coach. Based on the provided user profile, write a concise and powerful professional summary (2-4 sentences) that highlights their key strengths and experience. Return only the summary text.
      USER PROFILE:
      ${JSON.stringify(profile, null, 2)}
    `;
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    }));
    return response.text || "";
};

export const generateEnhancedResponsibilities = async (jobTitle: string, company: string, currentResponsibilities: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
      You are an expert resume writer specializing in creating impactful, achievement-oriented bullet points for work experience sections.

      **Your Task:**
      Based on the provided Job Title, Company, and any existing responsibilities, you will generate 3-5 professional bullet points.

      **Instructions:**
      1.  **Focus on Achievements, Not Duties:** Frame each point around a specific accomplishment. What was the result of the work?
      2.  **Use Strong Action Verbs:** Start each bullet point with a powerful verb (e.g., "Architected," "Engineered," "Spearheaded," "Quantified").
      3.  **Quantify Results:** Whenever possible, include metrics to show impact. If exact numbers aren't available, use placeholders like \`[X%]\`, \`[Number]\`, or \`[e.g., thousands of users]\`.
      4.  **Tailor to the Role:** The bullet points must be highly relevant to the provided Job Title.
      5.  **Input Handling:**
          - If "Current Responsibilities" are provided, use them as inspiration to write *new, improved* bullet points. Do not simply rephrase them slightly. Elevate them to a professional standard.
          - If "Current Responsibilities" are empty or just keywords, generate the bullet points from scratch based on the Job Title.
      6.  **Output Format:**
          - Return ONLY the bullet points.
          - Do not include any introductory phrases like "Here are the enhanced responsibilities:".
          - Each bullet point must start with a newline and the '•' character.
          - The output should be a single string.

      **Example:**
      *Input:*
      - Job Title: "Sales Engineer"
      - Company: "Tech Solutions Inc."
      - Current Responsibilities: "technical demos, presales, talking to clients"

      *Desired Output:*
      • Drove significant revenue growth by providing expert technical pre-sales support and positioning complex solutions, contributing to a [X]% increase in closed-won deals.
      • Analyzed intricate client requirements and architected customized technical solutions, addressing critical business challenges and significantly improving operational efficiency for key accounts.
      • Delivered compelling product demonstrations and technical presentations to C-level executives and technical stakeholders, clearly articulating value propositions and competitive advantages.
      • Collaborated closely with product management and engineering teams to translate customer feedback into actionable product enhancements and inform future development roadmaps.

      ---

      **Now, complete the following request:**

      **Input:**
      - Job Title: '${jobTitle}'
      - Company: '${company}'
      - Current Responsibilities: "${currentResponsibilities}"

      **Output:**
    `;
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    }));
    return (response.text || "").trim().replace(/^- /gm, '• ');
};

export const generateEnhancedProjectDescription = async (projectName: string, currentDescription: string): Promise<string> => {
    const ai = getAiClient();
    const prompt = `
      You are a tech portfolio expert who excels at writing concise and compelling project descriptions for resumes.

      **Your Task:**
      Rewrite and enhance the provided project description to make it highly effective for a technical resume.

      **Instructions:**
      1.  **Structure:** The description should clearly state the project's purpose, the technologies used, and the key outcomes or features.
      2.  **Be Specific:** Mention specific frameworks, languages, or tools.
      3.  **Highlight Impact:** Briefly explain the problem the project solved or its main achievement.
      4.  **Format:** Return a single, professional paragraph. Do not add any introductory text like "Here is the enhanced description:".

      **Example:**
      *Input:*
      - Project Name: "E-commerce Site"
      - Current Description: "built a website for selling things"

      *Desired Output:*
      "Developed a full-stack e-commerce platform using the MERN stack (MongoDB, Express.js, React, Node.js) with Stripe integration for secure payments. Implemented features such as user authentication with JWT, a product catalog with search and filtering, and a responsive user interface, resulting in a fully functional online store."

      ---

      **Now, complete the following request:**

      **Input:**
      - Project Name: '${projectName}'
      - Current Description: "${currentDescription}"

      **Output:**
    `;
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    }));
    return response.text || "";
};
