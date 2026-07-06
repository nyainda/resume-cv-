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
    // Workers AI (Mistral Small 3.1 24B) is slow on large prompts.
    // Limit to 3 500 chars so the request completes within the 45s budget.
    // BYOK users get the full text via parseWithGemini / parseWithClaude instead.
    const userPrompt = `Extract all structured information from the following CV text and return a raw JSON object matching this exact schema:\n\n${PARSE_SCHEMA}\n\nCV Text:\n${text.slice(0, 3_500)}`;
    const raw = await workerTieredLLM('parser', userPrompt, { temperature: 0.1, json: true, timeoutMs: 40_000 });
    if (!raw) throw new Error('Workers AI returned no text for CV parse');
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(cleaned));
}

/**
 * Parse extracted CV/resume text into a structured UserProfile.
 *
 * Priority order:
 *   1. Provider selected in Settings (Claude → Gemini → Workers AI)
 *   2. Automatic fallback if the primary times out / has no key:
 *      Workers AI → Gemini BYOK → Claude BYOK → throw
 *
 * Workers AI is free but limited to the first ~3 500 chars of the CV text
 * (model too slow on longer prompts). BYOK providers get the full text.
 */
export async function parseWordTextToProfile(text: string): Promise<UserProfile> {
    const { cleaned, changes } = cleanImportedText(text);
    if (changes.length) {
        console.info(`[Import] Scrubbed ${changes.length} forbidden phrase(s) from uploaded CV:`, changes.join('; '));
    }

    const provider = getSelectedProvider();

    // ── Explicit BYOK providers (full-text, no length restriction) ────────────
    if (provider === 'claude') {
        const key = getClaudeKey();
        if (key) {
            console.info('[Import] Parsing CV with Claude (BYOK).');
            return await parseWithClaude(cleaned);
        }
        console.warn('[Import] Claude selected but no API key found — falling back.');
    }

    if (provider === 'gemini') {
        const key = getGeminiKey();
        if (key) {
            console.info('[Import] Parsing CV with Gemini (BYOK).');
            return await parseWithGemini(cleaned);
        }
        console.warn('[Import] Gemini selected but no API key found — falling back.');
    }

    // ── Workers AI (free, capped at 3 500 chars) ──────────────────────────────
    try {
        console.info('[Import] Parsing CV with Workers AI (free tier, first 3 500 chars).');
        const result = await parseWithWorkersAI(cleaned);
        if (cleaned.length > 3_500) {
            console.warn('[Import] CV text was truncated for Workers AI. Add a Gemini or Claude key in Settings for a full parse.');
        }
        return result;
    } catch (workerErr) {
        console.warn('[Import] Workers AI parse failed:', (workerErr as Error).message);
    }

    // ── BYOK fallback (if key available even when not the selected provider) ──
    const geminiKey = getGeminiKey();
    if (geminiKey) {
        console.info('[Import] Falling back to Gemini BYOK after Workers AI failure.');
        return await parseWithGemini(cleaned);
    }

    const claudeKey = getClaudeKey();
    if (claudeKey) {
        console.info('[Import] Falling back to Claude BYOK after Workers AI failure.');
        return await parseWithClaude(cleaned);
    }

    throw new Error(
        'Could not parse your CV — Workers AI timed out and no API key is configured.\n\n' +
        'Add a free Gemini API key in Settings → AI Keys for a complete import, or paste your CV text manually.',
    );
}
