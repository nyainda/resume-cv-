import mammoth from 'mammoth';
import { GoogleGenAI } from '@google/genai';
import { UserProfile, WorkExperience, Education, Project, Language } from '../types';
import { groqChat, GROQ_LARGE, GROQ_FAST, hasGroqKey } from './groqService';
import { getGeminiKey as _rtGemini } from './security/RuntimeKeys';
import { cleanImportedText } from './cvPurificationPipeline';

export async function extractTextFromDocx(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

export async function extractTextFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

function getGeminiKey(): string | null {
    // 1. In-memory decrypted key (primary)
    const rt = _rtGemini();
    if (rt) return rt;

    // 2. Legacy plaintext fallback (migration path)
    try {
        const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (s) {
            const p = JSON.parse(s);
            if (p.apiKey && !p.apiKey.startsWith('enc:v1:')) return p.apiKey.replace(/^"|"$/g, '');
        }
        const pk = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
        if (pk.gemini && !pk.gemini.startsWith('enc:v1:')) return pk.gemini.replace(/^"|"$/g, '');
    } catch { }
    return null;
}

const PARSE_SCHEMA = `{
  "personalInfo": { "name": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": "", "github": "" },
  "summary": "",
  "workExperience": [{ "id": "", "company": "", "jobTitle": "", "startDate": "", "endDate": "", "responsibilities": "" }],
  "education": [{ "id": "", "degree": "", "school": "", "graduationYear": "" }],
  "skills": [],
  "projects": [{ "id": "", "name": "", "description": "", "link": "" }],
  "languages": [{ "id": "", "name": "", "proficiency": "" }]
}`;

function buildUserProfile(parsed: any): UserProfile {
    return {
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
}

async function parseWithGroq(text: string): Promise<UserProfile> {
    const systemPrompt = `You are an expert CV parser. Extract all structured information from CV/resume text and return it as valid JSON. Do not invent data — only extract what is explicitly present. Return only valid JSON, no markdown, no code fences, no prose.`;
    const userPrompt = `Extract all structured information from the following CV text and return a raw JSON object matching this exact schema:\n\n${PARSE_SCHEMA}\n\nCV Text:\n${text.slice(0, 8000)}`;
    const raw = await groqChat(GROQ_FAST, systemPrompt, userPrompt, { temperature: 0.1 });
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(cleaned));
}

async function parseWithGemini(text: string): Promise<UserProfile> {
    const geminiKey = getGeminiKey();
    if (!geminiKey) throw new Error('No AI API key configured. Please add a Gemini or Groq key in Settings.');

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = `You are an expert CV parser. Extract all structured information from the following CV/resume text and return ONLY a raw JSON object (no markdown, no code fences, no prose) matching this schema:\n\n${PARSE_SCHEMA}\n\nCV Text:\n${text.slice(0, 8000)}`;

    const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
    });
    const raw = result.text || '';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(cleaned));
}

export async function parseWordTextToProfile(text: string): Promise<UserProfile> {
    // ── HOT FIRE: scrub buzzwords from the imported text BEFORE the AI parser
    // sees it. Any forbidden phrase that exists in the user's uploaded CV
    // would otherwise flow straight into the structured profile and reappear
    // in every generated CV. Substituting at the text layer also gives the
    // parser fewer "AI tells" to anchor on, improving paraphrase quality.
    const { cleaned, changes } = cleanImportedText(text);
    if (changes.length) {
        console.info(`[Import] Scrubbed ${changes.length} forbidden phrase(s) from uploaded CV:`, changes.join('; '));
    }

    // Try Gemini first (best for document parsing), fall back to Groq
    const geminiKey = getGeminiKey();
    if (geminiKey) {
        try {
            return await parseWithGemini(cleaned);
        } catch (err) {
            console.warn('Gemini parsing failed, trying Groq:', err);
        }
    }
    return parseWithGroq(cleaned);
}
