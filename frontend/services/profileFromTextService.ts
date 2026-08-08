/**
 * Generate UserProfile from raw text + JSON parse helper.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile } from '../types';
import { groqChat, GROQ_LARGE } from './groqService';
import { SYSTEM_INSTRUCTION_PARSER } from './pipelineRules';
import { purifyProfile } from './cvPurificationPipeline';
import { normaliseCustomSections } from '../utils/normaliseSectionType';
import { getSelectedProvider } from './groqService';
import { workerTieredLLM } from './cvEngineClient';

export const USER_PROFILE_SCHEMA = `
RETURN FORMAT — output ONLY a raw JSON object (no markdown, no code fences) matching this schema exactly:
{
  "personalInfo": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "linkedin": "string (full URL if present)",
    "website": "string (portfolio / personal site URL)",
    "github": "string (GitHub URL if present)"
  },
  "summary": "string (professional summary or objective — copy verbatim if present, otherwise empty string)",
  "workExperience": [
    {
      "id": "string (unique, e.g. 'exp1')",
      "company": "string",
      "jobTitle": "string",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or Present",
      "responsibilities": "string — every bullet point separated by \\n. Preserve ALL bullet points in full. Do NOT summarise or truncate."
    }
  ],
  "education": [
    {
      "id": "string",
      "degree": "string (full degree name and field of study)",
      "school": "string",
      "graduationYear": "string (YYYY or expected YYYY)"
    }
  ],
  "skills": ["string — include every technical skill, tool, language, framework, and soft skill listed"],
  "projects": [
    { "id": "string", "name": "string", "description": "string (full description, do not truncate)", "link": "string" }
  ],
  "languages": [
    { "id": "string", "name": "string (language name)", "proficiency": "string (e.g. Native, Fluent, Intermediate, Basic, or CEFR level)" }
  ],
  "customSections": [
    {
      "id": "string (unique, e.g. 'cs1')",
      "type": "certifications | awards | publications | volunteer | presentations | patents | courses | memberships | achievements | hobbies | interests | custom",
      "label": "string (exact section heading from the document, e.g. 'Certifications', 'Awards & Honours', 'Publications', 'Volunteer Experience')",
      "items": [
        {
          "id": "string (unique)",
          "title": "string (certification name / award name / publication title / role title)",
          "subtitle": "string (issuing body / journal / organisation — optional)",
          "year": "string (year or year range — optional)",
          "description": "string (any additional detail — optional)"
        }
      ]
    }
  ]
}

EXTRACTION RULES — follow these precisely. This is a verbatim transcription task, not a rewrite:
1. Extract EVERY section visible in the document, including but not limited to: certifications, licences, awards, honours, publications, patents, volunteer work, community service, professional memberships, conference presentations, courses, training programmes, hobbies, and interests.
2. Put each extra section into the customSections array with the correct type, using the section's exact original heading as its label.
3. Preserve ALL bullet points in responsibilities — do NOT summarise or drop any bullet.
4. Preserve ALL skills listed — do NOT drop any.
5. Do NOT invent data — only extract what is visibly present in the document. Do NOT paraphrase, summarise, or group items (e.g. skills) into a new label that does not literally appear in the source — a fabricated "certification" name built from skill text is strictly forbidden.
6. Languages belong ONLY in the dedicated "languages" field — never in customSections, and never duplicated anywhere else.
7. Never place the same real-world item (the same certification, language, project, membership, etc.) in more than one field or section.
8. If a section is absent, omit it from the output (do not include empty arrays or null values). Do not invent placeholder or example content to fill an apparently-missing section.
`;


/**
 * Robustly strips markdown code fences and extracts the first valid JSON object
 * from LLM output. Falls back to bracket-depth scanning when the model emits
 * prose before/after the JSON block, then tries a backwards-walk repair for
 * truncated responses. Throws only if no valid JSON can be recovered.
 */
export function _normalizeProfileIds(profile: UserProfile): UserProfile {
    let counter = 1;
    const uid = () => `gen_${Date.now()}_${counter++}`;

    const fixIds = <T extends { id?: string }>(arr?: T[]): T[] | undefined => {
        if (!arr) return arr;
        return arr.map(item => (!item.id ? { ...item, id: uid() } : item));
    };

    const fixCustomSections = (sections?: any[]): any[] | undefined => {
        if (!sections) return sections;
        return sections.map(sec => ({
            ...sec,
            id: sec.id || uid(),
            items: (sec.items || []).map((item: any) =>
                (!item.id ? { ...item, id: uid() } : item)
            ),
        }));
    };

    return {
        ...profile,
        workExperience: fixIds(profile.workExperience) || [],
        education:      fixIds(profile.education)      || [],
        projects:       fixIds(profile.projects),
        languages:      fixIds(profile.languages),
        references:     fixIds(profile.references as any) as any,
        customSections: fixCustomSections(profile.customSections),
    };
}


export function parseProfileJson(raw: string): UserProfile {
    // Step 1: strip the outermost code fence (```json ... ``` or ``` ... ```)
    const stripped = raw.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

    // Step 2: try the stripped string as-is
    try { return JSON.parse(stripped) as UserProfile; } catch { /* fall through */ }

    // Step 3: bracket-depth scan — handles prose before/after the JSON block
    const start = stripped.indexOf('{');
    if (start !== -1) {
        let depth = 0, inString = false, escaping = false;
        for (let i = start; i < stripped.length; i++) {
            const ch = stripped[i];
            if (escaping) { escaping = false; continue; }
            if (ch === '\\' && inString) { escaping = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') depth++;
            if (ch === '}') {
                depth--;
                if (depth === 0) {
                    try { return JSON.parse(stripped.slice(start, i + 1)) as UserProfile; } catch { break; }
                }
            }
        }
        // Step 4: backwards-walk repair for truncated token-limit responses
        for (let i = stripped.lastIndexOf('}'); i >= start; i--) {
            if (stripped[i] === '}') {
                try { return JSON.parse(stripped.slice(start, i + 1)) as UserProfile; } catch { /* keep walking */ }
            }
        }
    }

    throw new SyntaxError(`Profile import: could not extract valid JSON from model response (${stripped.length} chars). The AI may have returned an unexpected format — please try again.`);
}

export const generateProfile = async (rawText: string, githubUrl?: string): Promise<UserProfile> => {
    let githubInstruction = '';
    if (githubUrl) {
        githubInstruction = `
        **GitHub Deep Analysis (CRITICAL)**: The user has provided a GitHub profile: ${githubUrl}. You must analyze the public data that would be available from this URL (e.g., repository names, primary languages, commit history insights) to significantly enrich the profile.
        - **Project Population**: Populate the 'projects' array with the *top 5 most impressive* public repositories.
        - **Project Details**: For each, use the repo name for 'name', generate a **concise, high-impact 'description'** detailing its function, and generate a valid repository 'link'.
        - **Skill Extraction**: Add ALL key programming languages, frameworks, and technical tools discovered from the repositories to the main 'skills' list.
        - **Profile Completion**: Infer missing personal details (like name, location, summary) from the GitHub profile if not present in the RAW TEXT.
        `;
    }

    const prompt = `
        Your goal is to perform a comprehensive data merge. Prioritize explicit data from the RAW TEXT, and use the GitHub profile to fill gaps, validate data, and significantly enhance the 'skills' and 'projects' sections.

        ### SOURCE DATA
        RAW TEXT:
        ${rawText || 'No raw text provided. Rely entirely on GitHub analysis.'}
        
        ${githubInstruction}

        ### INSTRUCTIONS FOR JSON CONSTRUCTION
        1. Date Standardization: Accurately parse all dates. Standardize all dates to 'YYYY-MM-DD'. Use the first day of the month/year if a full date is missing. 'endDate' for current roles must be the string 'Present'.
        2. Unique IDs: Generate a unique, simple string 'id' (e.g., a timestamp-like string) for all array items (workExperience, education, projects, languages).
        3. Work Experience: Maintain the original 'responsibilities' text structure (use \\n for bullet points).
        4. Output: Return ONLY the JSON object that strictly adheres to the schema below.
        
        ${USER_PROFILE_SCHEMA}
    `;

    // Route to the user's configured provider — no silent fallback to a different one.
    let text: string | null = null;
    const provider = getSelectedProvider();

    if (provider === 'workers-ai') {
        // Workers AI explicitly selected — use it only, never fall back to Groq.
        // Parsing a full CV on the free tier's mistral-small model can take
        // 25-60s+ under load — give it real headroom (90s, matches the client
        // default) instead of aborting early and mislabeling a slow response
        // as an "empty" one.
        const parserOpts = {
            system: SYSTEM_INSTRUCTION_PARSER,
            temperature: 0.1,
            json: true,
            maxTokens: 4096,
            timeoutMs: 90_000,
        };
        let cf = await workerTieredLLM('parser', prompt, parserOpts);
        if (!cf?.trim()) {
            // One silent retry — a single cold/slow call shouldn't surface the
            // scary error immediately when a second attempt often succeeds.
            cf = await workerTieredLLM('parser', prompt, parserOpts);
        }
        if (!cf?.trim()) {
            throw new Error('Workers AI returned an empty response. The model may be warming up — please try again, or click "Wake AI models" in Settings.');
        }
        text = cf;
    } else {
        // All other providers: route strictly through the selected provider via groqChat.
        // No silent fallback to Claude or any other provider.
        text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true, maxTokens: 4096 });
    }
    const profileData: UserProfile = _normalizeProfileIds(parseProfileJson(text));
    profileData.projects = profileData.projects || [];
    profileData.education = profileData.education || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages = profileData.languages || [];
    profileData.customSections = normaliseCustomSections(profileData.customSections || []);

    return profileData;
};
