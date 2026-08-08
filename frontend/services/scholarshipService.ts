/**
 * Scholarship essay generation.
 * Extracted from geminiService — logic unchanged.
 */

import type { UserProfile } from '../types';
import { groqChat, GROQ_LARGE } from './groqService';
import { compactProfile } from './profilePromptUtils';
import { SYSTEM_INSTRUCTION_PROFESSIONAL } from './pipelineRules';

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
