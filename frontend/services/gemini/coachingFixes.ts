/**
 * One-click coaching fixes: verb saturation, signal bullets, summary.
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

// ── Verb-Saturation One-Click Fix ─────────────────────────────────────────────
/**
 * Rewrites verb-led bullets to diversify openers.
 * Targets only bullets starting with action verbs; leaves all other bullets untouched.
 * Rewrites ~40% of verb-led bullets (the first N to stay within prompt budget).
 * Returns the full bullets array with rewrites applied in place.
 */
export const fixVerbSaturation = async (bullets: string[]): Promise<string[]> => {
    // Identify verb-led indices (reuse the same logic as hrDetectorSimulation)
    const COMMON_VERBS = new Set([
        'led','built','created','developed','designed','managed','delivered','launched','drove',
        'implemented','established','improved','reduced','increased','deployed','architected',
        'engineered','optimised','optimized','transformed','spearheaded','coordinated','executed',
        'oversaw','directed','streamlined','accelerated','automated','negotiated','secured',
        'generated','achieved','exceeded','mentored','trained','hired','grew','scaled','shipped',
        'maintained','operated','monitored','analysed','analyzed','evaluated','assessed','audited',
        'collaborated','partnered','supported','enabled','facilitated','introduced','pioneered',
        'revamped','consolidated','migrated','integrated','configured','provisioned','resolved',
    ]);
    const firstWord = (b: string) => b.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, '').toLowerCase() ?? '';
    const verbLedIdxs = bullets
        .map((b, i) => ({ i, isVerb: COMMON_VERBS.has(firstWord(b)) }))
        .filter(x => x.isVerb)
        .map(x => x.i);

    if (verbLedIdxs.length === 0) return bullets;

    // Rewrite at most 8 of them to stay within a fast prompt budget
    const toRewrite = verbLedIdxs.slice(0, 8);
    const subset    = toRewrite.map(i => `[${i}] ${bullets[i]}`).join('\n');

    const banned = await _getBannedPhrasesForPrompt();

    const prompt = `You are rewriting CV bullet points to fix verb-led opener saturation.
Each bullet currently STARTS WITH AN ACTION VERB. Rewrite ONLY the opener so it no longer starts with a verb.
Use one of these three opener patterns (vary them):
  • Number/scope-led: "3 engineers mentored…", "Across 5 teams,…", "£2.1M programme delivered…"
  • Context-led: "As sole engineer,…", "In partnership with X,…", "Under tight deadline,…"  
  • Result-first: "Zero-downtime migration achieved by…", "40% cost reduction realised through…"

RULES:
- Preserve ALL facts: numbers, company names, dates, exact metrics. Do NOT invent figures.
- Do NOT use these banned phrases: ${banned.slice(0, 80)}
- Return ONLY a JSON object: { "rewrites": { "<index>": "<rewritten bullet>", ... } }
- Indices correspond to the [N] prefix in the input.
- Only rewrite the opener — keep the body of each bullet as close as possible.

BULLETS TO REWRITE:
${subset}`;

    try {
        const raw = await groqChat(GROQ_FAST, '', prompt, { temperature: 0.6, json: true, maxTokens: 1500 });
        const _rawStripped = (raw ?? '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const parsed = JSON.parse(_rawStripped || '{}') as { rewrites?: Record<string, string> };
        const rewrites = parsed.rewrites ?? {};
        const result = [...bullets];
        for (const [idxStr, text] of Object.entries(rewrites)) {
            const idx = parseInt(idxStr, 10);
            if (!isNaN(idx) && idx >= 0 && idx < result.length && typeof text === 'string' && text.trim()) {
                result[idx] = text.trim();
            }
        }
        return result;
    } catch {
        return bullets; // fallback: return unchanged
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// One-click bullet/summary fixers keyed by HR signal ID
// ─────────────────────────────────────────────────────────────────────────────

const BULLET_FIX_INSTRUCTIONS: Record<string, string> = {
    banned_opener: `Identify bullets that START with these banned AI-sounding words/phrases: Spearheaded, Orchestrated, Leveraged, Utilized, Facilitated, Empowered, Championed, Harnessed, Synergized, Responsible for, Helped to, Worked on, Assisted with, Tasked with.
Rewrite ONLY those bullets — change the opener to a direct strong action verb (Led, Built, Cut, Grew, Delivered, Launched, Reduced, Drove, Shipped, Designed, Managed, Deployed, etc.).
Preserve ALL facts, numbers, dates, and the rest of the bullet. Only change the opening word/phrase.`,

    repeated_opener: `Identify which opening verb appears 3 or more times across all bullets. Rewrite those duplicate-opener bullets so each uses a DIFFERENT verb from a different family:
• Technical: Built, Configured, Deployed, Architected, Engineered, Integrated
• Management: Led, Directed, Oversaw, Coordinated, Supervised, Mentored  
• Analysis: Assessed, Evaluated, Diagnosed, Audited, Reviewed, Benchmarked
• Delivery: Launched, Shipped, Executed, Rolled out, Produced, Released
Preserve ALL facts and numbers. Only change the opener verb.`,

    pronoun_leak: `Identify bullets containing first-person pronouns: I, I've, my, me, we, we've, our, ourselves.
Rewrite those bullets removing the pronoun — CVs use implied subject:
• "I managed a team of 5" → "Managed a team of 5 engineers"
• "My approach reduced costs by 30%" → "Reduced costs by 30% through…"
• "We delivered the project" → "Delivered the project with a cross-functional team of N"
Preserve ALL facts. Restructure the sentence naturally — do not just delete the pronoun word.`,

    passive_voice: `Identify bullets that use passive voice constructions (was, were, been, being + past participle — e.g. "was managed", "were delivered", "been responsible for").
Rewrite those bullets as active voice starting with a strong past-tense action verb:
• "The project was delivered by the team" → "Delivered the project with a cross-functional team of 6"
• "Costs were reduced by 25%" → "Reduced costs by 25% through process automation"
Preserve ALL facts and numbers.`,

    length_uniformity: `These bullets are too uniform in length. Vary them deliberately:
• Short punchy (8–12 words): strip filler, keep the core metric  
• Standard (13–18 words): one action + one result
• Detailed (18–24 words): action + method + result + scale
Aim for a mix where at least 30% of bullets are short and 30% are detailed.
Extend short bullets with context or method; trim verbose ones to the core win.
Preserve ALL facts and numbers.`,

    no_metric: `Identify bullets that describe activities or outcomes WITHOUT any measurable figures (no %, no £/$, no headcount, no timeframe, no scale indicator).

Rewrite each flagged bullet to include a clearly-marked placeholder — use [X%], [£X], [X users], [X months], [X engineers] etc. — showing EXACTLY where a real number belongs and in what unit. Also restructure the bullet around the placeholder so it reads naturally once a real number is filled in.

Keep ALL existing specific facts and numbers unchanged.

Example:
Before: "Managed relationships with enterprise clients and improved satisfaction"
After:  "Managed [X] enterprise accounts (£[X]M ARR), lifting client satisfaction scores by [X]% over [X] months"`,

    achievement_density: `Identify bullets that describe duties/responsibilities ("responsible for", "managed the", "worked on", "oversaw", "helped") rather than outcomes or achievements.

Rewrite each flagged bullet using Result → Action → Context format:
  "[Result achieved] by [specific action], enabling [context/impact]"

If the real result isn't in the bullet, add a placeholder like [X% improvement], [£X saved], [X faster].
Do NOT invent facts — use bracketed placeholders for unknowns, keep all real numbers and company names exactly.
Preserve bullets that already contain a clear outcome or metric — do not rewrite those.`,

    tense_mismatch: `Fix verb tense consistency across all experience bullets.
- Bullets for the FIRST (current/most recent) experience entry → present tense ("Manage", "Lead", "Build")
- ALL other experience entries (past roles) → past tense ("Managed", "Led", "Built")

Rewrite ONLY the bullets that have the wrong tense. Change the opening verb form only; preserve everything else exactly.`,

    weak_verb: `Identify bullets starting with weak or vague verbs: helped, worked, assisted, supported, participated, involved, contributed, was part of, played a role.

Rewrite each to start with a strong, specific ownership verb:
• Leading/managing: Led, Directed, Oversaw, Managed, Coordinated
• Building/engineering: Built, Engineered, Developed, Architected, Designed
• Delivering: Delivered, Launched, Shipped, Executed, Deployed
• Improving: Improved, Optimised, Streamlined, Accelerated, Reduced
• Growing: Grew, Scaled, Expanded, Increased, Drove

Choose the verb that best reflects what the person actually did — don't just swap in a random strong verb.
Preserve ALL facts, numbers, and the rest of the bullet content.`,
};

const SUMMARY_FIX_INSTRUCTIONS: Record<string, string> = {
    summary_cliches: `Remove AI-ism cliché phrases from this summary paragraph. The phrases to eliminate include: results-driven, highly motivated, detail-oriented, team player, hard-working, self-starter, go-getter, dynamic professional, proven track record, passionate about, excellent communication skills, strong work ethic, dedicated professional, innovative thinker, forward-thinking, well-rounded, value-add, thought leader, best-in-class.
Replace each removed phrase with a SPECIFIC achievement, domain fact, or concrete skill. Keep approximately the same length. Return only the rewritten summary text.`,

    generic_opener: `This summary opens with a generic AI phrase ("I am a…", "An experienced…", "Seeking…", "A dedicated…", "A results-driven…", "A highly motivated…").
Rewrite ONLY the opening sentence to follow this pattern:
[Job title] with [X] years of [specific domain] experience[, strongest concrete achievement OR key specialisation].
Example: "Senior product manager with 9 years of B2B SaaS experience, having shipped 3 platform products reaching $12M ARR."
Keep the rest of the summary unchanged. Return only the full rewritten summary paragraph.`,

    summary_too_short: `This professional summary is too brief. Expand it to 60–90 words while preserving everything already there.

Structure to follow:
1. Open: [Current job title] with [X] years of [domain/specialty] experience
2. Specialisation: mention 2 core strengths or domains
3. Highlight: one concrete achievement — use [metric placeholder] if no real figure is available
4. Direction (optional): "Seeking [type of role] in [sector]" — only add if it fits naturally

Build on what is already written — do not contradict or replace existing facts.
Return ONLY the expanded summary text with no labels or explanation.`,

    summary_too_long: `This professional summary is too long. Trim it to 60–90 words.

Rules:
- Remove filler phrases that add no information: "results-driven", "passionate about", "team player", "strong communicator"
- Cut anything that repeats information already clear from the job titles/bullets
- Every remaining sentence must earn its place: fact, skill, or concrete achievement only
- Keep all specific metrics, job titles, and company names

Return ONLY the trimmed summary text with no labels or explanation.`,
};

// ── ProCV pipeline voice rules injected into every coaching fix ──────────────
const _COACHING_VOICE_RULES = `
PROCV VOICE RULES (non-negotiable — same rules as the main CV generation pipeline):
1. No first-person pronouns — never write I, I've, I've, my, me, we, we've, our
2. No AI-sounding openers — never start a bullet with: Spearheaded, Orchestrated, Leveraged,
   Utilized, Facilitated, Empowered, Championed, Harnessed, Synergized, Transformed, Revolutionized
3. No cliché adjectives — never use: results-driven, highly motivated, detail-oriented, proven,
   dynamic, innovative, forward-thinking, passionate, value-add, best-in-class
4. Start every bullet with a strong past-tense action verb (e.g. Led, Built, Delivered, Reduced,
   Grew, Launched, Designed, Managed, Deployed, Analysed, Negotiated)
5. Be concrete — no vague descriptors like "various", "multiple", "different types of"
6. Preserve every existing number, company name, date, and proper noun exactly as written`.trim();

/**
 * Fix bullet points for a given signal — returns the full corrected array.
 * Uses the full Worker-fetched HUMANIZATION_RULES (same as CV generation) with
 * _COACHING_VOICE_RULES as a static fallback. Each rewrite passes through
 * purifiedCompletion so banned phrases are scrubbed before reaching the user.
 */
export const fixBulletsForSignal = async (
    bullets: string[],
    signalId: string,
): Promise<string[]> => {
    const instruction = BULLET_FIX_INSTRUCTIONS[signalId];
    if (!instruction || bullets.length === 0) return bullets;

    const banned = await _getBannedPhrasesForPrompt();
    const numbered = bullets.map((b, i) => `[${i}] ${b}`).join('\n');

    // Prefer the full Worker-fetched rules; fall back to the static subset
    const activeRules = HUMANIZATION_RULES || _COACHING_VOICE_RULES;

    const systemInstruction = SYSTEM_INSTRUCTION_HUMANIZER
        ? `${SYSTEM_INSTRUCTION_HUMANIZER}\n\n${activeRules}`
        : activeRules;

    const prompt = `You are a senior CV editor applying a targeted fix to a set of CV bullet points.

TASK:
${instruction}

PROCV WRITING RULES — follow these exactly, same as during CV generation:
${activeRules}
- Do NOT use these additionally banned phrases: ${banned.slice(0, 80)}
- Do NOT invent new metrics or facts — only change wording or structure
- Return ONLY a valid JSON object: { "rewrites": { "<index>": "<rewritten bullet>", ... } }
- Include ONLY bullets you actually changed — omit unchanged ones
- Indices correspond to the [N] prefix in the input

BULLETS:
${numbered}`;

    try {
        const { purifiedCompletion } = await import('./purifiedLLMGateway');
        const raw = await groqChat(GROQ_FAST, systemInstruction, prompt, { temperature: 0.45, json: true, maxTokens: 2400 });
        const _stripped = (raw ?? '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const parsed = JSON.parse(_stripped || '{}') as { rewrites?: Record<string, string> };
        const rewrites = parsed.rewrites ?? {};
        const result = [...bullets];
        // Run each rewrite through purifiedCompletion to strip any surviving banned phrases
        await Promise.all(
            Object.entries(rewrites).map(async ([idxStr, text]) => {
                const idx = parseInt(idxStr, 10);
                if (!isNaN(idx) && idx >= 0 && idx < result.length && typeof text === 'string' && text.trim()) {
                    const { text: clean } = await purifiedCompletion(() => Promise.resolve(text.trim()));
                    result[idx] = clean;
                }
            })
        );
        return result;
    } catch {
        return bullets;
    }
};

/**
 * Fix summary for a given signal — returns the corrected summary string.
 * Uses the full Worker-fetched HUMANIZATION_RULES (same as CV generation) and
 * passes the result through purifiedCompletion so banned phrases are scrubbed.
 */
export const fixSummaryForSignal = async (
    summary: string,
    signalId: string,
): Promise<string> => {
    const instruction = SUMMARY_FIX_INSTRUCTIONS[signalId];
    if (!instruction || !summary.trim()) return summary;

    const banned = await _getBannedPhrasesForPrompt();

    // Prefer the full Worker-fetched rules; fall back to the static subset
    const activeRules = HUMANIZATION_RULES || _COACHING_VOICE_RULES;

    const systemInstruction = SYSTEM_INSTRUCTION_HUMANIZER
        ? `${SYSTEM_INSTRUCTION_HUMANIZER}\n\n${activeRules}`
        : activeRules;

    const prompt = `You are a senior CV editor improving a professional summary section.

TASK:
${instruction}

PROCV WRITING RULES — follow these exactly, same as during CV generation:
${activeRules}
- Do NOT use these additionally banned phrases: ${banned.slice(0, 60)}
- Do NOT invent new facts or metrics
- Return ONLY a valid JSON object: { "summary": "<rewritten summary>" }

SUMMARY TO FIX:
${summary}`;

    try {
        const { purifiedCompletion } = await import('./purifiedLLMGateway');
        const raw = await groqChat(GROQ_FAST, systemInstruction, prompt, { temperature: 0.45, json: true, maxTokens: 600 });
        const _stripped = (raw ?? '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const parsed = JSON.parse(_stripped || '{}') as { summary?: string };
        const rawSummary = parsed.summary?.trim();
        if (!rawSummary) return summary;
        const { text: clean } = await purifiedCompletion(() => Promise.resolve(rawSummary));
        return clean;
    } catch {
        return summary;
    }
};

