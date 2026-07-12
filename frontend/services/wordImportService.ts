import mammoth from 'mammoth';
import { UserProfile, WorkExperience, Education, Project, Language } from '../types';
import { getSelectedProvider } from './groqService';
import { workerProxyLLM, workerTieredLLM } from './cvEngineClient';
import { getGeminiKey as _rtGemini, getClaudeKey as _rtClaude } from './security/RuntimeKeys';
import { cleanImportedText } from './cvPurificationPipeline';
import { normaliseCustomSections } from '../utils/normaliseSectionType';

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

// NOTE: customSections MUST stay in this schema. Earlier versions of this
// schema had no field for certifications/memberships/awards/etc at all —
// buildUserProfile() silently dropped anything the model returned outside
// these keys, so real "Certifications", "Memberships", "Projects" etc.
// sections from the source CV were discarded on every Workers AI / BYOK
// import, and the downstream CV-generation step then fabricated plausible-
// looking replacement content to fill those sections in the final CV. Do
// not remove customSections without also fixing that generation-time gap.
const PARSE_SCHEMA = `{
  "personalInfo": { "name": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": "", "github": "" },
  "summary": "",
  "workExperience": [{ "id": "", "company": "", "jobTitle": "", "startDate": "", "endDate": "", "responsibilities": "" }],
  "education": [{ "id": "", "degree": "", "school": "", "graduationYear": "" }],
  "skills": [],
  "projects": [{ "id": "", "name": "", "description": "", "link": "" }],
  "languages": [{ "id": "", "name": "", "proficiency": "" }],
  "customSections": [
    {
      "id": "",
      "type": "certifications | awards | publications | volunteer | presentations | patents | courses | memberships | achievements | hobbies | interests | custom",
      "label": "exact section heading as written in the document, e.g. 'Certifications', 'Memberships'",
      "items": [
        { "id": "", "title": "exact item text as written", "subtitle": "", "year": "", "description": "" }
      ]
    }
  ]
}`;

// Shared extraction rules for every provider's parser prompt. Written to
// stop two observed failure modes on real-world CVs: (1) the model dropping
// entire sections (certifications, memberships, projects) instead of
// mapping them into customSections, and (2) the model inventing plausible-
// sounding replacement content (e.g. turning skill phrases into fake
// certification names) when it isn't confident how to classify something.
const PARSE_EXTRACTION_RULES = `
EXTRACTION RULES — follow these exactly, this is a verbatim transcription task, not a rewrite:
1. Extract EVERY section visible in the document — including certifications, licences, awards, honours, publications, patents, volunteer work, professional memberships, conference presentations, courses, training, hobbies, and interests — even ones not explicitly named here. Map each such extra section into "customSections" using the closest matching "type" and the section's exact original heading as "label".
2. Languages belong ONLY in the dedicated "languages" field. Never put a language name in customSections, and never repeat a language entry in more than one place.
3. Every item you output must be copied verbatim (or lightly reformatted for dates/structure only) from the source text. Do NOT invent, paraphrase, summarise, or group items into a new label that doesn't literally appear in the document — e.g. do NOT turn a list of technical skills into invented "certification" names. If you are not sure a section exists, leave it out entirely rather than guessing at its contents.
4. Do NOT drop or omit any section, bullet point, project, skill, or item that is genuinely present in the source text just because it doesn't fit neatly into a known category — put it in customSections with type "custom" rather than deleting it.
5. Never place the same real-world item (the same certification, language, project, etc.) in two different sections/fields.
6. If a section is genuinely absent from the document, omit that field/array entirely — do not invent placeholder or example content to fill it.
`;

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
        customSections: normaliseCustomSections(
            (Array.isArray(parsed.customSections) ? parsed.customSections : []).map((sec: any, i: number) => ({
                id:    sec.id || `cs_${i + 1}_${Date.now()}`,
                type:  sec.type  || 'custom',
                label: sec.label || '',
                items: (Array.isArray(sec.items) ? sec.items : []).map((item: any, j: number) => ({
                    id:          item.id || `csi_${i + 1}_${j + 1}_${Date.now()}`,
                    title:       item.title       || '',
                    subtitle:    item.subtitle    || '',
                    year:        item.year        || '',
                    description: item.description || '',
                })),
            })),
        ),
    } as UserProfile;
}

async function parseWithClaude(text: string): Promise<UserProfile> {
    const apiKey = getClaudeKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings → AI Keys.');

    const userPrompt = `Extract all structured information from the following CV text and return a raw JSON object matching this exact schema:\n\n${PARSE_SCHEMA}\n${PARSE_EXTRACTION_RULES}\nCV Text:\n${text.slice(0, 150_000)}`;

    // maxTokens raised to 16000 (PROXY_HARD_MAX_TOKENS on the worker) — this is
    // BYOK, so token cost is the user's own Claude bill, not a Replit/CF cost;
    // there's no reason to risk truncating the JSON response on a long CV.
    const raw = await workerProxyLLM('parser', userPrompt, {
        provider:    'claude',
        apiKey,
        maxTokens:   16000,
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

    // 8_000 chars used to be a hard truncation here — long CVs routinely lost
    // entire trailing sections (certifications, memberships, languages) that
    // fall past that cutoff. Gemini 2.5 Flash has ample context, so give the
    // full text room (well beyond any real CV's length).
    const userPrompt = `Extract all structured information from the following CV/resume text and return ONLY a raw JSON object matching this schema:\n\n${PARSE_SCHEMA}\n${PARSE_EXTRACTION_RULES}\nCV Text:\n${text.slice(0, 60_000)}`;

    // maxTokens raised to 16000 (PROXY_HARD_MAX_TOKENS on the worker) — BYOK,
    // so token cost is the user's own Gemini bill; no reason to risk truncating
    // the JSON response on a long CV.
    const raw = await workerProxyLLM('parser', userPrompt, {
        provider:    'gemini',
        apiKey,
        maxTokens:   16000,
        temperature: 0.1,
        json:        true,
        timeoutMs:   40_000,
    });
    if (!raw) throw new Error('Worker proxy returned no text for Gemini parse');
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(cleaned));
}

async function parseWithWorkersAI(text: string): Promise<UserProfile> {
    // 8_000 chars used to be a hard truncation here — on longer real-world
    // CVs (multiple roles + projects + certifications + memberships +
    // languages, as in the "Elgon Kenya" sample that surfaced this bug) the
    // trailing sections never even reached the model, so it had nothing to
    // extract them from and either dropped them or fabricated substitutes to
    // satisfy the schema. Raised well above any realistic CV length.
    // maxTokens raised to 8192 — the CF Workers tiered-llm endpoint's hard cap
    // (TIERED_LLM_HARD_MAX_TOKENS in the worker). This is the free tier — there
    // is no per-token cost to the user here, so there is no reason to under-
    // request output room and risk a CV with many sections getting its JSON
    // response cut off mid-way.
    const userPrompt = `Extract all structured information from the following CV text and return a raw JSON object matching this exact schema:\n\n${PARSE_SCHEMA}\n${PARSE_EXTRACTION_RULES}\nCV Text:\n${text.slice(0, 60_000)}`;
    const raw = await workerTieredLLM('parser', userPrompt, { temperature: 0.1, json: true, maxTokens: 8192, timeoutMs: 90_000 });
    if (!raw) throw new Error('Workers AI returned no text for CV parse');
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return buildUserProfile(JSON.parse(cleaned));
}

/**
 * Parse extracted CV/resume text into a structured UserProfile.
 * All three providers (Workers AI, Claude, Gemini) do full-text extraction
 * using the same schema and prompt — no truncation, no fallback chain.
 */
export async function parseWordTextToProfile(text: string): Promise<UserProfile> {
    const { cleaned, changes } = cleanImportedText(text);
    if (changes.length) {
        console.info(`[Import] Scrubbed ${changes.length} forbidden phrase(s) from uploaded CV:`, changes.join('; '));
    }

    const provider = getSelectedProvider();

    if (provider === 'claude') {
        console.info('[Import] Parsing CV with Claude (BYOK).');
        return await parseWithClaude(cleaned);
    }

    if (provider === 'gemini') {
        console.info('[Import] Parsing CV with Gemini (BYOK).');
        return await parseWithGemini(cleaned);
    }

    console.info('[Import] Parsing CV with Workers AI.');
    return await parseWithWorkersAI(cleaned);
}
