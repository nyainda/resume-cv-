/**
 * Profile generation helpers: humanize, parse, generateProfile, section order.
 * Extracted from geminiService — logic unchanged.
 */

import { UserProfile, ScholarshipFormat } from '../../types';
import { groqChat, GROQ_LARGE, GROQ_FAST } from '../groqService';
import { SYSTEM_INSTRUCTION_HUMANIZER, SYSTEM_INSTRUCTION_PARSER, HUMANIZATION_RULES } from './rulesState';
import { purifyText, purifyProfile } from '../cvPurificationPipeline';
import { normaliseCustomSections } from '../../utils/normaliseSectionType';

export function buildSectionOrderInstruction(profile: UserProfile): string {
    const sectionLabels: Record<string, string> = {
        summary: 'Professional Summary',
        workExperience: 'Work Experience',
        education: 'Education',
        skills: 'Skills',
        projects: 'Projects',
        languages: 'Languages',
        references: 'References',
    };

    let instruction = '';

    if (profile.sectionOrder && profile.sectionOrder.length > 0) {
        const ordered = profile.sectionOrder
            .map((k, i) => `${i + 1}. ${sectionLabels[k] || k}`)
            .join(', ');
        instruction += `**SECTION ORDER PREFERENCE**: The user prefers sections in this order: ${ordered}. Please generate the CV with content prioritised and structured to reflect this ordering.\n`;
    }

    if (profile.customSections && profile.customSections.length > 0) {
        const names = profile.customSections.map(s => s.label).join(', ');
        instruction += `**ADDITIONAL SECTIONS**: The user has custom profile sections (${names}) which will be appended automatically after the template. You do not need to generate content for these — they are pre-filled by the user.\n`;
    }

    return instruction;
}

// --- UserProfile JSON schema description for Groq prompts ---
const USER_PROFILE_SCHEMA = `
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

// --- CVData JSON schema description for Groq prompts ---
let CV_DATA_SCHEMA = ``; // populated by loadRules() — text lives in CF Worker

// --- Humanize a block of plain text to remove AI patterns ---
export const humanizeText = async (text: string): Promise<string> => {
    const prompt = `Rewrite the following professional text so it sounds naturally human-written. Preserve all facts, dates, names, and numbers. Only change phrasing and style.\n\nTEXT TO REWRITE:\n${text}`;
    // Use Cloudflare Workers AI only when it is the selected provider.
    if (getSelectedProvider() === 'workers-ai') {
        try {
            const cf = await workerTieredLLM('humanize', prompt, {
                system: SYSTEM_INSTRUCTION_HUMANIZER,
                temperature: 0.8,
                maxTokens: 2500,
            });
            if (cf && cf.trim()) return cf;
        } catch (cfErr) {
            console.warn('[humanizeText] Worker call failed, falling back to selected provider:', cfErr);
        }
    }
    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.8, maxTokens: 2500 });
};

// --- Build scholarship format-specific instructions ---
export function buildScholarshipFormatInstruction(format: ScholarshipFormat): string {
    switch (format) {
        case 'europass':
            return `
            **EUROPASS FORMAT REQUIREMENTS** (EU Standard):
            - Structure the summary as a 'Personal Statement' in first person, 2-3 sentences.
            - Include a 'Languages' section with proficiency levels using CEFR scale (A1/A2/B1/B2/C1/C2/Native).
            - List 'Digital Competencies' in skills (e.g., Microsoft Office, data analysis tools).
            - Note any voluntary/community work in the experience section if available.
            - Education descriptions should include ECTS credits or equivalent if known.
            - The tone should be formal European academic style.
            `;
        case 'eu-horizon':
            return `
            **EU HORIZON EUROPE / MARIE CURIE / ERC FORMAT REQUIREMENTS**:
            - Summary = 'Research Excellence Statement': Start with the impact of your research, then methodology, then future vision (3-4 sentences).
            - Highlight cross-border collaborations and international experience prominently.
            - Publications: Emphasize only last 5 years. Include impact factor or citation count if inferable.
            - Experience bullets should explicitly mention: research outputs, grants won, students supervised, and EU/international connections.
            - Skills: Lead with research methodologies, then domain expertise, then tools.
            - Include any 'Outreach & Dissemination' activities in projects.
            - Add a note about 'Commitment to Open Science' principles if relevant.
            `;
        case 'nih-nsf':
            return `
            **NIH/NSF BIOSKETCH FORMAT REQUIREMENTS** (US Government):
            - Summary = 'Personal Statement': 4 sentences max. Must state: (1) research area, (2) why uniquely qualified, (3) 1-2 key publications, (4) relevance to this grant.
            - Experience section = 'Positions, Scientific Appointments, and Honors'.
            - Publications must be listed with all authors, journal, year, PMID or DOI where possible.
            - Add 'Contributions to Science' section description in each experience bullet — describe scientific significance.
            - Skills should include lab techniques, analytical methods, and software (R, SPSS, etc.).
            - Follow NIH page limit spirit: be concise and specific, no filler.
            `;
        case 'chevening':
            return `
            **CHEVENING SCHOLARSHIP FORMAT REQUIREMENTS** (UK FCDO):
            - Summary = 'Leadership & Ambassadorial Potential Statement': Show clear leadership trajectory, influencing others, community impact (3-4 sentences).
            - Experience bullets must highlight: leadership moments, decisions made, people influenced/led, measurable outcomes.
            - Include any networking, professional associations, or convening roles prominently.
            - Projects should demonstrate UK-relevant connections or aspirations.
            - Add future career vision aligned with post-study return to home country.
            - Tone: Confident, aspirational, personal. Show a person who will be an ambassador.
            `;
        case 'commonwealth':
            return `
            **COMMONWEALTH SCHOLARSHIP FORMAT REQUIREMENTS** (CSC):
            - Summary: Lead with development impact and home country context. Explain how UK study supports national development goals (3-4 sentences).
            - Experience bullets: Show how work contributes to community/national development goals.
            - Include any government, NGO, or policy work prominently.
            - Projects: Frame around societal/development impact, not just technical achievement.
            - Add commitment to return to home country and apply learning.
            - Skills: Include languages, community engagement, and policy/advocacy skills.
            - Tone: Purpose-driven, development-focused, collaborative.
            `;
        default:
            return `
            **STANDARD ACADEMIC CV FORMAT**:
            - Summary = 'Research Statement' or 'Academic Objective' (2-4 sentences).
            - Emphasize research contributions, academic achievements, and teaching experience.
            - List publications prominently with full citation details.
            - Skills: Research methods, academic software, statistical tools, domain expertise.
            - Education: Include GPA/grade, thesis title, and key coursework where available.
            `;
    }
}

/**
 * Robustly strips markdown code fences and extracts the first valid JSON object
 * from LLM output. Falls back to bracket-depth scanning when the model emits
 * prose before/after the JSON block, then tries a backwards-walk repair for
 * truncated responses. Throws only if no valid JSON can be recovered.
 */
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

/**
 * Ensures every array item in an imported/extracted UserProfile has a unique
 * `id` field. The extraction AI sometimes omits IDs or returns empty strings,
 * which causes React key warnings and can make sections silently skip rendering
 * in templates that use `.map((item, i) => <div key={item.id}>`)`.
 */
function _normalizeProfileIds(profile: UserProfile): UserProfile {
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

