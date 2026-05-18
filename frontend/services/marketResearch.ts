/**
 * marketResearch.ts
 *
 * Pre-generation market intelligence service.
 *
 * Respects the provider selected in Settings — whichever the user has chosen
 * powers market research.
 *
 *   • Gemini  → Gemini 2.0 Flash + Google Search grounding (live results)
 *   • Claude  → Claude via CF Worker proxy (knowledge-based, no live search)
 *   • Workers AI → Cloudflare tiered LLM (knowledge-based, no live search)
 *
 * A session-level quota guard prevents hammering the provider after it has
 * already returned a 429 / rate-limit error within 90 seconds.
 *
 * Never throws — always returns null on failure so CV generation can proceed.
 */

import { UserProfile } from '../types';
import { getGeminiKey as _rtGemini, getClaudeKey } from './security/RuntimeKeys';
import { workerProxyLLM, workerTieredLLM, isCVEngineConfigured } from './cvEngineClient';
import { getSelectedProvider } from './groqService';
import { sha256Hex } from './profileCacheClient';

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

// ─── Session-level provider quota guard ──────────────────────────────────────
// If the selected provider returns a 429 / rate-limit, pause market research
// calls for 90 seconds so we don't hammer an already-exhausted endpoint.
const PROVIDER_BACKOFF_MS = 90 * 1000; // 90 seconds
let _providerQuotaHitAt: number | null = null;

function providerIsBlocked(): boolean {
    if (_providerQuotaHitAt === null) return false;
    return Date.now() - _providerQuotaHitAt < PROVIDER_BACKOFF_MS;
}

function markProviderQuotaHit(): void {
    _providerQuotaHitAt = Date.now();
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

/**
 * Knowledge-based prompt for Claude / Workers AI (no live Google Search).
 * Same output schema as the Gemini prompt.
 */
function buildKnowledgeResearchPrompt(scenario: Scenario, role: string, industry: string, jd: string): string {
    const year = new Date().getFullYear();
    const isEngineering = /engineer|developer|software|devops|backend|frontend|cloud|data/.test(`${role} ${industry}`.toLowerCase());

    if (scenario === 'A') {
        return `You are a specialist labour market researcher with deep knowledge of hiring trends.

Using your knowledge, identify what employers currently look for in a ${role} in the ${industry} industry (${year}):
- The most in-demand skills for this role
- ATS keywords that appear in job descriptions for this role
- Tools and technologies commonly required
- What makes a strong ${role} CV stand out${isEngineering ? '\n- Relevant certifications and technical depth expected' : ''}

Return ONLY a JSON object with this exact structure (no markdown fences, no extra text):
{
  "topSkills": ["skill1", "skill2"],
  "atsKeywords": ["keyword1", "keyword2"],
  "expectedTools": ["tool1", "tool2"],
  "industryInsights": "2-3 specific, actionable sentences about what makes a ${role} CV stand out in ${year}. Name specific trends, tools, and recruiter expectations."
}
Return up to 12 topSkills, 15 atsKeywords, 10 expectedTools.`;
    }

    if (scenario === 'B') {
        return `You are a specialist labour market researcher. The user wants to apply for: "${jd.trim()}".

Using your knowledge, identify what this role typically requires (${year}):
- Core skills and competencies expected
- ATS keywords that appear in job descriptions for this role
- Common tools and technologies
- What differentiates top candidates${isEngineering ? '\n- Relevant certifications and technical depth expected' : ''}

Return ONLY a JSON object (no markdown fences):
{
  "topSkills": ["skill1", "skill2"],
  "atsKeywords": ["keyword1", "keyword2"],
  "expectedTools": ["tool1", "tool2"],
  "industryInsights": "2-3 specific sentences describing what this role actually requires, hidden expectations not usually in job ads, and what differentiates top candidates in ${year}."
}
Return up to 12 topSkills, 15 atsKeywords, 10 expectedTools.`;
    }

    // Scenario C — Full JD
    return `You are a specialist labour market researcher. The user has provided a full job description for a ${role} role in ${industry}.

Using your knowledge, identify IMPLICIT expectations beyond what the JD explicitly states (${year}):
- Skills and competencies that are assumed but not listed
- ATS keywords that appear in similar job descriptions
- Tools and technologies typical for this role
- What separates top ${role} candidates from average ones${isEngineering ? '\n- Certifications and technical depth valued in this field' : ''}

Return ONLY a JSON object (no markdown fences):
{
  "topSkills": ["skill1", "skill2"],
  "atsKeywords": ["keyword1", "keyword2"],
  "expectedTools": ["tool1", "tool2"],
  "industryInsights": "2-3 sentences on implicit market expectations, cultural signals, and what separates top ${role} candidates from average ones. Be specific — name actual behaviours, metrics, or mindsets."
}
Return up to 12 topSkills, 15 atsKeywords, 10 expectedTools.`;
}

/** Gemini prompt — uses Google Search grounding for live results. */
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

// ─── Parse helper ─────────────────────────────────────────────────────────────

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

// ─── D1 market research cache ─────────────────────────────────────────────────

const ENGINE_URL: string = (import.meta as any).env?.VITE_CV_ENGINE_URL ?? '';
const MR_CACHE_TIMEOUT_MS = 4000; // don't block generation longer than 4 s

/**
 * Computes the D1 cache key for a given market research request.
 * Key = SHA-256( scenario + ":" + role + ":" + industry + ":" + normalized_jd )
 * The normalized JD is lowercased and collapsed whitespace so minor reformatting
 * doesn't bust the cache.
 */
async function buildMRCacheKey(scenario: string, role: string, industry: string, jd: string): Promise<string> {
    const normalizedJd = jd.toLowerCase().replace(/\s+/g, ' ').trim();
    return sha256Hex(`${scenario}:${role.toLowerCase()}:${industry.toLowerCase()}:${normalizedJd}`);
}

/** Check D1 cache — returns MarketResearchResult if found and fresh, null otherwise. */
async function checkMRCache(key: string): Promise<MarketResearchResult | null> {
    if (!ENGINE_URL) return null;
    try {
        const res = await fetch(`${ENGINE_URL}/api/cv/market-research?key=${encodeURIComponent(key)}`, {
            signal: AbortSignal.timeout(MR_CACHE_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const data = await res.json() as { found?: boolean; result?: MarketResearchResult };
        if (!data.found || !data.result) return null;
        // Restore searchedAt to "now" so the prompt label reads correctly.
        return { ...data.result, searchedAt: Date.now() };
    } catch {
        return null;
    }
}

/** Store result in D1 cache — fire-and-forget, never blocks generation. */
function storeMRCache(key: string, scenario: string, role: string, result: MarketResearchResult): void {
    if (!ENGINE_URL) return;
    fetch(`${ENGINE_URL}/api/cv/market-research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            key,
            scenario,
            detected_role: role,
            result_json: JSON.stringify(result),
        }),
        signal: AbortSignal.timeout(6000),
    }).catch(() => {});
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * Conducts market research.
 * Checks D1 cache first — skips the AI call entirely if a fresh result exists.
 * Tries Gemini + Google Search; falls back to Groq/Cerebras on failure.
 * Returns null if everything fails — CV generation always proceeds.
 */
export async function conductMarketResearch(
    profile: UserProfile,
    jobDescription: string
): Promise<MarketResearchResult | null> {
    const scenario = detectScenario(jobDescription);
    const { role, industry } = detectRoleAndIndustry(profile, jobDescription);

    // ── D1 cache check (fastest path — no AI call) ────────────────────────────
    try {
        const cacheKey = await buildMRCacheKey(scenario, role, industry, jobDescription);
        const cached = await checkMRCache(cacheKey);
        if (cached) {
            console.info(`[MarketResearch] D1 cache hit — Scenario ${scenario}, role "${role}" (skipped AI call)`);
            return cached;
        }
        // Cache miss — run AI call then store result in the background.
        const fresh = await conductMarketResearchFresh(profile, jobDescription, scenario, role, industry);
        if (fresh) storeMRCache(cacheKey, scenario, role, fresh);
        return fresh;
    } catch {
        // If cache infrastructure fails, fall through to direct AI call.
        return conductMarketResearchFresh(profile, jobDescription, scenario, role, industry);
    }
}

/** Internal: makes the actual AI call (no caching). Routes to selected provider. */
async function conductMarketResearchFresh(
    _profile: UserProfile,
    jobDescription: string,
    scenario: Scenario,
    role: string,
    industry: string,
): Promise<MarketResearchResult | null> {

    if (providerIsBlocked()) {
        console.info('[MarketResearch] Provider quota guard active — skipping market research for this run');
        return null;
    }

    const provider = getSelectedProvider();

    // ── Gemini — live Google Search grounding (best quality) ─────────────────
    if (provider === 'gemini') {
        const geminiApiKey = getGeminiApiKey();
        if (!geminiApiKey) {
            console.info('[MarketResearch] No Gemini key configured — skipping market research');
            return null;
        }
        try {
            const mrPrompt = buildGeminiResearchPrompt(scenario, role, industry, jobDescription);
            const rawText = await workerProxyLLM('marketResearch', mrPrompt, {
                provider:    'gemini',
                apiKey:      geminiApiKey,
                useSearch:   true,
                temperature: 0.2,
                timeoutMs:   25_000,
            });
            const result = parseResearchJson(rawText || '', role, industry, scenario);
            if (result) {
                console.info(`[MarketResearch] Gemini+Search — Scenario ${scenario}: ${result.topSkills.length} skills, ${result.atsKeywords.length} keywords for "${role}"`);
                return result;
            }
            console.warn('[MarketResearch] Gemini returned empty results — skipping market research');
        } catch (err: any) {
            const msg = (err?.message || '').toLowerCase();
            const status = err?.status ?? err?.upstreamStatus ?? err?.code;
            const isQuota = status === 429 || msg.includes('quota') || msg.includes('rate') ||
                msg.includes('429') || msg.includes('exceeded') || msg.includes('limit: 0');
            if (isQuota) markProviderQuotaHit();
            console.warn('[MarketResearch] Gemini failed:', isQuota ? 'quota/rate-limit' : (msg || err));
        }
        return null;
    }

    // ── Claude — knowledge-based research (no live search) ───────────────────
    if (provider === 'claude') {
        const claudeKey = getClaudeKey();
        if (!claudeKey) {
            console.info('[MarketResearch] No Claude key configured — skipping market research');
            return null;
        }
        try {
            const mrPrompt = buildKnowledgeResearchPrompt(scenario, role, industry, jobDescription);
            const rawText = await workerProxyLLM('marketResearch', mrPrompt, {
                provider:    'claude',
                apiKey:      claudeKey,
                temperature: 0.2,
                timeoutMs:   25_000,
            });
            const result = parseResearchJson(rawText || '', role, industry, scenario);
            if (result) {
                console.info(`[MarketResearch] Claude — Scenario ${scenario}: ${result.topSkills.length} skills, ${result.atsKeywords.length} keywords for "${role}"`);
                return result;
            }
            console.warn('[MarketResearch] Claude returned empty results — skipping market research');
        } catch (err: any) {
            const msg = (err?.message || '').toLowerCase();
            const status = err?.status ?? err?.upstreamStatus ?? err?.code;
            const isQuota = status === 429 || msg.includes('quota') || msg.includes('rate') ||
                msg.includes('429') || msg.includes('exceeded') || msg.includes('limit: 0');
            if (isQuota) markProviderQuotaHit();
            console.warn('[MarketResearch] Claude failed:', isQuota ? 'quota/rate-limit' : (msg || err));
        }
        return null;
    }

    // ── Workers AI — knowledge-based research (no live search) ───────────────
    if (!isCVEngineConfigured()) {
        console.info('[MarketResearch] CV Engine Worker not configured — skipping market research');
        return null;
    }
    try {
        const mrPrompt = buildKnowledgeResearchPrompt(scenario, role, industry, jobDescription);
        const rawText = await workerTieredLLM('marketResearch', mrPrompt, {
            temperature: 0.2,
            maxTokens:   1500,
        });
        const result = parseResearchJson(rawText || '', role, industry, scenario);
        if (result) {
            console.info(`[MarketResearch] Workers AI — Scenario ${scenario}: ${result.topSkills.length} skills, ${result.atsKeywords.length} keywords for "${role}"`);
            return result;
        }
        console.warn('[MarketResearch] Workers AI returned empty results — skipping market research');
    } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        const isQuota = msg.includes('quota') || msg.includes('rate') || msg.includes('429');
        if (isQuota) markProviderQuotaHit();
        console.warn('[MarketResearch] Workers AI failed:', isQuota ? 'quota/rate-limit' : (msg || err));
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
