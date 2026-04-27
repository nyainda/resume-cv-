import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { UserProfile, CVData, PersonalInfo, JobAnalysisResult, CVGenerationMode, ScholarshipFormat, EnhancedJobAnalysis } from '../types';
import { groqChat, GROQ_LARGE, GROQ_FAST } from './groqService';
import { purifyCV, purifyText, cleanImportedText, purifyProfile, purifyInboundCV, revertCorruptedMetrics, type PurifyReport } from './cvPurificationPipeline';
import { detectField, lockRealNumbers, buildPromptAnchorBlock, fixPronounsInCV } from './cvPromptHelpers';
import { logGeneration, quickHash } from './telemetryService';
import { getGeminiKey as _rtGemini } from './security/RuntimeKeys';
import { MarketResearchResult, buildMarketIntelligencePrompt } from './marketResearch';
import { buildBrief, validateVoice, reportLeaks, workerLLM, workerTieredLLM, workerVisionExtract, getCachedBannedPhrases, type CVBrief, type ValidateVoiceResult } from './cvEngineClient';
import { findOverusedWords } from './cvEngine/wordFrequency';
import { ROLE_TRACKS } from '../data/roleTracks';

// ─── CV Generation Cache ──────────────────────────────────────────────────────
// In-memory LRU-style cache so regenerating the same profile+JD combo is instant.
// Entries expire after 30 minutes or when the cache reaches its size limit.
// IMPORTANT: Bump CV_RULES_VERSION whenever generation instructions change —
// this automatically invalidates every cached result so users always get CVs
// built under the latest rules.
const CV_RULES_VERSION = '2.4';
const CV_CACHE_MAX = 12;
const CV_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry { result: CVData; ts: number; }
const cvCache = new Map<string, CacheEntry>();

function cloneCVData(data: CVData): CVData {
    try {
        return structuredClone(data);
    } catch {
        return JSON.parse(JSON.stringify(data)) as CVData;
    }
}

function cvCacheKey(
    profile: UserProfile,
    jd: string,
    mode: string,
    purpose: string,
    opts?: { targetLanguage?: string; scholarshipFormat?: ScholarshipFormat; marketResearch?: MarketResearchResult | null }
): string {
    const profileSnap = {
        name: profile.personalInfo?.name,
        title: profile.personalInfo?.title,
        location: profile.personalInfo?.location,
        summary: profile.summary,
        exp: (profile.workExperience || []).map(e => `${e.jobTitle}@${e.company}:${e.startDate}-${e.endDate}`),
        edu: (profile.education || []).map(e => `${e.degree}@${e.school}`),
        skills: [...(profile.skills || [])].sort(),
        projects: (profile.projects || []).map(p => `${p.name}|${p.description || ''}`),
        sectionOrder: profile.sectionOrder || [],
        customSections: (profile.customSections || []).map(s => ({
            label: s.label,
            items: (s.items || []).map(i => i.title),
        })),
    };
    const profileHash = quickHash(JSON.stringify(profileSnap));
    const jdHash = quickHash((jd || '').replace(/\s+/g, ' ').trim());
    const marketHash = opts?.marketResearch ? quickHash(JSON.stringify(opts.marketResearch)) : 'none';
    return [
        `v${CV_RULES_VERSION}`,
        `p:${profileHash}`,
        `jd:${jdHash}`,
        `m:${mode}`,
        `purpose:${purpose}`,
        `lang:${opts?.targetLanguage || 'default'}`,
        `scholarship:${opts?.scholarshipFormat || 'standard'}`,
        `market:${marketHash}`,
    ].join('|');
}

function cvCacheGet(key: string): CVData | null {
    const entry = cvCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CV_CACHE_TTL_MS) { cvCache.delete(key); return null; }
    return cloneCVData(entry.result);
}

function cvCacheSet(key: string, result: CVData): void {
    if (cvCache.size >= CV_CACHE_MAX) {
        // Evict the oldest entry
        const oldest = [...cvCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        if (oldest) cvCache.delete(oldest[0]);
    }
    cvCache.set(key, { result: cloneCVData(result), ts: Date.now() });
}

/** Call this when the user saves their profile — invalidates all cached CVs for that profile. */
export function invalidateCVCache(): void {
    cvCache.clear();
}

// ─── PRE-GENERATION PIPELINE ─────────────────────────────────────────────────
// Implements Blocks A, B, C, D from the Master AI Generation Instructions.

/** BLOCK A — Detect currency from job description and profile location. */
function detectCurrency(jd: string, location: string): string {
    const src = `${jd} ${location}`.toLowerCase();

    // Step 1 — explicit currency symbols/words
    if (/\bkes\b|ksh|kenya shilling|kenyan shilling/.test(src)) return 'KES';
    if (/\busd\b|us\$|\bdollars?\b|\bunited states\b/.test(src)) return 'USD';
    if (/\bgbp\b|£|pounds? sterling|british pounds?|\buk\b|united kingdom/.test(src)) return 'GBP';
    if (/\beur\b|€|\beuros?\b|\beuropean\b/.test(src)) return 'EUR';
    if (/\bngn\b|₦|\bnaira\b|\bnigeria\b/.test(src)) return 'NGN';
    if (/\bzar\b|\brand\b|south african rand|south africa/.test(src)) return 'ZAR';
    if (/\bugx\b|uganda shilling|\buganda\b/.test(src)) return 'UGX';
    if (/\btzs\b|tanzanian shilling|\btanzania\b/.test(src)) return 'TZS';
    if (/\baed\b|\bdirham\b|\buae\b|\bdubai\b|abu dhabi/.test(src)) return 'AED';

    // Step 2 — location keywords
    if (/nairobi|mombasa|kisumu|\bkenya\b/.test(src)) return 'KES';
    if (/lagos|abuja|port harcourt|\bnigeria\b/.test(src)) return 'NGN';
    if (/johannesburg|cape town|durban|south africa/.test(src)) return 'ZAR';
    if (/london|manchester|birmingham|\buk\b|united kingdom/.test(src)) return 'GBP';
    if (/new york|san francisco|chicago|\busa\b|united states/.test(src)) return 'USD';
    if (/kampala|\buganda\b/.test(src)) return 'UGX';
    if (/dar es salaam|\btanzania\b/.test(src)) return 'TZS';
    if (/\bdubai\b|abu dhabi|\buae\b/.test(src)) return 'AED';
    if (/paris|berlin|amsterdam|brussels/.test(src)) return 'EUR';

    // Step 3 — no currency detected
    return 'NONE';
}

/** BLOCK B — Detect seniority from work experience dates. */
function detectSeniority(workExperience: Array<{ startDate: string; endDate: string }>): string {
    let totalMonths = 0;
    const now = new Date();
    for (const exp of workExperience || []) {
        const start = new Date(exp.startDate);
        const end = exp.endDate?.toLowerCase() === 'present' ? now : new Date(exp.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        if (months > 0) totalMonths += months;
    }
    if (totalMonths < 6) return 'intern';
    if (totalMonths < 24) return 'junior';
    if (totalMonths < 60) return 'mid';
    return 'senior';
}

/**
 * Classify the candidate into one of four empty/thin CV scenarios (v2.3).
 * A = no experience, no projects
 * B = has experience, no projects
 * C = no experience, has projects
 * D = thin experience (< 6 months total), with or without projects
 * standard = full profile — standard rules apply
 */
function detectScenario(
    workExperience: Array<{ startDate: string; endDate: string }>,
    projects: Array<unknown>
): 'A' | 'B' | 'C' | 'D' | 'standard' {
    let totalMonths = 0;
    const now = new Date();
    for (const exp of workExperience || []) {
        const start = new Date(exp.startDate);
        const end = exp.endDate?.toLowerCase() === 'present' ? now : new Date(exp.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        if (months > 0) totalMonths += months;
    }
    const hasExp = totalMonths > 0;
    const hasProjects = Array.isArray(projects) && projects.length > 0;

    if (!hasExp && !hasProjects) return 'A';
    if (!hasExp && hasProjects) return 'C';
    if (hasExp && totalMonths < 6) return 'D'; // thin — applies with or without projects
    if (hasExp && !hasProjects) return 'B';
    return 'standard';
}

/**
 * Domain taxonomy used for the career-pivot detector. Each bucket lists keywords
 * that strongly imply a candidate or a JD belongs to that field. Keep keywords
 * specific (avoid generic words like "manager" or "lead") to minimize false matches.
 */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
    software:     ['software', 'developer', 'programmer', 'engineer (software)', 'frontend', 'backend', 'full-stack', 'fullstack', 'devops', 'sre', 'mobile', 'ios', 'android', 'react', 'node', 'python', 'javascript', 'typescript', 'java', 'golang', 'kubernetes', 'docker', 'web developer', 'application engineer'],
    data:         ['data scientist', 'data engineer', 'data analyst', 'machine learning', 'ml engineer', 'ai engineer', 'analytics', 'sql', 'pandas', 'spark', 'airflow', 'tableau', 'power bi', 'statistician', 'bi developer'],
    design:       ['designer', 'ux', 'ui', 'product design', 'graphic design', 'visual design', 'figma', 'sketch', 'illustrator', 'photoshop', 'creative director'],
    marketing:    ['marketing', 'seo', 'sem', 'content marketing', 'growth marketing', 'brand', 'campaign', 'social media manager', 'digital marketing', 'copywriter'],
    sales:        ['sales', 'account executive', 'business development', 'bdr', 'sdr', 'quota', 'sales rep', 'inside sales', 'outside sales'],
    finance:      ['finance', 'financial analyst', 'accountant', 'cpa', 'cfa', 'audit', 'tax', 'controller', 'treasury', 'investment', 'banking', 'actuarial'],
    hr:           ['human resources', 'hr ', 'talent acquisition', 'recruiter', 'people ops', 'hrbp', 'compensation', 'l&d'],
    legal:        ['attorney', 'lawyer', 'paralegal', 'legal counsel', 'compliance officer', 'litigation'],
    operations:   ['operations manager', 'supply chain', 'logistics', 'procurement', 'warehouse', 'inventory'],
    project_pm:   ['project manager', 'program manager', 'pmo', 'scrum master', 'product manager', 'product owner'],
    healthcare:   ['nurse', 'doctor', 'physician', 'clinical', 'patient', 'medical', 'pharmacist', 'therapist', 'radiology', 'cardiology'],
    education:    ['teacher', 'lecturer', 'professor', 'tutor', 'curriculum', 'instructor', 'educator'],
    agriculture:  ['agriculture', 'agricultural', 'agronomy', 'agronomist', 'crop', 'soil', 'irrigation', 'livestock', 'horticulture', 'farm'],
    civil:        ['civil engineer', 'structural engineer', 'site engineer', 'surveyor', 'autocad', 'construction manager'],
    mechanical:   ['mechanical engineer', 'mechatronics', 'hvac', 'manufacturing engineer', 'cad', 'solidworks'],
    electrical:   ['electrical engineer', 'electronics', 'power systems', 'circuit', 'pcb'],
    chemistry:    ['chemist', 'chemical engineer', 'lab technician', 'biochemist', 'analytical chemistry'],
    environment:  ['environmental engineer', 'sustainability', 'water resources', 'waste management', 'eia'],
    hospitality:  ['chef', 'hotel', 'hospitality', 'restaurant manager', 'concierge', 'tourism'],
    construction: ['construction', 'foreman', 'contractor', 'quantity surveyor'],
    research:     ['researcher', 'phd candidate', 'postdoctoral', 'academic research', 'thesis', 'principal investigator'],
};

function classifyDomains(text: string): Set<string> {
    const t = ' ' + text.toLowerCase() + ' ';
    const found = new Set<string>();
    for (const [domain, kws] of Object.entries(DOMAIN_KEYWORDS)) {
        for (const kw of kws) {
            if (t.includes(kw.toLowerCase())) { found.add(domain); break; }
        }
    }
    return found;
}

/**
 * Detects when the candidate's background is in a clearly different field from
 * the target role — e.g. agricultural engineer applying to a software role.
 * Orthogonal to scenarios A–D: a pivot can apply on top of any scenario.
 *
 * Returns null when no JD is provided, when domains overlap, or when either
 * side is too generic to classify confidently.
 */
function detectDomainPivot(
    profile: any,
    jobDescription?: string,
    targetTitle?: string
): { from: string[]; to: string[] } | null {
    if (!jobDescription || jobDescription.trim().length < 40) return null;

    // Skills can be string[] or {name}[] depending on profile shape — handle both.
    const skillTexts: string[] = (profile.skills || [])
        .slice(0, 20)
        .map((s: any) => typeof s === 'string' ? s : (s?.name || ''))
        .filter(Boolean);

    const candText = [
        ...((profile.workExperience || []).slice(0, 3).map((w: any) => `${w.jobTitle || ''} ${w.description || ''}`)),
        ...((profile.education || []).slice(0, 2).map((e: any) => `${e.degree || ''} ${e.fieldOfStudy || ''}`)),
        ...skillTexts,
    ].join(' ');

    const jdText = `${targetTitle || ''} ${jobDescription}`;

    const candDomains = classifyDomains(candText);
    const jdDomains   = classifyDomains(jdText);

    if (candDomains.size === 0 || jdDomains.size === 0) return null;

    // Overlap = no pivot
    const jdArr = Array.from(jdDomains);
    for (const d of jdArr) if (candDomains.has(d)) return null;

    return { from: Array.from(candDomains), to: jdArr };
}

/**
 * Instruction block for cross-domain (career pivot) applications. Forces the
 * model to lead with honest transferable-skills framing instead of pretending
 * the candidate has domain expertise they don't have.
 */
function buildPivotBlock(pivot: { from: string[]; to: string[] } | null): string {
    if (!pivot) return '';
    return `
═══ CAREER PIVOT DETECTED — CROSS-DOMAIN APPLICATION ═══
Candidate background domain(s): ${pivot.from.join(', ')}
Target role domain(s): ${pivot.to.join(', ')}

This candidate is applying ACROSS fields. The CV must be honest about this — recruiters and ATS keyword-stuffers both fail when a CV pretends to be domain-native and isn't.

MANDATORY HANDLING:
1. SUMMARY — "Bridge Formula" (60–80 words):
   Sentence 1 (HONEST IDENTITY): Current discipline + the EXACT target title from the JD framed as the transition. Example: "Agricultural engineer transitioning to software development, with 2 years building automation tools that ran on field equipment."
   Sentence 2 (TRANSFERABLE PROOF): The single strongest piece of evidence from the candidate's background that maps to the target role — named tools, methods, or measurable outcomes that genuinely overlap.
   Sentence 3 (DELIBERATE BRIDGE): What concrete steps they have taken to enter the new field (courses completed by name, certifications, side projects shipped, open-source contributions). NEVER vague language like "passionate about transitioning".
   Sentence 4 (READINESS): One specific value they bring from the previous field that the new field rarely has.
   BANNED: "passionate about", "looking to transition", "eager to learn", "no experience but", "career change", "seeking opportunity".

2. EXPERIENCE BULLETS — Reframe, do NOT relabel:
   - Each bullet must be TRUE to what the candidate actually did, but described with vocabulary the target field will recognize.
   - Lead each role with a transferable scope anchor (team size, budget, systems used, scale of data/output).
   - Highlight tools and methods that genuinely cross over (e.g. Python used for soil-data modeling → Python data analysis; SCADA system maintenance → systems monitoring).
   - DO NOT claim experience in target-domain tools the candidate has not actually used. Better an honest gap than a fake skill.

3. SKILLS SECTION — Two-tier ordering:
   Tier 1 (first): Skills the candidate genuinely has that the target field uses (verified by appearing in their actual experience or documented projects/courses).
   Tier 2 (after): Strong domain skills from their original field that demonstrate depth (these prove competence even if not directly used in the new role).
   DO NOT pad Tier 1 with tools they have only read about. Honesty caps fake-skill detection.

4. PROJECTS / CERTIFICATIONS — Make the bridge visible:
   - Surface every project, course, or certification that demonstrates concrete movement into the target field.
   - If none exist, do NOT invent them. The summary must then carry the bridge alone, and the experience reframing must work harder.

5. SECTION ORDER — Bridge-first:
   Summary → Skills (with Tier 1 leading) → Projects/Certifications (if they evidence the pivot) → Experience → Education.
   Rationale: a recruiter doing a 6-second F-pattern scan must see transferable evidence before encountering a job title that screams "wrong field".

6. ATS KEYWORDS — Use target-field vocabulary ONLY where the candidate's actual work supports it. Never list a target-field skill that the experience section cannot back up.
═══ END CAREER PIVOT BLOCK ═══
`;
}

/**
 * Returns a focused, scenario-specific instruction block to inject into the CV
 * generation prompt. Concise by design — the AI should act on these, not skim them.
 */
function buildScenarioBlock(scenario: 'A' | 'B' | 'C' | 'D' | 'standard', mode: string): string {
    if (scenario === 'standard') return '';

    const modeOverride = (mode === 'boosted' || mode === 'aggressive')
        ? `\nMODE OVERRIDE: Boosted/Aggressive requires real experience to enhance. AUTO-DOWNGRADED TO HONEST MODE — generate only what is directly evidenced in the profile.\n`
        : '';

    switch (scenario) {

        case 'A': return `
═══ SCENARIO A — NO EXPERIENCE, NO PROJECTS ═══${modeOverride}
SUMMARY — Foundation Formula ONLY (55–70 words):
  Line 1 IDENTITY: Degree + field + institution + year of study/graduation.
  Line 2 CAPABILITY: What they can genuinely do — name specific tools, methods, or domains from their coursework.
  Line 3 SIGNAL: One concrete quality indicator (GPA, award, distinction, class ranking, thesis title).
  Line 4 READINESS: What they bring to the role from day one — grounded in real coursework or academic output.
  BANNED IN SUMMARY: "Seeking opportunity to", "Eager to learn", "Passionate about", "No professional experience but", any implied work history.

SECTIONS TO OMIT (generate nothing, not even a header):
  - Work Experience → OMIT ENTIRELY
  - If no qualifying academic projects exist → OMIT Projects section entirely

PROJECTS SECTION (only if academic work qualifies):
  Use academic projects, thesis, major design assignments, or competition entries with real deliverables.
  Label format: "[Project Name] — Academic Project, [Institution], [Year]"
  Each entry answers: What was the goal? → What tools/methods? → What was the outcome? → What was the scope?
  DOES NOT QUALIFY: attending lectures, reading textbook chapters, following tutorials step-by-step.

EDUCATION — This carries the weight experience normally would. Include ALL that are true:
  - Degree, institution, year, grade/classification
  - Thesis or final year project: title + 1-sentence description + outcome
  - 2–4 relevant course names (actual course titles, not "relevant coursework")
  - Academic achievements: Dean's list, scholarships, prizes, competition placements
  - Extracurricular leadership roles with transferable skills
  - GRADUATION-STATUS RULE (binding): If a degree entry has a graduation year that is in the past or the current year, the degree IS COMPLETED. Never write "currently pursuing", "presently pursuing", "currently studying", "now pursuing", or any equivalent phrase for that entry. Only use "currently pursuing" / "expected [year]" when the graduation year is explicitly in the future or the field reads "Expected", "Present", "In Progress", "Ongoing", or is blank.

SKILLS — Evidence-only rule: list ONLY skills directly taught or used in documented academic work.
  Never list a tool or technology the profile provides no evidence of using.
═══ END SCENARIO A ═══
`;

        case 'B': return `
═══ SCENARIO B — HAS EXPERIENCE, NO PROJECTS ═══

SECTIONS TO OMIT (generate nothing, not even a header):
  - Projects → OMIT ENTIRELY. An absent section is professional. A fake section is disqualifying.

SKILLS — Extract only from work experience bullets. Every skill listed must be backed by at least one bullet.
  Do NOT list any skill with no supporting evidence in the experience section.

EXPERIENCE — Must work harder since there are no projects to supplement:
  Every transferable skill the JD requires must be evidenced inside experience bullets.
  If the JD requires a skill not present in the experience, do NOT fabricate it — use the closest honest transferable skill and frame it accurately.
═══ END SCENARIO B ═══
`;

        case 'C': return `
═══ SCENARIO C — NO EXPERIENCE, HAS PROJECTS ═══${modeOverride}
SUMMARY — Projects-Led Formula ONLY (55–70 words):
  Line 1 IDENTITY: What kind of builder/developer/creator they are + number of projects built.
  Line 2 PROOF: Strongest single project outcome with a real metric or scale (users, GitHub stars, revenue, uptime, completion).
  Line 3 STACK: Core technical stack evidenced across projects — name exact tools, frameworks, languages.
  Line 4 READINESS: What they bring to a team from day one based on what they have already shipped.

SECTION ORDER (mandatory — projects must lead):
  Professional Summary → Skills → Projects → Education → Languages

SECTIONS TO OMIT:
  - Work Experience → OMIT ENTIRELY
  - EXCEPTION: Any internship, attachment, volunteer technical work, or paid freelance work → include as experience.

PROJECTS — Treat each project like a full work experience role (4–6 bullets each):
  - Bullet 1 (scope anchor): What it does, who uses it, what scale, live URL if applicable.
  - Bullets 2–6: XYZ/CAR achievement bullets — tools used, outcomes, growth, measurable impact.
  - Verb tense: present tense if the project is live and maintained; past tense if completed.
  - Do NOT write 2-sentence project summaries. These ARE the candidate's work history — treat them accordingly.

SKILLS — Evidence drawn from projects only. Every skill must be demonstrated in at least one project entry.
═══ END SCENARIO C ═══
`;

        case 'D': return `
═══ SCENARIO D — THIN EXPERIENCE (SINGLE INTERNSHIP / ATTACHMENT) ═══${modeOverride}
SUMMARY — Emerging Professional Formula (55–70 words):
  Line 1 ANCHOR: Degree + field + institution (the credential).
  Line 2 EVIDENCE: What the internship/attachment concretely demonstrated — real tasks, real environment.
  Line 3 SKILLS: Specific technical skills genuinely acquired during the role.
  Line 4 READINESS: What the JD needs that they can genuinely deliver right now.

EXPERIENCE — The single role gets FULL bullet treatment (5–6 bullets):
  RULE: "1–2 bullets for internships" applies only when multiple roles compete for space.
  When this is the ONLY role → treat it like a current role: 5–6 bullets, scope anchor first, then achievements.

EDUCATION — Expanded (same depth as Scenario A):
  Include thesis/final year project, relevant course names, academic achievements, extracurricular leadership.

PROJECTS — Include academic projects if they exist:
  Label: "[Project Name] — Academic Project, [Institution], [Year]"
  Each: goal → tools/methods → outcome → scope.
═══ END SCENARIO D ═══
`;

        default: return '';
    }
}

/** BLOCK C — Derive market from detected currency. */
function detectMarket(currency: string): string {
    const map: Record<string, string> = {
        KES: 'East Africa', UGX: 'East Africa', TZS: 'East Africa',
        NGN: 'West Africa', ZAR: 'Southern Africa',
        GBP: 'UK', USD: 'USA / Global', EUR: 'European', AED: 'Gulf',
        NONE: 'Unknown — counts and percentages only',
    };
    return map[currency] || 'Unknown — counts and percentages only';
}

/** Gap detection — finds employment gaps longer than 3 months and describes them. */
interface GapInfo {
    gapMonths: number;
    fromRole: string;
    toRole: string;
    gapStart: string; // e.g. "Jun 2020"
    gapEnd: string;   // e.g. "Jan 2024"
}

function detectGaps(workExperience: Array<{ company: string; jobTitle: string; startDate: string; endDate: string }>): GapInfo[] {
    if (!workExperience || workExperience.length < 2) return [];
    const now = new Date();
    const sorted = [...workExperience].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const gaps: GapInfo[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        const currEnd = curr.endDate?.toLowerCase() === 'present' ? now : new Date(curr.endDate);
        const nextStart = new Date(next.startDate);
        if (isNaN(currEnd.getTime()) || isNaN(nextStart.getTime())) continue;
        const gapMonths = (nextStart.getFullYear() - currEnd.getFullYear()) * 12 + (nextStart.getMonth() - currEnd.getMonth());
        if (gapMonths > 3) {
            const fmt = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            gaps.push({
                gapMonths,
                fromRole: `${curr.jobTitle} at ${curr.company}`,
                toRole: `${next.jobTitle} at ${next.company}`,
                gapStart: fmt(currEnd),
                gapEnd: fmt(nextStart),
            });
        }
    }
    return gaps;
}

/** Builds a human-readable gap context string to inject into mode prompts. */
function buildGapContext(gaps: GapInfo[]): string {
    if (gaps.length === 0) return '';
    const lines = gaps.map(g =>
        `• ${g.gapMonths}-month gap between "${g.fromRole}" (ended ${g.gapStart}) and "${g.toRole}" (started ${g.gapEnd})`
    );
    return `\nDETECTED EMPLOYMENT GAPS — handle intelligently in the narrative:\n${lines.join('\n')}\n`;
}

/** Returns the relevant metrics ceiling string for the validator prompt. */
function buildMetricsCeiling(seniority: string, currency: string): string {
    type SeniorityKey = 'intern' | 'junior' | 'mid' | 'senior';
    type CurrencyKey = 'KES' | 'NGN' | 'ZAR' | 'GBP' | 'USD' | 'EUR' | 'AED' | 'NONE';

    const ceilings: Record<SeniorityKey, Record<CurrencyKey, string>> = {
        intern: {
            KES: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            NGN: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            ZAR: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            GBP: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            USD: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            EUR: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            AED: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
            NONE: 'Max projects: 2 (assisted). Max team: 0. No monetary figures.',
        },
        junior: {
            KES: 'Max project value: KES 4M. Max revenue/yr: KES 6M. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            NGN: 'Max project value: NGN 40M. Max revenue/yr: NGN 60M. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            ZAR: 'Max project value: ZAR 400K. Max revenue/yr: ZAR 600K. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            GBP: 'Max project value: GBP 250K. Max revenue/yr: GBP 500K. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            USD: 'Max project value: USD 300K. Max revenue/yr: USD 600K. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            EUR: 'Max project value: EUR 280K. Max revenue/yr: EUR 550K. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            AED: 'Max project value: AED 1.1M. Max revenue/yr: AED 2.2M. Max team: 3. Max projects: 8. Max efficiency gain: 18%.',
            NONE: 'No monetary figures. Max projects: 8. Max team: 3. Max efficiency gain: 18%.',
        },
        mid: {
            KES: 'Max project value: KES 18M. Max revenue/yr: KES 22M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            NGN: 'Max project value: NGN 180M. Max revenue/yr: NGN 220M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            ZAR: 'Max project value: ZAR 1.8M. Max revenue/yr: ZAR 2.2M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            GBP: 'Max project value: GBP 1.1M. Max revenue/yr: GBP 1.4M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            USD: 'Max project value: USD 1.3M. Max revenue/yr: USD 1.6M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            EUR: 'Max project value: EUR 1.2M. Max revenue/yr: EUR 1.5M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            AED: 'Max project value: AED 4.8M. Max revenue/yr: AED 5.9M. Max team: 10. Max projects: 18. Max efficiency gain: 28%.',
            NONE: 'No monetary figures. Max projects: 18. Max team: 10. Max efficiency gain: 28%.',
        },
        senior: {
            KES: 'Max project value: KES 120M. Max revenue/yr: KES 90M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            NGN: 'Max project value: NGN 1.2B. Max revenue/yr: NGN 900M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            ZAR: 'Max project value: ZAR 12M. Max revenue/yr: ZAR 9M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            GBP: 'Max project value: GBP 7.2M. Max revenue/yr: GBP 5.4M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            USD: 'Max project value: USD 8.5M. Max revenue/yr: USD 6.4M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            EUR: 'Max project value: EUR 7.8M. Max revenue/yr: EUR 5.9M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            AED: 'Max project value: AED 31M. Max revenue/yr: AED 23M. Max team: 25. Max projects: 45. Max efficiency gain: 42%.',
            NONE: 'No monetary figures. Max projects: 45. Max team: 25. Max efficiency gain: 42%.',
        },
    };

    const s = (seniority as SeniorityKey) in ceilings ? (seniority as SeniorityKey) : 'junior';
    const c = (currency as CurrencyKey) in ceilings[s] ? (currency as CurrencyKey) : 'NONE';
    return ceilings[s][c];
}

/** Build the mode-specific prompt block (Part 5 of Master Instructions). */
function buildModePromptBlock(
    mode: string,
    currency: string,
    seniority: string,
    market: string,
    blockD: string,
    gaps: GapInfo[] = []
): string {
    const blocks = `
BLOCK A — DETECTED CURRENCY: ${currency === 'NONE' ? 'NONE — use no monetary figures anywhere. Counts, percentages, and units only.' : currency}
BLOCK B — DETECTED SENIORITY: ${seniority}
BLOCK C — DETECTED MARKET: ${market}
BLOCK D — COMPANY CONTEXT: ${blockD || 'No company identified — proceed on JD signals alone.'}
${buildGapContext(gaps)}`;

    const metricsCeiling = buildMetricsCeiling(seniority, currency);

    // ─── Shared rules injected into every mode ────────────────────────────────
    const sharedHumanizationRules = `
BULLET LENGTH RULES:
- Every bullet must be 15–25 words. Aim for 18–22 words. Under 12 words = failure — expand with scope and outcome.
- Structure: [Strong Verb] + [What + How/Where/Who] + [Measurable Outcome or Observable Impact].

METRIC DENSITY RULES:
- Max 55% of bullets per role may contain a number. With 5 bullets, at most 3 may have metrics.
- Mix metric types: percentages, headcounts, currency, time saved, volume. Never repeat the same type consecutively.
- ROUND-NUMBER VARIATION (binding): Across the entire CV, NO MORE THAN 40% of numeric metrics may be multiples of 5 or 10. Real recruiters spot strings like "25%, 15%, 20%, 30%" instantly as AI output. Mix in specific numbers — 23%, 17%, 41%, 8.5h/wk, 47, 112, 1,340. If you must round, round to odd boundaries (3, 7, 11, 23) at least half the time.
- Bullets without numbers must still be vivid: "across 4 counties", "for a national client base", "within a 6-person team".
- NEVER write a metric just to have one. An honest descriptive bullet is better than a forced number.

GAP HANDLING RULES:
${gaps.length === 0
    ? '- No significant gaps detected in this profile.'
    : `- Gaps detected (see Block context above). Handle each intelligently:
  - If the gap is under 12 months: address it subtly in the summary or the adjacent role bullets ("while pursuing independent professional development", "during a period of focused study and certification").
  - If the gap is 12+ months: in Honest/Boosted modes, reference it briefly in the summary with a neutral, human framing. In Aggressive mode, you may use the self-directed entry rules below to fill the most significant gap.
  - Never leave a long gap completely unacknowledged if it appears suspicious — a recruiter will notice it and make negative assumptions. Control the narrative.
  - If the gap appears to coincide with a period of studying (e.g., 2020 attachment → 2024 intern suggests degree completion), frame the intervening period as academic: "Following completion of [degree/studies] in [year]..."`}
`;

    if (mode === 'honest') {
        return `
${blocks}

You are a professional CV writer operating in HONEST MODE for the global job market.

YOUR JOB IN THIS MODE:
Rewrite the user's real experience to be the strongest, clearest, most ATS-optimised version of itself. You are not adding anything that did not happen. You are making what did happen communicated in the most compelling way possible for this specific job in this specific market.

WHAT YOU CAN DO:
- Rewrite bullet points using strong, precise action verbs that match the job description's own language. Every verb must be different.
- Mirror exact keywords and terminology from the job description — if the JD says "stakeholder engagement", use those exact words. Place the 3 most critical JD keywords in the summary.
- Reorder bullet points within each role so the most JD-relevant achievement appears first, least relevant last.
- Improve grammar, sentence structure, and clarity throughout. Remove all filler phrases immediately.
- Use Block D company context to align language and tone precisely. A corporate firm gets precise, formal language. A startup gets action-focused, impact-driven language. An NGO gets mission-oriented, beneficiary-focused language.

METRIC RULE — CONTEXTUAL INFERENCE ONLY:
You may add a metric ONLY when there is enough context in what the user wrote to reasonably infer it.
  ALLOWED: User wrote "managed projects for 2 years" → infer "Managed 4–6 [project type] projects" (LOW end of ${seniority} range in ${market}).
  ALLOWED: User wrote "handled client accounts in Nairobi region" → infer "Managed 8–12 client accounts across Nairobi and surroundings".
  ALLOWED: User wrote "exceeded sales targets" → infer "Exceeded sales targets by 10–12%" (conservative LOW end).
  NOT ALLOWED: User gave zero context about quantity, scale, or value → describe without any number at all.
  NOT ALLOWED: Adding monetary figures when no financial scope was mentioned.
  THE TEST: Can you reasonably infer this number from what the user wrote? YES → use LOW end. NO → describe without a number.

METRIC CEILINGS for ${seniority} in ${market}: ${metricsCeiling}

CURRENCY RULE:
${currency === 'NONE'
    ? 'Block A detected NO currency. Use ZERO monetary figures anywhere. Express everything as percentages, counts, and units.'
    : `Use only ${currency} throughout. If more than one currency symbol appears anywhere in the document, remove ALL monetary figures and rewrite using percentages and counts only.`}

${sharedHumanizationRules}

WHAT YOU CANNOT DO:
- Add any company, role, or experience not provided by the user
- Change any employment dates for any reason
- Invent any metric the user did not mention or clearly imply
- Add skills the user did not list anywhere in their profile
- Change a job title to something grander than what was held
- Write any currency other than ${currency === 'NONE' ? 'none (no monetary figures at all)' : currency}
- Mix two currencies anywhere in the same document
- Ignore the company context in Block D
`;
    }

    if (mode === 'boosted') {
        return `
${blocks}

You are a professional CV writer operating in BOOSTED MODE for the global job market.

THE LOCK: Company names and employment dates provided by the user are locked. They cannot be changed. No new companies or employed roles may be added. This is absolute and non-negotiable.

YOUR JOB IN THIS MODE:
Take the user's real experience and make it as strong as it can plausibly be — using implied responsibilities standard for this role type and seniority in the detected market, and quantifying vague achievements using the low-to-mid range of the detected market metrics. Everything added must be something the candidate could confidently discuss and defend in an interview.

WHAT YOU CAN DO (everything in Honest Mode, plus):
- Add implied responsibilities that are genuinely standard for this role type at this seniority level. These are tasks any experienced recruiter would assume someone in this position carried out, even if the user did not list them explicitly. A junior water engineer who listed "site surveys" implicitly also coordinated with contractors, reviewed technical specs, and reported to a senior engineer — these can be added as bullets.
- Quantify vague achievements using the LOW-TO-MID end of the metrics table for ${market} at ${seniority} level. Never use the high end — that belongs to Aggressive Mode.
- Add 1–2 relevant skills from the job description that are genuinely plausible for this role type, industry, and background. The test: would any experienced recruiter believe someone in this position plausibly has this skill? If any doubt — do not add it.
- Strengthen the professional summary using Block D company context. Align language, terminology, and tone to what this specific company values and how they talk about their work publicly.
- For significant gaps (shown in Block context above): include a brief, natural-sounding reference in the summary or in the bullets adjacent to the gap period.

NUMBERS MUST LOOK REAL — the moment a number looks invented, the whole CV is suspect:
- Use 2.3M, not 2M. Use 11%, not 10%. Use 14 clients, not 15. Use 7 projects, not 5 or 10.
- Irregular, specific numbers read as real. Clean, round numbers read as made up.

METRIC CEILINGS (MAXIMUM allowed — midpoint of range):
${metricsCeiling}

CURRENCY RULE:
${currency === 'NONE'
    ? 'Block A detected NO currency. Use ZERO monetary figures. Counts, percentages, and units only throughout the entire document.'
    : `Use only ${currency} throughout the entire document. Never mix currencies. Never use a currency that was not detected.`}

${sharedHumanizationRules}

WHAT YOU CANNOT DO:
- Add any company or employed role not provided by the user
- Change any employment dates for any reason
- Use metrics above the MIDPOINT of the detected market table
- Add skills that are implausible for the background, industry, or role type
- Write any currency other than ${currency === 'NONE' ? 'none' : currency}
- Mix two currencies anywhere in the document
- Use suspiciously round numbers
- Ignore the company context in Block D
`;
    }

    // aggressive
    return `
${blocks}

You are a professional CV writer operating in AGGRESSIVE MODE for the global job market.

THE LOCK: Company names and employment dates provided by the user are locked and sacred. They cannot be changed, abbreviated, extended, or replaced under any circumstances whatsoever. This is the one rule in this mode that has zero flexibility. Every other decision is subordinate to it.

YOUR JOB IN THIS MODE:
Produce the most powerful version of this CV that is still fully credible to a recruiter in the detected market. Bold, targeted, keyword-saturated, and deeply aligned to the target company. Every single claim must still be defensible if a recruiter asks the candidate about it face-to-face in an interview. If a claim cannot be defended in an interview — remove it.

WHAT YOU CAN DO (everything in Boosted Mode, plus):
- Use the MID-TO-HIGH end of the metrics table for ${market} at ${seniority} level. The HIGH end of the range is the absolute hard ceiling — never exceed it, never get close to exceeding it.
- Add strong stretch responsibilities that are plausible for someone performing at the very top of their current role — not someone who has already been promoted beyond it. A high-performing junior engineer leads complex projects and mentors new hires. They do NOT manage a team of 15 or control a multi-million portfolio.
- Write a highly targeted, executive-quality professional summary positioning the user as the ideal candidate for this specific role at this specific company. Every sentence earns its place by connecting the user's real experience to what the JD and Block D say the company needs. No generic sentences. No filler. No padding.
- Maximise keyword density from the JD throughout every section. Every keyword appears inside a sentence that demonstrates genuine competence — not just mentioned. The CV must read like a human wrote it, not a keyword list.
- Use Block D company context deeply and specifically. Mirror their language, their values, their industry terminology. A recruiter at that company should feel the CV was written by someone who already understands their world from the inside.

FILLING A GENUINE EXPERIENCE GAP:
${gaps.length === 0
    ? 'No significant gaps detected — do not add any self-directed entry.'
    : `Gaps detected (see Block context above). You may add ONE self-directed work entry to fill the most significant gap only, if and only if ALL of these rules are satisfied:
- RULE A: Self-directed work only — freelance, independent project, short-term contract, or voluntary work. NEVER an employed role at a named company. The reason: a named employed role can be checked by calling HR. A freelance or consulting entry cannot be disproved in the same way — freelancers commonly work without formal contracts or payroll records.
- RULE B: The work type must exactly match the user's real skills. A water engineer's self-directed entry involves water engineering. A sales professional's entry involves sales consulting. Do not introduce any skill type that does not already exist in the profile.
- RULE C: Dates must sit entirely within the gap. No overlap with any real employment on either side. Cannot extend beyond today's date.
- RULE D: Seniority must match the surrounding roles. No sudden title promotion within the self-directed entry.
- RULE E: Use the LOW end of metrics for this entry — it must be the most modest entry on the CV. The real jobs must look more impressive than the gap filler.
- RULE F: Only ONE self-directed entry maximum. If there are multiple gaps, fill only the most professionally damaging one. Leave all others unfilled.
If ANY rule cannot be satisfied — do not add the entry. An unfilled gap is better than a fabricated record that can destroy the candidate's credibility.`}

NUMBERS MUST LOOK REAL — experienced recruiters catch inflated CVs by the numbers first:
- Use 13%, not 15%. Use KES 3.8M, not KES 4M. Use 22 clients, not 20 or 25. Use 7 projects, not 5 or 10. Use USD 287K, not USD 300K.
- Suspiciously round numbers are the single most common tell on an inflated CV.

METRIC CEILINGS (ABSOLUTE MAXIMUM — high end of range — never exceed):
${metricsCeiling}

CURRENCY RULE:
${currency === 'NONE'
    ? 'Block A detected NO currency. Use ZERO monetary figures anywhere. Percentages, counts, and units only throughout.'
    : `Use only ${currency} throughout. Final pass before returning: scan every bullet for currency symbols. If more than one appears anywhere in the entire document, remove ALL monetary figures and rewrite those bullets using percentages and counts only.`}

${sharedHumanizationRules}

WHAT YOU CANNOT DO:
- Change any provided company name or date for any reason
- Add an employed role at any company the user did not actually work at
- Invent skills or experience types the user does not have
- Use metrics above the HIGH end of the detected market table
- Apply senior-level metrics to a junior-level profile
- Create a backwards career timeline
- Add more than one self-directed entry per CV
- Use a self-directed entry that overlaps with real employment dates
- Write any currency other than ${currency === 'NONE' ? 'none' : currency}
- Mix two currencies anywhere in the document
- Use suspiciously round numbers
- Ignore the company context in Block D
`;
}

/** PART 6 — Groq validator. Runs after Boosted and Aggressive generation. */
async function runGroqValidator(
    cvData: CVData,
    rawExperience: string,
    currency: string,
    seniority: string,
    market: string,
    scenario: 'A' | 'B' | 'C' | 'D' | 'standard' = 'standard',
    hasSourceProjects: boolean = false
): Promise<CVData> {
    const metricsCeiling = buildMetricsCeiling(seniority, currency);

    // Scenario-specific checks injected only when relevant
    const scenarioChecks = scenario === 'standard' ? '' : `
CHECK 7 — EMPTY SECTION GUARD (applies to all scenarios)
Scan the entire CV. If any section key is present but its value is an empty array, empty string, or null → FLAG "Empty section: [name]" → Remove the key entirely.
An absent section is professional. An empty section header with no content is not.

CHECK 8 — FABRICATED SECTION GUARD
${scenario === 'B' || scenario === 'D'
    ? `SCENARIO ${scenario}: The source profile has NO personal projects.
If the generated CV contains a "projects" array with any entries → FLAG "Fabricated projects section" → Remove the entire projects array.
EXCEPTION: If a project entry is explicitly labelled as "Academic Project, [Institution], [Year]" AND the user's education data supports it → keep it.`
    : scenario === 'A'
    ? `SCENARIO A: The source profile has NO work experience AND NO personal projects.
If the generated CV contains an "experience" array with any entries → FLAG "Fabricated work experience" → Remove the entire experience array.
If the generated CV contains project entries NOT labelled as academic projects → FLAG "Fabricated project" → Remove those entries.`
    : scenario === 'C'
    ? `SCENARIO C: The source profile has NO work experience.
If the generated CV contains an "experience" array with entries that are NOT internships, attachments, volunteer technical work, or freelance work → FLAG "Fabricated work experience" → Remove those entries.`
    : ''}

CHECK 9 — SKILLS EVIDENCE AUDIT (thin CVs only — seniority: ${seniority})
${seniority === 'intern' ? `This is an intern/entry-level profile. Every skill listed must be directly traceable to:
  a) A named course or module in the education section, OR
  b) A project entry in the CV, OR
  c) A bullet point in an experience entry.
Skills with no evidence trail → FLAG "Unevidenced skill: [name]" → Remove from skills array.
Maximum tolerance: 0 unevidenced skills for Scenario A/C profiles.` : 'Skip Check 9 — not a thin CV profile.'}

CHECK 10 — SCENARIO SUMMARY CONSISTENCY
${scenario === 'A' ? `SCENARIO A: The summary must NOT imply professional work history. If it contains phrases like "X years of professional experience", "proven track record in [industry]", or any language implying paid employment → FLAG "Summary implies non-existent experience" → Rewrite as a Foundation Summary: [Degree/field/institution] + [specific capabilities from coursework] + [one academic achievement] + [readiness to contribute].`
    : scenario === 'C' ? `SCENARIO C: The summary must NOT imply paid work history. It must be a Projects-Led Summary: [identity as builder] + [strongest project outcome with metric] + [core technical stack] + [readiness to contribute to a team].`
    : scenario === 'D' ? `SCENARIO D: The summary must NOT overstate experience. It must be an Emerging Professional summary grounded in the single internship/attachment — no claims beyond what that role and education can support.`
    : ''}
`;

    const validatorPrompt = `
You are a strict CV quality validator for the global job market.

You have received:
- The generated CV to validate (below)
- The user's original raw work experience (source of truth)
- DETECTED CURRENCY: ${currency}
- DETECTED SENIORITY: ${seniority}
- DETECTED MARKET: ${market}
- METRIC CEILINGS: ${metricsCeiling}
- CANDIDATE SCENARIO: ${scenario} ${scenario !== 'standard' ? '(special handling required — see checks 7–10)' : '(standard profile)'}
- SOURCE PROFILE HAS PROJECTS: ${hasSourceProjects}

USER'S ORIGINAL RAW EXPERIENCE (source of truth — company names from here are the ONLY valid ones):
${rawExperience}

GENERATED CV TO VALIDATE:
${JSON.stringify(cvData)}

Run ALL checks below in strict order. Do not skip any check.

CHECK 1 — COMPANY INTEGRITY
Every company name in the generated CV must be one of:
  a) A company provided by the user in their original experience
  b) A self-directed freelance/consulting entry with no company name ("Independent Consultant" or "Freelance [Role]")
Any invented company name → FLAG "Unverifiable company: [name]" → Remove the entire experience entry.

CHECK 2 — TIMELINE LOGIC
No role's start date after its own end date. No two full-time roles at different employers overlap by more than 1 month. Any self-directed entry must sit cleanly within a detected gap.
Any timeline violation → FLAG and correct where obvious, remove where it cannot be explained.

CHECK 3 — METRIC BELIEVABILITY
Apply the metric ceilings above. Anything above the ceiling → FLAG "Metric too high for ${seniority} in ${market}: [metric]" → Reduce to the top of the acceptable range.
Suspiciously round numbers (exactly 50, exactly 10M, exactly 20%) → make them specific and slightly irregular.

CHECK 4 — CURRENCY CONSISTENCY
Scan every bullet, section, and summary for currency symbols. More than one distinct currency → FLAG "Currency mixing" → Remove all monetary figures from affected sections, rewrite as percentages and counts.
Any currency symbol when DETECTED CURRENCY is NONE → FLAG → Remove all monetary figures.

CHECK 5 — SENIORITY CONSISTENCY
Job titles and responsibilities must match ${seniority} level.
Intern/Junior with team of 10+ → FLAG. Junior with multi-million claims → FLAG. "Director/Head of/VP" under 5 years → FLAG.
Any mismatch → rewrite to correct seniority level.

CHECK 6 — SKILLS PLAUSIBILITY
Every skill must be plausible for the user's industry, role type, and background.
Completely disconnected skills → FLAG "Implausible skill: [name]" → Remove.
${scenarioChecks}
OUTPUT FORMAT — return JSON only, no markdown, no explanation:
{"valid": true|false, "flags": ["description1", ...], "cv": <full corrected cv data object>}
The "cv" field must ALWAYS be present — even when all checks pass.
`;

    const validatorSystem = 'You are a strict CV quality validator. Return only valid JSON.';
    const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // Try Cloudflare Workers AI first (free tier, saves Groq quota), fall back to Groq.
    try {
        const cf = await workerLLM(validatorSystem, validatorPrompt, { temperature: 0.1, json: true, maxTokens: 8000 });
        if (cf) {
            try {
                const parsed = JSON.parse(stripFences(cf));
                if (parsed.flags && parsed.flags.length > 0) {
                    console.warn('[CV Validator] Flags raised (cf):', parsed.flags);
                }
                console.log('[CV Validator] Pass complete via Cloudflare Workers AI.');
                return parsed.cv || cvData;
            } catch (parseErr) {
                console.warn('[CV Validator] Worker JSON parse failed, falling back to Groq:', parseErr);
            }
        }
    } catch (cfErr) {
        console.warn('[CV Validator] Worker call failed, falling back to Groq:', cfErr);
    }

    try {
        const result = await groqChat(GROQ_LARGE, validatorSystem, validatorPrompt, { temperature: 0.1, json: true, maxTokens: 8000 });
        const parsed = JSON.parse(stripFences(result));
        if (parsed.flags && parsed.flags.length > 0) {
            console.warn('[CV Validator] Flags raised:', parsed.flags);
        }
        return parsed.cv || cvData;
    } catch (e) {
        console.error('[CV Validator] Validation failed, returning original:', e);
        return cvData;
    }
}

/**
 * PART 7 — Humanization Audit Pass.
 * Runs after the Groq validator (or after Gemini generation in Honest mode).
 * Checks and fixes: short bullets, banned phrases, metric overload, and uniform rhythm.
 */
async function runHumanizationAudit(cvData: CVData): Promise<CVData> {
    // Sync the prompt with the LIVE banned-phrase list from the worker's KV cache
    // (D1 → KV → here). Falls back to the small hardcoded list when offline so the
    // pipeline never breaks. Cap at 80 phrases to keep the prompt token-budget sane.
    const HARDCODED_BANNED_BULLETS = '"delve", "robust", "seamlessly", "synergy", "cutting-edge", "state-of-the-art", "passionate about", "dynamic team", "innovative solutions", "results-driven", "detail-oriented", "team player", "go-getter", "responsible for", "helped with", "assisted in", "tasked with", "worked on", "was part of", "participated in", "contributed to"';
    const HARDCODED_BANNED_SUMMARY = '"passionate", "driven", "innovative", "seasoned professional", "dynamic", "cutting-edge", "result-oriented", "proactive", "detail-oriented", "versatile"';
    let liveBannedBullets = HARDCODED_BANNED_BULLETS;
    let liveBannedSummary = HARDCODED_BANNED_SUMMARY;
    let liveCount = 0;
    try {
        const banned = await getCachedBannedPhrases();
        if (banned && banned.length) {
            const phrases = banned.map(b => b.phrase).filter(p => typeof p === 'string' && p.length > 0);
            const bulletList = phrases.slice(0, 80);
            liveBannedBullets = bulletList.map(p => `"${p.replace(/"/g, '\\"')}"`).join(', ');
            // Summary check: single-word adjectives only (1 token, no spaces)
            const summaryList = phrases.filter(p => !p.includes(' ') && p.length <= 18).slice(0, 30);
            if (summaryList.length >= 5) {
                liveBannedSummary = summaryList.map(p => `"${p.replace(/"/g, '\\"')}"`).join(', ');
            }
            liveCount = phrases.length;
        }
    } catch (e) {
        console.warn('[CV Humanizer] Live banned-phrase fetch failed, using hardcoded list:', e);
    }
    if (liveCount > 0) {
        console.log(`[CV Humanizer] Audit prompt synced with ${liveCount} live banned phrases from CV engine.`);
    }

    const auditPrompt = `
You are a senior career writing editor with 20 years of experience. You are reviewing a CV JSON object.
Your ONLY job is to fix the specific problems listed below. Do not rewrite anything that isn't broken. Do not change dates, company names, job titles, or skills. Return the complete, corrected JSON.

PROBLEMS TO FIX — check every experience role's responsibilities array:

PROBLEM 1 — SHORT BULLETS (expand any bullet under 12 words):
A bullet under 12 words is too thin. Expand it by adding context: what was the scope, who was affected, what was the outcome, or how was it done. Keep it truthful to what the bullet was saying.
Example fix:
  BEFORE: "Managed client accounts across Kenya."  (5 words)
  AFTER:  "Managed a portfolio of 11 commercial client accounts across Central and Eastern Kenya, conducting quarterly reviews and maintaining service continuity."

PROBLEM 2 — BANNED PHRASES (replace these with specific, direct language):
Scan for and replace: ${liveBannedBullets}.
Replace each with a direct action verb or a specific description of what was actually done.

PROBLEM 3 — METRIC OVERLOAD (cap at 55% of bullets per role having a number):
Count bullets per role. If more than 55% contain a number (%, count, currency, or ratio), rewrite the excess bullets to remove numbers but keep them vivid using scope language: "across 4 counties", "for a national client base", "within a small cross-functional team", etc.
Priority: keep numbers in the bullets with the STRONGEST outcomes. Remove numbers from the weakest.

PROBLEM 4 — DUPLICATE VERB STARTERS (no two bullets across the whole document may start with the same verb):
Scan all responsibilities across ALL roles. If two bullets start with the same verb, rewrite the second one to start with a different strong action verb.

PROBLEM 5 — UNIFORM RHYTHM (no three bullets of similar length in a row):
If three consecutive bullets in a role are all approximately the same length (within 5 words of each other), shorten the middle one slightly or expand the last one slightly to create variation.

PROBLEM 6 — AI TONE PHRASES IN SUMMARY (check professionalSummary field):
The professional summary must not contain: ${liveBannedSummary}.
Replace with specific factual claims: years of experience, industries served, measurable outcomes, or named skills.
The summary's first sentence MUST start with either the candidate's job title or their years of experience — never with "I", "A", or "An".

PROBLEM 7 — VERB TENSE CONSISTENCY (check every role's responsibilities array):
For each role: if endDate is "Present" or empty/null, ALL bullets in that role must use PRESENT TENSE (Manages, Leads, Coordinates).
For all other roles (past jobs), ALL bullets must use PAST TENSE (Managed, Led, Coordinated).
If you find tense mixing within a single role, rewrite the offending bullets to match the correct tense.

PROBLEM 8 — FIRST BULLET MUST BE A SCOPE ANCHOR:
The first bullet of EVERY role should describe the SCOPE of the role (team size, geographic coverage, client count, budget, project count) — not an achievement.
If the first bullet is currently an achievement bullet, keep it as bullet #2 and write a new scope anchor as bullet #1.
If the role already has 6 bullets, remove the weakest achievement bullet to make room for the scope anchor.

Here is the CV JSON to audit and correct:
${JSON.stringify(cvData, null, 2)}

Return ONLY the corrected JSON object, no markdown, no explanation, no code fences.
`.trim();

    const auditSystem = 'You are a strict CV editor. Fix only the listed problems. Return only valid JSON.';
    const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // Try Cloudflare Workers AI first (free tier, saves Groq quota), fall back to Groq.
    try {
        const cf = await workerLLM(auditSystem, auditPrompt, { temperature: 0.15, json: true, maxTokens: 10000 });
        if (cf) {
            try {
                const parsed = JSON.parse(stripFences(cf));
                console.log('[CV Humanizer] Audit pass complete via Cloudflare Workers AI.');
                return parsed as CVData;
            } catch (parseErr) {
                console.warn('[CV Humanizer] Worker JSON parse failed, falling back to Groq:', parseErr);
            }
        }
    } catch (cfErr) {
        console.warn('[CV Humanizer] Worker call failed, falling back to Groq:', cfErr);
    }

    try {
        const result = await groqChat(GROQ_LARGE, auditSystem, auditPrompt, { temperature: 0.15, json: true, maxTokens: 10000 });
        const parsed = JSON.parse(stripFences(result));
        console.log('[CV Humanizer] Audit pass complete.');
        return parsed as CVData;
    } catch (e) {
        console.error('[CV Humanizer] Audit pass failed, returning original:', e);
        return cvData;
    }
}

/**
 * PART 8 — Deterministic Banned-Phrase Filter.
 *
 * This is a pure JavaScript pass — no AI call, no network, cannot fail.
 * It runs as the absolute last step before the CV is returned to the user,
 * acting as a guaranteed backstop regardless of what any prior AI pass did.
 *
 * Two tiers:
 *   TIER 1 — Standalone adjectives/adverbs: safe to remove word-only (won't break grammar).
 *   TIER 2 — Opener phrases ("responsible for X"): remove the opener, keep the rest of the sentence.
 */
function applyBannedPhraseFilter(cvData: CVData): CVData {
    // ── Tier 1 — single adjectives/adverbs. Pure deletion is grammatically
    //    safe (they modify the next word and removing them rarely breaks
    //    the sentence). Article agreement is repaired in tidy() below.
    const tier1Words = [
        'seamlessly', 'robust', 'holistic', 'proactive', 'groundbreaking',
        'transformative', 'dynamic', 'innovative', 'impactful',
    ];

    // ── Tier 2 — multi-word phrases. Each entry has a SUBSTITUTION rather
    //    than a hard strip. The previous version deleted the verb in
    //    phrases like "worked on payment systems", leaving " payment
    //    systems" — a broken sentence. Substitutions preserve grammar AND
    //    move the writing toward the concrete verbs the prompt rules
    //    require ("Built", "Led", "Drove", "Owned").
    //
    //    NOTE: contractions like "I've built" do NOT match any pattern
    //    here because \b boundaries treat the apostrophe as a word break,
    //    so "I've" is the token "I" + "ve" and never aligns with any
    //    multi-word pattern below. Tier 1 single words also have no
    //    overlap with contraction fragments.
    const tier2Subs: Array<{ pattern: string; replacement: string }> = [
        // Weak verbs / openers — keep the sentence with a stronger verb.
        { pattern: 'responsible for',         replacement: 'owned' },
        { pattern: 'tasked with',             replacement: 'led' },
        { pattern: 'helped with',             replacement: 'drove' },
        { pattern: 'assisted in',             replacement: 'supported' },
        { pattern: 'worked on',               replacement: 'built' },
        { pattern: 'was part of',             replacement: 'joined' },
        { pattern: 'participated in',         replacement: 'led' },
        { pattern: 'contributed to',          replacement: 'drove' },
        { pattern: 'played a key role in',    replacement: 'led' },
        { pattern: 'supported the',           replacement: 'led the' },
        { pattern: 'passionate about',        replacement: 'focused on' },
        // Pure filler — safe to delete.
        { pattern: 'results-driven',          replacement: '' },
        { pattern: 'detail-oriented',         replacement: '' },
        { pattern: 'team player',             replacement: '' },
        { pattern: 'go-getter',               replacement: '' },
        { pattern: 'thought leader',          replacement: '' },
        { pattern: 'game-changer',            replacement: '' },
        { pattern: 'best-in-class',           replacement: '' },
        { pattern: 'world-class',             replacement: '' },
        { pattern: 'cutting-edge',            replacement: '' },
        { pattern: 'state-of-the-art',        replacement: '' },
        { pattern: 'moving the needle',       replacement: '' },
        { pattern: 'navigate the landscape',  replacement: '' },
        { pattern: "in today's fast-paced world", replacement: '' },
        { pattern: 'excited to',              replacement: '' },
        { pattern: 'delve',                   replacement: 'dig into' },
        // Standalone 'passionate' only matches if 'passionate about'
        // didn't (longest-pattern-first ordering below).
        { pattern: 'passionate',              replacement: '' },
    ];

    // ── Tidy: repairs the inevitable artefacts (orphan punctuation,
    //    a/an disagreement, doubled "the the", leading commas, and
    //    sentence-start capitalization that substitutions can break —
    //    e.g. "Worked on X" → "built X" needs to become "Built X").
    function tidy(s: string, originalStartedUpper: boolean): string {
        let out = s;
        // Collapse runs of whitespace created by deletions.
        out = out.replace(/\s{2,}/g, ' ');
        // Pull punctuation back to the previous word: " ," " ." " ;" → ","
        out = out.replace(/\s+([,.;:!?])/g, '$1');
        // Strip leading punctuation/whitespace at sentence start.
        out = out.replace(/^[\s,;:.!?]+/, '');
        // Fix article disagreement after a Tier 1 deletion.
        // "an [consonant]" → "a [consonant]"
        out = out.replace(/\b([Aa])n\s+([bcdfghjklmnpqrstvwxz])/g,
            (_, A, c) => `${A === 'A' ? 'A' : 'a'} ${c}`);
        // "a [vowel]" → "an [vowel]"
        out = out.replace(/\b([Aa])\s+([aeiou])/g,
            (_, A, c) => `${A === 'A' ? 'An' : 'an'} ${c}`);
        // Adjacent duplicate words ("the the", "and and").
        out = out.replace(/\b(\w+)\s+\1\b/gi, '$1');
        // Re-capitalize first letter if the original was sentence-cased.
        // Substitutions like "Worked on" → "built" leave a lowercase opener.
        if (originalStartedUpper && out.length > 0) {
            out = out.charAt(0).toUpperCase() + out.slice(1);
        }
        // Re-capitalize after sentence-ending punctuation too: ". built" → ". Built"
        out = out.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
        return out.trim();
    }

    const stripped: string[] = [];
    let revertedCount = 0;

    function cleanText(text: string): string {
        if (!text || typeof text !== 'string') return text;
        const original = text;
        const origLen = original.replace(/\s+/g, ' ').trim().length;
        let t = text;

        // Tier 2 substitutions, longest-pattern-first so "passionate about"
        // wins over "passionate" and "supported the" wins over "supported".
        const sortedSubs = [...tier2Subs].sort(
            (a, b) => b.pattern.length - a.pattern.length,
        );
        for (const { pattern, replacement } of sortedSubs) {
            const re = new RegExp(
                `\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
                'gi',
            );
            if (re.test(t)) {
                stripped.push(pattern);
                t = t.replace(re, replacement);
            }
        }

        // Tier 1 standalone words — pure deletion.
        for (const word of tier1Words) {
            const re = new RegExp(`\\b${word}\\b`, 'gi');
            if (re.test(t)) {
                stripped.push(word);
                t = t.replace(re, '');
            }
        }

        const originalStartedUpper = /^[A-Z]/.test(original.trim());
        t = tidy(t, originalStartedUpper);

        // ── Safety guard: never ship a text that the filter destroyed.
        //    If a substitution accidentally over-fires (e.g. an unforeseen
        //    pattern eats most of the bullet), revert to the original and
        //    log it so we can review. Skip the guard for very short fields
        //    where ratio math is noisy.
        if (origLen >= 30 && (t.length < 12 || t.length / origLen < 0.5)) {
            revertedCount++;
            console.warn(
                `[CV BannedPhraseFilter] Reverted destructive strip: ` +
                `"${original.slice(0, 60)}…" → "${t.slice(0, 60)}…"`,
            );
            return original;
        }

        return t;
    }

    // Apply to every text field in CVData
    const result: CVData = {
        ...cvData,
        summary: cleanText(cvData.summary),
        skills: (cvData.skills || []).map(cleanText),
        experience: (cvData.experience || []).map(exp => ({
            ...exp,
            responsibilities: (exp.responsibilities || []).map(cleanText),
        })),
        education: (cvData.education || []).map(edu => ({
            ...edu,
            description: cleanText(edu.description || ''),
        })),
        projects: (cvData.projects || []).map(proj => ({
            ...proj,
            description: cleanText(proj.description || ''),
        })),
    };

    if (stripped.length > 0) {
        const unique = [...new Set(stripped)];
        console.warn(
            `[CV BannedPhraseFilter] Substituted ${stripped.length} ` +
            `banned instance(s): ${unique.join(', ')}` +
            (revertedCount ? ` (${revertedCount} reverted as destructive)` : ''),
        );
    } else {
        console.log('[CV BannedPhraseFilter] Clean — no banned phrases detected.');
    }

    return result;
}

// --- System-Level Constants for AI Control ---

// Compact anti-AI-detection rules — single source of truth, injected into
// every generation path (generateCV, regenerate, optimizeCVForJob, improveCV,
// generateCVFromGitHub, etc.) so they cannot be skipped or overridden.
// Full rules live in /data/cv-generation-rules.md.
const HUMANIZATION_RULES = `
ANTI-DETECTION RULES (binding — never skip, even on regenerate/optimize/improve):

- VOICE (this is the target — read carefully):
    Write as if a confident, slightly understated senior professional is describing their own work to a peer they respect. Direct, specific, a little dry. Quietly proud, never boastful. Sounds like a person, not a press release or a LinkedIn post. The reader should feel: "this person actually did the work and knows what they're talking about."
    DO: vary sentence length deliberately (mix 5–8 word punchy lines with 15–25 word elaborative ones); allow one slightly informal phrase per section; use first-person and contractions ("I've", "didn't", "wasn't") in the summary; let one honest opinion show through (e.g. "actually secure, not just compliant on paper").
    DON'T: write every sentence in perfect formal grammar; repeat the same sentence shape three times in a row; sound like a legal document, marketing copy, or recruiter template.

- BANNED BUZZWORDS / FILLER (zero tolerance — strip every instance, replace with a concrete fact):
    Generic self-praise: "highly motivated", "results-driven", "results-oriented", "detail-oriented", "self-starter", "go-getter", "team player", "dynamic", "dynamic team player", "proactive", "hard-working", "hardworking", "passionate", "passionate about", "excited to", "eager to".
    Empty action phrases: "leveraging expertise", "leveraging expertise to deliver value", "drive meaningful change", "drive meaningful change through innovative technology", "make a real impact", "make a difference", "move the needle", "take it to the next level", "at the end of the day", "in today's fast-paced world", "thought leader", "passion for participating in brainstorming sessions".
    AI-tells (recruiter surveys 2025 flag these as the top giveaways): "delve", "utilize" (use "use"), "leverage" (max once in the whole document), "synergy", "synergistic", "robust", "seamless", "seamlessly", "cutting-edge", "state-of-the-art", "groundbreaking", "transformative", "impactful" (show impact with a number instead), "innovative" (show innovation with a fact), "best-in-class", "holistic", "navigate", "landscape", "it's worth noting", "multifaceted", "unwavering commitment", "strategic visionary", "thought leader", "at the intersection of", "empower" (used vaguely), "proven track record".
    Bullet openers to avoid (the 2025 AI-CV signature — recruiters now flag these on sight): "Spearheaded", "Orchestrated", "Leveraged", "Utilized", "Facilitated", "Empowered", "Championed", "Responsible for", "Tasked with", "Helped with" — use varied real-work verbs instead (Built, Wrote, Fixed, Shipped, Cut, Reduced, Designed, Led, Debugged, Migrated, Rebuilt, Negotiated, Owned, Rolled out, Killed, Saved, Bought, Sold, Hired, Trained).

- METRIC HONESTY (recruiter trust signal — stacked AI metrics are now a known tell):
    Never write a chained-causal metric like "improved efficiency by 20%, resulting in a 30% increase in sales" — that pattern is the #1 signal of a fabricated AI bullet because the chain can't be verified.
    A single specific number tied to one action is far more credible than two numbers stitched together.
    If a number is estimated, mark it: "saved roughly 6 hours/week", "cut response time by ~40%". Estimation language reads more honest than fake precision.

- SKILL HONESTY: never claim "expert" in 5+ areas; a real candidate is expert in 1–2 things, proficient in a handful, learning others. If listing skills with proficiency, distribute them realistically.
- METRICS: only 50–60% of bullets carry a number; leave 1–2 bullets per role purely qualitative; use oddly specific numbers sometimes ("~7.5h/week", "roughly 30%"); vary metric type (time, cost, users, errors, satisfaction) — not always %.
- KEYWORDS: target 65–75% JD match, NOT 90–100%; rephrase JD wording instead of mirroring it verbatim; no keyword used >3 times in the whole CV; skip soft-skill keywords.
- BULLETS: vary opening verbs (Built, Wrote, Fixed, Shipped, Cut, Helped, Led, Debugged…); never start two bullets in one role with the same verb; mix formats: action+result, action+context, pure statement. The EXACT bullet count per role is set by the user — never add or remove bullets from the count given in the prompt.
- SUMMARY: 2–3 sentences, specific to THIS person, mention one niche/unexpected angle, end forward-looking; never list every tech; never repeat content already in the experience section.
  BAD (do NOT write like this): "Highly motivated software engineer with 2 years of experience leveraging expertise in regulatory compliance and GovTech to drive meaningful change through innovative technology..."
  GOOD (this is the target voice): "Backend engineer with 2 years building SaaS products, mostly in Laravel and React. I've shipped features used by government agencies and spent a lot of time making sure the data layer is actually secure, not just compliant on paper. Looking to join a team where the technical bar is high."
  Notice in the good example: concrete tech named, contraction used ("I've"), one honest opinionated phrase ("not just compliant on paper"), forward-looking close, zero buzzwords.
- SKILLS: 10–15, grouped meaningfully; only list what they could be interviewed on; one "currently learning" item is fine.
- GRAMMAR: ~90% perfect, not 100% — contractions OK ("didn't", "wasn't"); a recruiter reading aloud must not sound like a robot.

RECRUITER SIGNALS (what HR actively looks for in the 6-second scan — eye-tracking research 2025):
- 80% of recruiter scan time lands on five things: name, current job title + company, previous job title + company, dates, and education. Make those visually unmissable and unambiguous.
- Include the exact JD job title verbatim somewhere near the top (summary opening line is ideal). Candidates who do this are 10.6× more likely to be interviewed.
- Career progression must be readable in 6 seconds — scope, title seniority, or team size should visibly grow from oldest role to current role.
- Each role should have a one-line "scope anchor" (team size / region / budget / users / clients) before the achievement bullets, so HR sees the magnitude before the detail.
- Spell out acronyms once: "Enterprise Resource Planning (ERP)" — recruiters search either form.
- Skills section sits immediately after the summary (2025 skills-based hiring shift), NOT at the bottom.
- Never list 10+ "expert-level" skills — recruiters flag this as instantly fake.
- Dates: consistent format throughout (e.g. "Jan 2022 – Present"). Inconsistent date formatting is a parsing red flag for ATS and a sloppiness signal for humans.
`;

const HUMANIZATION_CHECKLIST = `
PRE-RETURN CHECKLIST (run silently before returning JSON; rewrite anything that fails — a recruiter must not sense AI):
1. Summary opens with a concrete, person-specific line — not "Highly motivated…", not "Results-driven…", not "Passionate…".
2. The exact JD job title appears once near the top (summary or first role).
3. No phrase is repeated 3+ times anywhere in the document.
4. 40–50% of bullets are PURELY qualitative (no number) — fix any role where every bullet has a metric.
5. At least one metric is oddly specific (e.g. "~6h/week", "roughly 38%") — not all round 25/30/40/50%.
6. Zero chained-causal metrics (no "did X by Y%, leading to Z%" patterns) — those read as fabricated.
7. No sentence appears word-for-word from the JD; estimated keyword overlap sits in the 65–75% range, not higher.
8. ZERO instances of: "Spearheaded", "Orchestrated", "Leveraged", "Utilized", "Facilitated", "Empowered" as bullet openers anywhere in the document.
9. ZERO instances of any banned buzzword from the rules above (delve, robust, seamlessly, synergy, multifaceted, unwavering commitment, thought leader, at the intersection of, etc.).
10. Sentence lengths visibly vary within every section — no three sentences in a row of similar length.
11. Skills section has no more than 1–2 items that could be called "expert level".
12. Career progression (title, scope, or team size) is visibly bigger in the current role than in the oldest role.
13. Read the summary out loud in your head — does it sound like a person, or a LinkedIn template? If template, rewrite.
`;

const SYSTEM_INSTRUCTION_PROFESSIONAL = `
You are the world's foremost CV strategist — a fusion of elite executive recruiter, Fortune 500 hiring manager, and award-winning resume writer with 25+ years of experience. You understand how ATS systems score resumes and how recruiters make shortlist decisions in 6–10 seconds.

FOUNDATIONAL RULES (structural — apply to every CV you produce):

  RULE 1 — BULLET FORMULA:
    WITH metrics → XYZ: "Accomplished [X] as measured by [Y metric] by doing [Z]."
      Example: "Grew SME client base by 34% over 8 months by redesigning field visit cadence."
    WITHOUT metrics → CAR: "[Challenge/Context] → [Action taken] → [Result produced]."
      Example: "No standardised data process across 3 counties — designed unified template that cut errors and disputes."
    NEVER use STAR format — it is for interviews, not CVs.

  RULE 2 — QUANTIFICATION MATRIX (attempt all 4 dimensions per role, use only what is honest):
    MAGNITUDE: by how much? (%, factor, before/after)
    SCALE: how big? (team, clients, projects, regions, users)
    SPEED: how fast? (time saved, turnaround, SLA)
    VALUE: what was it worth? (revenue, cost, budget, contract)
    When a dimension is genuinely unknown — use scope language, never invent a number.

  RULE 3 — CAREER ARC (growth must be visible top-to-bottom):
    Scope, responsibility, and metric scale must visibly increase across roles.
    Current role must carry the largest numbers and broadest scope.
    Promotions within the same company must be made explicit.

${HUMANIZATION_RULES}

Output ONLY valid JSON matching the requested schema. NEVER include markdown, code fences, or prose outside the schema.
`;

const SYSTEM_INSTRUCTION_PARSER = `
You are an expert data parser. Convert unstructured text into accurate JSON.
Standardize dates to consistent formats. Preserve names, companies, and titles exactly.
Never invent data unless explicitly instructed.
When returning JSON, output ONLY the raw JSON object — no markdown fences, no commentary, no trailing text.
`;

const SYSTEM_INSTRUCTION_HUMANIZER = `
You are a senior editor at a top career consultancy. Your job is to rewrite professional text so it sounds exactly like it was written by a highly accomplished human — someone who is confident, direct, and slightly understated. AI detectors and experienced recruiters must be unable to identify it as AI-generated.

Critical rules:
- SENTENCE RHYTHM: Deliberately alternate between short punchy statements (5–8 words) and longer elaborative ones (15–25 words). Three sentences of similar length in a row is a failure.
- OPENING VARIETY: No two sentences in the same section may start with the same word or grammatical structure (e.g., avoid "I", "The", "By", "This" repeated consecutively).
- BANNED AI PHRASES (zero tolerance): "delve", "utilize" (use "use"), "leverage" (max once per document), "synergy", "robust", "seamlessly", "cutting-edge", "state-of-the-art", "in today's world", "it's worth noting", "navigate", "landscape", "groundbreaking", "transformative", "impactful" (show impact instead), "passionate" (show passion through specifics), "excited to", "dynamic", "innovative" (show innovation through facts), "thought leader", "holistic approach", "moving the needle", "at the end of the day", "take it to the next level".
- SPECIFICITY RULE: Replace every vague phrase with a concrete fact. Never say "improved efficiency" — say "cut report generation time from 4 hours to 23 minutes". Never say "led a team" — say "managed a 7-person cross-functional team".
- For CVs specifically: every bullet must feel LIVED, not templated. It should sound like the person is telling you about their proudest moment, not reading a job description.
- ACTION VERB FRESHNESS: Never repeat an action verb in the same job's bullet list. Across the whole document, use each verb no more than twice.
- NUMBERS RULE: Keep all numbers, dates, company names, job titles, and achievements EXACTLY as provided — never change factual details.
- Return ONLY the rewritten text. No preamble, no commentary, no "Here is the rewritten version:".
`;

// --- Gemini Client (multimodal only — PDF/image parsing) ---
function getGeminiClient(): GoogleGenAI {
    // 1. In-memory decrypted key (primary — populated by KeyVault on app start)
    let apiKey: string | undefined = _rtGemini() ?? undefined;

    // 2. Legacy plaintext fallback (migration path)
    if (!apiKey) {
        const settingsString = localStorage.getItem('cv_builder:apiSettings') || localStorage.getItem('apiSettings');
        if (settingsString) {
            try {
                const settings = JSON.parse(settingsString);
                if (settings.apiKey && !settings.apiKey.startsWith('enc:v1:')) {
                    apiKey = settings.apiKey.replace(/^"|"$/g, '');
                }
            } catch { /* ignore */ }
        }
    }

    if (!apiKey) {
        try {
            const providerKeys = JSON.parse(localStorage.getItem('cv_builder:provider_keys') || '{}');
            if (providerKeys.gemini && !providerKeys.gemini.startsWith('enc:v1:')) {
                apiKey = providerKeys.gemini.replace(/^"|"$/g, '');
            }
        } catch { /* ignore */ }
    }

    if (!apiKey) throw new Error('Gemini API key not set. Please add it in Settings to enable file/image upload.');
    return new GoogleGenAI({ apiKey });
}

// --- Gemini Retry Logic (for multimodal calls) ---
async function retryGemini<T>(operation: () => Promise<T>, retries = 4, delayMs = 1500): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        const msg = error?.message || '';
        const status = error?.status;
        const isTransient = status === 503 || status === 429 ||
            msg.includes('503') || msg.includes('Overloaded') ||
            msg.includes('429') || msg.includes('Rate Limit');
        if (retries > 0 && isTransient) {
            await new Promise(r => setTimeout(r, delayMs));
            return retryGemini(operation, retries - 1, delayMs * 2);
        }
        throw error;
    }
}

// --- Compact-serialize a profile for embedding in Groq prompts.
//     Aggressively strips empty fields, redundant IDs, and oversized text to
//     keep input tokens well under Groq's per-request limits while preserving
//     all information the LLM actually needs.
function compactProfile(profile: UserProfile, maxResponsibilityChars = 350): string {
    // Remove undefined/null/empty-string/empty-array values recursively
    function strip(obj: any): any {
        if (Array.isArray(obj)) {
            return obj.map(strip).filter(v => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0));
        }
        if (obj && typeof obj === 'object') {
            const out: any = {};
            for (const [k, v] of Object.entries(obj)) {
                // Skip internal IDs — LLM doesn't need them in the prompt
                if (k === 'id') continue;
                const stripped = strip(v);
                if (stripped !== null && stripped !== undefined && stripped !== '' && !(Array.isArray(stripped) && stripped.length === 0)) {
                    out[k] = stripped;
                }
            }
            return out;
        }
        return obj;
    }

    const p = strip({
        personalInfo: profile.personalInfo,
        // Cap skills to 20 most relevant — LLM doesn't benefit from 50+ skills
        skills: (profile.skills || []).slice(0, 20),
        // Cap projects to 6 most recent/relevant
        projects: (profile.projects || []).slice(0, 6).map(pr => ({
            name: pr.name,
            description: typeof pr.description === 'string'
                ? pr.description.substring(0, 200)
                : pr.description,
            link: pr.link,
        })),
        workExperience: (profile.workExperience || []).map(exp => ({
            company: exp.company,
            jobTitle: exp.jobTitle,
            startDate: exp.startDate,
            endDate: exp.endDate,
            pointCount: exp.pointCount,
            responsibilities: typeof exp.responsibilities === 'string'
                ? exp.responsibilities.substring(0, maxResponsibilityChars)
                : (Array.isArray(exp.responsibilities)
                    ? (exp.responsibilities as string[]).slice(0, 6).join('\n').substring(0, maxResponsibilityChars)
                    : ''),
        })),
        education: (profile.education || []).map(edu => ({
            degree: edu.degree,
            school: edu.school,
            graduationYear: edu.graduationYear,
            description: typeof (edu as any).description === 'string'
                ? (edu as any).description.substring(0, 150)
                : undefined,
        })),
        languages: profile.languages,
        customSections: profile.customSections,
        sectionOrder: profile.sectionOrder,
    });

    return JSON.stringify(p);
}

/**
 * Smartly truncate a job description to a target character limit while
 * preserving as much keyword signal as possible.
 * Strategy: keep the first block (role summary), then keyword-dense middle,
 * then requirements/skills section — discarding boilerplate filler.
 */
function smartTruncateJD(jd: string, maxChars = 3200): string {
    const clean = (jd || '').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!clean || clean.length <= maxChars) return clean;

    // Break JD into meaningful chunks (headings, bullets, paragraphs).
    const chunks = clean
        .split(/\n+/)
        .map(s => s.trim())
        .filter(Boolean)
        .flatMap(s => s.length > 420 ? s.split(/(?<=[.;])\s+/).map(x => x.trim()).filter(Boolean) : [s]);

    const weakBoilerplate = /\b(equal opportunity|eeo|accommodation|background check|drug test|benefits|perks|about us|our culture|privacy policy|cookie|applicants with disabilities|all qualified applicants)\b/i;
    const highSignal = /\b(requirements?|qualifications?|responsibilities?|must have|nice to have|key skills?|experience with|proficient|degree|certification|tools?|tech stack|kubernetes|python|java|sql|aws|gcp|azure)\b/i;

    const scored = chunks.map((c, idx) => {
        const lower = c.toLowerCase();
        const wordCount = lower.split(/\s+/).length;
        const keywordHits = (lower.match(/\b(requirements?|qualifications?|responsibilities?|must|experience|skills?|tools?|degree|certification)\b/g) || []).length;
        const techHits = (lower.match(/\b(python|java|sql|aws|gcp|azure|kubernetes|docker|react|node|ci\/cd|terraform)\b/g) || []).length;
        const numberHits = (lower.match(/\d+/g) || []).length;
        const isWeak = weakBoilerplate.test(lower);
        let score = keywordHits * 3 + techHits * 4 + numberHits;
        if (highSignal.test(lower)) score += 8;
        if (idx < 2) score += 6; // keep role-context intro
        if (wordCount < 3) score -= 4;
        if (isWeak) score -= 14;
        return { idx, text: c, score };
    });

    // Keep highest-signal chunks, then restore original order.
    const picked = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(8, Math.ceil(scored.length * 0.55)))
        .sort((a, b) => a.idx - b.idx);

    let out = '';
    for (const p of picked) {
        if ((out + '\n' + p.text).length > maxChars) continue;
        out += (out ? '\n' : '') + p.text;
    }

    // Safety fallback if scoring discarded too much.
    if (out.length < 800) {
        const head = clean.substring(0, Math.floor(maxChars * 0.7));
        const tail = clean.substring(clean.length - Math.floor(maxChars * 0.2));
        return `${head}\n…\n${tail}`.slice(0, maxChars + 3);
    }
    return out;
}

function jdProfileSimilarity(profile: UserProfile, jd: string): number {
    if (!jd.trim()) return 0;
    const jdTokens = new Set(
        jd.toLowerCase()
            .replace(/[^\w\s/+-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 4)
    );
    if (jdTokens.size === 0) return 0;

    const profileText = [
        ...(profile.skills || []),
        ...(profile.workExperience || []).flatMap(e => [e.jobTitle, e.company, ...(typeof e.responsibilities === 'string' ? e.responsibilities.split('\n') : (e.responsibilities || []))]),
        ...(profile.education || []).flatMap(e => [e.degree, e.school]),
    ].join(' ').toLowerCase();

    const pTokens = new Set(
        profileText.replace(/[^\w\s/+-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 4)
    );
    if (pTokens.size === 0) return 0;

    let overlap = 0;
    for (const t of pTokens) if (jdTokens.has(t)) overlap++;
    return overlap / Math.min(jdTokens.size, pTokens.size);
}

function buildStaleProfileRefreshInstruction(
    profile: UserProfile,
    marketResearch?: MarketResearchResult | null
): string {
    const roleText = (profile.workExperience || []).map(w =>
        `${w.jobTitle || ''} ${w.company || ''} ${
            typeof w.responsibilities === 'string'
                ? w.responsibilities
                : (w.responsibilities || []).join(' ')
        }`
    ).join(' ').toLowerCase();
    const roleSignals: Array<{ name: string; hits: number; keywords: string[] }> = ROLE_TRACKS.map(s => ({
        ...s,
        hits: s.keywords.reduce((n, kw) => n + ((roleText.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length), 0),
    }));
    const dominantSignals = roleSignals
        .filter(s => s.hits > 0)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 3);
    const detectedTracks = dominantSignals.map(s => `${s.name} (${s.hits})`).join(', ');

    const gaps = detectGaps(profile.workExperience || []).filter(g => g.gapMonths >= 4);
    const gapContext = gaps.length
        ? gaps.slice(0, 2).map(g => `${g.gapMonths}mo between "${g.fromRole}" → "${g.toRole}"`).join('; ')
        : 'none';

    const currentRole = (profile.workExperience || []).find(w => !w.endDate || /present/i.test(String(w.endDate)));
    if (!currentRole?.startDate) return '';
    const start = new Date(currentRole.startDate);
    if (isNaN(start.getTime())) return '';

    const monthsInRole = Math.max(0,
        (new Date().getFullYear() - start.getFullYear()) * 12 +
        (new Date().getMonth() - start.getMonth())
    );
    const bulletCount = typeof currentRole.responsibilities === 'string'
        ? currentRole.responsibilities.split('\n').filter(Boolean).length
        : (currentRole.responsibilities || []).length;
    const projectCount = (profile.projects || []).length;
    const likelyStale = monthsInRole >= 24 && (bulletCount <= 4 || projectCount <= 1);
    if (!likelyStale) return '';

    const toolHints = (marketResearch?.expectedTools || []).slice(0, 6).join(', ');
    const skillHints = (profile.skills || []).slice(0, 8).join(', ');
    return `
    **PROFILE RECENCY REFRESH MODE (stale-profile detected):**
    The candidate has been in the current role for ~${Math.round(monthsInRole / 12)} year(s) but has sparse recent evidence in the source CV.
    Refresh the narrative to reflect likely recent scope growth while staying faithful to known facts.

    DETECTION EVIDENCE (use this as the inference boundary):
    - Dominant work tracks from actual experience text: ${detectedTracks || 'insufficient signal'}.
    - Notable career gaps: ${gapContext}.

    HARD LIMITS (never violate):
    - Keep company names, job titles, and employment dates unchanged.
    - Do NOT invent new employers, degrees, or certifications.
    - DEGREE PRESERVATION (binding): The degree name AND institution MUST be
      copied verbatim from the candidate's profile. Never paraphrase, abbreviate,
      translate, "improve", or invent. "BSc Computer Science" stays "BSc Computer Science"
      — not "Bachelor of Science in Computing", not "BS Comp Sci", not "Bachelor's degree".
      The institution string is sacred too: "University of Nairobi" never becomes
      "Nairobi University". If you cannot fit the exact string, keep the exact string.
    - Do NOT fabricate impossible metrics; only use conservative, believable ranges.
    - Only infer activities that are consistent with the detected work tracks above.

    REFRESH RULES:
    - Expand current-role bullets to show progression in ownership, scope, and complexity since the role started.
    - Convert repeated maintenance-style bullets into higher-value outcomes (automation, efficiency, reliability, stakeholder impact) using the candidate's real domain.
    - Surface recent project-like deliverables inside experience bullets when standalone projects are missing.
    - Prioritise tools already known from profile skills (${skillHints || 'profile skills'}) and market expectations (${toolHints || 'no market hints available'}).
    `;
}

function applySourceFidelityRules(cvData: CVData, profile: UserProfile): CVData {
    const sourceRoles = profile.workExperience || [];
    const sourceSkills = Array.from(new Set((profile.skills || []).map(s => String(s || '').trim()).filter(Boolean)));

    // Rule 1 + 5: never add unseen skills, never remove existing skills.
    const generatedSkills = Array.isArray(cvData.skills) ? cvData.skills.map(s => String(s || '').trim()).filter(Boolean) : [];
    const allowedSet = new Set(sourceSkills.map(s => s.toLowerCase()));
    const filtered = generatedSkills.filter(s => allowedSet.has(s.toLowerCase()));
    const mergedSkills = Array.from(new Set([...filtered, ...sourceSkills]));
    cvData.skills = mergedSkills.slice(0, 25);

    // Rule 3 + 4 + 6: preserve company/job-title/date identity from source.
    if (Array.isArray(cvData.experience)) {
        cvData.experience = cvData.experience.map((exp, idx) => {
            const src = sourceRoles[idx];
            if (!src) return exp;

            const sourceBullets = typeof src.responsibilities === 'string'
                ? src.responsibilities.split('\n').map(x => x.trim()).filter(Boolean)
                : (src.responsibilities || []);
            const sourceNumberTokens = new Set(
                sourceBullets.flatMap(b => (b.match(/\b\d+(?:[.,]\d+)?\b/g) || []))
            );
            const fixedResponsibilities = (exp.responsibilities || []).map(r => {
                let out = String(r || '');
                // Rule 2: strip generated metric-like claims not grounded in source bullets.
                if (sourceNumberTokens.size === 0) {
                    out = out
                        .replace(/\b\d+([.,]\d+)?\s*%/g, '')
                        .replace(/\$\s?\d[\d,]*/g, '')
                        .replace(/\b\d+([.,]\d+)?\s*(x|times)\b/gi, '')
                        .replace(/\b\d+(?:[.,]\d+)?\b/g, '');
                } else {
                    out = out.replace(/\b\d+(?:[.,]\d+)?\b/g, (m) => sourceNumberTokens.has(m) ? m : '');
                }
                return out.replace(/\s{2,}/g, ' ').trim();
            }).filter(Boolean);

            return {
                ...exp,
                company: src.company || exp.company,
                jobTitle: src.jobTitle || exp.jobTitle,
                startDate: src.startDate || exp.startDate,
                endDate: src.endDate || exp.endDate,
                dates: exp.dates || '',
                responsibilities: fixedResponsibilities.length ? fixedResponsibilities : sourceBullets,
            };
        });
    }

    // Preserve existing user-owned custom sections (awards/certifications if stored there).
    if (Array.isArray(profile.customSections) && profile.customSections.length > 0) {
        cvData.customSections = profile.customSections;
    }

    return cvData;
}

function applyFidelityAgainstSourceCV(cvData: CVData, sourceCV: CVData): CVData {
    const pseudoProfile = {
        skills: sourceCV.skills || [],
        workExperience: (sourceCV.experience || []).map(exp => ({
            company: exp.company || '',
            jobTitle: exp.jobTitle || '',
            startDate: exp.startDate || '',
            endDate: exp.endDate || '',
            responsibilities: exp.responsibilities || [],
        })),
        customSections: sourceCV.customSections || [],
    } as unknown as UserProfile;
    return applySourceFidelityRules(cvData, pseudoProfile);
}

function finalizeCvData(
    cvData: CVData,
    opts: { profile?: UserProfile; sourceCv?: CVData; runPurify?: boolean } = {}
): CVData {
    const { profile, sourceCv, runPurify = true } = opts;
    let out = runPurify ? purifyCV(cvData).cv : cvData;
    if (profile) out = applySourceFidelityRules(out, profile);
    else if (sourceCv) out = applyFidelityAgainstSourceCV(out, sourceCv);
    return out;
}

/**
 * Returns an instruction string about the user's preferred section order and custom sections.
 * This is injected into the generateCV prompt so the AI honours the user's preferences.
 */
function buildSectionOrderInstruction(profile: UserProfile): string {
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
RETURN FORMAT — output ONLY a raw JSON object (no markdown, no code fences) matching this schema:
{
  "personalInfo": {
    "name": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "linkedin": "string",
    "website": "string",
    "github": "string"
  },
  "summary": "string",
  "workExperience": [
    {
      "id": "string (unique)",
      "company": "string",
      "jobTitle": "string",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or Present",
      "responsibilities": "string (bullet points separated by \\n)"
    }
  ],
  "education": [
    { "id": "string", "degree": "string", "school": "string", "graduationYear": "string" }
  ],
  "skills": ["string"],
  "projects": [
    { "id": "string", "name": "string", "description": "string", "link": "string" }
  ],
  "languages": [
    { "id": "string", "name": "string", "proficiency": "string" }
  ]
}
`;

// --- CVData JSON schema description for Groq prompts ---
const CV_DATA_SCHEMA = `
RETURN FORMAT — output ONLY a raw JSON object (no markdown, no code fences) matching this schema:
{
  "summary": "string",
  "skills": ["string"],
  "experience": [
    {
      "company": "string",
      "jobTitle": "string",
      "dates": "string (e.g. Jan 2020 – Present)",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or Present",
      "responsibilities": ["string"]
    }
  ],
  "education": [
    { "degree": "string", "school": "string", "year": "string", "description": "string" }
  ],
  "projects": [
    { "name": "string", "description": "string", "link": "string" }
  ],
  "languages": [
    { "name": "string", "proficiency": "string" }
  ]
}
`;

// --- Humanize a block of plain text to remove AI patterns ---
export const humanizeText = async (text: string): Promise<string> => {
    const prompt = `Rewrite the following professional text so it sounds naturally human-written. Preserve all facts, dates, names, and numbers. Only change phrasing and style.\n\nTEXT TO REWRITE:\n${text}`;
    // Try Cloudflare Workers AI first (free tier, saves Groq quota), fall back to Groq.
    try {
        const cf = await workerLLM(SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.8, maxTokens: 2500 });
        if (cf && cf.trim()) return cf;
    } catch (cfErr) {
        console.warn('[humanizeText] Worker call failed, falling back to Groq:', cfErr);
    }
    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.8, maxTokens: 2500 });
};

// --- Build scholarship format-specific instructions ---
function buildScholarshipFormatInstruction(format: ScholarshipFormat): string {
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

    // Try Cloudflare Workers AI first (free tier, saves Groq quota), fall back to Groq.
    let text: string | null = null;
    try {
        const cf = await workerLLM(SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true, maxTokens: 4096 });
        if (cf && cf.trim()) {
            // Sanity-check the worker output is valid JSON before committing to it.
            try { JSON.parse(cf.trim()); text = cf; }
            catch { console.warn('[parseProfileText] Worker JSON parse failed, falling back to Groq.'); }
        }
    } catch (cfErr) {
        console.warn('[parseProfileText] Worker call failed, falling back to Groq:', cfErr);
    }
    if (!text) {
        text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true, maxTokens: 4096 });
    }
    const profileData: UserProfile = JSON.parse(text.trim());
    profileData.projects = profileData.projects || [];
    profileData.education = profileData.education || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages = profileData.languages || [];

    return profileData;
};

export const generateCV = async (
    profileInput: UserProfile,
    contextDescription: string,
    generationMode: CVGenerationMode,
    purpose: 'job' | 'academic' | 'general',
    scholarshipFormat: ScholarshipFormat = 'standard',
    marketResearch?: MarketResearchResult | null,
    targetLanguage?: string
): Promise<CVData> => {

    // ── HOT FIRE (inbound) ── Scrub banned phrases out of the source profile
    // BEFORE any prompt is built, so the AI is never primed by buzzwords the
    // user typed manually or that survived from a non-Word import path.
    const profile = purifyProfile(profileInput);

    // Smart-truncate the JD before anything else to reduce token spend on every
    // downstream call (keyword analysis, mode prompt, market intel, etc.)
    const jd = smartTruncateJD(contextDescription.trim());

    // ── Cache check: return immediately if profile+JD+mode haven't changed ──
    const cacheKey = cvCacheKey(profile, jd, generationMode, purpose, {
        targetLanguage,
        scholarshipFormat,
        marketResearch: marketResearch || null,
    });
    const cached = cvCacheGet(cacheKey);
    if (cached) {
        console.log('[CV Cache] Hit — returning cached result (no tokens used)');
        return cached;
    }

    // Compute total years of experience for the engine brief
    const totalYears = (profile.workExperience || []).reduce((sum, exp) => {
        const sy = exp.startDate ? new Date(exp.startDate).getFullYear() : null;
        const ey = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
        return sum + (sy ? Math.max(0, ey - sy) : 0);
    }, 0);
    const primaryTitle = profile.workExperience?.[0]?.jobTitle || '';

    // Run keyword extraction and CV-engine brief in parallel — both are best-effort.
    let keywordInstruction = '';
    let engineBrief: CVBrief | null = null;
    const [keywordRes, briefRes] = await Promise.allSettled([
        jd ? analyzeJobDescriptionForKeywords(jd) : Promise.resolve(null),
        buildBrief({
            jd: jd || undefined,
            // Worker-first enrichment: send a compact profile snapshot so the
            // Cloudflare brief builder can score field/voice with more context
            // than JD text alone (skills, title trajectory, project domains).
            profile: {
                headline: profile.summary || profile.personalInfo?.title || '',
                skills: (profile.skills || []).slice(0, 30),
                experience: (profile.workExperience || []).map(exp => ({
                    jobTitle: exp.jobTitle || '',
                    company: exp.company || '',
                    responsibilities: exp.responsibilities || '',
                    startDate: exp.startDate || '',
                    endDate: exp.endDate || '',
                })).slice(0, 12),
                projects: (profile.projects || []).map(p => ({
                    name: p.name || '',
                    description: p.description || '',
                    technologies: (p as any).technologies || [],
                })).slice(0, 10),
            },
            yearsExperience: totalYears,
            currentTitle: primaryTitle,
            section: 'current_role',
            bulletCount: profile.workExperience?.[0]?.pointCount ?? 5,
        }),
    ]);
    if (keywordRes.status === 'fulfilled' && keywordRes.value) {
        const allKeywords = [...(keywordRes.value.keywords || []), ...(keywordRes.value.skills || [])];
        if (allKeywords.length > 0) {
            keywordInstruction = `
                **CRITICAL REQUIREMENT: KEYWORD STRATEGY**: Strategically and naturally integrate the following keywords throughout the CV — in the summary, bullet points, and skills. Weave them in so they feel organic, not stuffed.
                **Must-Include Keywords**: ${allKeywords.join(', ')}
                `;
        }
    } else if (keywordRes.status === 'rejected') {
        console.error("Keyword analysis failed, proceeding without explicit keywords.", keywordRes.reason);
    }
    if (briefRes.status === 'fulfilled' && briefRes.value) {
        engineBrief = briefRes.value;
        console.log(`[CV Engine] Brief: ${engineBrief.seniority?.level} / ${engineBrief.field?.field} / voice=${engineBrief.voice.primary?.name} / verbs=${engineBrief.verb_pool.length}`);
    }

    // Build the engine-driven instruction block (only when the brief is available).
    let engineInstruction = '';
    if (engineBrief) {
        const verbList = engineBrief.verb_pool.slice(0, 24).map(v => v.verb_past || v.verb).join(', ');
        const forbidden = engineBrief.forbidden_phrases.slice(0, 30).join(', ');
        const sen = engineBrief.seniority;
        const voice = engineBrief.voice.primary;
        const field = engineBrief.field;
        const rhythm = engineBrief.rhythm;
        engineInstruction = `
        **CV ENGINE BRIEF (deterministic, overrides general guidance below)**
        - Seniority: ${sen?.level || 'unknown'} → bullet style "${sen?.bullet_style || 'balanced'}", metric density "${sen?.metric_density || 'medium'}", summary tone "${sen?.summary_tone || 'professional'}".
        - Field: ${field?.field || 'general'} → language style "${field?.language_style || 'neutral'}". Prefer metric types: ${(field?.metric_types || []).join(', ') || 'general business metrics'}. Avoid these verbs entirely: ${(field?.avoided_verbs || []).join(', ') || 'none'}.
        - Voice: primary "${voice?.name || 'neutral'}" (${voice?.tone || ''}), verbosity ${voice?.verbosity_level ?? 3}/5, opener frequency ${voice?.opener_frequency ?? 0.2}, metric preference "${voice?.metric_preference || 'medium'}".
        - Rhythm pattern "${rhythm?.pattern_name || 'classic'}": follow this bullet-length sequence in order — ${(rhythm?.sequence || []).join(' → ') || 'short, long, short, medium, long, personality'}.
        - APPROVED VERB POOL (use these for bullet starts; never repeat one across the document): ${verbList}.
        - ABSOLUTELY FORBIDDEN PHRASES (zero tolerance): ${forbidden}.
        `;
    }

    let mainPromptInstruction: string;
    let githubInstruction = '';

    // ─── Phase A anchor block ─────────────────────────────────────────────────
    // Pure-JS layer that gives Groq three things up-front:
    //   1. Locked real numbers / orgs / degrees (so it can never invent KES 8M
    //      when the profile says KES 800K, or swap "Biosystems Engineering"
    //      for "Agricultural Engineering").
    //   2. Field-aware good bullet examples (placeholder numbers — Groq cannot
    //      copy data out of them).
    //   3. Bad examples drawn from real production bugs we have seen.
    // Built once here, injected into both the job and general prompts below.
    const _detectedField = detectField(jd, profile);
    const _lockedValues = lockRealNumbers(profile);
    const promptAnchorBlock = buildPromptAnchorBlock({
        locked: _lockedValues,
        field: _detectedField,
    });

    // Scenario classification — runs for ALL purposes (job, general, academic).
    // Detects the candidate's profile type so every mode generates the right CV structure.
    const scenario = detectScenario(profile.workExperience || [], profile.projects || []);
    const scenarioBlock = buildScenarioBlock(scenario, generationMode);
    if (scenario !== 'standard') {
        console.log(`[CV Gen] Scenario ${scenario} detected (purpose: ${purpose}) — applying targeted scenario rules.`);
    }

    // Career-pivot detection — orthogonal to A/B/C/D. Triggers when the candidate's
    // background and the JD belong to clearly different fields (e.g. agricultural
    // engineer applying to a software role). Adds a bridge-formula instruction block.
    const pivot = detectDomainPivot(profile, jd, undefined);
    const pivotBlock = buildPivotBlock(pivot);
    if (pivot) {
        console.log(`[CV Gen] Career pivot detected: ${pivot.from.join('/')} → ${pivot.to.join('/')} — applying bridge-formula rules.`);
    }

    if (profile.personalInfo.github) {
        githubInstruction = `IMPORTANT: The user has provided a GitHub profile: ${profile.personalInfo.github}. Leverage this to validate and enrich the technical depth of the skills and projects sections.`;
    }

    const sectionOrderInstruction = buildSectionOrderInstruction(profile);
    const profileJdMatch = jdProfileSimilarity(profile, jd);
    const staleProfileInstruction = buildStaleProfileRefreshInstruction(profile, marketResearch);
    const preservationInstruction = profileJdMatch >= 0.58
        ? `
        **HIGH PROFILE↔JD MATCH DETECTED (${Math.round(profileJdMatch * 100)}%) — PRESERVATION MODE**:
        - Keep the candidate's existing career story, role ordering, and core responsibilities largely intact.
        - Prioritise light optimisation: stronger verbs, cleaner phrasing, better metrics framing, ATS keyword placement.
        - DO NOT rewrite every bullet from scratch when the original already demonstrates the same requirement.
        - Prefer synonym/precision upgrades over structural overhauls.
        `
        : profileJdMatch >= 0.4
            ? `
        **MEDIUM PROFILE↔JD MATCH (${Math.round(profileJdMatch * 100)}%) — BALANCED MODE**:
        - Keep proven relevant bullets and only transform low-signal bullets.
        - Preserve domain-equivalent backgrounds (e.g., Biosystems Engineering ↔ Agricultural Engineering) when responsibilities clearly overlap.
        - Focus edits on terminology alignment, evidence strength, and ATS clarity.
        `
            : '';

    const humanizationInstruction = `
    **CRITICAL — AUTHENTIC HUMAN WRITING (AI DETECTION IMMUNITY)**:
    Write as if a confident, accomplished senior professional personally crafted every word in a focused 2-hour session. AI detectors (GPTZero, Originality.ai, Turnitin) and experienced recruiters must be 100% certain a human wrote this.

    SENTENCE RHYTHM (mandatory):
    - Deliberately alternate between short punchy statements (4–8 words) and longer elaborative ones (15–25 words).
    - Three sentences of similar length in a row = failure. Break the pattern.
    - Start at least 2 sentences per section with a number or a past-tense verb for natural variation.

    BANNED PHRASES (zero tolerance — replace with specific facts):
    "delve", "robust", "seamlessly", "synergy", "leverage" (max once in whole document), "cutting-edge", "state-of-the-art", "passionate about", "in today's fast-paced world", "it is worth noting", "navigate the landscape", "groundbreaking", "thought leader", "game-changer", "dynamic", "innovative" (show it, don't say it), "results-driven", "detail-oriented", "team player", "go-getter", "proactive", "best-in-class", "holistic", "moving the needle", "at the end of the day", "take it to the next level", "excited to", "transformative", "impactful" (prove impact with numbers instead).

    SPECIFICITY (mandatory replacements):
    - "improved efficiency" → "cut processing time from X hours to Y minutes"
    - "led a team" → "managed a [N]-person [type] team"
    - "increased revenue" → "grew ARR from $X to $Y"
    - "streamlined processes" → "eliminated [N] manual steps, saving [X] hours/week"

    VERB RULES:
    - Every bullet in the CV uses a DIFFERENT strong action verb. Recommended verbs:
      Spearheaded, Engineered, Orchestrated, Accelerated, Restructured, Championed, Negotiated, Overhauled, Forged, Propelled, Slashed, Tripled, Automated, Mentored, Secured, Delivered, Architected, Revamped, Brokered, Consolidated, Deployed, Eliminated, Galvanized, Halved, Implemented, Launched, Migrated, Overhauled, Pioneered, Quantified, Recruited, Scaled, Transformed, Unified, Validated, Won.
    - Never start two bullets across the entire document with the same verb.
    - The first word of each bullet in a job's list must start with a different letter.

    FILLER ELIMINATION:
    - Remove: "in order to", "as well as", "a variety of", "various", "etc", "numerous", "many", "several".
    - Add metrics only when they can be honestly inferred from what the user provided. Never force a number that has no basis in the user's own context — a vivid, specific descriptive bullet is always better than a fabricated metric.

    ${HUMANIZATION_RULES}

    ${HUMANIZATION_CHECKLIST}
    `;

    // Build experience instruction — the user's per-role bullet count is BINDING.
    // This block overrides any general bullet-count guidance elsewhere in the prompt.
    const experienceInstructionLines = profile.workExperience.map(exp => {
        const count = exp.pointCount ?? 5;
        const startYear = exp.startDate ? new Date(exp.startDate).getFullYear() : null;
        const endYear = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
        const years = startYear ? Math.max(1, endYear - startYear) : null;
        const tenureNote = years ? ` (${years} year${years !== 1 ? 's' : ''} tenure)` : '';
        return `  • ${exp.jobTitle} @ ${exp.company}${tenureNote} → EXACTLY ${count} bullet point${count === 1 ? '' : 's'} (no more, no fewer)`;
    }).join('\n');
    const experienceInstruction = `
=== EXACT BULLET COUNT PER ROLE (USER-CHOSEN — BINDING, OVERRIDES EVERYTHING ELSE) ===
The user has explicitly set the number of bullets per role below. This count is non-negotiable.
- If you generate FEWER bullets than specified, the output will be rejected.
- If you generate MORE bullets than specified, the output will be rejected.
- The scope-anchor bullet counts as bullet #1 (it is included in the total, not added on top).
- Apply this rule to every role listed below, in every generation mode (general, job, academic, regenerate, optimize, improve).

${experienceInstructionLines}
=== END EXACT BULLET COUNT BLOCK ===
`;

    if (purpose === 'general') {
        mainPromptInstruction = `
            You are a world-class CV writer. Create a powerful, general-purpose CV that presents the candidate at their absolute best across diverse job markets and industries.

            ${scenarioBlock}
            ${pivotBlock}

            USER PROFILE:
            ${compactProfile(profile)}
            ${githubInstruction}

            ${promptAnchorBlock}

            === CV GENERATION RULES — Follow every rule, no exceptions ===

            ① SUMMARY — Versatile Value Proposition (3–4 sentences, 60–80 words):
               - Sentence 1 (WHO + SENIORITY): Job title + years of experience + primary domain. Specific, not generic. Start with the title or number, never "I" or "A".
               - Sentence 2 (PROOF): Single most impressive, quantified achievement. Must contain a real number or a specific named outcome.
               - Sentence 3 (RANGE): Breadth across functions, industries, or skills that makes them valuable across contexts.
               - Sentence 4 (PROMISE, optional): The type of value they consistently deliver — one concrete fact, never a cliché.
               - BANNED IN SUMMARY: "passionate about", "detail-oriented", "results-driven", "dynamic", "innovative", "go-getter", "team player", "seeking an opportunity".

            ② EXPERIENCE — Showcase Full Breadth and Growth:
               - FIRST BULLET of every role = SCOPE ANCHOR (team size, geographic reach, client count, budget, project count). Not an achievement.
               - Every subsequent bullet: [Strong Verb] + [Specific Action/Context] + [Measurable Outcome].
               - NEVER start bullets with: "Responsible for", "Helped", "Worked on", "Assisted", "Participated in", "Tasked with", "Contributed to".
               - Career arc must be visible: scope and responsibility must grow role-to-role.
               - Verb tense: current role = present tense ("Manages", "Leads"). Past roles = past tense ("Managed", "Led").
               - No two bullets across the entire document may start with the same verb.
               - Bullet counts per role:
               ${experienceInstruction}

            ③ SKILLS — EXACTLY 15 skills:
               Position 1–5: Core domain/technical expertise.
               Position 6–10: Tools, platforms, and methodologies.
               Position 11–13: Transferable skills phrased as demonstrated competencies, not hollow labels.
               Position 14–15: Industry or function-specific terminology that adds ATS value.
               Every skill at positions 1–5 must appear in at least one experience bullet — never list a skill with no evidence.

            ④ PROJECTS — Only include if the profile has real projects. Omit the section entirely if none exist:
               - [Problem or Goal] → [Tools/Approach] → [Measurable Outcome + Scale].
               - Each project description must name at least one specific technology, tool, or methodology.

            ⑤ SECTION OMISSION RULES:
               - Do NOT generate an empty section. An absent section is professional; an empty one is not.
               - If the profile has no work experience → omit the experience section.
               - If the profile has no projects → omit the projects section.

            ⑥ BULLET QUALITY RULES:
               - Every bullet: 15–25 words. Under 12 words = failure. Expand with scope and outcome.
               - Max 55% of bullets per role may contain a number. With 5 bullets, at most 3 may have metrics.
               - Only add a metric when you can honestly infer it from what the user wrote. Never force a number.

            ${engineInstruction}
            ${humanizationInstruction}
            ${preservationInstruction}
            ${staleProfileInstruction}

            ${CV_DATA_SCHEMA}
        `;
    } else if (purpose === 'academic') {
        const scholarshipFormatInstruction = buildScholarshipFormatInstruction(scholarshipFormat);
        mainPromptInstruction = `
            You are the world's leading academic CV specialist and grant-writing consultant. Create an outstanding academic CV that maximizes the candidate's chances for this specific scholarship, grant, or academic opportunity.

            USER PROFILE:
            ${compactProfile(profile)}
            ${githubInstruction}

            GRANT/SCHOLARSHIP/ACADEMIC PURPOSE:
            ${jd || 'General academic application'}

            ${scholarshipFormatInstruction}
            ${keywordInstruction}

            === ACADEMIC CV STRATEGY ===

            ① RESEARCH/ACADEMIC SUMMARY — "Scholar's Pitch" (3–4 sentences, 70–90 words):
               - Sentence 1 (IDENTITY): Research identity + discipline + career stage (e.g., "Doctoral researcher in computational epidemiology with 6 years of quantitative fieldwork across sub-Saharan Africa").
               - Sentence 2 (CONTRIBUTION): Their most significant scholarly contribution — name the publication, grant won, dataset created, or methodology developed. Include a number (citation count, sample size, grant value, etc.).
               - Sentence 3 (METHODOLOGY): Primary research methods/tools that make them uniquely qualified for this opportunity.
               - Sentence 4 (VISION): Future research trajectory and how this opportunity directly enables it. Be specific about what they will achieve, not just what they want to study.
               - RULE: Must not use "passionate about research" or generic academic filler. Every sentence must be checkable.

            ② EXPERIENCE — Scholarly Impact Focus:
               - Every bullet: [Research Verb] + [Methodology/Scope] + [Academic Output or Impact].
               - Strong academic verbs: Investigated, Designed, Analyzed, Published, Presented, Supervised, Secured, Collaborated, Validated, Implemented, Modeled, Synthesized, Contributed, Developed, Evaluated.
               - For publications: include journal name, year, and if possible impact factor or citation count.
               - For grants: include grant body, value in USD/GBP/EUR, and duration.
               - For supervision: include number of students supervised and their outcomes (graduated, papers published).
               - Bullet counts per role:
               ${experienceInstruction}

            ③ SKILLS (15 total — academy-ordered):
               - Position 1–5: Research methods/methodologies (quantitative, qualitative, mixed-methods, specific software: R, Python/pandas, SPSS, NVivo, STATA, MATLAB, etc.).
               - Position 6–10: Domain-specific expertise and theoretical frameworks.
               - Position 11–15: Academic tools, platforms, languages (LaTeX, Mendeley, academic databases, languages spoken).

            ④ EDUCATION — Highlight Academic Distinction:
               - ALWAYS include: GPA if ≥3.5/4.0 or First Class/Distinction equivalent.
               - Thesis title (in full) + 1-sentence description of original contribution.
               - Most relevant honors, scholarships previously won, or fellowships held.
               - 2–3 key relevant courses only if they are directly relevant to the application.
               - GRADUATION-STATUS RULE (binding): If the degree's graduation year is in the past or the current year, treat the degree as COMPLETED. Never write "currently pursuing", "presently pursuing", "currently studying", or equivalents for that entry. Only use "currently pursuing"/"expected [year]" when the graduation year is explicitly in the future, or the year field reads "Expected", "Present", "In Progress", "Ongoing", or is blank.

            ⑤ PROJECTS — Frame as Research Outputs:
               - Each project = a mini research paper abstract: Research Question → Methodology → Findings/Output.
               - Include collaborating institutions if applicable (adds credibility).
               - Link to published papers, repositories, or datasets where available.

            ${engineInstruction}
            ${humanizationInstruction}
            ${preservationInstruction}
            ${staleProfileInstruction}

            ${CV_DATA_SCHEMA}
        `;
    } else {
        // JOB purpose — run the full pre-generation pipeline (Blocks A, B, C, D)
        const currency = detectCurrency(jd, profile.personalInfo?.location || '');
        const seniority = detectSeniority(profile.workExperience || []);
        const market = detectMarket(currency);

        // Block D — company context from market research or JD signals
        let blockD = '';
        if (marketResearch) {
            blockD = buildMarketIntelligencePrompt(marketResearch);
        } else if (jd) {
            blockD = `Extracted from JD: ${jd.substring(0, 600)}`;
        }

        // Gap detection — pass employment gaps to the mode prompt for intelligent handling
        const gaps = detectGaps(profile.workExperience || []);
        if (gaps.length > 0) {
            console.log(`[CV Gen] Detected ${gaps.length} employment gap(s):`, gaps.map(g => `${g.gapMonths}mo between "${g.fromRole}" and "${g.toRole}"`));
        }

        const modeBlock = buildModePromptBlock(generationMode, currency, seniority, market, blockD, gaps);

        mainPromptInstruction = `
            You are the world's greatest CV strategist operating under strict market-calibrated rules.
            Your sole mission: generate the single highest-performing CV for this specific candidate targeting this specific role.

            ${modeBlock}

            ${scenarioBlock}
            ${pivotBlock}

            USER PROFILE:
            ${compactProfile(profile)}
            ${githubInstruction}

            JOB DESCRIPTION / TARGET CONTEXT:
            ${jd}

            ${keywordInstruction}

            ${promptAnchorBlock}

            === CV GENERATION STRATEGY — Follow in order ===

            ① PROFESSIONAL SUMMARY — The "3P Formula" (55–75 words, 3–4 sentences):
               ATS NOTE: The summary is parsed FIRST by every ATS system — it carries the highest keyword weight of any section. The 3 most critical JD keywords MUST appear verbatim in this section.
               HOOK (Sentence 1): [Years of experience as a number] + [EXACT job title from JD] + [primary domain/industry]. Never start with "I" or "A". Start with the number or the role title.
                 Example: "Water Resources Engineer with 6 years delivering rural infrastructure projects across East Africa."
               PROOF (Sentence 2): Their single strongest, most-quantified achievement that DIRECTLY addresses what the JD needs. Must contain a number within the market metric ceilings stated above. Use XYZ formula: "Accomplished [X] as measured by [Y] by doing [Z]."
               PROMISE (Sentence 3): Why hiring them solves the employer's specific problem — connect their skills to the JD's explicit requirements. Name the company's context from Block D if available.
               BANNED IN SUMMARY: "passionate", "dynamic", "results-driven", "detail-oriented", "innovative", "seasoned professional", "proactive", "go-getter", "versatile".

            ② EXPERIENCE — Every bullet is proof of fit:
               BULLET FORMULA — choose per bullet:
                 WITH metrics → XYZ: "Grew [X] by [Y metric] by doing [Z]" — result first, method second.
                 WITHOUT metrics → CAR: "[Context/Challenge] — [Action taken] — [Change produced]."
                 NEVER start with "Responsible for", "Helped", "Assisted", "Worked on", "Was part of", "Participated in", "Tasked with".

               FIRST BULLET = SCOPE ANCHOR (mandatory for every role):
                 The very first bullet of EVERY role must establish the scope of that role — not an achievement.
                 Include one or more: team size, number of direct reports, geographic coverage, client portfolio size, budget managed, or project count.
                 Example: "Managed a portfolio of 14 enterprise client accounts across Nairobi and Central Kenya, coordinating with a 5-person field operations team."
                 This orients the recruiter before they read any achievement bullets below it.

               BULLET COUNT PER ROLE — USER-CHOSEN (binding, non-negotiable):
                 The user has explicitly set the number of bullets for each role (see "EXACT BULLET COUNT PER ROLE" block below).
                 Generate EXACTLY that number for each role — never more, never fewer, even if you think a role deserves more space.
                 The scope-anchor bullet IS included in that count (it counts as bullet #1 of the role).

               VERB TENSE (critical for ATS employment status detection):
                 Current role (endDate = "Present" or blank): ALL bullets in PRESENT TENSE — "Manages", "Leads", "Coordinates".
                 All previous roles: ALL bullets in PAST TENSE — "Managed", "Led", "Coordinated".
                 Mixing tenses within a single role breaks ATS parsing.

               JD MIRRORING: Mirror the JD's exact phrases in at least 3 bullets per role. Use the same acronyms and terminology the JD uses. Never paraphrase a keyword.
               VERB VARIETY: No two bullets across the entire document may start with the same verb.
               CAREER ARC: Scope, team size, and metric scale must visibly grow across roles — the current role must show the largest scope.
               GOLDEN RULES (apply always):
               - Company names provided by the user are SACRED — never change, invent, abbreviate, or replace them.
               - Dates are locked — never change any employment date.
               - Career must progress forward — never create a backwards timeline.
               - One currency only — the one detected in Block A.
               ${experienceInstruction}

            ③ SKILLS (EXACTLY 15 — ordered by JD priority for ATS):
               Position 1–5: EXACT tools/technologies named in the JD (verbatim — ATS keyword match).
               Position 6–10: Core technical/domain skills for the role, closest JD-adjacent skills first.
               Position 11–13: Soft/transferable skills phrased as demonstrated competencies, not hollow labels.
               Position 14–15: Industry/domain ATS keywords from the JD that did not fit elsewhere.
               NOTE: Every skill at positions 1–5 must also appear at least once in the experience bullets — skills mentioned nowhere else in the CV score very low on ATS.

            ④ EDUCATION:
               'description': 1 concise sentence — GPA if ≥3.5 (or equivalent distinction), thesis title if relevant, honors or distinction, or 2–3 directly relevant courses.
               Highlight scholarships or awards if present — they signal high achievement to recruiters.
               GRADUATION-STATUS RULE (binding): If the degree's graduation year is in the past or the current year, the degree IS COMPLETED. Never write "currently pursuing", "presently pursuing", "currently studying", or any equivalent phrase for that entry. Only use "currently pursuing"/"expected [year]" when the graduation year is explicitly in the future, or the year field reads "Expected", "Present", "In Progress", "Ongoing", or is blank.

            ⑤ PROJECTS — Proof-of-Skill Snapshots:
               FORMAT: [Problem/Goal] → [Solution with named technologies or methods] → [Measurable outcome].
               Prioritize projects that demonstrate skills the JD specifically requires.
               Each project description must name at least one specific technology, tool, framework, or methodology.

            ${engineInstruction}
            ${humanizationInstruction}
            ${preservationInstruction}
            ${staleProfileInstruction}

            ${CV_DATA_SCHEMA}
        `;

    }

    // Prepend section order + custom section notes (if any) to the prompt
    if (sectionOrderInstruction) {
        mainPromptInstruction = `${sectionOrderInstruction}\n\n${mainPromptInstruction}`;
    }

    // Prepend live market intelligence for non-job modes only
    // (job mode already injects market research into Block D of the mode prompt)
    if (marketResearch && purpose !== 'job') {
        const marketBlock = buildMarketIntelligencePrompt(marketResearch);
        mainPromptInstruction = `${marketBlock}\n\n${mainPromptInstruction}`;
    }

    // Language instruction — append if a non-English language is requested
    if (targetLanguage && targetLanguage !== 'English') {
        mainPromptInstruction += `

**LANGUAGE REQUIREMENT (MANDATORY)**:
Write ALL content in ${targetLanguage}. This includes: the professional summary, all experience bullet points, skills list items, education descriptions, and project descriptions.
EXCEPTIONS — keep in original language:
- Proper nouns: company names, university names, product names, tool/technology names, programming language names (e.g. "Python", "React", "Google", "Stanford").
- Dates and numbers.
- The applicant's personal information (name, email, location).
- Any direct quotes or certifications.
Output must be fluent, professional-grade ${targetLanguage} — not a literal translation. Adapt idioms and phrasing to be natural for native ${targetLanguage} speakers in a professional context.
`;
    }

    const temperature = purpose === 'academic' ? 0.5 :
        generationMode === 'honest' ? 0.5 :
            generationMode === 'boosted' ? 0.65 : 0.75;

    // Strip any markdown code fences the model may have wrapped the JSON in
    const stripFencesMain = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // Try Groq first (fastest, highest quality). On 413 (prompt too large) or
    // 429 (rate limit) fall back to Cloudflare Workers AI which has a much
    // larger context window and a free tier — saves the user from hitting Groq
    // hard limits when the prompt includes a long JD + market intelligence.
    let rawText: string;
    try {
        rawText = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, mainPromptInstruction, { temperature, json: true, maxTokens: 6000 });
    } catch (groqErr: any) {
        const status = groqErr?.status;
        const msg = (groqErr?.message || '').toLowerCase();
        const isTooLarge = status === 413 || msg.includes('too large') || msg.includes('too long');
        const isRateLimited = status === 429 || msg.includes('rate') || msg.includes('quota') || msg.includes('limit');
        if (isTooLarge || isRateLimited) {
            console.warn(`[CV Gen] Groq ${status ?? '?'} — falling back to Cloudflare Workers AI for main generation.`);
            const cf = await workerLLM(SYSTEM_INSTRUCTION_PROFESSIONAL, mainPromptInstruction, {
                temperature,
                json: true,
                maxTokens: 6000,
                timeoutMs: 90000,
            });
            if (!cf) {
                console.error('[CV Gen] Cloudflare Workers AI also unavailable — re-throwing original Groq error.');
                throw groqErr;
            }
            rawText = cf;
            console.info('[CV Gen] Main generation completed via Cloudflare Workers AI.');
        } else {
            throw groqErr;
        }
    }

    const cleanText = stripFencesMain(rawText);
    let cvData: CVData = JSON.parse(cleanText);

    // ── PART 6 — Groq Validator: runs for job AND general CVs ──────────────────
    // For job mode: uses JD + location for currency/market detection.
    // For general mode: uses profile location only (no JD available).
    // Academic mode is excluded — different quality criteria apply.
    if (purpose === 'job' || purpose === 'general') {
        try {
            // For general mode there is no JD — detect currency from profile location only
            const valCurrency = detectCurrency(
                purpose === 'job' ? jd : '',
                profile.personalInfo?.location || ''
            );
            const valSeniority = detectSeniority(profile.workExperience || []);
            const valMarket = detectMarket(valCurrency);
            const rawExperience = JSON.stringify((profile.workExperience || []).map(e => ({
                company: e.company,
                jobTitle: e.jobTitle,
                startDate: e.startDate,
                endDate: e.endDate,
            })));
            const hasSourceProjects = Array.isArray(profile.projects) && profile.projects.length > 0;
            // Snapshot pre-validator CV so we can revert any field that the
            // validator (especially the small CF Workers AI fallback) corrupts
            // while trying to "reduce" overshoot metrics — e.g. "KES 8,000,000"
            // → "KES ,000".
            const preValidatorCV: CVData = JSON.parse(JSON.stringify(cvData));
            cvData = await runGroqValidator(
                cvData, rawExperience, valCurrency, valSeniority, valMarket,
                scenario, hasSourceProjects
            );
            const validatorRevert = revertCorruptedMetrics(cvData, preValidatorCV);
            if (validatorRevert.reverted.length > 0) {
                console.warn(`[CV Validator] Reverted ${validatorRevert.reverted.length} corrupted-metric field(s):`, validatorRevert.reverted);
                cvData = validatorRevert.cv;
            }
        } catch (validatorError) {
            console.error('[CV Validator] Skipped due to error:', validatorError);
        }
    }

    // ── PART 7 — Shared Quality Polish ────────────────────────────────────────
    // Single call into the unified polish helper so Generate, Auto Optimize,
    // and JD Optimize all share the exact same chain. The helper runs:
    //   humanizer → bullet-count (profile.pointCount) → banned-phrase →
    //   carry profile.customSections + sectionOrder → sort →
    //   purify (with telemetry hook) → voice enforcement (engine brief) →
    //   finalize (source-fidelity vs profile) → pronoun fix.
    // Telemetry + worker leak-queue feed run inside the onPurifyReport hook.
    if (purpose === 'job' || purpose === 'general') {
        cvData = await runQualityPolishPasses(cvData, {
            runHumanizer: true,
            bulletCount: { type: 'profile-pointcount', profile },
            carryProfile: profile,
            engineBrief,
            finalize: { profile },
            onPurifyReport: (report) => {
                // ── TELEMETRY — fire-and-forget. ──
                try {
                    const wordCount = JSON.stringify(cvData).split(/\s+/).length;
                    const briefStatus: 'present' | 'missing_empty' | 'missing_error' =
                        engineBrief
                            ? 'present'
                            : briefRes.status === 'rejected'
                                ? 'missing_error'
                                : 'missing_empty';
                    logGeneration({
                        cvHash: quickHash(JSON.stringify({
                            sum: cvData.summary,
                            exp: (cvData.experience || []).map(e => e.jobTitle + e.company).join('|'),
                        })),
                        model: 'groq+gemini',
                        promptVersion: 'v2.1',
                        generationMode,
                        briefPresent: Boolean(engineBrief),
                        briefStatus,
                        outputWordCount: wordCount,
                        roundNumberRatio:    report.roundNumberRatio,
                        repeatedPhraseCount: report.repeatedPhrases.length,
                        tenseIssueCount:     report.tenseIssues.length,
                        bulletsTenseFlipped: report.bulletsTenseFlipped,
                        metricsJittered:     report.metricsJittered,
                        substitutionsMade:
                            report.substitutionsMade +
                            report.polishFixes +
                            report.skillsCanonicalised +
                            report.skillsDeduped,
                        leaks:               report.leaks,
                    });
                } catch (e) {
                    console.debug('[CV Gen] telemetry post failed (non-fatal):', e);
                }

                // ── Phase I: feed the worker's leak queue (fire-and-forget). ──
                try {
                    const leakPhrases = Array.from(new Set(
                        (report.leaks || [])
                            .map(l => String(l.phrase || '').toLowerCase().trim())
                            .filter(p => p.length >= 3 && p.length <= 80)
                    ));
                    if (leakPhrases.length) {
                        const sample = (report.leaks?.[0]?.contextSnippet || '').slice(0, 500);
                        void reportLeaks(leakPhrases, sample).catch(() => {/* swallow */});
                    }
                } catch (e) {
                    console.debug('[CV Gen] leak-report post failed (non-fatal):', e);
                }
            },
        });
    } else {
        // Non-job/general purposes (e.g. academic) — skip humanizer + voice
        // enforcement (those tune for professional-CV voice) but still run
        // the deterministic passes via the helper for consistency.
        cvData = await runQualityPolishPasses(cvData, {
            runHumanizer: false,
            bulletCount: { type: 'profile-pointcount', profile },
            carryProfile: profile,
            engineBrief: null,
            finalize: { profile },
        });
    }

    // ── Store result in cache ──
    cvCacheSet(cacheKey, cvData);

    return cvData;
};

// ─────────────────────────────────────────────────────────────────────────────
// Voice consistency enforcement — validates generated bullets against the
// brief and rewrites failing ones via a single targeted Groq call per role.
// ─────────────────────────────────────────────────────────────────────────────

// Verbs that are technically valid English but read as obviously off-key on a
// professional CV. The CV-engine seed contains them (Critiques→Critiqued,
// Bylines→Bylined, Synthesises→Synthesised, Mobilises→Mobilised, …). When the
// voice-rewriter receives them in the verb pool, it sometimes builds bullets
// like "Critiqued rigorous testing protocols" or "Bylined technical reports".
// Filter them out client-side so the rewriter can only choose tasteful options.
const OBSCURE_CV_VERBS = new Set([
    'critiqued', 'critique', 'critiques',
    'bylined', 'byline', 'bylines',
    'synthesised', 'synthesized', 'synthesises', 'synthesizes',
    'mobilised', 'mobilized', 'mobilises', 'mobilizes',
    're-emphasised', 're-emphasized', 're-emphasises', 're-emphasizes',
    'reemphasised', 'reemphasized',
    'enlisted', 'enlist', 'enlists',
    'galvanised', 'galvanized', 'galvanises', 'galvanizes',
    'rallied', 'rally', 'rallies',
    'op-edded', 'opedded',
    'ghost-wrote', 'ghostwrote',
    'box-plotted', 'boxplotted',
    'histogrammed',
    'wireframed', 'mocked',
    'composed', 'compose', 'composes',
    're-articulated', 'rearticulated', 're-articulates', 'rearticulates',
    'debriefed', 'debrief', 'debriefs',
    'taught',
]);

function filterTastefulVerbs(verbs: string[]): string[] {
    return verbs.filter(v => v && !OBSCURE_CV_VERBS.has(v.trim().toLowerCase()));
}

async function enforceVoiceConsistency(cvData: CVData, brief: CVBrief): Promise<void> {
    const roles = cvData.experience || [];
    // Take a wider slice (40) before filtering so we still have ≥24 verbs
    // even when several obscure ones get stripped.
    const rawVerbs = brief.verb_pool.slice(0, 40).map(v => v.verb_past || v.verb);
    const tastefulVerbs = filterTastefulVerbs(rawVerbs).slice(0, 24);
    const verbList = tastefulVerbs.join(', ');
    const droppedVerbs = rawVerbs.filter(v => !tastefulVerbs.includes(v));
    if (droppedVerbs.length > 0) {
        console.log(`[CV Engine] Voice enforcement: filtered ${droppedVerbs.length} obscure verb(s) from pool:`, droppedVerbs);
    }
    const forbidden = brief.forbidden_phrases.slice(0, 30).join(', ');
    const avoidedVerbs = (brief.field?.avoided_verbs || []).join(', ') || 'none';
    const voice = brief.voice.primary;
    const rhythm = brief.rhythm;

    // ── Phase B speed: per-role validate+fix is now PARALLEL ──
    // Each role mutates a different `role.responsibilities` array, so there's
    // no shared state to race. Going from sequential to Promise.all turns
    // 3 roles × ~30 s each → ~30 s total instead of ~90 s.
    const processRole = async (role: typeof roles[number]): Promise<{ fixed: number; ran: boolean }> => {
        const bullets = role.responsibilities || [];
        if (bullets.length < 2) return { fixed: 0, ran: false };

        const result: ValidateVoiceResult | null = await validateVoice(bullets, brief);

        // ── Local repeated-word check (architecture doc Fix 5) ──
        const overused = findOverusedWords(bullets, 5);
        const overusedByBullet: Record<number, string[]> = {};
        for (const w of overused) {
            for (const idx of (w.bulletIndices || [])) {
                (overusedByBullet[idx] = overusedByBullet[idx] || []).push(
                    `replace overused word "${w.word}" (used ${w.count}× in this role) with a synonym or restructure the sentence to drop it`
                );
            }
        }
        const overusedFailing = Object.keys(overusedByBullet).map(n => Number(n));

        if ((!result || result.passed) && overusedFailing.length === 0) return { fixed: 0, ran: false };

        const remoteFailing = result?.failing_bullets || [];
        const failing = Array.from(new Set([...remoteFailing, ...overusedFailing])).sort((a, b) => a - b);
        if (failing.length === 0) return { fixed: 0, ran: false };

        const issuesByBullet: Record<number, string[]> = {};
        for (const issue of (result?.issues || [])) {
            if (issue.bullet === undefined) continue;
            const key = issue.bullet as number;
            const note =
                issue.issue === 'forbidden_phrase' ? `remove forbidden phrase "${(issue as any).phrase}"` :
                issue.issue === 'avoided_verb_for_field' ? `verb "${(issue as any).verb}" is wrong for this field — replace it` :
                issue.issue === 'verb_outside_pool' ? `verb "${(issue as any).verb}" is not in the approved pool — pick from the pool` :
                issue.issue === 'repeated_verb' ? `verb "${(issue as any).verb}" is repeated — pick a different approved verb` :
                issue.issue === 'rhythm_drift' ? `rewrite to ${(issue as any).expected} length (was ${(issue as any).actual})` :
                issue.issue;
            (issuesByBullet[key] = issuesByBullet[key] || []).push(note);
        }
        for (const [idxStr, notes] of Object.entries(overusedByBullet)) {
            const idx = Number(idxStr);
            (issuesByBullet[idx] = issuesByBullet[idx] || []).push(...notes);
        }

        const fixList = failing.map(i => `  ${i + 1}. ORIGINAL: "${bullets[i]}"\n     FIX: ${(issuesByBullet[i] || ['general voice mismatch']).join('; ')}`).join('\n');

        const fixPrompt = `You are rewriting CV bullet points to match a strict voice brief. Return ONLY a JSON object: {"fixes": [{"index": <number>, "bullet": "<rewritten>"}]}.

ROLE: ${role.jobTitle} @ ${role.company}

VOICE BRIEF:
- Voice: ${voice?.name || 'neutral'} (${voice?.tone || ''}), verbosity ${voice?.verbosity_level ?? 3}/5, metric preference ${voice?.metric_preference || 'medium'}.
- Rhythm: ${(rhythm?.sequence || []).join(' → ')}.
- APPROVED VERB POOL (must start each fixed bullet with one of these, never repeating across the role): ${verbList}.
- FIELD-AVOIDED VERBS (never use): ${avoidedVerbs}.
- FORBIDDEN PHRASES (zero tolerance): ${forbidden}.

ALL BULLETS IN THIS ROLE (for context, do not duplicate other verbs):
${bullets.map((b, i) => `  ${i + 1}. ${b}`).join('\n')}

REWRITE THESE BULLETS (return them in the fixes array, indexed from 1):
${fixList}

Rules: keep the original meaning and any real metrics, fix the listed issues, do not add fabricated data, match the voice & rhythm targets, return only the listed indices.`;

        try {
            const voiceFixSystem = 'You are a precise CV editor that returns only valid JSON.';
            const stripFencesVoice = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            let raw: string | null = null;
            try {
                raw = await workerTieredLLM('voiceConsistency', fixPrompt, {
                    system: voiceFixSystem,
                    temperature: 0.4,
                    json: true,
                    maxTokens: 1200,
                    timeoutMs: 30000,
                });
                if (raw) console.log(`[CV Engine] Voice fix via Workers AI (free tier) — ${role.jobTitle}.`);
            } catch (cfErr) {
                console.warn('[CV Engine] Workers AI voice fix failed, falling back to Groq:', cfErr);
            }
            if (!raw) raw = await groqChat(GROQ_FAST, voiceFixSystem, fixPrompt, { temperature: 0.4, json: true, maxTokens: 1200 });
            const parsed = JSON.parse(stripFencesVoice(raw ?? '{}'));
            const fixes: Array<{ index: number; bullet: string }> = Array.isArray(parsed?.fixes) ? parsed.fixes : [];
            let fixed = 0;
            for (const f of fixes) {
                const idx = (f.index ?? 0) - 1;
                if (idx >= 0 && idx < bullets.length && typeof f.bullet === 'string' && f.bullet.trim()) {
                    bullets[idx] = f.bullet.trim();
                    fixed++;
                }
            }
            role.responsibilities = bullets;
            return { fixed, ran: true };
        } catch (e) {
            console.warn(`[CV Engine] Voice fix failed for role ${role.jobTitle}:`, e);
            return { fixed: 0, ran: false };
        }
    };

    const t0 = performance.now();
    const results = await Promise.all(roles.map(processRole));
    const totalFixed = results.reduce((s, r) => s + r.fixed, 0);
    const totalRoles = results.filter(r => r.ran).length;
    const elapsed = Math.round(performance.now() - t0);

    if (totalFixed > 0) {
        console.log(`[CV Engine] Voice enforcement: rewrote ${totalFixed} bullet(s) across ${totalRoles} role(s) in ${elapsed} ms (parallel).`);
    }
}

// --- Multimodal: Extract text from PDF/image using Gemini (vision required) ---
export const extractProfileTextFromFile = async (base64Data: string, mimeType: string): Promise<string> => {
    const prompt = "This file is a resume, CV, or professional profile. Extract ALL text content from it. Return only the raw, complete text, preserving original line breaks and structure as much as possible. DO NOT add any commentary, summaries, or markdown formatting.";

    // Worker-first for IMAGES (Llama 3.2 Vision). PDFs are not supported by the model
    // and skip straight to Gemini. Falls back to Gemini on any worker failure.
    if (/^image\//i.test(mimeType)) {
        try {
            const cf = await workerVisionExtract(base64Data, mimeType, prompt, { maxTokens: 4096 });
            if (cf && cf.trim().length > 50) {
                console.log('[CV Import] Image extract via Cloudflare Workers AI Vision.');
                return cf;
            }
        } catch (cfErr) {
            console.warn('[CV Import] Worker vision failed, falling back to Gemini:', cfErr);
        }
    }

    const ai = getGeminiClient();
    const filePart = { inlineData: { data: base64Data, mimeType } };

    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [filePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));
    return response.text || "";
};

/**
 * Gemini-only: reads a file (PDF/image) AND structures it into a UserProfile JSON
 * in a single multimodal call. Does not require Groq.
 */
export const generateProfileFromFileWithGemini = async (
    base64Data: string,
    mimeType: string,
    githubUrl?: string
): Promise<UserProfile> => {
    const ai = getGeminiClient();

    let githubInstruction = '';
    if (githubUrl) {
        githubInstruction = `
        **GitHub Deep Analysis (CRITICAL)**: The user has also provided a GitHub profile: ${githubUrl}. Analyse the public data available (repositories, languages, commit history) to enrich the profile.
        - Populate the 'projects' array with the top 5 most impressive public repositories.
        - Add ALL key programming languages, frameworks, and tools to the 'skills' list.
        - Infer missing personal details (name, location, summary) from GitHub if not visible in the file.
        `;
    }

    const prompt = `
        You are looking at a resume, CV, or professional profile document. Your job is to read it thoroughly and convert ALL information into the structured JSON schema below.

        ### INSTRUCTIONS
        1. Extract every piece of information visible in the document — work experience, education, skills, projects, personal info, languages.
        2. Standardize all dates to 'YYYY-MM-DD'. Use the first day of the month/year if only month/year is given. Current roles must have endDate = 'Present'.
        3. Generate a unique simple string 'id' for every array item.
        4. Keep responsibilities text as-is, using \\n for bullet separators.
        5. Do NOT invent data — only extract what is present.
        ${githubInstruction}
        6. Return ONLY the raw JSON object — no markdown, no code fences, no commentary.

        ${USER_PROFILE_SCHEMA}
    `;

    const filePart = { inlineData: { data: base64Data, mimeType } };

    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [filePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));

    const raw = (response.text || '').trim().replace(/^```(?:json)?|```$/gm, '').trim();
    const profileData: UserProfile = JSON.parse(raw);
    profileData.projects = profileData.projects || [];
    profileData.education = profileData.education || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages = profileData.languages || [];
    return profileData;
};

/**
 * Gemini-only: structures plain text into a UserProfile JSON.
 * Used as a fallback when Groq is unavailable or quota-exhausted.
 */
export const generateProfileFromTextWithGemini = async (
    rawText: string,
    githubUrl?: string
): Promise<UserProfile> => {
    const ai = getGeminiClient();

    let githubInstruction = '';
    if (githubUrl) {
        githubInstruction = `
        **GitHub Deep Analysis (CRITICAL)**: The user has provided a GitHub profile: ${githubUrl}. Analyse the public repositories, languages, and commit history to enrich the profile.
        - Populate 'projects' with the top 5 most impressive public repositories.
        - Add all key languages, frameworks, and tools to 'skills'.
        - Infer any missing personal details from the GitHub profile.
        `;
    }

    const prompt = `
        Your goal is to convert the following resume/career text into a structured JSON profile.

        ### SOURCE DATA
        RAW TEXT:
        ${rawText || 'No raw text provided. Rely entirely on GitHub analysis.'}

        ${githubInstruction}

        ### INSTRUCTIONS
        1. Standardize all dates to 'YYYY-MM-DD'. Current roles: endDate = 'Present'.
        2. Generate a unique simple string 'id' for every array item.
        3. Keep responsibilities text as-is, using \\n for bullet separators.
        4. Return ONLY the raw JSON object — no markdown, no code fences, no commentary.

        ${USER_PROFILE_SCHEMA}
    `;

    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER, temperature: 0.1 }
    }));

    const raw = (response.text || '').trim().replace(/^```(?:json)?|```$/gm, '').trim();
    const profileData: UserProfile = JSON.parse(raw);
    profileData.projects = profileData.projects || [];
    profileData.education = profileData.education || [];
    profileData.workExperience = profileData.workExperience || [];
    profileData.languages = profileData.languages || [];
    return profileData;
};

export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const prompt = "Analyze this image, which contains text (likely a job description). Extract ALL of the visible text. Return ONLY the raw text, with no additional commentary, summary, or formatting.";

    // Worker-first via Cloudflare Workers AI Llama 3.2 Vision. Falls back to Gemini.
    if (/^image\//i.test(mimeType)) {
        try {
            const cf = await workerVisionExtract(base64Image, mimeType, prompt, { maxTokens: 2048 });
            if (cf && cf.trim().length > 20) {
                console.log('[JD Import] Image text via Cloudflare Workers AI Vision.');
                return cf;
            }
        } catch (cfErr) {
            console.warn('[JD Import] Worker vision failed, falling back to Gemini:', cfErr);
        }
    }

    const ai = getGeminiClient();
    const imagePart = { inlineData: { data: base64Image, mimeType } };

    const response = await retryGemini<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: prompt }] },
        config: { systemInstruction: SYSTEM_INSTRUCTION_PARSER }
    }));
    return response.text || "";
};

export const generateCoverLetter = async (profileInput: UserProfile, jobDescription: string): Promise<string> => {
    const profile = purifyProfile(profileInput);
    const name = profile.personalInfo?.name || 'Applicant';
    const prompt = `
        You are a top-tier professional career coach and ghostwriter. Write a compelling, human-sounding cover letter.

        ### CONTEXT
        Applicant Name: ${name}
        Applicant Email: ${profile.personalInfo?.email || ''}
        Applicant Location: ${profile.personalInfo?.location || ''}

        USER PROFILE (for background and content):
        ${compactProfile(profile)}

        JOB DESCRIPTION:
        ${jobDescription || 'General application — highlight the strongest transferable skills.'}

        ### STRICT INSTRUCTIONS
        1. **DO NOT include any header block** (no name, address, date, or contact information at the top). The header is already shown separately by the template — start the letter DIRECTLY with the salutation.
        2. **Salutation**: Use "Dear Hiring Manager," (unless a recruiter name is visible in the JD).
        3. **Structure**:
           - **Opening paragraph**: State the specific position and express genuine, specific enthusiasm (not generic).
           - **Body (2 paragraphs)**: Each paragraph focuses on one specific relevant experience or achievement that directly addresses a core requirement from the JD. Use strong action verbs and include at least one concrete result (number, scope, or outcome).
           - **Closing paragraph**: Reiterate interest, express readiness to contribute, and include a clear call to action.
           - **Sign-off**: End with "Sincerely," followed by the applicant's name on the next line: ${name}
        4. **Tone**: Confident, professional, and specific — never generic or sycophantic.
        5. **Keywords**: Naturally weave in the most important keywords from the job description.
        6. **Human writing**: Vary sentence length. Avoid AI clichés (no "delve", "passionate about", "excited to leverage", "in today's world").
        7. **Output**: Return ONLY the plain text of the letter body (starting with "Dear Hiring Manager,"). NO markdown, NO headers, NO meta-commentary.
    `;

    // Try Cloudflare Workers AI first (free tier, saves Groq quota), fall back to Groq.
    let letter: string | null = null;
    try {
        const cf = await workerLLM(SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, maxTokens: 2000 });
        if (cf && cf.trim()) letter = cf;
    } catch (cfErr) {
        console.warn('[generateCoverLetter] Worker call failed, falling back to Groq:', cfErr);
    }
    if (!letter) {
        letter = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, maxTokens: 2000 });
    }
    return purifyText(letter);
};

/**
 * Token-efficient targeted CV optimizer.
 * Rewrites only summary + skills + experience bullets to fill identified JD gaps.
 * ~60% fewer tokens than a full CV regeneration.
 */
export const optimizeCVForJob = async (
    cvInput: CVData,
    jd: string,
    gaps: Array<{ requirement: string; isBlocker: boolean }>,
    missingKeywords: string[]
): Promise<Partial<CVData>> => {
    // ── HOT FIRE (inbound) ── purge banned phrases from the source CV before
    // it's serialized into the prompt, so the optimizer rewrites from clean
    // anchors instead of pattern-matching the original buzzwords.
    const cv = purifyInboundCV(cvInput);
    const jdCapped = jd.substring(0, 2500);
    const gapList = gaps.map(g => `- ${g.isBlocker ? '[BLOCKER] ' : ''}${g.requirement}`).join('\n');
    const keywordList = missingKeywords.join(', ');

    const currentSummary = cv.summary || '';
    const currentSkills = (cv.skills || []).join(', ');
    const currentExperience = (cv.experience || []).map(e =>
        `### ${e.jobTitle} @ ${e.company}\n${(e.responsibilities || []).join('\n')}`
    ).join('\n\n');

    const prompt = `
You are an expert CV optimizer. The candidate's CV has been analyzed against the job description and has identified GAPS and MISSING KEYWORDS. Your job is to perform a TARGETED rewrite of ONLY the affected sections — do NOT change names, companies, dates, or invent new experiences.

JOB DESCRIPTION:
${jdCapped}

IDENTIFIED GAPS:
${gapList || 'None identified.'}

MISSING KEYWORDS TO WEAVE IN NATURALLY:
${keywordList || 'None identified.'}

CURRENT CV SECTIONS TO REWRITE:

SUMMARY:
${currentSummary}

SKILLS (current):
${currentSkills}

EXPERIENCE BULLETS (current):
${currentExperience}

STRICT RULES:
1. Rewrite the summary to incorporate the 3 most critical missing keywords naturally. Keep it 55–75 words.
2. Update the skills list: add missing keywords that are genuine skills. Keep total at ≤18 skills. Put JD-matching skills first.
3. Rewrite experience bullets to naturally include missing keywords where plausible. DO NOT change job titles, company names, or invent new experiences. Just reframe existing bullets using JD language.
4. Every rewritten bullet must still have a strong action verb. Metrics are encouraged but only on ~50–60% of bullets — never force a number that isn't supported by the original.
5. Preserve the exact number of bullets per role.
6. Return ONLY a JSON object with keys: "summary" (string), "skills" (string[]), "experience" (array of {jobTitle, company, responsibilities: string[]}).

${HUMANIZATION_CHECKLIST}
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5, json: true, maxTokens: 2500 });
    const result = JSON.parse(text.trim());

    // Merge back into full experience array preserving dates etc.
    const updatedExperience = (cv.experience || []).map(exp => {
        const updated = (result.experience || []).find((e: any) =>
            e.jobTitle === exp.jobTitle && e.company === exp.company
        );
        if (updated && Array.isArray(updated.responsibilities)) {
            return { ...exp, responsibilities: updated.responsibilities };
        }
        return exp;
    });

    // ── PIN tier-1 keywords ── ensure the top-3 missing keywords actually
    // landed somewhere in the rewritten output. If not, append them to skills
    // (deterministic safety net so optimize never silently drops a JD-critical
    // term during paraphrase).
    const tier1 = (missingKeywords || []).slice(0, 3);
    let finalSkills: string[] = Array.isArray(result.skills) ? [...result.skills] : [...(cv.skills || [])];
    const finalSummary: string = result.summary || cv.summary || '';
    const allText = (finalSummary + ' ' + finalSkills.join(' ') + ' ' +
        updatedExperience.map(e => (e.responsibilities || []).join(' ')).join(' ')).toLowerCase();
    for (const kw of tier1) {
        if (!kw) continue;
        if (!allText.includes(kw.toLowerCase()) &&
            !finalSkills.some(s => s.toLowerCase() === kw.toLowerCase())) {
            finalSkills.push(kw);
        }
    }

    // ── HOT FIRE ── run the same polish chain Generate uses (humanizer +
    // bullet-count + banned-phrase filter + purify + pronoun fix) so a JD
    // optimization is at parity with a fresh Generate.
    const merged: CVData = {
        ...cv,
        summary: finalSummary,
        skills: finalSkills,
        experience: updatedExperience,
    };
    const finalized = await runQualityPolishPasses(merged, {
        runHumanizer: true,
        bulletCount: { type: 'preserve-cv', sourceCv: cvInput },
        finalize: { sourceCv: cvInput },
    });

    return {
        summary: finalized.summary,
        skills: finalized.skills,
        experience: finalized.experience,
    };
};

/**
 * Generates tailored interview Q&A pairs from the CV + JD.
 * Uses GROQ_FAST for token efficiency (≈60% cheaper than GROQ_LARGE).
 */
export const generateInterviewQA = async (
    profile: UserProfile,
    jd: string,
    companyName?: string
): Promise<Array<{ question: string; answer: string; category: string }>> => {
    const jdCapped = jd.substring(0, 2000);
    const company = companyName || 'the company';
    const prompt = `
You are an expert interview coach preparing a candidate for a specific job interview.

CANDIDATE PROFILE (compact):
${compactProfile(profile)}

JOB DESCRIPTION:
${jdCapped}

TARGET COMPANY: ${company}

Generate exactly 10 tailored interview questions with model answers. Questions must be specific to this role and company — NOT generic. Mix these categories:
- 2 Behavioural (STAR format — "Tell me about a time when...")
- 2 Technical / Role-specific (test core skills from JD)
- 2 Situational (hypothetical scenarios from the JD)
- 2 Culture / Motivation (why this company, role, why now)
- 2 Strength / Weakness probes (digging into the CV)

For each question, write a TAILORED model answer based on the candidate's ACTUAL experience. Reference real companies, skills, and achievements from their profile.

Return ONLY a JSON array of 10 objects:
[{ "question": "string", "answer": "string", "category": "Behavioural|Technical|Situational|Culture|Strength" }]
`;
    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.6, json: true, maxTokens: 3000 });
    return JSON.parse(text.trim());
};

export const analyzeJobDescriptionForKeywords = async (jobDescription: string): Promise<JobAnalysisResult> => {
    const prompt = `
        Analyze the following job description with the goal of strategic resume tailoring. 
        1. Extract the top 10 most important technical keywords (specific technologies, tools, platforms, methodologies like Agile).
        2. Extract the top 10 essential soft skills and non-technical abilities (communication, leadership, business acumen).
        3. Identify the name of the Company or Organization hiring. If it is not explicitly stated, return "Unknown".
        4. Identify the specific Job Title or Position being advertised. If it's not clear, return "General Application".

        JOB DESCRIPTION:
        ${jobDescription.substring(0, 1500)}

        Return ONLY a JSON object with this structure:
        {
          "keywords": ["string"],
          "skills": ["string"],
          "companyName": "string",
          "jobTitle": "string"
        }
    `;

    const stripFencesJd = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    // Try Workers AI free model first (jdParse task → llama-3.1-8b, free)
    try {
        const cfText = await workerTieredLLM('jdParse', prompt, {
            system: SYSTEM_INSTRUCTION_PARSER,
            temperature: 0.1,
            json: true,
            maxTokens: 512,
            timeoutMs: 20000,
        });
        if (cfText) {
            console.log('[JD Parse] Parsed via Workers AI (free tier).');
            return JSON.parse(stripFencesJd(cfText));
        }
    } catch (cfErr) {
        console.warn('[JD Parse] Workers AI failed, falling back to Groq:', cfErr);
    }
    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.1, json: true, maxTokens: 512 });
    return JSON.parse(stripFencesJd(text));
};

export const generateEnhancedSummary = async (profileInput: UserProfile): Promise<string> => {
    const profile = purifyProfile(profileInput);
    const prompt = `
      You are a professional career coach. Based STRICTLY on the provided user profile, write a concise and powerful professional summary (2-4 sentences) that highlights their key strengths and experience.
      
      **CRITICAL:** Do NOT invent skills, experiences, or achievements not present in the profile. If the profile is sparse, write a strong summary based ONLY on what is there.
      Return only the summary text.
      USER PROFILE:
      ${compactProfile(profile)}
    `;
    const summary = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.5 });
    return purifyText(summary);
};

export const generateEnhancedResponsibilities = async (jobTitle: string, company: string, currentResponsibilities: string, jobDescription?: string, duration?: string, pointCount: number = 5): Promise<string> => {
    const prompt = `
      You are an expert resume writer and career coach specializing in creating HIGH-IMPACT, ATS-OPTIMIZED bullet points.
      
      **Goal:** Transform the user's responsibilities into impressive, quantified achievements that match standard industry expectations for their tenure and align with the target job description.

      **Input Context:**
      - **Role:** ${jobTitle} at ${company}
      - **Duration/Tenure:** ${duration || "Not specified"}
      - **Target Job Description (JD):** ${jobDescription ? jobDescription.substring(0, 500) + '...' : "None provided"}
      - **Current Draft:** "${currentResponsibilities}"
      - **REQUIRED BULLET COUNT: EXACTLY ${pointCount} bullet points** — no more, no fewer.

      **Instructions:**
      1. **Analyze & Upgrade:** Check if the metrics/achievements in the draft are impressive enough for the role's tenure (${duration}). 
      2. **Tailor to JD:** If a JD is provided, prioritize keywords and skills from the JD.
      3. **Quantify:** Frame each point around specific accomplishments. Use numbers!
      4. **Action Verbs:** Start with powerful verbs (e.g., "Orchestrated", "Engineered", "Capitalized").
      5. **STRICT COUNT:** Output EXACTLY ${pointCount} bullet points.
      6. **Format:** Return ONLY the bullet points as a single string. Each point must start with a newline and the '•' character.
    `;
    const result = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, maxTokens: 900 });
    return purifyText(result.trim().replace(/^- /gm, '• '));
};

export const generateQuantifiedAchievements = async (
    responsibilities: string,
    jobTitle: string,
    company: string,
): Promise<Array<{ original: string; quantified: string; hasMetric: boolean }>> => {
    const bullets = responsibilities
        .split('\n')
        .map(l => l.replace(/^[\u2022\-\*]|\d+\.\s*/, '').trim())
        .filter(b => b.length > 4);

    if (bullets.length === 0) throw new Error('No bullet points found. Add some responsibilities first.');

    const prompt = `
You are a career coach who specialises in achievement quantification for resumes.

For each bullet point from a ${jobTitle} at ${company}, do the following:
- Determine if it already contains a quantifiable metric (%, a number, $, timeframe, team size, etc.).
- If it does NOT have a metric, rewrite it to include one realistic, plausible metric based on typical industry standards for this role. Never invent an implausible number.
- If it already HAS a clear metric, return it unchanged and mark hasMetric as true.
- Keep rewrites under 25 words. Preserve the original action verb.
- Do not add commentary. Do not change facts.

Bullet points to analyse:
${bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')}

Return ONLY a valid JSON array — no markdown fences, no explanation:
[
  { "original": "exact original text", "quantified": "improved version", "hasMetric": false }
]
`;
    const raw = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.55 });
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Could not parse AI response. Please try again.');

    const parsed = JSON.parse(match[0]) as Array<{ original: string; quantified: string; hasMetric: boolean }>;

    // Ensure count matches input + purify each rewrite
    const out = bullets.map((b, i) => {
        const item = parsed[i] ?? { original: b, quantified: b, hasMetric: true };
        return { ...item, quantified: purifyText(item.quantified || b) };
    });
    return out;
};

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

export const generateScholarshipEssay = async (params: {
    profile: UserProfile;
    essayType: string;
    essayLabel: string;
    scholarshipDescription: string;
    additionalContext: string;
    wordCount: number;
    promptHint: string;
}): Promise<string> => {
    const prompt = `
        You are an elite academic consultant and scholarship writer with a 95% success rate for international grants (Commonwealth, Chevening, Fulbright, ERASMUS+, NIH/NSF).
        
        ### YOUR GOAL
        Write a compelling, high-stakes ${params.essayLabel} for the following scholarship/program.
        The essay must be deeply personal, professionally authoritative, and perfectly aligned with the scholarship's values.

        ### INPUT DATA
        USER PROFILE (Your source for achievements and background):
        ${compactProfile(params.profile)}

        SCHOLARSHIP/PROGRAM DESCRIPTION:
        ${params.scholarshipDescription}

        ADDITIONAL PERSONAL CONTEXT:
        ${params.additionalContext || "None provided. Rely on the profile."}

        ### ESSAY GUIDELINES
        - **Format**: ${params.essayLabel}
        - **Target Word Count**: ${params.wordCount} words.
        - **Specific Instruction**: ${params.promptHint}
        - **Tone**: Academic yet personal. Enthusiastic but humble. Visionary yet grounded in past achievements.
        - **Structure**: 
            1. **Hook**: Start with a powerful opening that captures attention immediately.
            2. **The Bridge**: Connect the user's past experiences to why they need this specific scholarship.
            3. **The Impact**: Clearly state what the user will do with the knowledge/funding and the broader impact it will have.
            4. **Conclusion**: A strong closing statement that leaves a lasting impression.

        ${SYSTEM_INSTRUCTION_HUMANIZER}

        Return ONLY the text of the essay. No titles, no intro text, no placeholders like "[Your Name]".
    `;

    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.8, maxTokens: 4096 });
};

// ─── CV Checker: Score CV against JD ──────────────────────────────────────────

export interface CVCheckResult {
    overallScore: number;
    atsScore: number;
    strengths: string[];
    weaknesses: string[];
    missingKeywords: string[];
    matchedKeywords: string[];
    suggestions: string[];
    summary: string;
}

export const checkCVAgainstJob = async (
    profile: UserProfile,
    jobDescription: string
): Promise<CVCheckResult> => {
    const profileText = JSON.stringify(profile, null, 2).substring(0, 2000);
    const prompt = `
        You are an elite CV reviewer and ATS expert. Analyze this CV against the job description.

        ### CV DATA
        ${profileText}

        ### JOB DESCRIPTION
        ${jobDescription.substring(0, 1500)}

        ### ANALYSIS INSTRUCTIONS
        1. **overallScore** (0-100): How well does this CV match the JD?
        2. **atsScore** (0-100): How likely is this CV to pass ATS screening?
        3. **strengths** (3-5 items): What the CV does well relative to this JD.
        4. **weaknesses** (3-5 items): Critical gaps, mismatches, or problems.
        5. **missingKeywords** (5-15 items): Important keywords/skills from the JD that are NOT in the CV.
        6. **matchedKeywords** (5-15 items): Keywords/skills that appear in BOTH the CV and JD.
        7. **suggestions** (3-6 items): Specific, actionable suggestions to improve the CV for this role.
        8. **summary** (2-3 sentences): Overall assessment in plain language.

        Be brutally honest. A 100 score should be near-impossible. Most CVs score 40-70.

        Return ONLY a JSON object with this structure:
        {
          "overallScore": number,
          "atsScore": number,
          "strengths": ["string"],
          "weaknesses": ["string"],
          "missingKeywords": ["string"],
          "matchedKeywords": ["string"],
          "suggestions": ["string"],
          "summary": "string"
        }
    `;

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.2, json: true, maxTokens: 1024 });
    return JSON.parse(text.trim());
};

// ─── LinkedIn Profile Generator ──────────────────────────────────────────────

export interface LinkedInProfileResult {
    headline: string;
    about: string;
    summaryBullets: string[];
    skills: string[];
    featuredPost: string;
    connectionMessage: string;
    profileTips: string[];
}

export const generateLinkedInProfile = async (
    profile: UserProfile,
    targetRole?: string
): Promise<LinkedInProfileResult> => {
    const roleContext = targetRole ? `Target role/industry: ${targetRole}` : '';
    const prompt = `
You are an elite LinkedIn profile writer and personal branding strategist who has helped thousands of professionals land jobs at Google, Amazon, McKinsey, and top startups. You write profiles that get 10x more recruiter messages.

CANDIDATE PROFILE:
${compactProfile(profile)}
${roleContext}

Generate a complete, world-class LinkedIn profile package. Everything must sound like a real, accomplished human wrote it — NOT a template. Be specific, use real details from the profile.

Return ONLY a JSON object:
{
  "headline": "string (120 chars max — NOT just job title. Formula: [What you do] | [Who you help] | [Key achievement or USP]. Make it irresistible to click. Include 2-3 JD keywords if target role provided. NEVER just 'Software Engineer at Company'.)",
  "about": "string (2,000 chars max — the 'About' section. Structure: Hook sentence (fascinating fact or bold claim about them, 1-2 sentences). Core value prop (what they do and who they do it for, 2 sentences). Career highlight reel (3-4 specific achievements with numbers from their profile). Current focus (what they are working on and excited about, 1-2 sentences). Call to action (how to reach them and what for). Write in first person. Vary sentence length — mix punchy 5-word sentences with longer elaborative ones. NO AI clichés: no 'passionate', 'leverage', 'synergy', 'results-driven', 'dynamic', 'innovative'.)",
  "summaryBullets": ["string array of 5 achievement bullets for the 'Featured' bullet summary style — each under 150 chars, starts with an emoji, has a metric"],
  "skills": ["string array of 20 LinkedIn skills to add — ordered by endorsability and searchability for their role"],
  "featuredPost": "string (a ready-to-post LinkedIn update, 150-200 words, announcing something impressive — a project, milestone, lesson learned. Professional but personal. Not 'excited to announce'. End with 3 relevant hashtags.)",
  "connectionMessage": "string (a 300-char LinkedIn connection request message template — warm, specific, not salesy. Use [NAME] as placeholder.)",
  "profileTips": ["string array of 5 specific, actionable tips to improve their LinkedIn presence based on their actual profile gaps — be specific about what to add/change"]
}
`;
    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, json: true, maxTokens: 3000 });
    return JSON.parse(text.trim()) as LinkedInProfileResult;
};

// ─── Thank-You Letter Generator ───────────────────────────────────────────────

export const generateThankYouLetter = async (
    profile: UserProfile,
    jobDescription: string,
    interviewerName?: string,
    interviewType?: string
): Promise<string> => {
    const interviewer = interviewerName?.trim() || 'the hiring team';
    const type = interviewType || 'interview';
    const name = profile.personalInfo?.name || 'Candidate';

    const prompt = `
You are a top executive career coach. Write a compelling, human-sounding post-${type} thank-you letter that stands out and reinforces the candidate's candidacy.

CANDIDATE NAME: ${name}
INTERVIEWER: ${interviewer}

CANDIDATE PROFILE:
${compactProfile(profile)}

JOB DESCRIPTION:
${jobDescription.substring(0, 1500)}

STRICT INSTRUCTIONS:
1. Start DIRECTLY with "Dear ${interviewer}," — no header block.
2. Opening (1 sentence): Thank them warmly and reference something specific from the ${type}.
3. Reinforcement paragraph: Tie one specific thing discussed to a concrete achievement from the profile. Show you were listening and thinking.
4. Value-add paragraph: Briefly mention one additional reason you are the right fit that didn't come up, or expand on something that was covered too briefly.
5. Closing (1 sentence): Express genuine enthusiasm, confirm interest, offer next steps.
6. Sign-off: "Warm regards," then the candidate's name on the next line: ${name}
7. Length: 180-250 words. Concise, human, specific.
8. Tone: Professional, warm, confident. NOT generic or gushing.
9. NO AI clichés: no "excited", "thrilled", "leverage", "passionate".
10. Return ONLY the letter text. No commentary.
`;
    return groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.7 });
};

// ─── Smart Cover Letter: JD + Company Research ───────────────────────────────

export const generateSmartCoverLetter = async (
    profile: UserProfile,
    jobDescription: string,
    companyResearch: string = ''
): Promise<string> => {
    const companySection = companyResearch
        ? `\n### COMPANY RESEARCH (use this to show you know the company)\n${companyResearch}\n`
        : '';

    const prompt = `
        You are a world-class career coach writing a WINNING cover letter.

        ### CV DATA
        ${compactProfile(profile)}

        ### JOB DESCRIPTION
        ${jobDescription}
        ${companySection}
        ### COVER LETTER INSTRUCTIONS
        1. **Opening**: Name the exact role. If company research is available, mention something specific about the company (recent news, values, product) that excites you.
        2. **Body (2-3 paragraphs)**:
           - Match your 2-3 strongest experiences to the JD's top requirements.
           - Use STAR method briefly (Situation, Task, Action, Result) for at least one example.
           - Include specific metrics/numbers from your CV where possible.
           - If company research is available, connect your values/experience to the company's mission/culture.
        3. **Closing**: Confident call-to-action. Express genuine enthusiasm.
        4. **Tone**: Professional, warm, confident — NOT generic or sycophantic.
        5. **Length**: 250-350 words. Concise is king.
        6. **Format**: Plain text with proper letter formatting. Address to "Dear Hiring Manager" unless a name is known.

        CRITICAL: This letter must feel unique to THIS job at THIS company. No generic templates.
        Return ONLY the cover letter text. No commentary.
    `;

    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: 0.7 });
};

// ─── Paraphrase: Rewrite text in different tones ──────────────────────────────

export type ParaphraseTone = 'professional' | 'concise' | 'creative' | 'ats-friendly';

export const paraphraseText = async (
    text: string,
    tone: ParaphraseTone = 'professional',
    context: string = ''
): Promise<string> => {
    const toneInstructions: Record<ParaphraseTone, string> = {
        professional: 'Rewrite in a polished, professional tone suitable for a senior executive. Use strong action verbs, quantify achievements where possible, and maintain formal language.',
        concise: 'Rewrite to be as concise as possible. Cut filler words, reduce length by 30-40%, but preserve ALL key information and impact. Each bullet should be one powerful line.',
        creative: 'Rewrite with more engaging, dynamic language. Use vivid descriptions and compelling narrative while staying professional. Make it memorable.',
        'ats-friendly': 'Rewrite to maximize ATS (Applicant Tracking System) compatibility. Use standard industry keywords, avoid creative formatting, use common section headers, and include relevant buzzwords naturally. Keep it keyword-rich but human-readable.',
    };

    const prompt = `
        ${toneInstructions[tone]}

        ${context ? `CONTEXT (job description this text is being tailored for):\n${context}\n` : ''}

        TEXT TO REWRITE:
        ${text}

        RULES:
        - Preserve ALL factual details: dates, numbers, company names, job titles, metrics.
        - Return ONLY the rewritten text, no commentary or explanation.
        - Maintain the same general structure (if it's bullets, return bullets; if paragraphs, return paragraphs).
    `;

    return groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_HUMANIZER, prompt, { temperature: tone === 'ats-friendly' ? 0.3 : 0.7 });
};

// ── CV Score / Match Analysis ─────────────────────────────────────────────────
export interface CVScore {
    overall: number;
    ats: number;
    impact: number;
    relevance: number;
    clarity: number;
    missingKeywords: string[];
    strengths: string[];
    improvements: string[];
    verdict: string;
}

export const scoreCV = async (cvData: CVData, jobDescription: string): Promise<CVScore> => {
    const cvText = [
        cvData.summary,
        ...cvData.experience.flatMap(e => [e.jobTitle, e.company, ...e.responsibilities]),
        ...cvData.skills,
        ...cvData.education.map(e => `${e.degree} ${e.school}`),
        ...(cvData.projects || []).map(p => p.description),
    ].join(' ').substring(0, 2000);

    const prompt = `
You are an expert ATS system and senior hiring manager scoring a CV against a job description.

CV TEXT:
${cvText}

JOB DESCRIPTION:
${jobDescription.substring(0, 1200)}

Scoring rubric:
- "ats" (0-100): How many of the JD's key terms/phrases appear in the CV?
- "impact" (0-100): What % of bullet points have a quantified result?
- "relevance" (0-100): How closely does the candidate's experience/skills match the role requirements?
- "clarity" (0-100): Is the writing concise, free of clichés, and easy to skim?
- "overall" (0-100): Weighted average — ats×0.35 + impact×0.25 + relevance×0.30 + clarity×0.10.
- "missingKeywords": List up to 8 important JD keywords/phrases NOT found in the CV.
- "strengths": Exactly 2 specific things this CV does well.
- "improvements": Exactly 3 specific, immediately actionable fixes.
- "verdict": One punchy sentence a recruiter would say about this CV.

Return ONLY a JSON object:
{
  "overall": number,
  "ats": number,
  "impact": number,
  "relevance": number,
  "clarity": number,
  "missingKeywords": ["string"],
  "strengths": ["string"],
  "improvements": ["string"],
  "verdict": "string"
}
`;

    const text = await groqChat(GROQ_FAST, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.2, json: true, maxTokens: 512 });
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()) as CVScore;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared post-generation quality polish.
//
// THE single place where post-Groq CV polish lives. Used by every generation
// path (generateCV, improveCV / Auto Optimize, optimizeCVForJob) so all three
// flows produce CVs at parity. Tune CV quality here — nowhere else.
//
// Pipeline (in order):
//   1. Humanizer pass (Workers AI / Groq, with corrupt-metric revert).
//   2. Bullet-count enforcer — either:
//        - 'profile-pointcount': honour user's pointCount per role (Generate path).
//        - 'preserve-cv':        match the source CV's bullet counts exactly
//                                (Improve / Optimize paths — never silently
//                                changes structure).
//   3. Deterministic banned-phrase filter (pure JS, cannot fail).
//   4. Carry profile customSections + sectionOrder if `carryProfile` is given.
//   5. Sort experience by end date desc (most recent first).
//   6. purifyCV — banned subs, tense, jitter, dedup; returns a report.
//   7. `onPurifyReport` callback (for telemetry / leak reporting).
//   8. Voice-consistency enforcement (only when `engineBrief` is provided,
//      with corrupt-metric revert).
//   9. finalizeCvData — fidelity rules vs profile or source CV (no AI).
//  10. Pronoun safety net.
//
// Every AI step is wrapped so a worker / Groq hiccup never aborts the polish:
// the deterministic passes still run and the user gets a finished CV.
// ─────────────────────────────────────────────────────────────────────────────
type BulletCountStrategy =
    | { type: 'profile-pointcount'; profile: UserProfile }
    | { type: 'preserve-cv'; sourceCv: CVData };

type FinalizeStrategy =
    | { profile: UserProfile }
    | { sourceCv: CVData };

interface QualityPolishOpts {
    bulletCount: BulletCountStrategy;
    finalize: FinalizeStrategy;
    runHumanizer?: boolean;
    carryProfile?: UserProfile;
    engineBrief?: CVBrief | null;
    onPurifyReport?: (report: PurifyReport) => void | Promise<void>;
}

async function runQualityPolishPasses(
    cvData: CVData,
    opts: QualityPolishOpts,
): Promise<CVData> {
    const { runHumanizer = true, bulletCount, carryProfile, engineBrief, finalize, onPurifyReport } = opts;
    let out = cvData;

    // 1. Humanizer pass — fixes short bullets, banned phrases in summary,
    //    duplicate verb starters, scope-anchor first bullet, etc.
    if (runHumanizer) {
        try {
            const preAudit: CVData = JSON.parse(JSON.stringify(out));
            out = await runHumanizationAudit(out);
            const auditRevert = revertCorruptedMetrics(out, preAudit);
            if (auditRevert.reverted.length > 0) {
                console.warn(`[Polish] Humanizer reverted ${auditRevert.reverted.length} corrupted metric(s):`, auditRevert.reverted);
                out = auditRevert.cv;
            }
        } catch (e) {
            console.warn('[Polish] Humanizer pass skipped:', e);
        }
    }

    // 2. Bullet-count enforcer.
    out.experience = (out.experience || []).map(role => {
        let desired: number;
        let sourceBullets: string[] = [];

        if (bulletCount.type === 'profile-pointcount') {
            const sourceRole = (bulletCount.profile.workExperience || []).find(
                we => we.jobTitle === role.jobTitle && we.company === role.company
            );
            desired = sourceRole?.pointCount ?? role.responsibilities?.length ?? 5;
            sourceBullets = (sourceRole?.responsibilities || '')
                .split('\n').map(s => s.replace(/^[\u2022\-\*]\s*/, '').trim()).filter(Boolean);
        } else {
            const sourceRole = (bulletCount.sourceCv.experience || []).find(
                r => r.jobTitle === role.jobTitle && r.company === role.company
            );
            desired = sourceRole?.responsibilities?.length ?? role.responsibilities?.length ?? 5;
            sourceBullets = sourceRole?.responsibilities || [];
        }

        const current = role.responsibilities || [];
        if (current.length === desired) return role;
        if (current.length > desired) {
            console.warn(`[Polish BulletCount] Trimmed "${role.jobTitle} @ ${role.company}" from ${current.length} → ${desired} bullets.`);
            return { ...role, responsibilities: current.slice(0, desired) };
        }
        // Pad from source bullets — never invent text.
        const padded = [...current];
        for (const b of sourceBullets) {
            if (padded.length >= desired) break;
            if (!padded.some(p => p.toLowerCase().includes(b.toLowerCase().slice(0, 20)))) {
                padded.push(b);
            }
        }
        if (padded.length !== current.length) {
            console.warn(`[Polish BulletCount] Padded "${role.jobTitle} @ ${role.company}" from ${current.length} → ${padded.length} bullets.`);
        }
        return { ...role, responsibilities: padded };
    });

    // 3. Deterministic banned-phrase filter (cannot fail, no AI).
    out = applyBannedPhraseFilter(out);

    // 4. Carry through profile-level user-pre-filled content (Generate path).
    if (carryProfile) {
        if (carryProfile.customSections && carryProfile.customSections.length > 0) {
            out.customSections = carryProfile.customSections.filter(
                s => s.items.some(i => i.title.trim().length > 0)
            );
        }
        if (carryProfile.sectionOrder && carryProfile.sectionOrder.length > 0) {
            out.sectionOrder = carryProfile.sectionOrder;
        }
    }

    // 5. Sort experience by end date descending (most recent first).
    out.experience.sort((a, b) => {
        const getEnd = (s: string) => s?.toLowerCase() === 'present'
            ? new Date()
            : (isNaN(new Date(s).getTime()) ? new Date(0) : new Date(s));
        const ea = getEnd(a.endDate).getTime();
        const eb = getEnd(b.endDate).getTime();
        if (eb !== ea) return eb - ea;
        const sa = isNaN(new Date(a.startDate).getTime()) ? 0 : new Date(a.startDate).getTime();
        const sb = isNaN(new Date(b.startDate).getTime()) ? 0 : new Date(b.startDate).getTime();
        return sb - sa;
    });

    // 6. Hot Fire — deterministic purification (banned subs, tense, jitter, dedup).
    const purified = purifyCV(out);
    out = purified.cv;

    // 7. Telemetry / leak reporting hook (caller owns what to do with the report).
    if (onPurifyReport) {
        try {
            await onPurifyReport(purified.report);
        } catch (e) {
            console.debug('[Polish] onPurifyReport hook failed (non-fatal):', e);
        }
    }

    // 8. Phase E — Voice consistency enforcement (only when an engine brief
    //    is available; mutates `out` in place, with corrupt-metric revert).
    if (engineBrief && out.experience?.length) {
        try {
            const preVoiceCV: CVData = JSON.parse(JSON.stringify(out));
            await enforceVoiceConsistency(out, engineBrief);
            const voiceRevert = revertCorruptedMetrics(out, preVoiceCV);
            if (voiceRevert.reverted.length > 0) {
                console.warn(`[Polish] Voice enforcement reverted ${voiceRevert.reverted.length} corrupted-metric bullet(s):`, voiceRevert.reverted);
                out = voiceRevert.cv;
            }
        } catch (e) {
            console.warn('[Polish] Voice enforcement skipped:', e);
        }
    }

    // 9. Final source-fidelity lock (no AI, deterministic).
    if ('profile' in finalize) {
        out = finalizeCvData(out, { profile: finalize.profile, runPurify: false });
    } else {
        out = finalizeCvData(out, { sourceCv: finalize.sourceCv, runPurify: false });
    }

    // 10. Pronoun safety net.
    out = fixPronounsInCV(out);

    return out;
}

// --- AI CV Improvement ---
export const improveCV = async (
    cvDataInput: CVData,
    personalInfo: PersonalInfo,
    instruction: string,
    jobDescription?: string,
): Promise<CVData> => {
    // ── HOT FIRE (inbound) ── scrub before serializing into the prompt
    const cvData = purifyInboundCV(cvDataInput);
    const cvJson = JSON.stringify(cvData, null, 2);

    const prompt = `
You are an elite CV writer. The user wants to improve their CV. Apply the instruction below and return the COMPLETE improved CVData JSON.

INSTRUCTION: "${instruction}"

CURRENT CV DATA (JSON):
${cvJson}

CANDIDATE NAME: ${personalInfo.name}
${jobDescription ? `TARGET JOB DESCRIPTION:\n${jobDescription}` : ''}

Rules:
1. Apply the instruction precisely.
2. Keep all factual details accurate — don't change company names, job titles, dates, or invent new roles.
3. Return the COMPLETE CVData object with ALL fields, not just the modified parts.
4. Bullets follow "Strong Verb → Scope → Result". Only ~50–60% should carry a metric — leave some qualitative.
5. Avoid AI clichés. Write like a confident, experienced professional.

${HUMANIZATION_CHECKLIST}

${CV_DATA_SCHEMA}
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.4, json: true });
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()) as CVData;

    // Run the SAME quality polish chain that generateCV runs, so Auto Optimize
    // produces output at parity with a fresh Generate (humanizer + bullet count
    // preservation + banned-phrase filter + purify + finalize + pronoun fix).
    return runQualityPolishPasses(parsed, {
        runHumanizer: true,
        bulletCount: { type: 'preserve-cv', sourceCv: cvDataInput },
        finalize: { sourceCv: cvDataInput },
    });
};

// --- GitHub-Powered CV Generation ---

export interface GitHubRepoForCV {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    homepage: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    topics: string[];
    updated_at: string;
}

export const generateCVFromGitHub = async (
    repos: GitHubRepoForCV[],
    profileInput: UserProfile,
    githubUsername: string,
    jobDescription?: string
): Promise<CVData> => {
    // ── HOT FIRE (inbound) ── scrub profile before prompt assembly
    const profile = purifyProfile(profileInput);
    const repoSummaries = repos.map(r => ({
        name: r.name,
        description: r.description || '',
        url: r.html_url,
        live: r.homepage || '',
        language: r.language || '',
        topics: r.topics,
        stars: r.stargazers_count,
        forks: r.forks_count,
        updated: r.updated_at.split('T')[0],
    }));

    const allLanguages = [...new Set(repos.map(r => r.language).filter(Boolean))] as string[];
    const allTopics = [...new Set(repos.flatMap(r => r.topics))];

    const jdSection = jobDescription?.trim()
        ? `\nTARGET JOB DESCRIPTION:\n${jobDescription.trim()}\n\nTailor every bullet, skill, and project description to this role. Mirror the exact language from the JD.`
        : '\nNo specific JD provided. Write a strong general-purpose software engineering CV.';

    const prompt = `
You are an elite CV strategist specializing in software engineers. Your task is to generate the absolute best CV for a developer whose actual work is visible on GitHub.

GITHUB USERNAME: ${githubUsername}
GITHUB PROFILE URL: https://github.com/${githubUsername}

GITHUB REPOSITORIES (${repos.length} repos — these are the candidate's REAL projects):
${JSON.stringify(repoSummaries, null, 2)}

DETECTED LANGUAGES: ${allLanguages.join(', ')}
DETECTED TOPICS/FRAMEWORKS: ${allTopics.join(', ')}

USER PROFILE (existing data):
${compactProfile(profile)}
${jdSection}

=== INSTRUCTIONS ===

1. **SUMMARY (3 sentences)**:
   - Position the candidate as a skilled developer based on what their GitHub actually shows.
   - Reference their strongest languages and most impressive projects by name.

2. **EXPERIENCE**: Transform each work experience into high-impact bullets.
   - Use EXACTLY ${profile.workExperience.map(we => `${we.pointCount ?? 5} bullets for ${we.jobTitle} at ${we.company}`).join(', ')}.
   - Start every bullet with a power verb. Quantify impact.

3. **PROJECTS** — CRITICAL: Use ONLY projects from the GitHub repos above.
   - For each selected repo, write a 1–2 sentence description: WHAT it does, WHY it matters, WHAT tech stack.
   - ALWAYS include the real GitHub URL (html_url) or live URL (homepage if available) as the link.
   - Prioritize repos by: stars, recency, complexity, and relevance to the JD.
   - Include at least ${Math.min(repos.length, 6)} projects.
   - DO NOT invent project links — use the exact URLs provided.

4. **SKILLS**: Extract EXACTLY 15 skills from the actual repo languages and topics.

5. **EDUCATION**: Use the profile's education data.

HUMANIZATION RULES:
- Every bullet: Strong Verb → Specific Action → Measurable Result.
- Mix sentence lengths. No AI clichés. Be concrete and specific.

${CV_DATA_SCHEMA}
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PROFESSIONAL, prompt, { temperature: 0.7, json: true, maxTokens: 8192 });
    const parsed = JSON.parse(text.trim()) as CVData;
    // Unified post-gen pipeline + deterministic source lock
    return finalizeCvData(parsed, { profile });
};

// --- Enhanced 6-Block Job Analysis (career-ops inspired) ---
export const analyzeJobEnhanced = async (
    jobDescription: string,
    cvText: string,
): Promise<EnhancedJobAnalysis> => {
    const prompt = `
You are an expert career strategist. Analyze the job description against the candidate's CV and return a comprehensive 6-block evaluation.

JOB DESCRIPTION:
${jobDescription.substring(0, 3000)}

CANDIDATE CV TEXT:
${cvText.substring(0, 3000)}

Return ONLY a valid JSON object matching this exact schema:
{
  "companyName": "string (company name or 'Unknown')",
  "jobTitle": "string (role title)",
  "archetype": "one of: Full-Stack / Dev Engineer | Solutions Architect | Product Manager | LLMOps / MLOps | Agentic AI | Digital Transformation | Data Scientist | DevOps / Platform | General Engineering | Other",
  "domain": "string (e.g. 'Cloud Infrastructure', 'AI/ML', 'FinTech')",
  "seniority": "string (e.g. 'Senior', 'Mid-level', 'Lead', 'Principal')",
  "remote": "Remote | Hybrid | On-site | Unknown",
  "tldr": "string (1-sentence role summary)",
  "matchedRequirements": ["string array of JD requirements the candidate clearly meets based on CV"],
  "gaps": [
    {
      "requirement": "string (JD requirement not clearly met)",
      "isBlocker": true or false,
      "mitigation": "string (specific actionable advice to address this gap in cover letter or interview)"
    }
  ],
  "matchScore": number (0-100, objective match percentage),
  "grade": "A | B | C | D | F",
  "levelStrategy": "string (2-3 sentences on how candidate should position their seniority for this role)",
  "seniorPositioningTips": ["string array of 3-4 specific phrases or framings to appear more senior"],
  "salaryRange": "string (estimated salary range for this role and location, e.g. '$120k–$160k USD')",
  "salaryNotes": "string (brief note on comp expectations, negotiation angle, or data confidence)",
  "personalizationChanges": [
    {
      "section": "string (CV section: Summary | Skills | Experience | Projects)",
      "currentState": "string (brief description of current state)",
      "proposedChange": "string (specific change to make)",
      "reason": "string (why this change helps)"
    }
  ],
  "topKeywords": ["string array of 10-15 ATS keywords to inject into the CV from the JD"],
  "starStories": [
    {
      "jobRequirement": "string (JD requirement this story addresses)",
      "linkedCompany": "string (company from CV this story is from, or '')",
      "linkedRole": "string (role from CV, or '')",
      "situation": "string (S in STAR+R - context)",
      "task": "string (T - challenge or responsibility)",
      "action": "string (A - specific steps taken)",
      "result": "string (R - measurable outcome)",
      "reflection": "string (Reflection - lesson learned or what would be done differently — this signals seniority)"
    }
  ]
}

GRADING RULES (matchScore → grade):
- 85-100: A (Excellent fit)
- 70-84: B (Good fit)
- 55-69: C (Moderate fit, significant tailoring needed)
- 40-54: D (Weak fit, major gaps)
- 0-39: F (Poor fit)

ETHICAL RULES:
- Only reference experience actually present in the CV
- Never invent skills or achievements
- Keyword injection means reformulating real experience with JD vocabulary — not fabricating
- STAR stories must be grounded in CV experience

Return ONLY the JSON. No markdown, no prose.
`;

    const text = await groqChat(GROQ_LARGE, SYSTEM_INSTRUCTION_PARSER, prompt, { temperature: 0.3, json: true, maxTokens: 8192 });
    return JSON.parse(text.trim()) as EnhancedJobAnalysis;
};
