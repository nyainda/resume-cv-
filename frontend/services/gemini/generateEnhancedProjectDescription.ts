/**
 * Field-level AI enhancers: summary, responsibilities, achievements, projects.
 */

import { UserProfile, CVData, PersonalInfo, JobAnalysisResult, EnhancedJobAnalysis } from '../../types';
import { groqChat, GROQ_LARGE, GROQ_FAST } from '../groqService';
import {
  SYSTEM_INSTRUCTION_PROFESSIONAL,
  SYSTEM_INSTRUCTION_PARSER,
  HUMANIZATION_CHECKLIST,
  CV_DATA_SCHEMA,
} from './rulesState';
import { compactProfile, smartTruncateJD } from './profileSerialize';
import { purifyProfile, purifyText, purifyInboundCV, purifyCV, type PurifyReport } from '../cvPurificationPipeline';

import { _getBannedPhrasesForPrompt } from './bannedPhrasesPrompt';
export const generateEnhancedProjectDescription = async (projectName: string, currentDescription: string): Promise<string> => {
    const prompt = `
      You are a tech portfolio expert. Rewrite and enhance the provided project description into a single, concise, professional paragraph for a technical resume.

      **Instructions:**
      1. **Strict Adherence:** Describe ONLY the project provided. Do not invent features or technologies not implied by the description.
      2. **Structure:** Clearly state the project's purpose, the core technologies used, and the key features/outcomes.
      3. **Specificity:** Mention specific frameworks, languages, or tools.
      4. **Highlight Impact:** Briefly explain the problem solved or the project's main achievement.
      5. **Format:** Return ONLY a single, professional paragraph.

      **Input:**
      - Project Name: '${projectName}'
      - Current Description: "${currentDescription}"
    `;
    const desc = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5 });
    return purifyText(desc);
};

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
