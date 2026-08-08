/**
 * Section order and scholarship format prompt instructions.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile, ScholarshipFormat } from '../types';

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


