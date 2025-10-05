
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, CVData, JobAnalysisResult } from '../types';

// Helper to get API client, ensures key is set
const getGenAIClient = () => {
    const apiKey = localStorage.getItem('gemini-api-key');
    if (!apiKey) {
        throw new Error("API Key not found. Please set your Gemini API key in the settings.");
    }
    // Remove quotes from key if they exist
    const cleanedApiKey = apiKey.replace(/"/g, '');
    return new GoogleGenAI({ apiKey: cleanedApiKey });
};

// --- Profile Generation ---
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
    const ai = getGenAIClient();
    const prompt = `
        You are an expert resume parser. Analyze the following text and extract the information into a structured JSON object.
        RAW TEXT: ${rawText}
        Instructions:
        1. Parse all available information: personal details, summary, work experience, education, skills, projects, and languages.
        2. Standardize dates to YYYY-MM-DD format if possible.
        3. For work experience responsibilities, keep the original text as a single string with newlines.
        4. Generate a unique 'id' for each item in arrays (e.g., workExperience, education). A timestamp string is sufficient.
        5. Return ONLY the JSON object. Do not include markdown formatting.
    `;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema: userProfileSchema, temperature: 0.2 }
    });
    const profileData: UserProfile = JSON.parse(response.text.trim());
    return profileData;
};

// --- CV Generation ---
export const generateCV = async (profile: UserProfile, jobDescription: string, enableEnhancements: boolean): Promise<CVData> => {
    const ai = getGenAIClient();
    
    const baseExperienceItems = {
        type: Type.OBJECT,
        properties: {
            company: { type: Type.STRING },
            jobTitle: { type: Type.STRING },
            dates: { type: Type.STRING },
            responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["company", "jobTitle", "dates", "responsibilities"]
    };

    const baseProjectItems = {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, link: { type: Type.STRING } },
        required: ["name", "description"]
    };

    const baseSchemaProperties = {
        summary: { type: Type.STRING },
        skills: { type: Type.ARRAY, items: { type: Type.STRING } },
        education: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: { degree: { type: Type.STRING }, school: { type: Type.STRING }, year: { type: Type.STRING }, description: { type: Type.STRING } },
                required: ["degree", "school", "year"]
            }
        },
        languages: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: { name: { type: Type.STRING }, proficiency: { type: Type.STRING } },
                required: ["name", "proficiency"]
            }
        },
    };

    const cvDataSchema = {
        type: Type.OBJECT,
        properties: {
            ...baseSchemaProperties,
            experience: { type: Type.ARRAY, items: baseExperienceItems },
            projects: { type: Type.ARRAY, items: baseProjectItems }
        },
        required: ["summary", "experience", "skills", "education"]
    };
    
    const enhancementInstructions = enableEnhancements ? `
        - **Generated Experience**: Invent ONE highly plausible, fictional work experience that makes the user the IDEAL candidate. Create a realistic, industry-specific company name. Place this new entry at the TOP of the experience list.
        - **Generated Projects**: Invent 1-2 fictional but realistic project examples that would be impressive for this role.
    ` : `
        - **Experience**: Use ONLY the work experience provided by the user. Do not invent any new jobs.
        - **Projects**: Use ONLY the projects provided by the user. If none, omit this section.
    `;

    const prompt = `
        You are a professional CV writer. Create a tailored CV based on the user profile and job description.
        USER PROFILE: ${JSON.stringify(profile, null, 2)}
        JOB DESCRIPTION: ${jobDescription}
        
        Instructions:
        1. Rewrite the summary to be concise and perfectly aligned with the job description.
        2. Rewrite all user-provided experience bullet points to use strong action verbs and quantify achievements.
        ${enhancementInstructions}
        3. Generate a list of skills most relevant to the job, using the user's skills as a reference.
        4. For each education entry, add a brief, 1-2 sentence 'description' of the degree program.
        5. Return ONLY the JSON object adhering to the provided schema.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: cvDataSchema, temperature: 0.6 }
    });
    
    return JSON.parse(response.text.trim());
};

// --- Text Extraction from File ---
export const extractProfileTextFromFile = async (base64Data: string, mimeType: string): Promise<string> => {
    const ai = getGenAIClient();
    const prompt = "This file is a resume or CV. Extract all text content from it. Return only the raw text, preserving original line breaks. Do not add any commentary or summaries.";
    const filePart = { inlineData: { data: base64Data, mimeType } };
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [filePart, { text: prompt }] },
    });
    return response.text;
};

// --- Text Extraction from Image ---
export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const ai = getGenAIClient();
    const prompt = "Analyze this image of a job description and extract all text from it. Return only the raw text.";
    const imagePart = { inlineData: { data: base64Image, mimeType } };
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: prompt }] },
    });
    return response.text;
};

// --- Cover Letter Generation ---
export const generateCoverLetter = async (profile: UserProfile, jobDescription: string): Promise<string> => {
    const ai = getGenAIClient();
    const prompt = `
        Write a professional cover letter based on the user profile and job description.
        USER PROFILE: ${JSON.stringify(profile, null, 2)}
        JOB DESCRIPTION: ${jobDescription}
        Instructions:
        - The tone should be professional and enthusiastic.
        - Structure: Introduction, body (highlighting 2-3 key skills/experiences), and conclusion.
        - Address it to "Hiring Manager".
        - Keep it concise (3-4 paragraphs).
        - End with "Sincerely," and the user's name.
        - Return only the plain text of the letter.
    `;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text;
};

// --- Job Analysis ---
export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    const ai = getGenAIClient();
    const prompt = `
        Analyze the following job description. Extract the top 10 most important technical keywords and the top 10 essential soft skills.
        JOB DESCRIPTION: ${jobDescription}
        Return ONLY the JSON object.
    `;
    const schema = {
        type: Type.OBJECT,
        properties: {
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            skills: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["keywords", "skills"]
    };
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1 }
    });
    return JSON.parse(response.text.trim());
};
