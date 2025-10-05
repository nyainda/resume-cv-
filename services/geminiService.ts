import { GoogleGenAI, Type } from '@google/genai';
import { UserProfile, CVData, JobAnalysisResult } from '../types';

function getAiClient(): GoogleGenAI {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        throw new Error("Gemini API key not found. Please set it in the settings.");
    }
    // Remove quotes from key if it's stored as a JSON string
    const cleanedApiKey = apiKey.replace(/^"|"$/g, '');
    return new GoogleGenAI({ apiKey: cleanedApiKey });
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

export const generateProfile = async (rawText: string): Promise<UserProfile> => {
    const ai = getAiClient();
    const prompt = `
        You are an expert resume parser. Analyze the following text, which could be from a resume, LinkedIn profile, or user notes, and extract the information into a structured JSON object.

        RAW TEXT:
        ${rawText}

        Instructions:
        1. Parse all available information: personal details (including name, email, phone, location, linkedin, website, github), a professional summary, work experience, education, skills, projects, and languages.
        2. For dates, standardize them to YYYY-MM-DD format if possible. If only a year is given, use that. For date ranges, provide start and end dates.
        3. For skills, extract a list of relevant technical and soft skills.
        4. For work experience responsibilities, keep the original text, ideally as a single string with newlines.
        5. For languages, parse the language name and proficiency level (e.g., Fluent, Native, Professional).
        6. Generate a unique 'id' for each item in workExperience, education, projects, and languages. A simple timestamp string is sufficient.
        7. Return ONLY the JSON object that adheres to the schema. Do not include markdown formatting.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: userProfileSchema,
            temperature: 0.2,
        }
    });

    const text = response.text.trim();
    const profileData: UserProfile = JSON.parse(text);
    profileData.projects = profileData.projects || [];
    profileData.education = profileData.education || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages = profileData.languages || [];
    
    return profileData;
};

export const generateCV = async (profile: UserProfile, jobDescription: string, enableEnhancements: boolean): Promise<CVData> => {
    const ai = getAiClient();
    let experienceInstruction: string;
    let projectsInstruction: string;
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
            responsibilities: {
                type: Type.ARRAY,
                description: "3-5 bullet points of key achievements and responsibilities, tailored to the job description.",
                items: { type: Type.STRING }
            }
        },
        required: ["company", "jobTitle", "dates", "responsibilities"]
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
    
    const baseSchemaProperties = {
        summary: {
            type: Type.STRING,
            description: "A professional summary tailored to the job description, 2-4 sentences long."
        },
        skills: {
            type: Type.ARRAY,
            description: "A list of the most relevant skills for the job, generated by analyzing the job description and referencing the user's skills.",
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
                    description: { type: Type.STRING, description: "A brief, 1-2 sentence description of the course or degree program."}
                },
                required: ["degree", "school", "year"]
            }
        },
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

    if (enableEnhancements) {
        experienceInstruction = `3.  **Generated Experience**: Invent ONE or TWO additional, highly plausible, fictional work experience entries that would make the user the IDEAL candidate for this role. These entries should be creative, impressive, and directly relevant to the job description. For the company names, be highly creative and industry-specific. You can use names of real, plausible-sounding companies (e.g., smaller tech consultancies, startups) or create fictional names that sound authentic and professional, such as 'Innovatech Solutions', 'Quantum Dynamics Corp', or 'Synergy Systems Inc'. Be specific with project details and technical achievements. Place these new entries at the TOP of the experience list.`;
        projectsInstruction = `6.  **Projects**: Generate 1-2 fictional but realistic project examples that would be impressive for this role. Include a brief description and plausible-looking GitHub or website links for each. If the user provided projects, you can ignore them in favor of these newly generated, more relevant ones.`;
        
        cvDataSchema = {
        type: Type.OBJECT,
        properties: { ...baseSchemaProperties,
            experience: { type: Type.ARRAY, items: baseExperienceItems },
            projects: { type: Type.ARRAY, items: baseProjectItems }
        },
        required: ["summary", "experience", "skills", "education", "languages"]
        };

    } else {
        experienceInstruction = `3.  **Experience**: Use ONLY the work experience provided by the user. Do not invent any new jobs. Rewrite the bullet points to use strong action verbs and quantify achievements where possible. Emphasize the experience most relevant to the job. Include ALL of the user's original experiences.`;
        projectsInstruction = `6.  **Projects**: Use ONLY the projects provided by the user. If the user provided projects, rephrase their descriptions to better align with the job. If the user did not provide any projects, this section can be omitted from the output. Do not invent new projects.`;
        
        cvDataSchema = {
        type: Type.OBJECT,
        properties: { ...baseSchemaProperties,
            experience: { type: Type.ARRAY, items: baseExperienceItems },
            projects: { type: Type.ARRAY, items: baseProjectItems }
        },
        required: ["summary", "experience", "skills", "education", "languages"]
        };
    }

    const prompt = `
        You are a professional CV writer and career coach. Your task is to create a tailored CV based on the provided user profile and job description.
        USER PROFILE: ${JSON.stringify(profile, null, 2)}
        JOB DESCRIPTION: ${jobDescription}
        ${githubInstruction}
        Instructions:
        1. Summary: Rewrite the professional summary to be concise, powerful, and perfectly aligned with the job description.
        2. User's Experience: Review all of the user's provided work experience. For each entry, rewrite the bullet points to use strong action verbs and quantify achievements where possible. Emphasize the experience most relevant to the job. Include ALL of the user's original experiences.
        ${experienceInstruction}
        4. Skills: Generate a list of skills that are most relevant to the job description. Use the user's skills list as a reference but DO NOT be limited by it. Create the best possible skill list for this specific job.
        5. Education: For each education entry, add a brief, 1-2 sentence 'description' of the degree program.
        ${projectsInstruction}
        7. Languages: Include the languages provided by the user. Do not invent new ones.
        8. Overall: Ensure the entire CV is professional, ATS-friendly, and free of errors.
        9. Return ONLY the JSON object adhering to the provided schema.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: cvDataSchema, temperature: 0.6 }
    });

    return JSON.parse(response.text.trim());
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

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [filePart, { text: prompt }] },
    });
    return response.text;
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

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
    });
    
    return response.text;
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
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text;
};

export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    const ai = getAiClient();
    const prompt = `
        Analyze the following job description. Extract the top 10 most important technical keywords (specific technologies, tools, platforms, methodologies like Agile) and the top 10 essential soft skills (communication, leadership, etc.). Prioritize keywords that are explicitly mentioned or strongly implied as requirements.

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
            }
        },
        required: ["keywords", "skills"]
    };
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.1,
        }
    });
    return JSON.parse(response.text.trim());
};