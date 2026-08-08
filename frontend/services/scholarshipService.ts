/**
 * Scholarship essay generation.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile } from '../types';
import { groqChat, GROQ_LARGE } from './groqService';
import { SYSTEM_INSTRUCTION_PROFESSIONAL } from './pipelineRules';

// ─── Scholarship intelligence ──────────────────────────────────────────────────

/** Per-essay-type section blueprints — injected verbatim into the prompt */
const ESSAY_STRUCTURES: Record<string, string> = {
    'personal-statement': `1. Opening Hook — a specific vivid moment or experience that defines who you are (NEVER open with "I have always been passionate about…" or any variant)
2. Academic & Professional Journey — concrete achievements, roles, and what you learned from them
3. Connection to This Scholarship — precise alignment between YOUR goals and THIS scholarship's mission and values (use details from the description)
4. Future Vision & Impact — what you will do with the funding/knowledge, with measurable specificity
5. Conclusion — forward-looking close that reinforces your fit without repeating what was already said`,

    'research-proposal': `1. Research Question — state the problem clearly and explain why it is urgent and unresolved now
2. Literature Gap — what is unknown or under-studied; why existing work is insufficient
3. Methodology — specific research design, data sources, analytical approach, and why this method is appropriate
4. Expected Contribution — what new knowledge this produces and who specifically benefits from it
5. Timeline — phased plan with realistic milestones (Phase 1 / Phase 2 / Phase 3 with approximate durations)
6. Broader Impact — societal, policy, or field-level implications beyond the immediate findings`,

    'statement-of-purpose': `1. Academic Background — relevant degrees, thesis/dissertation topic, and key research or professional experience
2. Specific Research or Professional Interests — precise intellectual questions driving you and why they matter
3. Why This Program — specific faculty members, labs, courses, or research groups by name and why they fit your work exactly
4. Career Goals — concrete next steps after the program and longer-term professional trajectory
5. Fit & Contribution — what you bring to the cohort and how your presence will benefit the institution`,

    'leadership-essay': `1. Situation — set the scene with a SPECIFIC challenge or opportunity (name the organisation, the stakes, the gap — no generic setups)
2. Your Initiative — what YOU personally decided and did — use "I", not "we"; show you initiated, not just participated
3. Actions Taken — concrete steps, decisions, and how you mobilised or influenced others
4. Measurable Outcomes — numbers, scale, recognition, or demonstrable lasting change
5. Reflection & Growth — what this taught you about leadership and how it shapes your approach today`,

    'diversity-inclusion': `1. Personal Context — your background, identity, or defining experience (be specific and authentic, not abstract or generic)
2. Challenges & How They Shaped You — honest, vulnerable account of obstacles; specificity is strength here
3. Unique Perspective — what you see or understand that others might miss, and why it matters in your field
4. Action & Advocacy — concrete things you have actually done to advance equity, inclusion, or belonging
5. Forward Commitment — specific ways you will continue and deepen this work during and after the program`,

    'why-scholarship': `1. Deep Knowledge of This Scholarship — demonstrate you understand its history, mission, and alumni impact (no generic flattery)
2. Specific Alignment — precise links between the scholarship's stated values and YOUR specific goals and experiences
3. Why Now, Why This — why this scholarship at this exact point in your career or study path
4. What You Will Contribute — to the cohort, the alumni network, and the scholarship's broader mission
5. Commitment — concrete evidence you are serious about what this scholarship stands for, beyond the financial support`,

    'academic-cover-letter': `1. Professional Introduction — who you are, current position or institution, and what you are applying for (named specifically)
2. Top Qualifications — your 3 most relevant credentials matched directly to the stated selection criteria
3. Specific Interest — why this opportunity, institution, or programme — reference real details from the description
4. Criteria Alignment — address each key selection criterion briefly but directly (one sentence per criterion)
5. Professional Close — confident call to action with contact information`,
};

/** Named scholarship intelligence packs — injected when detected in description */
const SCHOLARSHIP_VALUE_PACKS: Record<string, { label: string; values: string[]; rules: string[]; tone: string }> = {
    chevening: {
        label: 'Chevening',
        values: ['demonstrated leadership that influenced and changed others', 'concrete plan to build a lasting UK network', 'clear commitment to returning home and applying UK-gained skills', 'specific post-study career plan in home country'],
        rules: [
            'Leadership must show influence over others — not just personal achievement or participation',
            'Explicitly address what UK connections you will build and why they are essential for your goals at home',
            'The return-home commitment must be explicit, credible, and tied to a specific career goal',
            'Chevening writes four separate essays — each must stand completely alone with NO repeated anecdotes across them',
        ],
        tone: 'Confident, leadership-focused, UK-specific — strong on return-home narrative',
    },
    commonwealth: {
        label: 'Commonwealth',
        values: ['development impact in home country or region', 'commitment to returning home after study', 'community and societal benefit over personal career gain', 'contribution to sustainable development goals'],
        rules: [
            'Return-of-service is the central value — Commonwealth funds people to bring knowledge home, not to emigrate',
            'Connect the study plan to a specific, named development challenge or community need in your country',
            'Emphasise collective benefit and grassroots impact; individual ambition is secondary to community impact',
        ],
        tone: 'Service-oriented, development-focused, humble and community-centred',
    },
    fulbright: {
        label: 'Fulbright',
        values: ['US-host country cultural exchange and mutual understanding', 'project-based research or study with clear deliverables', 'role as a cultural ambassador between your country and the US'],
        rules: [
            'Cultural diplomacy matters as much as academic excellence — the essay must show you as an ambassador',
            'Explain specifically how you will share your home country\'s perspective in the US, and what knowledge you will bring back',
            'Centre a concrete, specific project or research question — Fulbright funds doers with clear plans and outputs',
        ],
        tone: 'Intellectually curious, culturally aware, diplomatically minded and project-driven',
    },
    'gates cambridge': {
        label: 'Gates Cambridge',
        values: ['outstanding intellectual ability and research potential', 'leadership that has demonstrably improved the lives of others', 'commitment to improving lives at Cambridge and beyond', 'specific fit with Cambridge\'s research environment'],
        rules: [
            'Intellect AND character are weighted equally — both must be present and concrete',
            'Must reference Cambridge specifically — a named faculty member, lab, centre, or research group',
            'The "improving lives" element must be concrete and specific — name what you did, for whom, and the measurable impact',
        ],
        tone: 'Academically rigorous, intellectually confident, socially committed and appropriately humble',
    },
    rhodes: {
        label: 'Rhodes',
        values: ['academic excellence at the highest level', 'truth, courage, and devotion to duty as demonstrated through actions', 'sustained leadership over time', 'genuine and ongoing commitment to service to the world'],
        rules: [
            'Academic achievement alone will not win Rhodes — character and service are weighted equally',
            'Let achievements speak through what you did, not how exceptional you are — avoid self-promotion',
            'Service must be genuine, sustained, and ongoing — not a one-off project or headline achievement',
            'Oxford must be genuinely essential to your specific research or leadership development — explain exactly why',
        ],
        tone: 'Understated, principled, service-first — achievements speak without boasting',
    },
    daad: {
        label: 'DAAD',
        values: ['academic merit and research excellence', 'specific institutional connection to Germany', 'structured and realistic study or research plan', 'contribution to international academic exchange'],
        rules: [
            'A concrete study plan with a specific named supervisor, German institute, or particular courses is essential',
            'Justify why Germany and this specific institution — generic praise of German universities is insufficient',
            'Emphasise the academic and methodological fit between your research and the German institution\'s known strengths',
        ],
        tone: 'Academic, structured, precise — less narrative-driven than UK or US scholarships',
    },
    erasmus: {
        label: 'Erasmus+',
        values: ['European values and intercultural competence', 'commitment to academic mobility and cross-border learning', 'cross-cultural cooperation and dialogue', 'practical contribution to European integration'],
        rules: [
            'Frame mobility itself as the value — learning to work and study across European cultures is the central point',
            'Reference specific partner institutions and name exactly what they offer that your home institution cannot',
            'Keep tone professional and practical — Erasmus panels respond to concrete plans, not grand personal narratives',
        ],
        tone: 'Professional, cooperative, practically and structurally focused',
    },
};

/** Cliché phrases that scholarship reviewers penalise — exported for client-side highlighting */
export const SCHOLARSHIP_FORBIDDEN_PHRASES = [
    'passionate about', 'always dreamed of', 'make a difference', 'since childhood',
    'truly believe', 'it would be an honor', 'i am excited to', 'hardworking and dedicated',
    'team player', 'think outside the box', 'unique opportunity', 'i am writing to express',
    'ever since i was young', 'from a young age', 'it has always been my dream',
    'i have always been', 'needless to say', 'in conclusion', 'to summarize',
    'it goes without saying', 'given the opportunity', 'i am confident that',
    'i am passionate', 'deeply passionate', 'lifelong passion',
];

/** Returns the display label of the matched scholarship, or null */
export function detectScholarshipName(description: string): string | null {
    const lower = description.toLowerCase();
    for (const [key, pack] of Object.entries(SCHOLARSHIP_VALUE_PACKS)) {
        if (lower.includes(key)) return pack.label;
    }
    return null;
}

function getScholarshipValuePack(description: string) {
    const lower = description.toLowerCase();
    for (const [key, pack] of Object.entries(SCHOLARSHIP_VALUE_PACKS)) {
        if (lower.includes(key)) return pack;
    }
    return null;
}

/** Extended profile for scholarship prompts — includes awards, publications, volunteer work from customSections */
function compactProfileForScholarship(profile: UserProfile): string {
    const awardItems = (profile.customSections ?? [])
        .filter(s => /award|honor|honour|prize|scholar|recognit|certif/i.test(s.label))
        .flatMap(s => s.items.slice(0, 6).map(i => (i as any).content || (i as any).title || '').filter(Boolean));

    const volunteerItems = (profile.customSections ?? [])
        .filter(s => /volunteer|community|civic|ngo|charity|service|social impact/i.test(s.label))
        .flatMap(s => s.items.slice(0, 6).map(i => (i as any).content || (i as any).title || '').filter(Boolean));

    const publicationItems = (profile.customSections ?? [])
        .filter(s => /publicat|research|paper|journal|thesis|dissert|conference|proceedings/i.test(s.label))
        .flatMap(s => s.items.slice(0, 8).map(i => (i as any).content || (i as any).title || '').filter(Boolean));

    const p: Record<string, unknown> = {
        personalInfo: profile.personalInfo,
        summary: profile.summary || undefined,
        education: (profile.education ?? []).map(edu => ({
            degree: edu.degree,
            school: edu.school,
            graduationYear: edu.graduationYear,
            // Extra room for thesis/dissertation titles
            description: typeof (edu as any).description === 'string'
                ? (edu as any).description.substring(0, 400) : undefined,
        })),
        workExperience: (profile.workExperience ?? []).map((exp, idx) => ({
            _role: `ROLE_${idx + 1}`,
            company: exp.company,
            jobTitle: exp.jobTitle,
            startDate: exp.startDate,
            endDate: exp.endDate,
            responsibilities: typeof exp.responsibilities === 'string'
                ? exp.responsibilities.substring(0, 500)
                : (Array.isArray(exp.responsibilities)
                    ? (exp.responsibilities as string[]).slice(0, 8).join('\n').substring(0, 500)
                    : ''),
        })),
        skills: (profile.skills ?? []).slice(0, 30),
        projects: (profile.projects ?? []).slice(0, 8).map(pr => ({
            name: pr.name,
            description: typeof pr.description === 'string' ? pr.description.substring(0, 350) : pr.description,
            link: pr.link,
        })),
        languages: profile.languages,
        awardsAndHonors: awardItems.length ? awardItems : undefined,
        publications: publicationItems.length ? publicationItems : undefined,
        volunteerAndCommunity: volunteerItems.length ? volunteerItems : undefined,
    };

    const clean = Object.fromEntries(
        Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''
            && !(Array.isArray(v) && v.length === 0))
    );
    return JSON.stringify(clean);
}

export const generateScholarshipEssay = async (params: {
    profile: UserProfile;
    essayType: string;
    essayLabel: string;
    scholarshipDescription: string;
    additionalContext: string;
    wordCount: number;
    promptHint: string;
    onStep?: (step: string) => void;
}): Promise<string> => {
    const { onStep } = params;
    const valuePack = getScholarshipValuePack(params.scholarshipDescription);
    const essayStructure = ESSAY_STRUCTURES[params.essayType] ?? ESSAY_STRUCTURES['personal-statement'];
    const forbiddenList = SCHOLARSHIP_FORBIDDEN_PHRASES.map(p => `"${p}"`).join(', ');
    const wLow  = Math.round(params.wordCount * 0.92);
    const wHigh = Math.round(params.wordCount * 1.08);

    const scholarshipBlock = valuePack ? `
### SCHOLARSHIP-SPECIFIC INTELLIGENCE: ${valuePack.label.toUpperCase()}
⚠ CRITICAL: These are the scholarship's assessment criteria — they describe what REVIEWERS look for.
  You must address each criterion using ONLY evidence already present in the candidate's profile above.
  Never invent experiences, values, or claims to satisfy a criterion the candidate cannot genuinely evidence.
  If the profile does not support a criterion, acknowledge the gap honestly rather than fabricate.

Assessment criteria this scholarship scores on: ${valuePack.values.join('; ')}
Critical rules for this scholarship:
${valuePack.rules.map(r => `  - ${r}`).join('\n')}
Tone: ${valuePack.tone}
` : '';

    const prompt = `
You are an elite academic consultant and scholarship writer with a 95% success rate for international grants (Commonwealth, Chevening, Fulbright, ERASMUS+, Rhodes, Gates Cambridge, DAAD).

### YOUR GOAL
Write a compelling, high-stakes ${params.essayLabel} for the scholarship/program described below.
The essay must be deeply personal, professionally authoritative, and precisely aligned with this scholarship's values.

### INPUT DATA
USER PROFILE — use ONLY real details from here. Never invent facts, numbers, or experiences not present:
${compactProfileForScholarship(params.profile)}

SCHOLARSHIP / PROGRAM DESCRIPTION:
${params.scholarshipDescription || '(No description provided — write a strong general essay using the profile.)'}

ADDITIONAL PERSONAL CONTEXT:
${params.additionalContext || 'None provided. Rely entirely on the profile above.'}

${scholarshipBlock}
### ESSAY REQUIREMENTS
- Essay type: ${params.essayLabel}
- STRICT word count: between ${wLow} and ${wHigh} words. Count every word. Do not exceed or fall short of this range.
- Specific instruction: ${params.promptHint}
- Tone: Academic yet personal. Enthusiastic but never gushing. Visionary AND grounded in past achievements.
- Do NOT open the essay with the word "I" as the first word of the first sentence.
- Do NOT use any placeholder text such as [Your Name], [Scholarship Name], [University] — use real names from the profile and description.

### ESSAY STRUCTURE — follow this section order exactly:
${essayStructure}

### FORBIDDEN PHRASES — scholarship reviewers penalise these; NEVER use any of them:
${forbiddenList}
When tempted to use one, replace it with a SPECIFIC named anecdote, number, or concrete experience instead.

### QUALITY RULES
- Every claim must be grounded in a real detail from the profile — no invented facts
- Prefer specificity: "increased retention by 23% across 8 months" beats "improved performance significantly"
- The essay must read as if a real, thoughtful human wrote it about their actual life
- No AI-sounding phrases: no "delve into", "multifaceted", "testament to", "in conclusion", "it is worth noting"

Return ONLY the essay text. No title, no preamble, no sign-off, no word count annotation.
`;

    onStep?.('Writing your essay…');
    let essay = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.78, maxTokens: 4096 });

    // ── Always humanize — not gated on word count ─────────────────────────────
    onStep?.('Humanizing voice…');
    try {
        const humanized = await humanizeText(essay);
        if (humanized && humanized.trim().length > 100) essay = humanized;
    } catch { /* fall back to original */ }

    // ── Word count enforcement — trim or expand if >20% off target ────────────
    const actual = essay.split(/\s+/).filter(Boolean).length;
    const ratio  = actual / params.wordCount;
    if (ratio > 1.22 || ratio < 0.78) {
        const direction = ratio > 1.22 ? 'trim' : 'expand';
        onStep?.(direction === 'trim' ? 'Trimming to target length…' : 'Expanding to target length…');
        const enforcePrompt = direction === 'trim'
            ? `This essay is ${actual} words but must be between ${wLow} and ${wHigh} words. Trim it to fit. Remove the least important sentences while preserving all named achievements, numbers, and the essay structure. Return ONLY the essay text.\n\n${essay}`
            : `This essay is ${actual} words but must be between ${wLow} and ${wHigh} words. Expand it by deepening arguments and adding specific examples from the profile. Return ONLY the essay text.\n\n${essay}`;
        try {
            const enforced = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, enforcePrompt, { temperature: 0.45, maxTokens: 4096 });
            if (enforced && enforced.trim().length > 100) essay = enforced;
        } catch { /* keep existing */ }
    }

    return essay;
};

