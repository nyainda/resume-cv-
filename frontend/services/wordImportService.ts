import mammoth from 'mammoth';
import { GoogleGenAI } from '@google/genai';
import { UserProfile, WorkExperience, Education, Project, Language } from '../types';
import { groqChat, GROQ_LARGE, GROQ_FAST } from './groqService';
import { getGeminiKey as _rtGemini, getClaudeKey as _rtClaude } from './security/RuntimeKeys';
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
    const rt = _rtGemini();
    if (rt) return rt;
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

function getClaudeKey(): string | null {
    const rt = _rtClaude();
    if (rt) return rt;
    try {
        const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (s) {
            const p = JSON.parse(s);
            if (p.claudeApiKey && !p.claudeApiKey.startsWith('enc:v1:')) return p.claudeApiKey.replace(/^"|"$/g, '');
        }
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

const PARSE_SYSTEM = `You are an expert CV parser. Extract all structured information from CV/resume text and return it as valid JSON. Do not invent data — only extract what is explicitly present. Return only valid JSON, no markdown, no code fences, no prose.`;

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

/** Parse CV text using Claude Haiku (preferred — 200 K context, no token-limit issues). */
async function parseWithClaude(text: string): Promise<UserProfile> {
    const apiKey = getClaudeKey();
    if (!apiKey) throw new Error('No Claude API key');

    const userPrompt = `Extract all structured information from the following CV text and return a raw JSON object matching this exact schema:\n\n${PARSE_SCHEMA}\n\nCV Text:\n${text.slice(0, 150_000)}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 4096,
            temperature: 0.1,
            system: PARSE_SYSTEM,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });

    if (!res.ok) {
        const raw = await res.text().catch(() => '');
        let msg = '';
        try { msg = JSON.parse(raw)?.error?.message || ''; } catch {}
        const err: any = new Error(msg || `Claude error ${res.status}`);
        err.status = res.status;
        throw err;
    }

    const data = await res.json();
    const raw = ((data?.content?.[0]?.text as string) || '')
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(raw));
}

/** Parse CV text using Gemini 2.0 Flash (fallback when no Claude key). */
async function parseWithGemini(text: string): Promise<UserProfile> {
    const geminiKey = getGeminiKey();
    if (!geminiKey) throw new Error('No Gemini API key configured. Please add one in Settings.');

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = `${PARSE_SYSTEM}\n\nExtract all structured information from the following CV/resume text and return ONLY a raw JSON object matching this schema:\n\n${PARSE_SCHEMA}\n\nCV Text:\n${text.slice(0, 8_000)}`;

    const result = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
    const raw = (result.text || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(raw));
}

/** Parse CV text using the groqChat chain (Workers AI → Claude → Gemini). */
async function parseWithChain(text: string): Promise<UserProfile> {
    const userPrompt = `Extract all structured information from the following CV text and return a raw JSON object matching this exact schema:\n\n${PARSE_SCHEMA}\n\nCV Text:\n${text.slice(0, 8_000)}`;
    const raw = await groqChat(GROQ_FAST, PARSE_SYSTEM, userPrompt, { temperature: 0.1 });
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(cleaned));
}

export async function parseWordTextToProfile(text: string): Promise<UserProfile> {
    const { cleaned, changes } = cleanImportedText(text);
    if (changes.length) {
        console.info(`[Import] Scrubbed ${changes.length} forbidden phrase(s) from uploaded CV:`, changes.join('; '));
    }

    // ── Priority: Claude (200 K ctx) → Gemini → groqChat chain ──────────────
    const claudeKey = getClaudeKey();
    if (claudeKey) {
        try {
            console.info('[Import] Parsing CV text with Claude.');
            return await parseWithClaude(cleaned);
        } catch (err) {
            console.warn('[Import] Claude parsing failed, trying Gemini:', err);
        }
    }

    const geminiKey = getGeminiKey();
    if (geminiKey) {
        try {
            console.info('[Import] Parsing CV text with Gemini.');
            return await parseWithGemini(cleaned);
        } catch (err) {
            console.warn('[Import] Gemini parsing failed, trying chain:', err);
        }
    }

    console.info('[Import] Parsing CV text via groqChat chain (Workers AI → Claude → Gemini).');
    return await parseWithChain(cleaned);
}
