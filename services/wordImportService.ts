import mammoth from 'mammoth';
import { UserProfile, WorkExperience, Education, Project, Language } from '../types';

// ── Parse .docx file to plain text ─────────────────────────────────────────

export async function extractTextFromDocx(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

// ── Use Gemini to parse the extracted text into a UserProfile ──────────────

export async function parseWordTextToProfile(text: string): Promise<UserProfile> {
    const { GoogleGenAI } = await import('@google/genai');

    let apiKey: string | undefined;
    let provider: string = 'gemini';

    const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
    if (settingsString) {
        const settings = JSON.parse(settingsString);
        provider = settings.provider || 'gemini';
        if (settings.apiKey && settings.provider === 'gemini') {
            apiKey = settings.apiKey.replace(/^"|"$/g, '');
        }
    }

    // Fallback: provider_keys cache (namespaced, IDB-backed, Drive-synced)
    if (!apiKey) {
        try {
            const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
            if (providerKeys[provider]) {
                apiKey = providerKeys[provider].replace(/^"|"$/g, '');
            }
        } catch { /* ignore */ }
    }

    if (!apiKey && typeof process !== 'undefined' && process.env.GEMINI_API_KEY) {
        apiKey = process.env.GEMINI_API_KEY;
    }
    if (!apiKey) throw new Error('API key not found. Please add your Gemini API key in Settings.');

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert CV parser. Extract all structured information from the following CV/resume text and return it as valid JSON matching this exact schema. Do not invent data — only extract what is explicitly present.

Schema:
{
  "personalInfo": {
    "name": string,
    "email": string,
    "phone": string,
    "location": string,
    "linkedin": string,
    "website": string,
    "github": string
  },
  "summary": string,
  "workExperience": [
    {
      "id": string (generate a unique id like "exp1"),
      "company": string,
      "jobTitle": string,
      "startDate": string (e.g. "Jan 2020"),
      "endDate": string (e.g. "Dec 2022" or "Present"),
      "responsibilities": string (combine all bullet points into one multiline string separated by newlines)
    }
  ],
  "education": [
    {
      "id": string (generate a unique id like "edu1"),
      "degree": string,
      "school": string,
      "graduationYear": string
    }
  ],
  "skills": string[] (flat list of skills),
  "projects": [
    {
      "id": string (generate a unique id like "proj1"),
      "name": string,
      "description": string,
      "link": string
    }
  ],
  "languages": [
    {
      "id": string (generate a unique id like "lang1"),
      "name": string,
      "proficiency": string (e.g. "Native", "Fluent", "Intermediate", "Basic")
    }
  ]
}

CV Text:
${text.slice(0, 8000)}

Return only valid JSON, no markdown, no code fences, no prose.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const raw = response.text?.trim() || '';
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
