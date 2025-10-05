import { GoogleGenAI, Type } from "@google/genai";
import type { UserProfile } from '../types';

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { rawText } = req.body;
    if (!rawText) {
      return res.status(400).json({ error: 'rawText is required in the request body.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
    
    res.status(200).json(profileData);
  } catch (error) {
    console.error("Error in /api/generate-profile:", error);
    res.status(500).json({ error: "Failed to generate profile from text. Please check the input and try again." });
  }
}
