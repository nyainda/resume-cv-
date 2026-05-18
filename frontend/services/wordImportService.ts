import mammoth from 'mammoth';
import { UserProfile, WorkExperience, Education, Project, Language } from '../types';
import { getSelectedProvider } from './groqService';
import { workerProxyLLM, workerTieredLLM } from './cvEngineClient';
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

function buildUserProfile(parsed: any): UserProfile {
    return {
        personalInfo: {
            name:     parsed.personalInfo?.name     || '',
            email:    parsed.personalInfo?.email    || '',
            phone:    parsed.personalInfo?.phone    || '',
            location: parsed.personalInfo?.location || '',
            linkedin: parsed.personalInfo?.linkedin || '',
            website:  parsed.personalInfo?.website  || '',
            github:   parsed.personalInfo?.github   || '',
        },
        summary: parsed.summary || '',
        workExperience: (parsed.workExperience || []).map((exp: any, i: number): WorkExperience => ({
            id:               exp.id || `exp_${i + 1}_${Date.now()}`,
            company:          exp.company    || '',
            jobTitle:         exp.jobTitle   || '',
            startDate:        exp.startDate  || '',
            endDate:          exp.endDate    || '',
            responsibilities: exp.responsibilities || '',
        })),
        education: (parsed.education || []).map((edu: any, i: number): Education => ({
            id:             edu.id || `edu_${i + 1}_${Date.now()}`,
            degree:         edu.degree         || '',
            school:         edu.school         || '',
            graduationYear: edu.graduationYear || '',
        })),
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        projects: (parsed.projects || []).map((proj: any, i: number): Project => ({
            id:          proj.id || `proj_${i + 1}_${Date.now()}`,
            name:        proj.name        || '',
            description: proj.description || '',
            link:        proj.link        || '',
        })),
        languages: (parsed.languages || []).map((lang: any, i: number): Language => ({
            id:          lang.id || `lang_${i + 1}_${Date.now()}`,
            name:        lang.name        || '',
            proficiency: lang.proficiency || '',
        })),
    };
}

async function parseWithClaude(text: string): Promise<UserProfile> {
    const apiKey = getClaudeKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings → AI Keys.');

    const userPrompt = `Extract all structured information from the following CV text and return a raw JSON object matching this exact schema:\n\n${PARSE_SCHEMA}\n\nCV Text:\n${text.slice(0, 150_000)}`;

    const raw = await workerProxyLLM('parser', userPrompt, {
        provider:    'claude',
        apiKey,
        maxTokens:   4096,
        temperature: 0.1,
        json:        true,
        timeoutMs:   45_000,
    });
    if (!raw) throw new Error('Worker proxy returned no text for Claude parse');
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(cleaned));
}

async function parseWithGemini(text: string): Promise<UserProfile> {
    const apiKey = getGeminiKey();
    if (!apiKey) throw new Error('No Gemini API key configured. Add one in Settings → AI Keys.');

    const userPrompt = `Extract all structured information from the following CV/resume text and return ONLY a raw JSON object matching this schema:\n\n${PARSE_SCHEMA}\n\nCV Text:\n${text.slice(0, 8_000)}`;

    const raw = await workerProxyLLM('parser', userPrompt, {
        provider:    'gemini',
        apiKey,
        maxTokens:   4096,
        temperature: 0.1,
        json:        true,
        timeoutMs:   40_000,
    });
    if (!raw) throw new Error('Worker proxy returned no text for Gemini parse');
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(cleaned));
}

async function parseWithWorkersAI(text: string): Promise<UserProfile> {
    const userPrompt = `Extract all structured information from the following CV text and return a raw JSON object matching this exact schema:\n\n${PARSE_SCHEMA}\n\nCV Text:\n${text.slice(0, 8_000)}`;
    const raw = await workerTieredLLM('parser', userPrompt, { temperature: 0.1, json: true });
    if (!raw) throw new Error('Workers AI returned no text for CV parse');
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(cleaned));
}

/**
 * Parse extracted Word/docx text into a structured UserProfile.
 * Uses ONLY the provider selected in Settings — no automatic fallback.
 */
export async function parseWordTextToProfile(text: string): Promise<UserProfile> {
    const { cleaned, changes } = cleanImportedText(text);
    if (changes.length) {
        console.info(`[Import] Scrubbed ${changes.length} forbidden phrase(s) from uploaded CV:`, changes.join('; '));
    }

    const provider = getSelectedProvider();

    if (provider === 'claude') {
        console.info('[Import] Parsing CV text with Claude via worker proxy.');
        return await parseWithClaude(cleaned);
    }

    if (provider === 'gemini') {
        console.info('[Import] Parsing CV text with Gemini via worker proxy.');
        return await parseWithGemini(cleaned);
    }

    // workers-ai
    console.info('[Import] Parsing CV text with Workers AI.');
    return await parseWithWorkersAI(cleaned);
}
