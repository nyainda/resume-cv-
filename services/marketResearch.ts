/**
 * marketResearch.ts
 *
 * Pre-generation market intelligence service.
 *
 * Provider priority:
 *   1. Gemini + Google Search grounding (live results, best quality)
 *   2. Groq / Cerebras  (training-data based, no live search — used when Gemini
 *      is unavailable, quota-exceeded, or not configured)
 *
 * A session-level Gemini quota guard prevents hammering the API after it has
 * already returned a 429 / quota-exceeded error within the last 10 minutes.
 *
 * Never throws — always returns null on failure so CV generation can proceed.
 */

import { GoogleGenAI } from '@google/genai';
import { UserProfile } from '../types';
import { getGeminiKey as _rtGemini } from './security/RuntimeKeys';
import { groqChat, GROQ_LARGE } from './groqService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarketResearchResult {
    detectedRole: string;
    detectedIndustry: string;
    topSkills: string[];
    atsKeywords: string[];
    expectedTools: string[];
    industryInsights: string;
    scenario: 'A' | 'B' | 'C';
    searchedAt: number;
}

type Scenario = 'A' | 'B' | 'C';

// ─── Session-level Gemini quota guard ────────────────────────────────────────
// If Gemini returns a quota/rate error, pause Gemini calls for 10 minutes so
// every subsequent CV generation in the same session uses Groq instead of
// hammering the already-exhausted free-tier endpoint.
const GEMINI_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes
let _geminiQuotaHitAt: number | null = null;

function geminiIsBlocked(): boolean {
    if (_geminiQuotaHitAt === null) return false;
    return Date.now() - _geminiQuotaHitAt < GEMINI_BACKOFF_MS;
}

function markGeminiQuotaHit(): void {
    _geminiQuotaHitAt = Date.now();
}

// ─── Key retrieval (mirrors geminiService.ts pattern) ────────────────────────

function getGeminiApiKey(): string | null {
    let apiKey: string | undefined = _rtGemini() ?? undefined;

    if (!apiKey) {
        try {
            const s = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings') || '';
            if (s) {
                const parsed = JSON.parse(s);
                if (parsed.apiKey && !parsed.apiKey.startsWith('enc:v1:')) {
                    apiKey = parsed.apiKey.replace(/^"|"$/g, '');
                }
            }
        } catch { /* ignore */ }
    }

    if (!apiKey) {
        try {
            const pk = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
            if (pk.gemini && !pk.gemini.startsWith('enc:v1:')) {
                apiKey = pk.gemini.replace(/^"|"$/g, '');
            }
        } catch { /* ignore */ }
    }

    return apiKey || null;
}

// ─── Scenario detection ───────────────────────────────────────────────────────

function detectScenario(jd: string): Scenario {
    const words = jd.trim().split(/\s+/).filter(Boolean).length;
    if (words === 0) return 'A';
    if (words < 100) return 'B';
    return 'C';
}

// ─── Role & industry detection from profile + JD ─────────────────────────────

export function detectRoleAndIndustry(profile: UserProfile, jd: string): { role: string; industry: string } {
    // Most recent job title (profile workExperience is sorted newest-first in most flows)
    const recent = [...(profile.workExperience || [])].sort((a, b) => {
        const da = a.endDate === 'Present' ? Date.now() : new Date(a.endDate).getTime();
        const db = b.endDate === 'Present' ? Date.now() : new Date(b.endDate).getTime();
        return db - da;
    })[0];

    const role = recent?.jobTitle || profile.summary?.split(/\s+/).slice(0, 4).join(' ') || 'Professional';

    // Industry heuristic from skills + company names + JD
    const corpus = [
        profile.skills?.join(' '),
        (profile.workExperience || []).map(w => `${w.company} ${w.jobTitle}`).join(' '),
        profile.summary,
        jd,
    ].filter(Boolean).join(' ').toLowerCase();

    let industry = 'Technology';
    if (/financ|bank|invest|trading|fintech|payment|fund|asset|wealth/.test(corpus)) industry = 'Finance & Banking';
    else if (/health|medical|pharma|clinical|hospital|biotech|nurs|doctor|patient|ehrs|ehr/.test(corpus)) industry = 'Healthcare & Life Sciences';
    else if (/market|brand|campaign|seo|sem|content|social media|copywrite|pr|advertis/.test(corpus)) industry = 'Marketing & Communications';
    else if (/legal|law|compliance|regulat|paralegal|solicitor|barrister/.test(corpus)) industry = 'Legal & Compliance';
    else if (/engineer|software|developer|devops|cloud|ml|ai|data science|machine learn|backend|frontend|fullstack/.test(corpus)) industry = 'Technology & Engineering';
    else if (/design|ux|ui|figma|product design|creative director|illustrat/.test(corpus)) industry = 'Design & Creative';
    else if (/sales|business development|account executive|quota|crm|pipeline|sdr|bdr/.test(corpus)) industry = 'Sales & Business Development';
    else if (/consult|strateg|management consultant|mckinsey|bain|bcg|deloitte/.test(corpus)) industry = 'Management Consulting';
    else if (/academ|research|university|phd|professor|lecturer|postdoc|grant|fellowship/.test(corpus)) industry = 'Academia & Research';
    else if (/manufactur|supply chain|logistics|operations|procurement|warehouse|lean|six sigma/.test(corpus)) industry = 'Operations & Supply Chain';
    else if (/educat|teach|curriculum|school|tutor|elearning/.test(corpus)) industry = 'Education';
    else if (/real estate|property|construction|architect|civil engineer/.test(corpus)) industry = 'Real Estate & Construction';

    return { role, industry };
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildGeminiResearchPrompt(scenario: Scenario, role: string, industry: string, jd: string): string {
    const year = new Date().getFullYear();
    const isEngineering = /engineer|developer|software|devops|backend|frontend|cloud|data/.test(`${role} ${industry}`.toLowerCase());
    const engineeringExtra = isEngineering
        ? `6. Search "technical depth expected ${role} CV ${year}"\n7. Search "certifications valued ${role} ${industry}"`
        : '';

    if (scenario === 'A') {
        return `You are a specialist labour market researcher. Use Google Search to research current hiring trends.

Research these topics for a ${role} in the ${industry} industry (${year}):
1. "most in demand skills ${role} ${year}"
2. "ATS keywords ${industry} CV resume ${year}"
3. "what recruiters look for ${role} hiring"
4. "top tools software ${industry} ${year}"
${engineeringExtra}

Return ONLY a JSON object with this exact structure (no markdown fences, no extra text):
{
  "topSkills": ["skill1", "skill2"${isEngineering ? ', "skill3"' : ''}],
  "atsKeywords": ["keyword1", "keyword2"],
  "expectedTools": ["tool1", "tool2"],
  "industryInsights": "2-3 specific, actionable sentences about what makes a ${role} CV stand out in ${year}. Name specific trends, tools, and recruiter expectations."
}
Return up to 12 topSkills, 15 atsKeywords, 10 expectedTools.`;
    }

    if (scenario === 'B') {
        return `You are a specialist labour market researcher. The user provided a short job hint: "${jd.trim()}". Use Google Search to research what this role typically requires.

Search these queries:
1. "job requirements ${jd.trim()} ${year}"
2. "responsibilities ${jd.trim()} job description"
3. "ATS keywords ${jd.trim()} resume"
4. "top tools ${jd.trim()} professionals use"
5. "skills hiring managers look for ${jd.trim()}"
${engineeringExtra}

Return ONLY a JSON object (no markdown fences):
{
  "topSkills": ["skill1", "skill2"],
  "atsKeywords": ["keyword1", "keyword2"],
  "expectedTools": ["tool1", "tool2"],
  "industryInsights": "2-3 specific sentences describing what this role actually requires, hidden expectations not usually in job ads, and what differentiates top candidates in ${year}."
}
Return up to 12 topSkills, 15 atsKeywords, 10 expectedTools.`;
    }

    // Scenario C — Full JD — enrich with implicit market expectations
    return `You are a specialist labour market researcher. The user has provided a full job description. Use Google Search to ENRICH beyond what the JD explicitly states.

Role: ${role} | Industry: ${industry} | Year: ${year}

Search for IMPLICIT expectations not always stated in job descriptions:
1. "implicit skills expected ${role} ${industry} not listed job ad"
2. "ATS keywords ${industry} CV ${year}"
3. "what hiring managers really want ${role} ${industry}"
4. "top tools ${industry} ${role} professionals ${year}"
5. "certifications valued ${role} ${industry}"
${engineeringExtra}

Return ONLY a JSON object (no markdown fences):
{
  "topSkills": ["skill1", "skill2"],
  "atsKeywords": ["keyword1", "keyword2"],
  "expectedTools": ["tool1", "tool2"],
  "industryInsights": "2-3 sentences on implicit market expectations, cultural signals, and what separates top ${role} candidates from average ones. Be specific — name actual behaviours, metrics, or mindsets."
}
Return up to 12 topSkills, 15 atsKeywords, 10 expectedTools.`;
}

function buildGroqResearchPrompt(scenario: Scenario, role: string, industry: string, jd: string): string {
    const year = new Date().getFullYear();
    const jdContext = scenario === 'C' ? `\n\nJOB DESCRIPTION EXCERPT:\n${jd.substring(0, 800)}` : '';

    return `You are a specialist labour market researcher with deep knowledge of current hiring trends.
Based on your training knowledge, provide market intelligence for a ${role} in the ${industry} sector (${year}).${jdContext}

Return ONLY a JSON object (no markdown fences, no extra text):
{
  "topSkills": ["skill1", ...],
  "atsKeywords": ["keyword1", ...],
  "expectedTools": ["tool1", ...],
  "industryInsights": "2-3 specific, actionable sentences about what makes a ${role} CV stand out in ${year}. Name real trends, tools, and recruiter expectations."
}

Rules:
- topSkills: up to 12 items — the most in-demand skills for this role right now
- atsKeywords: up to 15 items — exact terms ATS systems scan for in ${industry} CVs
- expectedTools: up to 10 items — specific software, platforms, or frameworks expected
- industryInsights: concrete and specific — name actual tools, certifications, or behaviours
Return ONLY the JSON object.`;
}

// ─── Parse helper (shared by both providers) ──────────────────────────────────

function parseResearchJson(rawText: string, role: string, industry: string, scenario: Scenario): MarketResearchResult | null {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    const result: MarketResearchResult = {
        detectedRole: role,
        detectedIndustry: industry,
        topSkills: Array.isArray(parsed.topSkills) ? parsed.topSkills.slice(0, 12) : [],
        atsKeywords: Array.isArray(parsed.atsKeywords) ? parsed.atsKeywords.slice(0, 15) : [],
        expectedTools: Array.isArray(parsed.expectedTools) ? parsed.expectedTools.slice(0, 10) : [],
        industryInsights: typeof parsed.industryInsights === 'string' ? parsed.industryInsights : '',
        scenario,
        searchedAt: Date.now(),
    };

    if (result.topSkills.length === 0 && result.atsKeywords.length === 0) return null;
    return result;
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Conducts market research.
 * Tries Gemini + Google Search first; falls back to Groq/Cerebras on any failure.
 * Returns null if both providers fail — CV generation always proceeds.
 */
export async function conductMarketResearch(
    profile: UserProfile,
    jobDescription: string
): Promise<MarketResearchResult | null> {
    const scenario = detectScenario(jobDescription);
    const { role, industry } = detectRoleAndIndustry(profile, jobDescription);

    // ── Attempt 1: Gemini + Google Search (live results) ──────────────────────
    const geminiApiKey = getGeminiApiKey();
    if (geminiApiKey && !geminiIsBlocked()) {
        try {
            const ai = new GoogleGenAI({ apiKey: geminiApiKey });
            const prompt = buildGeminiResearchPrompt(scenario, role, industry, jobDescription);

            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    tools: [{ googleSearch: {} }] as any,
                    temperature: 0.2,
                },
            });

            const result = parseResearchJson(response.text || '', role, industry, scenario);
            if (result) {
                console.info(`[MarketResearch] Gemini — Scenario ${scenario}: ${result.topSkills.length} skills, ${result.atsKeywords.length} keywords for "${role}"`);
                return result;
            }
            console.warn('[MarketResearch] Gemini returned empty results — trying Groq fallback');
        } catch (err: any) {
            const msg = (err?.message || '').toLowerCase();
            const status = err?.status ?? err?.code;

            // Quota / rate limit — block Gemini for 10 min to avoid hammering the API
            const isQuota = status === 429 || msg.includes('quota') || msg.includes('rate') ||
                msg.includes('429') || msg.includes('exceeded') || msg.includes('limit: 0');
            if (isQuota) {
                markGeminiQuotaHit();
                console.warn('[MarketResearch] Gemini quota/rate-limit hit — pausing Gemini for 10 min, falling back to Groq');
            } else {
                console.warn('[MarketResearch] Gemini failed silently:', msg || err);
            }
            // Fall through to Groq fallback
        }
    } else if (!geminiApiKey) {
        console.info('[MarketResearch] No Gemini key — using Groq for market research');
    } else {
        console.info('[MarketResearch] Gemini quota guard active — using Groq for market research');
    }

    // ── Attempt 2: Groq / Cerebras fallback (uses training data) ─────────────
    try {
        const prompt = buildGroqResearchPrompt(scenario, role, industry, jobDescription);
        const rawText = await groqChat(
            GROQ_LARGE,
            'You are a specialist labour market researcher. Return only valid JSON.',
            prompt,
            { temperature: 0.3, json: true, maxTokens: 1500 }
        );

        const result = parseResearchJson(rawText, role, industry, scenario);
        if (result) {
            console.info(`[MarketResearch] Groq fallback — Scenario ${scenario}: ${result.topSkills.length} skills for "${role}"`);
            return result;
        }
    } catch (groqErr) {
        console.warn('[MarketResearch] Groq fallback also failed — skipping market research:', groqErr);
    }

    return null;
}

/**
 * Builds the market intelligence block to inject into the Groq CV generation prompt.
 */
export function buildMarketIntelligencePrompt(research: MarketResearchResult): string {
    const scenarioNote = {
        A: 'Profile-based research (no JD provided)',
        B: 'Role-hint research (short input treated as role/company signal)',
        C: 'JD enrichment research (implicit market expectations beyond the JD)',
    }[research.scenario];

    return `
═══════════════════════════════════════════════════════════════════
LIVE MARKET INTELLIGENCE (fetched via Google Search — ${new Date(research.searchedAt).toLocaleTimeString()})
Research type: ${scenarioNote}
Detected Role: ${research.detectedRole}
Detected Industry: ${research.detectedIndustry}
═══════════════════════════════════════════════════════════════════

Top In-Demand Skills (${new Date().getFullYear()}):
${research.topSkills.map(s => `  • ${s}`).join('\n')}

ATS Keywords to weave throughout the CV:
${research.atsKeywords.map(k => `  • ${k}`).join('\n')}

Expected Tools & Technologies:
${research.expectedTools.map(t => `  • ${t}`).join('\n')}

Market Insights:
${research.industryInsights}

═══════════════════════════════════════════════════════════════════
RULES FOR USING THIS MARKET INTELLIGENCE:
1. Weave ATS keywords naturally into the summary, bullet points, and skills section — at least the top 5 must appear.
2. Ensure the top in-demand skills appear where genuinely applicable to the candidate's experience.
3. Include relevant expected tools in the skills section and/or bullet points.
4. Show contributions, not just duties — every bullet must demonstrate impact aligned with market expectations.
5. Include specific tools used in each role wherever plausible.
6. Highlight project types with technical depth that the market values.
7. Surface the candidate's strongest, most market-relevant projects prominently.
8. NEVER fabricate tools, skills, or achievements not inferable from the profile — only emphasise what the candidate genuinely has.
═══════════════════════════════════════════════════════════════════
`;
}
