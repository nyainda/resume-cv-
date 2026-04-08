import mammoth from 'mammoth';
import { UserProfile, WorkExperience, Education, Project, Language } from '../types';
import { groqChat, GROQ_LARGE } from './groqService';

export async function extractTextFromDocx(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

export async function extractTextFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

export async function parseWordTextToProfile(text: string): Promise<UserProfile> {
    const systemPrompt = `You are an expert CV parser. Extract all structured information from CV/resume text and return it as valid JSON. Do not invent data — only extract what is explicitly present. Return only valid JSON, no markdown, no code fences, no prose.`;

    const userPrompt = `Extract all structured information from the following CV text and return a raw JSON object matching this exact schema:

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
      "id": "string (e.g. exp1)",
      "company": "string",
      "jobTitle": "string",
      "startDate": "string (e.g. Jan 2020)",
      "endDate": "string (e.g. Dec 2022 or Present)",
      "responsibilities": "string (all bullet points joined by newlines)"
    }
  ],
  "education": [
    {
      "id": "string (e.g. edu1)",
      "degree": "string",
      "school": "string",
      "graduationYear": "string"
    }
  ],
  "skills": ["string"],
  "projects": [
    {
      "id": "string (e.g. proj1)",
      "name": "string",
      "description": "string",
      "link": "string"
    }
  ],
  "languages": [
    {
      "id": "string (e.g. lang1)",
      "name": "string",
      "proficiency": "string (e.g. Native, Fluent, Intermediate, Basic)"
    }
  ]
}

CV Text:
${text.slice(0, 8000)}`;

    const raw = await groqChat(GROQ_LARGE, systemPrompt, userPrompt, { temperature: 0.1 });
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    const profile: UserProfile = {
        personalInfo: {
            name: parsed.personalInfo?.name || '',
            email: parsed.personalInfo?.email || '',
            phone: parsed.personalInfo?.phone || '',
            location: parsed.personalInfo?.location || '',
            linkedin: parsed.personalInfo?.linkedin || '',
            website: parsed.personalInfo?.website || '',
            github: parsed.personalInfo?.github || '',
        },
        summary: parsed.summary || '',
        workExperience: (parsed.workExperience || []).map((exp: any, i: number): WorkExperience => ({
            id: exp.id || `exp_${i + 1}_${Date.now()}`,
            company: exp.company || '',
            jobTitle: exp.jobTitle || '',
            startDate: exp.startDate || '',
            endDate: exp.endDate || '',
            responsibilities: exp.responsibilities || '',
        })),
        education: (parsed.education || []).map((edu: any, i: number): Education => ({
            id: edu.id || `edu_${i + 1}_${Date.now()}`,
            degree: edu.degree || '',
            school: edu.school || '',
            graduationYear: edu.graduationYear || '',
        })),
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        projects: (parsed.projects || []).map((proj: any, i: number): Project => ({
            id: proj.id || `proj_${i + 1}_${Date.now()}`,
            name: proj.name || '',
            description: proj.description || '',
            link: proj.link || '',
        })),
        languages: (parsed.languages || []).map((lang: any, i: number): Language => ({
            id: lang.id || `lang_${i + 1}_${Date.now()}`,
            name: lang.name || '',
            proficiency: lang.proficiency || '',
        })),
    };

    return profile;
}
