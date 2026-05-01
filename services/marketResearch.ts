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
// If Gemini returns a quota/rate error, pause Gemini calls for 90 seconds so
// every subsequent CV generation in the same session uses Groq instead of
// hammering the already-exhausted free-tier endpoint.
// 90 s matches Gemini's own "retry in 44–60 s" window with a comfortable buffer.
// The previous 10-minute cooldown caused the humanizer (which runs ~2 min later)
// to skip Gemini entirely and fall through to a slow last-resort chain.
const GEMINI_BACKOFF_MS = 90 * 1000; // 90 seconds
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

// Exported for the audit harness (`scripts/audit-jd-pipeline.ts`) so the
// scenario-detection contract — empty JD → A, short hint → B, full JD → C —
// can be regression-tested without spinning up the full marketResearch flow.
export function detectScenario(jd: string): Scenario {
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

    // SCORING-BASED industry detection. The previous if/else-if chain was
    // first-match-wins on whichever bucket appeared first in the chain — so a
    // JD that mentions "health benefits" in its EOE boilerplate would be
    // misclassified as Healthcare even when the role is Sales Engineer; a
    // Legal Counsel JD that mentioned "financial services" would be tagged
    // Finance; a Frontend Engineer JD that mentioned "marketing campaigns"
    // would be tagged Marketing. The downstream effect was wrong verb pools
    // (user-reported "wrong verb for field — verb pool filter not working").
    //
    // Fix: count keyword hits for every bucket, pick the bucket with the
    // highest score. Ties broken by the order below (most-specific first so a
    // tie favours Legal over Finance, Sales over Tech, etc.). Each bucket's
    // pattern is /g so we count *all* occurrences, not just the first match.
    // Word-boundary anchors (\b) keep stems like "health" from matching "wealth"
    // and "market" from matching "supermarket"; multi-word phrases like
    // "real estate" don't need \b at both ends because the space already
    // anchors them.
    type IndustryRule = { name: string; rx: RegExp; weight?: number };
    const RULES: IndustryRule[] = [
        // Most-specific buckets first (tie-break order). Weights default to 1
        // but we boost rare/strong signals (e.g. "McKinsey" → consulting +3).
        { name: 'Legal & Compliance',         rx: /\b(legal|law(yer)?|compliance|regulat\w*|paralegal|solicitor|barrister|attorney|counsel|gdpr|ccpa|jd from|admitted to the bar|securities law|aml)\b/gi, weight: 2 },
        { name: 'Design & Creative',          rx: /\b(figma|sketch|adobe (xd|illustrator|photoshop)|product design(er)?|ux research|design system|ui design|creative director|illustrat\w*|wireframe|mockup|motion design)\b/gi, weight: 2 },
        { name: 'Sales & Business Development', rx: /\b(sales (engineer|representative|rep|manager|quota|cycle)?|business development|account executive|quota attainment|crm|salesforce|hubspot|pipeline (build|management)|sdr|bdr|close (deals|complex deals)|commission|cold (call|outreach))\b/gi, weight: 2 },
        { name: 'Management Consulting',      rx: /\b(management consult\w*|strategy consult\w*|mckinsey|bain|bcg|deloitte|accenture|kpmg|engagement (manager|partner)|case interview|workstream|client delivery)\b/gi, weight: 3 },
        { name: 'Academia & Research',        rx: /\b(academ\w*|university|phd|professor|lecturer|postdoc(toral)?|grant funding|fellowship|tenure[- ]track|peer[- ]review|publication record|research group)\b/gi, weight: 2 },
        { name: 'Operations & Supply Chain',  rx: /\b(supply chain|logistics|procurement|warehouse|fulfillment center|lean|six sigma|kanban|operations (manager|director)|inventory (turn|management)|inbound flow|sap|oracle erp)\b/gi, weight: 2 },
        { name: 'Education',                  rx: /\b(teacher|teaching|classroom|curriculum|school|tutor|elearning|state teaching certification|ap (calculus|standards)|lesson plan|student progress)\b/gi, weight: 2 },
        { name: 'Real Estate & Construction', rx: /\b(real estate|property|construction|architect(ural)?|civil engineer(ing)?|stamped (construction )?drawings|building code|seismic|revit|bim|construction management|pe license)\b/gi, weight: 2 },
        // Broader buckets last. Use stricter anchors so "health benefits" or
        // "market" inside other domains don't poison the score.
        { name: 'Healthcare & Life Sciences', rx: /\b(healthcare|medical|pharma|pharmaceutical|clinical (trial|research)|hospital|biotech|nurse|nursing|doctor|patient (chart|safety|care)|ehr|epic|gcp certification|fda|irb)\b/gi, weight: 2 },
        { name: 'Finance & Banking',          rx: /\b(finance|financial (services|institution)|banking|invest(ment|ing)|trading|fintech|payments? (platform|protocol)|hedge fund|asset management|wealth management|securities|swift|sepa|ach)\b/gi, weight: 2 },
        { name: 'Marketing & Communications', rx: /\b(brand (storytelling|identity)?|marketing (lead|manager|campaign)?|seo\b|sem\b|content marketing|social media|copywrit\w*|public relations|advertising|growth marketing|google analytics|hubspot|semrush)\b/gi, weight: 2 },
        { name: 'Technology & Engineering',   rx: /\b(software engineer|backend|frontend|fullstack|devops|cloud (engineer|architect)?|ml engineer|ai engineer|data science|machine learning|kubernetes|docker|react\b|node\.?js|typescript|python|java\b|aws\b|gcp\b|azure)\b/gi, weight: 1 },
    ];

    const scores = RULES.map(r => {
        const hits = (corpus.match(r.rx) || []).length;
        return { name: r.name, score: hits * (r.weight || 1) };
    });
    const top = scores.reduce((a, b) => (b.score > a.score ? b : a), { name: '', score: 0 });
    const industry = top.score > 0 ? top.name : 'Technology';

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
